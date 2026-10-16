我将为你实现工件默认直入网页全屏活体展演，以及配备虚拟机级可拖拽隐藏浮动控制坞（Floating Control Dock）与 Esc 退出功能。

## [WIP] feat: 实现工件默认网页全屏展演与虚拟机级浮动隐藏控制坞

### 用户需求
1. 实现工件的网页全屏/全屏沉浸式展演功能。
2. 默认在画廊点击工件卡片时，直接直入网页全屏工件本身（JIT 活体挂载）。
3. 支持按 `Esc` 键退出全屏。
4. 引入仿虚拟机交互的浮动、可拖拽控制坞：默认收敛隐藏为一条细线/微光胶囊拉手，交互时滑出展开控制坞，内置“退出全屏”、“呼出镜像暗房”、“定格封印”与“真全屏切换”等功能。

### 评论
该功能极大地增强了 curio-box 作为视觉工件陈列馆的核心沉浸体验。此前用户打开工件默认停留在分屏暗房编辑器中，丢失了视觉全屏冲击力；现在“画廊卡片 -> 网页全屏直演 -> 浮动隐藏控制坞”的流线设计，既保持了纯净满屏视效，又保证了随时可拖拽呼出暗房修补或定格快照的控制自由度。

### 目标
1. 新建 `FullscreenStage` 全屏展演组件，并内置仿虚拟机的可拖拽、默认收起为微光细线的浮动控制坞 (`FloatingControlDock`)。
2. 默认拦截全局 `Esc` 键盘事件直接退出沉浸展演。
3. 浮动控制坞支持平滑展开，提供退出全屏、进入暗房、即时封印快照和浏览器真全屏（Fullscreen API）等功能。
4. 调整 `App.tsx` 与卡片点击逻辑，点击卡片默认即刻激活全屏展演，并支持在全屏中平滑呼出暗房。

### 基本原理
- 保持沙箱架构原则：通过满屏覆盖挂载 `SandboxViewport`（`isActivated={true}`），完全利用浏览器的 GPU 视口呈现视觉工件。
- 悬浮拉手设计：在 DOM 顶层放置绝对定位/固定定位的浮球拖拽层，通过 pointer/mouse 事件记录位移并做边缘约束；常态下仅保留极微小的吸附线手柄（如类似 VMware/VirtualBox 顶栏），悬停或轻触时平滑展开功能坞。
- 符合 a11y 和 Biome 规范：所有交互控件采用原生 `<button type="button">` 并通过 Tailwind CSS 进行无障碍重置。

### 标签
#intent/build #flow/ready #priority/high #comp/ui #concept/ui #scope/ux #ai/instruct #task/domain/ui #task/object/fullscreen-stage #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 创建全屏舞台与虚拟机级浮动隐藏控制坞组件

创建 `src/layer3_gallery/components/FullscreenStage.tsx`，实现满屏活体沙箱渲染、可拖拽且默认隐为细线的微光悬浮手柄坞，以及快捷按键支持。

~~~~~act
write_file
src/layer3_gallery/components/FullscreenStage.tsx
~~~~~
~~~~~tsx
import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import type { Artifact } from '@/types';
import { Camera, Code2, GripHorizontal, Maximize2, Minimize2, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 - 130 : 200,
    y: 0,
  });

  const isDraggingRef = useRef<boolean>(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  // 监听原生全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 监听 Esc 键盘按键退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 拖拽手柄移动处理
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const maxX = window.innerWidth - 260;
    const maxY = window.innerHeight - 60;
    const nextX = Math.max(10, Math.min(maxX, e.clientX - dragOffsetRef.current.x));
    const nextY = Math.max(0, Math.min(maxY, e.clientY - dragOffsetRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // 容错处理
    }
  };

  // 定格封印快照
  const handleCapturePoster = async () => {
    if (!captureHandleRef.current) {
      setStatusMessage('沙箱尚未准备好捕获快照');
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
      setStatusMessage('定格封印成功！快照已持久化');
      setTimeout(() => setStatusMessage(''), 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`定格失败: ${msg}`);
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  // 切换真全屏 (Fullscreen API)
  const handleToggleNativeFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      stageContainerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div
      ref={stageContainerRef}
      className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none"
    >
      {/* 活体展演沙箱视口 */}
      <SandboxViewport
        htmlPayload={artifact.sourceCode}
        isActivated={true}
        onCaptureReady={(cb) => {
          captureHandleRef.current = cb;
        }}
      />

      {/* 仿虚拟机悬浮浮动坞 (VM-like Floating Dock) */}
      <div
        style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
        className="absolute top-0 left-0 z-50 transition-all duration-150 ease-out flex flex-col items-center"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!isDraggingRef.current) {
            setIsExpanded(false);
          }
        }}
      >
        {/* 默认常态下的微光收起细线/拉手 */}
        <div
          role="presentation"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`flex items-center justify-center cursor-grab active:cursor-grabbing transition-all duration-300 ${
            isExpanded
              ? 'h-3 w-28 bg-zinc-700/80 rounded-t-md'
              : 'h-1.5 w-20 bg-zinc-400/40 hover:bg-zinc-200/80 rounded-full my-1 shadow-[0_0_8px_rgba(255,255,255,0.2)]'
          }`}
          title="按住拖拽移动，鼠标悬浮展开控制坞"
        >
          {isExpanded && <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />}
        </div>

        {/* 展开后的控制面板 */}
        {isExpanded && (
          <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-b-lg shadow-2xl text-xs font-mono text-zinc-200 animate-in fade-in slide-in-from-top-1">
            <span
              className="text-[11px] text-zinc-400 max-w-[130px] truncate mr-1.5"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </span>

            <button
              type="button"
              onClick={handleCapturePoster}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-300 hover:text-white"
              title="定格封印当前帧"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onOpenDarkroom(artifact)}
              className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-[11px] text-zinc-200"
              title="打开差量暗房 (Negative Chain)"
            >
              <Code2 className="w-3.5 h-3.5 text-sky-400" />
              <span>暗房</span>
            </button>

            <button
              type="button"
              onClick={handleToggleNativeFullscreen}
              className="p-1.5 hover:bg-zinc-800 rounded transition-colors text-zinc-300 hover:text-white"
              title={isNativeFullscreen ? '退出系统真实全屏' : '进入系统真实全屏'}
            >
              {isNativeFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors text-[11px]"
              title="退出全屏展演 (按 Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>退出 (Esc)</span>
            </button>
          </div>
        )}

        {/* 状态轻提示 */}
        {statusMessage && (
          <div className="mt-2 bg-black/80 border border-zinc-700 text-[11px] text-zinc-300 px-2 py-1 rounded shadow-lg pointer-events-none">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};
~~~~~

#### Acts 2: 改造 `App.tsx` 默认点击直接全屏展演并支持暗房协同

更新 `src/App.tsx`：当点击工件卡片时，默认将工件置于全屏舞台 `FullscreenStage`；并支持从全屏浮动坞随时调出 `DarkroomModal`。

~~~~~act
patch_file
src/App.tsx
~~~~~
~~~~~typescript.old
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { DarkroomModal } from '@/layer3_gallery/components/DarkroomModal';
import { Header } from '@/layer3_gallery/components/Header';
import type { Artifact } from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);
~~~~~
~~~~~typescript.new
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { DarkroomModal } from '@/layer3_gallery/components/DarkroomModal';
import { FullscreenStage } from '@/layer3_gallery/components/FullscreenStage';
import { Header } from '@/layer3_gallery/components/Header';
import type { Artifact } from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

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
~~~~~

