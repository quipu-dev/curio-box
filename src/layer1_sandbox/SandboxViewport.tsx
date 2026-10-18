import { AssetCacheEngine } from '@/layer2_darkroom/engine/asset-cache';
import type { CaptureMode } from '@/types';
import { Loader2, Sparkles } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

interface SandboxViewportProps {
  htmlPayload: string;
  isActivated: boolean;
  onCaptureReady?: (
    captureHandle: (mode?: Exclude<CaptureMode, 'screen'>) => Promise<Blob>,
  ) => void;
  aspectRatio?: 'fill' | '16/9' | '4/3' | '1/1';
}

const CAPTURE_HARNESS_SCRIPT = `
<script id="__curio_harness__">
(function() {
  // WebGL 截屏图元保全：劫持绘图上下文，强制开启 preserveDrawingBuffer
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attribs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attribs);
  };

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

  // 1. 硬件 Canvas 提取：若存在多个 Canvas，按 DOM 层叠顺序离屏复合绘制
  async function captureCanvasLayers() {
    const canvases = Array.from(document.querySelectorAll('canvas')).filter(function(c) {
      const rect = c.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (canvases.length === 0) {
      throw new Error('视口内未检测到有效的 Canvas 画布图元');
    }

    if (canvases.length === 1) {
      return canvases[0].toDataURL('image/webp', 0.94);
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = window.innerWidth;
    offscreen.height = window.innerHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('无法初始化离屏合成画布');

    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i];
      const rect = c.getBoundingClientRect();
      try {
        ctx.drawImage(c, rect.left, rect.top, rect.width, rect.height);
      } catch (err) {
        console.warn('Canvas 图层叠加绘制异常:', err);
      }
    }
    return offscreen.toDataURL('image/webp', 0.94);
  }

  // 2. 网页 DOM / SVG 全景光栅化：基于 SVG foreignObject 渲染视口真实像素
  async function captureDomViewport() {
    const width = window.innerWidth || 800;
    const height = window.innerHeight || 600;

    // 先克隆文档根节点，防止污染活体视口
    const cloneDoc = document.documentElement.cloneNode(true);

    // 移除注入的 harness 脚本，保持纯粹
    const harnessEl = cloneDoc.querySelector('#__curio_harness__');
    if (harnessEl) harnessEl.remove();

    // 关键步骤：原生 Canvas 在 foreignObject 中无法直接显示，将其转换为对应 Image 元素原位替代
    const origCanvases = document.querySelectorAll('canvas');
    const cloneCanvases = cloneDoc.querySelectorAll('canvas');

    for (let i = 0; i < origCanvases.length; i++) {
      try {
        const dataUrl = origCanvases[i].toDataURL('image/png');
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = origCanvases[i].style.cssText;
        img.className = origCanvases[i].className;
        img.width = origCanvases[i].width;
        img.height = origCanvases[i].height;
        if (cloneCanvases[i] && cloneCanvases[i].parentNode) {
          cloneCanvases[i].parentNode.replaceChild(img, cloneCanvases[i]);
        }
      } catch (e) {
        console.warn('Canvas 光栅化替代表单失败:', e);
      }
    }

    const serializer = new XMLSerializer();
    const htmlString = serializer.serializeToString(cloneDoc);

    const svgXml = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
      '<foreignObject width="100%" height="100%">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;overflow:hidden;">' +
      htmlString +
      '</div></foreignObject></svg>';

    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgXml);

    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.onload = function() {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = width;
          offscreen.height = height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) {
            reject(new Error('无法创建离屏光栅化画布'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(offscreen.toDataURL('image/webp', 0.94));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function() {
        reject(new Error('视口 DOM 矢量化渲染失败'));
      };
      img.src = svgDataUrl;
    });
  }

  // 监听宿主截屏请求
  window.addEventListener('message', async function(ev) {
    if (!ev.data || ev.data.type !== 'CURIO_CAPTURE_REQUEST') return;
    const reqId = ev.data.requestId;
    const mode = ev.data.mode || 'auto';

    try {
      let dataUrl;
      const canvases = document.querySelectorAll('canvas');

      if (mode === 'canvas') {
        dataUrl = await captureCanvasLayers();
      } else if (mode === 'dom') {
        dataUrl = await captureDomViewport();
      } else {
        // auto 模式：如果视口仅有主 Canvas 且无其它主要 DOM 节点，走高性能硬件直读；否则走 DOM 全景光栅化
        if (canvases.length > 0 && document.body.children.length <= canvases.length + 2) {
          try {
            dataUrl = await captureCanvasLayers();
          } catch {
            dataUrl = await captureDomViewport();
          }
        } else {
          try {
            dataUrl = await captureDomViewport();
          } catch {
            if (canvases.length > 0) {
              dataUrl = await captureCanvasLayers();
            } else {
              throw new Error('视口内无可捕获的内容');
            }
          }
        }
      }

      window.parent.postMessage({
        type: 'CURIO_CAPTURE_RESPONSE',
        requestId: reqId,
        dataUrl: dataUrl
      }, '*');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
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
  const [loadingTip, setLoadingTip] = useState<string>('正在解析工件代码...');

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    if (!isActivated) {
      iframe.src = 'about:blank';
      setIsLoading(false);
      return;
    }

    let isSubscribed = true;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let currentObjectUrl: string | null = null;

    const handleReadyMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'CURIO_STAGE_READY') {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (isSubscribed) setIsLoading(false);
      }
    };

    window.addEventListener('message', handleReadyMessage);
    setIsLoading(true);
    setLoadingTip('正在检查资源缓存...');

    AssetCacheEngine.resolveAndWarmupHtml(htmlPayload, (stats) => {
      if (isSubscribed && stats.total > 0) {
        setLoadingTip(`资源准备就绪 (${stats.cached}/${stats.total})，正在挂载沙箱...`);
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
      currentObjectUrl = URL.createObjectURL(blob);
      iframe.src = currentObjectUrl;

      fallbackTimer = setTimeout(() => {
        if (isSubscribed) setIsLoading(false);
      }, 3500);
    });

    return () => {
      isSubscribed = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener('message', handleReadyMessage);
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      iframe.src = 'about:blank';
    };
  }, [htmlPayload, isActivated]);

  useEffect(() => {
    if (!onCaptureReady) return;

    onCaptureReady(async (mode = 'auto') => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        throw new Error('沙箱视口未激活或未就绪');
      }

      const contentWindow = iframe.contentWindow;
      const requestId = `req_${Math.random().toString(36).slice(2, 10)}`;

      return new Promise<Blob>((resolve, reject) => {
        const timeoutTimer = setTimeout(() => {
          window.removeEventListener('message', handleResponse);
          reject(new Error('画面捕获超时：沙箱内未在规定时间内响应'));
        }, 5000);

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
            reject(new Error(`封面数据转换失败: ${msg}`));
          }
        };

        window.addEventListener('message', handleResponse);

        contentWindow.postMessage(
          {
            type: 'CURIO_CAPTURE_REQUEST',
            requestId,
            mode,
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
    <div className="dark-scope relative w-full h-full bg-black/95 overflow-hidden rounded border border-border flex items-center justify-center">
      {isActivated ? (
        <div className={`relative flex items-center justify-center ${aspectClass}`}>
          <iframe
            ref={iframeRef}
            title="工件预览沙箱"
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-transparent"
          />

          {isLoading && (
            <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-3 z-20 pointer-events-none select-none">
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-status-info animate-spin" />
                <Sparkles className="w-4 h-4 text-sky-200 absolute animate-pulse" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="text-xs font-mono text-zinc-200 font-medium tracking-wide">
                  正在载入工件视口
                </div>
                <div className="text-[11px] font-mono text-zinc-500">{loadingTip}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted text-xs font-mono select-none flex flex-col items-center gap-2">
          <span>[ 视口已休眠 ]</span>
          <span className="text-[11px] opacity-70">点击上方“运行”以启动预览</span>
        </div>
      )}
    </div>
  );
};
