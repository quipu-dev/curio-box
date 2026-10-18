import { useCallback, useEffect, useState } from 'react';

export interface HashRouteState {
  type: 'gallery' | 'stage' | 'studio' | 'inspect';
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
      if (route === 'inspect') return { type: 'inspect', filename };
    } catch {
      // 容错处理
    }
  }
  return { type: 'gallery', filename: null };
}

export function useHashRoute() {
  const [stageFilename, setStageFilename] = useState<string | null>(null);
  const [studioFilename, setStudioFilename] = useState<string | null>(null);
  const [inspectFilename, setInspectFilename] = useState<string | null>(null);

  const syncFromHash = useCallback(() => {
    const route = parseHashRoute(window.location.hash);
    if (route.type === 'stage') {
      setStageFilename(route.filename);
      setStudioFilename(null);
      setInspectFilename(null);
    } else if (route.type === 'studio') {
      setStudioFilename(route.filename);
      setStageFilename(null);
      setInspectFilename(null);
    } else if (route.type === 'inspect') {
      setInspectFilename(route.filename);
      setStageFilename(null);
      setStudioFilename(null);
    } else {
      setStageFilename(null);
      setStudioFilename(null);
      setInspectFilename(null);
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

  const navigateToInspect = useCallback((filename: string) => {
    window.location.hash = `#/inspect/${encodeURIComponent(filename)}`;
  }, []);

  const navigateToGallery = useCallback(() => {
    if (window.location.hash) {
      window.location.hash = '';
    } else {
      setStageFilename(null);
      setStudioFilename(null);
      setInspectFilename(null);
    }
  }, []);

  return {
    stageFilename,
    studioFilename,
    inspectFilename,
    setStageFilename,
    setStudioFilename,
    setInspectFilename,
    navigateToStage,
    navigateToStudio,
    navigateToInspect,
    navigateToGallery,
  };
}
