interface ZipFileEntry {
  path: string;
  data: Uint8Array;
  modTime: Date;
}

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

    const dosTime =
      (file.modTime.getHours() << 11) |
      (file.modTime.getMinutes() << 5) |
      (file.modTime.getSeconds() >> 1);
    const dosDate =
      ((file.modTime.getFullYear() - 1980) << 9) |
      ((file.modTime.getMonth() + 1) << 5) |
      file.modTime.getDate();

    const localHeader = new Uint8Array(30 + pathBytes.length);
    const lView = new DataView(localHeader.buffer);
    lView.setUint32(0, 0x04034b50, true);
    lView.setUint16(4, 20, true);
    lView.setUint16(6, 0x0800, true); // UTF-8
    lView.setUint16(8, 0, true); // STORE
    lView.setUint16(10, dosTime, true);
    lView.setUint16(12, dosDate, true);
    lView.setUint32(14, crc, true);
    lView.setUint32(18, size, true);
    lView.setUint32(22, size, true);
    lView.setUint16(26, pathBytes.length, true);
    lView.setUint16(28, 0, true);
    localHeader.set(pathBytes, 30);

    parts.push(localHeader);
    parts.push(dataBytes);

    const centralHeader = new Uint8Array(46 + pathBytes.length);
    const cView = new DataView(centralHeader.buffer);
    cView.setUint32(0, 0x02014b50, true);
    cView.setUint16(4, 20, true);
    cView.setUint16(6, 20, true);
    cView.setUint16(8, 0x0800, true);
    cView.setUint16(10, 0, true);
    cView.setUint16(12, dosTime, true);
    cView.setUint16(14, dosDate, true);
    cView.setUint32(16, crc, true);
    cView.setUint32(20, size, true);
    cView.setUint32(24, size, true);
    cView.setUint16(28, pathBytes.length, true);
    cView.setUint16(30, 0, true);
    cView.setUint16(32, 0, true);
    cView.setUint16(34, 0, true);
    cView.setUint16(36, 0, true);
    cView.setUint32(38, 0, true);
    cView.setUint32(42, offset, true);
    centralHeader.set(pathBytes, 46);

    centralDirEntries.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralDirSize = 0;
  for (const c of centralDirEntries) {
    centralDirSize += c.length;
    parts.push(c);
  }

  const endRecord = new Uint8Array(22);
  const eView = new DataView(endRecord.buffer);
  eView.setUint32(0, 0x06054b50, true);
  eView.setUint16(4, 0, true);
  eView.setUint16(6, 0, true);
  eView.setUint16(8, files.length, true);
  eView.setUint16(10, files.length, true);
  eView.setUint32(12, centralDirSize, true);
  eView.setUint32(16, offset, true);
  eView.setUint16(20, 0, true);

  parts.push(endRecord);

  return new Blob(parts as unknown as BlobPart[], { type: 'application/zip' });
}

/**
 * 递归收集目录中所有文件数据为 Zip 条目
 */
async function collectDirectoryFiles(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  entries: ZipFileEntry[],
  onProgress?: (filename: string) => void,
): Promise<void> {
  const iterator = (
    dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> }
  ).values();

  for await (const handle of iterator) {
    const currentPath = basePath ? `${basePath}/${handle.name}` : handle.name;
    if (handle.kind === 'file') {
      try {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const arrayBuf = await file.arrayBuffer();
        onProgress?.(currentPath);
        entries.push({
          path: currentPath,
          data: new Uint8Array(arrayBuf),
          modTime: new Date(file.lastModified),
        });
      } catch (err) {
        console.warn(`备份文件读取失败 [${currentPath}]:`, err);
      }
    } else if (handle.kind === 'directory') {
      await collectDirectoryFiles(
        handle as FileSystemDirectoryHandle,
        currentPath,
        entries,
        onProgress,
      );
    }
  }
}

/**
 * 将整个工作区完整打包为离线 ZIP
 */
export async function exportWorkspaceAsZip(
  rootHandle: FileSystemDirectoryHandle,
  onProgress?: (status: string) => void,
): Promise<Blob> {
  const fileEntries: ZipFileEntry[] = [];
  onProgress?.('正在检索工作区文件结构...');
  await collectDirectoryFiles(rootHandle, '', fileEntries, (path) => {
    onProgress?.(`正在打包: ${path}`);
  });

  if (fileEntries.length === 0) {
    throw new Error('工作区为空，暂无可导出的内容');
  }

  onProgress?.('正在生成完整归档 ZIP...');
  return createZipBlob(fileEntries);
}
