我们即刻开始实施：将暗房重构为全屏独立的 Studio 工作台界面，在沙箱视口中集成优雅的微光加载 HUD 状态感知，并构建客户端 CDN 静态资源的 Cache 离线保鲜引擎。

## [WIP] feat: 重构独立暗房工作台并实现视口加载动画与静态资源缓存引擎

### 用户需求
1. 将当前局促的 `DarkroomModal` 模态弹窗改造为全尺寸独立的“暗房工作台 (Darkroom Studio)”界面，提供宽敞的母带级放映视口与可自由折叠/分屏的控制台。
2. 为沙箱视口增加平滑优雅的加载动画 HUD，感知工件冷启动与外部 CDN 载入过程。
3. 探索并落地外链 CDN 静态资源的客户端持久化缓存机制，让依赖外部脚本（Three.js/p5.js 等）的工件具备本地秒开与离线能力。

### 评论
当前 Curio Box 将工件视为活体数字标本，但外链 CDN 在网络波动或失效时会导致标本“坏死”。引入独立的 `AssetCacheEngine` 可以通过浏览器 Cache API 在运行时拦截重写依赖，实现标本的离线封存保鲜；而将暗房升级为全屏 Studio 并配合微光加载 HUD，极大提升了创作修改时的沉浸感与工程可用性。

### 目标
1. **新建 `asset-cache.ts`**：实现基于 Cache API 的外链脚本/样式嗅探、后台预热与本地 Blob 置换引擎。
2. **升级 `SandboxViewport.tsx`**：在 Harness 中加入首帧就绪探针通信，并渲染极简工业微光加载状态动效。
3. **构建 `DarkroomStudio.tsx`**：取代旧弹窗，提供全屏独立分屏工作台，包含视口放映、差量 FSM 注入、底片版本回滚与 CDN 资源离线化监控三大控制面板。
4. **升级 `ArtifactCard.tsx` 与 `App.tsx`**：建立“展厅画廊 (Gallery)”、“全屏放映 (Stage)”与“暗房工作台 (Studio)”的三态顶层工作流切换。

### 基本原理
- **资源缓存与运行时重写**：利用正则嗅探工件 HTML 中所有的 `<script src="...">` 与 `<link href="...">`，在后台通过 Cache Storage（`curio_box_asset_cache_v1`）进行非阻塞预缓存。在沙箱挂载前，已缓存的远程 URL 将被动态置换为浏览器内存中的 `Blob URL`，无需侵入篡改工件原本的 HTML 存储文件，且完美规避 CDN 超时或断网问题。
- **微光加载探针**：在沙箱内部注入的 Harness 探针中挂载 `DOMContentLoaded` 与 `requestAnimationFrame` 首次执行监听，通过 `postMessage` 向外层发送 `CURIO_STAGE_READY`，使外层视口精准在首帧呈现的瞬间淡出加载微光层。
- **全屏 Studio 布局**：采用 Flex/Grid 自适应双栏工作台，视口具备 16:9/自由比例切换及一键折叠控制台的能力，彻底释放屏幕空间。

### 标签
#intent/build #flow/ready #priority/high #comp/gallery #comp/sandbox #comp/darkroom #concept/ui #concept/cache #scope/ux #task/domain/ui #task/object/darkroom-studio #task/action/implementation #task/state/begin

---

### Script

#### Acts 1: 新建静态资源离线缓存引擎

实现工件外部 CDN 静态资源（JavaScript、CSS）的嗅探、下载缓存与动态 HTML 重写机制。

~~~~~act
write_file
src/layer2_darkroom/engine/asset-cache.ts
~~~~~
~~~~~typescript
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
~~~~~

#### Acts 2: 升级视口组件，增加加载状态 HUD 与就绪握手

修改 `SandboxViewport.tsx`，在注入脚本中挂载就绪探测通信，并增设平滑的微光加载动画。

~~~~~act
write_file
src/layer1_sandbox/SandboxViewport.tsx
~~~~~
~~~~~typescript
import { AssetCacheEngine } from '@/layer2_darkroom/engine/asset-cache';
import { Loader2, Sparkles } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface SandboxViewportProps {
  htmlPayload: string;
  isActivated: boolean;
  onCaptureReady?: (captureHandle: () => Promise<Blob>) => void;
  aspectRatio?: 'fill' | '16/9' | '4/3' | '1/1';
}

