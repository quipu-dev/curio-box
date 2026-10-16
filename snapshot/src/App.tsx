import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { DarkroomStudio } from '@/layer3_gallery/components/DarkroomStudio';
import { FullscreenStage } from '@/layer3_gallery/components/FullscreenStage';
import { Header } from '@/layer3_gallery/components/Header';
import type { Artifact } from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 网页全屏展演中的工件
  const [stageArtifact, setStageArtifact] = useState<Artifact | null>(null);
  // 独立暗房工作台中的工件
  const [studioArtifact, setStudioArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const loadArtifacts = useCallback(async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  }, []);

  // 页面启动时自动尝试恢复已持久化的文件夹
  useEffect(() => {
    let isCancelled = false;
    async function restoreDirectory() {
      const result = await galleryStorage.restoreSavedHandle();
      if (isCancelled) return;

      if (result.permission === 'granted' && result.handle) {
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifacts();
      } else if (result.handle) {
        setPendingHandle(result.handle);
        await loadArtifacts();
      } else {
        await loadArtifacts();
      }
    }

    restoreDirectory();
    return () => {
      isCancelled = true;
    };
  }, [loadArtifacts]);

  // 恢复待授权目录的用户手势处理
  const handleRequestPendingPermission = async () => {
    if (!pendingHandle) return;
    try {
      const perm = await (
        pendingHandle as unknown as {
          requestPermission: (opt: { mode: string }) => Promise<PermissionState>;
        }
      ).requestPermission({ mode: 'readwrite' });

      if (perm === 'granted') {
        galleryStorage.setDirectoryHandle(pendingHandle);
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifacts();
      }
    } catch (err) {
      console.error('授权目录失败:', err);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const fsaWindow = window as unknown as WindowWithFSA;
      if (typeof fsaWindow.showDirectoryPicker === 'function') {
        const handle = await fsaWindow.showDirectoryPicker();
        galleryStorage.setDirectoryHandle(handle);
        setHasDirectory(true);
        await loadArtifacts();
      } else {
        alert('当前浏览器环境不支持 File System Access API，请使用 Chrome/Edge 等现代浏览器。');
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        console.error('选择目录失败:', err);
      }
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item)),
    );
    if (stageArtifact?.meta.filename === updated.meta.filename) {
      setStageArtifact(updated);
    }
    if (studioArtifact?.meta.filename === updated.meta.filename) {
      setStudioArtifact(updated);
    }
  };

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPickDirectory={handlePickDirectory}
        hasDirectory={hasDirectory}
        pendingDirectoryName={pendingHandle?.name}
        onRequestPendingPermission={handleRequestPendingPermission}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 p-6 md:p-8">
        <div className="mb-6 flex justify-between items-center text-xs font-mono text-muted">
          <div>
            陈列展品总数：
            <span className="text-main font-semibold">{filteredArtifacts.length}</span> /{' '}
            {artifacts.length}
          </div>
          {!hasDirectory && <div>（当前处于内置演示库模式，可点击右上角载入本地工件目录）</div>}
        </div>

        {filteredArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.meta.filename}
                artifact={artifact}
                onOpenStage={(art) => setStageArtifact(art)}
                onOpenStudio={(art) => setStudioArtifact(art)}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改大众分类筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      {/* 活体全屏放映舞台 (Fullscreen Stage) */}
      <FullscreenStage
        artifact={stageArtifact}
        onClose={() => setStageArtifact(null)}
        onOpenDarkroom={(art) => {
          setStageArtifact(null);
          setStudioArtifact(art);
        }}
        onUpdateArtifact={handleUpdateArtifact}
      />

      {/* 独立全屏暗房工作台 (Darkroom Studio) */}
      <DarkroomStudio
        artifact={studioArtifact}
        onBackToGallery={() => setStudioArtifact(null)}
        onOpenStage={(art) => {
          setStudioArtifact(null);
          setStageArtifact(art);
        }}
        onUpdateArtifact={handleUpdateArtifact}
      />
    </div>
  );
}

export default App;