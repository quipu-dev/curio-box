import type { SortOption } from '@/features/gallery/hooks/useArtifactSortAndGroup';
import { ArrowDownUp, Camera, Star, Tag } from 'lucide-react';
import type React from 'react';

interface GallerySortBarProps {
  totalCount: number;
  matchedCount: number;
  hasDirectory: boolean;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterNeedsPoster: boolean;
  onToggleNeedsPoster: () => void;
  needsPosterCount: number;
  filterUnclassified: boolean;
  onToggleUnclassified: () => void;
  unclassifiedCount: number;
}

export const GallerySortBar: React.FC<GallerySortBarProps> = ({
  totalCount,
  matchedCount,
  hasDirectory,
  sortBy,
  onSortChange,
  filterNeedsPoster,
  onToggleNeedsPoster,
  needsPosterCount,
  filterUnclassified,
  onToggleUnclassified,
  unclassifiedCount,
}) => {
  return (
    <div className="mb-6 flex flex-wrap gap-3 justify-between items-center text-xs font-mono text-muted">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span>工件数：</span>
          <span className="text-main font-semibold">{matchedCount}</span>
          <span>/</span>
          <span>{totalCount}</span>
        </div>

        <div className="h-3 w-px bg-border mx-1" />

        {/* 智能快捷视图：待定格筛选胶囊 */}
        <button
          type="button"
          onClick={onToggleNeedsPoster}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors border ${
            filterNeedsPoster
              ? 'bg-status-warn-bg border-status-warn-border text-status-warn font-medium'
              : 'bg-surface border-border text-muted hover:text-main hover:border-zinc-600'
          }`}
          title={filterNeedsPoster ? '显示全部工件' : '仅显示未截取封面的待定格工件'}
        >
          <Camera className="w-3 h-3 text-status-warn" />
          <span>待定格</span>
          {needsPosterCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none ${
                filterNeedsPoster
                  ? 'bg-status-warn-bg text-status-warn'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {needsPosterCount}
            </span>
          )}
        </button>

        {/* 智能快捷视图：未分类筛选胶囊 */}
        <button
          type="button"
          onClick={onToggleUnclassified}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-colors border ${
            filterUnclassified
              ? 'bg-status-info-bg border-status-info-border text-status-info font-medium'
              : 'bg-surface border-border text-muted hover:text-main hover:border-zinc-600'
          }`}
          title={filterUnclassified ? '显示全部工件' : '仅显示待分类或未打标签的工件'}
        >
          <Tag className="w-3 h-3 text-status-info" />
          <span>未分类</span>
          {unclassifiedCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none ${
                filterUnclassified ? 'bg-sky-500/30 text-sky-200' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {unclassifiedCount}
            </span>
          )}
        </button>

        {!hasDirectory && (
          <span className="hidden sm:inline opacity-70">
            （当前为演示模式，可点击右上角关联本地目录）
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <ArrowDownUp className="w-3 h-3 text-status-info" />
          <span>排序：</span>
        </span>

        <div className="flex items-center bg-surface border border-border rounded overflow-hidden p-0.5">
          <button
            type="button"
            onClick={() => onSortChange('date-desc')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'date-desc'
                ? 'bg-accent text-accent-text font-medium'
                : 'text-muted hover:text-main'
            }`}
            title="按导入时间降序（最新导入优先）"
          >
            最新导入
          </button>

          <button
            type="button"
            onClick={() => onSortChange('date-asc')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'date-asc'
                ? 'bg-accent text-accent-text font-medium'
                : 'text-muted hover:text-main'
            }`}
            title="按导入时间升序（最早导入优先）"
          >
            最早导入
          </button>

          <button
            type="button"
            onClick={() => onSortChange('updated-desc')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'updated-desc'
                ? 'bg-accent text-accent-text font-medium'
                : 'text-muted hover:text-main'
            }`}
            title="按最后修改时间降序（最近活跃优先）"
          >
            最近修改
          </button>

          <button
            type="button"
            onClick={() => onSortChange('rating-desc')}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'rating-desc'
                ? 'bg-zinc-800 text-status-warn font-medium'
                : 'text-muted hover:text-main'
            }`}
            title="按评星降序（高分优先）"
          >
            <Star className="w-3 h-3 fill-current text-status-warn" />
            <span>评分最高</span>
          </button>

          <button
            type="button"
            onClick={() => onSortChange('name-asc')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'name-asc'
                ? 'bg-accent text-accent-text font-medium'
                : 'text-muted hover:text-main'
            }`}
            title="按名称拼音与字母排序"
          >
            名称 A-Z
          </button>
        </div>
      </div>
    </div>
  );
};
