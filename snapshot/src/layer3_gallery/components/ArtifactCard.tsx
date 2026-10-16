import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import type React from 'react';

interface ArtifactCardProps {
  artifact: Artifact;
  onOpenDarkroom: (artifact: Artifact) => void;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({ artifact, onOpenDarkroom }) => {
  return (
    <button
      type="button"
      onClick={() => onOpenDarkroom(artifact)}
      className="text-left w-full bg-surface border border-border rounded overflow-hidden cursor-pointer hover:border-muted hover:-translate-y-0.5 transition-all flex flex-col group focus:outline-none focus:ring-1 focus:ring-muted"
    >
      <div className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center">
        <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted z-10 rounded">
          静默陈列态
        </div>

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
      </div>

      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-main mb-1 truncate" title={artifact.meta.name}>
            {artifact.meta.name}
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
    </button>
  );
};
