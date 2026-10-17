import { ToastProvider, useToast } from '@/context/ToastContext';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { ArtifactComposerModal } from '@/layer3_gallery/components/ArtifactComposerModal';
import { ArtifactInspectorModal } from '@/layer3_gallery/components/ArtifactInspectorModal';
import { DarkroomStudio } from '@/layer3_gallery/components/DarkroomStudio';
import { FullscreenStage } from '@/layer3_gallery/components/FullscreenStage';
import { GallerySortBar } from '@/layer3_gallery/components/GallerySortBar';
import { Header } from '@/layer3_gallery/components/Header';
import { useArtifactSortAndGroup } from '@/layer3_gallery/hooks/useArtifactSortAndGroup';
import { useGlobalDropZone } from '@/layer3_gallery/hooks/useGlobalDropZone';
import { useHashRoute } from '@/layer3_gallery/hooks/useHashRoute';
import type { Artifact } from '@/types';
import { Calendar, Clock, Star, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

function MainApp() {
  const { toast } = useToast();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectingFilename, setInspectingFilename] = useState<string | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [composerInitialCode, setComposerInitialCode] = useState<string | null>(null);

  // Hash 路由挂载与同步
  const { stageFilename, studioFilename, navigateToStage, navigateToStudio, navigateToGallery } =
    useHashRoute();

  // 排序、过滤与聚合分组 Hooks
  const {
    sortBy,
    handleSortChange,
    gridCols,
    handleGridColsChange,
    sortedArtifacts,
    displayGroups,
    gridClass,
    isCompactMode,
  } = useArtifactSortAndGroup(artifacts, searchQuery);

  // 全局 HTML 拖拽加载
  const { isDragOver } = useGlobalDropZone({
    onHtmlDrop: (text, filename) => {
      setComposerInitialCode(text);
      toast.info(`已载入文件: ${filename}`);
    },
    onInvalidDrop: (msg) => toast.warn(msg),
  });

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // 全屏视口滚动条溢出防护
  useEffect(() => {
    const isOverlayActive = Boolean(
      stageFilename || studioFilename || inspectingFilename || composerInitialCode !== null,
    );
    if (isOverlayActive) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [stageFilename, studioFilename, inspectingFilename, composerInitialCode]);

  const loadArtifacts = useCallback(async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  }, []);

  // 自动尝试恢复已持久化的文件夹
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
        toast.success(`成功关联目录: ${handle.name}`);
      } else {
        toast.warn('当前浏览器环境不支持 File System Access API，请使用 Chrome/Edge。');
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        toast.error('选择目录失败');
      }
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const existingFilenames = useMemo(() => {
    return artifacts.map((a) => a.meta.filename);
  }, [artifacts]);

  const allKnownTags = useMemo(() => {
    const set = new Set<string>();
    for (const art of artifacts) {
      for (const t of art.meta.tags) {
        if (t.trim()) {
          set.add(t.trim());
        }
      }
    }
    return Array.from(set);
  }, [artifacts]);

  // 派生当前活动状态工件
  const stageArtifact = useMemo(
    () => artifacts.find((a) => a.meta.filename === stageFilename) ?? null,
    [artifacts, stageFilename],
  );
  const studioArtifact = useMemo(
    () => artifacts.find((a) => a.meta.filename === studioFilename) ?? null,
    [artifacts, studioFilename],
  );
  const inspectingArtifact = useMemo(
    () => artifacts.find((a) => a.meta.filename === inspectingFilename) ?? null,
    [artifacts, inspectingFilename],
  );

  // 进入暗房或档案检视器时按需异步读取源码
  useEffect(() => {
    const target = studioArtifact || inspectingArtifact;
    if (target && !target.sourceCode) {
      galleryStorage.loadArtifactSource(target.meta.filename).then((code) => {
        setArtifacts((prev) =>
          prev.map((item) =>
            item.meta.filename === target.meta.filename ? { ...item, sourceCode: code } : item,
          ),
        );
      });
    }
  }, [studioArtifact, inspectingArtifact]);

  const handleImportFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.warn('剪贴板为空，请先复制 HTML 或脚本代码');
        return;
      }
      const wrapped = TitleSanitizerEngine.wrapAsCompleteHtml(text);
      setComposerInitialCode(wrapped);
      toast.info('已从剪贴板载入代码草稿');
    } catch {
      toast.warn('无法直接读取剪贴板，已为您开启空白编辑器，请在代码区粘贴');
      setComposerInitialCode(TitleSanitizerEngine.wrapAsCompleteHtml('', '新建工件'));
    }
  };

  const handleOpenNewArtifact = () => {
    const defaultTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>新建工件</title>
  <style>
    body { margin: 0; background: #0a0a0f; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: monospace; }
  </style>
</head>
<body>
  <div>[ 工件准备就绪 ]</div>
  <script>
    console.log("Curio Sandbox Activated");
  </script>
</body>
</html>`;
    setComposerInitialCode(defaultTemplate);
  };

  const handleSaveComposerArtifact = async (data: {
    filename: string;
    content: string;
    name: string;
    tags: string[];
  }) => {
    const newArt = await galleryStorage.createArtifact(
      data.filename,
      data.content,
      data.name,
      data.tags,
    );

    setArtifacts((prev) => [
      newArt,
      ...prev.filter((a) => a.meta.filename !== newArt.meta.filename),
    ]);
  };

  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item)),
    );
  };

  const handleUpdateTags = async (filename: string, newTags: string[]) => {
    const updatedMeta = await galleryStorage.updateArtifactMeta(filename, { tags: newTags });
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === filename ? { ...item, meta: updatedMeta } : item)),
    );
  };

  const handleUpdateRating = async (filename: string, newRating: number) => {
    const updatedMeta = await galleryStorage.updateArtifactMeta(filename, { rating: newRating });
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === filename ? { ...item, meta: updatedMeta } : item)),
    );
  };

  const handleRenameArtifact = async (
    oldFilename: string,
    newFilename: string,
    newName: string,
  ) => {
    const newArt = await galleryStorage.renameArtifact(oldFilename, newFilename, newName);
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === oldFilename ? newArt : item)),
    );
    if (inspectingFilename === oldFilename) {
      setInspectingFilename(newFilename);
    }
    if (stageFilename === oldFilename) {
      window.location.hash = `#/stage/${encodeURIComponent(newFilename)}`;
    }
    if (studioFilename === oldFilename) {
      window.location.hash = `#/studio/${encodeURIComponent(newFilename)}`;
    }
  };

  const handleDeleteArtifact = async (filename: string) => {
    await galleryStorage.deleteArtifact(filename);
    setArtifacts((prev) => prev.filter((item) => item.meta.filename !== filename));
    if (inspectingFilename === filename) {
      setInspectingFilename(null);
    }
    if (stageFilename === filename || studioFilename === filename) {
      navigateToGallery();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPickDirectory={handlePickDirectory}
        onImportFromClipboard={handleImportFromClipboard}
        onOpenNewArtifactComposer={handleOpenNewArtifact}
        hasDirectory={hasDirectory}
        pendingDirectoryName={pendingHandle?.name}
        onRequestPendingPermission={handleRequestPendingPermission}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        allTags={allKnownTags}
        gridCols={gridCols}
        onGridColsChange={handleGridColsChange}
      />

      <main className="flex-1 p-6 md:p-8">
        <GallerySortBar
          totalCount={artifacts.length}
          matchedCount={sortedArtifacts.length}
          hasDirectory={hasDirectory}
          sortBy={sortBy}
          onSortChange={handleSortChange}
        />

        {displayGroups.length > 0 && displayGroups[0].items.length > 0 ? (
          <div className="flex flex-col gap-10">
            {displayGroups.map((group) => (
              <section key={group.key} className="flex flex-col gap-4">
                <div className="py-2 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold tracking-wide text-main">
                    {group.icon === 'star' ? (
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ) : group.icon === 'clock' ? (
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    <span>{group.key}</span>
                  </div>
                  <div className="text-[11px] font-mono text-muted">
                    {group.items.length} 件工件
                  </div>
                </div>

                <div className={gridClass}>
                  {group.items.map((artifact) => (
                    <ArtifactCard
                      key={artifact.meta.filename}
                      artifact={artifact}
                      compact={isCompactMode}
                      onOpenStage={(art) => navigateToStage(art.meta.filename)}
                      onOpenStudio={(art) => navigateToStudio(art.meta.filename)}
                      onOpenInspector={(art) => setInspectingFilename(art.meta.filename)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      {/* 活体全屏放映舞台 */}
      {stageArtifact && (
        <FullscreenStage
          artifact={stageArtifact}
          artifacts={sortedArtifacts}
          onClose={navigateToGallery}
          onNavigate={(filename) => navigateToStage(filename)}
          onOpenDarkroom={(art) => navigateToStudio(art.meta.filename)}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}

      {/* 独立全屏暗房工作台 */}
      {studioArtifact && (
        <DarkroomStudio
          artifact={studioArtifact}
          onBackToGallery={navigateToGallery}
          onOpenStage={(art) => navigateToStage(art.meta.filename)}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}

      {/* 标本档案与元数据检视模态框 */}
      {inspectingArtifact && (
        <ArtifactInspectorModal
          artifact={inspectingArtifact}
          onClose={() => setInspectingFilename(null)}
          onOpenStage={(art) => {
            setInspectingFilename(null);
            navigateToStage(art.meta.filename);
          }}
          onOpenStudio={(art) => {
            setInspectingFilename(null);
            navigateToStudio(art.meta.filename);
          }}
          onUpdateTags={handleUpdateTags}
          onUpdateRating={handleUpdateRating}
          onRename={handleRenameArtifact}
          onDelete={handleDeleteArtifact}
          existingFilenames={existingFilenames}
          allTags={allKnownTags}
        />
      )}

      {/* 工件装配台模态框 */}
      {composerInitialCode !== null && (
        <ArtifactComposerModal
          key={composerInitialCode.slice(0, 32)}
          initialCode={composerInitialCode}
          existingFilenames={existingFilenames}
          allTags={allKnownTags}
          onClose={() => setComposerInitialCode(null)}
          onSave={handleSaveComposerArtifact}
        />
      )}

      {/* 全局拖拽释放 HUD 视觉蒙层 */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-sky-950/80 backdrop-blur-md border-4 border-dashed border-sky-400 flex flex-col items-center justify-center gap-3 text-sky-200 pointer-events-none select-none animate-in fade-in">
          <UploadCloud className="w-16 h-16 text-sky-400 animate-bounce" />
          <div className="text-xl font-bold font-mono">释放以导入新工件</div>
          <div className="text-xs font-mono text-sky-300/80">
            支持任意 .html 文件，自动提取标题并进入编辑器
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  );
}

export default App;
