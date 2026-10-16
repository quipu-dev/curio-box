我将为你实现：
1. **浮动坞位置持久化**：将最后吸附的边缘形态（`top` / `bottom` / `left` / `right`）与坐标持久化至本地存储，下次打开工件或刷新后精准复位。
2. **工件目录持久化保持**：利用 IndexedDB 存储 `FileSystemDirectoryHandle`，刷新后自动尝试无感恢复挂载；若浏览器要求二次安全授权，提供一键重新连接按钮，彻底免除反复打开系统文件选择器的繁琐。

## [WIP] feat: 实现浮动坞位置记忆与工件目录刷新自动保持

### 用户需求
1. 浮动坞被拖拽吸附后的位置与边缘朝向需要持久保存，下次进入全屏展演或刷新后自动复用该位置。
2. 实现文件夹挂载保持功能：用户挂载本地工件目录后，页面刷新依然能记住该目录并恢复扫描打开。

### 评论
浏览器标准的 File System Access API 无法将对象句柄存在常规的 LocalStorage 中，但在标准 W3C 规范中，`FileSystemHandle` 是原生支持保存在 IndexedDB 中的。通过将目录句柄存入轻量级 IndexedDB，并配合会话恢复与权限自动检测机制，可以实现如同原生桌面 App 般“一次挂载、长久保持”的绝佳开发体验。

### 目标
1. 建立轻量级 IndexedDB 驱动，存取活动工件目录 `FileSystemDirectoryHandle`。
2. `App.tsx` 初始化时自动探测已保存的目录句柄与权限状态（`queryPermission`），若已授权则无感自动挂载，若需交互则提供一键恢复通道。
3. 在 `FullscreenStage` 中接入 `localStorage` 对吸附边缘及坐标的持久化存取。

### 基本原理
- **IndexedDB 句柄序列化**：浏览器在结构化克隆算法（Structured Clone）中原生支持 `FileSystemDirectoryHandle`。我们在暗房存储层通过微型 IDB 事务存储活动句柄。
- **权限安全生命周期**：页面加载时静默调用 `handle.queryPermission({ mode: 'readwrite' })`，Chrome 等现代浏览器常态下将直接返回 `'granted'`；若返回 `'prompt'`，则由用户手势一键触发 `handle.requestPermission()` 激活，无需重开文件选择框。
- **浮动坞状态缓存**：在吸附判定完成时，将 `{ edge, position }` 写入本地缓存，初始化时读取并进行屏幕边界容错矫正。

### 标签
#intent/build #flow/ready #priority/high #comp/storage #comp/ui #concept/state #scope/dx #scope/ux #ai/instruct #task/domain/storage #task/object/directory-persistence #task/action/implementation #task/state/continue

---

### Script

#### Acts 1: 在存储层增加 IndexedDB 句柄存取机制

在 `src/layer2_darkroom/storage/fs-storage.ts` 中封装轻量 IDB 存取逻辑，并在 `GalleryStorage` 中提供持久化支持。

~~~~~act
patch_file
src/layer2_darkroom/storage/fs-storage.ts
~~~~~
~~~~~typescript.old
const GALLERY_DIR = '.gallery';
const POSTERS_DIR = 'posters';
const NEGATIVES_DIR = 'negatives';
const META_FILE = 'meta.json';

export class GalleryStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;

  public setDirectoryHandle(handle: FileSystemDirectoryHandle): void {
    this.dirHandle = handle;
  }

  public hasHandle(): boolean {
    return this.dirHandle !== null;
  }
~~~~~
~~~~~typescript.new
const GALLERY_DIR = '.gallery';
const POSTERS_DIR = 'posters';
const NEGATIVES_DIR = 'negatives';
const META_FILE = 'meta.json';
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
    // 异步写入持久化存储
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
      // 检验是否仍保有读写权限
      const perm = await (saved as unknown as {
        queryPermission: (opt: { mode: string }) => Promise<PermissionState>;
      }).queryPermission({ mode: 'readwrite' });

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
~~~~~

#### Acts 2: 浮动坞吸附位置与边缘形态的持久化存取

修改 `src/layer3_gallery/components/FullscreenStage.tsx`：读取 `localStorage` 初始化位置与形态，吸附变更时同步写入存储。

~~~~~act
patch_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~typescript.old
type DockEdge = 'top' | 'bottom' | 'left' | 'right';

interface FullscreenStageProps {
  artifact: Artifact | null;
  onClose: () => void;
  onOpenDarkroom: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

export const FullscreenStage: React.FC<FullscreenStageProps> = ({
  artifact,
  onClose,
  onOpenDarkroom,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dockEdge, setDockEdge] = useState<DockEdge>('top');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 300,
    y: 0,
  });
