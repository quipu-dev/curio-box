import { AlbumCard } from '@/features/albums/components/AlbumCard';
import type { Album } from '@/types';
import { BookOpen, Plus, Sparkles } from 'lucide-react';
import type React from 'react';

interface AlbumsViewProps {
  albums: Album[];
  searchQuery: string;
  onOpenAlbumDetail: (albumId: string) => void;
  onOpenCreateModal: () => void;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({
  albums,
  searchQuery,
  onOpenAlbumDetail,
  onOpenCreateModal,
}) => {
  const filteredAlbums = albums.filter((album) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = album.meta.title.toLowerCase().includes(q);
    const descMatch = Boolean(album.meta.description?.toLowerCase().includes(q));
    const queryMatch =
      album.meta.type === 'smart' && Boolean(album.meta.query.toLowerCase().includes(q));
    return titleMatch || descMatch || queryMatch;
  });

  return (
    <div className="flex-1 flex flex-col gap-6 font-mono">
      {/* 顶部统计与操作栏 */}
      <div className="flex justify-between items-center text-xs text-muted border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span>共收纳策展画册：</span>
          <span className="text-main font-semibold">{filteredAlbums.length}</span>
          <span>/</span>
          <span>{albums.length}</span>
        </div>

        <button
          type="button"
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 bg-status-info-bg text-status-info border border-status-info-border px-3 py-1 rounded hover:bg-sky-500/25 transition-colors text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建策展画册</span>
        </button>
      </div>

      {/* 画册网格展示 */}
      {filteredAlbums.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-1">
          {filteredAlbums.map((album) => (
            <AlbumCard
              key={album.meta.id}
              album={album}
              onClick={() => onOpenAlbumDetail(album.meta.id)}
            />
          ))}
        </div>
      ) : (
        <div className="h-72 border border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-3 text-muted">
          <BookOpen className="w-10 h-10 opacity-30 text-status-info" />
          <div className="text-sm font-semibold text-main">
            {albums.length === 0 ? '尚未创建任何策展画册' : '未匹配到符合条件的画册'}
          </div>
          <p className="text-xs max-w-sm text-center leading-relaxed text-muted font-sans">
            画册可以将零散的工件按特定叙事、教学阶段或算法演化串联成册，并支持一键受限放映与离线 ZIP
            打包。
          </p>
          <button
            type="button"
            onClick={onOpenCreateModal}
            className="mt-2 flex items-center gap-1.5 bg-main text-surface px-4 py-2 rounded text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>创建第一本策展画册</span>
          </button>
        </div>
      )}
    </div>
  );
};
