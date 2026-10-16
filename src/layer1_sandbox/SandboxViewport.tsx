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
