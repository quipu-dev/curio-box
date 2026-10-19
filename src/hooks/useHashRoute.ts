import { useCallback, useEffect, useState } from 'react';

export type RouteType = 'gallery' | 'stage' | 'studio' | 'inspect' | 'albums' | 'album-detail';

export interface HashRouteState {
  type: RouteType;
  filename: string | null;
  albumId: string | null;
}

export function parseHashRoute(hash: string): HashRouteState {
  const clean = hash.replace(/^#\/?/, '');
  const [route, ...rest] = clean.split('/');

  if (!route) {
    return { type: 'gallery', filename: null, albumId: null };
  }

  // 1. 画册路由空间: #/albums 或 #/albums/:albumId
  if (route === 'albums') {
    const rawAlbumId = rest[0];
    if (!rawAlbumId) {
      return { type: 'albums', filename: null, albumId: null };
    }

    try {
      const albumId = decodeURIComponent(rawAlbumId);
      const subAction = rest[1];
      // 支持画册上下文内的受限放映、暗房工作台与档案抽屉
      if ((subAction === 'stage' || subAction === 'studio' || subAction === 'inspect') && rest[2]) {
        return {
          type: subAction,
          albumId,
          filename: decodeURIComponent(rest.slice(2).join('/')),
        };
      }
      return { type: 'album-detail', albumId, filename: null };
    } catch {
      return { type: 'albums', filename: null, albumId: null };
    }
  }

  // 2. 标本工件全局路由空间
  const encodedName = rest.join('/');
  if (encodedName) {
    try {
      const filename = decodeURIComponent(encodedName);
      if (route === 'stage') return { type: 'stage', filename, albumId: null };
      if (route === 'studio') return { type: 'studio', filename, albumId: null };
      if (route === 'inspect') return { type: 'inspect', filename, albumId: null };
    } catch {
      // 容错处理
    }
  }

  return { type: 'gallery', filename: null, albumId: null };
}

export function useHashRoute() {
  const [currentRoute, setCurrentRoute] = useState<HashRouteState>(() => {
    if (typeof window === 'undefined') {
      return { type: 'gallery', filename: null, albumId: null };
    }
    return parseHashRoute(window.location.hash);
  });

  const syncFromHash = useCallback(() => {
    setCurrentRoute(parseHashRoute(window.location.hash));
  }, []);

  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [syncFromHash]);

  const navigateToStage = useCallback((filename: string, albumId?: string) => {
    if (albumId) {
      window.location.hash = `#/albums/${encodeURIComponent(albumId)}/stage/${encodeURIComponent(filename)}`;
    } else {
      window.location.hash = `#/stage/${encodeURIComponent(filename)}`;
    }
  }, []);

  const navigateToStudio = useCallback((filename: string, albumId?: string) => {
    if (albumId) {
      window.location.hash = `#/albums/${encodeURIComponent(albumId)}/studio/${encodeURIComponent(filename)}`;
    } else {
      window.location.hash = `#/studio/${encodeURIComponent(filename)}`;
    }
  }, []);

  const navigateToInspect = useCallback((filename: string, albumId?: string) => {
    if (albumId) {
      window.location.hash = `#/albums/${encodeURIComponent(albumId)}/inspect/${encodeURIComponent(filename)}`;
    } else {
      window.location.hash = `#/inspect/${encodeURIComponent(filename)}`;
    }
  }, []);

  const navigateToAlbums = useCallback(() => {
    window.location.hash = '#/albums';
  }, []);

  const navigateToAlbumDetail = useCallback((albumId: string) => {
    window.location.hash = `#/albums/${encodeURIComponent(albumId)}`;
  }, []);

  const navigateToGallery = useCallback(() => {
    if (window.location.hash) {
      window.location.hash = '';
    } else {
      setCurrentRoute({ type: 'gallery', filename: null, albumId: null });
    }
  }, []);

  return {
    currentRoute,
    stageFilename: currentRoute.type === 'stage' ? currentRoute.filename : null,
    studioFilename: currentRoute.type === 'studio' ? currentRoute.filename : null,
    inspectFilename: currentRoute.type === 'inspect' ? currentRoute.filename : null,
    activeAlbumId: currentRoute.albumId,
    navigateToStage,
    navigateToStudio,
    navigateToInspect,
    navigateToAlbums,
    navigateToAlbumDetail,
    navigateToGallery,
  };
}