~~~~~
~~~~~typescript.new
type DockEdge = 'top' | 'bottom' | 'left' | 'right';

interface SavedDockState {
  edge: DockEdge;
  position: { x: number; y: number };
}

const DOCK_STORAGE_KEY = 'curio_dock_state_v1';

function getInitialDockState(): SavedDockState {
  if (typeof window === 'undefined') {
    return { edge: 'top', position: { x: 300, y: 0 } };
  }
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedDockState;
      if (parsed.edge && parsed.position) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        // 边界安全校验，避免分辨率变化后飞出可视区域
        const safeX = Math.max(0, Math.min(w, parsed.position.x));
        const safeY = Math.max(0, Math.min(h, parsed.position.y));
        return { edge: parsed.edge, position: { x: safeX, y: safeY } };
      }
    }
  } catch {
    // 容错处理
  }
  return { edge: 'top', position: { x: window.innerWidth / 2, y: 0 } };
}

interface FullscreenStageProps {
  artifact: Artifact | null;
  onClose: () => void;
  onOpenDarkroom: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

export const FullscreenStage: React.FC<FullscreenStageProps> = ({
  artifact,
  onClose,
  onOpenDarkroom,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [initialDock] = useState<SavedDockState>(getInitialDockState);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dockEdge, setDockEdge] = useState<DockEdge>(initialDock.edge);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(initialDock.position);
~~~~~

~~~~~act
patch_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~typescript.old
        const minDist = Math.min(distTop, distBottom, distLeft, distRight);

        if (minDist === distTop) {
          setDockEdge('top');
          setPosition({ x: Math.max(160, Math.min(w - 160, curX)), y: 0 });
        } else if (minDist === distBottom) {
          setDockEdge('bottom');
          setPosition({ x: Math.max(160, Math.min(w - 160, curX)), y: h });
        } else if (minDist === distLeft) {
          setDockEdge('left');
          setPosition({ x: 0, y: Math.max(120, Math.min(h - 120, curY)) });
        } else {
          setDockEdge('right');
          setPosition({ x: w, y: Math.max(120, Math.min(h - 120, curY)) });
        }
      }
    }
~~~~~
~~~~~typescript.new
        const minDist = Math.min(distTop, distBottom, distLeft, distRight);

        let targetEdge: DockEdge = 'top';
        let targetPos = { x: curX, y: curY };

        if (minDist === distTop) {
          targetEdge = 'top';
          targetPos = { x: Math.max(160, Math.min(w - 160, curX)), y: 0 };
        } else if (minDist === distBottom) {
          targetEdge = 'bottom';
          targetPos = { x: Math.max(160, Math.min(w - 160, curX)), y: h };
        } else if (minDist === distLeft) {
          targetEdge = 'left';
          targetPos = { x: 0, y: Math.max(120, Math.min(h - 120, curY)) };
        } else {
          targetEdge = 'right';
          targetPos = { x: w, y: Math.max(120, Math.min(h - 120, curY)) };
        }

        setDockEdge(targetEdge);
        setPosition(targetPos);

        // 磁吸位置持久化到本地存储
        try {
          localStorage.setItem(
            DOCK_STORAGE_KEY,
            JSON.stringify({ edge: targetEdge, position: targetPos }),
          );
        } catch {
          // 容错处理
        }
      }
    }
~~~~~

#### Acts 3: 在 App 初始化流程中自动恢复文件夹与提供一键重新连接

修改 `src/App.tsx` 与 `src/layer3_gallery/components/Header.tsx`：
1. 页面启动时调用 `galleryStorage.restoreSavedHandle()`；
2. 若已具备权限则无缝直接载入真实工件；
3. 若需二次唤起授权，在 Header 顶部高亮显示“恢复目录授权”，点击即可激活，无需再次选择路径。

~~~~~act
patch_file
src/layer3_gallery/components/Header.tsx
~~~~~
~~~~~typescript.old
interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onPickDirectory: () => void;
  hasDirectory: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onPickDirectory,
  hasDirectory,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-4 flex flex-wrap gap-4 justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="font-bold text-lg tracking-tight">
          curio-box{' '}
          <span className="text-muted font-normal text-sm font-mono">{'// 视觉工件画廊'}</span>
        </div>
      </div>
~~~~~
~~~~~typescript.new
interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onPickDirectory: () => void;
  hasDirectory: boolean;
  pendingDirectoryName?: string;
  onRequestPendingPermission?: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onPickDirectory,
  hasDirectory,
  pendingDirectoryName,
  onRequestPendingPermission,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="sticky top-0 z-10 bg-surface border-b border-border px-6 py-4 flex flex-wrap gap-4 justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="font-bold text-lg tracking-tight">
          curio-box{' '}
          <span className="text-muted font-normal text-sm font-mono">{'// 视觉工件画廊'}</span>
        </div>
      </div>
