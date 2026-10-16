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