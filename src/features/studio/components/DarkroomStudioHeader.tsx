import type { AssetCacheStats } from '@/core/engine/asset-cache';
import { type Artifact, type CaptureMode, getLastCommitMessage } from '@/types';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Database,
  Eye,
  GitCommit,
  Layers,
  Maximize2,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Sparkles,
  Square,
  Star,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface DarkroomStudioHeaderProps {
  artifact: Artifact;
  albumTitle?: string;
  viewingRevision: number | null;
  assetStats: AssetCacheStats | null;
  aspectRatio: 'fill' | '16/9' | '4/3';
  isActivated: boolean;
  isConsoleOpen: boolean;
  onBackToGallery: () => void;
  onSetAspectRatio: (ratio: 'fill' | '16/9' | '4/3') => void;
  onToggleActivated: () => void;
  onCapturePoster: (mode: CaptureMode) => void;
  onOpenStage: () => void;
  onToggleConsole: () => void;
  onUpdateRating?: (rating: number) => void;
}

const CAPTURE_MODE_KEY = 'curio_selected_capture_mode';

const CAPTURE_MODE_OPTIONS: {
  mode: CaptureMode;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    mode: 'auto',
    label: '智能自动',
    desc: '自动探测 Canvas 与 DOM 复合',
    icon: Sparkles,
  },
  {
    mode: 'canvas',
    label: '硬件画布',
    desc: '直接抓取 WebGL / 2D Canvas',
    icon: Layers,
  },
  {
    mode: 'dom',
    label: '视口 DOM',
    desc: '基于 SVG foreignObject 全景光栅化',
    icon: Camera,
  },
  {
    mode: 'screen',
    label: '屏幕采集',
    desc: '浏览器原生视口拾取 (终极兜底)',
    icon: Monitor,
  },
];

