这是由于沙箱视口采用了标准的 `sandbox="allow-scripts"` 隔离策略，浏览器将 `Blob URL` 沙箱环境判定为独立的不透明来源（Opaque / `null` Origin）。当父页面尝试直接通过 `iframe.contentDocument` 同步穿透读取子 DOM 时，触发了浏览器的跨域同源策略拦截（Same-Origin Policy）。

根据白皮书中 Layer 1（沙箱视口与挂架）的职责定义，宿主应通过**异步消息通信管道（postMessage Channel）**与沙箱握手，并在内存载荷中挂载非侵入式轻量抓拍探针（同时激活 WebGL `preserveDrawingBuffer`，以确保着色器与流体帧在定格时不被提前清空）。

我将通过以下计划修复此问题。

## [WIP] fix: 采用跨域 postMessage 通道修复沙箱视口定格捕获失败

### 错误分析
在 `src/layer1_sandbox/SandboxViewport.tsx` 中，父级组件通过 `iframe.contentDocument` 直接读取沙箱内的 DOM 节点。由于硬隔离沙箱具有独立的源标识，浏览器抛出 `Blocked a frame with origin "http://localhost:5173" from accessing a cross-origin frame` 异常。此外，直接同步读取还可能遇到 WebGL 默认未开启 `preserveDrawingBuffer` 而导致抓取出黑屏帧的问题。

### 用户需求
修复定格封印快照时的跨域阻止报错，使暗房能够稳定、无损地从沙箱中提取 WebP 格式的快照图像。

### 评论
这是硬沙箱架构下的必然物理边界。正确的解法不是盲目放宽沙箱权限（如引入 `allow-same-origin` 会破坏隔离性与安全性），而是建立标准的跨域通信通道（Layer 1 Rig 通信协议）。通过在内存渲染阶段向 Blob 注入无害的通信挂架，既保全了磁盘工件源码的纯粹性，又打通了无缝的像素析出通路。

### 目标
1. 重构 `SandboxViewport.tsx` 的抓拍逻辑。
2. 在内存挂载时注入仅存在于运行时的轻量探针脚本，代理 WebGL 绘制缓冲并监听抓拍指令。
3. 通过 `window.postMessage` 实现父子双向异步通信，将 Canvas 画面编码为 WebP 数据并回传给暗房。

### 基本原理
利用 `postMessage` 跨越隔离边界：
1. 父视口向子 `iframe` 发送 `CURIO_CAPTURE_REQUEST`。
2. 探针在子沙箱内部直接获取 `canvas.toDataURL('image/webp', 0.92)`，并回传 `CURIO_CAPTURE_RESPONSE`。
3. 父视口接收后通过 `fetch(dataUrl)` 转为二进制 `Blob`，持久化至侧车 `.gallery/posters/` 目录。

### 标签
#intent/fix #flow/ready #priority/high #comp/runtime #concept/ui #concept/executor #scope/core #ai/instruct #task/domain/ui #task/object/sandbox-viewport #task/action/bug-fix #task/state/continue

---

### Script

#### Acts 1: 重构 SandboxViewport 实现跨域安全捕获

更新 `src/layer1_sandbox/SandboxViewport.tsx`，加入非侵入式内存探针与 postMessage 通信桥梁。

~~~~~act
write_file
src/layer1_sandbox/SandboxViewport.tsx
~~~~~
~~~~~typescript
import React, { useEffect, useRef } from 'react';

interface SandboxViewportProps {
  htmlPayload: string;
  isActivated: boolean;
  onCaptureReady?: (captureHandle: () => Promise<Blob>) => void;
}

// 运行时非侵入通信探针 (仅注入于内存 Blob，不篡改本地物理文件)
const CAPTURE_HARNESS_SCRIPT = `
<script id="__curio_harness__">
(function() {
  // 确保 WebGL 上下文保留绘制缓冲区，支持随时随帧定格抓拍
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attribs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attribs = Object.assign({}, attribs, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attribs);
  };

  // 监听宿主下达的定格指令
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
      window.parent.postMessage({
        type: 'CURIO_CAPTURE_RESPONSE',
        requestId: reqId,
        error: err.message || '画布定格失败'
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

    // 内存组装：将挂架脚本静默注入到 head 或文档开头
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

    // 暴露通过 postMessage 进行异步定格抓拍的方法
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
          } catch (err: any) {
            reject(new Error(`快照数据流转换失败: ${err.message}`));
          }
        };

        window.addEventListener('message', handleResponse);

        // 向子沙箱发起跨域定格请求
        iframe.contentWindow.postMessage(
          {
            type: 'CURIO_CAPTURE_REQUEST',
            requestId: requestId,
          },
          '*'
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
~~~~~

### 下一步建议
- **在暗房中验证快照捕获**: 打开任一工件，点击“活体展演 (JIT Mount)”激活画布，随后点击“定格封印”，确认快照成功生成并不再弹出跨域报错。
- **验证封面更新**: 定格成功后，关闭暗房，检查画廊卡片上的封面是否已经无缝从“待封印快照”变更为刚捕获的高品质 WebP 图像。
