这次报错由三个核心原因引发：

1. **`Not allowed to load local resource: blob:...` 与 `THREE is not defined`（致命因）**：
   沙箱 `iframe` 启用了 `sandbox="allow-scripts"`，其上下文拥有不透明的唯一 Origin（`origin: null`）。在此隔离沙箱中，浏览器基于跨源安全规范**严禁从宿主加载 `blob:http://localhost:5173/...` 脚本**。导致 Three.js 等脚本被浏览器直接拦截抛弃，最终引发未定义崩溃。
2. **`cdn.tailwindcss.com CORS net::ERR_FAILED`**：
   `cdn.tailwindcss.com` 未配置允许任意源的 CORS 头，使用 JavaScript 的 `fetch(url, { mode: 'cors' })` 会被同源策略拒绝；但原 HTML 的 `<script src="...">` 标签加载是不受 CORS 限制的。
3. **`Warning: Internal React error: Expected static flag was missing`**：
   `App.tsx` 常驻渲染两个返回 `null` 的全屏复杂组件，在 Fast Refresh / React 18 Fiber 挂载卸载时触发了虚拟 DOM 标志错位。

我们将通过**“内联置换 (Inline Injection) 替代 Blob URL”**并优化 CORS 降级策略与条件渲染彻底解决这些问题。

## [WIP] fix: 修复沙箱跨源 Blob 加载拦截与静态资源 CORS 失败问题

### 错误分析
1. **沙箱 Opaque Origin 与 Blob URL 冲突**：
   在启用 `sandbox="allow-scripts"` 的 IFrame 中，沙箱内部的 origin 为 `null`。当通过 `URL.createObjectURL(blob)` 替换外链为 `blob:http://localhost:5173/xxx` 后，沙箱加载宿主域的 Blob 资源会被 Chrome 安全机制判定为非法的跨源本地资源访问（`Not allowed to load local resource: blob:...`），导致 Three.js / p5.js 脚本全数加载失败，报 `THREE is not defined`。
2. **CORS Fetch 阻断与告警过载**：
   部分外部服务（如 `cdn.tailwindcss.com`）没有返回宽松的 `Access-Control-Allow-Origin` 响应头，`fetch()` 必然会触发 TypeError。原代码未对非 CORS 资源做静默降级，导致控制台充斥大量红色网络报错。
3. **React Fiber 静态标志异常**：
   `App.tsx` 中常驻挂载 `FullscreenStage` 和 `DarkroomStudio`，当传入 `artifact={null}` 时组件内部直接 `return null`。在 React 18 StrictMode 与 Vite 热重载协同下，触发了组件内部 hooks 与条件渲染的分支标记异常。

### 用户需求
修复控制台的所有报错，确保工件代码（尤其是包含 Three.js、Tailwind 等外链的工件）在暗房视口与全屏舞台中能够秒级顺畅运行。

### 评论
沙箱隔离（Security Sandbox）与资源本地化（Asset Vendoring）是工件系统的核心保障。通过直接将已缓存的脚本代码转换为原生 `<script>` 内联注入，既完全避开了浏览器的跨源拦截限制，又能达到 0 网络时延的究极秒开体验。

### 目标
1. **重构 `asset-cache.ts` 的置换策略**：已缓存的脚本与样式改用**内联标签（Inline `<script>` / `<style>`）**安全替换，彻底废弃引发跨源拦截的 `blob:http://...` 方案。
2. **优化 CORS 容错机制**：遇到不支持 CORS fetch 的 CDN 时，静默降级保留原远程外链，让浏览器通过原生 `<script src="...">` 标签无阻碍加载。
3. **修复 `App.tsx` 挂载模式**：改用 React 标准条件渲染 `{stageArtifact && <FullscreenStage ... />}`，消除 React 18 Fiber 异常告警。

### 基本原理
- **内联安全置换**：在 `sandbox="allow-scripts"` 沙箱中，内联 `<script>/* code */</script>` 是完全合法的且与沙箱自身的生命周期强绑定。从 Cache Storage 读取到脚本字符串后，将原本的 `<script src="...">` 替换为内联代码，不仅避开任何 Origin 限制，还能杜绝所有的 `blob:` 泄漏与跨域阻断。
- **优雅降级（Graceful Degradation）**：如果资源因 CORS 无法通过 fetch 抓取，引擎将不再重复抛出骚扰性日志，保留原始外链不变，由浏览器原生的跨域 script 标签机制完成网络加载。

### 标签
#intent/fix #flow/ready #priority/high #comp/sandbox #comp/darkroom #concept/cache #concept/parser #scope/core #task/domain/storage #task/object/asset-cache #task/action/bug-fix #task/state/begin

---

### Script

#### Acts 1: 重构资产缓存引擎的注入与降级逻辑

使用内联置换方案，并对不支持 CORS 的外部 CDN 提供静默降级保护。

~~~~~act
write_file
src/layer2_darkroom/engine/asset-cache.ts
~~~~~
~~~~~typescript
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
~~~~~

#### Acts 2: 修复应用层组件的条件渲染

修改 `App.tsx`，使用标准条件渲染避免传递 `null` 导致的 React 18 Fiber 树 static flag 告警。

