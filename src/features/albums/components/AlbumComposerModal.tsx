import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import type { AlbumSortOption, AlbumType, Artifact, CreateAlbumInput } from '@/types';
import { BookOpen, Check, Layers, Sparkles, Star, X } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface AlbumComposerModalProps {
  artifacts: Artifact[];
  allTags?: string[];
  onClose: () => void;
  onSave: (albumData: CreateAlbumInput) => Promise<void>;
}

export const AlbumComposerModal: React.FC<AlbumComposerModalProps> = ({
  artifacts,
  allTags = [],
  onClose,
  onSave,
}) => {
  const [type, setType] = useState<AlbumType>('manual');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(5);
  const [query, setQuery] = useState('形态:webgl 物理:流体');
  const [sortBy, setSortBy] = useState<AlbumSortOption>('rating-desc');
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const toggleSelectArtifact = (id: string) => {
    setSelectedArtifactIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg('画册标题不能为空');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      if (type === 'manual') {
        await onSave({
          type: 'manual',
          title: trimmedTitle,
          description: description.trim() || undefined,
          rating,
          items: selectedArtifactIds.map((artifactId) => ({ artifactId })),
        });
      } else {
        await onSave({
          type: 'smart',
          title: trimmedTitle,
          description: description.trim() || undefined,
          rating,
          query: query.trim(),
          sortBy,
        });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`创建画册失败: ${msg}`);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface-overlay flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-main font-mono text-xs">
        {/* 顶部标题栏 */}
        <header className="h-14 bg-background border-b border-border px-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-status-info-bg border border-status-info-border text-status-info rounded">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm font-sans tracking-wide">新建策展画册</div>
              <div className="text-[11px] text-muted">
                将单体工件收纳成册，建立叙事脉络与专属放映
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted hover:text-main rounded hover:bg-border transition-colors"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* 表单内容 */}
        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[75vh]">
          {errorMsg && (
            <div className="bg-status-error-bg border border-status-error-border text-status-error px-3.5 py-2 rounded">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* 类型选择分段器 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase text-muted tracking-wider">画册类型</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType('manual')}
                className={`p-3 rounded-lg border border-border text-left flex flex-col gap-1 transition-all ${
                  type === 'manual'
                    ? 'border-sky-500 bg-status-info-bg text-main shadow-sm'
                    : 'border-border bg-background hover:bg-surface-subtle text-muted'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-status-info">
                  <Layers className="w-3.5 h-3.5" />
                  <span>手工策展画册 (Manual)</span>
                </div>
                <div className="text-[11px] font-sans leading-normal">
                  手动挑选特定标本并自由编排展示顺序，支持单独设定说明。
                </div>
              </button>

              <button
                type="button"
                onClick={() => setType('smart')}
                className={`p-3 rounded-lg border border-border text-left flex flex-col gap-1 transition-all ${
                  type === 'smart'
                    ? 'border-sky-500 bg-status-info-bg text-main shadow-sm'
                    : 'border-border bg-background hover:bg-surface-subtle text-muted'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-status-info">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>智能动态画册 (Smart)</span>
                </div>
                <div className="text-[11px] font-sans leading-normal">
                  基于标签查询表达式，未来导入的匹配工件将自动收录。
                </div>
              </button>
            </div>
          </div>

          {/* 标题输入 */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="album-title"
              className="text-[10px] uppercase text-muted tracking-wider"
            >
              画册标题 *
            </label>
            <input
              id="album-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：计算流体动力学专题、极简分形艺术..."
              className="bg-background border border-border px-3 py-2 rounded text-xs text-main outline-none focus:border-sky-400 font-sans"
            />
          </div>

          {/* 策展导言 */}
          <div className="flex flex-col gap-1">
            <label htmlFor="album-desc" className="text-[10px] uppercase text-muted tracking-wider">
              策展导言 / 专题备注 (选填)
            </label>
            <textarea
              id="album-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="记录本画册的审美线索、技术递进关系或实验目标..."
              className="bg-background border border-border p-2.5 rounded text-xs text-main outline-none focus:border-sky-400 font-sans resize-none"
            />
          </div>

          {/* 评级打星 */}
          <div className="flex items-center justify-between bg-background border border-border px-3 py-2 rounded">
            <span className="text-[10px] uppercase text-muted tracking-wider">画册评级</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRating(s)}
                  className="p-0.5 hover:scale-110 transition-transform outline-none"
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${
                      s <= rating ? 'fill-amber-400 text-status-warn' : 'text-muted'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* 条件渲染：手工模式下挑选初始工件 */}
          {type === 'manual' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-muted tracking-wider">
                  选择初始收纳标本 ({selectedArtifactIds.length} 件已选)
                </span>
                <span className="text-[10px] text-muted">可在画册内随时调序与追加</span>
              </div>

              <div className="bg-background border border-border rounded-lg p-2 max-h-48 overflow-y-auto flex flex-col gap-1">
                {artifacts.map((art) => {
                  const isSelected = selectedArtifactIds.includes(art.meta.id);
                  return (
                    <button
                      key={art.meta.id}
                      type="button"
                      onClick={() => toggleSelectArtifact(art.meta.id)}
                      className={`flex items-center justify-between p-2 rounded text-left transition-colors ${
                        isSelected
                          ? 'bg-status-info-bg text-status-info border border-status-info-border'
                          : 'hover:bg-surface-subtle text-muted hover:text-main'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-sky-500 border-sky-500 text-black'
                              : 'border-border bg-surface'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate font-sans font-medium text-xs">
                          {art.meta.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted shrink-0">
                        REV:{art.meta.currentRevision}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 条件渲染：智能模式下配置 Query 与推荐排序 */
            <div className="flex flex-col gap-3 bg-background border border-border p-3.5 rounded-lg">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="smart-query"
                  className="text-[10px] uppercase text-muted tracking-wider"
                >
                  智能标签规则 (Tag Query DSL)
                </label>
                <TagAutocompleteInput
                  id="smart-query"
                  value={query}
                  onChange={setQuery}
                  allTags={allTags}
                  placeholder="例如：形态:webgl 物理:流体 -状态:废弃"
                  className="w-full bg-surface border border-border px-2.5 py-1.5 rounded text-xs text-main outline-none focus:border-sky-400"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-muted tracking-wider">智能排序</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as AlbumSortOption)}
                  className="bg-surface border border-border text-main px-2 py-1 rounded text-xs outline-none"
                >
                  <option value="rating-desc">评分最高优先</option>
                  <option value="date-desc">最新导入优先</option>
                  <option value="date-asc">最早导入优先</option>
                  <option value="updated-desc">最近活跃优先</option>
                  <option value="name-asc">名称 A-Z</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮栏 */}
        <footer className="h-14 bg-background border-t border-border px-5 flex justify-end items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-border rounded text-muted hover:text-main text-xs"
          >
            取消
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="bg-main text-surface px-5 py-1.5 rounded font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isSubmitting ? '正在创建...' : '完成并创建画册'}
          </button>
        </footer>
      </div>
    </div>
  );
};
