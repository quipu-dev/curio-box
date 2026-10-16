我将为您生成修复方案并构建一套更符合暗房哲学的非破坏性快照（Negative Ledger & Genesis Snapshot）机制。

## [WIP] fix: 修复暗房创世底片缺失并重构非破坏性快照链机制

### 错误分析
在原有暗房存储机制中存在以下核心设计缺陷：
1. **创世底片断层 (Genesis Gap)**：在工件首次纳管扫描时（`scanArtifacts`），系统仅将元数据默认赋为 `currentRevision: 1`，但未在物理磁盘 `.gallery/negatives/<name>/` 下创建 `rev-0001.snapshot`。
2. **时序与语义倒错**：首次应用差量补丁时，系统直接保存 `rev-0002.snapshot`（存储修改后的代码），导致当用户尝试执行一阶回滚读取 REV 1 时，磁盘无该文件，导致回滚直接崩溃且工件初始状态不可挽回地丢失。
3. **破坏性覆盖**：回滚直接缩减 `currentRevision` 指针，再次应用补丁会直接覆盖同版本快照文件，破坏了历史线性。

### 用户需求
1. 修复磁盘缺失 `rev-0001.snapshot` 的问题，确保无论何时工件均有不可篡改的初始底片备份。
2. 建立更符合直觉的暗房胶卷快照机制，提供完整透明的历史底片清单展示与安全无损的还原能力。

### 评论
将“一维破坏性倒退”重构为“非破坏性前向跃迁（Non-destructive Forward Rollback）”并补齐“创世底片自动封印”，不仅彻底杜绝代码丢失风险，还大幅提升了工件实验的探索自由度。

### 目标
1. 在类型系统与存储层中引入底片台账机制（`NegativeLedgerEntry`），支持记录版本号、生成动作与时间戳。
2. 在 `fs-storage.ts` 中实现创世快照固化逻辑（`ensureGenesisSnapshot`）与全量底片版本枚举（`listNegativeRevisions`）。
3. 改造 `DarkroomStudio.tsx`，将单薄的“一阶回滚”升级为多版本可视化胶卷流水线，支持安全还原任意历史底片。

### 基本原理
- **创世自动落盘**：工件被载入或首次操作时，若检测到底片目录下不存在 `rev-0001.snapshot`，立即将当前原生源码持久化为 0001 号底片，并写入底片台账。
- **Git-Revert 风格的无损还原**：恢复历史底片时，不破坏性修改版本号指针，而是将目标历史底片作为新的一轮修订（例如从 REV 3 还原 REV 1，则生成 `REV 4 [还原自 REV 1]` 并落盘），保证历史链条单调递增，杜绝覆写。

### 标签
#intent/fix #flow/ready #priority/high #comp/engine #concept/history #scope/core #scope/ux #ai/instruct #task/domain/storage #task/object/negative-chain #task/action/refactor #task/state/begin

---

### Script

#### Acts 1: 扩展类型定义以支持底片台账与快照元数据

在 `types/index.ts` 中补充底片快照条目与来源动作类型。

~~~~~act
patch_file
src/types/index.ts
~~~~~
~~~~~typescript.old
export interface NegativeRevision {
  revision: number;
  timestamp: string;
  type: 'snapshot' | 'patch';
  content: string;
}
~~~~~
~~~~~typescript.new
export interface NegativeLedgerEntry {
  revision: number;
  timestamp: string;
  action: 'genesis' | 'patch' | 'rollback';
  description?: string;
}

export interface NegativeRevision {
  revision: number;
  timestamp: string;
  type: 'snapshot' | 'patch';
  content: string;
}
~~~~~

#### Acts 2: 存储层增加创世底片固化、台账日志与历史快照版本索引

重写 `src/layer2_darkroom/storage/fs-storage.ts`，加入创世快照检查（`ensureGenesisSnapshot`）、底片台账持久化以及完整的快照版本查询。

