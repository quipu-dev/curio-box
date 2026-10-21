import { MetaSealEngine } from '@/core/engine/meta-seal';
import { deleteCachedRecord, getAllCachedRecords, putCachedRecord } from '@/core/storage/idb';
import type { Artifact, ArtifactBundleMeta, CommitLogEntry, ProjectedIndexRecord } from '@/types';

const GALLERY_DIR = '.gallery';
const ARTIFACTS_DIR = 'artifacts';
const SNAPSHOTS_DIR = 'snapshots';
const META_FILE = 'meta.json';
const POSTER_FILE = 'poster.webp';

/**
 * 高性能安全文件写入辅助函数：显式关闭 keepExistingData 避免内核产生冗余数据拷贝
 */
async function writeHandleContent(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string | Blob,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  await writable.write(content);
  await writable.close();
}

export class ArtifactRepository {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private posterUrlMap: Map<string, string> = new Map();

  public setDirectoryHandle(handle: FileSystemDirectoryHandle | null): void {
    this.dirHandle = handle;
    this.cleanupPosterBlobUrls();
  }

  public cleanupPosterBlobUrls(): void {
    for (const url of this.posterUrlMap.values()) {
      URL.revokeObjectURL(url);
    }
    this.posterUrlMap.clear();
  }

  public async loadProjectedArtifacts(): Promise<Artifact[]> {
    if (!this.dirHandle) {
      return this.getMockArtifacts();
    }

    const records = await getAllCachedRecords();
    if (records.length === 0) {
      return this.reconcileWorkspace();
    }

    const artifacts: Artifact[] = [];
    for (const rec of records) {
      const posterUrl: string | undefined = this.posterUrlMap.get(rec.id);
      if (!posterUrl && rec.hasPoster) {
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

    const existingFilenamesInBundles = new Set(
      Array.from(bundleMap.values()).map((m) => m.filename),
    );

    for (const [htmlName] of rootHtmlMap.entries()) {
      if (!existingFilenamesInBundles.has(htmlName)) {
        try {
          const fileHandle = await this.dirHandle.getFileHandle(htmlName);
          const file = await fileHandle.getFile();
          const headChunk = await file.slice(0, 4096).text();
          const extracted = MetaSealEngine.extract(headChunk);

          const content = await file.text();
          const finalName = htmlName.replace(/\.html$/, '');
          const finalTags =
            extracted?.tags && extracted.tags.length > 0
              ? extracted.tags
              : ['形态:原生html', '状态:未分类'];
          const finalDesc = extracted?.description || '';

          const created = await this.createArtifact(
            htmlName,
            content,
            finalName,
            finalTags,
            finalDesc,
          );

          if (extracted?.rating) {
            created.meta.rating = extracted.rating;
            await this.saveMeta(created.meta);
          }

          bundleMap.set(created.meta.id, created.meta);
          bundlePosterMap.set(created.meta.id, false);
        } catch (e) {
          console.warn(`自愈初始化孤立工件沙盒失败 [${htmlName}]:`, e);
        }
      }
    }

    const resultArtifacts: Artifact[] = [];
    const activeBundleIds = new Set<string>();

    for (const [id, meta] of bundleMap.entries()) {
      if (!rootHtmlMap.has(meta.filename)) {
        continue;
      }

      activeBundleIds.add(id);
      const hasPoster = bundlePosterMap.get(id) ?? false;
      const htmlStats = rootHtmlMap.get(meta.filename);

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

  public async createArtifact(
    filename: string,
    content: string,
    name: string,
    tags: string[] = ['形态:原生html', '状态:新建'],
    description = '',
  ): Promise<Artifact> {
    const now = new Date().toISOString();
    const artifactId = `art_${Math.random().toString(16).slice(2, 10)}`;

    const genesisHistory: CommitLogEntry[] = [
      {
        revision: 1,
        timestamp: now,
        action: 'genesis',
        message: '初始版本',
      },
    ];

    const bundleMeta: ArtifactBundleMeta = {
      schemaVersion: 2,
      id: artifactId,
      name,
      filename,
      tags,
      description: description.trim() || undefined,
      currentRevision: 1,
      createdAt: now,
      updatedAt: now,
      history: genesisHistory,
    };

    if (this.dirHandle) {
      const pureContent = MetaSealEngine.strip(content);
      const stampedContent = MetaSealEngine.inject(pureContent, bundleMeta);

      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId, { create: true });
      const snapshotsDir = await bundleDir.getDirectoryHandle(SNAPSHOTS_DIR, { create: true });

      // 并发落盘：主 HTML 文件、初始快照底片、元数据 JSON
      await Promise.all([
        writeHandleContent(this.dirHandle, filename, stampedContent),
        writeHandleContent(snapshotsDir, 'rev-0001.snapshot', pureContent),
        writeHandleContent(bundleDir, META_FILE, JSON.stringify(bundleMeta, null, 2)),
      ]);

      putCachedRecord({
        id: artifactId,
        filename,
        htmlLastModified: Date.now(),
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

  public async commitRevision(params: {
    artifactId: string;
    filename: string;
    code?: string;
    revision: number;
    action?: 'genesis' | 'patch' | 'rollback';
    message: string;
    tags?: string[];
    description?: string;
  }): Promise<ArtifactBundleMeta> {
    const {
      artifactId,
      filename,
      code,
      revision,
      action = 'patch',
      message,
      tags,
      description,
    } = params;

    const now = new Date().toISOString();
    const existingMeta = await this.loadBundleMeta(artifactId);

    const baseMeta: ArtifactBundleMeta = existingMeta || {
      schemaVersion: 2,
      id: artifactId,
      name: filename.replace(/\.html$/, ''),
      filename,
      tags: tags || ['形态:原生html'],
      description,
      currentRevision: revision,
      createdAt: now,
      updatedAt: now,
      history: [],
    };

    const commitHistory = (baseMeta.history || []).filter((h) => h.revision !== revision);
    commitHistory.push({
      revision,
      timestamp: now,
      action,
      message: message.trim() || `版本快照 REV:${revision}`,
    });
    commitHistory.sort((a, b) => a.revision - b.revision);

    const updatedMeta: ArtifactBundleMeta = {
      ...baseMeta,
      currentRevision: revision,
      updatedAt: now,
      history: commitHistory,
      ...(tags ? { tags } : {}),
      ...(description !== undefined ? { description } : {}),
    };

    if (this.dirHandle) {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      const artifactsDir = await galleryDir.getDirectoryHandle(ARTIFACTS_DIR, { create: true });
      const bundleDir = await artifactsDir.getDirectoryHandle(artifactId, { create: true });

      const writeTasks: Promise<void>[] = [];

      if (code !== undefined) {
        const pureCode = MetaSealEngine.strip(code);
        const snapshotsDir = await bundleDir.getDirectoryHandle(SNAPSHOTS_DIR, { create: true });
        const snapFilename = `rev-${String(revision).padStart(4, '0')}.snapshot`;
        const stampedContent = MetaSealEngine.inject(pureCode, updatedMeta);

        writeTasks.push(writeHandleContent(snapshotsDir, snapFilename, pureCode));
        writeTasks.push(writeHandleContent(this.dirHandle, filename, stampedContent));
      }

      writeTasks.push(
        writeHandleContent(bundleDir, META_FILE, JSON.stringify(updatedMeta, null, 2)),
      );

      // 并发执行所有关联文件的落盘
      await Promise.all(writeTasks);

      putCachedRecord({
        id: updatedMeta.id,
        filename: updatedMeta.filename,
        htmlLastModified: 0,
        bundleLastModified: new Date(now).getTime(),
        meta: updatedMeta,
        hasPoster: this.posterUrlMap.has(updatedMeta.id),
      }).catch(() => {});
    }

    return updatedMeta;
  }

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

    try {
      const fileHandle = await this.dirHandle?.getFileHandle(filename);
      if (fileHandle) {
        const file = await fileHandle.getFile();
        const currentHtml = await file.text();
        const stamped = MetaSealEngine.inject(currentHtml, updated);
        const writable = await fileHandle.createWritable();
        await writable.write(stamped);
        await writable.close();
      }
    } catch (e) {
      console.warn(`同步更新 HTML 文件符印失败 [${filename}]:`, e);
    }

    return updated;
  }

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

  public async deleteArtifact(filename: string): Promise<void> {
    if (!this.dirHandle) {
      throw new Error('演示模式下暂不支持物理删除');
    }

    const artifactId = await this.findArtifactIdByFilename(filename);

    try {
      await (
        this.dirHandle as unknown as { removeEntry: (name: string) => Promise<void> }
      ).removeEntry(filename);
    } catch (err) {
      console.warn('删除 HTML 源码失败:', err);
    }

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

  public async ensureGenesisSnapshot(artifactId: string, initialContent: string): Promise<void> {
    if (!this.dirHandle) return;
    try {
      const existingRev1 = await this.loadNegativeRevision(artifactId, 1);
      if (!existingRev1) {
        await this.commitRevision({
          artifactId,
          filename: '',
          code: initialContent,
          revision: 1,
          action: 'genesis',
          message: '初始版本',
        });
      }
    } catch (err) {
      console.warn('初始版本检验或写入异常:', err);
    }
  }

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

  public async listNegativeRevisions(artifactId: string): Promise<CommitLogEntry[]> {
    if (!this.dirHandle) {
      return [
        {
          revision: 1,
          timestamp: new Date().toISOString(),
          action: 'genesis',
          message: '示例版本',
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

  public async findArtifactIdByFilename(filename: string): Promise<string | null> {
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
              message: '初始版本',
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
