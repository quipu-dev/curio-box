import { TagQueryEngine } from '@/core/engine/tag-engine';
import { type Artifact, getLastCommitMessage } from '@/types';
import { Camera, Code2, Play, Star } from 'lucide-react';
import type React from 'react';

interface ArtifactCardProps {
  artifact: Artifact;
  compact?: boolean;
  isSelected?: boolean;
  onOpenStage: (artifact: Artifact) => void;
  onOpenStudio: (artifact: Artifact) => void;
  onOpenInspector: (artifact: Artifact) => void;
  badgeSlot?: React.ReactNode;
  footerSlot?: React.ReactNode;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  isSelected = false,
  onOpenStage,
  onOpenStudio,
  onOpenInspector,
  badgeSlot,
  footerSlot,
}) => {
  const commitMsg = getLastCommitMessage(artifact.meta);
  const formattedDate = new Date(
    artifact.meta.updatedAt || artifact.meta.createdAt,
  ).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });

  return (
    <div
      data-artifact-filename={artifact.meta.filename}
      className={`group relative rounded-xl border border-border bg-surface overflow-hidden shadow-sm flex flex-col transition-all duration-200 hover:-translate-y-0.5 select-none ${
        isSelected
          ? 'border-sky-500 ring-1 ring-sky-500/30 shadow-lg shadow-sky-500/10'
          : 'border-border hover:border-border-strong'
      }`}
    >
      {/* 视觉画幅区 (16:10 黄金画幅) */}
      <div className="aspect-[16/10] bg-black relative overflow-hidden flex items-center justify-center">
        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover filter grayscale-[10%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-500"
          />
        ) : (
          <div className="w-full h-full bg-amber-950/10 border border-dashed border-amber-500/30 flex flex-col items-center justify-center gap-1.5 text-muted p-4 text-center">
            <Camera className="w-6 h-6 text-amber-400/70" />
            <span className="text-[11px] font-mono text-amber-300/80">待定格封面</span>
          </div>
        )}

        {/* 封面透明原生按钮（点击进入标本档案检视） */}
        <button
          type="button"
          onClick={() => onOpenInspector(artifact)}
          className="absolute inset-0 w-full h-full cursor-pointer z-[1] outline-none border-0 bg-transparent"
          title="点击检视标本档案"
        />

        {/* 左上角槽位 */}
        {badgeSlot ? (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1 pointer-events-none">
            {badgeSlot}
          </div>
        ) : null}

        {/* 右上角角标 */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10 pointer-events-none">
          {artifact.meta.rating && artifact.meta.rating > 0 ? (
            <span className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 text-[10px] font-mono text-amber-300 flex items-center gap-0.5 shadow-sm">
              <Star className="w-2.5 h-2.5 fill-current" />
              <span>{artifact.meta.rating}</span>
            </span>
          ) : null}
          <span className="bg-black/80 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 text-[10px] font-mono text-white shadow-sm">
            REV:{artifact.meta.currentRevision}
          </span>
        </div>

        {/* 悬浮快捷控制带 */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] flex items-center justify-center gap-2 z-20 pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenStage(artifact);
            }}
            className="pointer-events-auto bg-zinc-100 text-black hover:bg-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md cursor-pointer transition-colors"
            title="开启全屏放映舞台"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>全屏放映</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenStudio(artifact);
            }}
            className="pointer-events-auto bg-surface-elevated hover:bg-surface text-main border border-border px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition-colors"
            title="进入镜像暗房工作台"
          >
            <Code2 className="w-3.5 h-3.5 inline mr-1 text-status-info" />
            <span>暗房</span>
          </button>
        </div>
      </div>

      {/* 卡片下半部信息区：作为原生 button，点击直接打开标本档案 */}
      <button
        type="button"
        onClick={() => onOpenInspector(artifact)}
        className="p-3.5 flex flex-col gap-2 flex-1 justify-between text-left cursor-pointer outline-none bg-transparent border-0 w-full group/info transition-colors"
      >
        <div className="flex flex-col gap-1.5 w-full">
          <div className="flex items-center justify-between gap-2">
            <h3
              className="font-bold text-sm text-main truncate group-hover/info:text-status-info transition-colors font-sans"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </h3>
            <span className="text-[10px] font-mono text-muted shrink-0">
              {artifact.meta.filename.replace(/^.*\./, '.')}
            </span>
          </div>

          {/* 紧凑分类标签组 */}
          <div className="flex flex-wrap items-center gap-1">
            {artifact.meta.tags.slice(0, 3).map((rawTag) => {
              const parsed = TagQueryEngine.parseTag(rawTag);
              const isHighlight =
                rawTag.includes('精选') || rawTag.includes('webgl') || rawTag.includes('threejs');
              return (
                <span
                  key={rawTag}
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                    isHighlight
                      ? 'bg-status-info-bg text-status-info border-status-info-border'
                      : 'bg-surface-subtle text-main border-border'
                  }`}
                >
                  {parsed.namespace && (
                    <span className="text-muted mr-0.5">{parsed.namespace}:</span>
                  )}
                  <span className="text-main font-medium">{parsed.value}</span>
                </span>
              );
            })}
            {artifact.meta.tags.length > 3 && (
              <span className="text-[10px] font-mono text-muted">
                +{artifact.meta.tags.length - 3}
              </span>
            )}
          </div>
        </div>

        {/* 微弱辅助信息栏 */}
        <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted font-mono w-full">
          <span
            className="truncate max-w-[180px] text-muted"
            title={artifact.meta.description || commitMsg}
          >
            {artifact.meta.description || commitMsg}
          </span>
          <span className="shrink-0 text-muted">{formattedDate}</span>
        </div>

        {footerSlot && <div className="pt-1 w-full">{footerSlot}</div>}
      </button>
    </div>
  );
};
