import { useToast } from '@/context/ToastContext';
import { resolveAlbumArtifacts, resolveAlbumCover } from '@/layer2_darkroom/engine/album-engine';
import { downloadBlob, exportAlbumAsZip } from '@/layer2_darkroom/engine/album-exporter';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { TagAutocompleteInput } from '@/layer3_gallery/components/TagAutocompleteInput';
import type { AlbumMeta, AlbumSortOption, Artifact } from '@/types';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpToLine,
  BookOpen,
  Calendar,
  Check,
  Download,
  Edit2,
  Image as ImageIcon,
  Layers,
  Loader2,
  Play,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  X,
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

  // 元数据就地编辑状态
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState(album.title);
  const [editDesc, setEditDesc] = useState(album.description || '');
  const [editRating, setEditRating] = useState(album.rating || 5);
  const [editQuery, setEditQuery] = useState(album.type === 'smart' ? album.query : '');
  const [editSortBy, setEditSortBy] = useState<AlbumSortOption>(
    album.type === 'smart' ? album.sortBy || 'rating-desc' : 'rating-desc',
  );
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // 离线 ZIP 打包状态
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');

  // 手工画册：追加工件模态抽屉
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // 实时推导当前画册所收录的有序工件集与封面
  const resolvedArtifacts = useMemo(() => {
    return resolveAlbumArtifacts(album, allArtifacts);
  }, [album, allArtifacts]);

  const coverBlobUrl = useMemo(() => {
    return resolveAlbumCover(album, resolvedArtifacts);
  }, [album, resolvedArtifacts]);

  // 已收录工件的 artifactId 集合
  const includedArtifactIds = useMemo(() => {
    if (album.type !== 'manual') return new Set<string>();
    return new Set(album.items.map((i) => i.artifactId));
  }, [album]);

  // 可供追加的可选工件列表
  const unincludedArtifacts = useMemo(() => {
    if (album.type !== 'manual') return [];
    return allArtifacts.filter((a) => !includedArtifactIds.has(a.meta.id));
  }, [allArtifacts, includedArtifactIds, album.type]);

  // 保存相册元数据修改
  const handleSaveMeta = async () => {
    const trimmedTitle = editTitle.trim();
    if (!trimmedTitle) {
      toast.warn('画册标题不能为空');
      return;
    }

    setIsSavingMeta(true);
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
      await onSaveAlbum(updated);
      setIsEditingMeta(false);
      toast.success('画册配置已更新');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`保存画册失败: ${msg}`);
    } finally {
      setIsSavingMeta(false);
    }
  };

  // 手工画册：工件上移
  const handleMoveUp = async (index: number) => {
    if (album.type !== 'manual' || index <= 0) return;
    const nextItems = [...album.items];
    const temp = nextItems[index - 1];
    nextItems[index - 1] = nextItems[index];
    nextItems[index] = temp;

    const updated: AlbumMeta = {
      ...album,
      items: nextItems,
    };
    await onSaveAlbum(updated);
  };

  // 手工画册：工件下移
  const handleMoveDown = async (index: number) => {
    if (album.type !== 'manual' || index >= album.items.length - 1) return;
    const nextItems = [...album.items];
    const temp = nextItems[index + 1];
    nextItems[index + 1] = nextItems[index];
    nextItems[index] = temp;

    const updated: AlbumMeta = {
      ...album,
      items: nextItems,
    };
    await onSaveAlbum(updated);
  };

  // 手工画册：工件置顶
  const handleMoveToTop = async (index: number) => {
    if (album.type !== 'manual' || index <= 0) return;
    const nextItems = [...album.items];
    const [target] = nextItems.splice(index, 1);
    nextItems.unshift(target);

    const updated: AlbumMeta = {
      ...album,
      items: nextItems,
    };
    await onSaveAlbum(updated);
    toast.success('标本已置顶到第一幕');
  };

  // 手工画册：移除工件
  const handleRemoveArtifact = async (artifactId: string) => {
    if (album.type !== 'manual') return;
    const nextItems = album.items.filter((i) => i.artifactId !== artifactId);
    const updated: AlbumMeta = {
      ...album,
      items: nextItems,
      customCoverArtifactId:
        album.customCoverArtifactId === artifactId ? undefined : album.customCoverArtifactId,
    };
    await onSaveAlbum(updated);
    toast.info('已将工件从画册移出');
  };

  // 手工画册：设为专属封面
  const handleSetCover = async (artifactId: string) => {
    if (album.type !== 'manual') return;
    const nextCover = album.customCoverArtifactId === artifactId ? undefined : artifactId;
    const updated: AlbumMeta = {
      ...album,
      customCoverArtifactId: nextCover,
    };
    await onSaveAlbum(updated);
    toast.success(nextCover ? '已将该工件设为画册专属封面' : '已恢复默认智能封面推导');
  };

  // 手工画册：追加收录工件
  const handleAppendArtifact = async (artifactId: string) => {
    if (album.type !== 'manual') return;
    const nextItems = [...album.items, { artifactId }];
    const updated: AlbumMeta = {
      ...album,
      items: nextItems,
    };
    await onSaveAlbum(updated);
    toast.success('已收纳新标本至画册末尾');
  };

  // 一键自包含离线 ZIP 归档打包
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

  // 删除画册
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
              className={`px-2 py-0.5 text-[10px] rounded-full border flex items-center gap-1 ${
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

        {/* 右侧动作按钮区 */}
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

      {/* 画册展陈头部元数据看板 */}
      <div className="bg-surface border border-border rounded-xl p-5 md:p-6 flex flex-col md:flex-row gap-6 shadow-sm">
        {/* 画册封面预览位 */}
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

        {/* 标题、评级与导言编辑区 */}
        <div className="flex-1 flex flex-col justify-between gap-4">
          {isEditingMeta ? (
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
                    disabled={isSavingMeta}
                    onClick={() => {
                      setEditTitle(album.title);
                      setEditDesc(album.description || '');
                      setEditRating(album.rating || 5);
                      setIsEditingMeta(false);
                    }}
                    className="px-2.5 py-1 text-xs text-muted hover:text-main"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={isSavingMeta}
                    onClick={handleSaveMeta}
                    className="flex items-center gap-1 bg-main text-surface px-3 py-1 rounded text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {isSavingMeta ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3" />
                    )}
                    <span>保存配置</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold font-sans text-main tracking-tight">
                    {album.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTitle(album.title);
                      setEditDesc(album.description || '');
                      setEditRating(album.rating || 5);
                      if (album.type === 'smart') {
                        setEditQuery(album.query);
                        setEditSortBy(album.sortBy || 'rating-desc');
                      }
                      setIsEditingMeta(true);
                    }}
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
                <div className="text-[11px] font-mono bg-background px-3 py-1.5 rounded border border-border text-zinc-300 flex items-center gap-2">
                  <span className="text-muted">规则:</span>
                  <span className="text-status-info font-medium">{album.query || '（全部）'}</span>
                  <span className="text-border">|</span>
                  <span className="text-muted">排序:</span>
                  <span>{album.sortBy || 'rating-desc'}</span>
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              <span>更新时间：{new Date(album.updatedAt).toLocaleString()}</span>
            </span>
            <span className="text-[10px] text-muted">画册不可变 ID: {album.id}</span>
          </div>
        </div>
      </div>

      {/* 工件曲目编排网格 (Tracklist / Artifact Grid) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-muted border-b border-border pb-2">
          <span>
            {album.type === 'manual'
              ? '人工策展次序（支持上移、下移、置顶与设定封面）：'
              : '智能匹配到的工件流：'}
          </span>
          <span className="text-main font-semibold">{resolvedArtifacts.length} 件</span>
        </div>

        {resolvedArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {resolvedArtifacts.map((art, idx) => {
              const isCover =
                album.type === 'manual' && album.customCoverArtifactId === art.meta.id;

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
                      <span className="bg-black/80 backdrop-blur-sm text-zinc-200 border border-zinc-700/90 px-2 py-0.5 rounded text-[10px] font-mono">
                        第 {idx + 1} 幕
                      </span>
                      {isCover && (
                        <span className="bg-sky-500/90 text-black font-semibold px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 shadow-sm">
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
                            onClick={() => handleMoveUp(idx)}
                            className="p-1 border border-border rounded hover:bg-surface-subtle disabled:opacity-30"
                            title="向前移"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === resolvedArtifacts.length - 1}
                            onClick={() => handleMoveDown(idx)}
                            className="p-1 border border-border rounded hover:bg-surface-subtle disabled:opacity-30"
                            title="向后移"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveToTop(idx)}
                            className="p-1 border border-border rounded hover:bg-surface-subtle disabled:opacity-30"
                            title="置顶到第一幕"
                          >
                            <ArrowUpToLine className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetCover(art.meta.id)}
                            className={`p-1 border rounded transition-colors ${
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
                            onClick={() => handleRemoveArtifact(art.meta.id)}
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

      {/* 手工画册：追加工件抽屉模态框 */}
      {isPickerOpen && (
        <div className="fixed inset-0 z-50 bg-surface-overlay flex items-center justify-center p-4 animate-in fade-in select-none">
          <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden text-main font-mono text-xs max-h-[80vh]">
            <header className="h-13 bg-background border-b border-border px-4 flex justify-between items-center shrink-0">
              <span className="font-bold text-sm font-sans">追加标本至画册</span>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
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
                      onClick={() => handleAppendArtifact(art.meta.id)}
                      className="px-2.5 py-1 bg-status-info-bg text-status-info border border-status-info-border rounded text-[11px] hover:bg-sky-500/30 transition-colors shrink-0"
                    >
                      收纳
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-muted text-xs">
                  所有可用工件均已被该画册收录
                </div>
              )}
            </div>

            <footer className="h-12 bg-background border-t border-border px-4 flex justify-end items-center shrink-0">
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="px-4 py-1 border border-border rounded text-muted hover:text-main text-xs"
              >
                完成
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