export const DarkroomStudioHeader: React.FC<DarkroomStudioHeaderProps> = ({
  artifact,
  albumTitle,
  viewingRevision,
  assetStats,
  aspectRatio,
  isActivated,
  isConsoleOpen,
  onBackToGallery,
  onSetAspectRatio,
  onToggleActivated,
  onCapturePoster,
  onOpenStage,
  onToggleConsole,
  onUpdateRating,
}) => {
  const [selectedMode, setSelectedMode] = useState<CaptureMode>(() => {
    if (typeof window === 'undefined') return 'auto';
    const saved = localStorage.getItem(CAPTURE_MODE_KEY) as CaptureMode;
    return saved || 'auto';
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isDropdownOpen]);

  const handleSelectMode = (mode: CaptureMode) => {
    setSelectedMode(mode);
    try {
      localStorage.setItem(CAPTURE_MODE_KEY, mode);
    } catch {}
    setIsDropdownOpen(false);
  };

  const handleDirectCapture = () => {
    onCapturePoster(selectedMode);
  };

  const currentOption =
    CAPTURE_MODE_OPTIONS.find((opt) => opt.mode === selectedMode) || CAPTURE_MODE_OPTIONS[0];

  return (
    <header className="h-13 bg-surface border-b border-border px-4 flex justify-between items-center gap-4 text-xs font-mono shrink-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBackToGallery}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded hover:bg-background transition-colors text-muted hover:text-main"
          title="返回上一级"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>返回</span>
        </button>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-2">
          {albumTitle && (
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-status-info bg-status-info-bg border border-status-info-border px-2 py-0.5 rounded truncate max-w-[160px]">
              <Layers className="w-3 h-3 shrink-0" />
              <span className="truncate">{albumTitle}</span>
            </div>
          )}

          <span className="font-bold text-sm font-sans truncate max-w-xs md:max-w-md">
            {artifact.meta.name}
          </span>

          {viewingRevision !== null ? (
            <span className="bg-status-warn-bg text-status-warn border border-status-warn-border px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 animate-pulse">
              <Eye className="w-3 h-3" />
              <span>检视中: REV:{viewingRevision}</span>
            </span>
          ) : (
            <span className="bg-tag px-2 py-0.5 rounded text-[11px] font-semibold text-main border border-border">
              REV:{artifact.meta.currentRevision}
            </span>
          )}

          {viewingRevision === null && (
            <span
              className="hidden lg:flex items-center gap-1 text-[11px] text-zinc-400 bg-background px-2 py-0.5 rounded border border-border max-w-[240px] truncate"
              title={`当前版本 Commit: ${getLastCommitMessage(artifact.meta)}`}
            >
              <GitCommit className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span className="truncate">{getLastCommitMessage(artifact.meta)}</span>
            </span>
          )}

          <div className="hidden sm:flex items-center gap-0.5 ml-1 bg-background px-1.5 py-0.5 rounded border border-border">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onUpdateRating?.(artifact.meta.rating === star ? 0 : star)}
                className="p-0.5 hover:scale-110 transition-transform outline-none"
                title={`${star} 星`}
              >
                <Star
                  className={`w-3.5 h-3.5 transition-colors ${
                    star <= (artifact.meta.rating || 0)
                      ? 'fill-amber-400 text-status-warn'
                      : 'text-muted/40 hover:text-status-warn'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {assetStats && assetStats.total > 0 && (
          <div
            className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
              assetStats.cached === assetStats.total
                ? 'border-status-success-border bg-status-success-bg text-status-success'
                : 'border-status-warn-border bg-status-warn-bg text-status-warn'
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
            onClick={() => onSetAspectRatio('fill')}
            className={`px-2 py-1 text-[11px] ${
              aspectRatio === 'fill'
                ? 'bg-accent text-accent-text'
                : 'hover:bg-surface-subtle text-muted'
            }`}
          >
            自由铺满
          </button>
          <button
            type="button"
            onClick={() => onSetAspectRatio('16/9')}
            className={`px-2 py-1 text-[11px] ${
              aspectRatio === '16/9'
                ? 'bg-accent text-accent-text'
                : 'hover:bg-surface-subtle text-muted'
            }`}
          >
            16:9
          </button>
          <button
            type="button"
            onClick={() => onSetAspectRatio('4/3')}
            className={`px-2 py-1 text-[11px] ${
              aspectRatio === '4/3'
                ? 'bg-accent text-accent-text'
                : 'hover:bg-surface-subtle text-muted'
            }`}
          >
            4:3
          </button>
        </div>

        <button
          type="button"
          onClick={onToggleActivated}
          className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors text-xs font-mono ${
            isActivated
              ? 'bg-status-error-bg text-status-error border border-status-error-border hover:bg-status-error-bg'
              : 'bg-status-success-bg text-status-success border border-status-success-border hover:bg-emerald-500/30'
          }`}
        >
          {isActivated ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          <span>{isActivated ? '暂停' : '运行'}</span>
        </button>

        {/* 分体式截屏按钮 (Split Button) */}
        <div ref={dropdownRef} className="relative flex items-center">
          <div className="flex items-center border border-border rounded overflow-hidden">
            <button
              type="button"
              onClick={handleDirectCapture}
              disabled={!isActivated}
              className="flex items-center gap-1 px-2.5 py-1 hover:bg-border disabled:opacity-40 transition-colors text-muted hover:text-main"
              title={`截取封面 [模式: ${currentOption.label}]`}
            >
              <Camera className="w-3.5 h-3.5 text-muted" />
              <span className="hidden sm:inline">截取封面</span>
            </button>
            <button
              type="button"
              disabled={!isActivated}
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="px-1.5 py-1 border-l border-border hover:bg-border disabled:opacity-40 transition-colors text-muted hover:text-main"
              title="切换截屏方式"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* 下拉选择弹出层 */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-60 bg-surface border border-border rounded-lg shadow-2xl p-1.5 z-50 text-xs font-mono animate-in fade-in zoom-in-95">
              <div className="px-2 py-1 text-[10px] uppercase text-muted tracking-wider border-b border-border mb-1">
                截屏捕获模式
              </div>
              <div className="flex flex-col gap-0.5">
                {CAPTURE_MODE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = opt.mode === selectedMode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => {
                        handleSelectMode(opt.mode);
                        onCapturePoster(opt.mode);
                      }}
                      className={`flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                        isSelected
                          ? 'bg-status-info-bg text-status-info border border-status-info-border'
                          : 'hover:bg-surface-subtle text-main border border-transparent'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold flex items-center justify-between">
                          <span>{opt.label}</span>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <div className="text-[10px] text-muted leading-tight mt-0.5">
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenStage}
          className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border"
          title="切换至全屏放映舞台"
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted" />
          <span className="hidden sm:inline">放映舞台</span>
        </button>

        <button
          type="button"
          onClick={onToggleConsole}
          className="p-1.5 border border-border rounded hover:bg-border text-muted hover:text-main"
          title={isConsoleOpen ? '收起侧边面板' : '展开侧边面板'}
        >
          {isConsoleOpen ? (
            <PanelRightClose className="w-3.5 h-3.5" />
          ) : (
            <PanelRightOpen className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </header>
  );
};
