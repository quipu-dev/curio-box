import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { ToastProvider, useToast } from '@/context/ToastContext';
import { buildAlbumView, resolveAlbumArtifacts } from '@/layer2_darkroom/engine/album-engine';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { ArtifactComposerModal } from '@/layer3_gallery/components/ArtifactComposerModal';
import { ArtifactInspectorDrawer } from '@/layer3_gallery/components/ArtifactInspectorDrawer';
import { DarkroomStudio } from '@/layer3_gallery/components/DarkroomStudio';
import { FullscreenStage } from '@/layer3_gallery/components/FullscreenStage';
import { GallerySortBar } from '@/layer3_gallery/components/GallerySortBar';
import { Header } from '@/layer3_gallery/components/Header';
import { AlbumComposerModal } from '@/layer3_gallery/components/albums/AlbumComposerModal';
import { AlbumDetailView } from '@/layer3_gallery/components/albums/AlbumDetailView';
import { AlbumsView } from '@/layer3_gallery/components/albums/AlbumsView';
import { useArtifactSortAndGroup } from '@/layer3_gallery/hooks/useArtifactSortAndGroup';
import { useGlobalDropZone } from '@/layer3_gallery/hooks/useGlobalDropZone';
import { useHashRoute } from '@/layer3_gallery/hooks/useHashRoute';
import type { Album, AlbumMeta, Artifact } from '@/types';
import { Calendar, Clock, Star, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

function MainApp() {
  const { toast } = useToast();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [albums, setAlbums] = useState<AlbumMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [composerInitialCode, setComposerInitialCode] = useState<string | null>(null);
  const [isAlbumComposerOpen, setIsAlbumComposerOpen] = useState<boolean>(false);

  // Hash 统一视图状态机路由（单一真实数据源）
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

  // 处于画册大盘、画册详情或在画册上下文内操作时，均属于画册视图空间
  const isAlbumsView =
    currentRoute.type === 'albums' ||
    currentRoute.type === 'album-detail' ||
    activeAlbumId !== null;
  const isAlbumDetailView = currentRoute.type === 'album-detail' && activeAlbumId !== null;

  // 档案抽屉检视状态直接由路由单向派生
  const inspectingFilename = inspectFilename;

  // 排序、过滤与聚合分组 Hooks
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

  // 全局 HTML 拖拽加载
  const { isDragOver } = useGlobalDropZone({
    onHtmlDrop: (text, filename) => {
      setComposerInitialCode(text);
      toast.info(`已载入文件: ${filename}`);
    },
    onInvalidDrop: (msg) => toast.warn(msg),
  });

  // 全屏视口滚动条溢出防护
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

  /**
   * SWR (Stale-While-Revalidate) 两段式工作区加载（工件与画册并发）：
   */
  const loadArtifactsSWR = useCallback(async () => {
    // 阶段一：首屏秒开读取工件与相册投影
    const [projectedArtifacts, projectedAlbums] = await Promise.all([
      galleryStorage.loadProjectedArtifacts(),
      galleryStorage.loadProjectedAlbums(),
    ]);

    if (projectedArtifacts.length > 0) {
      setArtifacts(projectedArtifacts);
    }
    if (projectedAlbums.length > 0) {
      setAlbums(projectedAlbums);
    }

    // 阶段二：后台物理对齐
    galleryStorage.reconcileWorkspace(({ type, artifacts: latest }) => {
      if (type === 'updated') {
        setArtifacts(latest);
      }
    });

    galleryStorage.reconcileAlbums().then((latestAlbums) => {
      setAlbums(latestAlbums);
    });
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
        await loadArtifactsSWR();
      } else if (result.handle) {
        setPendingHandle(result.handle);
        await loadArtifactsSWR();
      } else {
        await loadArtifactsSWR();
      }
    }

    restoreDirectory();
    return () => {
      isCancelled = true;
    };
  }, [loadArtifactsSWR]);

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
        await loadArtifactsSWR();
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
        await loadArtifactsSWR();
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

  // 计算带有推导封面与计数的画册视图实体
  const albumViews: Album[] = useMemo(() => {
    return albums.map((meta) => buildAlbumView(meta, artifacts));
  }, [albums, artifacts]);

  // 派生当前激活的画册元数据及其受限工件列表
  const activeAlbumMeta = useMemo(() => {
    if (!activeAlbumId) return null;
    return albums.find((a) => a.id === activeAlbumId) ?? null;
  }, [albums, activeAlbumId]);

  const activeAlbumArtifacts = useMemo(() => {
    if (!activeAlbumMeta) return [];
    return resolveAlbumArtifacts(activeAlbumMeta, artifacts);
  }, [activeAlbumMeta, artifacts]);

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

  // 处于画册模式时，抽屉在画册收录的工件集合中切换，否则在大盘中切换
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

  // 视口自动跟焦
  useEffect(() => {
    if (!inspectingFilename) return;

    const rafId = requestAnimationFrame(() => {
      const targetEl = document.querySelector(
        `[data-artifact-filename="${CSS.escape(inspectingFilename)}"]`,
      );
      if (targetEl) {
        targetEl.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
          inline: 'nearest',
        });
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

  const handleSaveComposerArtifact = async (data: {
    filename: string;
    content: string;
    name: string;
    tags: string[];
    description?: string;
  }) => {
    const newArt = await galleryStorage.createArtifact(
      data.filename,
      data.content,
      data.name,
      data.tags,
      data.description,
    );

    setArtifacts((prev) => [
      newArt,
      ...prev.filter((a) => a.meta.filename !== newArt.meta.filename),
    ]);
  };

  const handleCreateAlbum = async (albumData: Parameters<typeof galleryStorage.createAlbum>[0]) => {
    const created = await galleryStorage.createAlbum(albumData);
    setAlbums((prev) => [created, ...prev]);
    toast.success(`成功创建画册【${created.title}】`);
  };

  const handleSaveAlbum = async (updatedAlbum: AlbumMeta) => {
    await galleryStorage.saveAlbum(updatedAlbum);
    setAlbums((prev) => prev.map((a) => (a.id === updatedAlbum.id ? updatedAlbum : a)));
  };

  const handleDeleteAlbum = async (albumId: string) => {
    await galleryStorage.deleteAlbum(albumId);
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
  };

  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item)),
    );
  };

  const handleUpdateTags = async (filename: string, newTags: string[]) => {
    const prevArtifacts = artifacts;
    const now = new Date().toISOString();
    setArtifacts((prev) =>
      prev.map((item) =>
        item.meta.filename === filename
          ? { ...item, meta: { ...item.meta, tags: newTags, updatedAt: now } }
          : item,
      ),
    );

    try {
      await galleryStorage.updateArtifactMeta(filename, { tags: newTags });
    } catch {
      setArtifacts(prevArtifacts);
      toast.error('更新标签失败，已还原');
    }
  };

  const handleUpdateRating = async (filename: string, newRating: number) => {
    const prevArtifacts = artifacts;
    const now = new Date().toISOString();
    setArtifacts((prev) =>
      prev.map((item) =>
        item.meta.filename === filename
          ? { ...item, meta: { ...item.meta, rating: newRating, updatedAt: now } }
          : item,
      ),
    );

    try {
      await galleryStorage.updateArtifactMeta(filename, { rating: newRating });
    } catch {
      setArtifacts(prevArtifacts);
      toast.error('更新评分失败，已还原');
    }
  };

  const handleUpdateDescription = async (filename: string, newDescription: string) => {
    const prevArtifacts = artifacts;
    const now = new Date().toISOString();
    const trimmedDesc = newDescription.trim() || undefined;
    setArtifacts((prev) =>
      prev.map((item) =>
        item.meta.filename === filename
          ? { ...item, meta: { ...item.meta, description: trimmedDesc, updatedAt: now } }
          : item,
      ),
    );

    try {
      await galleryStorage.updateArtifactMeta(filename, {
        description: trimmedDesc,
      });
    } catch {
      setArtifacts(prevArtifacts);
      toast.error('更新研判备忘失败，已还原');
    }
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
      navigateToInspect(newFilename);
    }
    if (stageFilename === oldFilename) {
      navigateToStage(newFilename);
    }
    if (studioFilename === oldFilename) {
      navigateToStudio(newFilename);
    }
  };

  const handleDeleteArtifact = async (filename: string) => {
    await galleryStorage.deleteArtifact(filename);
    setArtifacts((prev) => prev.filter((item) => item.meta.filename !== filename));
    if (
      inspectingFilename === filename ||
      stageFilename === filename ||
      studioFilename === filename
    ) {
      navigateToGallery();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-main overflow-hidden relative">
      {/* 主画廊工作区视口 */}
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
            /* 画册详情策展工坊 */
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
            /* 策展画册展厅视图 */
            <AlbumsView
              albums={albumViews}
              searchQuery={searchQuery}
              onOpenAlbumDetail={navigateToAlbumDetail}
              onOpenCreateModal={() => setIsAlbumComposerOpen(true)}
            />
          ) : (
            /* 标本工件流大盘视图 */
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

      {/* 活体全屏放映舞台 (若处于相册上下文则受限播放) */}
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

      {/* 独立全屏暗房工作台 */}
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

      {/* 标本档案常驻侧边信息栏 */}
      {inspectingArtifact && (
        <ArtifactInspectorDrawer
          artifact={inspectingArtifact}
          onClose={
            activeAlbumMeta ? () => navigateToAlbumDetail(activeAlbumMeta.id) : navigateToGallery
          }
          onOpenStage={(art) => navigateToStage(art.meta.filename, activeAlbumId ?? undefined)}
          onOpenStudio={(art) => navigateToStudio(art.meta.filename, activeAlbumId ?? undefined)}
          onUpdateTags={handleUpdateTags}
          onUpdateRating={handleUpdateRating}
          onUpdateDescription={handleUpdateDescription}
          onRename={handleRenameArtifact}
          onDelete={handleDeleteArtifact}
          existingFilenames={existingFilenames}
          allTags={allKnownTags}
          onPrev={handlePrevInspector}
          onNext={handleNextInspector}
          hasPrev={hasPrevInspector}
          hasNext={hasNextInspector}
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

      {/* 画册新建模态框 */}
      {isAlbumComposerOpen && (
        <AlbumComposerModal
          artifacts={artifacts}
          allTags={allKnownTags}
          onClose={() => setIsAlbumComposerOpen(false)}
          onSave={handleCreateAlbum}
        />
      )}

      {/* 全局拖拽释放 HUD 视觉蒙层 */}
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
