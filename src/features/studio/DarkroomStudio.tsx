import { useToast } from '@/context/ToastContext';
import { AssetCacheEngine, type AssetCacheStats } from '@/core/engine/asset-cache';
import { MetaSealEngine } from '@/core/engine/meta-seal';
import { DarkroomPatchFSM, type PatchSimulationResult } from '@/core/engine/patch-fsm';
import { galleryStorage } from '@/core/storage/fs-storage';
import { SandboxViewport } from '@/features/sandbox/SandboxViewport';
import { captureDisplayMediaFrame } from '@/features/sandbox/screen-capture';
import { DarkroomAssetsTab } from '@/features/studio/components/DarkroomAssetsTab';
import { DarkroomCheckoutHud } from '@/features/studio/components/DarkroomCheckoutHud';
import { DarkroomDiffModal } from '@/features/studio/components/DarkroomDiffModal';
import { DarkroomHistoryTab } from '@/features/studio/components/DarkroomHistoryTab';
import { DarkroomPatchTab } from '@/features/studio/components/DarkroomPatchTab';
import { DarkroomStudioHeader } from '@/features/studio/components/DarkroomStudioHeader';
import type { CaptureMode } from '@/types';
import type { Artifact, CommitLogEntry } from '@/types';
import { Code2, Database, History } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DarkroomStudioProps {
  artifact: Artifact | null;
  albumTitle?: string;
  onBackToGallery: () => void;
  onOpenStage: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
  onUpdateRating?: (filename: string, rating: number) => Promise<void> | void;
}

type TabType = 'patch' | 'history' | 'assets';

interface ViewingSnapshotState {
  revision: number;
  content: string;
}

