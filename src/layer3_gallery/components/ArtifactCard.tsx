import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import { Code2, Play } from 'lucide-react';
import type React from 'react';

interface ArtifactCardProps {
  artifact: Artifact;
  onOpenStage: (artifact: Artifact) => void;
  onOpenStudio: (artifact: Artifact) => void;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  onOpenStage,
  onOpenStudio,
}) => {
  return (
    <div className="text-left w-full bg-surface border border-border rounded overflow-hidden flex flex-col group hover:border-muted hover:-translate-y-0.5 transition-all">
      {/* 封面画幅区 */}
      <button
        type="button"
        onClick={() => onOpenStage(artifact)}
        className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center cursor-pointer outline-none"
        title="点击进入全屏活体放映舞台"
      >
        <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted z-10 rounded">
          REV:{artifact.meta.currentRevision}
        </div>

        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            className="w-full h-full object-cover filter grayscale-[15%] group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="text-muted text-xs font-mono flex flex-col items-center gap-1">
            <span>[ 待封印快照 ]</span>
            <span className="text-[10px] opacity-60">点击放映并定格封面</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <span className="flex items-center gap-1 bg-surface text-main text-xs px-2.5 py-1 rounded font-mono shadow-md">
            <Play className="w-3 h-3 fill-current" />
            <span>放映舞台</span>
          </span>
        </div>
      </button>

      {/* 标本元数据与暗房快捷按钮 */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="flex justify-between items-start gap-2 mb-1">
            <div
              className="text-sm font-semibold text-main truncate flex-1"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </div>
            <button
              type="button"
              onClick={() => onOpenStudio(artifact)}
              className="flex items-center gap-1 text-[11px] font-mono text-sky-400 hover:text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded hover:bg-sky-400/10 transition-colors shrink-0"
              title="打开独立暗房工作台"
            >
              <Code2 className="w-3 h-3" />
              <span>暗房</span>
            </button>
          </div>
          <div className="text-[11px] font-mono text-muted mb-2">{artifact.meta.filename}</div>
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
    </div>
  );
};
