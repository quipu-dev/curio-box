import { useToast } from '@/context/ToastContext';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { TagAutocompleteInput } from '@/layer3_gallery/components/TagAutocompleteInput';
import type { Artifact, NegativeLedgerEntry } from '@/types';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Edit2,
  Eye,
  FileCode,
  GitCommit,
  HardDrive,
  History,
  Layers,
  Loader2,
  MessageSquareQuote,
  Plus,
  Save,
  Star,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface ArtifactInspectorDrawerProps {
  artifact: Artifact;
  onClose: () => void;
  onOpenStage: (artifact: Artifact) => void;
  onOpenStudio: (artifact: Artifact) => void;
  onUpdateTags: (filename: string, newTags: string[]) => Promise<void>;
  onUpdateRating: (filename: string, newRating: number) => Promise<void>;
  onUpdateDescription: (filename: string, newDescription: string) => Promise<void>;
  onRename: (oldFilename: string, newFilename: string, newName: string) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  existingFilenames: string[];
  allTags?: string[];
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

export const ArtifactInspectorDrawer: React.FC<ArtifactInspectorDrawerProps> = ({
  artifact,
  onClose,
  onOpenStage,
  onOpenStudio,
  onUpdateTags,
  onUpdateRating,
  onUpdateDescription,
  onRename,
  onDelete,
  existingFilenames,
  allTags = [],
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}) => {
  const { toast } = useToast();
  const [newTagInput, setNewTagInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(artifact.meta.name);
  const [editDesc, setEditDesc] = useState(artifact.meta.description || '');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [sourceCode, setSourceCode] = useState<string>(artifact.sourceCode || '');
  const [historyLedger, setHistoryLedger] = useState<NegativeLedgerEntry[]>([]);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // 当切换工件时重置状态
  useEffect(() => {
    setEditName(artifact.meta.name);
    setIsEditingName(false);
    setIsRenaming(false);
    setEditDesc(artifact.meta.description || '');
    setIsEditingDesc(false);
    setIsSavingDesc(false);
    setShowHistory(false);
  }, [artifact.meta.name, artifact.meta.description]);

  // 加载该工件的历史提交台账
  useEffect(() => {
    let isCancelled = false;
    galleryStorage.listNegativeRevisions(artifact.meta.id).then((list) => {
      if (!isCancelled) {
        setHistoryLedger(list);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [artifact.meta.id]);

  // 异步按需加载源码
  useEffect(() => {
    let isCancelled = false;
    if (artifact.sourceCode) {
      setSourceCode(artifact.sourceCode);
    } else {
      galleryStorage.loadArtifactSource(artifact.meta.filename).then((code) => {
        if (!isCancelled) {
          setSourceCode(code);
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [artifact.meta.filename, artifact.sourceCode]);

  // 评分交互（由底层提供乐观更新，毫秒级响应）
  const handleRatingClick = (star: number) => {
    const nextRating = artifact.meta.rating === star ? 0 : star;
    onUpdateRating(artifact.meta.filename, nextRating);
    toast.success(nextRating > 0 ? `已将评分更新为 ${nextRating} 星` : '已清除星级评分');
  };

  // 添加标签
  const handleAddTag = async () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const existingSet = new Set(artifact.meta.tags);
    let addedCount = 0;

    for (const token of tokens) {
      if (!existingSet.has(token)) {
        existingSet.add(token);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      const nextTags = Array.from(existingSet);
      setNewTagInput('');
      await onUpdateTags(artifact.meta.filename, nextTags);
      toast.success(`已添加 ${addedCount} 个新标签`);
    } else {
      toast.info('标签已存在');
      setNewTagInput('');
    }
  };

  // 删除单个标签
  const handleRemoveTag = async (targetTag: string) => {
    const nextTags = artifact.meta.tags.filter((t) => t !== targetTag);
    await onUpdateTags(artifact.meta.filename, nextTags);
    toast.info(`已移除标签: ${targetTag}`);
  };

  // 复制完整源码
  const handleCopySource = () => {
    navigator.clipboard.writeText(sourceCode);
    setCopiedCode(true);
    toast.success('源码已复制至剪贴板');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 下载 HTML 文件到本地
  const handleDownloadSource = () => {
    if (!sourceCode) {
      toast.warn('源码尚未载入完成，请稍候');
      return;
    }
    const blob = new Blob([sourceCode], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = artifact.meta.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`已开始下载 ${artifact.meta.filename}`);
  };

  // 保存重命名（带主线程让步与状态机锁）
  const handleSaveRename = async () => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.warn('工件名称不能为空');
      return;
    }

    const safeFile = TitleSanitizerEngine.toSafeHtmlFilename(trimmed);
    const otherFiles = existingFilenames.filter((f) => f !== artifact.meta.filename);
    const uniqueFile = TitleSanitizerEngine.deduplicateFilename(safeFile, otherFiles);
    const newDisplayName = uniqueFile.replace(/\.html$/, '');

    if (uniqueFile === artifact.meta.filename && newDisplayName === artifact.meta.name) {
      setIsEditingName(false);
      return;
    }

    setIsRenaming(true);

    // 微任务让步，确保加载态立即渲染
    setTimeout(async () => {
      try {
        await onRename(artifact.meta.filename, uniqueFile, newDisplayName);
        setIsEditingName(false);
        toast.success('工件重命名成功');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`重命名失败: ${msg}`);
      } finally {
        setIsRenaming(false);
      }
    }, 20);
  };

  // 保存研判描述
  const handleSaveDescription = async () => {
    setIsSavingDesc(true);
    setTimeout(async () => {
      try {
        await onUpdateDescription(artifact.meta.filename, editDesc);
        setIsEditingDesc(false);
        toast.success('工件研判描述已更新');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`更新描述失败: ${msg}`);
      } finally {
        setIsSavingDesc(false);
      }
    }, 20);
  };

  // 删除确认
  const handleDeleteArtifact = async () => {
    const confirmed = window.confirm(
      `确定要销毁工件【${artifact.meta.name}】吗？此操作将永久删除磁盘物理源文件、底片历史快照及封面。`,
    );
    if (!confirmed) return;

    try {
      await onDelete(artifact.meta.filename);
      toast.success('标本工件已安全销毁');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`销毁工件失败: ${msg}`);
    }
  };

  return (
    <aside
      aria-label="工件档案信息栏"
      className="fixed top-0 right-0 h-full w-full sm:w-[480px] z-40 bg-surface/98 backdrop-blur-xl border-l border-border shadow-2xl flex flex-col overflow-hidden text-main animate-in slide-in-from-right duration-250 select-none"
    >
      {/* 顶部标题栏 */}
      <header className="h-14 bg-background/90 border-b border-border px-4 flex justify-between items-center gap-3 shrink-0 font-mono text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-status-info-bg border border-status-info-border text-status-info rounded shrink-0">
            <FileCode className="w-4 h-4" />
          </div>
          <div className="truncate">
            <div className="font-bold text-sm font-sans tracking-wide truncate">标本档案</div>
            <div className="text-[11px] text-muted font-mono truncate">
              {artifact.meta.filename}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {(onPrev || onNext) && (
            <div className="flex items-center border border-border rounded overflow-hidden mr-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-1.5 text-muted hover:text-main hover:bg-border disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="上一件工件 (← / [)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="p-1.5 text-muted hover:text-main hover:bg-border disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-l border-border"
                title="下一件工件 (→ / ])"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenStage(artifact)}
            className="flex items-center gap-1 px-2 py-1.5 bg-background border border-border rounded hover:bg-surface text-xs font-mono transition-colors"
            title="全屏放映舞台"
          >
            <Eye className="w-3.5 h-3.5 text-status-info" />
            <span className="hidden sm:inline">放映</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenStudio(artifact)}
            className="flex items-center gap-1 px-2 py-1.5 bg-status-info-bg text-status-info border border-status-info-border rounded hover:bg-sky-500/30 text-xs font-mono transition-colors"
            title="进入暗房工作台"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">暗房</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-main rounded hover:bg-border transition-colors ml-0.5"
            title="关闭信息栏 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 核心检视内容（添加 min-h-0 解决 flex 子项溢出不触发滚动的问题） */}
      <div className="flex-1 min-h-0 p-4 md:p-5 flex flex-col gap-4 overflow-y-auto font-mono text-xs overscroll-contain">
        {/* 名称与评分卡片 */}
        <div className="bg-background border border-border p-3.5 rounded-lg flex flex-col gap-3">
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  disabled={isRenaming}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  placeholder="工件名称"
                  className="bg-surface border border-sky-400 px-2.5 py-1 rounded text-sm text-main outline-none font-sans font-semibold flex-1 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={isRenaming}
                  onClick={handleSaveRename}
                  className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 text-black font-semibold rounded text-xs hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
                >
                  {isRenaming ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>保存中</span>
                    </>
                  ) : (
                    <span>保存</span>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isRenaming}
                  onClick={() => setIsEditingName(false)}
                  className="px-2 py-1 text-muted hover:text-main text-xs transition-colors shrink-0 disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-bold text-base font-sans text-main truncate">
                  {artifact.meta.name}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditName(artifact.meta.name);
                    setIsEditingName(true);
                  }}
                  className="p-1 text-muted hover:text-main rounded hover:bg-surface"
                  title="重命名工件"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 1-5 星级评分交互（瞬时响应） */}
          <div className="flex items-center justify-between bg-surface px-3 py-1.5 rounded border border-border">
            <span className="text-[10px] uppercase text-muted tracking-wider">工件评级</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => handleRatingClick(star)}
                  className="p-0.5 hover:scale-110 transition-transform outline-none"
                  title={`${star} 星`}
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${
                      star <= (artifact.meta.rating || 0)
                        ? 'fill-amber-400 text-status-warn'
                        : 'text-muted hover:text-status-warn'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 最新 Commit 提交说明区块 */}
        <div className="bg-background border border-status-success-border p-3.5 rounded-lg flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase text-status-success tracking-wider flex items-center gap-1.5 font-bold">
              <GitCommit className="w-3.5 h-3.5 text-status-success" />
              <span>最新提交说明 (Commit)</span>
            </span>
            <span className="text-[10px] font-mono text-muted">
              REV:{artifact.meta.currentRevision}
            </span>
          </div>

          <div className="text-xs font-sans text-main leading-relaxed bg-surface-subtle p-2.5 rounded border border-border whitespace-pre-wrap select-text">
            {artifact.meta.lastCommitMessage ||
              historyLedger[0]?.description ||
              '初始版本 (Genesis Snapshot)'}
          </div>
        </div>

        {/* 研判备忘区块 */}
        <div className="bg-background border border-border p-3.5 rounded-lg flex flex-col gap-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1.5">
              <MessageSquareQuote className="w-3 h-3 text-status-info" />
              <span>研判备忘 / 描述</span>
            </span>

            {isEditingDesc ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isSavingDesc}
                  onClick={handleSaveDescription}
                  className="flex items-center gap-1 px-2 py-0.5 bg-sky-500 text-black font-semibold rounded text-[11px] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSavingDesc ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  <span>{isSavingDesc ? '保存中' : '保存'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSavingDesc}
                  onClick={() => {
                    setEditDesc(artifact.meta.description || '');
                    setIsEditingDesc(false);
                  }}
                  className="px-1.5 py-0.5 text-muted hover:text-main text-[11px] transition-colors disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingDesc(true)}
                className="flex items-center gap-1 text-[11px] text-status-info hover:text-status-info"
              >
                <Edit2 className="w-3 h-3" />
                <span>{artifact.meta.description ? '编辑' : '添加备忘'}</span>
              </button>
            )}
          </div>

          {isEditingDesc ? (
            <textarea
              disabled={isSavingDesc}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="记录工件特点、亮点与不足..."
              rows={3}
              className="w-full bg-surface border border-sky-400 p-2 rounded text-xs text-main outline-none font-sans leading-relaxed resize-none disabled:opacity-50"
            />
          ) : artifact.meta.description ? (
            <button
              type="button"
              onClick={() => setIsEditingDesc(true)}
              className="w-full text-left text-xs font-sans text-main leading-relaxed bg-surface/40 p-2.5 rounded border border-border/40 cursor-pointer hover:border-sky-500/60 hover:bg-surface/80 hover:text-main transition-all whitespace-pre-wrap select-text group"
              title="点击编辑备忘"
            >
              {artifact.meta.description}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingDesc(true)}
              className="w-full text-left text-[11px] font-sans text-muted italic bg-surface/20 p-2.5 rounded border border-dashed border-border/40 cursor-pointer hover:border-sky-500/60 hover:bg-surface/40 hover:text-zinc-300 transition-all"
            >
              暂未记录研判心得，点击此处快速记录...
            </button>
          )}
        </div>

        {/* 版本提交历史查看抽屉 */}
        {historyLedger.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <div className="p-3 flex justify-between items-center bg-surface/50 border-b border-border">
              <span className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-status-warn" />
                <span>版本提交历史 ({historyLedger.length})</span>
              </span>

              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className="text-[11px] text-status-warn hover:text-status-warn"
              >
                {showHistory ? '收起历史' : '展开历史'}
              </button>
            </div>

            {showHistory && (
              <div className="p-2.5 flex flex-col gap-2 max-h-56 overflow-y-auto">
                {historyLedger.map((item) => (
                  <div
                    key={item.revision}
                    className="p-2 bg-surface rounded border border-border flex flex-col gap-1 text-[11px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold font-mono text-main">REV:{item.revision}</span>
                      <span className="text-[10px] text-muted font-mono">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-start gap-1 text-main font-sans">
                      <GitCommit className="w-3 h-3 text-status-success shrink-0 mt-0.5" />
                      <span className="line-clamp-2 leading-relaxed">
                        {item.description ||
                          (item.action === 'genesis' ? '初始版本' : '无详细说明')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 属性状态矩阵 */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <Layers className="w-3 h-3 text-status-info" />
              <span>底片修订</span>
            </span>
            <span className="font-bold text-main">REV:{artifact.meta.currentRevision}</span>
          </div>

          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-status-warn" />
              <span>源码体量</span>
            </span>
            <span className="font-bold text-main">{sourceCode.length} 字符</span>
          </div>

          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <Calendar className="w-3 h-3 text-status-info" />
              <span>导入时间</span>
            </span>
            <span className="font-medium text-main truncate">
              {new Date(artifact.meta.createdAt || artifact.meta.updatedAt).toLocaleDateString()}
            </span>
          </div>

          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <Calendar className="w-3 h-3 text-status-success" />
              <span>更新时间</span>
            </span>
            <span className="font-medium text-main truncate">
              {new Date(artifact.meta.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* 标签管理工坊 */}
        <div className="bg-background border border-border p-3.5 rounded-lg flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1.5">
              <TagIcon className="w-3 h-3 text-status-success" />
              <span>工件标签 ({artifact.meta.tags.length})</span>
            </span>
            <span className="text-[10px] text-muted">点击 × 移除</span>
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[30px] items-center">
            {artifact.meta.tags.map((rawTag) => {
              const parsed = TagQueryEngine.parseTag(rawTag);
              return (
                <span
                  key={rawTag}
                  className="inline-flex items-center gap-1 bg-surface border border-border px-2 py-0.5 rounded text-[11px] group"
                >
                  {parsed.namespace && <span className="text-muted">{parsed.namespace}:</span>}
                  <span className="font-medium text-main">{parsed.value}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(rawTag)}
                    className="text-muted hover:text-status-error transition-colors ml-0.5"
                    title="移除此标签"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1">
              <TagAutocompleteInput
                value={newTagInput}
                onChange={setNewTagInput}
                allTags={allTags}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="追加标签 (例如：形态:webgl 物理:粒子)..."
                className="w-full bg-surface border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-emerald-400"
              />
            </div>
            <button
              type="button"
              onClick={handleAddTag}
              className="flex items-center gap-1 bg-status-success-bg text-status-success border border-status-success-border hover:bg-emerald-500/30 px-3 py-1.5 rounded transition-colors text-xs font-semibold shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>添加</span>
            </button>
          </div>
        </div>

        {/* HTML 源码导出与操作栏（移除文本查看器，精炼为复制与下载） */}
        <div className="bg-background border border-border p-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-status-info-bg border border-status-info-border text-status-info rounded">
              <Code2 className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold text-main">工件 HTML 源码</span>
              <span className="text-[10px] text-muted font-mono">
                {sourceCode ? `${sourceCode.length} 字符` : '载入中...'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopySource}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-main px-2.5 py-1 rounded border border-border hover:bg-surface transition-colors"
              title="复制完整 HTML 源码至剪贴板"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-status-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedCode ? '已复制' : '复制源码'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadSource}
              className="flex items-center gap-1 text-[11px] text-status-info hover:text-status-info px-2.5 py-1 rounded border border-status-info-border bg-status-info-bg hover:bg-status-info-bg transition-colors"
              title="将 HTML 源文件下载至本地"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载文件</span>
            </button>
          </div>
        </div>
      </div>

      {/* 固定的底部危险操作栏 (Footer) */}
      <footer className="h-13 bg-background/95 border-t border-border px-4 md:px-5 flex justify-between items-center shrink-0 font-mono text-xs">
        <span className="text-[11px] text-muted">销毁此工件？</span>
        <button
          type="button"
          onClick={handleDeleteArtifact}
          className="flex items-center gap-1.5 text-status-error hover:text-status-error border border-status-error-border hover:bg-status-error-bg px-3 py-1.5 rounded transition-colors text-xs"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>销毁标本工件</span>
        </button>
      </footer>
    </aside>
  );
};
