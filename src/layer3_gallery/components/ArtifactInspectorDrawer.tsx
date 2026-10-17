import { useToast } from '@/context/ToastContext';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { TagAutocompleteInput } from '@/layer3_gallery/components/TagAutocompleteInput';
import type { Artifact } from '@/types';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Edit2,
  Eye,
  FileCode,
  HardDrive,
  Layers,
  Plus,
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
  const [editName, setEditName] = useState(artifact.meta.name);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [sourceCode, setSourceCode] = useState<string>(artifact.sourceCode || '');

  // 当切换工件时重置名字编辑态
  useEffect(() => {
    setEditName(artifact.meta.name);
    setIsEditingName(false);
  }, [artifact.meta.name]);

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

  // 评分交互
  const handleRatingClick = async (star: number) => {
    const nextRating = artifact.meta.rating === star ? 0 : star;
    await onUpdateRating(artifact.meta.filename, nextRating);
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
      await onUpdateTags(artifact.meta.filename, nextTags);
      toast.success(`已添加 ${addedCount} 个新标签`);
      setNewTagInput('');
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

  // 保存重命名
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

    try {
      await onRename(artifact.meta.filename, uniqueFile, newDisplayName);
      setIsEditingName(false);
      toast.success('工件重命名成功');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`重命名失败: ${msg}`);
    }
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
          <div className="p-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded shrink-0">
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
          {/* 上一件 / 下一件切页器 */}
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
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">放映</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenStudio(artifact)}
            className="flex items-center gap-1 px-2 py-1.5 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded hover:bg-sky-500/30 text-xs font-mono transition-colors"
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

      {/* 核心检视内容 */}
      <div className="flex-1 p-4 md:p-5 flex flex-col gap-4 overflow-y-auto font-mono text-xs">
        {/* 名称与评分 */}
        <div className="bg-background border border-border p-3.5 rounded-lg flex flex-col gap-3">
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  placeholder="工件名称"
                  className="bg-surface border border-sky-400 px-2.5 py-1 rounded text-sm text-main outline-none font-sans font-semibold flex-1"
                />
                <button
                  type="button"
                  onClick={handleSaveRename}
                  className="px-2.5 py-1 bg-sky-500 text-black font-semibold rounded text-xs hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingName(false)}
                  className="px-2 py-1 text-muted hover:text-main text-xs transition-colors"
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

          {/* 1-5 星级评分交互 */}
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
                    className={`w-4 h-4 ${
                      star <= (artifact.meta.rating || 0)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-zinc-600 hover:text-amber-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 属性状态矩阵 */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>底片修订</span>
            </span>
            <span className="font-bold text-main">REV:{artifact.meta.currentRevision}</span>
          </div>

          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-amber-400" />
              <span>源码体量</span>
            </span>
            <span className="font-bold text-main">{sourceCode.length} 字符</span>
          </div>

          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <Calendar className="w-3 h-3 text-sky-400" />
              <span>导入时间</span>
            </span>
            <span className="font-medium text-main truncate">
              {new Date(artifact.meta.createdAt || artifact.meta.updatedAt).toLocaleDateString()}
            </span>
          </div>

          <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-0.5">
            <span className="text-muted flex items-center gap-1">
              <Calendar className="w-3 h-3 text-emerald-400" />
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
              <TagIcon className="w-3 h-3 text-emerald-400" />
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
                    className="text-muted hover:text-red-400 transition-colors ml-0.5"
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
              className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 px-3 py-1.5 rounded transition-colors text-xs font-semibold shrink-0"
            >
              <Plus className="w-3 h-3" />
              <span>添加</span>
            </button>
          </div>
        </div>

        {/* 源码预览抽屉 */}
        <div className="border border-border rounded-lg overflow-hidden bg-background">
          <div className="p-3 flex justify-between items-center bg-surface/50 border-b border-border">
            <span className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1.5">
              <Code2 className="w-3 h-3 text-sky-400" />
              <span>HTML 源码</span>
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopySource}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-main px-2 py-0.5 rounded hover:bg-border"
              >
                {copiedCode ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedCode ? '已复制' : '复制'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCodePreview((prev) => !prev)}
                className="text-[11px] text-sky-400 hover:text-sky-300"
              >
                {showCodePreview ? '收起' : '展开'}
              </button>
            </div>
          </div>

          {showCodePreview && (
            <pre className="p-3 bg-code text-zinc-300 text-[11px] max-h-56 overflow-y-auto leading-relaxed select-text font-mono">
              {sourceCode || '正在载入源码...'}
            </pre>
          )}
        </div>

        {/* 危险操作区 */}
        <div className="flex justify-between items-center pt-2 mt-auto border-t border-border/80">
          <span className="text-[11px] text-muted">销毁此工件？</span>
          <button
            type="button"
            onClick={handleDeleteArtifact}
            className="flex items-center gap-1.5 text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 rounded transition-colors text-xs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>销毁标本工件</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
