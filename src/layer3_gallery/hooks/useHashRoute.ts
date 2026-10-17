import { useCallback, useEffect, useState } from 'react';

export interface HashRouteState {
  type: 'gallery' | 'stage' | 'studio';
  filename: string | null;
}

export function parseHashRoute(hash: string): HashRouteState {
  const clean = hash.replace(/^#\/?/, '');
  const [route, ...rest] = clean.split('/');
  const encodedName = rest.join('/');
  if (encodedName) {
    try {
      const filename = decodeURIComponent(encodedName);
      if (route === 'stage') return { type: 'stage', filename };
      if (route === 'studio') return { type: 'studio', filename };
    } catch {
      // 容错处理
    }
  }
  return { type: 'gallery', filename: null };
}

export function useHashRoute() {
  const [stageFilename, setStageFilename] = useState<string | null>(null);
  const [studioFilename, setStudioFilename] = useState<string | null>(null);

  const syncFromHash = useCallback(() => {
    const route = parseHashRoute(window.location.hash);
    if (route.type === 'stage') {
      setStageFilename(route.filename);
      setStudioFilename(null);
    } else if (route.type === 'studio') {
      setStudioFilename(route.filename);
      setStageFilename(null);
    } else {
      setStageFilename(null);
      setStudioFilename(null);
    }
  }, []);

  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => {
      window.removeEventListener('hashchange', syncFromHash);
    };
  }, [syncFromHash]);

  const navigateToStage = useCallback((filename: string) => {
    window.location.hash = `#/stage/${encodeURIComponent(filename)}`;
  }, []);

  const navigateToStudio = useCallback((filename: string) => {
    window.location.hash = `#/studio/${encodeURIComponent(filename)}`;
  }, []);

  const navigateToGallery = useCallback(() => {
    if (window.location.hash) {
      window.location.hash = '';
    } else {
      setStageFilename(null);
      setStudioFilename(null);
    }
  }, []);

  return {
    stageFilename,
    studioFilename,
    setStageFilename,
    setStudioFilename,
    navigateToStage,
    navigateToStudio,
    navigateToGallery,
  };
}
