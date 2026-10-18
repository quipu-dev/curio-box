/**
 * 宿主级屏幕采集工具：调用浏览器原生 getDisplayMedia 单帧定格，
 * 适用于 WebGPU、复杂跨域内嵌或沙箱内光栅化受阻的终极逃生手段。
 */
export async function captureDisplayMediaFrame(): Promise<Blob> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('当前浏览器环境不支持屏幕级视口拾取 API');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
    },
    audio: false,
  });

  const track = stream.getVideoTracks()[0];
  if (!track) {
    throw new Error('未获取到有效的视频采集轨道');
  }

  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    const cleanup = () => {
      for (const t of stream.getTracks()) {
        t.stop();
      }
      video.srcObject = null;
    };

    video.onloadeddata = () => {
      requestAnimationFrame(() => {
        try {
          video.play().catch(() => {});
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            reject(new Error('无法创建离屏采集画布'));
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          cleanup();

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('屏幕快照数据压缩失败'));
              }
            },
            'image/webp',
            0.94,
          );
        } catch (err) {
          cleanup();
          reject(err);
        }
      });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('屏幕数据流载入异常'));
    };
  });
}
