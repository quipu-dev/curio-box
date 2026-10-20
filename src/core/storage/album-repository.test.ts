import { AlbumRepository } from '@/core/storage/album-repository';
import { MemoryDirectoryHandle } from '@/test/mock-fs';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AlbumRepository 画册持久化与对齐', () => {
  let root: MemoryDirectoryHandle;
  let repo: AlbumRepository;

  beforeEach(() => {
    root = new MemoryDirectoryHandle('root');
    repo = new AlbumRepository();
    repo.setDirectoryHandle(root as unknown as FileSystemDirectoryHandle);
  });

  it('创建手工画册并在 .gallery/albums/ 下生成独立 JSON 配置', async () => {
    const album = await repo.createAlbum({
      title: '流动之美',
      description: '收纳高分流体标本',
      type: 'manual',
      rating: 5,
      items: [{ artifactId: 'art_123', note: '第一幕' }],
    });

    expect(album.id).toMatch(/^alb_/);
    expect(album.title).toBe('流动之美');

    const filePath = `.gallery/albums/${album.id}.json`;
    expect(await root.hasFile(filePath)).toBe(true);

    const json = JSON.parse(await root.readFile(filePath));
    expect(json.id).toBe(album.id);
    expect(json.items.length).toBe(1);
    expect(json.items[0].artifactId).toBe('art_123');
  });

  it('支持修改与物理删除画册', async () => {
    const album = await repo.createAlbum({
      title: '待修改画册',
      type: 'smart',
      query: '形态:webgl',
    });

    album.title = '已修改画册';
    await repo.saveAlbum(album);

    const loaded = await repo.loadAlbum(album.id);
    expect(loaded?.title).toBe('已修改画册');

    // 删除
    await repo.deleteAlbum(album.id);
    expect(await root.hasFile(`.gallery/albums/${album.id}.json`)).toBe(false);
    expect(await repo.loadAlbum(album.id)).toBeNull();
  });
});
