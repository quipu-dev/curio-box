import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { AssetCacheEngine, type AssetCacheStats } from '@/layer2_darkroom/engine/asset-cache';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { DarkroomApplier, DarkroomPatchFSM } from '@/layer2_darkroom/fsm/patch-fsm';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import type { Artifact, NegativeLedgerEntry } from '@/types';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  History,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Tag as TagIcon,
  Undo2,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DarkroomStudioProps {
  artifact: Artifact | null;
  onBackToGallery: () => void;
  onOpenStage: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

type TabType = 'patch' | 'history' | 'assets';

interface ViewingSnapshotState {
  revision: number;
  content: string;
}

export const DarkroomStudio: React.FC<DarkroomStudioProps> = ({
  artifact,
  onBackToGallery,
  onOpenStage,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isActivated, setIsActivated] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>('patch');
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(true);
  const [aspectRatio, setAspectRatio] = useState<'fill' | '16/9' | '4/3'>('fill');
  const [patchInput, setPatchInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [assetStats, setAssetStats] = useState<AssetCacheStats | null>(null);
  const [historyLedger, setHistoryLedger] = useState<NegativeLedgerEntry[]>([]);

  // 游离检视快照（Checkout 模式：只读沙箱试映，不污染物理磁盘）
  const [viewingSnapshot, setViewingSnapshot] = useState<ViewingSnapshotState | null>(null);

  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);

  // 派生当前视口渲染的代码 payload
  const activeSourceCode = useMemo(() => {
    return viewingSnapshot ? viewingSnapshot.content : artifact.sourceCode;
  }, [viewingSnapshot, artifact.sourceCode]);

  // 加载底片链历史清单
  const refreshHistory = useCallback(async () => {
    const list = await galleryStorage.listNegativeRevisions(artifact.meta.filename);
    setHistoryLedger(list);
  }, [artifact.meta.filename]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // 挂载或视口代码变更时自动探查外部 CDN 资源
  useEffect(() => {
    const assets = AssetCacheEngine.detectExternalAssets(activeSourceCode);
    Promise.all(assets.map((a) => AssetCacheEngine.isCached(a.url))).then((results) => {
      const cachedCount = results.filter(Boolean).length;
      setAssetStats({
        total: assets.length,
        cached: cachedCount,
        assets: assets.map((a, i) => ({
          ...a,
          status: results[i] ? 'cached' : 'pending',
        })),
      });
    });
  }, [activeSourceCode]);

  // 检视特定历史底片 (Checkout)
  const handleCheckoutRevision = async (targetRev: number) => {
    if (targetRev === artifact.meta.currentRevision) {
      setViewingSnapshot(null);
      setStatusMessage(`已退出历史试映，回到当前最新底片 (REV:${targetRev})`);
      return;
    }

    const content = await galleryStorage.loadNegativeRevision(artifact.meta.filename, targetRev);
    if (!content) {
      setStatusMessage(`未能载入 REV:${targetRev} 的底片快照`);
      return;
    }

    setViewingSnapshot({ revision: targetRev, content });
    setStatusMessage(`已安全检视 REV:${targetRev} 快照（内存试映中，未改动磁盘文件）`);
  };

  // 退出检视态，切回物理主版本
  const handleExitCheckout = () => {
    setViewingSnapshot(null);
    setStatusMessage(`已退出检视态，恢复至最新主干底片 (REV:${artifact.meta.currentRevision})`);
  };

  // 截屏定格快照
  const handleCapturePoster = async () => {
    if (!captureHandleRef.current) {
      setStatusMessage('请等待沙箱装载完毕后再进行定格');
      return;
    }
    try {
      setStatusMessage('正在定格无损封印快照...');
      const blob = await captureHandleRef.current();
      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      setStatusMessage('定格封印成功！封面已同步更新。');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`定格失败: ${msg}`);
    }
  };

  // 复制带格式的完整提示词上下文
  const handleCopyPromptContext = () => {
    const prompt = `请针对以下工件代码提供修改差量。请严格遵循 patch_file 指令协议输出，示例如下：

\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被替换的精确原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

当前工件【${artifact.meta.name}】源码：
\`\`\`html
${artifact.sourceCode}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 应用 FSM 差量补丁
  const handleApplyPatch = async () => {
    if (!patchInput.trim()) {
      setStatusMessage('请粘贴包含 act、old_doc、new_doc 的补丁文本');
      return;
    }

    if (viewingSnapshot) {
      setStatusMessage('当前处于历史检视模式，请先【基于此版分叉】或【退出试映】后再应用补丁');
      return;
    }

    try {
      // 预先确保基础原生底片落盘
      await galleryStorage.ensureGenesisSnapshot(artifact.meta.filename, artifact.sourceCode);

      const fsm = new DarkroomPatchFSM();
      const commands = fsm.parse(patchInput);

      if (commands.length === 0) {
        throw new Error('未能识别到有效的补丁指令块，请检查围栏语法');
      }

      let nextCode = artifact.sourceCode;
      for (const cmd of commands) {
        nextCode = DarkroomApplier.apply(nextCode, cmd);
      }

      const nextRev = artifact.meta.currentRevision + 1;
      await galleryStorage.saveArtifactSource(
        artifact.meta.filename,
        nextCode,
        nextRev,
        'patch',
        `AI 差量注入应用`,
      );

      const updatedMeta = {
        ...artifact.meta,
        currentRevision: nextRev,
        updatedAt: new Date().toISOString(),
      };
      await galleryStorage.saveMeta(updatedMeta);

      const updated: Artifact = {
        ...artifact,
        sourceCode: nextCode,
        meta: updatedMeta,
      };

      onUpdateArtifact(updated);
      setPatchInput('');
      setStatusMessage(`差量补丁已应用！底片链跃迁至 REV:${nextRev}`);
      await refreshHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`应用失败: ${msg}`);
    }
  };

  // 非破坏性安全还原至指定历史底片
  const handleRestoreRevision = async (targetRev: number) => {
    const historicalContent = await galleryStorage.loadNegativeRevision(
      artifact.meta.filename,
      targetRev,
    );

    if (!historicalContent) {
      setStatusMessage(`未找到 REV:${targetRev} 的物理底片快照`);
      return;
    }

    const nextRev = artifact.meta.currentRevision + 1;
    await galleryStorage.saveArtifactSource(
      artifact.meta.filename,
      historicalContent,
      nextRev,
      'rollback',
      `非破坏性还原自 REV:${targetRev}`,
    );

    const updatedMeta = {
      ...artifact.meta,
      currentRevision: nextRev,
      updatedAt: new Date().toISOString(),
    };
    await galleryStorage.saveMeta(updatedMeta);

    const updated: Artifact = {
      ...artifact,
      sourceCode: historicalContent,
      meta: updatedMeta,
    };

    onUpdateArtifact(updated);
    setViewingSnapshot(null);
    setStatusMessage(`安全还原成功：已将 REV:${targetRev} 映射并跃迁为 REV:${nextRev}`);
    await refreshHistory();
  };

  // 手动一键预缓存外链资产
  const handleCacheAllAssets = async () => {
    if (!assetStats || assetStats.total === 0) return;
    setStatusMessage('正在离线化下载所有外部 CDN 资源...');
    for (const asset of assetStats.assets) {
      await AssetCacheEngine.cacheAsset(asset.url);
    }
    const freshAssets = AssetCacheEngine.detectExternalAssets(activeSourceCode);
    const results = await Promise.all(freshAssets.map((a) => AssetCacheEngine.isCached(a.url)));
    setAssetStats({
      total: freshAssets.length,
      cached: results.filter(Boolean).length,
      assets: freshAssets.map((a, i) => ({
        ...a,
        status: results[i] ? 'cached' : 'failed',
      })),
    });
    setStatusMessage('外链静态资源已全部注入本地持久缓存！');
  };

  return (
    <div className="fixed inset-0 z-40 bg-background text-main flex flex-col overflow-hidden select-none">
      {/* 顶部控制栏 */}
      <header className="h-13 bg-surface border-b border-border px-4 flex justify-between items-center gap-4 text-xs font-mono shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToGallery}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded hover:bg-background transition-colors text-muted hover:text-main"
            title="返回展厅画廊"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>展厅</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="font-bold text-sm font-sans truncate max-w-xs md:max-w-md">
              {artifact.meta.name}
            </span>

            {viewingSnapshot ? (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 animate-pulse">
                <Eye className="w-3 h-3" />
                <span>检视态: REV:{viewingSnapshot.revision}</span>
              </span>
            ) : (
              <span className="bg-tag px-2 py-0.5 rounded text-[11px] font-semibold text-main border border-border">
                REV:{artifact.meta.currentRevision}
              </span>
            )}
          </div>
        </div>

        {/* 视口参数与动作控制 */}
        <div className="flex items-center gap-2.5">
          {assetStats && assetStats.total > 0 && (
            <div
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
                assetStats.cached === assetStats.total
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>
                CDN 缓存: {assetStats.cached}/{assetStats.total}
              </span>
            </div>
          )}

          <div className="hidden md:flex items-center border border-border rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setAspectRatio('fill')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === 'fill'
                  ? 'bg-zinc-800 text-white'
                  : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              自由铺满
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('16/9')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === '16/9'
                  ? 'bg-zinc-800 text-white'
                  : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              16:9
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('4/3')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === '4/3' ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              4:3
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsActivated(!isActivated)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors text-xs font-mono ${
              isActivated
                ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            {isActivated ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isActivated ? '湮灭' : '活体激活'}</span>
          </button>

          <button
            type="button"
            onClick={handleCapturePoster}
            disabled={!isActivated}
            className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border disabled:opacity-40"
            title="捕获当前帧为静态封面快照"
          >
            <Camera className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:inline">定格封印</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenStage(artifact)}
            className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border"
            title="切换至全屏放映舞台"
          >
            <Maximize2 className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:inline">放映舞台</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className="p-1.5 border border-border rounded hover:bg-border text-muted hover:text-main"
            title={isConsoleOpen ? '收起暗房操作台 (大视口优先)' : '展开暗房操作台'}
          >
            {isConsoleOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* 主体视口与控制台 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="relative flex-1 bg-black p-3 md:p-6 flex items-center justify-center overflow-hidden">
          {/* 检视漫游态悬浮 HUD 胶囊 */}
          {viewingSnapshot && (
            <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-zinc-950/90 border border-amber-500/50 backdrop-blur-md px-4 py-2 rounded-full text-xs font-mono text-zinc-200 shadow-2xl animate-in fade-in slide-in-from-top-2">
              <span className="inline-flex items-center gap-1.5 text-amber-400 font-semibold">
                <Eye className="w-3.5 h-3.5 animate-pulse" />
                <span>检视漫游中 · REV:{viewingSnapshot.revision}</span>
              </span>
              <span className="text-zinc-500 text-[11px]">(沙箱只读试映)</span>

              <div className="w-px h-3.5 bg-zinc-700" />

              <button
                type="button"
                onClick={() => handleRestoreRevision(viewingSnapshot.revision)}
                className="flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-full transition-colors text-[11px]"
                title="以此历史底片为起点分叉生成新的一轮修订"
              >
                <GitBranch className="w-3 h-3" />
                <span>基于此版分叉继续</span>
              </button>

              <button
                type="button"
                onClick={handleExitCheckout}
                className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors text-[11px] px-1.5"
                title="退出试映并回到物理主版本"
              >
                <EyeOff className="w-3 h-3" />
                <span>返回最新</span>
              </button>
            </div>
          )}

          <SandboxViewport
            htmlPayload={activeSourceCode}
            isActivated={isActivated}
            aspectRatio={aspectRatio}
            onCaptureReady={(cb) => {
              captureHandleRef.current = cb;
            }}
          />
        </div>

        {isConsoleOpen && (
          <aside className="w-full md:w-[460px] lg:w-[500px] bg-surface border-l border-border flex flex-col shrink-0 overflow-hidden shadow-2xl">
            <div className="h-10 bg-background border-b border-border flex text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('patch')}
                className={`flex-1 flex items-center justify-center gap-1.5 border-r border-border transition-colors ${
                  activeTab === 'patch'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>AI 差量注入</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 flex items-center justify-center gap-1.5 border-r border-border transition-colors ${
                  activeTab === 'history'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <History className="w-3.5 h-3.5 text-amber-400" />
                <span>底片链历史</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('assets')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'assets'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>标本与缓存</span>
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 text-xs font-mono">
              {activeTab === 'patch' && (
                <div className="flex-1 flex flex-col gap-3">
                  {viewingSnapshot ? (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded flex flex-col gap-2.5 text-amber-300">
                      <div className="flex items-center gap-2 font-semibold text-xs">
                        <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>当前处于 REV:{viewingSnapshot.revision} 历史检视态</span>
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        为防止代码基准冲突，历史检视态下 AI 差量补丁已自动锁定。您可以基于当前快照生成新分支，或返回最新物理版本。
                      </p>
                      <div className="flex gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => handleRestoreRevision(viewingSnapshot.revision)}
                          className="flex-1 bg-amber-500/20 border border-amber-500/40 text-amber-200 py-2 rounded text-xs hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          <span>基于此版分叉继续创作</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleExitCheckout}
                          className="px-3 border border-border text-muted hover:text-main py-2 rounded text-xs transition-colors"
                        >
                          返回最新
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase text-muted tracking-wider">
                          提示词协同与 Patch FSM
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyPromptContext}
                          className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                        >
                          {copied ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copied ? '已复制源码上下文！' : '复制大模型提示词上下文'}</span>
                        </button>
                      </div>

                      <textarea
                        value={patchInput}
                        onChange={(e) => setPatchInput(e.target.value)}
                        placeholder={`粘贴大模型生成的差量代码块：
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被精准替换的原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\``}
                        className="flex-1 min-h-[300px] w-full bg-code text-zinc-300 border border-border p-3.5 font-mono text-[11px] rounded outline-none resize-none leading-relaxed"
                      />

                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={handleApplyPatch}
                          className="w-full bg-main text-surface font-semibold py-2.5 rounded text-xs hover:opacity-90 transition-opacity"
                        >
                          应用差量补丁并推入底片链 (REV:{artifact.meta.currentRevision + 1})
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-background border border-border p-3 rounded">
                    <div className="text-[10px] uppercase text-muted tracking-wider mb-1">
                      物理主干底片锚点 (HEAD)
                    </div>
                    <div className="text-sm font-bold text-main">
                      REV:{artifact.meta.currentRevision}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      最后更新：{new Date(artifact.meta.updatedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-muted text-[11px] leading-relaxed">
                    点击 <span className="text-sky-400 font-semibold">检视 (Checkout)</span>{' '}
                    可在沙箱中只读运行任意历史底片（零磁盘开销）；点击{' '}
                    <span className="text-amber-400 font-semibold">安全还原</span>{' '}
                    可将历史底片作为新的一轮修订前向推入。
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <div className="text-[10px] uppercase text-muted tracking-wider">
                      底片快照胶卷（{historyLedger.length} 个锚点）
                    </div>

                    <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
                      {historyLedger.map((item) => {
                        const isPhysicalHead = item.revision === artifact.meta.currentRevision;
                        const isCurrentlyViewing =
                          viewingSnapshot?.revision === item.revision ||
                          (!viewingSnapshot && isPhysicalHead);

                        return (
                          <div
                            key={item.revision}
                            className={`p-2.5 rounded border text-xs flex items-center justify-between transition-colors ${
                              isCurrentlyViewing
                                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                                : 'bg-background border-border text-zinc-300'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold font-mono">REV:{item.revision}</span>
                                {item.action === 'genesis' && (
                                  <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.2 rounded border border-sky-500/30">
                                    创世底片
                                  </span>
                                )}
                                {item.action === 'rollback' && (
                                  <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/30">
                                    还原锚点
                                  </span>
                                )}
                                {isPhysicalHead && (
                                  <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.2 rounded">
                                    HEAD
                                  </span>
                                )}
                                {isCurrentlyViewing && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded">
                                    当前视口
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-muted truncate max-w-[210px]">
                                {item.description || new Date(item.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCheckoutRevision(item.revision)}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors border ${
                                  viewingSnapshot?.revision === item.revision
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'border-border text-muted hover:text-main hover:bg-border'
                                }`}
                                title="在沙箱中只读检视该版本运行效果 (零磁盘改动)"
                              >
                                <Eye className="w-3 h-3 text-sky-400" />
                                <span>
                                  {viewingSnapshot?.revision === item.revision ? '试映中' : '检视'}
                                </span>
                              </button>

                              {!isPhysicalHead && (
                                <button
                                  type="button"
                                  onClick={() => handleRestoreRevision(item.revision)}
                                  className="flex items-center gap-1 border border-border px-2 py-1 rounded hover:bg-border text-[11px] text-main"
                                  title={`基于 REV:${item.revision} 跃迁生成新 Revision`}
                                >
                                  <Undo2 className="w-3 h-3 text-amber-400" />
                                  <span>还原</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'assets' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-background border border-border p-3 rounded">
                    <div className="text-[10px] uppercase text-muted tracking-wider mb-2">
                      工件标本分类与标签
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {artifact.meta.tags.map((rawTag) => {
                        const parsed = TagQueryEngine.parseTag(rawTag);
                        return (
                          <span
                            key={rawTag}
                            className="inline-flex items-center bg-tag border border-border px-2 py-0.5 text-[11px] rounded"
                          >
                            <TagIcon className="w-2.5 h-2.5 text-muted mr-1" />
                            {parsed.namespace && (
                              <span className="text-muted">{parsed.namespace}:</span>
                            )}
                            <span className="font-medium text-main">{parsed.value}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-background border border-border p-3 rounded flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-muted tracking-wider">
                        外部 CDN 依赖与本地保鲜池
                      </span>
                      {assetStats && (
                        <span className="text-[11px] font-semibold text-sky-400">
                          {assetStats.cached}/{assetStats.total} 已缓存
                        </span>
                      )}
                    </div>

                    {assetStats && assetStats.assets.length > 0 ? (
                      <div className="flex flex-col gap-1.5 mt-1 max-h-48 overflow-y-auto">
                        {assetStats.assets.map((asset) => (
                          <div
                            key={asset.url}
                            className="flex items-center justify-between p-2 bg-surface border border-border rounded text-[11px]"
                          >
                            <span className="truncate max-w-[280px] text-zinc-300 font-mono">
                              {asset.url.split('/').pop()}
                            </span>
                            {asset.status === 'cached' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 shrink-0">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>已离线</span>
                              </span>
                            ) : (
                              <span className="text-amber-400 shrink-0">未缓存</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted text-[11px]">
                        未探测到外部 CDN 依赖（纯原生工件）
                      </div>
                    )}

                    {assetStats && assetStats.cached < assetStats.total && (
                      <button
                        type="button"
                        onClick={handleCacheAllAssets}
                        className="w-full mt-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 py-1.5 rounded text-xs hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>一键全量持久化至本地 Cache</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {statusMessage && (
                <div className="p-2.5 bg-background border border-border rounded text-[11px] text-muted flex items-start gap-1.5 animate-in fade-in">
                  <History className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                  <span className="text-main">{statusMessage}</span>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};