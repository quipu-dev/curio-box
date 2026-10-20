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

const CACHE_NAME = 'curio_box_asset_cache_v2';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('转换 Base64 Data URI 失败'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 智能提炼外链资产的展示名称（自动剥离臃肿的 Query 参数，专项美化 Google Fonts）
 */
export function getAssetDisplayName(url: string): string {
  try {
    const parsed = new URL(url);

    // 针对 Google Fonts 专项优化提炼字体家族
    if (parsed.hostname.includes('fonts.googleapis.com')) {
      const families = parsed.searchParams.getAll('family');
      if (families.length > 0) {
        const familyNames = families.map((f) => f.split(':')[0].replace(/\+/g, ' ')).join(', ');
        return `Google Fonts: ${familyNames}`;
      }
      return 'Google Fonts 字体库';
    }

    const pathname = parsed.pathname;
    const filename = pathname.split('/').filter(Boolean).pop();

    if (filename?.includes('.')) {
      return filename;
    }

    // 无明确扩展名时，组合显示 Host + Path
    return `${parsed.hostname}${pathname}`;
  } catch {
    return url.split('/').pop() || url;
  }
}

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
   * 获取缓存的二进制 Blob
   */
  async getCachedBlob(url: string): Promise<Blob | null> {
    if (typeof window === 'undefined' || !('caches' in window)) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(url);
      if (response) {
        return await response.blob();
      }
      return null;
    } catch {
      return null;
    }
  },

  /**
   * 获取缓存的文本内容（保留向后兼容）
   */
  async getCachedText(url: string): Promise<string | null> {
    const blob = await this.getCachedBlob(url);
    if (!blob) return null;
    return await blob.text();
  },

  /**
   * 抓取并将外部资源保存至本地 Cache Storage
   * 优先级：优先直连 CORS fetch -> 失败则降级通过本地/边缘透明代理
   */
  async cacheAsset(url: string): Promise<boolean> {
    if (typeof window === 'undefined' || !('caches' in window)) return false;

    let response: Response | null = null;

    // 1. 优先尝试直接跨域抓取（适用于 cdnjs, unpkg, cdn.jsdelivr 等标准良性 CDN）
    try {
      response = await fetch(url, { mode: 'cors' });
      if (!response.ok) response = null;
    } catch {
      response = null;
    }

    // 2. 遇到 CORS 阻断（如 cdn.tailwindcss.com），降级至统一代理通道
    if (!response) {
      try {
        const proxyUrl = `/__curio_proxy__?url=${encodeURIComponent(url)}`;
        const proxyRes = await fetch(proxyUrl);
        if (proxyRes.ok) {
          response = proxyRes;
        }
      } catch {
        return false;
      }
    }

    if (!response) return false;

    try {
      const blob = await response.blob();
      const cache = await caches.open(CACHE_NAME);
      const headers = new Headers();

      // 基于 URL Pathname 与特征精准推导兜底 MIME，不受 Query 干扰
      let defaultMime = 'application/javascript';
      try {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith('.css') || parsed.pathname.includes('css')) {
          defaultMime = 'text/css';
        }
      } catch {}

      const remoteMime = response.headers.get('content-type');
      const resolvedMime = remoteMime ? remoteMime.split(';')[0].trim() : blob.type || defaultMime;

      headers.set('Content-Type', resolvedMime);
      await cache.put(url, new Response(blob, { status: 200, headers }));
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 解析 HTML：已缓存资源原位替换为无源 Base64 Data URI，免除跨域阻断与特殊字符展开破坏
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
        const blob = await this.getCachedBlob(asset.url);
        if (blob) {
          cachedCount++;
          assetsWithStatus.push({ ...asset, status: 'cached' });

          // 核心演进：无源 Data URI，沙箱 100% 接纳且字符集纯净 (A-Za-z0-9+/=)
          const base64DataUri = await blobToBase64(blob);

          if (asset.type === 'script') {
            const scriptTagPattern = new RegExp(
              `(<script\\s+[^>]*src=["'])${escapeRegExp(asset.url)}(["'][^>]*>\\s*<\\/script>)`,
              'gi',
            );
            modifiedHtml = modifiedHtml.replace(scriptTagPattern, `$1${base64DataUri}$2`);
          } else {
            const linkTagPattern = new RegExp(
              `(<link\\s+[^>]*href=["'])${escapeRegExp(asset.url)}(["'][^>]*\\/?>)`,
              'gi',
            );
            modifiedHtml = modifiedHtml.replace(linkTagPattern, `$1${base64DataUri}$2`);
          }
          continue;
        }
      }

      assetsWithStatus.push({ ...asset, status: 'pending' });

      // 后台静默预热入库
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
