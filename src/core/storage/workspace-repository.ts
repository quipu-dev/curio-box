import { loadWorkspaceMetaFromIDB, persistWorkspaceMetaToIDB } from '@/core/storage/idb';
import type { WorkspaceMeta } from '@/types';
import { generateWorkspaceId } from '@/utils/id';

const GALLERY_DIR = '.gallery';
const WORKSPACE_FILE = 'workspace.json';

export class WorkspaceRepository {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  public setDirectoryHandle(handle: FileSystemDirectoryHandle | null): void {
    this.dirHandle = handle;
  }

  public async loadWorkspaceMeta(fallbackDirName?: string): Promise<WorkspaceMeta> {
    const cached = await loadWorkspaceMetaFromIDB();

    if (!this.dirHandle) {
      if (cached) return cached;
      return this.getMockWorkspace(fallbackDirName);
    }

    try {
      const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
      let meta: WorkspaceMeta | null = null;

      try {
        const fileHandle = await galleryDir.getFileHandle(WORKSPACE_FILE);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text) as WorkspaceMeta;
        if (parsed?.id && parsed?.name) {
          meta = parsed;
        }
      } catch {
        // 文件不存在或格式不完整，进入自愈创建
      }

      if (!meta) {
        meta = {
          schemaVersion: 1,
          id: cached?.id || generateWorkspaceId(),
          name: fallbackDirName || this.dirHandle.name || '我的标本工件库',
          description: '',
        };

        const fileHandle = await galleryDir.getFileHandle(WORKSPACE_FILE, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(meta, null, 2));
        await writable.close();
      }

      await persistWorkspaceMetaToIDB(meta);
      return meta;
    } catch (err) {
      console.warn('读取或初始化 workspace.json 失败:', err);
      if (cached) return cached;
      return this.getMockWorkspace(fallbackDirName);
    }
  }

  public async saveWorkspaceMeta(meta: WorkspaceMeta): Promise<void> {
    if (this.dirHandle) {
      try {
        const galleryDir = await this.dirHandle.getDirectoryHandle(GALLERY_DIR, { create: true });
        const fileHandle = await galleryDir.getFileHandle(WORKSPACE_FILE, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(meta, null, 2));
        await writable.close();
      } catch (err) {
        console.warn('写入 workspace.json 失败:', err);
        throw err;
      }
    }

    await persistWorkspaceMetaToIDB(meta);
  }

  public getMockWorkspace(fallbackDirName?: string): WorkspaceMeta {
    return {
      schemaVersion: 1,
      id: 'ws_demo_sandbox',
      name: fallbackDirName || '演示陈列室 (内存沙箱)',
      description:
        '当前处于未关联本地目录的演示状态，关联物理文件夹后将自动创建 workspace.json 并实时落盘。',
    };
  }
}
