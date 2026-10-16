export interface ExternalAsset {
  url: string;
  type: 'script' | 'style';
  status: 'cached' | 'fetching' | 'pending' | 'failed' | 'cors_restricted';
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
   * 获取缓存的文本内容
   */
  async getCachedText(url: string): Promise<string | null> {
    if (typeof window === 'undefined' || !('caches' in window)) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(url);
      if (response) {
        return await response.text();
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * 抓取并将外部资源保存至本地 Cache Storage（静默处理 CORS 失败）
   */
  async cacheAsset(url: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('caches' in window)) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      // 发起请求，注意若对方服务端未返回 Access-Control-Allow-Origin，将触发可捕获的 TypeError
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        await cache.put(url, response.clone());
        return true;
      }
      return false;
    } catch {
      // 对不支持 CORS fetch 的 CDN 静默降级，不打印控制台错误打扰用户
      return false;
    }
  },

  /**
   * 解析 HTML：已缓存资源以内联 script/style 安全注入（规避 sandbox blob 跨源限制），未缓存资源后台静默预热
   */
  async resolveAndWarmupHtml(
    rawHtml: string,
    onProgress?: (stats: AssetCacheStats) => void,
  ): Promise<{ resolvedHtml: string; stats: AssetCacheStats }> {
    const rawAssets = this.detectExternalAssets(rawHtml);
    if (rawAssets.length === 0) {
      const stats: AssetCacheStats = { total: 0, cached: 0, assets: [] };
      onProgress?.(stats);
      return { resolvedHtml: rawHtml, stats };
    }

    let modifiedHtml = rawHtml;
    const assetsWithStatus: ExternalAsset[] = [];
    let cachedCount = 0;

    for (const asset of rawAssets) {
      const alreadyCached = await this.isCached(asset.url);
      if (alreadyCached) {
        const textContent = await this.getCachedText(asset.url);
        if (textContent) {
          cachedCount++;
          assetsWithStatus.push({ ...asset, status: 'cached' });

          if (asset.type === 'script') {
            // 将 <script src="..."></script> 完整替换为内联脚本
            const scriptTagPattern = new RegExp(
              `<script\\s+[^>]*src=["']${escapeRegExp(asset.url)}["'][^>]*>\\s*<\\/script>`,
              'gi',
            );
            modifiedHtml = modifiedHtml.replace(
              scriptTagPattern,
              `<script data-curio-cached="true">/* [Curio Box 本地离线加速] */\n${textContent}\n</script>`,
            );
          } else {
            // 将 <link href="..." /> 完整替换为内联样式
            const linkTagPattern = new RegExp(
              `<link\\s+[^>]*href=["']${escapeRegExp(asset.url)}["'][^>]*\\/?>`,
              'gi',
            );
            modifiedHtml = modifiedHtml.replace(
              linkTagPattern,
              `<style data-curio-cached="true">/* [Curio Box 本地离线加速] */\n${textContent}\n</style>`,
            );
          }
          continue;
        }
      }

      assetsWithStatus.push({ ...asset, status: 'pending' });

      // 后台静默预热，不阻塞当前装载
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

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}