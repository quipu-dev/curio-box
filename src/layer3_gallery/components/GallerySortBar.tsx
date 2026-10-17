import type { SortOption } from '@/layer3_gallery/hooks/useArtifactSortAndGroup';
import { ArrowDownUp, Star } from 'lucide-react';
import type React from 'react';

interface GallerySortBarProps {
  totalCount: number;
  matchedCount: number;
  hasDirectory: boolean;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export const GallerySortBar: React.FC<GallerySortBarProps> = ({
  totalCount,
  matchedCount,
  hasDirectory,
  sortBy,
  onSortChange,
}) => {
  return (
    <div className="mb-6 flex flex-wrap gap-3 justify-between items-center text-xs font-mono text-muted">
      <div className="flex items-center gap-2">
        <span>工件总数：</span>
        <span className="text-main font-semibold">{matchedCount}</span>
        <span>/</span>
        <span>{totalCount}</span>
        {!hasDirectory && (
          <span className="hidden sm:inline opacity-70">
            （当前为演示模式，可点击右上角关联本地目录）
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <ArrowDownUp className="w-3 h-3 text-sky-400" />
          <span>排序：</span>
        </span>

        <div className="flex items-center bg-surface border border-border rounded overflow-hidden p-0.5">
          <button
            type="button"
            onClick={() => onSortChange('date-desc')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'date-desc'
                ? 'bg-zinc-800 text-white font-medium'
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
                ? 'bg-zinc-800 text-white font-medium'
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
                ? 'bg-zinc-800 text-white font-medium'
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
                ? 'bg-zinc-800 text-amber-300 font-medium'
                : 'text-muted hover:text-main'
            }`}
            title="按评星降序（高分优先）"
          >
            <Star className="w-3 h-3 fill-current text-amber-400" />
            <span>评分最高</span>
          </button>

          <button
            type="button"
            onClick={() => onSortChange('name-asc')}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              sortBy === 'name-asc'
                ? 'bg-zinc-800 text-white font-medium'
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
