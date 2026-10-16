import { useToast } from '@/context/ToastContext';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { TagAutocompleteInput } from '@/layer3_gallery/components/TagAutocompleteInput';
import type { Artifact } from '@/types';
import {
  Calendar,
  Check,
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
import { useState } from 'react';

interface ArtifactInspectorModalProps {
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
}

export const ArtifactInspectorModal: React.FC<ArtifactInspectorModalProps> = ({
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
}) => {
  const { toast } = useToast();
  const [newTagInput, setNewTagInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(artifact.meta.name);
  const [editFilename, setEditFilename] = useState(artifact.meta.filename);
  const [showCodePreview, setShowCodePreview] = useState(false);

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
    navigator.clipboard.writeText(artifact.sourceCode);
    setCopiedCode(true);
    toast.success('源码已复制至剪贴板');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 保存重命名
  const handleSaveRename = async () => {
    if (!editName.trim()) {
      toast.warn('工件名称不能为空');
      return;
    }
    const safeFile = TitleSanitizerEngine.toSafeHtmlFilename(editFilename);
    const otherFiles = existingFilenames.filter((f) => f !== artifact.meta.filename);
    const uniqueFile = TitleSanitizerEngine.deduplicateFilename(safeFile, otherFiles);

    try {
      await onRename(artifact.meta.filename, uniqueFile, editName.trim());
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden text-main">
        {/* 标题栏 */}
        <header className="h-14 bg-background border-b border-border px-5 flex justify-between items-center gap-4 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 rounded">
              <FileCode className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm font-sans tracking-wide">标本档案检视</div>
              <div className="text-[11px] text-muted font-mono">{artifact.meta.filename}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenStage(artifact);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-background border border-border rounded hover:bg-surface text-xs font-mono transition-colors"
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              <span>放映</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenStudio(artifact);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded hover:bg-sky-500/30 text-xs font-mono transition-colors"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>暗房</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-muted hover:text-main rounded hover:bg-border transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 档案核心内容 */}
        <div className="p-5 flex flex-col gap-5 overflow-y-auto max-h-[75vh] font-mono text-xs">
          {/* 名称与评分 */}
          <div className="bg-background border border-border p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="工件名称"
                    className="bg-surface border border-sky-400 px-2.5 py-1 rounded text-sm text-main outline-none font-sans font-semibold"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editFilename}
                      onChange={(e) => setEditFilename(e.target.value)}
                      placeholder="文件名 (.html)"
                      className="bg-surface border border-border px-2 py-0.5 rounded text-[11px] text-muted outline-none flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleSaveRename}
                      className="px-2.5 py-0.5 bg-sky-500 text-black font-semibold rounded text-[11px] hover:opacity-90"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="px-2 py-0.5 text-muted hover:text-main text-[11px]"
                    >
                      取消
                    </button>
                  </div>
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
                      setEditFilename(artifact.meta.filename);
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
            <div className="flex items-center gap-1 bg-surface px-3 py-1.5 rounded border border-border">
              <span className="text-[10px] uppercase text-muted tracking-wider mr-1">评级</span>
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

          {/* 属性状态矩阵 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-1">
              <span className="text-muted flex items-center gap-1">
                <Layers className="w-3 h-3 text-sky-400" />
                <span>底片修订</span>
              </span>
              <span className="font-bold text-main">REV:{artifact.meta.currentRevision}</span>
            </div>

            <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-1">
              <span className="text-muted flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-amber-400" />
                <span>源码体量</span>
              </span>
              <span className="font-bold text-main">{artifact.sourceCode.length} 字符</span>
            </div>

            <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-1">
              <span className="text-muted flex items-center gap-1">
                <Calendar className="w-3 h-3 text-emerald-400" />
                <span>更新时间</span>
              </span>
              <span className="font-medium text-main truncate">
                {new Date(artifact.meta.updatedAt).toLocaleDateString()}
              </span>
            </div>

            <div className="bg-background border border-border p-2.5 rounded flex flex-col gap-1">
              <span className="text-muted flex items-center gap-1">
                <TagIcon className="w-3 h-3 text-purple-400" />
                <span>标签数量</span>
              </span>
              <span className="font-bold text-main">{artifact.meta.tags.length} 个</span>
            </div>
          </div>

          {/* 标签管理工坊 */}
          <div className="bg-background border border-border p-4 rounded-lg flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1.5">
                <TagIcon className="w-3 h-3 text-emerald-400" />
                <span>工件标签管理</span>
              </span>
              <span className="text-[10px] text-muted">点击标签后的 × 即可移除</span>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
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
                  placeholder="追加新标签 (例如：形态:webgl 物理:粒子)..."
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
                <span>HTML 源码检视</span>
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
                  <span>{copiedCode ? '已复制' : '复制代码'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCodePreview((prev) => !prev)}
                  className="text-[11px] text-sky-400 hover:text-sky-300"
                >
                  {showCodePreview ? '收起源码' : '展开源码'}
                </button>
              </div>
            </div>

            {showCodePreview && (
              <pre className="p-3 bg-code text-zinc-300 text-[11px] max-h-56 overflow-y-auto leading-relaxed select-text">
                {artifact.sourceCode}
              </pre>
            )}
          </div>

          {/* 危险操作区 */}
          <div className="flex justify-between items-center pt-2 border-t border-border/80">
            <span className="text-[11px] text-muted">需要彻底移除此标本？</span>
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
      </div>
    </div>
  );
};