~~~~~act
write_file
src/App.tsx
~~~~~
~~~~~typescript
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import { ArtifactCard } from '@/layer3_gallery/components/ArtifactCard';
import { DarkroomStudio } from '@/layer3_gallery/components/DarkroomStudio';
import { FullscreenStage } from '@/layer3_gallery/components/FullscreenStage';
import { Header } from '@/layer3_gallery/components/Header';
import type { Artifact } from '@/types';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface WindowWithFSA extends Window {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export function App() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 网页全屏放映中的工件
  const [stageArtifact, setStageArtifact] = useState<Artifact | null>(null);
  // 独立暗房工作台中的工件
  const [studioArtifact, setStudioArtifact] = useState<Artifact | null>(null);
  const [hasDirectory, setHasDirectory] = useState<boolean>(false);
  const [pendingHandle, setPendingHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  const loadArtifacts = useCallback(async () => {
    const list = await galleryStorage.scanArtifacts();
    setArtifacts(list);
  }, []);

  // 页面启动时自动尝试恢复已持久化的文件夹
  useEffect(() => {
    let isCancelled = false;
    async function restoreDirectory() {
      const result = await galleryStorage.restoreSavedHandle();
      if (isCancelled) return;

      if (result.permission === 'granted' && result.handle) {
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifacts();
      } else if (result.handle) {
        setPendingHandle(result.handle);
        await loadArtifacts();
      } else {
        await loadArtifacts();
      }
    }

    restoreDirectory();
    return () => {
      isCancelled = true;
    };
  }, [loadArtifacts]);

  // 恢复待授权目录的用户手势处理
  const handleRequestPendingPermission = async () => {
    if (!pendingHandle) return;
    try {
      const perm = await (
        pendingHandle as unknown as {
          requestPermission: (opt: { mode: string }) => Promise<PermissionState>;
        }
      ).requestPermission({ mode: 'readwrite' });

      if (perm === 'granted') {
        galleryStorage.setDirectoryHandle(pendingHandle);
        setHasDirectory(true);
        setPendingHandle(null);
        await loadArtifacts();
      }
    } catch (err) {
      console.error('授权目录失败:', err);
    }
  };

  const handlePickDirectory = async () => {
    try {
      const fsaWindow = window as unknown as WindowWithFSA;
      if (typeof fsaWindow.showDirectoryPicker === 'function') {
        const handle = await fsaWindow.showDirectoryPicker();
        galleryStorage.setDirectoryHandle(handle);
        setHasDirectory(true);
        await loadArtifacts();
      } else {
        alert('当前浏览器环境不支持 File System Access API，请使用 Chrome/Edge 等现代浏览器。');
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        console.error('选择目录失败:', err);
      }
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleUpdateArtifact = (updated: Artifact) => {
    setArtifacts((prev) =>
      prev.map((item) => (item.meta.filename === updated.meta.filename ? updated : item)),
    );
    if (stageArtifact?.meta.filename === updated.meta.filename) {
      setStageArtifact(updated);
    }
    if (studioArtifact?.meta.filename === updated.meta.filename) {
      setStudioArtifact(updated);
    }
  };

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((item) => TagQueryEngine.match(item.meta.tags, searchQuery));
  }, [artifacts, searchQuery]);

  return (
    <div className="min-h-screen flex flex-col bg-background text-main">
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPickDirectory={handlePickDirectory}
        hasDirectory={hasDirectory}
        pendingDirectoryName={pendingHandle?.name}
        onRequestPendingPermission={handleRequestPendingPermission}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main className="flex-1 p-6 md:p-8">
        <div className="mb-6 flex justify-between items-center text-xs font-mono text-muted">
          <div>
            陈列展品总数：
            <span className="text-main font-semibold">{filteredArtifacts.length}</span> /{' '}
            {artifacts.length}
          </div>
          {!hasDirectory && <div>（当前处于内置演示库模式，可点击右上角载入本地工件目录）</div>}
        </div>

        {filteredArtifacts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArtifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.meta.filename}
                artifact={artifact}
                onOpenStage={(art) => setStageArtifact(art)}
                onOpenStudio={(art) => setStudioArtifact(art)}
              />
            ))}
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center text-muted font-mono text-sm gap-2 border border-dashed border-border rounded">
            <span>未匹配到符合检索条件的工件</span>
            <span className="text-xs opacity-60">尝试修改大众分类筛选词或清除过滤条件</span>
          </div>
        )}
      </main>

      {/* 活体全屏放映舞台 (显式条件挂载) */}
      {stageArtifact && (
        <FullscreenStage
          artifact={stageArtifact}
          onClose={() => setStageArtifact(null)}
          onOpenDarkroom={(art) => {
            setStageArtifact(null);
            setStudioArtifact(art);
          }}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}

      {/* 独立全屏暗房工作台 (显式条件挂载) */}
      {studioArtifact && (
        <DarkroomStudio
          artifact={studioArtifact}
          onBackToGallery={() => setStudioArtifact(null)}
          onOpenStage={(art) => {
            setStudioArtifact(null);
            setStageArtifact(art);
          }}
          onUpdateArtifact={handleUpdateArtifact}
        />
      )}
    </div>
  );
}

export default App;
~~~~~

### 下一步建议
1. 刷新浏览器查看控制台，确认 `Not allowed to load local resource` 与 `THREE is not defined` 已经彻底消除，工件正常完成渲染。
2. 在暗房工作台的“标本与缓存”选项卡中，测试带有外链库的工件，验证内联加速机制与离线秒开体验。
