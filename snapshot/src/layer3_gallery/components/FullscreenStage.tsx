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
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 300,
    y: 0,
  });

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

  // 拖拽手柄与点击处理
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) return;
    // 限制中心点在视口边缘内，确保两侧展开后不完全出界
    const minX = 140;
    const maxX = window.innerWidth - 140;
    const maxY = window.innerHeight - 50;
    const nextX = Math.max(minX, Math.min(maxX, e.clientX - dragOffsetRef.current.x));
    const nextY = Math.max(0, Math.min(maxY, e.clientY - dragOffsetRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isDraggingRef.current) {
      const deltaX = Math.abs(e.clientX - dragStartPosRef.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPosRef.current.y);
      // 位移小于 4px 视作点击，切换展开/收拢
      if (deltaX < 4 && deltaY < 4) {
        setIsExpanded((prev) => !prev);
      }
    }
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

      {/* 仿虚拟机悬浮浮动坞 (VM-like Floating Dock，以中心点为对称轴向两侧展开) */}
      <div
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
        }}
        className="absolute -translate-x-1/2 z-50 flex flex-col items-center select-none"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => {
          if (!isDraggingRef.current) {
            setIsExpanded(false);
          }
        }}
      >
        {/* 顶部微光可拖拽/可点击拉手（原生 button，键盘无障碍友好） */}
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`flex items-center justify-center cursor-grab active:cursor-grabbing border-0 outline-none p-0 transition-all duration-300 ease-out origin-center ${
            isExpanded
              ? 'h-3 w-32 bg-zinc-700/90 rounded-t-md'
              : 'h-1.5 w-20 bg-zinc-300/40 hover:bg-zinc-200/90 hover:h-2 rounded-full my-1 shadow-[0_0_10px_rgba(255,255,255,0.3)]'
          }`}
          title="点击展开/收起，按住拖动位置"
        >
          {isExpanded && <GripHorizontal className="w-3.5 h-3.5 text-zinc-400" />}
        </button>

        {/* 从中间向两边对称展开的控制面板 */}
        <div
          className={`transition-all duration-300 ease-out origin-center overflow-hidden flex flex-col items-center ${
            isExpanded
              ? 'max-w-xl opacity-100 scale-100'
              : 'max-w-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-b-lg shadow-2xl text-xs font-mono text-zinc-200 whitespace-nowrap">
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
        </div>

        {/* 状态轻提示 */}
        {statusMessage && (
          <div className="mt-2 bg-black/85 border border-zinc-700 text-[11px] text-zinc-300 px-2.5 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in">
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
};