~~~~~

~~~~~act
patch_file
src/layer3_gallery/components/Header.tsx
~~~~~
~~~~~typescript.old
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPickDirectory}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono hover:bg-border transition-colors rounded"
        >
          <FolderOpen className="w-3.5 h-3.5 text-muted" />
          <span>{hasDirectory ? '切换本地目录' : '打开工件目录'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="border border-border p-2 text-xs hover:bg-border transition-colors rounded"
          title="切换深色/浅色模式"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-yellow-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </button>
      </div>
~~~~~
~~~~~typescript.new
      <div className="flex items-center gap-3">
        {/* 如果有上次挂载且待重新授权的目录，提供一键重新连接按钮 */}
        {pendingDirectoryName && !hasDirectory && onRequestPendingPermission && (
          <button
            type="button"
            onClick={onRequestPendingPermission}
            className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/40 text-sky-400 px-3 py-1.5 text-xs font-mono hover:bg-sky-500/20 transition-colors rounded animate-pulse"
            title="点击恢复上次挂载目录的读取授权"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>恢复关联目录: {pendingDirectoryName}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onPickDirectory}
          className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono hover:bg-border transition-colors rounded"
        >
          <FolderOpen className="w-3.5 h-3.5 text-muted" />
          <span>{hasDirectory ? '切换本地目录' : '打开工件目录'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          className="border border-border p-2 text-xs hover:bg-border transition-colors rounded"
          title="切换深色/浅色模式"
        >
          {theme === 'dark' ? (
            <Sun className="w-3.5 h-3.5 text-yellow-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </button>
      </div>
~~~~~

~~~~~act
patch_file
src/App.tsx
~~~~~
~~~~~typescript.old
export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 网页全屏展演中的工件（默认点击打开时直接进入）
  const [fullscreenArtifact, setFullscreenArtifact] = useState<Artifact | null>(null);
  // 暗房编辑器中的工件
  const [darkroomArtifact, setDarkroomArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const loadArtifacts = useCallback(async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  }, []);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);
~~~~~
~~~~~typescript.new
export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 网页全屏展演中的工件（默认点击打开时直接进入）
  const [fullscreenArtifact, setFullscreenArtifact] = useState<Artifact | null>(null);
  // 暗房编辑器中的工件
  const [darkroomArtifact, setDarkroomArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const loadArtifacts = useCallback(async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  }, []);

  // 页面启动时自动尝试恢复已持久化的文件夹
  useEffect(() => {
    let isCancelled = false;
    async function restoreDirectory() {
      const result = await galleryStorage.restoreSavedHandle();
      if (isCancelled) return;

      if (result.permission === 'granted' && result.handle) {
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifacts();
      } else if (result.handle) {
        // 保存句柄待用户手势授权
        setPendingHandle(result.handle);
        await loadArtifacts();
      } else {
        await loadArtifacts();
      }
    }

    restoreDirectory();
    return () => {
      isCancelled = true;
    };
  }, [loadArtifacts]);

  // 恢复待授权目录的用户手势处理
  const handleRequestPendingPermission = async () => {
    if (!pendingHandle) return;
    try {
      const perm = await (pendingHandle as unknown as {
        requestPermission: (opt: { mode: string }) => Promise<PermissionState>;
      }).requestPermission({ mode: 'readwrite' });

      if (perm === 'granted') {
        galleryStorage.setDirectoryHandle(pendingHandle);
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifacts();
      }
    } catch (err) {
      console.error('授权目录失败:', err);
    }
  };
~~~~~

~~~~~act
patch_file
src/App.tsx
~~~~~
~~~~~typescript.old
  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPickDirectory={handlePickDirectory}
        hasDirectory={hasDirectory}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
~~~~~
~~~~~typescript.new
  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPickDirectory={handlePickDirectory}
        hasDirectory={hasDirectory}
        pendingDirectoryName={pendingHandle?.name}
        onRequestPendingPermission={handleRequestPendingPermission}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
~~~~~

### 下一步建议
1. 打开浏览器控制台并挂载一个本地工件目录，刷新页面验证：
   - 若浏览器授予持久权限，刷新后直接进入真实工件列表，零感恢复；
   - 若浏览器提示需要授权确认，右上角将显示带有发光动画的 `恢复关联目录: [目录名]` 按钮，轻点一次即可瞬时接通目录。
2. 开启任意工件的全屏展演，将浮动坞拖动吸附在左边、下边或右边缘，随后关闭全屏或刷新页面重新打开工件，观察浮动坞是否精准停留在上一次记忆的位置。
