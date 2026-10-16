export interface ExternalAsset {
  url: string;
  type: 'script' | 'style';
  status: 'cached' | 'fetching' | 'pending' | 'failed';
}

export interface AssetCacheStats {
  total: number;
  cached: number;
  assets: ExternalAsset[];
}

const CACHE_NAME = 'curio_box_asset_cache_v1';

export const AssetCacheEngine = {
  /**
   * 嗅探 HTML 中所有外链 CDN 的 script 与 link[rel="stylesheet"]
   */
  detectExternalAssets(html: string): ExternalAsset[] {
    const assets: ExternalAsset[] = [];
    const scriptRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const styleRegex = /<link\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
      if (match[1]) {
        assets.push({ url: match[1], type: 'script', status: 'pending' });
      }
    }

    while ((match = styleRegex.exec(html)) !== null) {
      const fullTag = match[0].toLowerCase();
      if (fullTag.includes('stylesheet') && match[1]) {
        assets.push({ url: match[1], type: 'style', status: 'pending' });
      }
    }

    return assets;
  },

  /**
   * 查询指定 URL 是否已存在本地缓存中
   */
  async isCached(url: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      return Boolean(match);
    } catch {
      return false;
    }
  },

  /**
   * 抓取并将外部资源保存至本地 Cache Storage
   */
  async cacheAsset(url: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        await cache.put(url, response.clone());
        return true;
      }
      return false;
    } catch (err) {
      console.warn(`[AssetCache] 缓存资源失败 (${url}):`, err);
      return false;
    }
  },

  /**
   * 解析 HTML，将已缓存的远程外链替换为本地 Blob URL，未缓存的在后台异步预热
   */
  async resolveAndWarmupHtml(
    rawHtml: string,
    onProgress?: (stats: AssetCacheStats) => void,
  ): Promise<{ resolvedHtml: string; stats: AssetCacheStats }> {
    const rawAssets = this.detectExternalAssets(rawHtml);
    if (rawAssets.length === 0) {
      const stats = { total: 0, cached: 0, assets: [] };
      onProgress?.(stats);
      return { resolvedHtml: rawHtml, stats };
    }

    let modifiedHtml = rawHtml;
    const assetsWithStatus: ExternalAsset[] = [];
    let cachedCount = 0;

    for (const asset of rawAssets) {
      const alreadyCached = await this.isCached(asset.url);
      if (alreadyCached) {
        try {
          const cache = await caches.open(CACHE_NAME);
          const response = await cache.match(asset.url);
          if (response) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            modifiedHtml = modifiedHtml.split(asset.url).join(blobUrl);
            cachedCount++;
            assetsWithStatus.push({ ...asset, status: 'cached' });
            continue;
          }
        } catch {
          // 降级使用原链接
        }
      }

      assetsWithStatus.push({ ...asset, status: 'pending' });

      // 后台非阻塞预热拉取
      this.cacheAsset(asset.url).catch(() => {});
    }

    const finalStats: AssetCacheStats = {
      total: rawAssets.length,
      cached: cachedCount,
      assets: assetsWithStatus,
    };

    onProgress?.(finalStats);
    return { resolvedHtml: modifiedHtml, stats: finalStats };
  },

  /**
   * 清理整个工件静态缓存库
   */
  async clearCache(): Promise<boolean> {
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    try {
      return await caches.delete(CACHE_NAME);
    } catch {
      return false;
    }
  },
};