const CAPTURE_HARNESS_SCRIPT = `
<script id="__curio_harness__">
(function() {
  // WebGL 截屏图元保全
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attribs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attribs);
  };

  // 通知父级：沙箱内部已准备就绪并完成第一帧绘制尝试
  function notifyReady() {
    window.parent.postMessage({ type: 'CURIO_STAGE_READY' }, '*');
  }

  if (document.readyState === 'complete') {
    requestAnimationFrame(notifyReady);
  } else {
    window.addEventListener('load', function() {
      requestAnimationFrame(notifyReady);
    });
  }

  // 截屏通信
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.type !== 'CURIO_CAPTURE_REQUEST') return;
    const reqId = ev.data.requestId;
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        window.parent.postMessage({
          type: 'CURIO_CAPTURE_RESPONSE',
          requestId: reqId,
          error: '工件视口内未探测到 Canvas 画布'
        }, '*');
        return;
      }
      const dataUrl = canvas.toDataURL('image/webp', 0.92);
      window.parent.postMessage({
        type: 'CURIO_CAPTURE_RESPONSE',
        requestId: reqId,
        dataUrl: dataUrl
      }, '*');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '画布定格失败';
      window.parent.postMessage({
        type: 'CURIO_CAPTURE_RESPONSE',
        requestId: reqId,
        error: errorMsg
      }, '*');
    }
  });
})();
</script>
`;

