import { MetaSealEngine } from '@/core/engine/meta-seal';
import { galleryStorage } from '@/core/storage/fs-storage';
import { resolveAlbumArtifacts } from '@/features/albums/album-resolver';
import type { AlbumMeta, Artifact } from '@/types';

interface ZipFileEntry {
  path: string;
  data: Uint8Array;
  modTime: Date;
}

/**
 * CRC32 计算表与纯算法实现（符合 IEEE 802.3 标准）
 */
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 轻量纯原生 PKZIP 生成器（STORE 模式，无任何外部库依赖）
 */
function createZipBlob(files: ZipFileEntry[]): Blob {
  const parts: Uint8Array[] = [];
  const centralDirEntries: Uint8Array[] = [];
  let offset = 0;

  const encoder = new TextEncoder();

  for (const file of files) {
    const pathBytes = encoder.encode(file.path);
    const dataBytes = file.data;
    const crc = calculateCrc32(dataBytes);
    const size = dataBytes.length;

    // MS-DOS 格式的时间戳转换
    const dosTime =
      (file.modTime.getHours() << 11) |
      (file.modTime.getMinutes() << 5) |
      (file.modTime.getSeconds() >> 1);
    const dosDate =
      ((file.modTime.getFullYear() - 1980) << 9) |
      ((file.modTime.getMonth() + 1) << 5) |
      file.modTime.getDate();

    // 1. Local File Header (30 字节 + 路径长度)
    const localHeader = new Uint8Array(30 + pathBytes.length);
    const lView = new DataView(localHeader.buffer);
    lView.setUint32(0, 0x04034b50, true); // Local header signature
    lView.setUint16(4, 20, true); // Version needed to extract (2.0)
    lView.setUint16(6, 0x0800, true); // Flags (bit 11: UTF-8)
    lView.setUint16(8, 0, true); // Compression method (0: STORE)
    lView.setUint16(10, dosTime, true);
    lView.setUint16(12, dosDate, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, size, true); // Compressed size
    lView.setUint32(22, size, true); // Uncompressed size
    lView.setUint16(26, pathBytes.length, true);
    lView.setUint16(28, 0, true); // Extra field length
    localHeader.set(pathBytes, 30);

    parts.push(localHeader);
    parts.push(dataBytes);

    // 2. Central Directory Header (46 字节 + 路径长度)
    const centralHeader = new Uint8Array(46 + pathBytes.length);
    const cView = new DataView(centralHeader.buffer);
    cView.setUint32(0, 0x02014b50, true); // Central header signature
    cView.setUint16(4, 20, true); // Version made by
    cView.setUint16(6, 20, true); // Version needed to extract
    cView.setUint16(8, 0x0800, true); // Flags (bit 11: UTF-8)
    cView.setUint16(10, 0, true); // Compression method
    cView.setUint16(12, dosTime, true);
    cView.setUint16(14, dosDate, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, size, true);
    cView.setUint32(24, size, true);
    cView.setUint16(28, pathBytes.length, true);
    cView.setUint16(30, 0, true); // Extra field length
    cView.setUint16(32, 0, true); // File comment length
    cView.setUint16(34, 0, true); // Disk number start
    cView.setUint16(36, 0, true); // Internal attributes
    cView.setUint32(38, 0, true); // External attributes
    cView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(pathBytes, 46);

    centralDirEntries.push(centralHeader);

    offset += localHeader.length + dataBytes.length;
  }

  // 3. Central Directory 与 End of Central Directory Record (22 字节)
  let centralDirSize = 0;
  for (const c of centralDirEntries) {
    centralDirSize += c.length;
    parts.push(c);
  }

  const endRecord = new Uint8Array(22);
  const eView = new DataView(endRecord.buffer);
  eView.setUint32(0, 0x06054b50, true); // End of central dir signature
  eView.setUint16(4, 0, true); // Disk number
  eView.setUint16(6, 0, true); // Disk where central directory starts
  eView.setUint16(8, files.length, true); // Number of central directory records on this disk
  eView.setUint16(10, files.length, true); // Total number of central directory records
  eView.setUint32(12, centralDirSize, true); // Size of central directory
  eView.setUint32(16, offset, true); // Offset of start of central directory
  eView.setUint16(20, 0, true); // Comment length

  parts.push(endRecord);

  return new Blob(parts as unknown as BlobPart[], { type: 'application/zip' });
}

/**
 * 生成自包含独立的离线画册查看器单页 HTML
 */
