import type { AssetCacheStats } from '@/layer2_darkroom/engine/asset-cache';
import type { Artifact } from '@/types';
import {
  ArrowLeft,
  Camera,
  Database,
  Eye,
  GitCommit,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Square,
} from 'lucide-react';
import type React from 'react';

interface DarkroomStudioHeaderProps {
  artifact: Artifact;
  viewingRevision: number | null;
  assetStats: AssetCacheStats | null;
  aspectRatio: 'fill' | '16/9' | '4/3';
  isActivated: boolean;
  isConsoleOpen: boolean;
  onBackToGallery: () => void;
  onSetAspectRatio: (ratio: 'fill' | '16/9' | '4/3') => void;
  onToggleActivated: () => void;
  onCapturePoster: () => void;
  onOpenStage: () => void;
  onToggleConsole: () => void;
}

export const DarkroomStudioHeader: React.FC<DarkroomStudioHeaderProps> = ({
  artifact,
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
}) => {
  return (
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

          {/* 直接展示工件当前的 Commit 说明 */}
          {artifact.meta.lastCommitMessage && viewingRevision === null && (
            <span
              className="hidden lg:flex items-center gap-1 text-[11px] text-zinc-400 bg-background px-2 py-0.5 rounded border border-border max-w-[240px] truncate"
              title={`当前版本 Commit: ${artifact.meta.lastCommitMessage}`}
            >
              <GitCommit className="w-3 h-3 text-status-success shrink-0" />
              <span className="truncate">{artifact.meta.lastCommitMessage}</span>
            </span>
          )}
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

        <button
          type="button"
          onClick={onCapturePoster}
          disabled={!isActivated}
          className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border disabled:opacity-40"
          title="截取当前帧作为封面"
        >
          <Camera className="w-3.5 h-3.5 text-muted" />
          <span className="hidden sm:inline">截取封面</span>
        </button>

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
