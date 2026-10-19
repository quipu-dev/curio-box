import { Header } from '@/components/common/Header';
import { SettingsModal } from '@/components/common/SettingsModal';
import { SettingsProvider } from '@/context/SettingsContext';
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
import { Calendar, Clock, Star, Type, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

function MainApp() {
  const { toast } = useToast();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [composerInitialCode, setComposerInitialCode] = useState<string | null>(null);
  const [isAlbumComposerOpen, setIsAlbumComposerOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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
    currentDirectoryName,
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
  } = useArtifactSortAndGroup(artifacts, searchQuery);

  const handleResetFilters = useCallback(() => {
    setFilterNeedsPoster(false);
    setFilterUnclassified(false);
    setFilterHighScore(false);
  }, [setFilterNeedsPoster, setFilterUnclassified, setFilterHighScore]);

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
        className={`flex-1 min-h-0 flex flex-col overflow-hidden ${
          inspectingFilename ? 'sm:mr-[420px]' : ''
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
          onImportFromClipboard={handleImportFromClipboard}
          onOpenNewArtifactComposer={handleOpenNewArtifact}
          onOpenNewAlbumComposer={() => setIsAlbumComposerOpen(true)}
          hasDirectory={hasDirectory}
          pendingDirectoryName={pendingHandle?.name}
          onPickDirectory={handlePickDirectory}
          onRequestPendingPermission={handleRequestPendingPermission}
          resolvedTheme={resolvedTheme}
          onToggleTheme={toggleTheme}
          onOpenSettings={() => setIsSettingsOpen(true)}
          allTags={allKnownTags}
        />

        <GallerySortBar
          totalCount={artifacts.length}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          cardSize={cardSize}
          onCardSizeChange={handleCardSizeChange}
          filterNeedsPoster={filterNeedsPoster}
          onToggleNeedsPoster={() => setFilterNeedsPoster((prev) => !prev)}
          needsPosterCount={needsPosterCount}
          filterUnclassified={filterUnclassified}
          onToggleUnclassified={() => setFilterUnclassified((prev) => !prev)}
          unclassifiedCount={unclassifiedCount}
          filterHighScore={filterHighScore}
          onToggleHighScore={() => setFilterHighScore((prev) => !prev)}
          highScoreCount={highScoreCount}
          onResetFilters={handleResetFilters}
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
              {sortedArtifacts.length > 0 ? (
                enableGrouping ? (
                  <div className="flex flex-col gap-8">
                    {displayGroups.map((group) => {
                      const IconComponent =
                        group.icon === 'calendar'
                          ? Calendar
                          : group.icon === 'clock'
                            ? Clock
                            : group.icon === 'star'
                              ? Star
                              : Type;

                      return (
                        <section key={group.key} className="flex flex-col gap-3.5">
                          {/* 自然流式分组标题栏（无吸顶） */}
                          <div className="py-1.5 flex items-center justify-between border-b border-border text-xs font-mono select-none">
                            <div className="flex items-center gap-2">
                              <span className="p-1 rounded bg-surface border border-border text-status-info">
                                <IconComponent className="w-3.5 h-3.5" />
                              </span>
                              <h2 className="font-bold text-sm font-sans text-main">{group.key}</h2>
                            </div>
                            <span className="text-[11px] text-muted font-mono bg-surface px-2 py-0.5 rounded border border-border">
                              {group.items.length} 件
                            </span>
                          </div>

                          {/* 组内网格 */}
                          <div style={gridStyle}>
                            {group.items.map((artifact) => (
                              <ArtifactCard
                                key={artifact.meta.filename}
                                artifact={artifact}
                                compact={isCompactMode}
                                isSelected={inspectingFilename === artifact.meta.filename}
                                onOpenStage={() => navigateToStage(artifact.meta.filename)}
                                onOpenStudio={() => navigateToStudio(artifact.meta.filename)}
                                onOpenInspector={() =>
                                  inspectingFilename === artifact.meta.filename
                                    ? navigateToGallery()
                                    : navigateToInspect(artifact.meta.filename)
                                }
                              />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div style={gridStyle}>
                    {sortedArtifacts.map((artifact) => (
                      <ArtifactCard
                        key={artifact.meta.filename}
                        artifact={artifact}
                        compact={isCompactMode}
                        isSelected={inspectingFilename === artifact.meta.filename}
                        onOpenStage={() => navigateToStage(artifact.meta.filename)}
                        onOpenStudio={() => navigateToStudio(artifact.meta.filename)}
                        onOpenInspector={() =>
                          inspectingFilename === artifact.meta.filename
                            ? navigateToGallery()
                            : navigateToInspect(artifact.meta.filename)
                        }
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded-xl bg-surface">
                  <span className="text-main font-semibold">未匹配到符合检索条件的工件</span>
                  <span className="text-xs text-muted">
                    {filterNeedsPoster
                      ? '所有工件均已定格封面，可点击“待定格”胶囊切回完整列表'
                      : filterUnclassified
                        ? '所有工件均已完成分类，可点击“未分类”胶囊切回完整列表'
                        : filterHighScore
                          ? '暂无评分为 4 星以上的工件，可重置筛选'
                          : '尝试修改筛选词或清除过滤条件'}
                  </span>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-2 px-3 py-1 bg-surface-elevated hover:bg-surface-subtle border border-border rounded text-xs text-main transition-colors"
                  >
                    重置筛选条件
                  </button>
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

      {/* 系统全局首选项设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        hasDirectory={hasDirectory}
        directoryName={currentDirectoryName}
        pendingDirectoryName={pendingHandle?.name}
        onPickDirectory={handlePickDirectory}
        onRequestPendingPermission={handleRequestPendingPermission}
      />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SettingsProvider>
          <MainApp />
        </SettingsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
