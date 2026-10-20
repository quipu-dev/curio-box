import { DarkroomApplier, parsePatchCommands, parseStateBlocks } from '@/core/engine/patch-fsm';
import { describe, expect, it } from 'vitest';

describe('PatchFSM & DarkroomApplier', () => {
  describe('parseStateBlocks', () => {
    it('能够精确解析三重反引号与波浪号围栏指令块', () => {
      const input = `
\`\`\`act
commit
\`\`\`
\`\`\`text
重构着色器逻辑
\`\`\`

~~~act
add_tag
~~~
~~~text
形态:webgl 物理:重力
~~~
`;

      const blocks = parseStateBlocks(input);
      expect(blocks.length).toBe(2);
      expect(blocks[0].act).toBe('commit');
      expect(blocks[0].contexts[0]).toBe('重构着色器逻辑');
      expect(blocks[1].act).toBe('add_tag');
      expect(blocks[1].contexts[0]).toBe('形态:webgl 物理:重力');
    });
  });

  describe('parsePatchCommands', () => {
    it('正确解析 patch_file 的 old_doc 与 new_doc', () => {
      const input = `
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
const speed = 1.0;
\`\`\`
\`\`\`new_doc
const speed = 2.5;
\`\`\`
`;
      const cmds = parsePatchCommands(input);
      expect(cmds.length).toBe(1);
      expect(cmds[0].action).toBe('patch_file');
      expect(cmds[0].oldDoc).toBe('const speed = 1.0;');
      expect(cmds[0].newDoc).toBe('const speed = 2.5;');
    });

    it('正确解析混合操作（commit + add_tag + set_description）', () => {
      const input = `
\`\`\`act
commit
\`\`\`
\`\`\`
修复内存泄漏
\`\`\`

\`\`\`act
add_tag
\`\`\`
\`\`\`
状态:精选 算法:RK4
\`\`\`

\`\`\`act
set_description
\`\`\`
\`\`\`
全局标本研判：经典粒子系统
\`\`\`
`;
      const cmds = parsePatchCommands(input);
      expect(cmds.length).toBe(3);
      expect(cmds[0].action).toBe('commit');
      expect(cmds[0].commitMessage).toBe('修复内存泄漏');
      expect(cmds[1].action).toBe('add_tag');
      expect(cmds[1].tags).toEqual(['状态:精选', '算法:RK4']);
      expect(cmds[2].action).toBe('set_description');
      expect(cmds[2].description).toBe('全局标本研判：经典粒子系统');
    });
  });

  describe('DarkroomApplier.apply', () => {
    const baseCode = 'function setup() {\n  const speed = 1.0;\n  return speed;\n}';

    it('patch_file：精准替换匹配代码行并保持换行格式', () => {
      const command = {
        action: 'patch_file' as const,
        oldDoc: 'const speed = 1.0;',
        newDoc: 'const speed = 3.0;',
      };

      const result = DarkroomApplier.apply(baseCode, command);
      expect(result).toBe('function setup() {\n  const speed = 3.0;\n  return speed;\n}');
    });

    it('patch_file 冲突防御：当 old_doc 在源码中不匹配时，立即抛出明确异常并阻断', () => {
      const command = {
        action: 'patch_file' as const,
        oldDoc: 'const speed = 999.0;', // 源码中不存在
        newDoc: 'const speed = 2.0;',
      };

      expect(() => {
        DarkroomApplier.apply(baseCode, command, 0);
      }).toThrow(/补丁冲突/);
    });

    it('write_file：全量替换现有源码', () => {
      const command = {
        action: 'write_file' as const,
        oldDoc: '',
        newDoc: 'console.log("rewritten");',
      };

      const result = DarkroomApplier.apply(baseCode, command);
      expect(result).toBe('console.log("rewritten");');
    });
  });

  describe('DarkroomApplier.applyTags', () => {
    it('支持去重添加标签及忽略大小写移除标签', () => {
      const tags = ['形态:webgl', '物理:流体'];

      const added = DarkroomApplier.applyTags(tags, {
        action: 'add_tag',
        oldDoc: '',
        newDoc: '',
        tags: ['形态:webgl', '算法:网格'],
      });
      expect(added).toEqual(['形态:webgl', '物理:流体', '算法:网格']);

      const removed = DarkroomApplier.applyTags(added, {
        action: 'remove_tag',
        oldDoc: '',
        newDoc: '',
        tags: ['形态:WEBGL'],
      });
      expect(removed).toEqual(['物理:流体', '算法:网格']);
    });
  });

  describe('DarkroomApplier.simulate', () => {
    it('执行事务性预演：无指令时抛错阻断，正常时汇总改动标识', () => {
      const baseCode = 'let a = 1;';
      const baseTags = ['形态:canvas'];

      const commands = parsePatchCommands(`
\`\`\`act
commit
\`\`\`
\`\`\`
修改变量初始值
\`\`\`
\`\`\`act
patch_file
\`\`\`
\`\`\`old_doc
let a = 1;
\`\`\`
\`\`\`new_doc
let a = 2;
\`\`\`
\`\`\`act
add_tag
\`\`\`
\`\`\`
状态:已测
\`\`\`
`);

      const simulation = DarkroomApplier.simulate(baseCode, baseTags, undefined, commands);

      expect(simulation.hasCodeChange).toBe(true);
      expect(simulation.nextCode).toBe('let a = 2;');
      expect(simulation.hasCommitChange).toBe(true);
      expect(simulation.nextCommitMessage).toBe('修改变量初始值');
      expect(simulation.hasTagChange).toBe(true);
      expect(simulation.nextTags).toContain('状态:已测');
    });
  });
});
