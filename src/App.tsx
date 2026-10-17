import { ToastProvider, useToast } from '@/context/ToastContext';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { TitleSanitizerEngine } from '@/layer2_darkroom/engine/title-sanitizer';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { ArtifactComposerModal } from '@/layer3_gallery/components/ArtifactComposerModal';
import { ArtifactInspectorModal } from '@/layer3_gallery/components/ArtifactInspectorModal';
import { DarkroomStudio } from '@/layer3_gallery/components/DarkroomStudio';
import { FullscreenStage } from '@/layer3_gallery/components/FullscreenStage';
import { Header } from '@/layer3_gallery/components/Header';
import type { Artifact } from '@/types';
import { ArrowDownUp, Calendar, Clock, Star, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export type SortOption = 'date-desc' | 'date-asc' | 'updated-desc' | 'rating-desc' | 'name-asc';

// 解析当前 URL Hash 路由状态
function parseHashRoute(hash: string): {
  type: 'gallery' | 'stage' | 'studio';
  filename: string | null;
} {
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

// 时间线分桶格式化（精确到天）
function formatTimelineGroupKey(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '更早归档';
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  } catch {
    return '更早归档';
  }
}

// 星级分桶格式化
function formatRatingGroupKey(rating?: number): string {
  if (!rating || rating <= 0) return '未评分工件';
  return `${rating} 星精选`;
}

function MainApp() {
  const { toast } = useToast();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [stageFilename, setStageFilename] = useState<string | null>(null);
  const [studioFilename, setStudioFilename] = useState<string | null>(null);
  const [inspectingFilename, setInspectingFilename] = useState<string | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // 画廊排序方式：默认导入时间从新到旧 (date-desc)
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    if (typeof window === 'undefined') return 'date-desc';
    const saved = localStorage.getItem('curio_sort_by');
    return (saved as SortOption) || 'date-desc';
  });

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    try {
      localStorage.setItem('curio_sort_by', newSort);
    } catch {}
  };

  // 画廊网格缩放列数 (2 ~ 6)
  const [gridCols, setGridCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 4;
    const saved = localStorage.getItem('curio_grid_cols');
    return saved ? Number.parseInt(saved, 10) : 4;
  });

  const handleGridColsChange = (cols: number) => {
    setGridCols(cols);
    try {
      localStorage.setItem('curio_grid_cols', cols.toString());
    } catch {}
  };

  // 装配台弹窗控制
  const [composerInitialCode, setComposerInitialCode] = useState<string | null>(null);
  // 全局拖拽悬浮状态
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  // 全屏视口滚动条溢出防护：当处于放映、暗房或弹窗态时锁死 body 滚动
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

  // Hash 路由双向同步机制
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

  // 当进入暗房或检视器时，如未加载 sourceCode，自动按需读取并缓冲
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

  // 从剪贴板导入
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

  // 打开空白装配台
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

  // 监听文件拖拽进入
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) {
        setIsDragOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (!e.dataTransfer || !e.dataTransfer.files.length) return;

      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith('.html') && !file.type.includes('html')) {
        toast.warn('请拖入 .html 格式的工件文件');
        return;
      }

      const text = await file.text();
      setComposerInitialCode(text);
      toast.info(`已载入文件: ${file.name}`);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [toast]);

  // 保存新建工件并落盘
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

  // 标本元数据修改联动
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

  // 标本重命名
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

  // 标本删除
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

  // 1. 过滤匹配
  const filteredRawArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

  // 2. 依据当前排序选项进行确定性排序
  const sortedArtifacts = useMemo(() => {
    const list = [...filteredRawArtifacts];
    list.sort((a, b) => {
      // 评分优先
      if (sortBy === 'rating-desc') {
        const ratingA = a.meta.rating || 0;
        const ratingB = b.meta.rating || 0;
        if (ratingB !== ratingA) {
          return ratingB - ratingA;
        }
        // 评分相同时次级按导入时间降序
        const timeA = new Date(a.meta.createdAt).getTime() || 0;
        const timeB = new Date(b.meta.createdAt).getTime() || 0;
        return timeB - timeA;
      }

      // 最近修改优先 (updatedAt)
      if (sortBy === 'updated-desc') {
        const timeA = new Date(a.meta.updatedAt).getTime() || 0;
        const timeB = new Date(b.meta.updatedAt).getTime() || 0;
        return timeB - timeA;
      }

      // 最早导入优先 (createdAt)
      if (sortBy === 'date-asc') {
        const timeA = new Date(a.meta.createdAt).getTime() || 0;
        const timeB = new Date(b.meta.createdAt).getTime() || 0;
        return timeA - timeB;
      }

      // 名称字典序
      if (sortBy === 'name-asc') {
        return a.meta.name.localeCompare(b.meta.name, 'zh-CN');
      }

      // 默认 date-desc: 最新导入优先 (createdAt)
      const timeA = new Date(a.meta.createdAt).getTime() || 0;
      const timeB = new Date(b.meta.createdAt).getTime() || 0;
      return timeB - timeA;
    });
    return list;
  }, [filteredRawArtifacts, sortBy]);

  // 3. 动态聚合分桶（根据排序方式自适应）
  const displayGroups = useMemo(() => {
    const groups: {
      key: string;
      icon: 'calendar' | 'clock' | 'star' | 'list';
      items: Artifact[];
    }[] = [];
    const groupMap = new Map<string, Artifact[]>();

    if (sortBy === 'rating-desc') {
      // 评分优先：按星级从高到低分桶
      for (const art of sortedArtifacts) {
        const key = formatRatingGroupKey(art.meta.rating);
        let list = groupMap.get(key);
        if (!list) {
          list = [];
          groupMap.set(key, list);
          groups.push({ key, icon: 'star', items: list });
        }
        list.push(art);
      }
      return groups;
    }

    if (sortBy === 'name-asc') {
      // 字母排序：单一列表呈现
      return [{ key: '所有工件 (名称排序)', icon: 'list', items: sortedArtifacts }];
    }

    if (sortBy === 'updated-desc') {
      // 最近修改：按 updatedAt 分桶
      for (const art of sortedArtifacts) {
        const key = formatTimelineGroupKey(art.meta.updatedAt);
        let list = groupMap.get(key);
        if (!list) {
          list = [];
          groupMap.set(key, list);
          groups.push({ key, icon: 'clock', items: list });
        }
        list.push(art);
      }
      return groups;
    }

    // 时间排序 (date-desc / date-asc)：按不可变导入时间 createdAt 分桶
    for (const art of sortedArtifacts) {
      const key = formatTimelineGroupKey(art.meta.createdAt);
      let list = groupMap.get(key);
      if (!list) {
        list = [];
        groupMap.set(key, list);
        groups.push({ key, icon: 'calendar', items: list });
      }
      list.push(art);
    }

    return groups;
  }, [sortedArtifacts, sortBy]);

  // 动态网格类名计算
  const gridClass = useMemo(() => {
    switch (gridCols) {
      case 2:
        return 'grid grid-cols-1 sm:grid-cols-2 gap-6';
      case 3:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5';
      case 4:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
      case 5:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4';
      case 6:
        return 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3';
      default:
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5';
    }
  }, [gridCols]);

  const isCompactMode = gridCols >= 5;

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
        {/* 工具信息栏与排序控制 */}
        <div className="mb-6 flex flex-wrap gap-3 justify-between items-center text-xs font-mono text-muted">
          <div className="flex items-center gap-2">
            <span>工件总数：</span>
            <span className="text-main font-semibold">{sortedArtifacts.length}</span>
            <span>/</span>
            <span>{artifacts.length}</span>
            {!hasDirectory && (
              <span className="hidden sm:inline opacity-70">
                （当前为演示模式，可点击右上角关联本地目录）
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <ArrowDownUp className="w-3 h-3 text-sky-400" />
              <span>排序：</span>
            </span>

            <div className="flex items-center bg-surface border border-border rounded overflow-hidden p-0.5">
              <button
                type="button"
                onClick={() => handleSortChange('date-desc')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sortBy === 'date-desc'
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-muted hover:text-main'
                }`}
                title="按导入时间降序（最新导入优先）"
              >
                最新导入
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('date-asc')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sortBy === 'date-asc'
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-muted hover:text-main'
                }`}
                title="按导入时间升序（最早导入优先）"
              >
                最早导入
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('updated-desc')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sortBy === 'updated-desc'
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-muted hover:text-main'
                }`}
                title="按最后修改时间降序（最近活跃优先）"
              >
                最近修改
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('rating-desc')}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  sortBy === 'rating-desc'
                    ? 'bg-zinc-800 text-amber-300 font-medium'
                    : 'text-muted hover:text-main'
                }`}
                title="按评星降序（高分优先）"
              >
                <Star className="w-3 h-3 fill-current text-amber-400" />
                <span>评分最高</span>
              </button>

              <button
                type="button"
                onClick={() => handleSortChange('name-asc')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sortBy === 'name-asc'
                    ? 'bg-zinc-800 text-white font-medium'
                    : 'text-muted hover:text-main'
                }`}
                title="按名称拼音与字母排序"
              >
                名称 A-Z
              </button>
            </div>
          </div>
        </div>

        {displayGroups.length > 0 && displayGroups[0].items.length > 0 ? (
          <div className="flex flex-col gap-10">
            {displayGroups.map((group) => (
              <section key={group.key} className="flex flex-col gap-4">
                {/* 常规文档流分组头 */}
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

                {/* 动态网格 */}
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

      {/* 活体全屏放映舞台 (走马灯顺序跟随当前筛选排序) */}
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
