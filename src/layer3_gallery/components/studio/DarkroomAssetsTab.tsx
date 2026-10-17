import type { AssetCacheStats } from '@/layer2_darkroom/engine/asset-cache';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { CheckCircle2, Sparkles, Tag as TagIcon } from 'lucide-react';
import type React from 'react';

interface DarkroomAssetsTabProps {
  tags: string[];
  assetStats: AssetCacheStats | null;
  onCacheAllAssets: () => void;
}

export const DarkroomAssetsTab: React.FC<DarkroomAssetsTabProps> = ({
  tags,
  assetStats,
  onCacheAllAssets,
}) => {
  return (
    <div className="flex flex-col gap-3">
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
            <span className="text-[11px] font-semibold text-sky-400">
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
                <span className="truncate max-w-[280px] text-zinc-300 font-mono">
                  {asset.url.split('/').pop()}
                </span>
                {asset.status === 'cached' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>已离线</span>
                  </span>
                ) : (
                  <span className="text-amber-400 shrink-0">未缓存</span>
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
            className="w-full mt-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 py-1.5 rounded text-xs hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>一键缓存全部外部资源</span>
          </button>
        )}
      </div>
    </div>
  );
};