function generateOfflineViewerHtml(album: AlbumMeta, artifacts: Artifact[]): string {
  const safeTitle = album.title.replace(/"/g, '&quot;');
  const safeDesc = (album.description || '').replace(/"/g, '&quot;');

  const itemsJson = JSON.stringify(
    artifacts.map((a, i) => ({
      index: i + 1,
      name: a.meta.name,
      filename: `artifacts/${a.meta.filename}`,
      tags: a.meta.tags,
      rating: a.meta.rating || 0,
      description: a.meta.description || '',
    })),
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${safeTitle} - 离线策展画册</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; background: #09090b; color: #fafafa; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    header { height: 50px; background: #18181b; border-bottom: 1px solid #27272a; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 13px; }
    .title-area { display: flex; align-items: center; gap: 8px; font-weight: bold; }
    .badge { background: #27272a; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #38bdf8; }
    .main { flex: 1; display: flex; overflow: hidden; }
    .sidebar { width: 280px; background: #121215; border-right: 1px solid #27272a; display: flex; flex-direction: column; overflow-y: auto; }
    .item-btn { display: block; width: 100%; text-align: left; padding: 10px 14px; border: none; background: transparent; color: #a1a1aa; font-size: 12px; cursor: pointer; border-bottom: 1px solid #1f1f23; transition: all 0.2s; font-family: inherit; }
    .item-btn:hover { background: #18181b; color: #fafafa; }
    .item-btn.active { background: #0c4a6e; color: #38bdf8; font-weight: 600; }
    .viewport { flex: 1; background: #000; position: relative; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header>
    <div class="title-area">
      <span>📦 ${safeTitle}</span>
      <span class="badge">${artifacts.length} 件工件</span>
    </div>
    <div style="color: #71717a; font-size: 11px;">${safeDesc}</div>
  </header>
  <div class="main">
    <div class="sidebar" id="list"></div>
    <div class="viewport">
      <iframe id="stage" sandbox="allow-scripts allow-same-origin" title="工件放映视口"></iframe>
    </div>
  </div>
  <script>
    const items = ${itemsJson};
    const listEl = document.getElementById('list');
    const stageEl = document.getElementById('stage');
    let activeIdx = 0;

    function renderItem(idx) {
      activeIdx = idx;
      const target = items[idx];
      if (!target) return;
      stageEl.src = target.filename;
      document.querySelectorAll('.item-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === idx);
      });
    }

    items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.className = 'item-btn' + (i === 0 ? ' active' : '');
      btn.innerHTML = '<div>' + item.index + '. ' + item.name + '</div>';
      btn.onclick = () => renderItem(i);
      listEl.appendChild(btn);
    });

    if (items.length > 0) {
      renderItem(0);
    }
  </script>
</body>
</html>`;
}

/**
 * 触发浏览器原生下载 Blob 动作
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 打包整个画册为自包含离线 ZIP 归档
 */
export async function exportAlbumAsZip(
  album: AlbumMeta,
  allArtifacts: Artifact[],
  onProgress?: (msg: string) => void,
): Promise<Blob> {
  const resolved = resolveAlbumArtifacts(album, allArtifacts);
  if (resolved.length === 0) {
    throw new Error('画册中没有可导出的有效工件');
  }

  onProgress?.('正在读取工件源码与元数据...');
  const files: ZipFileEntry[] = [];
  const encoder = new TextEncoder();
  const folderName = album.title.replace(/[\\/:*?"<>|]/g, '_') || 'curio_album';

  for (let i = 0; i < resolved.length; i++) {
    const art = resolved[i];
    onProgress?.(`正在打包 (${i + 1}/${resolved.length}): ${art.meta.name}`);

    let source = art.sourceCode;
    if (!source) {
      source = await galleryStorage.loadArtifactSource(art.meta.filename);
    }

    const stampedHtml = MetaSealEngine.inject(source, art.meta);
    files.push({
      path: `${folderName}/artifacts/${art.meta.filename}`,
      data: encoder.encode(stampedHtml),
      modTime: new Date(art.meta.updatedAt || art.meta.createdAt),
    });
  }

  // 写入画册自洽元数据
  files.push({
    path: `${folderName}/album.json`,
    data: encoder.encode(JSON.stringify(album, null, 2)),
    modTime: new Date(),
  });

  // 写入离线自包含导航单页
  const indexHtml = generateOfflineViewerHtml(album, resolved);
  files.push({
    path: `${folderName}/index.html`,
    data: encoder.encode(indexHtml),
    modTime: new Date(),
  });

  onProgress?.('正在生成离线 ZIP 文件...');
  return createZipBlob(files);
}
