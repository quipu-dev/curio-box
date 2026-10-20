import type { AlbumMeta, ProjectedIndexRecord, WorkspaceMeta } from '@/types';

const IDB_NAME = 'curio_box_meta_db';
const IDB_VERSION = 3;
const IDB_STORE_HANDLES = 'fs_handles';
const IDB_STORE_CACHE = 'artifact_cache';
const IDB_STORE_ALBUMS = 'album_cache';
const IDB_ACTIVE_KEY = 'active_directory_handle';
const IDB_WORKSPACE_KEY = 'active_workspace_meta';

export function openStorageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE_HANDLES)) {
        db.createObjectStore(IDB_STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(IDB_STORE_CACHE)) {
        const cacheStore = db.createObjectStore(IDB_STORE_CACHE, { keyPath: 'id' });
        cacheStore.createIndex('by_filename', 'filename', { unique: false });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_ALBUMS)) {
        db.createObjectStore(IDB_STORE_ALBUMS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function persistHandleToIDB(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openStorageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_HANDLES, 'readwrite');
      tx.objectStore(IDB_STORE_HANDLES).put(handle, IDB_ACTIVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('持久化目录句柄至 IndexedDB 失败:', err);
  }
}

export async function loadHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openStorageDB();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_HANDLES, 'readonly');
      const req = tx.objectStore(IDB_STORE_HANDLES).get(IDB_ACTIVE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function getAllCachedRecords(): Promise<ProjectedIndexRecord[]> {
  try {
    const db = await openStorageDB();
    return await new Promise<ProjectedIndexRecord[]>((resolve) => {
      const tx = db.transaction(IDB_STORE_CACHE, 'readonly');
      const store = tx.objectStore(IDB_STORE_CACHE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function putCachedRecord(record: ProjectedIndexRecord): Promise<void> {
  try {
    const db = await openStorageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_CACHE, 'readwrite');
      tx.objectStore(IDB_STORE_CACHE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('更新 IDB 投影记录异常:', err);
  }
}

export async function deleteCachedRecord(id: string): Promise<void> {
  try {
    const db = await openStorageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_CACHE, 'readwrite');
      tx.objectStore(IDB_STORE_CACHE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function getAllCachedAlbums(): Promise<AlbumMeta[]> {
  try {
    const db = await openStorageDB();
    return await new Promise<AlbumMeta[]>((resolve) => {
      const tx = db.transaction(IDB_STORE_ALBUMS, 'readonly');
      const store = tx.objectStore(IDB_STORE_ALBUMS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function putCachedAlbum(album: AlbumMeta): Promise<void> {
  try {
    const db = await openStorageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_ALBUMS, 'readwrite');
      tx.objectStore(IDB_STORE_ALBUMS).put(album);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('更新 IDB 相册缓存异常:', err);
  }
}

export async function deleteCachedAlbum(id: string): Promise<void> {
  try {
    const db = await openStorageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_ALBUMS, 'readwrite');
      tx.objectStore(IDB_STORE_ALBUMS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

export async function persistWorkspaceMetaToIDB(meta: WorkspaceMeta): Promise<void> {
  try {
    const db = await openStorageDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_HANDLES, 'readwrite');
      tx.objectStore(IDB_STORE_HANDLES).put(meta, IDB_WORKSPACE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('持久化工作区元数据至 IDB 失败:', err);
  }
}

export async function loadWorkspaceMetaFromIDB(): Promise<WorkspaceMeta | null> {
  try {
    const db = await openStorageDB();
    return await new Promise<WorkspaceMeta | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_HANDLES, 'readonly');
      const req = tx.objectStore(IDB_STORE_HANDLES).get(IDB_WORKSPACE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
