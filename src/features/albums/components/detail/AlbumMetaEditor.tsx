import { TagAutocompleteInput } from '@/components/common/TagAutocompleteInput';
import type { AlbumMeta, AlbumSortOption } from '@/types';
import { Edit2, Loader2, Save, Star } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface AlbumMetaEditorProps {
  album: AlbumMeta;
  allTags: string[];
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updated: AlbumMeta) => Promise<void>;
}

export const AlbumMetaEditor: React.FC<AlbumMetaEditorProps> = ({
  album,
  allTags,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
}) => {
  const [editTitle, setEditTitle] = useState(album.title);
  const [editDesc, setEditDesc] = useState(album.description || '');
  const [editRating, setEditRating] = useState(album.rating || 5);
  const [editQuery, setEditQuery] = useState(album.type === 'smart' ? album.query : '');
  const [editSortBy, setEditSortBy] = useState<AlbumSortOption>(
    album.type === 'smart' ? album.sortBy || 'rating-desc' : 'rating-desc',
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleStart = () => {
    setEditTitle(album.title);
    setEditDesc(album.description || '');
    setEditRating(album.rating || 5);
    if (album.type === 'smart') {
      setEditQuery(album.query);
      setEditSortBy(album.sortBy || 'rating-desc');
    }
    onStartEdit();
  };

  const handleSave = async () => {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) return;

    setIsSaving(true);
    try {
      let updated: AlbumMeta;
      if (album.type === 'manual') {
        updated = {
          ...album,
          title: trimmedTitle,
          description: editDesc.trim() || undefined,
          rating: editRating,
        };
      } else {
        updated = {
          ...album,
          title: trimmedTitle,
          description: editDesc.trim() || undefined,
          rating: editRating,
          query: editQuery.trim(),
          sortBy: editSortBy,
        };
      }
      await onSave(updated);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-album-title"
            className="text-[10px] uppercase text-muted tracking-wider"
          >
            画册标题 *
          </label>
          <input
            id="edit-album-title"
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="bg-background border border-border px-3 py-1.5 rounded text-sm text-main outline-none focus:border-sky-400 font-sans font-bold"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="edit-album-desc"
            className="text-[10px] uppercase text-muted tracking-wider"
          >
            策展导言 / 专题备注
          </label>
          <textarea
            id="edit-album-desc"
            rows={2}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            className="bg-background border border-border p-2 rounded text-xs text-main outline-none focus:border-sky-400 font-sans resize-none"
          />
        </div>

        {album.type === 'smart' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-background p-2.5 rounded border border-border">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="edit-album-query"
                className="text-[10px] uppercase text-muted tracking-wider"
              >
                智能标签规则 (Tag Query DSL)
              </label>
              <TagAutocompleteInput
                id="edit-album-query"
                value={editQuery}
                onChange={setEditQuery}
                allTags={allTags}
                className="w-full bg-surface border border-border px-2 py-1 rounded text-xs text-main outline-none focus:border-sky-400"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="edit-album-sort"
                className="text-[10px] uppercase text-muted tracking-wider"
              >
                智能排序规则
              </label>
              <select
                id="edit-album-sort"
                value={editSortBy}
                onChange={(e) => setEditSortBy(e.target.value as AlbumSortOption)}
                className="bg-surface border border-border text-main px-2 py-1 rounded text-xs outline-none"
              >
                <option value="rating-desc">评分最高优先</option>
                <option value="date-desc">最新导入优先</option>
                <option value="date-asc">最早导入优先</option>
                <option value="updated-desc">最近活跃优先</option>
                <option value="name-asc">名称 A-Z</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase text-muted mr-2">评级</span>
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setEditRating(s)}
                className="p-0.5 hover:scale-110 transition-transform outline-none"
              >
                <Star
                  className={`w-4 h-4 ${
                    s <= editRating ? 'fill-amber-400 text-status-warn' : 'text-muted'
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onCancelEdit}
              className="px-2.5 py-1 text-xs text-muted hover:text-main"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="flex items-center gap-1 bg-main text-surface px-3 py-1 rounded text-xs font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              <span>保存配置</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold font-sans text-main tracking-tight">{album.title}</h1>
          <button
            type="button"
            onClick={handleStart}
            className="p-1 text-muted hover:text-main rounded hover:bg-surface-subtle"
            title="编辑画册信息"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {album.rating && album.rating > 0 ? (
          <div className="flex items-center gap-1 text-status-warn bg-status-warn-bg px-2 py-0.5 rounded border border-status-warn-border text-xs">
            <Star className="w-3 h-3 fill-current" />
            <span>{album.rating} 星精选</span>
          </div>
        ) : null}
      </div>

      {album.description ? (
        <p className="text-xs text-muted font-sans leading-relaxed whitespace-pre-wrap">
          {album.description}
        </p>
      ) : (
        <div className="text-xs text-muted/60 italic font-sans">
          暂无策展导言，点击编辑图标添加说明...
        </div>
      )}

      {album.type === 'smart' && (
        <div className="text-[11px] font-mono bg-background px-3 py-1.5 rounded border border-border text-main flex items-center gap-2">
          <span className="text-muted">规则:</span>
          <span className="text-status-info font-medium">{album.query || '（全部）'}</span>
          <span className="text-muted">|</span>
          <span className="text-muted">排序:</span>
          <span>{album.sortBy || 'rating-desc'}</span>
        </div>
      )}
    </div>
  );
};
