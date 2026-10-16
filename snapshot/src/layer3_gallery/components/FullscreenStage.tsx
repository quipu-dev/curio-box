import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import type { Artifact } from '@/types';
import { Camera, Code2, GripHorizontal, Maximize2, Minimize2, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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

  // 拖拽手柄移动与边缘磁吸处理
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) return;
    const nextX = e.clientX - dragOffsetRef.current.x;
    const nextY = e.clientY - dragOffsetRef.current.y;
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isDraggingRef.current) {
      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y);

      // 位移小于 5px 视作点击切换展开/收拢
      if (deltaX < 5 && deltaY < 5) {
        setIsExpanded((prev) => !prev);
      } else {
        // 计算最近的屏幕边缘实现自动吸附
        const w = window.innerWidth;
        const h = window.innerHeight;
        const curX = e.clientX;
        const curY = e.clientY;

        const distTop = curY;
        const distBottom = h - curY;
        const distLeft = curX;
        const distRight = w - curX;

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

    isDraggingRef.current = false;
    setIsDragging(false);
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

      {/* 仿虚拟机悬浮浮动坞：支持四向边缘自适应吸附与横/竖排版 */}
      <div
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        className={`absolute z-50 select-none flex items-center ${
          isDragging ? '' : 'transition-all duration-300 ease-out'
        } ${
          dockEdge === 'top'
            ? '-translate-x-1/2 flex-col'
            : dockEdge === 'bottom'
              ? '-translate-x-1/2 -translate-y-full flex-col-reverse'
              : dockEdge === 'left'
                ? '-translate-y-1/2 flex-row'
                : '-translate-x-full -translate-y-1/2 flex-row-reverse'
        }`}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!isDraggingRef.current) {
            setIsExpanded(false);
          }
        }}
      >
        {/* 边缘自适应微光拉手：横边为横线，竖边为竖线 */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`flex items-center justify-center cursor-grab active:cursor-grabbing border-0 outline-none p-0 transition-all duration-300 ease-out origin-center ${
            dockEdge === 'top' || dockEdge === 'bottom'
              ? isExpanded
                ? 'h-3 w-32 bg-zinc-700/90 rounded-md my-0.5'
                : 'h-1.5 w-20 bg-zinc-300/40 hover:bg-zinc-200/90 hover:h-2 rounded-full my-1 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
              : isExpanded
                ? 'w-3 h-32 bg-zinc-700/90 rounded-md mx-0.5'
                : 'w-1.5 h-20 bg-zinc-300/40 hover:bg-zinc-200/90 hover:w-2 rounded-full mx-1 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
          }`}
          title="点击展开/收起，按住拖拽自动贴附到最近边缘"
        >
          {isExpanded && (
            <GripHorizontal
              className={`w-3.5 h-3.5 text-zinc-400 ${
                dockEdge === 'left' || dockEdge === 'right' ? 'rotate-90' : ''
              }`}
            />
          )}
        </button>

        {/* 展开面板：横版边缘（上/下）为水平排版，竖版边缘（左/右）为垂直竖排版 */}
        <div
          className={`transition-all duration-300 ease-out origin-center overflow-hidden flex items-center justify-center ${
            dockEdge === 'top' || dockEdge === 'bottom'
              ? isExpanded
                ? 'max-w-xl opacity-100 scale-100'
                : 'max-w-0 opacity-0 scale-95 pointer-events-none'
              : isExpanded
                ? 'max-h-[380px] opacity-100 scale-100'
                : 'max-h-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          {dockEdge === 'top' || dockEdge === 'bottom' ? (
            /* 横向控制面板（在上下边缘呈现） */
            <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-lg shadow-2xl text-xs font-mono text-zinc-200 whitespace-nowrap">
              <span
                className="text-[11px] text-zinc-400 max-w-[140px] truncate mr-1.5"
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
          ) : (
            /* 纵向竖排版控制面板（在左右边缘呈现） */
            <div className="flex flex-col items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 p-2 rounded-lg shadow-2xl text-xs font-mono text-zinc-200">
              <span
                className="text-[10px] text-zinc-400 w-12 truncate text-center"
                title={artifact.meta.name}
              >
                {artifact.meta.name}
              </span>

              <div className="w-full h-px bg-zinc-700/60" />

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
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-200"
                title="打开差量暗房 (Negative Chain)"
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
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
                className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
                title="退出全屏展演 (按 Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 状态轻提示 */}
        {statusMessage && (
          <div className="absolute top-full mt-2 bg-black/85 border border-zinc-700 text-[11px] text-zinc-300 px-2.5 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};