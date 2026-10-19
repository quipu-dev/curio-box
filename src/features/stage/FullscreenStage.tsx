import { useToast } from '@/context/ToastContext';
import { galleryStorage } from '@/core/storage/fs-storage';
import { SandboxViewport } from '@/features/sandbox/SandboxViewport';
import { captureDisplayMediaFrame } from '@/features/sandbox/screen-capture';
import type { Artifact, CaptureMode } from '@/types';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  GripHorizontal,
  Layers,
  Maximize2,
  Minimize2,
  Monitor,
  Sparkles,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DockEdge = 'top' | 'bottom' | 'left' | 'right';

interface SavedDockState {
  edge: DockEdge;
  position: { x: number; y: number };
}

const DOCK_STORAGE_KEY = 'curio_dock_state_v1';
const CAPTURE_MODE_KEY = 'curio_selected_capture_mode';

const CAPTURE_OPTIONS: {
  mode: CaptureMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { mode: 'auto', label: '智能自动', icon: Sparkles },
  { mode: 'canvas', label: '硬件画布', icon: Layers },
  { mode: 'dom', label: 'DOM 视口', icon: Camera },
  { mode: 'screen', label: '屏幕采集', icon: Monitor },
];

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
        const safeX = Math.max(0, Math.min(w, parsed.position.x));
        const safeY = Math.max(0, Math.min(h, parsed.position.y));
        return { edge: parsed.edge, position: { x: safeX, y: safeY } };
      }
    }
  } catch {}
  return { edge: 'top', position: { x: window.innerWidth / 2, y: 0 } };
}

