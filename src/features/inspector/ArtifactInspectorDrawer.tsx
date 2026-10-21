import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import { useToast } from '@/context/ToastContext';
import { MetaSealEngine } from '@/core/engine/meta-seal';
import { TagQueryEngine } from '@/core/engine/tag-engine';
import { TitleSanitizerEngine } from '@/core/engine/title-sanitizer';
import { galleryStorage } from '@/core/storage/fs-storage';
import type { Artifact, CommitLogEntry } from '@/types';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Download,
  Loader2,
  Play,
  Star,
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
  const [nameValue, setNameValue] = useState(artifact.meta.name);
  const [descValue, setDescValue] = useState(artifact.meta.description || '');
  const [isRenaming, setIsRenaming] = useState(false);
  const [sourceCode, setSourceCode] = useState<string>(artifact.sourceCode || '');
  const [historyLedger, setHistoryLedger] = useState<CommitLogEntry[]>([]);

  // 监听工件切换，保持状态与当前工件严格对齐
  useEffect(() => {
    setNameValue(artifact.meta.name);
    setDescValue(artifact.meta.description || '');
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

  // 评分交互
  const handleRatingClick = (star: number) => {
    const nextRating = artifact.meta.rating === star ? 0 : star;
    onUpdateRating(artifact.meta.filename, nextRating);
    toast.success(nextRating > 0 ? `已设定为 ${nextRating} 星` : '已清除星级');
  };

  // 保存名称
  const handleBlurRename = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === artifact.meta.name) return;

    const safeFile = TitleSanitizerEngine.toSafeHtmlFilename(trimmed);
    const otherFiles = existingFilenames.filter((f) => f !== artifact.meta.filename);
    const uniqueFile = TitleSanitizerEngine.deduplicateFilename(safeFile, otherFiles);
    const newDisplayName = uniqueFile.replace(/\.html$/, '');

    setIsRenaming(true);
    try {
      await onRename(artifact.meta.filename, uniqueFile, newDisplayName);
      toast.success('工件名称已保存');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`重命名失败: ${msg}`);
      setNameValue(artifact.meta.name);
    } finally {
      setIsRenaming(false);
    }
  };

  // 自动失焦保存研判描述
  const handleBlurDescription = async () => {
    const trimmed = descValue.trim();
    if (trimmed === (artifact.meta.description || '')) return;

    try {
      await onUpdateDescription(artifact.meta.filename, trimmed);
      toast.success('研判备忘已自动保存');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`保存备忘失败: ${msg}`);
    }
  };

  // 添加单个或多个标签（选定即存）
  const handleSelectTag = async (tag: string) => {
    const trimmed = tag.trim().replace(/^[-+]/, '');
    if (!trimmed) return;

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const existingSet = new Set(artifact.meta.tags);
    const addedList: string[] = [];

    for (const token of tokens) {
      if (!existingSet.has(token)) {
        existingSet.add(token);
        addedList.push(token);
      }
    }

    if (addedList.length > 0) {
      const nextTags = Array.from(existingSet);
      setNewTagInput('');
      await onUpdateTags(artifact.meta.filename, nextTags);
      toast.success(
        addedList.length === 1
          ? `已添加标签: ${addedList[0]}`
          : `已追加 ${addedList.length} 个新标签`,
      );
    } else {
      setNewTagInput('');
      toast.info(`标签 [${trimmed}] 已存在`);
    }
  };

  // 删除单个标签
  const handleRemoveTag = async (targetTag: string) => {
    const nextTags = artifact.meta.tags.filter((t) => t !== targetTag);
    await onUpdateTags(artifact.meta.filename, nextTags);
  };

  // 复制完整源码
  const handleCopySource = () => {
    if (!sourceCode) {
      toast.warn('源码尚未载入完成，请稍候');
      return;
    }
    const exportableHtml = MetaSealEngine.inject(sourceCode, artifact.meta);
    navigator.clipboard.writeText(exportableHtml);
    setCopiedCode(true);
    toast.success('已复制包含内联符印元数据的单文件 HTML 源码');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // 下载 HTML 文件到本地
  const handleDownloadSource = () => {
    if (!sourceCode) {
      toast.warn('源码尚未载入完成，请稍候');
      return;
    }
    const exportableHtml = MetaSealEngine.inject(sourceCode, artifact.meta);
    const blob = new Blob([exportableHtml], { type: 'text/html;charset=utf-8' });
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

  // 删除确认
  const handleDeleteArtifact = async () => {
    const confirmed = window.confirm(
      `确定要销毁工件【${artifact.meta.name}】吗？此操作将永久删除本地源文件及快照底片。`,
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
      className="fixed top-0 right-0 h-full w-full sm:w-[420px] z-30 bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden text-main select-none font-mono"
    >
      {/* 档案顶部导航栏 */}
      <header className="h-14 border-b border-border px-5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-xs font-bold tracking-wider uppercase text-muted">
            标本档案检视
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {(onPrev || onNext) && (
            <div className="flex items-center border border-border rounded overflow-hidden mr-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-1.5 text-muted hover:text-main hover:bg-border disabled:opacity-30 transition-colors"
                title="上一件工件 (← / [)"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="p-1.5 text-muted hover:text-main hover:bg-border disabled:opacity-30 transition-colors border-l border-border"
                title="下一件工件 (→ / ])"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenStage(artifact)}
            className="px-2.5 py-1.5 bg-status-info-bg hover:bg-sky-500/20 text-status-info border border-status-info-border rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            title="全屏放映"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>放映</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenStudio(artifact)}
            className="px-2.5 py-1.5 bg-surface-subtle hover:bg-surface-elevated text-main border border-border rounded-lg text-xs font-mono flex items-center gap-1 transition-colors"
            title="进入镜像暗房工作台"
          >
            <Code2 className="w-3.5 h-3.5 text-status-info" />
            <span>暗房</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-main rounded-lg hover:bg-surface-elevated transition-colors ml-1"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 核心元数据管理流 */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 text-xs">
        {/* 卡片 1：工件名称与星级一体化编辑 */}
        <div className="bg-surface-subtle p-3.5 rounded-xl border border-border flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted uppercase tracking-wider">
              <span>标本命名</span>
              <span className="text-muted font-mono text-[11px]">{artifact.meta.filename}</span>
            </div>
            <div className="relative">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={handleBlurRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleBlurRename();
                }}
                disabled={isRenaming}
                className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-sm text-main font-bold focus:border-status-info outline-none"
              />
              {isRenaming && (
                <div className="absolute right-2 top-2">
                  <Loader2 className="w-4 h-4 animate-spin text-status-info" />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted mr-1 font-medium">评级:</span>
              <div className="flex items-center text-amber-400 gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRatingClick(star)}
                    className="p-0.5 hover:scale-110 transition-transform outline-none"
                  >
                    <Star
                      className={`w-4 h-4 transition-colors ${
                        star <= (artifact.meta.rating || 0)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-muted/40 hover:text-amber-400'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-surface-elevated border border-border text-[10px] text-muted font-semibold">
              REV:{artifact.meta.currentRevision}
            </span>
          </div>
        </div>

        {/* 卡片 2：策展研判备忘 (Memo) */}
        <div className="bg-surface-subtle p-3.5 rounded-xl border border-border flex flex-col gap-2">
          <div className="flex items-center justify-between text-[10px] text-muted uppercase tracking-wider">
            <span>策展研判备忘 (Memo)</span>
            <span className="text-status-success font-semibold text-[10px]">失焦自动保存</span>
          </div>
          <textarea
            rows={3}
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onBlur={handleBlurDescription}
            placeholder="输入针对此标本的技术特性、渲染瓶颈或演化思路..."
            className="w-full bg-background border border-border p-2.5 rounded-lg text-xs text-main placeholder:text-muted outline-none focus:border-status-info resize-none leading-relaxed font-sans"
          />
        </div>

        {/* 卡片 3：体系化标签 (Tags) */}
        <div className="bg-surface-subtle p-3.5 rounded-xl border border-border flex flex-col gap-3">
          <div className="flex items-center justify-between text-[10px] text-muted uppercase tracking-wider">
            <span>体系化标签 (Tags)</span>
            <span className="text-muted">{artifact.meta.tags.length} 个已附加</span>
          </div>

          <div className="flex flex-wrap gap-1.5 min-h-[26px]">
            {artifact.meta.tags.map((rawTag) => {
              const parsed = TagQueryEngine.parseTag(rawTag);
              return (
                <span
                  key={rawTag}
                  className="inline-flex items-center gap-1 bg-surface-elevated px-2 py-1 rounded text-main border border-border text-[11px]"
                >
                  {parsed.namespace && <span className="text-muted">{parsed.namespace}:</span>}
                  <span className="font-medium">{parsed.value}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(rawTag)}
                    className="text-muted hover:text-status-error transition-colors ml-1 font-bold"
                    title="移除"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>

          <TagAutocompleteInput
            value={newTagInput}
            onChange={setNewTagInput}
            onSelectTag={handleSelectTag}
            allTags={allTags}
            placeholder="+ 添加标签 (选择或回车直接保存)"
            className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-xs text-main placeholder:text-muted outline-none focus:border-status-info font-mono"
          />
        </div>

        {/* 极简高频动作带 */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleCopySource}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border bg-surface-subtle hover:bg-surface-elevated text-main transition-colors text-xs"
            title="复制包含内联符印元数据的单文件 HTML 源码"
          >
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-status-success" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-status-info" />
            )}
            <span>{copiedCode ? '已复制' : '复制 HTML'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadSource}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-border bg-surface-subtle hover:bg-surface-elevated text-main transition-colors text-xs"
            title="直接下载 HTML 源文件到本地"
          >
            <Download className="w-3.5 h-3.5 text-muted" />
            <span>导出 HTML</span>
          </button>
        </div>

        {/* 历史版本记录摘要 */}
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <div className="text-[10px] text-muted uppercase tracking-wider flex items-center justify-between">
            <span>最近快照链</span>
            <span className="text-[10px] text-muted">{historyLedger.length} 个版本</span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-0.5">
            {historyLedger.slice(0, 5).map((h) => {
              const isHead = h.revision === artifact.meta.currentRevision;
              return (
                <div
                  key={h.revision}
                  className={`flex items-center justify-between p-2 rounded border border-border text-[11px] ${
                    isHead ? 'bg-surface-subtle text-main' : 'bg-transparent text-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-bold shrink-0 ${isHead ? 'text-status-info' : 'text-muted'}`}
                    >
                      REV:{h.revision}
                    </span>
                    <span className="truncate max-w-[190px] text-main">{h.message}</span>
                  </div>
                  <span className="text-[10px] text-muted shrink-0">
                    {isHead ? 'HEAD' : new Date(h.timestamp).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 抽屉底部安全销毁区 */}
      <footer className="h-12 border-t border-border px-5 flex items-center justify-between bg-surface shrink-0 text-xs">
        <span className="text-muted text-[11px]">物理文件同步受保护</span>
        <button
          type="button"
          onClick={handleDeleteArtifact}
          className="text-status-error hover:opacity-80 flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>删除</span>
        </button>
      </footer>
    </aside>
  );
};
