import type { Artifact } from '@/types';
import { X } from 'lucide-react';
import type React from 'react';

interface AlbumArtifactPickerModalProps {
  unincludedArtifacts: Artifact[];
  onClose: () => void;
  onAppendArtifact: (artifactId: string) => void;
}

export const AlbumArtifactPickerModal: React.FC<AlbumArtifactPickerModalProps> = ({
  unincludedArtifacts,
  onClose,
  onAppendArtifact,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-surface-overlay flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-main font-mono text-xs max-h-[80vh]">
        <header className="h-13 bg-background border-b border-border px-4 flex justify-between items-center shrink-0">
          <span className="font-bold text-sm font-sans">追加标本至画册</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted hover:text-main rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-2">
          {unincludedArtifacts.length > 0 ? (
            unincludedArtifacts.map((art) => (
              <div
                key={art.meta.id}
                className="flex items-center justify-between p-2.5 bg-background border border-border rounded-lg"
              >
                <div className="flex flex-col min-w-0 mr-2">
                  <span className="font-bold font-sans text-xs truncate">{art.meta.name}</span>
                  <span className="text-[10px] text-muted truncate">
                    {art.meta.filename} · REV:{art.meta.currentRevision}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => onAppendArtifact(art.meta.id)}
                  className="px-2.5 py-1 bg-status-info-bg text-status-info border border-status-info-border rounded text-[11px] hover:bg-sky-500/30 transition-colors shrink-0"
                >
                  收纳
                </button>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-muted text-xs">所有可用工件均已被该画册收录</div>
          )}
        </div>

        <footer className="h-12 bg-background border-t border-border px-4 flex justify-end items-center shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 border border-border rounded text-muted hover:text-main text-xs"
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
};
