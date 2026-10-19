import type { CardSize, SortOption } from '@/features/gallery/hooks/useArtifactSortAndGroup';
import { Camera, Star, Tag } from 'lucide-react';
import type React from 'react';

interface GallerySortBarProps {
  totalCount: number;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  cardSize: CardSize;
  onCardSizeChange: (size: CardSize) => void;
  filterNeedsPoster: boolean;
  onToggleNeedsPoster: () => void;
  needsPosterCount: number;
  filterUnclassified: boolean;
  onToggleUnclassified: () => void;
  unclassifiedCount: number;
  filterHighScore: boolean;
  onToggleHighScore: () => void;
  highScoreCount: number;
  onResetFilters: () => void;
}

export const GallerySortBar: React.FC<GallerySortBarProps> = ({
  totalCount,
  sortBy,
  onSortChange,
  cardSize,
  onCardSizeChange,
  filterNeedsPoster,
  onToggleNeedsPoster,
  needsPosterCount,
  filterUnclassified,
  onToggleUnclassified,
  unclassifiedCount,
  filterHighScore,
  onToggleHighScore,
  highScoreCount,
  onResetFilters,
}) => {
  const isAllActive = !filterNeedsPoster && !filterUnclassified && !filterHighScore;

  return (
    <div className="px-6 py-2.5 border-b border-border bg-surface flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 select-none font-mono">
      {/* 快捷场景胶囊 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onResetFilters}
          className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-all ${
            isAllActive
              ? 'bg-status-info-bg border-status-info-border text-status-info font-semibold shadow-sm'
              : 'bg-surface-subtle hover:bg-surface-elevated border-border text-muted hover:text-main'
          }`}
          title="查看全部标本工件"
        >
          <span>全部工件</span>
          <span className="text-[10px] text-muted font-mono">{totalCount}</span>
        </button>

        <button
          type="button"
          onClick={onToggleHighScore}
          className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-all ${
            filterHighScore
              ? 'bg-status-warn-bg border-status-warn-border text-status-warn font-semibold shadow-sm'
              : 'bg-surface-subtle hover:bg-surface-elevated border-border text-muted hover:text-main'
          }`}
          title="筛选 4 星及以上精选高分标本"
        >
          <Star className="w-3 h-3 fill-amber-400 text-status-warn" />
          <span>高分标本</span>
          <span className="text-[10px] text-muted font-mono">{highScoreCount}</span>
        </button>

        <button
          type="button"
          onClick={onToggleNeedsPoster}
          className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-all ${
            filterNeedsPoster
              ? 'bg-status-warn-bg border-status-warn-border text-status-warn font-semibold shadow-sm'
              : 'bg-surface-subtle hover:bg-surface-elevated border-border text-muted hover:text-main'
          }`}
          title="仅显示未截取封面的待定格工件"
        >
          <Camera className="w-3 h-3 text-status-warn" />
          <span>待定格</span>
          {needsPosterCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none ${
                filterNeedsPoster
                  ? 'bg-status-warn text-surface font-bold'
                  : 'bg-surface-elevated text-status-warn border border-status-warn-border'
              }`}
            >
              {needsPosterCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleUnclassified}
          className={`px-2.5 py-1 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-all ${
            filterUnclassified
              ? 'bg-status-info-bg border-status-info-border text-status-info font-semibold shadow-sm'
              : 'bg-surface-subtle hover:bg-surface-elevated border-border text-muted hover:text-main'
          }`}
          title="仅显示未打详细领域标签的工件"
        >
          <Tag className="w-3 h-3 text-status-info" />
          <span>未分类</span>
          {unclassifiedCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono leading-none ${
                filterUnclassified
                  ? 'bg-status-info text-surface font-bold'
                  : 'bg-surface-elevated text-muted border border-border'
              }`}
            >
              {unclassifiedCount}
            </span>
          )}
        </button>
      </div>

      {/* 视图与排序开关组 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-muted font-mono text-[11px]">
          <span>排序:</span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="bg-surface-subtle border border-border rounded px-2.5 py-1 text-main outline-none hover:border-border-strong transition-colors cursor-pointer"
          >
            <option value="date-desc">最新创建优先</option>
            <option value="updated-desc">最近修改优先</option>
            <option value="rating-desc">评级星等最高</option>
            <option value="date-asc">最早创建优先</option>
            <option value="name-asc">工件名称 A-Z</option>
          </select>
        </div>

        <div className="h-3 w-px bg-border" />

        {/* 尺寸切换器 */}
        <div className="flex items-center bg-background border border-border rounded p-0.5">
          <button
            type="button"
            onClick={() => onCardSizeChange('sm')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              cardSize === 'sm'
                ? 'bg-surface-elevated text-main font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="紧凑密排模式"
          >
            密排
          </button>
          <button
            type="button"
            onClick={() => onCardSizeChange('md')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              cardSize === 'md'
                ? 'bg-surface-elevated text-main font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="标准尺寸模式"
          >
            标准
          </button>
          <button
            type="button"
            onClick={() => onCardSizeChange('lg')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              cardSize === 'lg'
                ? 'bg-surface-elevated text-main font-semibold shadow-sm'
                : 'text-muted hover:text-main'
            }`}
            title="全屏巨幕大卡片"
          >
            巨幕
          </button>
        </div>
      </div>
    </div>
  );
};
