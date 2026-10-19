import { ArtifactCard } from '@/features/gallery/components/ArtifactCard';
import type { AlbumMeta, Artifact } from '@/types';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  BookOpen,
  Check,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import type React from 'react';

interface AlbumTracklistProps {
  album: AlbumMeta;
  artifacts: Artifact[];
  inspectingFilename?: string | null;
  onOpenStage: (filename: string) => void;
  onOpenStudio: (artifact: Artifact) => void;
  onOpenInspector: (artifact: Artifact) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onMoveToTop: (index: number) => void;
  onSetCover: (artifactId: string) => void;
  onRemoveArtifact: (artifactId: string) => void;
}

export const AlbumTracklist: React.FC<AlbumTracklistProps> = ({
  album,
  artifacts,
  inspectingFilename,
  onOpenStage,
  onOpenStudio,
  onOpenInspector,
  onMoveUp,
  onMoveDown,
  onMoveToTop,
  onSetCover,
  onRemoveArtifact,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-muted border-b border-border pb-2">
        <span>
          {album.type === 'manual'
            ? '人工策展次序（支持上移、下移、置顶与设定封面）：'
            : '智能匹配到的工件流：'}
        </span>
        <span className="text-main font-semibold">{artifacts.length} 件</span>
      </div>

      {artifacts.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 280px))',
            gap: '20px',
          }}
        >
          {artifacts.map((art, idx) => {
            const isCover = album.type === 'manual' && album.customCoverArtifactId === art.meta.id;

            return (
              <ArtifactCard
                key={art.meta.id}
                artifact={art}
                isSelected={inspectingFilename === art.meta.filename}
                onOpenStage={() => onOpenStage(art.meta.filename)}
                onOpenStudio={() => onOpenStudio(art)}
                onOpenInspector={() => onOpenInspector(art)}
                badgeSlot={
                  <div className="flex items-center gap-1.5">
                    <span className="bg-black/80 backdrop-blur-sm text-white border border-zinc-700 px-2 py-0.5 rounded text-[10px] font-mono">
                      第 {idx + 1} 幕
                    </span>
                    {isCover && (
                      <span className="bg-sky-500 text-black font-semibold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 shadow-sm">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                        <span>封面</span>
                      </span>
                    )}
                  </div>
                }
                footerSlot={
                  album.type === 'manual' ? (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[10px] text-muted">幕次编排</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveUp(idx)}
                          className="p-1 border border-border rounded hover:bg-surface-subtle disabled:opacity-30"
                          title="向前移"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === artifacts.length - 1}
                          onClick={() => onMoveDown(idx)}
                          className="p-1 border border-border rounded hover:bg-surface-subtle disabled:opacity-30"
                          title="向后移"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveToTop(idx)}
                          className="p-1 border border-border rounded hover:bg-surface-subtle disabled:opacity-30"
                          title="置顶到第一幕"
                        >
                          <ArrowUpToLine className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onSetCover(art.meta.id)}
                          className={`p-1 border border-border rounded transition-colors ${
                            isCover
                              ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                              : 'border-border hover:bg-surface-subtle text-muted'
                          }`}
                          title={isCover ? '取消专属封面' : '设为此画册专属封面'}
                        >
                          <ImageIcon className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveArtifact(art.meta.id)}
                          className="p-1 border border-border rounded hover:border-status-error-border text-muted hover:text-status-error"
                          title="移出此画册"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : null
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="h-64 border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 text-muted">
          <BookOpen className="w-8 h-8 opacity-30 text-status-info" />
          <span className="text-xs">
            {album.type === 'manual'
              ? '该画册暂未添加任何工件标本，点击上方“追加工件”开始策展。'
              : '当前标签规则未匹配到任何工件，请尝试调整 Tag DSL 表达式。'}
          </span>
        </div>
      )}
    </div>
  );
};
