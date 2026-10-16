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
import { UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

function MainApp() {
  const { toast } = useToast();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 网页全屏放映中的工件
  const [stageArtifact, setStageArtifact] = useState<Artifact | null>(null);
  // 独立暗房工作台中的工件
  const [studioArtifact, setStudioArtifact] = useState<Artifact | null>(null);
  // 标本档案检视中的工件
  const [inspectingArtifact, setInspectingArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // 装配台弹窗控制
  const [composerInitialCode, setComposerInitialCode] = useState<string | null>(null);
  // 全局拖拽悬浮状态
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

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

  // 现有所有工件的文件名列表（用于查重）
  const existingFilenames = useMemo(() => {
    return artifacts.map((a) => a.meta.filename);
  }, [artifacts]);

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
      // 离开视口边缘时消除高亮
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
    if (stageArtifact?.meta.filename === updated.meta.filename) {
      setStageArtifact(updated);
    }
    if (studioArtifact?.meta.filename === updated.meta.filename) {
      setStudioArtifact(updated);
    }
    if (inspectingArtifact?.meta.filename === updated.meta.filename) {
      setInspectingArtifact(updated);
    }
  };

  // 标本元数据修改联动
  const handleUpdateTags = async (filename: string, newTags: string[]) => {
    const updatedMeta = await galleryStorage.updateArtifactMeta(filename, { tags: newTags });
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === filename ? { ...item, meta: updatedMeta } : item)),
    );
    if (inspectingArtifact?.meta.filename === filename) {
      setInspectingArtifact((prev) => (prev ? { ...prev, meta: updatedMeta } : null));
    }
  };

  const handleUpdateRating = async (filename: string, newRating: number) => {
    const updatedMeta = await galleryStorage.updateArtifactMeta(filename, { rating: newRating });
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === filename ? { ...item, meta: updatedMeta } : item)),
    );
    if (inspectingArtifact?.meta.filename === filename) {
      setInspectingArtifact((prev) => (prev ? { ...prev, meta: updatedMeta } : null));
    }
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
    if (inspectingArtifact?.meta.filename === oldFilename) {
      setInspectingArtifact(newArt);
    }
    if (stageArtifact?.meta.filename === oldFilename) {
      setStageArtifact(newArt);
    }
    if (studioArtifact?.meta.filename === oldFilename) {
      setStudioArtifact(newArt);
    }
  };

  // 标本删除
  const handleDeleteArtifact = async (filename: string) => {
    await galleryStorage.deleteArtifact(filename);
    setArtifacts((prev) => prev.filter((item) => item.meta.filename !== filename));
    if (inspectingArtifact?.meta.filename === filename) {
      setInspectingArtifact(null);
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
        onImportFromClipboard={handleImportFromClipboard}
        onOpenNewArtifactComposer={handleOpenNewArtifact}
        hasDirectory={hasDirectory}
        pendingDirectoryName={pendingHandle?.name}
        onRequestPendingPermission={handleRequestPendingPermission}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 p-6 md:p-8">
        <div className="mb-6 flex justify-between items-center text-xs font-mono text-muted">
          <div>
            工件总数：
            <span className="text-main font-semibold">{filteredArtifacts.length}</span> /{' '}
            {artifacts.length}
          </div>
          {!hasDirectory && <div>（当前为演示模式，可点击右上角打开本地工件目录）</div>}
        </div>

        {filteredArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.meta.filename}
                artifact={artifact}
                onOpenStage={(art) => setStageArtifact(art)}
                onOpenStudio={(art) => setStudioArtifact(art)}
                onOpenInspector={(art) => setInspectingArtifact(art)}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      {/* 活体全屏放映舞台 (显式条件挂载) */}
      {stageArtifact && (
        <FullscreenStage
          artifact={stageArtifact}
          onClose={() => setStageArtifact(null)}
          onOpenDarkroom={(art) => {
            setStageArtifact(null);
            setStudioArtifact(art);
          }}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}

      {/* 独立全屏暗房工作台 (显式条件挂载) */}
      {studioArtifact && (
        <DarkroomStudio
          artifact={studioArtifact}
          onBackToGallery={() => setStudioArtifact(null)}
          onOpenStage={(art) => {
            setStudioArtifact(null);
            setStageArtifact(art);
          }}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}

      {/* 标本档案与元数据检视模态框 */}
      {inspectingArtifact && (
        <ArtifactInspectorModal
          artifact={inspectingArtifact}
          onClose={() => setInspectingArtifact(null)}
          onOpenStage={(art) => setStageArtifact(art)}
          onOpenStudio={(art) => setStudioArtifact(art)}
          onUpdateTags={handleUpdateTags}
          onUpdateRating={handleUpdateRating}
          onRename={handleRenameArtifact}
          onDelete={handleDeleteArtifact}
          existingFilenames={existingFilenames}
        />
      )}

      {/* 工件装配台模态框 */}
      {composerInitialCode !== null && (
        <ArtifactComposerModal
          initialCode={composerInitialCode}
          existingFilenames={existingFilenames}
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
