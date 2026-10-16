这是一个非常隐蔽但破坏力极强的典型底层缺陷：

从你的截图中可以清晰看到，工件背景直接被糊上了一大段 KaTeX / JS 库的源码文本，并且控制台报错：
`Uncaught SyntaxError: missing ) after argument list`。

我们已精确定位到根本原因：
1. **背景泄漏代码与语法损坏（核心元凶）**：
   在 `AssetCacheEngine.ts` 中，我们使用了 `modifiedHtml.replace(pattern, replacementString)`。在 JavaScript 规范中，**当 `replace` 第二个参数是字符串时，如果内容包含 `$` 符号（例如 `$1`、`$'`、`$&` 等），会被当成特殊模式替换展开**！
   现代 JS 库（KaTeX、Tone.js、jQuery 等）代码中充斥着大量的 `$` 符号和正则变量，导致脚本代码被错误解析展开并破坏了 `<script>` 闭合标签，使一部分未闭合的 JS 源码被浏览器直接当成普通 HTML 文本渲染在了页面背景上，并引发语法断裂报错。
2. **`cdn.tailwindcss.com` 控制台标红**：
   `cdn.tailwindcss.com` 不支持 CORS `fetch` 请求。即使代码里做了 `catch`，浏览器 DevTools 仍会在底层将失败的跨域网络请求标红。我们将对其建立跳过名单，让其自然走原生的 `<script src="...">` 加载。
3. **`favicon.ico 404`**：
   缺少网站图标，导致浏览器向本地 Vite 服务器请求 404。

下面是修复计划：

## [WIP] fix: 修复替换内联脚本时的美元符展开陷阱与非CORS预热报错

### 错误分析
1. **`String.prototype.replace` 中的 `$` 展开陷阱**：
   在 `AssetCacheEngine.ts` 中执行了 `modifiedHtml = modifiedHtml.replace(scriptTagPattern, `<script>...${textContent}...</script>`)`。被缓存的第三方库（如 KaTeX、Tone.js）内含有大量 `$` 特殊字符（例如 `t.replace(a, "-$1")`、`$()`），导致 `replace` 将脚本内容误认为正则替换指令（如 `$'` 代表替换匹配位置后面的文本），使得生成的 HTML 结构被破坏、标签无法闭合、源码溢出到 DOM 中成为背景文本，并导致 JS 脚本执行抛出 `Uncaught SyntaxError: missing ) after argument list`。
   **修复方案**：必须使用回调函数形式 `modifiedHtml.replace(pattern, () => ...)`，回调返回值中的 `$` 字符绝不会被二次展开。
2. **非 CORS CDN 的无效抓取**：
   `cdn.tailwindcss.com` 等服务明确不支持 CORS fetch。虽然不影响标签加载，但会触发控制台红色网络报错。
   **修复方案**：在 `AssetCacheEngine` 中建立黑名单过滤，对已知不支持 CORS 的域名主动跳过 fetch，直接保留原标签。
3. **Favicon 404**：
   提供内嵌 SVG 图标，消除浏览器默认请求报错。

### 用户需求
1. 消除工件画面上浮现的代码乱码，修复 JS 执行报错，确保工件所有脚本正常运行。
2. 消除 `cdn.tailwindcss.com` 的控制台网络报错以及 `favicon.ico 404`。

### 评论
字符串替换中的 `$` 展开是前端工程化（尤其是自制 Bundler 或预处理器）中极易被忽略的边界问题。采用函数式替换（Replacer Function）是唯一标准且安全的方式。

### 目标
1. **修改 `asset-cache.ts`**：
   - 替换逻辑全部改为函数回调式 `replace(pattern, () => replacement)`，彻底杜绝 `$` 符号展开破坏代码。
   - 增加对不支持 CORS fetch 域名的跳过检查（如 `cdn.tailwindcss.com`）。
2. **修改 `index.html`**：
   - 添加内联 SVG Favicon，消除 404 报错。

### 基本原理
- 在 MDN 规范中，`str.replace(regexp, newSubstr)` 会将 `newSubstr` 中的 `$1`, `$&`, `$'` 作为特殊模式替换，破坏包含此类字符的 JavaScript 源代码；而 `str.replace(regexp, replacerFunction)` 保证返回值以纯字符串原始输出，不受任何元字符影响。
- 探测 URL 时，若属于非 CORS 域名则不发起 `fetch`，保证浏览器网络面板纯净无红标。

### 标签
#intent/fix #flow/ready #priority/critical #comp/darkroom #concept/parser #concept/cache #scope/core #task/domain/storage #task/object/asset-cache #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 修复 AssetCacheEngine 的替换机制与 CORS 过滤

修改 `src/layer2_darkroom/engine/asset-cache.ts`：将 `replace` 改为回调函数传参，并针对非 CORS 域名安全跳过。

~~~~~act
write_file
src/layer2_darkroom/engine/asset-cache.ts
~~~~~
~~~~~typescript
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
~~~~~

#### Acts 2: 补充 Favicon 图标

在 `index.html` 中注入轻量 SVG favicon，消除控制台对 `favicon.ico` 的 404 报错。

~~~~~act
write_file
index.html
~~~~~
~~~~~html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📦</text></svg>" />
    <title>curio-box | 视觉工件画廊与镜像暗房</title>
  </head>
  <body data-theme="dark">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
~~~~~

### 下一步建议
1. 刷新页面重新打开该工件，确认背景上的代码字符已经完全消失，Canvas 与公式正常渲染无断裂。
2. 观察控制台，确认 CORS 标红与 `favicon.ico 404` 已彻底消除。
