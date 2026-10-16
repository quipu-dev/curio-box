import type { Artifact, ArtifactMeta, NegativeLedgerEntry } from '@/types';

const GALLERY_DIR = '.gallery';
const POSTERS_DIR = 'posters';
const NEGATIVES_DIR = 'negatives';
const META_FILE = 'meta.json';
const LEDGER_FILE = 'ledger.json';
const IDB_NAME = 'curio_box_meta_db';
const IDB_STORE = 'fs_handles';
const IDB_ACTIVE_KEY = 'active_directory_handle';

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function persistHandleToIDB(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, IDB_ACTIVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('持久化目录句柄至 IndexedDB 失败:', err);
  }
}

async function loadHandleFromIDB(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDB();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_ACTIVE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export class GalleryStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  public setDirectoryHandle(handle: FileSystemDirectoryHandle): void {
    this.dirHandle = handle;
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

  /**
   * 确保工件存在 REV 1 创世底片，补齐断层
   */
  public async ensureGenesisSnapshot(filename: string, initialContent: string): Promise<void> {
    if (!this.dirHandle) return;

    try {
      const existingRev1 = await this.loadNegativeRevision(filename, 1);
      if (!existingRev1) {
        await this.recordNegativeRevision(filename, 1, initialContent, 'genesis', '初始版本');
      }
    } catch (err) {
      console.warn('初始版本检验或写入异常:', err);
    }
  }

  /**
   * 创建并保存一个新工件，自动记录初始版本 REV:1
   */
  public async createArtifact(
    filename: string,
    content: string,
    name: string,
    tags: string[] = ['形态:原生html', '状态:新建'],
  ): Promise<Artifact> {
    const newMeta: ArtifactMeta = {
      id: `art_${Math.random().toString(16).slice(2, 10)}`,
      name,
      filename,
      tags,
      currentRevision: 1,
      updatedAt: new Date().toISOString(),
    };

    if (this.dirHandle) {
      // 1. 写入 HTML 源文件
      const fileHandle = await this.dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      // 2. 建立 REV:1 初始版本快照
      await this.recordNegativeRevision(filename, 1, content, 'genesis', '初始版本');

      // 3. 记录元数据
      await this.saveMeta(newMeta);
    }

    return {
      meta: newMeta,
      sourceCode: content,
    };
  }

  public async scanArtifacts(): Promise<Artifact[]> {
    if (!this.dirHandle) {
      return this.getMockArtifacts();
    }

    const artifacts: Artifact[] = [];
    const metaMap = await this.readAllMeta();

    const entries = (
      this.dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> }
    ).values();

    for await (const entry of entries) {
      if (entry.kind === 'file' && entry.name.endsWith('.html')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        const text = await file.text();

        const meta = metaMap[entry.name] || {
          id: `art_${Math.random().toString(16).slice(2, 10)}`,
          name: entry.name.replace(/\.html$/, ''),
          filename: entry.name,
          tags: ['形态:原生html', '状态:未分类'],
          currentRevision: 1,
          updatedAt: new Date().toISOString(),
        };

        const posterBlobUrl = await this.loadPosterBlobUrl(entry.name);

        artifacts.push({
          meta,
          sourceCode: text,
          posterBlobUrl,
        });
      }
    }

    return artifacts;
  }

  public async saveArtifactSource(
    filename: string,
    newContent: string,
    revision: number,
    action: 'genesis' | 'patch' | 'rollback' = 'patch',
    description?: string,
  ): Promise<void> {
    if (!this.dirHandle) return;

    const fileHandle = await this.dirHandle.getFileHandle(filename, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(newContent);
    await writable.close();

    await this.recordNegativeRevision(filename, revision, newContent, action, description);
  }

  public async savePoster(filename: string, blob: Blob): Promise<string> {
    if (!this.dirHandle) {
      return URL.createObjectURL(blob);
    }

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const postersDir = await galleryDir.getDirectoryHandle(POSTERS_DIR, { create: true });
    const posterFilename = `${filename.replace(/\.html$/, '')}.webp`;
    const posterHandle = await postersDir.getFileHandle(posterFilename, {
      create: true,
    });

    const writable = await posterHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    return URL.createObjectURL(blob);
  }

  public async saveMeta(meta: ArtifactMeta): Promise<void> {
    if (!this.dirHandle) return;
    const allMeta = await this.readAllMeta();
    allMeta[meta.filename] = meta;

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const metaHandle = await galleryDir.getFileHandle(META_FILE, {
      create: true,
    });
    const writable = await metaHandle.createWritable();
    await writable.write(JSON.stringify(allMeta, null, 2));
    await writable.close();
  }

  /**
   * 局部更新工件元数据（如打标签、星级评分、工件别名等）
   */
  public async updateArtifactMeta(
    filename: string,
    partialMeta: Partial<ArtifactMeta>,
  ): Promise<ArtifactMeta> {
    const allMeta = await this.readAllMeta();
    const existing = allMeta[filename] || {
      id: `art_${Math.random().toString(16).slice(2, 10)}`,
      name: filename.replace(/\.html$/, ''),
      filename,
      tags: ['形态:原生html'],
      currentRevision: 1,
      updatedAt: new Date().toISOString(),
    };

    const updated: ArtifactMeta = {
      ...existing,
      ...partialMeta,
      updatedAt: new Date().toISOString(),
    };

    allMeta[filename] = updated;
    if (this.dirHandle) {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const metaHandle = await galleryDir.getFileHandle(META_FILE, { create: true });
      const writable = await metaHandle.createWritable();
      await writable.write(JSON.stringify(allMeta, null, 2));
      await writable.close();
    }
    return updated;
  }

  /**
   * 重命名工件（支持重命名物理文件与底片快照链迁移）
   */
  public async renameArtifact(
    oldFilename: string,
    newFilename: string,
    newName?: string,
  ): Promise<Artifact> {
    if (!this.dirHandle) {
      throw new Error('演示模式下暂不支持文件重命名');
    }

    const oldBase = oldFilename.replace(/\.html$/, '');
    const newBase = newFilename.replace(/\.html$/, '');

    // 1. 读取原工件内容
    const oldFileHandle = await this.dirHandle.getFileHandle(oldFilename);
    const oldFile = await oldFileHandle.getFile();
    const content = await oldFile.text();

    // 2. 写入新文件并移除旧文件
    const newFileHandle = await this.dirHandle.getFileHandle(newFilename, { create: true });
    const newWritable = await newFileHandle.createWritable();
    await newWritable.write(content);
    await newWritable.close();

    try {
      await (
        this.dirHandle as unknown as { removeEntry: (name: string) => Promise<void> }
      ).removeEntry(oldFilename);
    } catch (err) {
      console.warn('移除旧文件失败:', err);
    }

    // 3. 迁移底片目录 (negatives)
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR);
      try {
        const oldNegDir = await negativesDir.getDirectoryHandle(oldBase);
        const newNegDir = await negativesDir.getDirectoryHandle(newBase, { create: true });

        const entries = (
          oldNegDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
        ).values();
        for await (const entry of entries) {
          if (entry.kind === 'file') {
            const fHandle = entry as FileSystemFileHandle;
            const f = await fHandle.getFile();
            const text = await f.text();
            const destHandle = await newNegDir.getFileHandle(entry.name, { create: true });
            const destWritable = await destHandle.createWritable();
            await destWritable.write(text);
            await destWritable.close();
          }
        }
        await (
          negativesDir as unknown as {
            removeEntry: (name: string, opt: { recursive: boolean }) => Promise<void>;
          }
        ).removeEntry(oldBase, { recursive: true });
      } catch {
        // 原底片不存在时忽略
      }

      // 4. 迁移封面图 (posters)
      try {
        const postersDir = await galleryDir.getDirectoryHandle(POSTERS_DIR);
        const oldPosterHandle = await postersDir.getFileHandle(`${oldBase}.webp`);
        const oldPosterFile = await oldPosterHandle.getFile();
        const newPosterHandle = await postersDir.getFileHandle(`${newBase}.webp`, { create: true });
        const pWritable = await newPosterHandle.createWritable();
        await pWritable.write(await oldPosterFile.arrayBuffer());
        await pWritable.close();
        await (
          postersDir as unknown as { removeEntry: (name: string) => Promise<void> }
        ).removeEntry(`${oldBase}.webp`);
      } catch {
        // 无封面时忽略
      }
    } catch (err) {
      console.warn('迁移关联资源异常:', err);
    }

    // 5. 更新元数据索引
    const allMeta = await this.readAllMeta();
    const oldMeta = allMeta[oldFilename] || {
      id: `art_${Math.random().toString(16).slice(2, 10)}`,
      name: newName || newBase,
      filename: oldFilename,
      tags: ['形态:原生html'],
      currentRevision: 1,
      updatedAt: new Date().toISOString(),
    };

    delete allMeta[oldFilename];
    const newMeta: ArtifactMeta = {
      ...oldMeta,
      filename: newFilename,
      name: newName || oldMeta.name,
      updatedAt: new Date().toISOString(),
    };
    allMeta[newFilename] = newMeta;

    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const metaHandle = await galleryDir.getFileHandle(META_FILE, { create: true });
    const mWritable = await metaHandle.createWritable();
    await mWritable.write(JSON.stringify(allMeta, null, 2));
    await mWritable.close();

    const posterBlobUrl = await this.loadPosterBlobUrl(newFilename);

    return {
      meta: newMeta,
      sourceCode: content,
      posterBlobUrl,
    };
  }

  /**
   * 级联删除工件（删除 HTML 源码、封面、底片版本链与元数据）
   */
  public async deleteArtifact(filename: string): Promise<void> {
    if (!this.dirHandle) {
      throw new Error('演示模式下暂不支持物理删除');
    }

    const baseName = filename.replace(/\.html$/, '');

    // 1. 删除根目录 HTML 文件
    try {
      await (
        this.dirHandle as unknown as { removeEntry: (name: string) => Promise<void> }
      ).removeEntry(filename);
    } catch (err) {
      console.warn('删除 HTML 源文件失败:', err);
    }

    // 2. 清理关联底片与封面
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      try {
        const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR);
        await (
          negativesDir as unknown as {
            removeEntry: (name: string, opt: { recursive: boolean }) => Promise<void>;
          }
        ).removeEntry(baseName, { recursive: true });
      } catch {}

      try {
        const postersDir = await galleryDir.getDirectoryHandle(POSTERS_DIR);
        await (
          postersDir as unknown as { removeEntry: (name: string) => Promise<void> }
        ).removeEntry(`${baseName}.webp`);
      } catch {}

      // 3. 从元数据中移除
      const allMeta = await this.readAllMeta();
      if (allMeta[filename]) {
        delete allMeta[filename];
        const metaHandle = await galleryDir.getFileHandle(META_FILE, { create: true });
        const mWritable = await metaHandle.createWritable();
        await mWritable.write(JSON.stringify(allMeta, null, 2));
        await mWritable.close();
      }
    } catch (err) {
      console.warn('清理关联元数据失败:', err);
    }
  }

  public async recordNegativeRevision(
    filename: string,
    revision: number,
    content: string,
    action: 'genesis' | 'patch' | 'rollback' = 'patch',
    description?: string,
  ): Promise<void> {
    if (!this.dirHandle) return;
    const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
    const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR, { create: true });
    const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''), {
      create: true,
    });

    // 写入底片快照文件
    const revHandle = await baseDir.getFileHandle(
      `rev-${String(revision).padStart(4, '0')}.snapshot`,
      { create: true },
    );
    const writable = await revHandle.createWritable();
    await writable.write(content);
    await writable.close();

    // 更新底片台账 (Ledger)
    try {
      let ledger: NegativeLedgerEntry[] = [];
      try {
        const ledgerFile = await baseDir.getFileHandle(LEDGER_FILE);
        const file = await ledgerFile.getFile();
        ledger = JSON.parse(await file.text());
      } catch {
        ledger = [];
      }

      ledger = ledger.filter((item) => item.revision !== revision);
      ledger.push({
        revision,
        timestamp: new Date().toISOString(),
        action,
        description:
          description || (action === 'genesis' ? '初始版本' : `版本快照 REV:${revision}`),
      });
      ledger.sort((a, b) => a.revision - b.revision);

      const ledgerHandle = await baseDir.getFileHandle(LEDGER_FILE, { create: true });
      const ledgerWritable = await ledgerHandle.createWritable();
      await ledgerWritable.write(JSON.stringify(ledger, null, 2));
      await ledgerWritable.close();
    } catch (err) {
      console.warn('更新底片台账失败:', err);
    }
  }

  public async loadNegativeRevision(filename: string, revision: number): Promise<string | null> {
    if (!this.dirHandle) return null;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR);
      const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''));
      const revHandle = await baseDir.getFileHandle(
        `rev-${String(revision).padStart(4, '0')}.snapshot`,
      );
      const file = await revHandle.getFile();
      return await file.text();
    } catch {
      return null;
    }
  }

  /**
   * 获取指定工件底片链上的所有历史修订列表
   */
  public async listNegativeRevisions(filename: string): Promise<NegativeLedgerEntry[]> {
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

    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const negativesDir = await galleryDir.getDirectoryHandle(NEGATIVES_DIR);
      const baseDir = await negativesDir.getDirectoryHandle(filename.replace(/\.html$/, ''));

      try {
        const ledgerFile = await baseDir.getFileHandle(LEDGER_FILE);
        const file = await ledgerFile.getFile();
        const ledger: NegativeLedgerEntry[] = JSON.parse(await file.text());
        return ledger.sort((a, b) => b.revision - a.revision);
      } catch {
        // 台账不存在时扫描快照文件兜底
        const results: NegativeLedgerEntry[] = [];
        const entries = (
          baseDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
        ).values();
        for await (const entry of entries) {
          const match = entry.name.match(/^rev-(\d+)\.snapshot$/);
          if (match) {
            const rev = Number.parseInt(match[1], 10);
            results.push({
              revision: rev,
              timestamp: new Date().toISOString(),
              action: rev === 1 ? 'genesis' : 'patch',
              description: rev === 1 ? '初始版本' : `版本快照 REV:${rev}`,
            });
          }
        }
        return results.sort((a, b) => b.revision - a.revision);
      }
    } catch {
      return [];
    }
  }

  private async readAllMeta(): Promise<Record<string, ArtifactMeta>> {
    if (!this.dirHandle) return {};
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const metaHandle = await galleryDir.getFileHandle(META_FILE);
      const file = await metaHandle.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  private async loadPosterBlobUrl(filename: string): Promise<string | undefined> {
    if (!this.dirHandle) return undefined;
    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR);
      const postersDir = await galleryDir.getDirectoryHandle(POSTERS_DIR);
      const posterFilename = `${filename.replace(/\.html$/, '')}.webp`;
      const posterHandle = await postersDir.getFileHandle(posterFilename);
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
          id: 'art_fluid2d',
          name: '纳维-斯托克斯二维流体仿真',
          filename: 'fluid-simulation.html',
          tags: ['领域:图形学', '形态:webgl', '物理:流体', '模型:claude-3.5-sonnet'],
          currentRevision: 1,
          updatedAt: '2025-02-28T12:00:00Z',
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
