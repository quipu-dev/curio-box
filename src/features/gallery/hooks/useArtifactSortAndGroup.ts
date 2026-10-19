import { useSettings } from '@/context/SettingsContext';
import { TagQueryEngine } from '@/core/engine/tag-engine';
import type { Artifact } from '@/types';
import {
  getArtifactDayKey,
  getArtifactFirstLetterKey,
  getArtifactRatingKey,
} from '@/utils/grouping';
import { useMemo, useState } from 'react';

export type SortOption = 'date-desc' | 'date-asc' | 'updated-desc' | 'rating-desc' | 'name-asc';
export type CardSize = 'sm' | 'md' | 'lg';

export interface DisplayGroup {
  key: string;
  icon: 'calendar' | 'clock' | 'star' | 'type' | 'list';
  badge?: string;
  items: Artifact[];
}

/**
 * 判定工件是否处于未分类状态
 */
export function isArtifactUnclassified(tags: string[]): boolean {
  if (tags.length === 0) return true;
  if (tags.some((t) => t.toLowerCase().includes('未分类'))) return true;
  return tags.every((t) => t.startsWith('形态:') || t === '状态:新建');
}

export function useArtifactSortAndGroup(artifacts: Artifact[], searchQuery: string) {
  const { settings } = useSettings();
  const { enableGrouping } = settings;

  // 排序方式持久化
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

  // 卡片尺寸模式
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

  // 快捷过滤器状态
  const [filterNeedsPoster, setFilterNeedsPoster] = useState<boolean>(false);
  const [filterUnclassified, setFilterUnclassified] = useState<boolean>(false);
  const [filterHighScore, setFilterHighScore] = useState<boolean>(false);

  // 统计指标
  const needsPosterCount = useMemo(() => {
    let count = 0;
    for (const a of artifacts) {
      if (!a.posterBlobUrl) count++;
    }
    return count;
  }, [artifacts]);

  const unclassifiedCount = useMemo(() => {
    let count = 0;
    for (const a of artifacts) {
      if (isArtifactUnclassified(a.meta.tags)) count++;
    }
    return count;
  }, [artifacts]);

  const highScoreCount = useMemo(() => {
    let count = 0;
    for (const a of artifacts) {
      if ((a.meta.rating || 0) >= 4) count++;
    }
    return count;
  }, [artifacts]);

  // 1. 过滤匹配
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

  // 2. 排序运算
  const sortedArtifacts = useMemo(() => {
    const list = [...filteredArtifacts];
    list.sort((a, b) => {
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

      if (sortBy === 'updated-desc') {
        const timeA = new Date(a.meta.updatedAt).getTime() || 0;
        const timeB = new Date(b.meta.updatedAt).getTime() || 0;
        return timeB - timeA;
      }

      if (sortBy === 'date-asc') {
        const timeA = new Date(a.meta.createdAt).getTime() || 0;
        const timeB = new Date(b.meta.createdAt).getTime() || 0;
        return timeA - timeB;
      }

      if (sortBy === 'name-asc') {
        return a.meta.name.localeCompare(b.meta.name, 'zh-CN');
      }

      // 默认 date-desc: 最新导入优先
      const timeA = new Date(a.meta.createdAt).getTime() || 0;
      const timeB = new Date(b.meta.createdAt).getTime() || 0;
      return timeB - timeA;
    });
    return list;
  }, [filteredArtifacts, sortBy]);

  // 3. 根据用户选中的 sortBy 自动感知并派发分组策略
  const displayGroups = useMemo(() => {
    if (!enableGrouping) {
      return [];
    }

    const groups: DisplayGroup[] = [];
    const groupMap = new Map<string, Artifact[]>();

    // 场景 A：评分排序 -> 自动按星级分组
    if (sortBy === 'rating-desc') {
      for (const art of sortedArtifacts) {
        const key = getArtifactRatingKey(art.meta.rating);
        let list = groupMap.get(key);
        if (!list) {
          list = [];
          groupMap.set(key, list);
          groups.push({
            key,
            icon: 'star',
            items: list,
          });
        }
        list.push(art);
      }

      const ratingWeight = (key: string) => {
        if (key.includes('5')) return 5;
        if (key.includes('4')) return 4;
        if (key.includes('3')) return 3;
        if (key.includes('2')) return 2;
        if (key.includes('1')) return 1;
        return 0;
      };
      groups.sort((a, b) => ratingWeight(b.key) - ratingWeight(a.key));
      return groups;
    }

    // 场景 B：名称排序 -> 自动按首字（拼音首字母/字符）分组
    if (sortBy === 'name-asc') {
      for (const art of sortedArtifacts) {
        const key = getArtifactFirstLetterKey(art.meta.name);
        let list = groupMap.get(key);
        if (!list) {
          list = [];
          groupMap.set(key, list);
          groups.push({
            key,
            icon: 'type',
            items: list,
          });
        }
        list.push(art);
      }

      // A-Z -> 0-9 -> #
      groups.sort((a, b) => {
        if (a.key === '#') return 1;
        if (b.key === '#') return -1;
        return a.key.localeCompare(b.key);
      });
      return groups;
    }

    // 场景 C：时间排序 (date-desc / date-asc / updated-desc) -> 自动按精确到日分组
    const useUpdated = sortBy === 'updated-desc';
    for (const art of sortedArtifacts) {
      const key = getArtifactDayKey(art, useUpdated);
      let list = groupMap.get(key);
      if (!list) {
        list = [];
        groupMap.set(key, list);
        groups.push({
          key,
          icon: useUpdated ? 'clock' : 'calendar',
          items: list,
        });
      }
      list.push(art);
    }

    if (sortBy === 'date-asc') {
      groups.sort((a, b) => a.key.localeCompare(b.key));
    } else {
      groups.sort((a, b) => b.key.localeCompare(a.key));
    }

    return groups;
  }, [sortedArtifacts, enableGrouping, sortBy]);

  const gridStyle = useMemo(() => {
    const cardWidth = cardSize === 'sm' ? 220 : cardSize === 'lg' ? 380 : 280;
    const gap = cardSize === 'sm' ? '12px' : cardSize === 'lg' ? '24px' : '16px';
    return {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardWidth}px), ${cardWidth}px))`,
      gap,
    };
  }, [cardSize]);

  const isCompactMode = cardSize === 'sm';

  return {
    enableGrouping,
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
    sortedArtifacts,
    displayGroups,
    gridStyle,
    isCompactMode,
  };
}