interface FullscreenStageProps {
  artifact: Artifact | null;
  artifacts?: Artifact[];
  albumTitle?: string;
  onClose: () => void;
  onNavigate?: (filename: string) => void;
  onOpenDarkroom: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

export const FullscreenStage: React.FC<FullscreenStageProps> = ({
  artifact,
  artifacts = [],
  albumTitle,
  onClose,
  onNavigate,
  onOpenDarkroom,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const { toast } = useToast();
  const [initialDock] = useState<SavedDockState>(getInitialDockState);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);
  const [dockEdge, setDockEdge] = useState<DockEdge>(initialDock.edge);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(initialDock.position);
  const [captureMode, setCaptureMode] = useState<CaptureMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    return (localStorage.getItem(CAPTURE_MODE_KEY) as CaptureMode) || 'auto';
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [loadedSourceCode, setLoadedSourceCode] = useState<string>(artifact.sourceCode || '');

  const isDraggingRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const captureHandleRef = useRef<
    ((mode?: Exclude<CaptureMode, 'screen'>) => Promise<Blob>) | null
  >(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentIndex = useMemo(() => {
    return artifacts.findIndex((a) => a.meta.filename === artifact.meta.filename);
  }, [artifacts, artifact.meta.filename]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < artifacts.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev && onNavigate) {
      onNavigate(artifacts[currentIndex - 1].meta.filename);
    }
  }, [hasPrev, onNavigate, artifacts, currentIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onNavigate) {
      onNavigate(artifacts[currentIndex + 1].meta.filename);
    }
  }, [hasNext, onNavigate, artifacts, currentIndex]);

  useEffect(() => {
    let isCancelled = false;
    if (artifact.sourceCode) {
      setLoadedSourceCode(artifact.sourceCode);
    } else {
      galleryStorage.loadArtifactSource(artifact.meta.filename).then((src) => {
        if (!isCancelled) {
          setLoadedSourceCode(src);
          onUpdateArtifact({ ...artifact, sourceCode: src });
        }
      });
    }
    return () => {
      isCancelled = true;
    };
  }, [artifact, onUpdateArtifact]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
        return;
      }

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, handlePrev, handleNext]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [isMenuOpen]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
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

      if (deltaX < 5 && deltaY < 5) {
        setIsExpanded((prev) => !prev);
      } else {
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

        try {
          localStorage.setItem(
            DOCK_STORAGE_KEY,
            JSON.stringify({ edge: targetEdge, position: targetPos }),
          );
        } catch {}
      }
    }

    isDraggingRef.current = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleCapturePoster = async (mode: CaptureMode = captureMode) => {
    try {
      let blob: Blob;
      if (mode === 'screen') {
        toast.info('请在弹窗中选择并确认当前工件窗口以完成真实屏幕截取');
        blob = await captureDisplayMediaFrame();
      } else {
        if (!captureHandleRef.current) {
          toast.warn('预览尚未就绪，无法截图');
          return;
        }
        blob = await captureHandleRef.current(mode);
      }

      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      toast.success('封面截取并更新成功！');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Permission denied') && !msg.includes('用户取消')) {
        toast.error(`截图失败: ${msg}`);
      }
    }
  };

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
      className="dark-scope fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none"
    >
      <SandboxViewport
        htmlPayload={loadedSourceCode}
        isActivated={true}
        onCaptureReady={(cb) => {
          captureHandleRef.current = cb;
        }}
      />

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
          if (!isDraggingRef.current && !isMenuOpen) {
            setIsExpanded(false);
          }
        }}
      >
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
          title="点击展开/收起，按住拖拽自动贴附到边缘"
        >
          {isExpanded && (
            <GripHorizontal
              className={`w-3.5 h-3.5 text-zinc-400 ${
                dockEdge === 'left' || dockEdge === 'right' ? 'rotate-90' : ''
              }`}
            />
          )}
        </button>

        <div
          className={`transition-all duration-300 ease-out origin-center overflow-visible flex items-center justify-center ${
            dockEdge === 'top' || dockEdge === 'bottom'
              ? isExpanded
                ? 'max-w-2xl opacity-100 scale-100'
                : 'max-w-0 opacity-0 scale-95 pointer-events-none'
              : isExpanded
                ? 'max-h-[460px] opacity-100 scale-100'
                : 'max-h-0 opacity-0 scale-95 pointer-events-none'
          }`}
        >
          {dockEdge === 'top' || dockEdge === 'bottom' ? (
            <div className="flex items-center gap-1.5 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 px-3 py-1.5 rounded-lg shadow-2xl text-xs font-mono text-zinc-200 whitespace-nowrap">
              {artifacts.length > 1 && (
                <div className="flex items-center gap-0.5 border-r border-zinc-700 pr-1.5 mr-1">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={handlePrev}
                    className="p-1 hover:bg-surface-subtle rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-300 hover:text-white"
                    title="上一件工件 (Alt + ←)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] text-zinc-400 px-1 font-mono">
                    {currentIndex + 1}/{artifacts.length}
                  </span>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={handleNext}
                    className="p-1 hover:bg-surface-subtle rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-zinc-300 hover:text-white"
                    title="下一件工件 (Alt + →)"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <span
                className="text-[11px] text-zinc-400 max-w-[180px] truncate mr-1.5"
                title={albumTitle ? `《${albumTitle}》· ${artifact.meta.name}` : artifact.meta.name}
              >
                {albumTitle ? (
                  <>
                    <span className="text-sky-300 font-semibold">{albumTitle}</span>
                    <span className="text-zinc-500 mx-1">·</span>
                  </>
                ) : null}
                {artifact.meta.name}
              </span>

              {/* 分体截屏按钮 */}
              <div ref={menuRef} className="relative flex items-center">
                <div className="flex items-center bg-zinc-800/80 border border-zinc-700 rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleCapturePoster(captureMode)}
                    className="p-1.5 hover:bg-zinc-700 transition-colors text-zinc-300 hover:text-white flex items-center gap-1"
                    title={`截取当前画面为封面 [${captureMode}]`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen((prev) => !prev)}
                    className="p-1 hover:bg-zinc-700 transition-colors border-l border-zinc-700 text-zinc-400 hover:text-white"
                    title="选择截屏模式"
                  >
                    <ChevronDown className="w-2.5 h-2.5" />
                  </button>
                </div>

                {isMenuOpen && (
                  <div
                    className={`absolute z-50 w-44 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-1 text-[11px] font-mono text-zinc-200 ${
                      dockEdge === 'bottom' ? 'bottom-full mb-2 left-0' : 'top-full mt-2 left-0'
                    }`}
                  >
                    <div className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 mb-0.5">
                      捕获方式
                    </div>
                    {CAPTURE_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const isSel = opt.mode === captureMode;
                      return (
                        <button
                          key={opt.mode}
                          type="button"
                          onClick={() => {
                            setCaptureMode(opt.mode);
                            try {
                              localStorage.setItem(CAPTURE_MODE_KEY, opt.mode);
                            } catch {}
                            setIsMenuOpen(false);
                            handleCapturePoster(opt.mode);
                          }}
                          className={`flex items-center justify-between w-full px-2 py-1.5 rounded transition-colors ${
                            isSel
                              ? 'bg-status-info-bg text-status-info font-medium'
                              : 'hover:bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5" />
                            <span>{opt.label}</span>
                          </div>
                          {isSel && <Check className="w-3 h-3" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpenDarkroom(artifact)}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-[11px] text-zinc-200"
                title="打开差量暗房 (Negative Chain)"
              >
                <Code2 className="w-3.5 h-3.5 text-status-info" />
                <span>暗房</span>
              </button>

              <button
                type="button"
                onClick={handleToggleNativeFullscreen}
                className="p-1.5 hover:bg-surface-subtle rounded transition-colors text-zinc-300 hover:text-white"
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
                className="flex items-center gap-1 px-2 py-1 bg-status-error-bg hover:bg-status-error-bg text-status-error rounded transition-colors text-[11px]"
                title="退出全屏展演 (按 Esc)"
              >
                <X className="w-3.5 h-3.5" />
                <span>退出</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/80 p-2 rounded-lg shadow-2xl text-xs font-mono text-zinc-200">
              {artifacts.length > 1 && (
                <div className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={handlePrev}
                    className="p-1 hover:bg-surface-subtle rounded disabled:opacity-30 transition-colors text-zinc-300"
                    title="上一件 (Alt + ←)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
                  </button>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {currentIndex + 1}/{artifacts.length}
                  </span>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={handleNext}
                    className="p-1 hover:bg-surface-subtle rounded disabled:opacity-30 transition-colors text-zinc-300"
                    title="下一件 (Alt + →)"
                  >
                    <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                  </button>
                </div>
              )}

              <div className="w-full h-px bg-zinc-700/60" />

              <button
                type="button"
                onClick={() => handleCapturePoster(captureMode)}
                className="p-1.5 hover:bg-surface-subtle rounded transition-colors text-zinc-300 hover:text-white"
                title={`截取当前画面为封面 [${captureMode}]`}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onOpenDarkroom(artifact)}
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors text-zinc-200"
                title="打开差量暗房 (Negative Chain)"
              >
                <Code2 className="w-3.5 h-3.5 text-status-info" />
              </button>

              <button
                type="button"
                onClick={handleToggleNativeFullscreen}
                className="p-1.5 hover:bg-surface-subtle rounded transition-colors text-zinc-300 hover:text-white"
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
                className="p-1.5 bg-status-error-bg hover:bg-status-error-bg text-status-error rounded transition-colors"
                title="退出全屏展演 (按 Esc)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
