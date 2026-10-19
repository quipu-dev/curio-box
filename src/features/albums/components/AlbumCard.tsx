import type { Album } from '@/types';
import { BookOpen, Calendar, Layers, Sparkles, Star } from 'lucide-react';
import type React from 'react';

interface AlbumCardProps {
  album: Album;
  onClick: () => void;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({ album, onClick }) => {
  const isSmart = album.meta.type === 'smart';

  return (
    <div className="relative group select-none">
      {/* 主卡片 */}
      <button
        type="button"
        onClick={onClick}
        className="relative w-full text-left bg-surface border border-border group-hover:border-sky-500/60 rounded-xl overflow-hidden shadow-sm group-hover:shadow-md transition-all duration-200 flex flex-col cursor-pointer outline-none"
      >
        {/* 封面画幅区域 */}
        <div className="relative aspect-[16/10] w-full bg-background border-b border-border overflow-hidden flex items-center justify-center">
          {album.coverBlobUrl ? (
            <img
              src={album.coverBlobUrl}
              alt={album.meta.title}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted p-4 text-center">
              <BookOpen className="w-8 h-8 opacity-40 text-status-info" />
              <span className="text-xs font-mono">[ 暂无封面 ]</span>
            </div>
          )}

          {/* 右上角评级与类型徽章 */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            {album.meta.rating && album.meta.rating > 0 ? (
              <div className="bg-surface/90 backdrop-blur-sm border border-status-warn-border px-2 py-0.5 text-[10px] font-mono text-status-warn rounded-full flex items-center gap-1 shadow-sm">
                <Star className="w-3 h-3 fill-current" />
                <span>{album.meta.rating}</span>
              </div>
            ) : null}

            <div
              className={`px-2 py-0.5 text-[10px] font-mono rounded-full border shadow-sm flex items-center gap-1 backdrop-blur-sm ${
                isSmart
                  ? 'bg-status-info-bg/90 border-status-info-border text-status-info font-medium'
                  : 'bg-surface/90 border-border text-main'
              }`}
            >
              {isSmart ? <Sparkles className="w-2.5 h-2.5" /> : <Layers className="w-2.5 h-2.5" />}
              <span>{isSmart ? '智能画册' : '策展汇编'}</span>
            </div>
          </div>

          {/* 左下角工件数徽标 */}
          <div className="absolute bottom-2.5 left-2.5 bg-black/75 backdrop-blur-sm border border-zinc-700/60 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-200 flex items-center gap-1">
            <Layers className="w-3 h-3 text-status-info" />
            <span>{album.artifactCount} 件标本</span>
          </div>
        </div>

        {/* 标题与描述 */}
        <div className="p-4 flex flex-col gap-2 flex-1 justify-between">
          <div className="flex flex-col gap-1.5">
            <div
              className="font-bold text-sm text-main truncate font-sans group-hover:text-status-info transition-colors"
              title={album.meta.title}
            >
              {album.meta.title}
            </div>

            <p
              className="text-xs text-muted font-sans line-clamp-2 leading-relaxed min-h-[2.25rem]"
              title={album.meta.description || ''}
            >
              {album.meta.description || <span className="opacity-0">暂无导言</span>}
            </p>

            {album.meta.type === 'smart' ? (
              <div className="font-mono text-[11px] text-zinc-400 bg-surface-subtle border border-border px-2 py-1 rounded truncate h-6 flex items-center">
                DSL: <span className="text-status-info ml-1">{album.meta.query || '（全部）'}</span>
              </div>
            ) : (
              <div className="font-mono text-[11px] text-muted bg-surface-subtle/50 border border-border/50 px-2 py-1 rounded truncate h-6 flex items-center gap-1">
                <Layers className="w-3 h-3 opacity-60 text-status-info" />
                <span>手工收纳 · 自由排序</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[10px] font-mono text-muted">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted" />
              <span>{new Date(album.meta.updatedAt).toLocaleDateString()}</span>
            </span>
            <span className="text-status-info group-hover:underline">浏览画册 →</span>
          </div>
        </div>
      </button>
    </div>
  );
};
