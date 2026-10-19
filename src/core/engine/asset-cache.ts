export interface ExternalAsset {
  url: string;
  type: 'script' | 'style';
  status: 'cached' | 'fetching' | 'pending' | 'failed' | 'skipped';
}

export interface AssetCacheStats {
  total: number;
  cached: number;
  assets: ExternalAsset[];
}

const CACHE_NAME = 'curio_box_asset_cache_v1';

// 已知不支持或不适宜 CORS fetch 的动态运行时 CDN 域名（这些通过原生 script 标签加载完全正常）
const NON_CORS_DOMAINS = ['cdn.tailwindcss.com'];

export const AssetCacheEngine = {
  /**
   * 嗅探 HTML 中所有外链 CDN 的 script 与 link[rel="stylesheet"]
   */
  detectExternalAssets(html: string): ExternalAsset[] {
    const assets: ExternalAsset[] = [];
    const scriptRegex = /<script\s+[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
    const styleRegex = /<link\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;

    for (const match of html.matchAll(scriptRegex)) {
      if (match[1]) {
        assets.push({ url: match[1], type: 'script', status: 'pending' });
      }
    }

    for (const match of html.matchAll(styleRegex)) {
      const fullTag = match[0].toLowerCase();
      if (fullTag.includes('stylesheet') && match[1]) {
        assets.push({ url: match[1], type: 'style', status: 'pending' });
      }
    }

    return assets;
  },

  /**
   * 判断一个 URL 是否适合通过 CORS fetch 抓取缓存
   */
  canCorsFetch(url: string): boolean {
    try {
      const parsed = new URL(url);
      return !NON_CORS_DOMAINS.some((domain) => parsed.hostname.includes(domain));
    } catch {
      return false;
    }
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
   * 抓取并将外部资源保存至本地 Cache Storage
   */
  async cacheAsset(url: string): Promise<boolean> {
    if (!this.canCorsFetch(url)) return false;
    if (typeof window === 'undefined' || !('caches' in window)) return false;

    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(url, { mode: 'cors' });
      if (response.ok) {
        await cache.put(url, response.clone());
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  /**
   * 解析 HTML：已缓存资源以内联回调函数安全注入（防 $ 符号展开陷阱）
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
      const isEligible = this.canCorsFetch(asset.url);
      if (!isEligible) {
        // 不支持 CORS 的动态外链，跳过 fetch，保持原生标签
        assetsWithStatus.push({ ...asset, status: 'skipped' });
        continue;
      }

      const alreadyCached = await this.isCached(asset.url);
      if (alreadyCached) {
        const textContent = await this.getCachedText(asset.url);
        if (textContent) {
          cachedCount++;
          assetsWithStatus.push({ ...asset, status: 'cached' });

          if (asset.type === 'script') {
            // 注意：必须使用回调函数 () => replacement，防止代码中的 $ 符号被当成特殊替换模式展开
            const scriptTagPattern = new RegExp(
              `<script\\s+[^>]*src=["']${escapeRegExp(asset.url)}["'][^>]*>\\s*<\\/script>`,
              'gi',
            );
            modifiedHtml = modifiedHtml.replace(
              scriptTagPattern,
              () =>
                `<script data-curio-cached="true">/* [Curio Box 本地离线加速] */\n${textContent}\n</script>`,
            );
          } else {
            const linkTagPattern = new RegExp(
              `<link\\s+[^>]*href=["']${escapeRegExp(asset.url)}["'][^>]*\\/?>`,
              'gi',
            );
            modifiedHtml = modifiedHtml.replace(
              linkTagPattern,
              () =>
                `<style data-curio-cached="true">/* [Curio Box 本地离线加速] */\n${textContent}\n</style>`,
            );
          }
          continue;
        }
      }

      assetsWithStatus.push({ ...asset, status: 'pending' });

      // 后台静默预热
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
