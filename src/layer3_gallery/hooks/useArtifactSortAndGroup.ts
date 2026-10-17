import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import { useMemo, useState } from 'react';

export type SortOption = 'date-desc' | 'date-asc' | 'updated-desc' | 'rating-desc' | 'name-asc';

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

  // 网格列数 (2 ~ 6)
  const [gridCols, setGridCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 4;
    const saved = localStorage.getItem('curio_grid_cols');
    return saved ? Number.parseInt(saved, 10) : 4;
  });

  const handleGridColsChange = (cols: number) => {
    setGridCols(cols);
    try {
      localStorage.setItem('curio_grid_cols', cols.toString());
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

  // 动态网格类名计算
  const gridClass = useMemo(() => {
    switch (gridCols) {
      case 2:
        return 'grid grid-cols-1 sm:grid-cols-2 gap-6';
      case 3:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5';
      case 4:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
      case 5:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4';
      case 6:
        return 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3';
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
    }
  }, [gridCols]);

  const isCompactMode = gridCols >= 5;

  return {
    sortBy,
    handleSortChange,
    gridCols,
    handleGridColsChange,
    filteredArtifacts,
    sortedArtifacts,
    displayGroups,
    gridClass,
    isCompactMode,
  };
}
