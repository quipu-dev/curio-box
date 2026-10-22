import { AlbumRepository } from '@/core/storage/album-repository';
import { ArtifactRepository } from '@/core/storage/artifact-repository';
import { loadHandleFromIDB, persistHandleToIDB } from '@/core/storage/idb';
import { WorkspaceRepository } from '@/core/storage/workspace-repository';
import type {
  AlbumMeta,
  Artifact,
  ArtifactBundleMeta,
  CommitLogEntry,
  CreateAlbumInput,
  StorageDriverType,
  WorkspaceMeta,
} from '@/types';

/**
 * 仓储门面 (Storage Facade)：统合底层工件与画册两个正交仓储，
 * 同时支持外部本地文件夹 (FSA) 与浏览器本地私有沙箱 (OPFS) 统一调度。
 */
export class GalleryStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private driverType: StorageDriverType = 'opfs-sandbox';
  public readonly artifacts = new ArtifactRepository();
  public readonly albums = new AlbumRepository();
  public readonly workspace = new WorkspaceRepository();

  public setDirectoryHandle(
    handle: FileSystemDirectoryHandle,
    driver: StorageDriverType = 'fsa-physical',
  ): void {
    this.dirHandle = handle;
    this.driverType = driver;
    this.artifacts.setDirectoryHandle(handle);
    this.albums.setDirectoryHandle(handle);
    this.workspace.setDirectoryHandle(handle);
    if (driver === 'fsa-physical') {
      persistHandleToIDB(handle).catch(() => {});
    }
  }

  public getDirectoryHandle(): FileSystemDirectoryHandle | null {
    return this.dirHandle;
  }

  public getDriverType(): StorageDriverType {
    return this.driverType;
  }

  public async restoreSavedHandle(): Promise<{
    handle: FileSystemDirectoryHandle | null;
    permission: PermissionState;
    driverType: StorageDriverType;
  }> {
    // 1. 优先尝试恢复用户此前授权的真实外部物理目录
    const saved = await loadHandleFromIDB();
    if (saved) {
      try {
        const perm = await (
          saved as unknown as {
            queryPermission: (opt: { mode: string }) => Promise<PermissionState>;
          }
        ).queryPermission({ mode: 'readwrite' });

        if (perm === 'granted') {
          this.setDirectoryHandle(saved, 'fsa-physical');
          return { handle: saved, permission: 'granted', driverType: 'fsa-physical' };
        }
      } catch {
        // 忽略权限探测异常
      }
    }

    // 2. 无法恢复外部物理目录时，自动挂载 OPFS（浏览器私有文件系统）作为零配置全功能持久底座
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
        const opfsRoot = await navigator.storage.getDirectory();
        this.setDirectoryHandle(opfsRoot, 'opfs-sandbox');
        return { handle: opfsRoot, permission: 'granted', driverType: 'opfs-sandbox' };
      }
    } catch (err) {
      console.warn('挂载 OPFS 沙箱底座失败，将降级为内存演示模式:', err);
    }

    return { handle: null, permission: 'prompt', driverType: 'opfs-sandbox' };
  }

  public hasHandle(): boolean {
    return this.dirHandle !== null;
  }

  public async switchToOpfsSandbox(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      const opfsRoot = await navigator.storage.getDirectory();
      this.setDirectoryHandle(opfsRoot, 'opfs-sandbox');
      // 清除 IndexedDB 中保存的外部句柄
      try {
        const { openStorageDB } = await import('@/core/storage/idb');
        const db = await openStorageDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('fs_handles', 'readwrite');
          tx.objectStore('fs_handles').delete('active_directory_handle');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn('清理历史本地句柄失败:', err);
      }
    } else {
      throw new Error('当前浏览器环境不支持 OPFS 沙箱存储');
    }
  }

  // --- 工件仓储委托 ---
  public loadProjectedArtifacts(): Promise<Artifact[]> {
    return this.artifacts.loadProjectedArtifacts();
  }

  public reconcileWorkspace(
    onSync?: (e: { type: 'noop' | 'updated'; artifacts: Artifact[] }) => void,
  ): Promise<Artifact[]> {
    return this.artifacts.reconcileWorkspace(onSync);
  }

  public scanArtifacts(): Promise<Artifact[]> {
    return this.artifacts.reconcileWorkspace();
  }

  public ensureGenesisSnapshot(artifactId: string, initialContent: string): Promise<void> {
    return this.artifacts.ensureGenesisSnapshot(artifactId, initialContent);
  }

  public createArtifact(
    filename: string,
    content: string,
    name: string,
    tags?: string[],
    description?: string,
  ): Promise<Artifact> {
    return this.artifacts.createArtifact(filename, content, name, tags, description);
  }

  public loadArtifactSource(filename: string): Promise<string> {
    return this.artifacts.loadArtifactSource(filename);
  }

  public commitRevision(params: {
    artifactId: string;
    filename: string;
    code?: string;
    revision: number;
    action?: 'genesis' | 'patch' | 'rollback';
    message: string;
    tags?: string[];
    description?: string;
  }): Promise<ArtifactBundleMeta> {
    return this.artifacts.commitRevision(params);
  }

  public savePoster(filename: string, blob: Blob, explicitArtifactId?: string): Promise<string> {
    return this.artifacts.savePoster(filename, blob, explicitArtifactId);
  }

  public saveMeta(meta: ArtifactBundleMeta): Promise<void> {
    return this.artifacts.saveMeta(meta);
  }

  public updateArtifactMeta(
    filename: string,
    partialMeta: Partial<Omit<ArtifactBundleMeta, 'history' | 'id'>>,
  ): Promise<ArtifactBundleMeta> {
    return this.artifacts.updateArtifactMeta(filename, partialMeta);
  }

  public renameArtifact(
    oldFilename: string,
    newFilename: string,
    newName?: string,
  ): Promise<Artifact> {
    return this.artifacts.renameArtifact(oldFilename, newFilename, newName);
  }

  public deleteArtifact(filename: string): Promise<void> {
    return this.artifacts.deleteArtifact(filename);
  }

  public async recordNegativeRevision(
    artifactId: string,
    revision: number,
    content: string,
    action: 'genesis' | 'patch' | 'rollback' = 'patch',
    message?: string,
  ): Promise<void> {
    await this.artifacts.commitRevision({
      artifactId,
      filename: '',
      code: content,
      revision,
      action,
      message: message || (action === 'genesis' ? '初始版本' : `版本快照 REV:${revision}`),
    });
  }

  public loadNegativeRevision(artifactId: string, revision: number): Promise<string | null> {
    return this.artifacts.loadNegativeRevision(artifactId, revision);
  }

  public listNegativeRevisions(artifactId: string): Promise<CommitLogEntry[]> {
    return this.artifacts.listNegativeRevisions(artifactId);
  }

  public getMockArtifacts(): Artifact[] {
    return this.artifacts.getMockArtifacts();
  }

  // --- 画册仓储委托 ---
  public loadProjectedAlbums(): Promise<AlbumMeta[]> {
    return this.albums.loadProjectedAlbums();
  }

  public reconcileAlbums(): Promise<AlbumMeta[]> {
    return this.albums.reconcileAlbums();
  }

  public createAlbum(input: CreateAlbumInput): Promise<AlbumMeta> {
    return this.albums.createAlbum(input);
  }

  public saveAlbum(album: AlbumMeta): Promise<void> {
    return this.albums.saveAlbum(album);
  }

  public loadAlbum(albumId: string): Promise<AlbumMeta | null> {
    return this.albums.loadAlbum(albumId);
  }

  public deleteAlbum(albumId: string): Promise<void> {
    return this.albums.deleteAlbum(albumId);
  }

  public getMockAlbums(): AlbumMeta[] {
    return this.albums.getMockAlbums();
  }

  // --- 工作区仓储委托 ---
  public loadWorkspaceMeta(fallbackDirName?: string): Promise<WorkspaceMeta> {
    return this.workspace.loadWorkspaceMeta(fallbackDirName);
  }

  public saveWorkspaceMeta(meta: WorkspaceMeta): Promise<void> {
    return this.workspace.saveWorkspaceMeta(meta);
  }
}

export const galleryStorage = new GalleryStorage();
