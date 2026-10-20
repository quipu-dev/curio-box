import { ArtifactRepository } from '@/core/storage/artifact-repository';
import { MemoryDirectoryHandle } from '@/test/mock-fs';
import { beforeEach, describe, expect, it } from 'vitest';

describe('ArtifactRepository 物理持久化与快照体系', () => {
  let root: MemoryDirectoryHandle;
  let repo: ArtifactRepository;

  beforeEach(() => {
    root = new MemoryDirectoryHandle('root');
    repo = new ArtifactRepository();
    repo.setDirectoryHandle(root as unknown as FileSystemDirectoryHandle);
  });

  it('createArtifact：在根目录创建带符印 HTML，并在 .gallery 下建立沙箱与初始快照', async () => {
    const rawCode = '<html><body><h1>Hello Canvas</h1></body></html>';
    const artifact = await repo.createArtifact(
      'hello.html',
      rawCode,
      '测试工件',
      ['形态:canvas', '状态:新建'],
      '这是一个初始化工件',
    );

    const artifactId = artifact.meta.id;
    expect(artifactId).toMatch(/^art_/);

    // 1. 根目录存在 HTML，且包含 @curio 符印
    expect(await root.hasFile('hello.html')).toBe(true);
    const rootHtml = await root.readFile('hello.html');
    expect(rootHtml).toContain('<!--@curio');
    expect(rootHtml).toContain(rawCode);

    // 2. 沙箱目录生成 meta.json
    const metaPath = `.gallery/artifacts/${artifactId}/meta.json`;
    expect(await root.hasFile(metaPath)).toBe(true);
    const metaJson = JSON.parse(await root.readFile(metaPath));
    expect(metaJson.schemaVersion).toBe(2);
    expect(metaJson.currentRevision).toBe(1);
    expect(metaJson.history.length).toBe(1);
    expect(metaJson.history[0].action).toBe('genesis');

    // 3. 沙箱目录生成 rev-0001.snapshot，且必须是纯净源码（不含符印注释）
    const snapPath = `.gallery/artifacts/${artifactId}/snapshots/rev-0001.snapshot`;
    expect(await root.hasFile(snapPath)).toBe(true);
    const snapCode = await root.readFile(snapPath);
    expect(snapCode).toBe(rawCode);
    expect(snapCode).not.toContain('<!--@curio');
  });

  it('commitRevision：正确推进版本至 REV:2，写入新快照并同步 HTML 符印', async () => {
    const v1Code = 'let a = 1;';
    const created = await repo.createArtifact('counter.html', v1Code, '计数器');
    const artifactId = created.meta.id;

    const v2Code = 'let a = 2; // 升级';
    const updatedMeta = await repo.commitRevision({
      artifactId,
      filename: 'counter.html',
      code: v2Code,
      revision: 2,
      action: 'patch',
      message: '更新变量值为 2',
      tags: ['形态:原生html', '状态:精选'],
      description: '优化完毕',
    });

    expect(updatedMeta.currentRevision).toBe(2);
    expect(updatedMeta.history.length).toBe(2);
    expect(updatedMeta.history[1].revision).toBe(2);
    expect(updatedMeta.history[1].message).toBe('更新变量值为 2');

    // 验证新快照文件已生成
    const snap2Path = `.gallery/artifacts/${artifactId}/snapshots/rev-0002.snapshot`;
    expect(await root.hasFile(snap2Path)).toBe(true);
    expect(await root.readFile(snap2Path)).toBe(v2Code);

    // 验证根目录 HTML 的符印已升级为 REV:2
    const currentHtml = await root.readFile('counter.html');
    expect(currentHtml).toContain('"revision": 2');
    expect(currentHtml).toContain(v2Code);
  });

  it('renameArtifact：物理移动/重命名根目录 HTML，并更新沙箱元数据', async () => {
    await repo.createArtifact('old-name.html', '<div>old</div>', '旧工件');

    const renamed = await repo.renameArtifact('old-name.html', 'new-name.html', '新工件');

    expect(renamed.meta.filename).toBe('new-name.html');
    expect(renamed.meta.name).toBe('新工件');

    // 旧文件已物理移除，新文件存在
    expect(await root.hasFile('old-name.html')).toBe(false);
    expect(await root.hasFile('new-name.html')).toBe(true);

    // 沙箱 meta.json 同步更新
    const metaPath = `.gallery/artifacts/${renamed.meta.id}/meta.json`;
    const metaJson = JSON.parse(await root.readFile(metaPath));
    expect(metaJson.filename).toBe('new-name.html');
    expect(metaJson.name).toBe('新工件');
  });

  it('deleteArtifact：彻底物理销毁根目录文件及 .gallery 下的整个沙箱目录', async () => {
    const created = await repo.createArtifact('trash.html', '<div>delete me</div>', '待删');
    const artifactId = created.meta.id;

    expect(await root.hasFile('trash.html')).toBe(true);
    expect(await root.hasFile(`.gallery/artifacts/${artifactId}/meta.json`)).toBe(true);

    await repo.deleteArtifact('trash.html');

    // 根文件与沙箱目录全部抹除
    expect(await root.hasFile('trash.html')).toBe(false);
    expect(await root.hasFile(`.gallery/artifacts/${artifactId}/meta.json`)).toBe(false);
  });
});