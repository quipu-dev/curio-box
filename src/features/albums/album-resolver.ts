import { TagQueryEngine } from '@/core/engine/tag-engine';
import type { Album, AlbumMeta, AlbumSortOption, Artifact } from '@/types';

/**
 * 依据画册定义与工件库解析其所属工件列表
 * - 手工画册 (manual)：严格按 items 中的 artifactId 有序排列，自动剔除已被物理删除的失效工件
 * - 智能画册 (smart)：利用 TagQueryEngine 进行动态标签表达式匹配，并按指定规则排序
 */
export function resolveAlbumArtifacts(album: AlbumMeta, allArtifacts: Artifact[]): Artifact[] {
  if (album.type === 'manual') {
    const artifactMap = new Map<string, Artifact>();
    for (const art of allArtifacts) {
      artifactMap.set(art.meta.id, art);
    }

    const resolved: Artifact[] = [];
    for (const item of album.items) {
      const matched = artifactMap.get(item.artifactId);
      if (matched) {
        resolved.push(matched);
      }
    }
    return resolved;
  }

  // 智能画册基于 Tag Query 进行过滤
  const matched = allArtifacts.filter((item) => {
    return TagQueryEngine.match(item.meta.tags, album.query || '');
  });

  return sortArtifacts(matched, album.sortBy || 'rating-desc');
}

/**
 * 智能画册或自定义排序排序辅助函数
 */
export function sortArtifacts(artifacts: Artifact[], sortBy: AlbumSortOption): Artifact[] {
  const list = [...artifacts];
  list.sort((a, b) => {
    if (sortBy === 'rating-desc') {
      const rA = a.meta.rating || 0;
      const rB = b.meta.rating || 0;
      if (rB !== rA) return rB - rA;
      return new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime();
    }
    if (sortBy === 'updated-desc') {
      return new Date(b.meta.updatedAt).getTime() - new Date(a.meta.updatedAt).getTime();
    }
    if (sortBy === 'date-asc') {
      return new Date(a.meta.createdAt).getTime() - new Date(b.meta.createdAt).getTime();
    }
    if (sortBy === 'name-asc') {
      return a.meta.name.localeCompare(b.meta.name, 'zh-CN');
    }
    // 默认 date-desc
    return new Date(b.meta.createdAt).getTime() - new Date(a.meta.createdAt).getTime();
  });
  return list;
}

/**
 * 封面智能推导纯函数 (Cover Heuristics Pipeline)
 * 优先级：
 * 1. manual 模式下用户显式指定的 customCoverArtifactId 封面
 * 2. 画册内评分最高且拥有 posterBlobUrl 的工件
 * 3. 画册内首个拥有 posterBlobUrl 的工件
 * 4. undefined（由 UI 呈现几何网格渐变兜底图）
 */
export function resolveAlbumCover(
  album: AlbumMeta,
  resolvedArtifacts: Artifact[],
): string | undefined {
  if (resolvedArtifacts.length === 0) {
    return undefined;
  }

  // 1. 用户手动指定的封面工件
  if (album.type === 'manual' && album.customCoverArtifactId) {
    const specified = resolvedArtifacts.find((a) => a.meta.id === album.customCoverArtifactId);
    if (specified?.posterBlobUrl) {
      return specified.posterBlobUrl;
    }
  }

  // 2. 寻找评分最高且有封面的工件
  let highestRatingCover: { rating: number; url: string } | null = null;
  for (const art of resolvedArtifacts) {
    if (art.posterBlobUrl) {
      const rating = art.meta.rating || 0;
      if (!highestRatingCover || rating > highestRatingCover.rating) {
        highestRatingCover = { rating, url: art.posterBlobUrl };
      }
    }
  }

  if (highestRatingCover && highestRatingCover.rating > 0) {
    return highestRatingCover.url;
  }

  // 3. 回退为首个有封面的工件
  const firstWithPoster = resolvedArtifacts.find((a) => Boolean(a.posterBlobUrl));
  return firstWithPoster?.posterBlobUrl;
}

/**
 * 计算单个画册的综合包装视图对象
 */
export function buildAlbumView(album: AlbumMeta, allArtifacts: Artifact[]): Album {
  const resolved = resolveAlbumArtifacts(album, allArtifacts);
  const coverBlobUrl = resolveAlbumCover(album, resolved);
  return {
    meta: album,
    coverBlobUrl,
    artifactCount: resolved.length,
  };
}