export const DarkroomStudio: React.FC<DarkroomStudioProps> = ({
  artifact,
  albumTitle,
  onBackToGallery,
  onOpenStage,
  onUpdateArtifact,
  onUpdateRating,
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
  const [historyLedger, setHistoryLedger] = useState<CommitLogEntry[]>([]);

  // 预演与审核状态
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [pendingSimulation, setPendingSimulation] = useState<PatchSimulationResult | null>(null);

  // 游离检视快照 (Checkout)
  const [viewingSnapshot, setViewingSnapshot] = useState<ViewingSnapshotState | null>(null);
  const [loadedSourceCode, setLoadedSourceCode] = useState<string>(artifact.sourceCode || '');

  const captureHandleRef = useRef<
    ((mode?: Exclude<CaptureMode, 'screen'>) => Promise<Blob>) | null
  >(null);

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

  const activeSourceCode = useMemo(() => {
    return viewingSnapshot ? viewingSnapshot.content : loadedSourceCode;
  }, [viewingSnapshot, loadedSourceCode]);

  const refreshHistory = useCallback(async () => {
    const list = await galleryStorage.listNegativeRevisions(artifact.meta.id);
    setHistoryLedger(list);
  }, [artifact.meta.id]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

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

  const handleExitCheckout = () => {
    setViewingSnapshot(null);
    toast.info(`已退出版本检视，恢复至最新版本 (REV:${artifact.meta.currentRevision})`);
  };

  const handleCapturePoster = async (mode: CaptureMode = 'auto') => {
    try {
      let blob: Blob;
      if (mode === 'screen') {
        toast.info('请在弹窗中选择并确认当前工件窗口以完成真实屏幕截取');
        blob = await captureDisplayMediaFrame();
      } else {
        if (!captureHandleRef.current) {
          toast.warn('请等待沙箱加载完毕后再截图');
          return;
        }
        blob = await captureHandleRef.current(mode);
      }

      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      toast.success('封面截取并更新成功！');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Permission denied') && !msg.includes('用户取消')) {
        toast.error(`截图失败: ${msg}`);
      }
    }
  };

  // 复制带现有标签、描述以及完整规范的大模型提示词上下文
  const handleCopyPromptContext = () => {
    const currentTagsText =
      artifact.meta.tags.length > 0 ? artifact.meta.tags.join(' ') : '（暂无自定义标签）';
    const currentDescText = artifact.meta.description
      ? artifact.meta.description
      : '（暂无研判备忘）';

    const prompt = `请针对以下工件代码提供修改指令。请严格遵循 act 指令协议输出。

【当前工件已有标签】
${currentTagsText}

【当前工件全局研判备忘】
${currentDescText}

【指令系统支持的操作规范】

1. 本次修改说明 (commit)（强烈推荐）：
记录本次提交的具体改进点、Bug 修复或参数调整。此内容将保存在该版本的快照时间线中，严禁放入 set_description 污染全局备忘：
\`\`\`act
commit
\`\`\`
\`\`\`
已取消鼠标交互响应，实现自主有机平滑漫游；精简纯粹界面；消除周期性脉冲突变。
\`\`\`

2. 差量局部修改 (patch_file) - 适用于局部调整、修复 Bug 或修改参数：
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<必须在当前源码中完全一字不差匹配的原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

3. 全量源码覆写 (write_file) - 适用于大幅重构、替换主逻辑或换用架构：
\`\`\`act
write_file
\`\`\`
\`\`\`html
<!DOCTYPE html>
<html>
...完整的单文件工件源码...
</html>
\`\`\`

4. 追加或移除标签 (add_tag / remove_tag)（可选）：
\`\`\`act
add_tag
\`\`\`
\`\`\`
领域:图形学 物理:粒子系统
\`\`\`

5. 工件全局研判备忘 (set_description)（慎用，仅限修改整个工件的定性归档备忘，不要写单次修改细节）：
\`\`\`act
set_description
\`\`\`
\`\`\`
优秀的高性能流体动画标本，适合大屏沉浸展演。
\`\`\`

当前工件【${artifact.meta.name}】(REV:${artifact.meta.currentRevision}) 源码：
\`\`\`html
${MetaSealEngine.strip(loadedSourceCode)}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success('已复制完整提示词上下文（含标签与描述）！');
    setTimeout(() => setCopied(false), 2000);
  };

  // 第一步：解析与沙箱预演模拟（任意一条失败立即阻断）
  const handleApplyPatch = async () => {
    if (!patchInput.trim()) {
      toast.warn('请粘贴包含 act 指令的补丁文本');
      return;
    }

    if (viewingSnapshot) {
      toast.warn('当前处于历史检视模式，请先【基于此版本修改】或【返回最新版本】');
      return;
    }

    setIsSimulating(true);

    // 主线程让步，让 UI 能够即时渲染“正在校验...”反馈
    setTimeout(async () => {
      try {
        const baseCode = activeSourceCode;
        const fsm = new DarkroomPatchFSM();
        const commands = fsm.parse(patchInput);

        // 使用 DarkroomApplier.simulate 统一预演
        const { DarkroomApplier } = await import('@/core/engine/patch-fsm');
        const simResult = DarkroomApplier.simulate(
          baseCode,
          artifact.meta.tags,
          artifact.meta.description,
          commands,
        );

        setPendingSimulation(simResult);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`预演失败，操作已阻断: ${msg}`);
      } finally {
        setIsSimulating(false);
      }
    }, 20);
  };

  // 第二步：用户在 Diff 审核界面确认后，真正写入磁盘并创建快照
  const handleConfirmSimulation = async () => {
    if (!pendingSimulation) return;
    setIsCommitting(true);

    setTimeout(async () => {
      try {
        const baseCode = activeSourceCode;
        await galleryStorage.ensureGenesisSnapshot(artifact.meta.id, baseCode);

        const hasCodeChange = pendingSimulation.hasCodeChange;
        const nextCode = MetaSealEngine.strip(pendingSimulation.nextCode);
        const nextTags = pendingSimulation.nextTags;
        const nextDesc = pendingSimulation.nextDescription;

        const nextRev = hasCodeChange
          ? artifact.meta.currentRevision + 1
          : artifact.meta.currentRevision;

        const commitDescription =
          pendingSimulation.nextCommitMessage ||
          (hasCodeChange ? '应用审核通过的补丁' : '更新工件元数据');

        const updatedMeta = await galleryStorage.commitRevision({
          artifactId: artifact.meta.id,
          filename: artifact.meta.filename,
          code: hasCodeChange ? nextCode : undefined,
          revision: nextRev,
          action: 'patch',
          message: commitDescription,
          tags: pendingSimulation.hasTagChange ? nextTags : undefined,
          description: pendingSimulation.hasDescChange ? nextDesc : undefined,
        });

        const finalCode = hasCodeChange ? nextCode : baseCode;
        const updated: Artifact = {
          ...artifact,
          sourceCode: finalCode,
          meta: updatedMeta,
        };

        setLoadedSourceCode(finalCode);
        onUpdateArtifact(updated);
        setPendingSimulation(null);
        setPatchInput('');

        const summary = [];
        if (hasCodeChange) summary.push(`代码升级至 REV:${nextRev}`);
        if (pendingSimulation.hasCommitChange) summary.push('提交日志已记录');
        if (pendingSimulation.hasTagChange) summary.push('标签已更新');
        if (pendingSimulation.hasDescChange) summary.push('研判备忘已写入');

        toast.success(summary.length > 0 ? `修改已落盘：${summary.join(' · ')}` : '修改已成功提交');
        await refreshHistory();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`提交落盘失败: ${msg}`);
      } finally {
        setIsCommitting(false);
      }
    }, 20);
  };

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
    const updatedMeta = await galleryStorage.commitRevision({
      artifactId: artifact.meta.id,
      filename: artifact.meta.filename,
      code: historicalContent,
      revision: nextRev,
      action: 'rollback',
      message: `还原自版本 REV:${targetRev}`,
    });

    const updated: Artifact = {
      ...artifact,
      sourceCode: historicalContent,
      meta: updatedMeta,
    };

    setLoadedSourceCode(historicalContent);
    onUpdateArtifact(updated);
    setViewingSnapshot(null);
    toast.success(`已恢复 REV:${targetRev} 内容为新版本 REV:${nextRev}`);
    await refreshHistory();
  };

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
    <div className="dark-scope fixed inset-0 z-40 bg-background text-main flex flex-col overflow-hidden select-none">
      <DarkroomStudioHeader
        artifact={artifact}
        albumTitle={albumTitle}
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
        onUpdateRating={(rating) => onUpdateRating?.(artifact.meta.filename, rating)}
      />

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
                <Code2 className="w-3.5 h-3.5 text-status-info" />
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
                <History className="w-3.5 h-3.5 text-status-warn" />
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
                <Database className="w-3.5 h-3.5 text-status-success" />
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
                  isSimulating={isSimulating}
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

      {/* Diff 审查与决策确认模态框 */}
      {pendingSimulation && (
        <DarkroomDiffModal
          originalCode={activeSourceCode}
          originalTags={artifact.meta.tags}
          originalDescription={artifact.meta.description}
          targetRevision={
            pendingSimulation.hasCodeChange
              ? artifact.meta.currentRevision + 1
              : artifact.meta.currentRevision
          }
          simulation={pendingSimulation}
          isCommitting={isCommitting}
          onConfirm={handleConfirmSimulation}
          onCancel={() => setPendingSimulation(null)}
        />
      )}
    </div>
  );
};
