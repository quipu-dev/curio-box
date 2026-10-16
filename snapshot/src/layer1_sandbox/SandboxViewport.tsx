import type React from 'react';
import { useEffect, useRef } from 'react';

interface SandboxViewportProps {
  htmlPayload: string;
  isActivated: boolean;
  onCaptureReady?: (captureHandle: () => Promise<Blob>) => void;
}

const CAPTURE_HARNESS_SCRIPT = `
<script id="__curio_harness__">
(function() {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attribs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attribs);
  };

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
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    if (!isActivated) {
      iframe.src = 'about:blank';
      return;
    }

    let finalHtml = htmlPayload;
    if (finalHtml.includes('<head>')) {
      finalHtml = finalHtml.replace('<head>', `<head>${CAPTURE_HARNESS_SCRIPT}`);
    } else {
      finalHtml = CAPTURE_HARNESS_SCRIPT + finalHtml;
    }

    const blob = new Blob([finalHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    iframe.src = url;

    return () => {
      URL.revokeObjectURL(url);
      iframe.src = 'about:blank';
    };
  }, [htmlPayload, isActivated]);

  useEffect(() => {
    if (!onCaptureReady) return;

    onCaptureReady(async () => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        throw new Error('沙箱未激活，无法定格封印快照');
      }

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

        iframe.contentWindow.postMessage(
          {
            type: 'CURIO_CAPTURE_REQUEST',
            requestId: requestId,
          },
          '*',
        );
      });
    });
  }, [onCaptureReady]);

  return (
    <div className="relative w-full h-full bg-black/95 overflow-hidden rounded border border-border flex items-center justify-center">
      {isActivated ? (
        <iframe
          ref={iframeRef}
          title="工件独立沙箱视口"
          sandbox="allow-scripts"
          className="w-full h-full border-0"
        />
      ) : (
        <div className="text-muted text-xs font-mono select-none flex flex-col items-center gap-2">
          <span>[ 工件处于静默陈列态 ]</span>
          <span className="text-[11px] opacity-70">点击上方“活体展演”以激活动态沙箱</span>
        </div>
      )}
    </div>
  );
};