export const SandboxViewport: React.FC<SandboxViewportProps> = ({
  htmlPayload,
  isActivated,
  onCaptureReady,
  aspectRatio = 'fill',
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingTip, setLoadingTip] = useState<string>('正在解析并预热工件环境...');

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    if (!isActivated) {
      iframe.src = 'about:blank';
      setIsLoading(false);
      return;
    }

    let isSubscribed = true;
    setIsLoading(true);
    setLoadingTip('正在探测外部 CDN 资源并加载缓存...');

    // 使用 AssetCacheEngine 处理并置换已缓存的 CDN 外链
    AssetCacheEngine.resolveAndWarmupHtml(htmlPayload, (stats) => {
      if (stats.total > 0) {
        setLoadingTip(`资源加速已就绪 (${stats.cached}/${stats.total})，正在挂载沙箱...`);
      }
    }).then(({ resolvedHtml }) => {
      if (!isSubscribed) return;

      let finalHtml = resolvedHtml;
      if (finalHtml.includes('<head>')) {
        finalHtml = finalHtml.replace('<head>', `<head>${CAPTURE_HARNESS_SCRIPT}`);
      } else {
        finalHtml = CAPTURE_HARNESS_SCRIPT + finalHtml;
      }

      const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      iframe.src = url;

      // 兜底超时：若工件无 canvas 或未发出就绪通知，3.5s 后强制淡出加载层
      const fallbackTimer = setTimeout(() => {
        if (isSubscribed) setIsLoading(false);
      }, 3500);

      const handleReadyMessage = (ev: MessageEvent) => {
        if (ev.data?.type === 'CURIO_STAGE_READY') {
          clearTimeout(fallbackTimer);
          if (isSubscribed) setIsLoading(false);
        }
      };

      window.addEventListener('message', handleReadyMessage);

      return () => {
        isSubscribed = false;
        clearTimeout(fallbackTimer);
        window.removeEventListener('message', handleReadyMessage);
        URL.revokeObjectURL(url);
        iframe.src = 'about:blank';
      };
    });
  }, [htmlPayload, isActivated]);

  useEffect(() => {
    if (!onCaptureReady) return;

    onCaptureReady(async () => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        throw new Error('沙箱未激活，无法定格封印快照');
      }

      const contentWindow = iframe.contentWindow;
      const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;

      return new Promise<Blob>((resolve, reject) => {
        const timeoutTimer = setTimeout(() => {
          window.removeEventListener('message', handleResponse);
          reject(new Error('定格捕获超时：沙箱内未在规定时间内响应'));
        }, 4000);

        const handleResponse = async (event: MessageEvent) => {
          if (
            !event.data ||
            event.data.type !== 'CURIO_CAPTURE_RESPONSE' ||
            event.data.requestId !== requestId
          ) {
            return;
          }

          clearTimeout(timeoutTimer);
          window.removeEventListener('message', handleResponse);

          if (event.data.error) {
            reject(new Error(event.data.error));
            return;
          }

          try {
            const dataUrl = event.data.dataUrl;
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            resolve(blob);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            reject(new Error(`快照数据流转换失败: ${msg}`));
          }
        };

        window.addEventListener('message', handleResponse);

        contentWindow.postMessage(
          {
            type: 'CURIO_CAPTURE_REQUEST',
            requestId: requestId,
          },
          '*',
        );
      });
    });
  }, [onCaptureReady]);

  const aspectClass =
    aspectRatio === '16/9'
      ? 'aspect-[16/9] w-full max-h-full'
      : aspectRatio === '4/3'
        ? 'aspect-[4/3] w-full max-h-full'
        : aspectRatio === '1/1'
          ? 'aspect-square h-full max-w-full'
          : 'w-full h-full';

  return (
    <div className="relative w-full h-full bg-black/95 overflow-hidden rounded border border-border flex items-center justify-center">
      {isActivated ? (
        <div className={`relative flex items-center justify-center ${aspectClass}`}>
          <iframe
            ref={iframeRef}
            title="工件独立沙箱视口"
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-transparent"
          />

          {/* 微光加载 HUD 遮罩动画 */}
          {isLoading && (
            <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 transition-opacity duration-500 z-20 pointer-events-none select-none">
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
                <Sparkles className="w-4 h-4 text-sky-200 absolute animate-pulse" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="text-xs font-mono text-zinc-200 font-medium tracking-wide">
                  正在唤醒活体标本视口
                </div>
                <div className="text-[11px] font-mono text-zinc-500">{loadingTip}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted text-xs font-mono select-none flex flex-col items-center gap-2">
          <span>[ 工件处于静默陈列态 ]</span>
          <span className="text-[11px] opacity-70">点击上方“活体展演”以激活动态沙箱</span>
        </div>
      )}
    </div>
  );
};
~~~~~

#### Acts 3: 构建全新的独立暗房工作台组件

新建 `src/layer3_gallery/components/DarkroomStudio.tsx`，提供拥有大视口放映、差量 FSM 补丁注入、底片回溯链及外链 CDN 离线化状态管理的全屏 Studio。

~~~~~act
write_file
src/layer3_gallery/components/DarkroomStudio.tsx
~~~~~
~~~~~typescript
import { SandboxViewport } from '@/layer1_sandbox/SandboxViewport';
import {
  AssetCacheEngine,
  type AssetCacheStats,
} from '@/layer2_darkroom/engine/asset-cache';
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import { DarkroomApplier, DarkroomPatchFSM } from '@/layer2_darkroom/fsm/patch-fsm';
import { galleryStorage } from '@/layer2_darkroom/storage/fs-storage';
import type { Artifact } from '@/types';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Database,
  History,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Tag as TagIcon,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface DarkroomStudioProps {
  artifact: Artifact | null;
  onBackToGallery: () => void;
  onOpenStage: (artifact: Artifact) => void;
  onUpdateArtifact: (updated: Artifact) => void;
}

type TabType = 'patch' | 'history' | 'assets';

export const DarkroomStudio: React.FC<DarkroomStudioProps> = ({
  artifact,
  onBackToGallery,
  onOpenStage,
  onUpdateArtifact,
}) => {
  if (!artifact) return null;

  const [isActivated, setIsActivated] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<TabType>('patch');
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(true);
  const [aspectRatio, setAspectRatio] = useState<'fill' | '16/9' | '4/3'>('fill');
  const [patchInput, setPatchInput] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [assetStats, setAssetStats] = useState<AssetCacheStats | null>(null);

  const captureHandleRef = useRef<(() => Promise<Blob>) | null>(null);

  // 挂载时自动探查工件中的外部 CDN 资源
  useEffect(() => {
    const assets = AssetCacheEngine.detectExternalAssets(artifact.sourceCode);
    Promise.all(assets.map((a) => AssetCacheEngine.isCached(a.url))).then((results) => {
      const cachedCount = results.filter(Boolean).length;
      setAssetStats({
        total: assets.length,
        cached: cachedCount,
        assets: assets.map((a, i) => ({
          ...a,
          status: results[i] ? 'cached' : 'pending',
        })),
      });
    });
  }, [artifact.sourceCode]);

  // 截屏定格快照
  const handleCapturePoster = async () => {
    if (!captureHandleRef.current) {
      setStatusMessage('请等待沙箱装载完毕后再进行定格');
      return;
    }
    try {
      setStatusMessage('正在定格无损封印快照...');
      const blob = await captureHandleRef.current();
      const newUrl = await galleryStorage.savePoster(artifact.meta.filename, blob);
      const updated: Artifact = {
        ...artifact,
        posterBlobUrl: newUrl,
      };
      onUpdateArtifact(updated);
      setStatusMessage('定格封印成功！封面已同步更新。');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`定格失败: ${msg}`);
    }
  };

  // 复制带格式的完整提示词上下文
  const handleCopyPromptContext = () => {
    const prompt = `请针对以下工件代码提供修改差量。请严格遵循 patch_file 指令协议输出，示例如下：

\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被替换的精确原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\`

当前工件【${artifact.meta.name}】源码：
\`\`\`html
${artifact.sourceCode}
\`\`\``;

    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 应用 FSM 差量补丁
  const handleApplyPatch = async () => {
    if (!patchInput.trim()) {
      setStatusMessage('请粘贴包含 act、old_doc、new_doc 的补丁文本');
      return;
    }

    try {
      const fsm = new DarkroomPatchFSM();
      const commands = fsm.parse(patchInput);

      if (commands.length === 0) {
        throw new Error('未能识别到有效的补丁指令块，请检查围栏语法');
      }

      let nextCode = artifact.sourceCode;
      for (const cmd of commands) {
        nextCode = DarkroomApplier.apply(nextCode, cmd);
      }

      const nextRev = artifact.meta.currentRevision + 1;
      await galleryStorage.saveArtifactSource(artifact.meta.filename, nextCode, nextRev);

      const updatedMeta = {
        ...artifact.meta,
        currentRevision: nextRev,
        updatedAt: new Date().toISOString(),
      };
      await galleryStorage.saveMeta(updatedMeta);

      const updated: Artifact = {
        ...artifact,
        sourceCode: nextCode,
        meta: updatedMeta,
      };

      onUpdateArtifact(updated);
      setPatchInput('');
      setStatusMessage(`差量补丁已应用！底片链跃迁至 REV:${nextRev}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`应用失败: ${msg}`);
    }
  };

  // 一阶回滚底片
  const handleRollback = async () => {
    if (artifact.meta.currentRevision <= 1) {
      setStatusMessage('当前已处于初始底片版本，无法继续回滚');
      return;
    }

    const prevRev = artifact.meta.currentRevision - 1;
    const prevContent = await galleryStorage.loadNegativeRevision(artifact.meta.filename, prevRev);

    if (!prevContent) {
      setStatusMessage(`未找到 REV:${prevRev} 的历史底片快照`);
      return;
    }

    await galleryStorage.saveArtifactSource(artifact.meta.filename, prevContent, prevRev);
    const updatedMeta = {
      ...artifact.meta,
      currentRevision: prevRev,
      updatedAt: new Date().toISOString(),
    };
    await galleryStorage.saveMeta(updatedMeta);

    const updated: Artifact = {
      ...artifact,
      sourceCode: prevContent,
      meta: updatedMeta,
    };

    onUpdateArtifact(updated);
    setStatusMessage(`一阶回滚成功：已安全复原至 REV:${prevRev}`);
  };

  // 手动一键预缓存外链资产
  const handleCacheAllAssets = async () => {
    if (!assetStats || assetStats.total === 0) return;
    setStatusMessage('正在离线化下载所有外部 CDN 资源...');
    for (const asset of assetStats.assets) {
      await AssetCacheEngine.cacheAsset(asset.url);
    }
    const freshAssets = AssetCacheEngine.detectExternalAssets(artifact.sourceCode);
    const results = await Promise.all(freshAssets.map((a) => AssetCacheEngine.isCached(a.url)));
    setAssetStats({
      total: freshAssets.length,
      cached: results.filter(Boolean).length,
      assets: freshAssets.map((a, i) => ({
        ...a,
        status: results[i] ? 'cached' : 'failed',
      })),
    });
    setStatusMessage('外链静态资源已全部注入本地持久缓存！');
  };

  return (
    <div className="fixed inset-0 z-40 bg-background text-main flex flex-col overflow-hidden select-none">
      {/* 顶部专业控制栏 (Studio Header) */}
      <header className="h-13 bg-surface border-b border-border px-4 flex justify-between items-center gap-4 text-xs font-mono shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToGallery}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-border rounded hover:bg-background transition-colors text-muted hover:text-main"
            title="返回展厅画廊"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>展厅</span>
          </button>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="font-bold text-sm font-sans truncate max-w-xs md:max-w-md">
              {artifact.meta.name}
            </span>
            <span className="bg-tag px-2 py-0.5 rounded text-[11px] font-semibold text-main border border-border">
              REV:{artifact.meta.currentRevision}
            </span>
          </div>
        </div>

        {/* 视口参数与动作控制 */}
        <div className="flex items-center gap-2.5">
          {/* CDN 离线化状态指示 */}
          {assetStats && assetStats.total > 0 && (
            <div
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded border text-[11px] ${
                assetStats.cached === assetStats.total
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
              }`}
            >
              <Database className="w-3 h-3" />
              <span>
                CDN 缓存: {assetStats.cached}/{assetStats.total}
              </span>
            </div>
          )}

          {/* 画幅比切换 */}
          <div className="hidden md:flex items-center border border-border rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setAspectRatio('fill')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === 'fill' ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              自由铺满
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('16/9')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === '16/9' ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              16:9
            </button>
            <button
              type="button"
              onClick={() => setAspectRatio('4/3')}
              className={`px-2 py-1 text-[11px] ${
                aspectRatio === '4/3' ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800/40 text-muted'
              }`}
            >
              4:3
            </button>
          </div>

          {/* 激活/湮灭 */}
          <button
            type="button"
            onClick={() => setIsActivated(!isActivated)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors text-xs font-mono ${
              isActivated
                ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            {isActivated ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{isActivated ? '湮灭' : '活体激活'}</span>
          </button>

          {/* 定格快照 */}
          <button
            type="button"
            onClick={handleCapturePoster}
            disabled={!isActivated}
            className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border disabled:opacity-40"
            title="捕获当前帧为静态封面快照"
          >
            <Camera className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:inline">定格封印</span>
          </button>

          {/* 进入沉浸舞台 */}
          <button
            type="button"
            onClick={() => onOpenStage(artifact)}
            className="flex items-center gap-1 border border-border px-2.5 py-1 rounded hover:bg-border"
            title="切换至全屏放映舞台"
          >
            <Maximize2 className="w-3.5 h-3.5 text-muted" />
            <span className="hidden sm:inline">放映舞台</span>
          </button>

          {/* 折叠控制台 */}
          <button
            type="button"
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className="p-1.5 border border-border rounded hover:bg-border text-muted hover:text-main"
            title={isConsoleOpen ? '收起暗房操作台 (大视口优先)' : '展开暗房操作台'}
          >
            {isConsoleOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </header>

      {/* 主体操作区：左侧超大视口 + 右侧可折叠暗房台 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧大画幅沙箱视口 */}
        <div className="flex-1 bg-black p-3 md:p-6 flex items-center justify-center overflow-hidden">
          <SandboxViewport
            htmlPayload={artifact.sourceCode}
            isActivated={isActivated}
            aspectRatio={aspectRatio}
            onCaptureReady={(cb) => {
              captureHandleRef.current = cb;
            }}
          />
        </div>

        {/* 右侧暗房控制台 (Darkroom Console) */}
        {isConsoleOpen && (
          <aside className="w-full md:w-[460px] lg:w-[500px] bg-surface border-l border-border flex flex-col shrink-0 overflow-hidden shadow-2xl">
            {/* 控制台导航 Tabs */}
            <div className="h-10 bg-background border-b border-border flex text-xs font-mono">
              <button
                type="button"
                onClick={() => setActiveTab('patch')}
                className={`flex-1 flex items-center justify-center gap-1.5 border-r border-border transition-colors ${
                  activeTab === 'patch'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Code2 className="w-3.5 h-3.5 text-sky-400" />
                <span>AI 差量注入</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 flex items-center justify-center gap-1.5 border-r border-border transition-colors ${
                  activeTab === 'history'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <History className="w-3.5 h-3.5 text-amber-400" />
                <span>底片链历史</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('assets')}
                className={`flex-1 flex items-center justify-center gap-1.5 transition-colors ${
                  activeTab === 'assets'
                    ? 'bg-surface font-semibold text-main'
                    : 'text-muted hover:text-main'
                }`}
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                <span>标本与缓存</span>
              </button>
            </div>

            {/* 控制台主体面板 */}
            <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4 text-xs font-mono">
              {activeTab === 'patch' && (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-muted tracking-wider">
                      提示词协同与 Patch FSM
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyPromptContext}
                      className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copied ? '已复制源码上下文！' : '复制大模型提示词上下文'}</span>
                    </button>
                  </div>

                  <textarea
                    value={patchInput}
                    onChange={(e) => setPatchInput(e.target.value)}
                    placeholder={`粘贴大模型生成的差量代码块：
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
<需要被精准替换的原代码行>
\`\`\`
\`\`\`new_doc
<替换后的新代码行>
\`\`\``}
                    className="flex-1 min-h-[300px] w-full bg-code text-zinc-300 border border-border p-3.5 font-mono text-[11px] rounded outline-none resize-none leading-relaxed"
                  />

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleApplyPatch}
                      className="w-full bg-main text-surface font-semibold py-2.5 rounded text-xs hover:opacity-90 transition-opacity"
                    >
                      应用差量补丁并推入底片链 (REV:{artifact.meta.currentRevision + 1})
                    </button>

                    <button
                      type="button"
                      onClick={handleRollback}
                      className="w-full border border-red-500/40 text-red-400 py-1.5 rounded text-xs hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>
                        一阶安全回滚至上一底片 (REV:{Math.max(1, artifact.meta.currentRevision - 1)}
                        )
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-background border border-border p-3 rounded">
                    <div className="text-[10px] uppercase text-muted tracking-wider mb-1">
                      当前底片锚点
                    </div>
                    <div className="text-sm font-bold text-main">
                      REV:{artifact.meta.currentRevision}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      最后更新：{new Date(artifact.meta.updatedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-muted text-[11px] leading-relaxed">
                    暗房底片链（Negative Chain）会在每次应用差量补丁时将完整快照持久化保存在目录下的{' '}
                    <code className="text-sky-400 font-mono">
                      .gallery/negatives/{artifact.meta.filename.replace('.html', '')}/
                    </code>{' '}
                    中，支持无限级无损回滚。
                  </div>

                  <button
                    type="button"
                    onClick={handleRollback}
                    className="w-full border border-red-500/40 text-red-400 py-2 rounded text-xs hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1 mt-2"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>
                      回滚至 REV:{Math.max(1, artifact.meta.currentRevision - 1)} 快照底片
                    </span>
                  </button>
                </div>
              )}

              {activeTab === 'assets' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-background border border-border p-3 rounded">
                    <div className="text-[10px] uppercase text-muted tracking-wider mb-2">
                      工件标本分类与标签
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {artifact.meta.tags.map((rawTag) => {
                        const parsed = TagQueryEngine.parseTag(rawTag);
                        return (
                          <span
                            key={rawTag}
                            className="inline-flex items-center bg-tag border border-border px-2 py-0.5 text-[11px] rounded"
                          >
                            <TagIcon className="w-2.5 h-2.5 text-muted mr-1" />
                            {parsed.namespace && (
                              <span className="text-muted">{parsed.namespace}:</span>
                            )}
                            <span className="font-medium text-main">{parsed.value}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* 外部静态资源 CDN 缓存池详情 */}
                  <div className="bg-background border border-border p-3 rounded flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase text-muted tracking-wider">
                        外部 CDN 依赖与本地保鲜池
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
                      <div className="text-muted text-[11px]">未探测到外部 CDN 依赖（纯原生工件）</div>
                    )}

                    {assetStats && assetStats.cached < assetStats.total && (
                      <button
                        type="button"
                        onClick={handleCacheAllAssets}
                        className="w-full mt-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 py-1.5 rounded text-xs hover:bg-sky-500/30 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>一键全量持久化至本地 Cache</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 底部状态提示条 */}
              {statusMessage && (
                <div className="p-2.5 bg-background border border-border rounded text-[11px] text-muted flex items-start gap-1.5 animate-in fade-in">
                  <History className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
                  <span className="text-main">{statusMessage}</span>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
~~~~~

#### Acts 4: 改造展品卡片与主应用视图状态流转

修改 `ArtifactCard.tsx`，在卡片上提供直达暗房工作台和放映舞台的双重入口；修改 `App.tsx`，将旧的 modal 弹窗替换为 gallery、stage、studio 三维流转。

~~~~~act
write_file
src/layer3_gallery/components/ArtifactCard.tsx
~~~~~
~~~~~typescript
import { TagQueryEngine } from '@/layer2_darkroom/engine/tag-engine';
import type { Artifact } from '@/types';
import { Code2, Play } from 'lucide-react';
import type React from 'react';

interface ArtifactCardProps {
  artifact: Artifact;
  onOpenStage: (artifact: Artifact) => void;
  onOpenStudio: (artifact: Artifact) => void;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  onOpenStage,
  onOpenStudio,
}) => {
  return (
    <div className="text-left w-full bg-surface border border-border rounded overflow-hidden flex flex-col group hover:border-muted hover:-translate-y-0.5 transition-all">
      {/* 封面画幅区 */}
      <button
        type="button"
        onClick={() => onOpenStage(artifact)}
        className="w-full aspect-[4/3] bg-background border-b border-border relative overflow-hidden flex items-center justify-center cursor-pointer outline-none"
        title="点击进入全屏活体放映舞台"
      >
        <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur border border-border px-1.5 py-0.5 text-[10px] font-mono text-muted z-10 rounded">
          REV:{artifact.meta.currentRevision}
        </div>

        {artifact.posterBlobUrl ? (
          <img
            src={artifact.posterBlobUrl}
            alt={artifact.meta.name}
            className="w-full h-full object-cover filter grayscale-[15%] group-hover:grayscale-0 transition-all duration-300"
          />
        ) : (
          <div className="text-muted text-xs font-mono flex flex-col items-center gap-1">
            <span>[ 待封印快照 ]</span>
            <span className="text-[10px] opacity-60">点击放映并定格封面</span>
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <span className="flex items-center gap-1 bg-surface text-main text-xs px-2.5 py-1 rounded font-mono shadow-md">
            <Play className="w-3 h-3 fill-current" />
            <span>放映舞台</span>
          </span>
        </div>
      </button>

      {/* 标本元数据与暗房快捷按钮 */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="flex justify-between items-start gap-2 mb-1">
            <div
              className="text-sm font-semibold text-main truncate flex-1"
              title={artifact.meta.name}
            >
              {artifact.meta.name}
            </div>
            <button
              type="button"
              onClick={() => onOpenStudio(artifact)}
              className="flex items-center gap-1 text-[11px] font-mono text-sky-400 hover:text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded hover:bg-sky-400/10 transition-colors shrink-0"
              title="打开独立暗房工作台"
            >
              <Code2 className="w-3 h-3" />
              <span>暗房</span>
            </button>
          </div>
          <div className="text-[11px] font-mono text-muted mb-2">{artifact.meta.filename}</div>
        </div>

        <div className="flex flex-wrap gap-1">
          {artifact.meta.tags.map((rawTag) => {
            const parsed = TagQueryEngine.parseTag(rawTag);
            return (
              <span
                key={rawTag}
                className="inline-flex items-center bg-tag border border-border px-1.5 py-0.5 text-[11px] font-mono rounded"
              >
                {parsed.namespace && <span className="text-muted">{parsed.namespace}:</span>}
                <span className="font-medium text-main">{parsed.value}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
~~~~~

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
  // 网页全屏展演中的工件
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

      {/* 活体全屏放映舞台 (Fullscreen Stage) */}
      <FullscreenStage
        artifact={stageArtifact}
        onClose={() => setStageArtifact(null)}
        onOpenDarkroom={(art) => {
          setStageArtifact(null);
          setStudioArtifact(art);
        }}
        onUpdateArtifact={handleUpdateArtifact}
      />

      {/* 独立全屏暗房工作台 (Darkroom Studio) */}
      <DarkroomStudio
        artifact={studioArtifact}
        onBackToGallery={() => setStudioArtifact(null)}
        onOpenStage={(art) => {
          setStudioArtifact(null);
          setStageArtifact(art);
        }}
        onUpdateArtifact={handleUpdateArtifact}
      />
    </div>
  );
}

export default App;
~~~~~

#### Acts 5: 清理废弃的 Modal 历史文件

移除已彻底被 `DarkroomStudio` 取代的旧弹窗文件 `DarkroomModal.tsx`。

~~~~~act
delete_file
src/layer3_gallery/components/DarkroomModal.tsx
~~~~~

### 下一步建议
1. 启动项目运行 `pnpm dev`，进入暗房体验大画幅视口、微光加载 HUD 以及“一键全量持久化至本地 Cache”的离线效果。
2. 可进一步在 `AssetCacheEngine` 中支持针对大型 WebAssembly 或字体（`.wasm`, `.woff2`）的嗅探与本地化缓存。
