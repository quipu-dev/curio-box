import { Header } from '@/components/common/Header';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import { TitleSanitizerEngine } from '@/core/engine/title-sanitizer';
import { AlbumComposerModal } from '@/features/albums/components/AlbumComposerModal';
import { AlbumDetailView } from '@/features/albums/components/AlbumDetailView';
import { AlbumsView } from '@/features/albums/components/AlbumsView';
import { ArtifactCard } from '@/features/gallery/components/ArtifactCard';
import { ArtifactComposerModal } from '@/features/gallery/components/ArtifactComposerModal';
import { GallerySortBar } from '@/features/gallery/components/GallerySortBar';
import { useArtifactSortAndGroup } from '@/features/gallery/hooks/useArtifactSortAndGroup';
import { useGlobalDropZone } from '@/features/gallery/hooks/useGlobalDropZone';
import { useWorkspaceSync } from '@/features/gallery/hooks/useWorkspaceSync';
import { ArtifactInspectorDrawer } from '@/features/inspector/ArtifactInspectorDrawer';
import { FullscreenStage } from '@/features/stage/FullscreenStage';
import { DarkroomStudio } from '@/features/studio/DarkroomStudio';
import { useHashRoute } from '@/hooks/useHashRoute';
import { Calendar, Clock, Star, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

function MainApp() {
  const { toast } = useToast();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [composerInitialCode, setComposerInitialCode] = useState<string | null>(null);
  const [isAlbumComposerOpen, setIsAlbumComposerOpen] = useState<boolean>(false);

  const {
    currentRoute,
    stageFilename,
    studioFilename,
    inspectFilename,
    activeAlbumId,
    navigateToStage,
    navigateToStudio,
    navigateToInspect,
    navigateToAlbums,
    navigateToAlbumDetail,
    navigateToGallery,
  } = useHashRoute();

  const {
    artifacts,
    hasDirectory,
    pendingHandle,
    activeAlbumMeta,
    activeAlbumArtifacts,
    existingFilenames,
    allKnownTags,
    albumViews,
    handlePickDirectory,
    handleRequestPendingPermission,
    handleSaveComposerArtifact,
    handleUpdateArtifact,
    handleUpdateTags,
    handleUpdateRating,
    handleUpdateDescription,
    handleRenameArtifact,
    handleDeleteArtifact,
    handleCreateAlbum,
    handleSaveAlbum,
    handleDeleteAlbum,
  } = useWorkspaceSync(activeAlbumId);

  const isAlbumsView =
    currentRoute.type === 'albums' ||
    currentRoute.type === 'album-detail' ||
    activeAlbumId !== null;

  const isAlbumDetailView = Boolean(activeAlbumId && activeAlbumMeta);
  const inspectingFilename = inspectFilename;

  const {
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
    sortedArtifacts,
    displayGroups,
    gridStyle,
    isCompactMode,
  } = useArtifactSortAndGroup(artifacts, searchQuery);

  const { isDragOver } = useGlobalDropZone({
    onHtmlDrop: (text, filename) => {
      setComposerInitialCode(text);
      toast.info(`已载入文件: ${filename}`);
    },
    onInvalidDrop: (msg) => toast.warn(msg),
  });

  useEffect(() => {
    const isOverlayActive = Boolean(
      stageFilename || studioFilename || composerInitialCode !== null || isAlbumComposerOpen,
    );
    if (isOverlayActive) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [stageFilename, studioFilename, composerInitialCode, isAlbumComposerOpen]);

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

  const contextArtifacts = useMemo(() => {
    return activeAlbumMeta ? activeAlbumArtifacts : sortedArtifacts;
  }, [activeAlbumMeta, activeAlbumArtifacts, sortedArtifacts]);

  const inspectingIndex = useMemo(() => {
    if (!inspectingFilename) return -1;
    return contextArtifacts.findIndex((a) => a.meta.filename === inspectingFilename);
  }, [contextArtifacts, inspectingFilename]);

  const hasPrevInspector = inspectingIndex > 0;
  const hasNextInspector = inspectingIndex !== -1 && inspectingIndex < contextArtifacts.length - 1;

  const handlePrevInspector = useCallback(() => {
    if (hasPrevInspector) {
      navigateToInspect(
        contextArtifacts[inspectingIndex - 1].meta.filename,
        activeAlbumId ?? undefined,
      );
    }
  }, [hasPrevInspector, contextArtifacts, inspectingIndex, navigateToInspect, activeAlbumId]);

  const handleNextInspector = useCallback(() => {
    if (hasNextInspector) {
      navigateToInspect(
        contextArtifacts[inspectingIndex + 1].meta.filename,
        activeAlbumId ?? undefined,
      );
    }
  }, [hasNextInspector, contextArtifacts, inspectingIndex, navigateToInspect, activeAlbumId]);

  useEffect(() => {
    if (!inspectingFilename) return;
    const rafId = requestAnimationFrame(() => {
      const targetEl = document.querySelector(
        `[data-artifact-filename="${CSS.escape(inspectingFilename)}"]`,
      );
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [inspectingFilename]);

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

  const onRename = async (oldFilename: string, newFilename: string, newName: string) => {
    await handleRenameArtifact(oldFilename, newFilename, newName);
    if (inspectingFilename === oldFilename) {
      navigateToInspect(newFilename, activeAlbumId ?? undefined);
    }
    if (stageFilename === oldFilename) {
      navigateToStage(newFilename, activeAlbumId ?? undefined);
    }
    if (studioFilename === oldFilename) {
      navigateToStudio(newFilename, activeAlbumId ?? undefined);
    }
  };

  const onDelete = async (filename: string) => {
    await handleDeleteArtifact(filename);
    if (
      inspectingFilename === filename ||
      stageFilename === filename ||
      studioFilename === filename
    ) {
      if (activeAlbumId) {
        navigateToAlbumDetail(activeAlbumId);
      } else {
        navigateToGallery();
      }
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-main overflow-hidden relative">
      <div
        className={`flex-1 min-h-0 flex flex-col overflow-hidden transition-[margin] duration-200 ease-out ${
          inspectingFilename ? 'sm:mr-[480px]' : ''
        }`}
      >
        <Header
          currentView={isAlbumsView ? 'albums' : 'specimens'}
          onSwitchView={(view) => {
            if (view === 'albums') {
              navigateToAlbums();
            } else {
              navigateToGallery();
            }
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onPickDirectory={handlePickDirectory}
          onImportFromClipboard={handleImportFromClipboard}
          onOpenNewArtifactComposer={handleOpenNewArtifact}
          onOpenNewAlbumComposer={() => setIsAlbumComposerOpen(true)}
          hasDirectory={hasDirectory}
          pendingDirectoryName={pendingHandle?.name}
          onRequestPendingPermission={handleRequestPendingPermission}
          resolvedTheme={resolvedTheme}
          onToggleTheme={toggleTheme}
          allTags={allKnownTags}
          cardSize={cardSize}
          onCardSizeChange={handleCardSizeChange}
        />

        <main className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 overscroll-contain">
          {isAlbumDetailView && activeAlbumMeta ? (
            <AlbumDetailView
              album={activeAlbumMeta}
              allArtifacts={artifacts}
              allTags={allKnownTags}
              inspectingFilename={inspectingFilename}
              onBackToAlbums={navigateToAlbums}
              onSaveAlbum={handleSaveAlbum}
              onDeleteAlbum={handleDeleteAlbum}
              onOpenStage={(fn) => navigateToStage(fn, activeAlbumMeta.id)}
              onOpenStudio={(art) => navigateToStudio(art.meta.filename, activeAlbumMeta.id)}
              onOpenInspector={(art) =>
                inspectingFilename === art.meta.filename
                  ? navigateToAlbumDetail(activeAlbumMeta.id)
                  : navigateToInspect(art.meta.filename, activeAlbumMeta.id)
              }
            />
          ) : isAlbumsView ? (
            <AlbumsView
              albums={albumViews}
              searchQuery={searchQuery}
              onOpenAlbumDetail={navigateToAlbumDetail}
              onOpenCreateModal={() => setIsAlbumComposerOpen(true)}
            />
          ) : (
            <>
              <GallerySortBar
                totalCount={artifacts.length}
                matchedCount={sortedArtifacts.length}
                hasDirectory={hasDirectory}
                sortBy={sortBy}
                onSortChange={handleSortChange}
                filterNeedsPoster={filterNeedsPoster}
                onToggleNeedsPoster={() => setFilterNeedsPoster((prev) => !prev)}
                needsPosterCount={needsPosterCount}
                filterUnclassified={filterUnclassified}
                onToggleUnclassified={() => setFilterUnclassified((prev) => !prev)}
                unclassifiedCount={unclassifiedCount}
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

                      <div style={gridStyle}>
                        {group.items.map((artifact) => (
                          <ArtifactCard
                            key={artifact.meta.filename}
                            artifact={artifact}
                            compact={isCompactMode}
                            isSelected={inspectingFilename === artifact.meta.filename}
                            onOpenStage={(art) => navigateToStage(art.meta.filename)}
                            onOpenStudio={(art) => navigateToStudio(art.meta.filename)}
                            onOpenInspector={(art) =>
                              inspectingFilename === art.meta.filename
                                ? navigateToGallery()
                                : navigateToInspect(art.meta.filename)
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
                  <span>未匹配到符合检索条件的工件</span>
                  <span className="text-xs opacity-60">
                    {filterNeedsPoster
                      ? '所有工件均已定格封面，可点击“待定格”胶囊切回完整列表'
                      : filterUnclassified
                        ? '所有工件均已完成分类，可点击“未分类”胶囊切回完整列表'
                        : '尝试修改筛选词或清除过滤条件'}
                  </span>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {stageArtifact && (
        <FullscreenStage
          artifact={stageArtifact}
          artifacts={activeAlbumMeta ? activeAlbumArtifacts : sortedArtifacts}
          albumTitle={activeAlbumMeta?.title}
          onClose={
            activeAlbumMeta ? () => navigateToAlbumDetail(activeAlbumMeta.id) : navigateToGallery
          }
          onNavigate={(filename) => navigateToStage(filename, activeAlbumId ?? undefined)}
          onOpenDarkroom={(art) => navigateToStudio(art.meta.filename, activeAlbumId ?? undefined)}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}

      {studioArtifact && (
        <DarkroomStudio
          artifact={studioArtifact}
          albumTitle={activeAlbumMeta?.title}
          onBackToGallery={
            activeAlbumId
              ? () => navigateToAlbumDetail(activeAlbumId)
              : () => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    navigateToGallery();
                  }
                }
          }
          onOpenStage={(art) => navigateToStage(art.meta.filename, activeAlbumId ?? undefined)}
          onUpdateArtifact={handleUpdateArtifact}
          onUpdateRating={handleUpdateRating}
        />
      )}

      {inspectingArtifact && (
        <ArtifactInspectorDrawer
          key={inspectingArtifact.meta.id}
          artifact={inspectingArtifact}
          onClose={
            activeAlbumMeta ? () => navigateToAlbumDetail(activeAlbumMeta.id) : navigateToGallery
          }
          onOpenStage={(art) => navigateToStage(art.meta.filename, activeAlbumId ?? undefined)}
          onOpenStudio={(art) => navigateToStudio(art.meta.filename, activeAlbumId ?? undefined)}
          onUpdateTags={handleUpdateTags}
          onUpdateRating={handleUpdateRating}
          onUpdateDescription={handleUpdateDescription}
          onRename={onRename}
          onDelete={onDelete}
          existingFilenames={existingFilenames}
          allTags={allKnownTags}
          onPrev={handlePrevInspector}
          onNext={handleNextInspector}
          hasPrev={hasPrevInspector}
          hasNext={hasNextInspector}
        />
      )}

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

      {isAlbumComposerOpen && (
        <AlbumComposerModal
          artifacts={artifacts}
          allTags={allKnownTags}
          onClose={() => setIsAlbumComposerOpen(false)}
          onSave={handleCreateAlbum}
        />
      )}

      {isDragOver && (
        <div className="fixed inset-0 z-50 bg-sky-950/90 border-4 border-dashed border-sky-400 flex flex-col items-center justify-center gap-3 text-sky-200 pointer-events-none select-none animate-in fade-in">
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
    <ThemeProvider>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
