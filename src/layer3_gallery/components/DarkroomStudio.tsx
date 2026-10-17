import { useToast } from '@/context/ToastContext';
import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { AssetCacheEngine, type AssetCacheStats } from '@/layer2_darkroom/engine/asset-cache';
import { DarkroomApplier, DarkroomPatchFSM } from '@/layer2_darkroom/fsm/patch-fsm';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { DarkroomAssetsTab } from '@/layer3_gallery/components/studio/DarkroomAssetsTab';
import { DarkroomCheckoutHud } from '@/layer3_gallery/components/studio/DarkroomCheckoutHud';
import { DarkroomHistoryTab } from '@/layer3_gallery/components/studio/DarkroomHistoryTab';
import { DarkroomPatchTab } from '@/layer3_gallery/components/studio/DarkroomPatchTab';
import { DarkroomStudioHeader } from '@/layer3_gallery/components/studio/DarkroomStudioHeader';
import type { Artifact, NegativeLedgerEntry } from '@/types';
import { Code2, Database, History } from 'lucide-react';
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
  const { toast } = useToast();
  const [aspectRatio, setAspectRatio] = useState<'fill' | '16/9' | '4/3'>('fill');
  const [patchInput, setPatchInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [assetStats, setAssetStats] = useState<AssetCacheStats | null>(null);
  const [historyLedger, setHistoryLedger] = useState<NegativeLedgerEntry[]>([]);

  // 游离检视快照（Checkout 模式：只读沙箱试映，不污染物理磁盘）
  const [viewingSnapshot, setViewingSnapshot] = useState<ViewingSnapshotState | null>(null);
  const [loadedSourceCode, setLoadedSourceCode] = useState<string>(artifact.sourceCode || '');

  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);

  // 异步确保暗房源码已完整载入
  useEffect(() => {
    let isCancelled = false;
    if (artifact.sourceCode) {
      setLoadedSourceCode(artifact.sourceCode);
    } else {
      galleryStorage.loadArtifactSource(artifact.meta.filename).then((code) => {
        if (!isCancelled) {
          setLoadedSourceCode(code);
          onUpdateArtifact({ ...artifact, sourceCode: code });
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [artifact, onUpdateArtifact]);

  // 派生当前视口渲染的代码 payload
  const activeSourceCode = useMemo(() => {
    return viewingSnapshot ? viewingSnapshot.content : loadedSourceCode;
  }, [viewingSnapshot, loadedSourceCode]);

  // 加载底片链历史清单
  const refreshHistory = useCallback(async () => {
    const list = await galleryStorage.listNegativeRevisions(artifact.meta.id);
    setHistoryLedger(list);
  }, [artifact.meta.id]);

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
      toast.info(`已退出历史预览，恢复至最新版本 (REV:${targetRev})`);
      return;
    }

    const content = await galleryStorage.loadNegativeRevision(artifact.meta.id, targetRev);
    if (!content) {
      toast.error(`未能载入 REV:${targetRev} 的快照内容`);
      return;
    }

    setViewingSnapshot({ revision: targetRev, content });
    toast.info(`正在只读预览 REV:${targetRev} 快照`);
  };

  // 退出检视态，切回物理主版本
  const handleExitCheckout = () => {
    setViewingSnapshot(null);
    toast.info(`已退出版本检视，恢复至最新版本 (REV:${artifact.meta.currentRevision})`);
  };

  // 截屏定格快照
  const handleCapturePoster = async () => {
    if (!captureHandleRef.current) {
      toast.warn('请等待沙箱加载完毕后再截图');
      return;
    }
    try {
      const blob = await captureHandleRef.current();
      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      toast.success('封面截取并更新成功！');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`截图失败: ${msg}`);
    }
  };

  // 复制带格式的完整提示词上下文
  const handleCopyPromptContext = () => {
    const prompt = `请针对以下工件代码提供修改指令。请严格遵循 act 指令协议输出，示例如下：

\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被替换的精确原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

如需为工件记录研判备忘（如总结工件优缺点、改动要点），可附带 set_description 指令：
\`\`\`act
set_description
\`\`\`
\`\`\`
动画视觉呈现极佳，但存在控制台报错或排版问题。
\`\`\`

如需为工件补充或调整标签，可附带 add_tag 指令（支持空格或换行分隔标签）：
\`\`\`act
add_tag
\`\`\`
\`\`\`
领域:图形学 物理:粒子系统
\`\`\`

当前工件【${artifact.meta.name}】源码：
\`\`\`html
${artifact.sourceCode}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success('已复制大模型提示词上下文！');
    setTimeout(() => setCopied(false), 2000);
  };

  // 应用 FSM 差量补丁
  const handleApplyPatch = async () => {
    if (!patchInput.trim()) {
      toast.warn('请粘贴包含 act 指令的补丁文本');
      return;
    }

    if (viewingSnapshot) {
      toast.warn('当前处于历史检视模式，请先【基于此版本修改】或【返回最新版本】');
      return;
    }

    try {
      const baseCode = activeSourceCode;
      await galleryStorage.ensureGenesisSnapshot(artifact.meta.id, baseCode);

      const fsm = new DarkroomPatchFSM();
      const commands = fsm.parse(patchInput);

      if (commands.length === 0) {
        throw new Error('未能识别到有效的补丁指令块，请检查围栏语法');
      }

      let nextCode = baseCode;
      let nextTags = [...artifact.meta.tags];
      let nextDesc = artifact.meta.description;
      let hasCodeChange = false;
      let hasTagChange = false;
      let hasDescChange = false;

      for (const cmd of commands) {
        if (cmd.action === 'patch_file' || cmd.action === 'write_file') {
          nextCode = DarkroomApplier.apply(nextCode, cmd);
          hasCodeChange = true;
        } else if (cmd.action === 'add_tag' || cmd.action === 'remove_tag') {
          nextTags = DarkroomApplier.applyTags(nextTags, cmd);
          hasTagChange = true;
        } else if (cmd.action === 'set_description') {
          nextDesc = cmd.description ?? '';
          hasDescChange = true;
        }
      }

      setLoadedSourceCode(nextCode);

      const nextRev = hasCodeChange
        ? artifact.meta.currentRevision + 1
        : artifact.meta.currentRevision;

      if (hasCodeChange) {
        await galleryStorage.saveArtifactSource(
          artifact.meta.filename,
          artifact.meta.id,
          nextCode,
          nextRev,
          'patch',
          '应用差量补丁',
        );
      }

      const updatedMeta = {
        ...artifact.meta,
        tags: nextTags,
        description: nextDesc,
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
      const changeSummaries: string[] = [];
      if (hasCodeChange) changeSummaries.push(`升级至 REV:${nextRev}`);
      if (hasTagChange) changeSummaries.push('标签已更新');
      if (hasDescChange) changeSummaries.push('研判备忘已写入');

      toast.success(
        changeSummaries.length > 0 ? `指令已执行：${changeSummaries.join(' · ')}` : '指令执行完毕',
      );
      await refreshHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`执行失败: ${msg}`);
    }
  };

  // 非破坏性安全还原至指定历史底片
  const handleRestoreRevision = async (targetRev: number) => {
    const historicalContent = await galleryStorage.loadNegativeRevision(
      artifact.meta.id,
      targetRev,
    );

    if (!historicalContent) {
      toast.error(`未找到 REV:${targetRev} 的快照文件`);
      return;
    }

    const nextRev = artifact.meta.currentRevision + 1;
    await galleryStorage.saveArtifactSource(
      artifact.meta.filename,
      artifact.meta.id,
      historicalContent,
      nextRev,
      'rollback',
      `还原自版本 REV:${targetRev}`,
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
    toast.success(`已恢复 REV:${targetRev} 内容为新版本 REV:${nextRev}`);
    await refreshHistory();
  };

  // 手动一键预缓存外链资产
  const handleCacheAllAssets = async () => {
    if (!assetStats || assetStats.total === 0) return;
    toast.info('正在下载并缓存外部资源...');
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
    toast.success('外部资源已全部缓存至本地！');
  };

  return (
    <div className="fixed inset-0 z-40 bg-background text-main flex flex-col overflow-hidden select-none">
      <DarkroomStudioHeader
        artifact={artifact}
        viewingRevision={viewingSnapshot?.revision ?? null}
        assetStats={assetStats}
        aspectRatio={aspectRatio}
        isActivated={isActivated}
        isConsoleOpen={isConsoleOpen}
        onBackToGallery={onBackToGallery}
        onSetAspectRatio={setAspectRatio}
        onToggleActivated={() => setIsActivated(!isActivated)}
        onCapturePoster={handleCapturePoster}
        onOpenStage={() => onOpenStage(artifact)}
        onToggleConsole={() => setIsConsoleOpen(!isConsoleOpen)}
      />

      {/* 主体视口与控制台 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="relative flex-1 bg-black p-3 md:p-6 flex items-center justify-center overflow-hidden">
          {viewingSnapshot && (
            <DarkroomCheckoutHud
              revision={viewingSnapshot.revision}
              onRestore={handleRestoreRevision}
              onExit={handleExitCheckout}
            />
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
                <span>暗房指令台</span>
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
                <span>版本历史</span>
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
                <span>标签与资源</span>
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 text-xs font-mono">
              {activeTab === 'patch' && (
                <DarkroomPatchTab
                  isViewingSnapshot={viewingSnapshot !== null}
                  viewingRevision={viewingSnapshot?.revision}
                  patchInput={patchInput}
                  copied={copied}
                  onPatchInputChange={setPatchInput}
                  onCopyPromptContext={handleCopyPromptContext}
                  onApplyPatch={handleApplyPatch}
                  onRestoreRevision={handleRestoreRevision}
                  onExitCheckout={handleExitCheckout}
                />
              )}

              {activeTab === 'history' && (
                <DarkroomHistoryTab
                  currentRevision={artifact.meta.currentRevision}
                  lastUpdatedAt={artifact.meta.updatedAt}
                  historyLedger={historyLedger}
                  viewingRevision={viewingSnapshot?.revision ?? null}
                  onCheckoutRevision={handleCheckoutRevision}
                  onRestoreRevision={handleRestoreRevision}
                />
              )}

              {activeTab === 'assets' && (
                <DarkroomAssetsTab
                  tags={artifact.meta.tags}
                  description={artifact.meta.description}
                  onUpdateDescription={async (newDesc) => {
                    const updatedMeta = await galleryStorage.updateArtifactMeta(
                      artifact.meta.filename,
                      {
                        description: newDesc.trim() || undefined,
                      },
                    );
                    onUpdateArtifact({ ...artifact, meta: updatedMeta });
                    toast.success('研判描述已更新');
                  }}
                  assetStats={assetStats}
                  onCacheAllAssets={handleCacheAllAssets}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
