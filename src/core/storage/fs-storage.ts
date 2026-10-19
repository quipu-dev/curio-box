import { AlbumRepository } from '@/core/storage/album-repository';
import { ArtifactRepository } from '@/core/storage/artifact-repository';
import { loadHandleFromIDB, persistHandleToIDB } from '@/core/storage/idb';
import type {
  AlbumMeta,
  Artifact,
  ArtifactBundleMeta,
  CommitLogEntry,
  CreateAlbumInput,
} from '@/types';

/**
 * 仓储门面 (Storage Facade)：统合底层工件与画册两个正交仓储，
 * 同时维持单例 galleryStorage 的完全向后兼容能力。
 */
export class GalleryStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  public readonly artifacts = new ArtifactRepository();
  public readonly albums = new AlbumRepository();

  public setDirectoryHandle(handle: FileSystemDirectoryHandle): void {
    this.dirHandle = handle;
    this.artifacts.setDirectoryHandle(handle);
    this.albums.setDirectoryHandle(handle);
    persistHandleToIDB(handle).catch(() => {});
  }

  public getDirectoryHandle(): FileSystemDirectoryHandle | null {
    return this.dirHandle;
  }

  public async restoreSavedHandle(): Promise<{
    handle: FileSystemDirectoryHandle | null;
    permission: PermissionState;
  }> {
    const saved = await loadHandleFromIDB();
    if (!saved) {
      return { handle: null, permission: 'prompt' };
    }

    try {
      const perm = await (
        saved as unknown as {
          queryPermission: (opt: { mode: string }) => Promise<PermissionState>;
        }
      ).queryPermission({ mode: 'readwrite' });

      if (perm === 'granted') {
        this.setDirectoryHandle(saved);
      }
      return { handle: saved, permission: perm };
    } catch {
      return { handle: saved, permission: 'prompt' };
    }
  }

  public hasHandle(): boolean {
    return this.dirHandle !== null;
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
}

export const galleryStorage = new GalleryStorage();