~~~~~act
patch_file
src/App.tsx
~~~~~
~~~~~typescript.old
  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item)),
    );
    setSelectedArtifact(updated);
  };

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

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

      <main className="flex-1 p-6 md:p-8">
        <div className="mb-6 flex justify-between items-center text-xs font-mono text-muted">
          <div>
            陈列展品总数：
            <span className="text-main font-semibold">{filteredArtifacts.length}</span> /{' '}
            {artifacts.length}
          </div>
          {!hasDirectory && <div>（当前处于内置演示库模式，可点击右上角载入本地工件目录）</div>}
        </div>

        {filteredArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.meta.filename}
                artifact={artifact}
                onOpenDarkroom={setSelectedArtifact}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改大众分类筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      <DarkroomModal
        artifact={selectedArtifact}
        onClose={() => setSelectedArtifact(null)}
        onUpdateArtifact={handleUpdateArtifact}
      />
    </div>
  );
}

export default App;
~~~~~
~~~~~typescript.new
  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item)),
    );
    if (fullscreenArtifact?.meta.filename === updated.meta.filename) {
      setFullscreenArtifact(updated);
    }
    if (darkroomArtifact?.meta.filename === updated.meta.filename) {
      setDarkroomArtifact(updated);
    }
  };

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

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

      <main className="flex-1 p-6 md:p-8">
        <div className="mb-6 flex justify-between items-center text-xs font-mono text-muted">
          <div>
            陈列展品总数：
            <span className="text-main font-semibold">{filteredArtifacts.length}</span> /{' '}
            {artifacts.length}
          </div>
          {!hasDirectory && <div>（当前处于内置演示库模式，可点击右上角载入本地工件目录）</div>}
        </div>

        {filteredArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.meta.filename}
                artifact={artifact}
                onOpenDarkroom={setFullscreenArtifact}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改大众分类筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      {/* 默认全屏活体展演舞台 */}
      <FullscreenStage
        artifact={fullscreenArtifact}
        onClose={() => setFullscreenArtifact(null)}
        onOpenDarkroom={(art) => setDarkroomArtifact(art)}
        onUpdateArtifact={handleUpdateArtifact}
      />

      {/* 镜像暗房差量调整模态窗 */}
      <DarkroomModal
        artifact={darkroomArtifact}
        onClose={() => setDarkroomArtifact(null)}
        onUpdateArtifact={handleUpdateArtifact}
      />
    </div>
  );
}

export default App;
~~~~~

#### Acts 3: 优化工件卡片提示文案

修改 `src/layer3_gallery/components/ArtifactCard.tsx`，将卡片提示由“点击进入暗房”改为“点击全屏展演”，更贴近新的交互模式。

~~~~~act
patch_file
src/layer3_gallery/components/ArtifactCard.tsx
~~~~~
~~~~~typescript.old
        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            className="w-full h-full object-cover filter grayscale-[20%] group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="text-muted text-xs font-mono flex flex-col items-center gap-1">
            <span>[ 待封印快照 ]</span>
            <span className="text-[10px] opacity-60">点击进入暗房捕获封面</span>
          </div>
        )}
~~~~~
~~~~~typescript.new
        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            className="w-full h-full object-cover filter grayscale-[20%] group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="text-muted text-xs font-mono flex flex-col items-center gap-1">
            <span>[ 待封印快照 ]</span>
            <span className="text-[10px] opacity-60">点击全屏展演并定格封面</span>
          </div>
        )}
~~~~~

### 下一步建议
1. 运行 `pnpm check` 验证 Biome 检查与 TypeScript 类型通过性。
2. 可以在全屏模式下测试鼠标悬浮顶栏、拖拽手柄、按 `Esc` 退出以及从浮动坞唤出暗房的无缝流转体验。
