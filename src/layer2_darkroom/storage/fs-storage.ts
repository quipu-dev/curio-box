import type {
  Artifact,
  ArtifactBundleMeta,
  NegativeLedgerEntry,
  ProjectedIndexRecord,
} from '@/types';

const GALLERY_DIR = '.gallery';
const ARTIFACTS_DIR = 'artifacts';
const SNAPSHOTS_DIR = 'snapshots';
const META_FILE = 'meta.json';
const POSTER_FILE = 'poster.webp';

const IDB_NAME = 'curio_box_meta_db';
const IDB_VERSION = 2;
const IDB_STORE_HANDLES = 'fs_handles';
const IDB_STORE_CACHE = 'artifact_cache';
const IDB_ACTIVE_KEY = 'active_directory_handle';

function openStorageDB(): Promise<IDBDatabase> {
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistHandleToIDB(handle: FileSystemDirectoryHandle): Promise<void> {
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

async function loadHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
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

async function getAllCachedRecords(): Promise<ProjectedIndexRecord[]> {
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

async function putCachedRecord(record: ProjectedIndexRecord): Promise<void> {
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

async function deleteCachedRecord(id: string): Promise<void> {
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

export class GalleryStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private posterUrlMap: Map<string, string> = new Map();

  public setDirectoryHandle(handle: FileSystemDirectoryHandle): void {
    this.dirHandle = handle;
    this.cleanupPosterBlobUrls();
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
        this.dirHandle = saved;
      }
      return { handle: saved, permission: perm };
    } catch {
      return { handle: saved, permission: 'prompt' };
    }
  }

  public hasHandle(): boolean {
    return this.dirHandle !== null;
  }

  private cleanupPosterBlobUrls() {
    for (const url of this.posterUrlMap.values()) {
      URL.revokeObjectURL(url);
    }
    this.posterUrlMap.clear();
  }

  /**
   * SWR 第 1 阶段：从本地 IndexedDB 瞬时读取投影工件列表（< 16ms 极速冷启动）
   */
  public async loadProjectedArtifacts(): Promise<Artifact[]> {
    if (!this.dirHandle) {
      return this.getMockArtifacts();
    }

    const records = await getAllCachedRecords();
    if (records.length === 0) {
      // 首次启动或缓存被清空时，降级执行快速物理扫描
      return this.reconcileWorkspace();
    }

    const artifacts: Artifact[] = [];
    for (const rec of records) {
      const posterUrl: string | undefined = this.posterUrlMap.get(rec.id);
      if (!posterUrl && rec.hasPoster) {
        // 尝试按需异步预热封面
        this.loadPosterBlobUrl(rec.id).then((url) => {
          if (url) this.posterUrlMap.set(rec.id, url);
        });
      }
      artifacts.push({
        meta: rec.meta,
        posterBlobUrl: posterUrl,
      });
    }

    return artifacts.sort((a, b) => {
      const timeA = new Date(a.meta.createdAt).getTime() || 0;
      const timeB = new Date(b.meta.createdAt).getTime() || 0;
      return timeB - timeA;
    });
  }

  /**
   * SWR 第 2 阶段：后台轻量对齐工作区（比对根目录 HTML 与自包含沙盒）
   */
  public async reconcileWorkspace(
    onSync?: (e: { type: 'noop' | 'updated'; artifacts: Artifact[] }) => void,
  ): Promise<Artifact[]> {
    if (!this.dirHandle) {
      const mock = this.getMockArtifacts();
      onSync?.({ type: 'noop', artifacts: mock });
      return mock;
    }

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });

    // 1. 扫描根目录物理 HTML 文件摘要
    const rootHtmlMap = new Map<string, { lastModified: number }>();
    const rootEntries = (
      this.dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> }
    ).values();

    for await (const entry of rootEntries) {
      if (entry.kind === 'file' && entry.name.endsWith('.html')) {
        try {
          const fileHandle = await this.dirHandle.getFileHandle(entry.name);
          const file = await fileHandle.getFile();
          rootHtmlMap.set(entry.name, { lastModified: file.lastModified });
        } catch {}
      }
    }

    // 2. 扫描 .gallery/artifacts/ 下的所有工件沙盒
    const bundleMap = new Map<string, ArtifactBundleMeta>();
    const bundlePosterMap = new Map<string, boolean>();
    const bundleEntries = (
      artifactsDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
    ).values();

    for await (const entry of bundleEntries) {
      if (entry.kind === 'directory') {
        const bundleId = entry.name;
        try {
          const bDir = await artifactsDir.getDirectoryHandle(bundleId);
          const metaHandle = await bDir.getFileHandle(META_FILE);
          const metaFile = await metaHandle.getFile();
          const metaText = await metaFile.text();
          const meta: ArtifactBundleMeta = JSON.parse(metaText);

          let hasPoster = false;
          try {
            await bDir.getFileHandle(POSTER_FILE);
            hasPoster = true;
          } catch {}

          bundleMap.set(bundleId, meta);
          bundlePosterMap.set(bundleId, hasPoster);
        } catch {}
      }
    }

    // 3. 自愈与对齐：
    // 3.1 针对根目录未初始化沙盒的孤立 HTML，自动创建标准自包含包 (EC-04)
    const existingFilenamesInBundles = new Set(
      Array.from(bundleMap.values()).map((m) => m.filename),
    );

    for (const [htmlName] of rootHtmlMap.entries()) {
      if (!existingFilenamesInBundles.has(htmlName)) {
        try {
          const fileHandle = await this.dirHandle.getFileHandle(htmlName);
          const file = await fileHandle.getFile();
          const content = await file.text();
          const defaultName = htmlName.replace(/\.html$/, '');
          const created = await this.createArtifact(
            htmlName,
            content,
            defaultName,
            ['形态:原生html', '状态:未分类'],
            '',
          );
          bundleMap.set(created.meta.id, created.meta);
          bundlePosterMap.set(created.meta.id, false);
        } catch (e) {
          console.warn(`初始化孤立工件沙盒失败 [${htmlName}]:`, e);
        }
      }
    }

    // 4. 构建最新工件列表并同步刷新 IDB 投影
    const resultArtifacts: Artifact[] = [];
    const activeBundleIds = new Set<string>();

    for (const [id, meta] of bundleMap.entries()) {
      // 若沙盒关联的根目录 HTML 文件已不复存在，暂时跳过该沙盒（保留或待后续软删除）
      if (!rootHtmlMap.has(meta.filename)) {
        continue;
      }

      activeBundleIds.add(id);
      const hasPoster = bundlePosterMap.get(id) ?? false;
      const htmlStats = rootHtmlMap.get(meta.filename);

      // 同步写入 IDB 投影缓存
      const projRecord: ProjectedIndexRecord = {
        id,
        filename: meta.filename,
        htmlLastModified: htmlStats?.lastModified || 0,
        bundleLastModified: new Date(meta.updatedAt).getTime() || 0,
        meta,
        hasPoster,
      };
      putCachedRecord(projRecord).catch(() => {});

      let posterBlobUrl = this.posterUrlMap.get(id);
      if (!posterBlobUrl && hasPoster) {
        posterBlobUrl = await this.loadPosterBlobUrl(id);
        if (posterBlobUrl) {
          this.posterUrlMap.set(id, posterBlobUrl);
        }
      }

      resultArtifacts.push({
        meta,
        posterBlobUrl,
      });
    }

    // 清理 IDB 中已不再存在的废弃投影
    const allCached = await getAllCachedRecords();
    for (const cached of allCached) {
      if (!activeBundleIds.has(cached.id)) {
        deleteCachedRecord(cached.id).catch(() => {});
      }
    }

    resultArtifacts.sort((a, b) => {
      const timeA = new Date(a.meta.createdAt).getTime() || 0;
      const timeB = new Date(b.meta.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    onSync?.({ type: 'updated', artifacts: resultArtifacts });
    return resultArtifacts;
  }

  /**
   * 兼容原有扫描方法：底层直接委托给 reconcileWorkspace
   */
  public async scanArtifacts(): Promise<Artifact[]> {
    return this.reconcileWorkspace();
  }

  /**
   * 确保工件在专属沙盒中存在 REV 1 创世底片
   */
  public async ensureGenesisSnapshot(artifactId: string, initialContent: string): Promise<void> {
    if (!this.dirHandle) return;
    try {
      const existingRev1 = await this.loadNegativeRevision(artifactId, 1);
      if (!existingRev1) {
        await this.recordNegativeRevision(artifactId, 1, initialContent, 'genesis', '初始版本');
      }
    } catch (err) {
      console.warn('初始版本检验或写入异常:', err);
    }
  }

  /**
   * 创建并封存新工件至 .gallery/artifacts/<id>/
   */
  public async createArtifact(
    filename: string,
    content: string,
    name: string,
    tags: string[] = ['形态:原生html', '状态:新建'],
    description = '',
  ): Promise<Artifact> {
    const now = new Date().toISOString();
    const artifactId = `art_${Math.random().toString(16).slice(2, 10)}`;

    const genesisHistory: NegativeLedgerEntry[] = [
      {
        revision: 1,
        timestamp: now,
        action: 'genesis',
        description: '初始版本',
      },
    ];

    const bundleMeta: ArtifactBundleMeta = {
      schemaVersion: 2,
      id: artifactId,
      name,
      filename,
      tags,
      description: description.trim() || undefined,
      lastCommitMessage: '初始版本',
      currentRevision: 1,
      createdAt: now,
      updatedAt: now,
      history: genesisHistory,
    };

    if (this.dirHandle) {
      // 1. 写入根目录 HTML
      const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      // 2. 初始化工件沙盒目录
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId, { create: true });

      // 3. 写入创世快照
      const snapshotsDir = await bundleDir.getDirectoryHandle(SNAPSHOTS_DIR, { create: true });
      const revHandle = await snapshotsDir.getFileHandle('rev-0001.snapshot', { create: true });
      const snapWritable = await revHandle.createWritable();
      await snapWritable.write(content);
      await snapWritable.close();

      // 4. 写入沙盒专属 meta.json
      const metaHandle = await bundleDir.getFileHandle(META_FILE, { create: true });
      const metaWritable = await metaHandle.createWritable();
      await metaWritable.write(JSON.stringify(bundleMeta, null, 2));
      await metaWritable.close();

      // 5. 写入 IDB 投影缓存
      const file = await fileHandle.getFile();
      putCachedRecord({
        id: artifactId,
        filename,
        htmlLastModified: file.lastModified,
        bundleLastModified: new Date(now).getTime(),
        meta: bundleMeta,
        hasPoster: false,
      }).catch(() => {});
    }

    return {
      meta: bundleMeta,
      sourceCode: content,
    };
  }

  /**
   * 读取指定工件活跃源码
   */
  public async loadArtifactSource(filename: string): Promise<string> {
    if (!this.dirHandle) {
      const mock = this.getMockArtifacts().find((m) => m.meta.filename === filename);
      return mock?.sourceCode || '';
    }
    try {
      const fileHandle = await this.dirHandle.getFileHandle(filename);
      const file = await fileHandle.getFile();
      return await file.text();
    } catch (err) {
      console.warn(`读取工件源码失败 [${filename}]:`, err);
      return '';
    }
  }

  /**
   * 保存工件源码并记录沙盒内快照
   */
  public async saveArtifactSource(
    filename: string,
    artifactId: string,
    newContent: string,
    revision: number,
    action: 'genesis' | 'patch' | 'rollback' = 'patch',
    description?: string,
  ): Promise<void> {
    if (!this.dirHandle) return;

    // 1. 写入根目录 HTML
    const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(newContent);
    await writable.close();

    // 2. 写入快照与更新沙盒元档案
    await this.recordNegativeRevision(artifactId, revision, newContent, action, description);
  }

  /**
   * 定格封面保存至 .gallery/artifacts/<id>/poster.webp
   */
  public async savePoster(
    filename: string,
    blob: Blob,
    explicitArtifactId?: string,
  ): Promise<string> {
    const objectUrl = URL.createObjectURL(blob);
    if (!this.dirHandle) {
      return objectUrl;
    }

    const artifactId = explicitArtifactId || (await this.findArtifactIdByFilename(filename));
    if (!artifactId) {
      return objectUrl;
    }

    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId, { create: true });

      const posterHandle = await bundleDir.getFileHandle(POSTER_FILE, { create: true });
      const writable = await posterHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      this.posterUrlMap.set(artifactId, objectUrl);

      // 刷新 IDB 投影 hasPoster 字段
      const all = await getAllCachedRecords();
      const target = all.find((r) => r.id === artifactId);
      if (target) {
        target.hasPoster = true;
        putCachedRecord(target).catch(() => {});
      }
    } catch (err) {
      console.warn('保存封面海报失败:', err);
    }

    return objectUrl;
  }

  public async saveMeta(meta: ArtifactBundleMeta): Promise<void> {
    if (!this.dirHandle) return;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });
      const bundleDir = await artifactsDir.getDirectoryHandle(meta.id, { create: true });

      const metaHandle = await bundleDir.getFileHandle(META_FILE, { create: true });
      const writable = await metaHandle.createWritable();
      await writable.write(JSON.stringify(meta, null, 2));
      await writable.close();

      // 更新 IDB 投影
      putCachedRecord({
        id: meta.id,
        filename: meta.filename,
        htmlLastModified: 0,
        bundleLastModified: new Date(meta.updatedAt).getTime(),
        meta,
        hasPoster: this.posterUrlMap.has(meta.id),
      }).catch(() => {});
    } catch (err) {
      console.warn('写入沙盒 meta.json 失败:', err);
    }
  }

  /**
   * 局部更新工件元档案
   */
  public async updateArtifactMeta(
    filename: string,
    partialMeta: Partial<Omit<ArtifactBundleMeta, 'history' | 'id'>>,
  ): Promise<ArtifactBundleMeta> {
    const now = new Date().toISOString();
    const artifactId = await this.findArtifactIdByFilename(filename);

    let existingMeta: ArtifactBundleMeta | null = null;
    if (artifactId && this.dirHandle) {
      existingMeta = await this.loadBundleMeta(artifactId);
    }

    const updated: ArtifactBundleMeta = existingMeta
      ? {
          ...existingMeta,
          ...partialMeta,
          updatedAt: now,
        }
      : {
          schemaVersion: 2,
          id: artifactId || `art_${Math.random().toString(16).slice(2, 10)}`,
          name: filename.replace(/\.html$/, ''),
          filename,
          tags: ['形态:原生html'],
          currentRevision: 1,
          createdAt: now,
          updatedAt: now,
          history: [],
          ...partialMeta,
        };

    await this.saveMeta(updated);
    return updated;
  }

  /**
   * 重命名工件（同时更新根目录文件与沙盒内元档案）
   */
  public async renameArtifact(
    oldFilename: string,
    newFilename: string,
    newName?: string,
  ): Promise<Artifact> {
    if (!this.dirHandle) {
      throw new Error('演示模式下暂不支持文件重命名');
    }

    const now = new Date().toISOString();
    const resolvedName = newName || newFilename.replace(/\.html$/, '');
    const artifactId = await this.findArtifactIdByFilename(oldFilename);

    if (!artifactId) {
      throw new Error(`未找到工件 [${oldFilename}] 的沙盒 ID`);
    }

    const oldFileHandle = await this.dirHandle.getFileHandle(oldFilename);
    const oldFile = await oldFileHandle.getFile();
    const content = await oldFile.text();

    if (oldFilename !== newFilename) {
      const newFileHandle = await this.dirHandle.getFileHandle(newFilename, { create: true });
      const newWritable = await newFileHandle.createWritable();
      await newWritable.write(content);
      await newWritable.close();

      try {
        await (
          this.dirHandle as unknown as { removeEntry: (name: string) => Promise<void> }
        ).removeEntry(oldFilename);
      } catch (err) {
        console.warn('移除原文件失败:', err);
      }
    }

    const currentMeta = await this.loadBundleMeta(artifactId);
    const updatedMeta: ArtifactBundleMeta = currentMeta
      ? {
          ...currentMeta,
          filename: newFilename,
          name: resolvedName,
          updatedAt: now,
        }
      : {
          schemaVersion: 2,
          id: artifactId,
          filename: newFilename,
          name: resolvedName,
          tags: ['形态:原生html'],
          currentRevision: 1,
          createdAt: now,
          updatedAt: now,
          history: [],
        };

    await this.saveMeta(updatedMeta);
    const posterBlobUrl = await this.loadPosterBlobUrl(artifactId);

    return {
      meta: updatedMeta,
      sourceCode: content,
      posterBlobUrl,
    };
  }

  /**
   * 级联销毁工件（彻底删除 HTML 物理文件及其专属沙盒）
   */
  public async deleteArtifact(filename: string): Promise<void> {
    if (!this.dirHandle) {
      throw new Error('演示模式下暂不支持物理删除');
    }

    const artifactId = await this.findArtifactIdByFilename(filename);

    // 1. 删除根目录 HTML
    try {
      await (
        this.dirHandle as unknown as { removeEntry: (name: string) => Promise<void> }
      ).removeEntry(filename);
    } catch (err) {
      console.warn('删除 HTML 源码失败:', err);
    }

    // 2. 递归删除专属沙盒
    if (artifactId) {
      try {
        const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
        const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR);
        await (
          artifactsDir as unknown as {
            removeEntry: (name: string, opt: { recursive: boolean }) => Promise<void>;
          }
        ).removeEntry(artifactId, { recursive: true });
      } catch (e) {
        console.warn('删除工件沙盒异常:', e);
      }

      deleteCachedRecord(artifactId).catch(() => {});
      const posterUrl = this.posterUrlMap.get(artifactId);
      if (posterUrl) {
        URL.revokeObjectURL(posterUrl);
        this.posterUrlMap.delete(artifactId);
      }
    }
  }

  /**
   * 记录版本快照至沙盒内 snapshots/rev-XXXX.snapshot
   */
  public async recordNegativeRevision(
    artifactId: string,
    revision: number,
    content: string,
    action: 'genesis' | 'patch' | 'rollback' = 'patch',
    description?: string,
  ): Promise<void> {
    if (!this.dirHandle) return;

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });
    const bundleDir = await artifactsDir.getDirectoryHandle(artifactId, { create: true });
    const snapshotsDir = await bundleDir.getDirectoryHandle(SNAPSHOTS_DIR, { create: true });

    // 1. 写入快照
    const snapFilename = `rev-${String(revision).padStart(4, '0')}.snapshot`;
    const revHandle = await snapshotsDir.getFileHandle(snapFilename, { create: true });
    const writable = await revHandle.createWritable();
    await writable.write(content);
    await writable.close();

    // 2. 同步更新沙盒内部历史修订台账
    const bundleMeta = await this.loadBundleMeta(artifactId);
    if (bundleMeta) {
      const history = (bundleMeta.history || []).filter((item) => item.revision !== revision);
      const commitDesc =
        description || (action === 'genesis' ? '初始版本' : `版本快照 REV:${revision}`);

      history.push({
        revision,
        timestamp: new Date().toISOString(),
        action,
        description: commitDesc,
      });

      history.sort((a, b) => a.revision - b.revision);

      bundleMeta.history = history;
      bundleMeta.currentRevision = revision;
      bundleMeta.lastCommitMessage = commitDesc;
      bundleMeta.updatedAt = new Date().toISOString();

      await this.saveMeta(bundleMeta);
    }
  }

  /**
   * 读取沙盒内指定快照
   */
  public async loadNegativeRevision(artifactId: string, revision: number): Promise<string | null> {
    if (!this.dirHandle) return null;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR);
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId);
      const snapshotsDir = await bundleDir.getDirectoryHandle(SNAPSHOTS_DIR);

      const snapFilename = `rev-${String(revision).padStart(4, '0')}.snapshot`;
      const revHandle = await snapshotsDir.getFileHandle(snapFilename);
      const file = await revHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  /**
   * 从沙盒内 meta.json 极速读取历史修订列表
   */
  public async listNegativeRevisions(artifactId: string): Promise<NegativeLedgerEntry[]> {
    if (!this.dirHandle) {
      return [
        {
          revision: 1,
          timestamp: new Date().toISOString(),
          action: 'genesis',
          description: '示例版本',
        },
      ];
    }

    const meta = await this.loadBundleMeta(artifactId);
    if (meta?.history && meta.history.length > 0) {
      return [...meta.history].sort((a, b) => b.revision - a.revision);
    }

    return [];
  }

  private async loadBundleMeta(artifactId: string): Promise<ArtifactBundleMeta | null> {
    if (!this.dirHandle) return null;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR);
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId);
      const metaHandle = await bundleDir.getFileHandle(META_FILE);
      const file = await metaHandle.getFile();
      return JSON.parse(await file.text());
    } catch {
      return null;
    }
  }

  private async findArtifactIdByFilename(filename: string): Promise<string | null> {
    const cached = await getAllCachedRecords();
    const hit = cached.find((r) => r.filename === filename);
    if (hit) return hit.id;

    if (!this.dirHandle) return null;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR);
      const entries = (
        artifactsDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
      ).values();

      for await (const entry of entries) {
        if (entry.kind === 'directory') {
          const bDir = await artifactsDir.getDirectoryHandle(entry.name);
          try {
            const mHandle = await bDir.getFileHandle(META_FILE);
            const mFile = await mHandle.getFile();
            const meta: ArtifactBundleMeta = JSON.parse(await mFile.text());
            if (meta.filename === filename) {
              return meta.id;
            }
          } catch {}
        }
      }
    } catch {}

    return null;
  }

  private async loadPosterBlobUrl(artifactId: string): Promise<string | undefined> {
    if (!this.dirHandle) return undefined;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR);
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId);
      const posterHandle = await bundleDir.getFileHandle(POSTER_FILE);
      const file = await posterHandle.getFile();
      return URL.createObjectURL(file);
    } catch {
      return undefined;
    }
  }

  public getMockArtifacts(): Artifact[] {
    return [
      {
        meta: {
          schemaVersion: 2,
          id: 'art_fluid2d',
          name: '纳维-斯托克斯二维流体仿真',
          filename: 'fluid-simulation.html',
          tags: ['领域:图形学', '形态:webgl', '物理:流体', '模型:claude-3.5-sonnet'],
          currentRevision: 1,
          createdAt: '2025-02-28T12:00:00Z',
          updatedAt: '2025-02-28T12:00:00Z',
          history: [
            {
              revision: 1,
              timestamp: '2025-02-28T12:00:00Z',
              action: 'genesis',
              description: '初始版本',
            },
          ],
        },
        sourceCode: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
    canvas { width: 100%; height: 100%; object-fit: contain; }
  </style>
</head>
<body>
  <canvas id="c"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');
    canvas.width = 600; canvas.height = 450;
    let t = 0;
    function render() {
      ctx.fillStyle = 'rgba(10, 15, 30, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      t += 0.03;
      for (let i = 0; i < 40; i++) {
        const x = canvas.width / 2 + Math.sin(t + i * 0.2) * (120 + Math.sin(t * 0.5) * 50);
        const y = canvas.height / 2 + Math.cos(t * 0.8 + i * 0.3) * (90 + Math.cos(t * 0.3) * 40);
        ctx.beginPath();
        ctx.arc(x, y, 12 + Math.sin(i + t) * 6, 0, Math.PI * 2);
        ctx.fillStyle = 'hsl(' + ((t * 30 + i * 10) % 360) + ', 85%, 60%)';
        ctx.fill();
      }
      requestAnimationFrame(render);
    }
    render();
  </script>
</body>
</html>`,
      },
    ];
  }
}

export const galleryStorage = new GalleryStorage();
