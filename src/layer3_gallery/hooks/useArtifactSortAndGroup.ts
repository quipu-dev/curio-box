import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import { useMemo, useState } from 'react';

export type SortOption = 'date-desc' | 'date-asc' | 'updated-desc' | 'rating-desc' | 'name-asc';
export type CardSize = 'sm' | 'md' | 'lg';

export interface DisplayGroup {
  key: string;
  icon: 'calendar' | 'clock' | 'star' | 'list';
  items: Artifact[];
}

export function formatTimelineGroupKey(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '更早归档';
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  } catch {
    return '更早归档';
  }
}

export function formatRatingGroupKey(rating?: number): string {
  if (!rating || rating <= 0) return '未评分工件';
  return `${rating} 星精选`;
}

export function useArtifactSortAndGroup(artifacts: Artifact[], searchQuery: string) {
  // 排序方式
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    if (typeof window === 'undefined') return 'date-desc';
    const saved = localStorage.getItem('curio_sort_by');
    return (saved as SortOption) || 'date-desc';
  });

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    try {
      localStorage.setItem('curio_sort_by', newSort);
    } catch {}
  };

  // 卡片尺寸模式：sm (紧凑: 210px) / md (标准: 280px) / lg (巨幕: 380px)
  const [cardSize, setCardSize] = useState<CardSize>(() => {
    if (typeof window === 'undefined') return 'md';
    const saved = localStorage.getItem('curio_card_size');
    if (saved === 'sm' || saved === 'md' || saved === 'lg') return saved;
    return 'md';
  });

  const handleCardSizeChange = (size: CardSize) => {
    setCardSize(size);
    try {
      localStorage.setItem('curio_card_size', size);
    } catch {}
  };

  // 1. 过滤匹配
  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

  // 2. 依据当前排序选项进行确定性排序
  const sortedArtifacts = useMemo(() => {
    const list = [...filteredArtifacts];
    list.sort((a, b) => {
      // 评分优先
      if (sortBy === 'rating-desc') {
        const ratingA = a.meta.rating || 0;
        const ratingB = b.meta.rating || 0;
        if (ratingB !== ratingA) {
          return ratingB - ratingA;
        }
        const timeA = new Date(a.meta.createdAt).getTime() || 0;
        const timeB = new Date(b.meta.createdAt).getTime() || 0;
        return timeB - timeA;
      }

      // 最近修改优先 (updatedAt)
      if (sortBy === 'updated-desc') {
        const timeA = new Date(a.meta.updatedAt).getTime() || 0;
        const timeB = new Date(b.meta.updatedAt).getTime() || 0;
        return timeB - timeA;
      }

      // 最早导入优先 (createdAt)
      if (sortBy === 'date-asc') {
        const timeA = new Date(a.meta.createdAt).getTime() || 0;
        const timeB = new Date(b.meta.createdAt).getTime() || 0;
        return timeA - timeB;
      }

      // 名称字典序
      if (sortBy === 'name-asc') {
        return a.meta.name.localeCompare(b.meta.name, 'zh-CN');
      }

      // 默认 date-desc: 最新导入优先 (createdAt)
      const timeA = new Date(a.meta.createdAt).getTime() || 0;
      const timeB = new Date(b.meta.createdAt).getTime() || 0;
      return timeB - timeA;
    });
    return list;
  }, [filteredArtifacts, sortBy]);

  // 3. 动态聚合分桶
  const displayGroups = useMemo(() => {
    const groups: DisplayGroup[] = [];
    const groupMap = new Map<string, Artifact[]>();

    if (sortBy === 'rating-desc') {
      for (const art of sortedArtifacts) {
        const key = formatRatingGroupKey(art.meta.rating);
        let list = groupMap.get(key);
        if (!list) {
          list = [];
          groupMap.set(key, list);
          groups.push({ key, icon: 'star', items: list });
        }
        list.push(art);
      }
      return groups;
    }

    if (sortBy === 'name-asc') {
      return [{ key: '所有工件 (名称排序)', icon: 'list', items: sortedArtifacts }];
    }

    if (sortBy === 'updated-desc') {
      for (const art of sortedArtifacts) {
        const key = formatTimelineGroupKey(art.meta.updatedAt);
        let list = groupMap.get(key);
        if (!list) {
          list = [];
          groupMap.set(key, list);
          groups.push({ key, icon: 'clock', items: list });
        }
        list.push(art);
      }
      return groups;
    }

    for (const art of sortedArtifacts) {
      const key = formatTimelineGroupKey(art.meta.createdAt);
      let list = groupMap.get(key);
      if (!list) {
        list = [];
        groupMap.set(key, list);
        groups.push({ key, icon: 'calendar', items: list });
      }
      list.push(art);
    }

    return groups;
  }, [sortedArtifacts, sortBy]);

  // 动态卡片最小宽度与网格样式（支持抽屉弹出时自动少排一列，卡片比例始终稳定）
  const gridStyle = useMemo(() => {
    const minWidth = cardSize === 'sm' ? 210 : cardSize === 'lg' ? 380 : 280;
    const gap = cardSize === 'sm' ? '12px' : cardSize === 'lg' ? '24px' : '16px';
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      gap,
    };
  }, [cardSize]);

  const isCompactMode = cardSize === 'sm';

  return {
    sortBy,
    handleSortChange,
    cardSize,
    handleCardSizeChange,
    filteredArtifacts,
    sortedArtifacts,
    displayGroups,
    gridStyle,
    isCompactMode,
  };
}