~~~~~act
write_file
src/layer2_darkroom/storage/fs-storage.ts
~~~~~
~~~~~typescript
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
        await this.recordNegativeRevision(
          filename,
          1,
          initialContent,
          'genesis',
          '初始导入原生底片',
        );
      }
    } catch (err) {
      console.warn('创世底片检验或写入异常:', err);
    }
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

        // 自动固化创世底片
        await this.ensureGenesisSnapshot(entry.name, text);

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
        description: description || (action === 'genesis' ? '创世底片' : `底片快照 REV:${revision}`),
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
          description: '内置演示底片',
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
              description: rev === 1 ? '创世原生底片' : `快照 REV:${rev}`,
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
~~~~~

#### Acts 3: 改造 DarkroomStudio 的底片链历史与非破坏性安全回滚

重构 `src/layer3_gallery/components/DarkroomStudio.tsx`，在打补丁前校验创世底片，在底片链历史中展示直观的胶卷流水线，并支持将任意历史版本作为全新快照安全复原。

~~~~~act
write_file
src/layer3_gallery/components/DarkroomStudio.tsx
~~~~~
~~~~~typescript
import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { AssetCacheEngine, type AssetCacheStats } from '@/layer2_darkroom/engine/asset-cache';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { DarkroomApplier, DarkroomPatchFSM } from '@/layer2_darkroom/fsm/patch-fsm';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import type { Artifact, NegativeLedgerEntry } from '@/types';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  History,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Tag as TagIcon,
  Undo2,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DarkroomStudioProps {
  artifact: Artifact | null;
  onBackToGallery: () => void;
  onOpenStage: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

type TabType = 'patch' | 'history' | 'assets';

export const DarkroomStudio: React.FC<DarkroomStudioProps> = ({
  artifact,
  onBackToGallery,
  onOpenStage,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isActivated, setIsActivated] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>('patch');
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(true);
  const [aspectRatio, setAspectRatio] = useState<'fill' | '16/9' | '4/3'>('fill');
  const [patchInput, setPatchInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [assetStats, setAssetStats] = useState<AssetCacheStats | null>(null);
  const [historyLedger, setHistoryLedger] = useState<NegativeLedgerEntry[]>([]);

  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);

  // 加载底片链历史清单
  const refreshHistory = useCallback(async () => {
    const list = await galleryStorage.listNegativeRevisions(artifact.meta.filename);
    setHistoryLedger(list);
  }, [artifact.meta.filename]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // 挂载时自动探查工件中的外部 CDN 资源
  useEffect(() => {
    const assets = AssetCacheEngine.detectExternalAssets(artifact.sourceCode);
    Promise.all(assets.map((a) => AssetCacheEngine.isCached(a.url))).then((results) => {
      const cachedCount = results.filter(Boolean).length;
      setAssetStats({
        total: assets.length,
        cached: cachedCount,
        assets: assets.map((a, i) => ({
          ...a,
          status: results[i] ? 'cached' : 'pending',
        })),
      });
    });
  }, [artifact.sourceCode]);

  // 截屏定格快照
  const handleCapturePoster = async () => {
    if (!captureHandleRef.current) {
      setStatusMessage('请等待沙箱装载完毕后再进行定格');
      return;
    }
    try {
      setStatusMessage('正在定格无损封印快照...');
      const blob = await captureHandleRef.current();
      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      setStatusMessage('定格封印成功！封面已同步更新。');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`定格失败: ${msg}`);
    }
  };

  // 复制带格式的完整提示词上下文
  const handleCopyPromptContext = () => {
    const prompt = `请针对以下工件代码提供修改差量。请严格遵循 patch_file 指令协议输出，示例如下：

\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被替换的精确原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

当前工件【${artifact.meta.name}】源码：
\`\`\`html
${artifact.sourceCode}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 应用 FSM 差量补丁
  const handleApplyPatch = async () => {
    if (!patchInput.trim()) {
      setStatusMessage('请粘贴包含 act、old_doc、new_doc 的补丁文本');
      return;
    }

    try {
      // 预先确保基础原生底片落盘
      await galleryStorage.ensureGenesisSnapshot(artifact.meta.filename, artifact.sourceCode);

      const fsm = new DarkroomPatchFSM();
      const commands = fsm.parse(patchInput);

      if (commands.length === 0) {
        throw new Error('未能识别到有效的补丁指令块，请检查围栏语法');
      }

      let nextCode = artifact.sourceCode;
      for (const cmd of commands) {
        nextCode = DarkroomApplier.apply(nextCode, cmd);
      }

      const nextRev = artifact.meta.currentRevision + 1;
      await galleryStorage.saveArtifactSource(
        artifact.meta.filename,
        nextCode,
        nextRev,
        'patch',
        `AI 差量注入应用`,
      );

      const updatedMeta = {
        ...artifact.meta,
        currentRevision: nextRev,
        updatedAt: new Date().toISOString(),
      };
      await galleryStorage.saveMeta(updatedMeta);

      const updated: Artifact = {
        ...artifact,
        sourceCode: nextCode,
        meta: updatedMeta,
      };

      onUpdateArtifact(updated);
      setPatchInput('');
      setStatusMessage(`差量补丁已应用！底片链跃迁至 REV:${nextRev}`);
      await refreshHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`应用失败: ${msg}`);
    }
  };

  // 非破坏性安全还原至指定历史底片
  const handleRestoreRevision = async (targetRev: number) => {
    const historicalContent = await galleryStorage.loadNegativeRevision(
      artifact.meta.filename,
      targetRev,
    );

    if (!historicalContent) {
      setStatusMessage(`未找到 REV:${targetRev} 的物理底片快照`);
      return;
    }

    const nextRev = artifact.meta.currentRevision + 1;
    await galleryStorage.saveArtifactSource(
      artifact.meta.filename,
      historicalContent,
      nextRev,
      'rollback',
      `非破坏性还原自 REV:${targetRev}`,
    );

    const updatedMeta = {
      ...artifact.meta,
      currentRevision: nextRev,
      updatedAt: new Date().toISOString(),
    };
    await galleryStorage.saveMeta(updatedMeta);

    const updated: Artifact = {
      ...artifact,
      sourceCode: historicalContent,
      meta: updatedMeta,
    };

    onUpdateArtifact(updated);
    setStatusMessage(`安全还原成功：已将 REV:${targetRev} 映射并跃迁为 REV:${nextRev}`);
    await refreshHistory();
  };

  // 手动一键预缓存外链资产
  const handleCacheAllAssets = async () => {
    if (!assetStats || assetStats.total === 0) return;
    setStatusMessage('正在离线化下载所有外部 CDN 资源...');
    for (const asset of assetStats.assets) {
      await AssetCacheEngine.cacheAsset(asset.url);
    }
    const freshAssets = AssetCacheEngine.detectExternalAssets(artifact.sourceCode);
    const results = await Promise.all(freshAssets.map((a) => AssetCacheEngine.isCached(a.url)));
    setAssetStats({
      total: freshAssets.length,
      cached: results.filter(Boolean).length,
      assets: freshAssets.map((a, i) => ({
        ...a,
        status: results[i] ? 'cached' : 'failed',
      })),
    });
    setStatusMessage('外链静态资源已全部注入本地持久缓存！');
  };

  return (
    <div className="fixed inset-0 z-40 bg-background text-main flex flex-col overflow-hidden select-none">
      {/* 顶部控制栏 */}
      <header className="h-13 bg-surface border-b border-border px-4 flex justify-between items-center gap-4 text-xs font-mono shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToGallery}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded hover:bg-background transition-colors text-muted hover:text-main"
            title="返回展厅画廊"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>展厅</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="font-bold text-sm font-sans truncate max-w-xs md:max-w-md">
              {artifact.meta.name}
            </span>
            <span className="bg-tag px-2 py-0.5 rounded text-[11px] font-semibold text-main border border-border">
              REV:{artifact.meta.currentRevision}
            </span>
          </div>
        </div>

        {/* 视口参数与动作控制 */}
        <div className="flex items-center gap-2.5">
          {assetStats && assetStats.total > 0 && (
            <div
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
                assetStats.cached === assetStats.total
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>
                CDN 缓存: {assetStats.cached}/{assetStats.total}
              </span>
            </div>
          )}

          <div className="hidden md:flex items-center border border-border rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setAspectRatio('fill')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === 'fill'
                  ? 'bg-zinc-800 text-white'
                  : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              自由铺满
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('16/9')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === '16/9'
                  ? 'bg-zinc-800 text-white'
                  : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              16:9
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('4/3')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === '4/3' ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              4:3
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsActivated(!isActivated)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors text-xs font-mono ${
              isActivated
                ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            {isActivated ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isActivated ? '湮灭' : '活体激活'}</span>
          </button>

          <button
            type="button"
            onClick={handleCapturePoster}
            disabled={!isActivated}
            className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border disabled:opacity-40"
            title="捕获当前帧为静态封面快照"
          >
            <Camera className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:inline">定格封印</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenStage(artifact)}
            className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border"
            title="切换至全屏放映舞台"
          >
            <Maximize2 className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:inline">放映舞台</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className="p-1.5 border border-border rounded hover:bg-border text-muted hover:text-main"
            title={isConsoleOpen ? '收起暗房操作台 (大视口优先)' : '展开暗房操作台'}
          >
            {isConsoleOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* 主体视口与控制台 */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 bg-black p-3 md:p-6 flex items-center justify-center overflow-hidden">
          <SandboxViewport
            htmlPayload={artifact.sourceCode}
            isActivated={isActivated}
            aspectRatio={aspectRatio}
            onCaptureReady={(cb) => {
              captureHandleRef.current = cb;
            }}
          />
        </div>

        {isConsoleOpen && (
          <aside className="w-full md:w-[460px] lg:w-[500px] bg-surface border-l border-border flex flex-col shrink-0 overflow-hidden shadow-2xl">
            <div className="h-10 bg-background border-b border-border flex text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('patch')}
                className={`flex-1 flex items-center justify-center gap-1.5 border-r border-border transition-colors ${
                  activeTab === 'patch'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>AI 差量注入</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 flex items-center justify-center gap-1.5 border-r border-border transition-colors ${
                  activeTab === 'history'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <History className="w-3.5 h-3.5 text-amber-400" />
                <span>底片链历史</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('assets')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'assets'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>标本与缓存</span>
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 text-xs font-mono">
              {activeTab === 'patch' && (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-muted tracking-wider">
                      提示词协同与 Patch FSM
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPromptContext}
                      className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copied ? '已复制源码上下文！' : '复制大模型提示词上下文'}</span>
                    </button>
                  </div>

                  <textarea
                    value={patchInput}
                    onChange={(e) => setPatchInput(e.target.value)}
                    placeholder={`粘贴大模型生成的差量代码块：
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被精准替换的原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\``}
                    className="flex-1 min-h-[300px] w-full bg-code text-zinc-300 border border-border p-3.5 font-mono text-[11px] rounded outline-none resize-none leading-relaxed"
                  />

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleApplyPatch}
                      className="w-full bg-main text-surface font-semibold py-2.5 rounded text-xs hover:opacity-90 transition-opacity"
                    >
                      应用差量补丁并推入底片链 (REV:{artifact.meta.currentRevision + 1})
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-background border border-border p-3 rounded">
                    <div className="text-[10px] uppercase text-muted tracking-wider mb-1">
                      当前活跃底片锚点
                    </div>
                    <div className="text-sm font-bold text-main">
                      REV:{artifact.meta.currentRevision}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      最后更新：{new Date(artifact.meta.updatedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-muted text-[11px] leading-relaxed">
                    所有底片快照均以无损物理文件永久归档。点击任意历史快照即可执行
                    <span className="text-amber-400">非破坏性前向还原</span>
                    （不会抹除已有历史）。
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <div className="text-[10px] uppercase text-muted tracking-wider">
                      底片快照胶卷（{historyLedger.length} 个锚点）
                    </div>

                    <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
                      {historyLedger.map((item) => {
                        const isCurrent = item.revision === artifact.meta.currentRevision;
                        return (
                          <div
                            key={item.revision}
                            className={`p-2.5 rounded border text-xs flex items-center justify-between transition-colors ${
                              isCurrent
                                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                                : 'bg-background border-border text-zinc-300'
                            }`}
                          >
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold font-mono">REV:{item.revision}</span>
                                {item.action === 'genesis' && (
                                  <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.2 rounded border border-sky-500/30">
                                    创世底片
                                  </span>
                                )}
                                {item.action === 'rollback' && (
                                  <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/30">
                                    还原锚点
                                  </span>
                                )}
                                {isCurrent && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded">
                                    当前视口
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-muted truncate max-w-[240px]">
                                {item.description || new Date(item.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            {!isCurrent && (
                              <button
                                type="button"
                                onClick={() => handleRestoreRevision(item.revision)}
                                className="flex items-center gap-1 border border-border px-2 py-1 rounded hover:bg-border text-[11px] text-main shrink-0"
                                title={`将 REV:${item.revision} 作为新版本还原`}
                              >
                                <Undo2 className="w-3 h-3 text-amber-400" />
                                <span>安全还原</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'assets' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-background border border-border p-3 rounded">
                    <div className="text-[10px] uppercase text-muted tracking-wider mb-2">
                      工件标本分类与标签
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {artifact.meta.tags.map((rawTag) => {
                        const parsed = TagQueryEngine.parseTag(rawTag);
                        return (
                          <span
                            key={rawTag}
                            className="inline-flex items-center bg-tag border border-border px-2 py-0.5 text-[11px] rounded"
                          >
                            <TagIcon className="w-2.5 h-2.5 text-muted mr-1" />
                            {parsed.namespace && (
                              <span className="text-muted">{parsed.namespace}:</span>
                            )}
                            <span className="font-medium text-main">{parsed.value}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-background border border-border p-3 rounded flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-muted tracking-wider">
                        外部 CDN 依赖与本地保鲜池
                      </span>
                      {assetStats && (
                        <span className="text-[11px] font-semibold text-sky-400">
                          {assetStats.cached}/{assetStats.total} 已缓存
                        </span>
                      )}
                    </div>

                    {assetStats && assetStats.assets.length > 0 ? (
                      <div className="flex flex-col gap-1.5 mt-1 max-h-48 overflow-y-auto">
                        {assetStats.assets.map((asset) => (
                          <div
                            key={asset.url}
                            className="flex items-center justify-between p-2 bg-surface border border-border rounded text-[11px]"
                          >
                            <span className="truncate max-w-[280px] text-zinc-300 font-mono">
                              {asset.url.split('/').pop()}
                            </span>
                            {asset.status === 'cached' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 shrink-0">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>已离线</span>
                              </span>
                            ) : (
                              <span className="text-amber-400 shrink-0">未缓存</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted text-[11px]">
                        未探测到外部 CDN 依赖（纯原生工件）
                      </div>
                    )}

                    {assetStats && assetStats.cached < assetStats.total && (
                      <button
                        type="button"
                        onClick={handleCacheAllAssets}
                        className="w-full mt-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 py-1.5 rounded text-xs hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>一键全量持久化至本地 Cache</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {statusMessage && (
                <div className="p-2.5 bg-background border border-border rounded text-[11px] text-muted flex items-start gap-1.5 animate-in fade-in">
                  <History className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                  <span className="text-main">{statusMessage}</span>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
~~~~~

### 下一步建议
1. **测试校验**：运行 `pnpm check` 验证 TypeScript 编译与 Biome 代码规范。
2. **实机验证**：在暗房中对工件注入一次差量补丁，检查磁盘上 `.gallery/negatives/<artifact>/` 是否已同时拥有 `rev-0001.snapshot` 和 `rev-0002.snapshot`，并尝试点击“安全还原”验证非破坏性前向版本跃迁效果。
