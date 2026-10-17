import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import { Code2, FileText, Play, Star } from 'lucide-react';
import type React from 'react';

interface ArtifactCardProps {
  artifact: Artifact;
  compact?: boolean;
  onOpenStage: (artifact: Artifact) => void;
  onOpenStudio: (artifact: Artifact) => void;
  onOpenInspector: (artifact: Artifact) => void;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  compact = false,
  onOpenStage,
  onOpenStudio,
  onOpenInspector,
}) => {
  return (
    <div className="text-left w-full bg-surface border border-border rounded overflow-hidden flex flex-col group hover:border-muted hover:-translate-y-0.5 transition-all">
      {/* 封面画幅区 */}
      <button
        type="button"
        onClick={() => onOpenStage(artifact)}
        className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center cursor-pointer outline-none"
        title="点击进入全屏放映舞台"
      >
        <div className="absolute top-2 right-2 flex items-center gap-1 z-[2]">
          {artifact.meta.rating && artifact.meta.rating > 0 ? (
            <div className="bg-surface/90 backdrop-blur border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-mono text-amber-400 rounded flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 fill-current" />
              <span>{artifact.meta.rating}</span>
            </div>
          ) : null}
          <div className="bg-surface/90 backdrop-blur border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted rounded">
            REV:{artifact.meta.currentRevision}
          </div>
        </div>

        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover filter grayscale-[15%] group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="text-muted text-xs font-mono flex flex-col items-center gap-1">
            <span>[ 暂无封面 ]</span>
            <span className="text-[10px] opacity-60">点击进入放映并截取封面</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <span className="flex items-center gap-1 bg-surface text-main text-xs px-2.5 py-1 rounded font-mono shadow-md">
            <Play className="w-3 h-3 fill-current" />
            <span>放映舞台</span>
          </span>
        </div>
      </button>

      {/* 紧凑模式下仅渲染极简底部信息 */}
      {compact ? (
        <div className="px-2.5 py-2 flex items-center justify-between gap-1 text-[11px] font-mono">
          <span className="truncate font-medium text-main flex-1" title={artifact.meta.name}>
            {artifact.meta.name}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenInspector(artifact);
            }}
            className="p-1 text-muted hover:text-main rounded hover:bg-border transition-colors"
            title="查看标本档案"
          >
            <FileText className="w-3 h-3" />
          </button>
        </div>
      ) : (
        /* 标准完整信息栏 */
        <div className="p-4 flex flex-col flex-1 justify-between gap-3">
          <div className="flex justify-between items-start gap-2">
            <div
              className="text-sm font-semibold text-main truncate flex-1"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onOpenInspector(artifact)}
                className="flex items-center gap-1 text-[11px] font-mono text-muted hover:text-main border border-border px-1.5 py-0.5 rounded hover:bg-border transition-colors"
                title="查看标本档案与元数据"
              >
                <FileText className="w-3 h-3" />
                <span>档案</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenStudio(artifact)}
                className="flex items-center gap-1 text-[11px] font-mono text-sky-400 hover:text-sky-300 border border-sky-400/30 px-1.5 py-0.5 rounded hover:bg-sky-400/10 transition-colors"
                title="打开独立暗房工作台"
              >
                <Code2 className="w-3 h-3" />
                <span>暗房</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {artifact.meta.tags.map((rawTag) => {
              const parsed = TagQueryEngine.parseTag(rawTag);
              return (
                <span
                  key={rawTag}
                  className="inline-flex items-center bg-tag border border-border px-1.5 py-0.5 text-[11px] font-mono rounded"
                >
                  {parsed.namespace && <span className="text-muted">{parsed.namespace}:</span>}
                  <span className="font-medium text-main">{parsed.value}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
