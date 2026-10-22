import { useToast } from '@/context/ToastContext';
import { downloadBlob } from '@/core/export/album-exporter';
import { exportWorkspaceAsZip } from '@/core/export/workspace-exporter';
import { galleryStorage } from '@/core/storage/fs-storage';
import { buildAlbumView, resolveAlbumArtifacts } from '@/features/albums/album-resolver';
import type {
  Album,
  AlbumMeta,
  Artifact,
  ArtifactBundleMeta,
  StorageDriverType,
  UpdateWorkspaceInput,
  WorkspaceMeta,
} from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export function useWorkspaceSync(activeAlbumId: string | null) {
  const { toast } = useToast();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [albums, setAlbums] = useState<AlbumMeta[]>([]);
  const [workspaceMeta, setWorkspaceMeta] = useState<WorkspaceMeta | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [driverType, setDriverType] = useState<StorageDriverType>('opfs-sandbox');
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const currentDirectoryName = useMemo(() => {
    if (hasDirectory) {
      const handle = galleryStorage.getDirectoryHandle();
      if (driverType === 'opfs-sandbox') {
        return '浏览器内置沙箱';
      }
      return handle?.name || null;
    }
    return null;
  }, [hasDirectory, driverType]);

  /**
   * SWR 两段式工作区对齐
   */
  const loadArtifactsSWR = useCallback(async () => {
    const [projectedArtifacts, projectedAlbums, loadedWorkspace] = await Promise.all([
      galleryStorage.loadProjectedArtifacts(),
      galleryStorage.loadProjectedAlbums(),
      galleryStorage.loadWorkspaceMeta(galleryStorage.getDirectoryHandle()?.name),
    ]);

    if (projectedArtifacts.length > 0) {
      setArtifacts(projectedArtifacts);
    }
    if (projectedAlbums.length > 0) {
      setAlbums(projectedAlbums);
    }
    if (loadedWorkspace) {
      setWorkspaceMeta(loadedWorkspace);
    }

    galleryStorage.reconcileWorkspace(({ type, artifacts: latest }) => {
      if (type === 'updated') {
        setArtifacts(latest);
      }
    });

    galleryStorage.reconcileAlbums().then((latestAlbums) => {
      setAlbums(latestAlbums);
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;
    async function restoreDirectory() {
      const result = await galleryStorage.restoreSavedHandle();
      if (isCancelled) return;

      setDriverType(result.driverType);

      if (result.permission === 'granted' && result.handle) {
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifactsSWR();
      } else if (result.handle && result.driverType === 'fsa-physical') {
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
        galleryStorage.setDirectoryHandle(pendingHandle, 'fsa-physical');
        setHasDirectory(true);
        setDriverType('fsa-physical');
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
        galleryStorage.setDirectoryHandle(handle, 'fsa-physical');
        setHasDirectory(true);
        setDriverType('fsa-physical');
        await loadArtifactsSWR();
        toast.success(`成功关联物理目录: ${handle.name}`);
      } else {
        toast.warn('当前环境不支持文件夹拾取，当前正运行于 OPFS 私有沙箱，数据已完全持久化。');
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        toast.error('选择目录失败');
      }
    }
  };

  const handleSwitchToOpfsSandbox = async () => {
    try {
      await galleryStorage.switchToOpfsSandbox();
      setDriverType('opfs-sandbox');
      setPendingHandle(null);
      await loadArtifactsSWR();
      toast.success('已成功切至浏览器内置沙箱');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`切换沙箱失败: ${msg}`);
    }
  };

  // 派生相册与工件
  const activeAlbumMeta = useMemo(() => {
    if (!activeAlbumId) return null;
    return albums.find((a) => a.id === activeAlbumId) ?? null;
  }, [albums, activeAlbumId]);

  const activeAlbumArtifacts = useMemo(() => {
    if (!activeAlbumMeta) return [];
    return resolveAlbumArtifacts(activeAlbumMeta, artifacts);
  }, [activeAlbumMeta, artifacts]);

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

  const albumViews: Album[] = useMemo(() => {
    return albums.map((meta) => buildAlbumView(meta, artifacts));
  }, [albums, artifacts]);

  // 工件 CRUD 操作
  const handleSaveComposerArtifact = async (data: {
    filename: string;
    content: string;
    name: string;
    tags: string[];
    description?: string;
  }) => {
    const now = new Date().toISOString();
    const tempArtifactId = `art_${Math.random().toString(16).slice(2, 10)}`;

    const optimisticMeta: ArtifactBundleMeta = {
      schemaVersion: 2,
      id: tempArtifactId,
      name: data.name,
      filename: data.filename,
      tags: data.tags,
      description: data.description?.trim() || undefined,
      currentRevision: 1,
      createdAt: now,
      updatedAt: now,
      history: [
        {
          revision: 1,
          timestamp: now,
          action: 'genesis',
          message: '初始版本',
        },
      ],
    };

    const optimisticArt: Artifact = {
      meta: optimisticMeta,
      sourceCode: data.content,
    };

    // 乐观更新：立刻在界面展现新工件，解除弹窗阻断
    setArtifacts((prev) => [
      optimisticArt,
      ...prev.filter((a) => a.meta.filename !== data.filename),
    ]);

    // 后台静默并发落盘
    galleryStorage
      .createArtifact(data.filename, data.content, data.name, data.tags, data.description)
      .then((persistedArt) => {
        setArtifacts((prev) => prev.map((a) => (a.meta.id === tempArtifactId ? persistedArt : a)));
      })
      .catch((err) => {
        // 异常回滚
        setArtifacts((prev) => prev.filter((a) => a.meta.id !== tempArtifactId));
        toast.error(`物理落盘失败: ${err instanceof Error ? err.message : String(err)}`);
      });
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
    return newArt;
  };

  const handleDeleteArtifact = async (filename: string) => {
    await galleryStorage.deleteArtifact(filename);
    setArtifacts((prev) => prev.filter((item) => item.meta.filename !== filename));
  };

  // 画册 CRUD 操作
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

  const handleUpdateWorkspaceMeta = async (input: UpdateWorkspaceInput) => {
    if (!workspaceMeta) return;
    const nextMeta: WorkspaceMeta = {
      ...workspaceMeta,
      name: input.name.trim() || workspaceMeta.name,
      description: input.description?.trim() || undefined,
    };
    setWorkspaceMeta(nextMeta);
    await galleryStorage.saveWorkspaceMeta(nextMeta);
  };

  return {
    artifacts,
    albums,
    workspaceMeta,
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
    handleSwitchToOpfsSandbox,
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
    handleUpdateWorkspaceMeta,
    driverType,
    handleExportWorkspaceZip: async (onProgress?: (status: string) => void) => {
      const handle = galleryStorage.getDirectoryHandle();
      if (!handle) {
        throw new Error('未检测到可导出的工作区');
      }
      const zipBlob = await exportWorkspaceAsZip(handle, onProgress);
      const safeName = (workspaceMeta?.name || 'curio_workspace').replace(/[\\/:*?"<>|]/g, '_');
      downloadBlob(zipBlob, `${safeName}_backup.zip`);
    },
  };
}
