import { TagQueryEngine } from '@/core/engine/tag-engine';
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

/**
 * 判定工件是否处于未分类状态：
 * 1. 没有任何标签
 * 2. 显式带有包含“未分类”的标签
 * 3. 仅保留系统默认形态/新建占位标签，尚未添加具体领域或业务标签
 */
export function isArtifactUnclassified(tags: string[]): boolean {
  if (tags.length === 0) return true;
  if (tags.some((t) => t.toLowerCase().includes('未分类'))) return true;
  return tags.every((t) => t.startsWith('形态:') || t === '状态:新建');
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

  // 待定格（缺失封面）过滤状态
  const [filterNeedsPoster, setFilterNeedsPoster] = useState<boolean>(false);
  // 未分类（待归档打标）过滤状态
  const [filterUnclassified, setFilterUnclassified] = useState<boolean>(false);
  // 高分标本（>=4星）过滤状态
  const [filterHighScore, setFilterHighScore] = useState<boolean>(false);

  // 统计当前全局缺失海报封面的工件数
  const needsPosterCount = useMemo(() => {
    let count = 0;
    for (const a of artifacts) {
      if (!a.posterBlobUrl) count++;
    }
    return count;
  }, [artifacts]);

  // 统计当前全局未分类的工件数
  const unclassifiedCount = useMemo(() => {
    let count = 0;
    for (const a of artifacts) {
      if (isArtifactUnclassified(a.meta.tags)) count++;
    }
    return count;
  }, [artifacts]);

  // 统计高分工件数 (>=4星)
  const highScoreCount = useMemo(() => {
    let count = 0;
    for (const a of artifacts) {
      if ((a.meta.rating || 0) >= 4) count++;
    }
    return count;
  }, [artifacts]);

  // 1. 过滤匹配（同时支持标签搜索、名称/描述全文检索、快捷胶囊状态筛选叠加）
  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => {
      if (filterNeedsPoster && item.posterBlobUrl) {
        return false;
      }
      if (filterUnclassified && !isArtifactUnclassified(item.meta.tags)) {
        return false;
      }
      if (filterHighScore && (item.meta.rating || 0) < 4) {
        return false;
      }

      // 标签精准与排除过滤
      const tagMatched = TagQueryEngine.match(item.meta.tags, searchQuery);
      if (tagMatched) return true;

      // 综合描述与名称检索兜底
      const query = searchQuery.trim().toLowerCase();
      if (!query || query.startsWith('-')) return false;

      const nameMatched = item.meta.name.toLowerCase().includes(query);
      const descMatched = Boolean(item.meta.description?.toLowerCase().includes(query));
      return nameMatched || descMatched;
    });
  }, [artifacts, searchQuery, filterNeedsPoster, filterUnclassified, filterHighScore]);

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
    filterNeedsPoster,
    setFilterNeedsPoster,
    needsPosterCount,
    filterUnclassified,
    setFilterUnclassified,
    unclassifiedCount,
    filterHighScore,
    setFilterHighScore,
    highScoreCount,
    filteredArtifacts,
    sortedArtifacts,
    displayGroups,
    gridStyle,
    isCompactMode,
  };
}
