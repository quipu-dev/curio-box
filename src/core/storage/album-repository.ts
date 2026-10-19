import { deleteCachedAlbum, getAllCachedAlbums, putCachedAlbum } from '@/core/storage/idb';
import type { AlbumMeta, CreateAlbumInput } from '@/types';
import { generateAlbumId } from '@/utils/id';

const GALLERY_DIR = '.gallery';
const ALBUMS_DIR = 'albums';

export class AlbumRepository {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  public setDirectoryHandle(handle: FileSystemDirectoryHandle | null): void {
    this.dirHandle = handle;
  }

  public async loadProjectedAlbums(): Promise<AlbumMeta[]> {
    if (!this.dirHandle) {
      return this.getMockAlbums();
    }
    const cached = await getAllCachedAlbums();
    if (cached.length === 0) {
      return this.reconcileAlbums();
    }
    return cached.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async reconcileAlbums(): Promise<AlbumMeta[]> {
    if (!this.dirHandle) {
      return this.getMockAlbums();
    }

    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const albumsDir = await galleryDir.getDirectoryHandle(ALBUMS_DIR, { create: true });

      const diskAlbums: AlbumMeta[] = [];
      const diskIds = new Set<string>();

      const entries = (
        albumsDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
      ).values();

      for await (const entry of entries) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            const fileHandle = await albumsDir.getFileHandle(entry.name);
            const file = await fileHandle.getFile();
            const text = await file.text();
            const meta = JSON.parse(text) as AlbumMeta;
            if (meta?.id && meta?.title) {
              diskAlbums.push(meta);
              diskIds.add(meta.id);
              putCachedAlbum(meta).catch(() => {});
            }
          } catch (err) {
            console.warn(`解析相册文件失败 [${entry.name}]:`, err);
          }
        }
      }

      const cached = await getAllCachedAlbums();
      for (const c of cached) {
        if (!diskIds.has(c.id)) {
          deleteCachedAlbum(c.id).catch(() => {});
        }
      }

      return diskAlbums.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } catch (e) {
      console.warn('对齐相册工作区失败:', e);
      return [];
    }
  }

  public async createAlbum(input: CreateAlbumInput): Promise<AlbumMeta> {
    const now = new Date().toISOString();
    const id = generateAlbumId();

    const fullAlbum: AlbumMeta = {
      ...input,
      schemaVersion: 1,
      id,
      createdAt: now,
      updatedAt: now,
    } as AlbumMeta;

    if (this.dirHandle) {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const albumsDir = await galleryDir.getDirectoryHandle(ALBUMS_DIR, { create: true });
      const fileHandle = await albumsDir.getFileHandle(`${id}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(fullAlbum, null, 2));
      await writable.close();

      await putCachedAlbum(fullAlbum);
    }

    return fullAlbum;
  }

  public async saveAlbum(album: AlbumMeta): Promise<void> {
    const updated: AlbumMeta = {
      ...album,
      updatedAt: new Date().toISOString(),
    };

    if (this.dirHandle) {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const albumsDir = await galleryDir.getDirectoryHandle(ALBUMS_DIR, { create: true });
      const fileHandle = await albumsDir.getFileHandle(`${updated.id}.json`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(updated, null, 2));
      await writable.close();
    }

    await putCachedAlbum(updated);
  }

  public async loadAlbum(albumId: string): Promise<AlbumMeta | null> {
    if (!this.dirHandle) {
      return this.getMockAlbums().find((a) => a.id === albumId) ?? null;
    }
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const albumsDir = await galleryDir.getDirectoryHandle(ALBUMS_DIR);
      const fileHandle = await albumsDir.getFileHandle(`${albumId}.json`);
      const file = await fileHandle.getFile();
      return JSON.parse(await file.text()) as AlbumMeta;
    } catch {
      return null;
    }
  }

  public async deleteAlbum(albumId: string): Promise<void> {
    if (this.dirHandle) {
      try {
        const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
        const albumsDir = await galleryDir.getDirectoryHandle(ALBUMS_DIR);
        await (
          albumsDir as unknown as { removeEntry: (name: string) => Promise<void> }
        ).removeEntry(`${albumId}.json`);
      } catch (err) {
        console.warn(`从磁盘删除相册失败 [${albumId}]:`, err);
      }
    }
    await deleteCachedAlbum(albumId);
  }

  public getMockAlbums(): AlbumMeta[] {
    return [
      {
        schemaVersion: 1,
        id: 'alb_demo_fluids',
        title: '计算流体动力学专题',
        description: '收录二维纳维-斯托克斯与粒子流体交互仿真标本',
        type: 'manual',
        rating: 5,
        items: [{ artifactId: 'art_fluid2d', note: '第一幕：Navier-Stokes 二维基准' }],
        createdAt: '2025-02-28T12:00:00Z',
        updatedAt: '2025-02-28T12:00:00Z',
      },
    ];
  }
}
