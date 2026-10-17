import { ToastProvider, useToast } from '@/context/ToastContext';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { ArtifactComposerModal } from '@/layer3_gallery/components/ArtifactComposerModal';
import { ArtifactInspectorDrawer } from '@/layer3_gallery/components/ArtifactInspectorDrawer';
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

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // 全屏视口滚动条溢出防护（抽屉式侧边栏不锁定滚动，方便边看网格边查看）
  useEffect(() => {
    const isOverlayActive = Boolean(
      stageFilename || studioFilename || composerInitialCode !== null,
    );
    if (isOverlayActive) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [stageFilename, studioFilename, composerInitialCode]);

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

  // 计算抽屉打开时的当前排序列索引及前后切换能力
  const inspectingIndex = useMemo(() => {
    if (!inspectingFilename) return -1;
    return sortedArtifacts.findIndex((a) => a.meta.filename === inspectingFilename);
  }, [sortedArtifacts, inspectingFilename]);

  const hasPrevInspector = inspectingIndex > 0;
  const hasNextInspector = inspectingIndex !== -1 && inspectingIndex < sortedArtifacts.length - 1;

  const handlePrevInspector = useCallback(() => {
    if (hasPrevInspector) {
      setInspectingFilename(sortedArtifacts[inspectingIndex - 1].meta.filename);
    }
  }, [hasPrevInspector, sortedArtifacts, inspectingIndex]);

  const handleNextInspector = useCallback(() => {
    if (hasNextInspector) {
      setInspectingFilename(sortedArtifacts[inspectingIndex + 1].meta.filename);
    }
  }, [hasNextInspector, sortedArtifacts, inspectingIndex]);

  // 视口自动跟焦：当选中的工件变化时，瞬时将其精准锁定在可视安全区域（零延迟跟手）
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

  // 二维物理空间最近邻键盘导航（支持真实的上下垂直移动）
  useEffect(() => {
    if (!inspectingFilename) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      const isInputFocused = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      if (e.key === 'Escape') {
        if (!isInputFocused) {
          setInspectingFilename(null);
        }
        return;
      }

      if (isInputFocused) return;

      // 括号快捷键保留一维线性前后切换
      if (e.key === '[') {
        e.preventDefault();
        handlePrevInspector();
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        handleNextInspector();
        return;
      }

      const isArrow =
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight';

      if (!isArrow) return;
      e.preventDefault();

      const currentCardEl = document.querySelector(
        `[data-artifact-filename="${CSS.escape(inspectingFilename)}"]`,
      );
      if (!currentCardEl) return;

      const currentRect = currentCardEl.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;

      const allCardEls = Array.from(
        document.querySelectorAll<HTMLElement>('[data-artifact-filename]'),
      );

      let bestCandidate: { filename: string; score: number } | null = null;

      for (const el of allCardEls) {
        const fn = el.getAttribute('data-artifact-filename');
        if (!fn || fn === inspectingFilename) continue;

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = centerX - currentCenterX;
        const dy = centerY - currentCenterY;

        let isQualified = false;
        let score = Number.POSITIVE_INFINITY;

        if (e.key === 'ArrowDown') {
          // 位于正下方且跨越至少半个卡片高度阈值
          if (dy > 30) {
            isQualified = true;
            // 水平对齐加倍惩罚，确保优先垂直落至正下方同列卡片
            score = Math.abs(dx) * 2.5 + dy;
          }
        } else if (e.key === 'ArrowUp') {
          // 位于正上方
          if (dy < -30) {
            isQualified = true;
            score = Math.abs(dx) * 2.5 + Math.abs(dy);
          }
        } else if (e.key === 'ArrowRight') {
          // 同行或右侧
          if (dx > 20 && Math.abs(dy) < currentRect.height * 0.8) {
            isQualified = true;
            score = dx + Math.abs(dy) * 2;
          }
        } else if (e.key === 'ArrowLeft') {
          // 同行或左侧
          if (dx < -20 && Math.abs(dy) < currentRect.height * 0.8) {
            isQualified = true;
            score = Math.abs(dx) + Math.abs(dy) * 2;
          }
        }

        if (isQualified && (!bestCandidate || score < bestCandidate.score)) {
          bestCandidate = { filename: fn, score };
        }
      }

      if (bestCandidate) {
        setInspectingFilename(bestCandidate.filename);
      } else {
        // 若同行已到边缘，横向移动回退为自然线性切页
        if (e.key === 'ArrowRight') handleNextInspector();
        if (e.key === 'ArrowLeft') handlePrevInspector();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inspectingFilename, handlePrevInspector, handleNextInspector]);

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

  const handleUpdateDescription = async (filename: string, newDescription: string) => {
    const updatedMeta = await galleryStorage.updateArtifactMeta(filename, {
      description: newDescription.trim() || undefined,
    });
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
    <div
      className={`min-h-screen flex flex-col bg-background text-main ${
        inspectingFilename ? 'sm:pr-[480px]' : ''
      }`}
    >
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
        cardSize={cardSize}
        onCardSizeChange={handleCardSizeChange}
      />

      <main className="flex-1 p-6 md:p-8">
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
                        setInspectingFilename((prev) =>
                          prev === art.meta.filename ? null : art.meta.filename,
                        )
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

      {/* 标本档案常驻侧边信息栏 (Inspector Drawer) */}
      {inspectingArtifact && (
        <ArtifactInspectorDrawer
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
