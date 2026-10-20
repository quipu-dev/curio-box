import { type AssetCacheStats, getAssetDisplayName } from '@/core/engine/asset-cache';
import { TagQueryEngine } from '@/core/engine/tag-engine';
import {
  CheckCircle2,
  Edit2,
  Loader2,
  MessageSquareQuote,
  Save,
  Sparkles,
  Tag as TagIcon,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface DarkroomAssetsTabProps {
  tags: string[];
  description?: string;
  onUpdateDescription: (newDesc: string) => Promise<void>;
  assetStats: AssetCacheStats | null;
  onCacheAllAssets: () => void;
}

export const DarkroomAssetsTab: React.FC<DarkroomAssetsTabProps> = ({
  tags,
  description,
  onUpdateDescription,
  assetStats,
  onCacheAllAssets,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [descValue, setDescValue] = useState(description || '');

  const handleSaveDesc = async () => {
    setIsSaving(true);
    try {
      await onUpdateDescription(descValue);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 研判描述卡片 */}
      <div className="bg-background border border-border p-3 rounded flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1.5">
            <MessageSquareQuote className="w-3 h-3 text-status-info" />
            <span>工件研判备忘</span>
          </span>

          {isEditing ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveDesc}
                className="flex items-center gap-1 px-2 py-0.5 bg-sky-500 text-black font-semibold rounded text-[10px] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isSaving ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Save className="w-2.5 h-2.5" />
                )}
                <span>{isSaving ? '保存中' : '保存'}</span>
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setDescValue(description || '');
                  setIsEditing(false);
                }}
                className="px-1.5 py-0.5 text-muted hover:text-main text-[10px] disabled:opacity-50"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDescValue(description || '');
                setIsEditing(true);
              }}
              className="flex items-center gap-1 text-[11px] text-status-info hover:text-status-info"
            >
              <Edit2 className="w-3 h-3" />
              <span>{description ? '编辑' : '添加'}</span>
            </button>
          )}
        </div>

        {isEditing ? (
          <textarea
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            rows={3}
            placeholder="记录工件特点、动画优劣与调整建议..."
            className="w-full bg-surface border border-status-info p-2 rounded text-xs text-main outline-none font-sans leading-relaxed resize-none"
          />
        ) : (
          <div className="text-xs text-main font-sans leading-relaxed whitespace-pre-wrap">
            {description || <span className="text-muted italic">暂无备忘，点击上方“添加”记录</span>}
          </div>
        )}
      </div>

      <div className="bg-background border border-border p-3 rounded">
        <div className="text-[10px] uppercase text-muted tracking-wider mb-2">工件分类与标签</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((rawTag) => {
            const parsed = TagQueryEngine.parseTag(rawTag);
            return (
              <span
                key={rawTag}
                className="inline-flex items-center bg-tag border border-border px-2 py-0.5 text-[11px] rounded"
              >
                <TagIcon className="w-2.5 h-2.5 text-muted mr-1" />
                {parsed.namespace && <span className="text-muted">{parsed.namespace}:</span>}
                <span className="font-medium text-main">{parsed.value}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="bg-background border border-border p-3 rounded flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-muted tracking-wider">
            外部资源与本地缓存
          </span>
          {assetStats && (
            <span className="text-[11px] font-semibold text-status-info">
              {assetStats.cached}/{assetStats.total} 已缓存
            </span>
          )}
        </div>

        {assetStats && assetStats.assets.length > 0 ? (
          <div className="flex flex-col gap-1.5 mt-1 max-h-48 overflow-y-auto">
            {assetStats.assets.map((asset) => (
              <div
                key={asset.url}
                className="flex items-center justify-between p-2 bg-surface border border-border rounded text-[11px]"
              >
                <span className="truncate max-w-[280px] text-main font-mono" title={asset.url}>
                  {getAssetDisplayName(asset.url)}
                </span>
                {asset.status === 'cached' ? (
                  <span className="inline-flex items-center gap-1 text-status-success shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>已离线</span>
                  </span>
                ) : (
                  <span className="text-status-warn shrink-0">未缓存</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted text-[11px]">未引用外部 CDN 资源</div>
        )}

        {assetStats && assetStats.cached < assetStats.total && (
          <button
            type="button"
            onClick={onCacheAllAssets}
            className="w-full mt-2 bg-status-info-bg border border-status-info-border text-status-info py-1.5 rounded text-xs hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>一键缓存全部外部资源</span>
          </button>
        )}
      </div>
    </div>
  );
};
