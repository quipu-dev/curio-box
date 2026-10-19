import { useToast } from '@/context/ToastContext';
import { downloadBlob, exportAlbumAsZip } from '@/core/export/album-exporter';
import { resolveAlbumArtifacts, resolveAlbumCover } from '@/features/albums/album-resolver';
import { AlbumArtifactPickerModal } from '@/features/albums/components/detail/AlbumArtifactPickerModal';
import { AlbumMetaEditor } from '@/features/albums/components/detail/AlbumMetaEditor';
import { AlbumTracklist } from '@/features/albums/components/detail/AlbumTracklist';
import type { AlbumMeta, Artifact } from '@/types';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Download,
  Layers,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

interface AlbumDetailViewProps {
  album: AlbumMeta;
  allArtifacts: Artifact[];
  allTags?: string[];
  inspectingFilename?: string | null;
  onBackToAlbums: () => void;
  onSaveAlbum: (updated: AlbumMeta) => Promise<void>;
  onDeleteAlbum: (albumId: string) => Promise<void>;
  onOpenStage: (filename: string) => void;
  onOpenStudio: (artifact: Artifact) => void;
  onOpenInspector: (artifact: Artifact) => void;
}

export const AlbumDetailView: React.FC<AlbumDetailViewProps> = ({
  album,
  allArtifacts,
  allTags = [],
  inspectingFilename = null,
  onBackToAlbums,
  onSaveAlbum,
  onDeleteAlbum,
  onOpenStage,
  onOpenStudio,
  onOpenInspector,
}) => {
  const { toast } = useToast();

  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const resolvedArtifacts = useMemo(() => {
    return resolveAlbumArtifacts(album, allArtifacts);
  }, [album, allArtifacts]);

  const coverBlobUrl = useMemo(() => {
    return resolveAlbumCover(album, resolvedArtifacts);
  }, [album, resolvedArtifacts]);

  const includedArtifactIds = useMemo(() => {
    if (album.type !== 'manual') return new Set<string>();
    return new Set(album.items.map((i) => i.artifactId));
  }, [album]);

  const unincludedArtifacts = useMemo(() => {
    if (album.type !== 'manual') return [];
    return allArtifacts.filter((a) => !includedArtifactIds.has(a.meta.id));
  }, [allArtifacts, includedArtifactIds, album.type]);

  const handleSaveMeta = async (updated: AlbumMeta) => {
    try {
      await onSaveAlbum(updated);
      setIsEditingMeta(false);
      toast.success('画册配置已更新');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`保存画册失败: ${msg}`);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (album.type !== 'manual' || index <= 0) return;
    const nextItems = [...album.items];
    const temp = nextItems[index - 1];
    nextItems[index - 1] = nextItems[index];
    nextItems[index] = temp;
    await onSaveAlbum({ ...album, items: nextItems });
  };

  const handleMoveDown = async (index: number) => {
    if (album.type !== 'manual' || index >= album.items.length - 1) return;
    const nextItems = [...album.items];
    const temp = nextItems[index + 1];
    nextItems[index + 1] = nextItems[index];
    nextItems[index] = temp;
    await onSaveAlbum({ ...album, items: nextItems });
  };

  const handleMoveToTop = async (index: number) => {
    if (album.type !== 'manual' || index <= 0) return;
    const nextItems = [...album.items];
    const [target] = nextItems.splice(index, 1);
    nextItems.unshift(target);
    await onSaveAlbum({ ...album, items: nextItems });
    toast.success('标本已置顶到第一幕');
  };

  const handleRemoveArtifact = async (artifactId: string) => {
    if (album.type !== 'manual') return;
    const nextItems = album.items.filter((i) => i.artifactId !== artifactId);
    await onSaveAlbum({
      ...album,
      items: nextItems,
      customCoverArtifactId:
        album.customCoverArtifactId === artifactId ? undefined : album.customCoverArtifactId,
    });
    toast.info('已将工件从画册移出');
  };

  const handleSetCover = async (artifactId: string) => {
    if (album.type !== 'manual') return;
    const nextCover = album.customCoverArtifactId === artifactId ? undefined : artifactId;
    await onSaveAlbum({ ...album, customCoverArtifactId: nextCover });
    toast.success(nextCover ? '已将该工件设为画册专属封面' : '已恢复默认智能封面推导');
  };

  const handleAppendArtifact = async (artifactId: string) => {
    if (album.type !== 'manual') return;
    const nextItems = [...album.items, { artifactId }];
    await onSaveAlbum({ ...album, items: nextItems });
    toast.success('已收纳新标本至画册末尾');
  };

  const handleExportZip = async () => {
    if (resolvedArtifacts.length === 0) {
      toast.warn('画册内暂无可导出的标本工件');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgressText('正在准备离线打包...');

      const zipBlob = await exportAlbumAsZip(album, allArtifacts, (msg) => {
        setExportProgressText(msg);
      });

      const safeFilename = `${album.title.replace(/[\\/:*?"<>|]/g, '_') || 'album'}.zip`;
      downloadBlob(zipBlob, safeFilename);
      toast.success(`画册离线归档包【${safeFilename}】已成功生成！`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`离线打包失败: ${msg}`);
    } finally {
      setIsExporting(false);
      setExportProgressText('');
    }
  };

  const handleDeleteAlbum = async () => {
    const confirmed = window.confirm(
      `确定要删除画册【${album.title}】吗？此操作仅销毁相册编排配置，不会影响任何工件物理文件。`,
    );
    if (!confirmed) return;

    try {
      await onDeleteAlbum(album.id);
      toast.success('画册已安全删除');
      onBackToAlbums();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`删除画册失败: ${msg}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6 font-mono max-w-7xl mx-auto w-full">
      {/* 顶部导航与操作工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToAlbums}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded text-xs text-muted hover:text-main hover:bg-surface-subtle transition-colors"
            title="返回全部画册"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>画册列表</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 text-[10px] rounded-full border border-border flex items-center gap-1 ${
                album.type === 'smart'
                  ? 'bg-status-info-bg border-status-info-border text-status-info font-medium'
                  : 'bg-surface border-border text-main'
              }`}
            >
              {album.type === 'smart' ? (
                <Sparkles className="w-2.5 h-2.5" />
              ) : (
                <Layers className="w-2.5 h-2.5" />
              )}
              <span>{album.type === 'smart' ? '智能画册' : '手工策展'}</span>
            </span>

            <span className="text-xs text-muted">
              共收录 <strong className="text-main">{resolvedArtifacts.length}</strong> 件标本
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {resolvedArtifacts.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenStage(resolvedArtifacts[0].meta.filename)}
              className="flex items-center gap-1.5 bg-status-info-bg text-status-info border border-status-info-border px-3 py-1.5 rounded text-xs hover:bg-sky-500/25 transition-colors font-semibold"
              title="按画册既定次序开启受限全屏放映"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>整册受限放映</span>
            </button>
          )}

          <button
            type="button"
            disabled={isExporting || resolvedArtifacts.length === 0}
            onClick={handleExportZip}
            className="flex items-center gap-1.5 border border-border bg-surface px-3 py-1.5 rounded text-xs hover:bg-surface-subtle transition-colors text-main disabled:opacity-50"
            title="一键打包为自包含离线 ZIP 归档文件"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-status-info" />
                <span className="text-[11px]">{exportProgressText || '打包中...'}</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 text-status-info" />
                <span>离线 ZIP 导出</span>
              </>
            )}
          </button>

          {album.type === 'manual' && (
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-1.5 bg-main text-surface px-3 py-1.5 rounded text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>追加工件</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDeleteAlbum}
            className="p-1.5 border border-status-error-border text-status-error hover:bg-status-error-bg rounded transition-colors"
            title="删除此画册"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 画册展陈头部看板 */}
      <div className="bg-surface border border-border rounded-xl p-5 md:p-6 flex flex-col md:flex-row gap-6 shadow-sm">
        <div className="relative aspect-[16/10] w-full md:w-72 shrink-0 bg-background border border-border rounded-lg overflow-hidden flex items-center justify-center">
          {coverBlobUrl ? (
            <img src={coverBlobUrl} alt={album.title} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center justify-center gap-1.5 text-muted p-4 text-center">
              <BookOpen className="w-8 h-8 opacity-40 text-status-info" />
              <span className="text-xs font-mono">[ 暂无封面 ]</span>
            </div>
          )}

          {album.type === 'manual' && album.customCoverArtifactId && (
            <div className="absolute top-2 left-2 bg-black/80 border border-zinc-700 px-2 py-0.5 rounded text-[10px] text-sky-300">
              人工指定封面
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col justify-between gap-4">
          <AlbumMetaEditor
            album={album}
            allTags={allTags}
            isEditing={isEditingMeta}
            onStartEdit={() => setIsEditingMeta(true)}
            onCancelEdit={() => setIsEditingMeta(false)}
            onSave={handleSaveMeta}
          />

          <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              <span>更新时间：{new Date(album.updatedAt).toLocaleString()}</span>
            </span>
            <span className="text-[10px] text-muted">画册不可变 ID: {album.id}</span>
          </div>
        </div>
      </div>

      {/* 幕次编排网格 */}
      <AlbumTracklist
        album={album}
        artifacts={resolvedArtifacts}
        inspectingFilename={inspectingFilename}
        onOpenStage={onOpenStage}
        onOpenStudio={onOpenStudio}
        onOpenInspector={onOpenInspector}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        onMoveToTop={handleMoveToTop}
        onSetCover={handleSetCover}
        onRemoveArtifact={handleRemoveArtifact}
      />

      {/* 追加工件抽屉 */}
      {isPickerOpen && (
        <AlbumArtifactPickerModal
          unincludedArtifacts={unincludedArtifacts}
          onClose={() => setIsPickerOpen(false)}
          onAppendArtifact={handleAppendArtifact}
        />
      )}
    </div>
  );
};
