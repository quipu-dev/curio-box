import type { PatchAction, PatchCommand } from '@/types';

export interface Statement {
  act: string;
  contexts: string[];
}

/**
 * 遵循 Quipu 规范的通用代码块解析器：
 * 1. 任何带有 act 标识的围栏作为新指令语句起点。
 * 2. 随后的任意代码块（无论是否带语言标签）均作为该指令的 contexts 参数收集。
 * 3. 严格开闭围栏对称匹配，支持 ``` 与 ~~~。
 */
export class StateBlockParser {
  private readonly fenceStartRegex = /^(`{3,}|~{3,})(.*)$/;

  public parse(text: string): Statement[] {
    const statements: Statement[] = [];
    let currentStatement: Statement | null = null;

    const lines = text.split(/\r?\n/);
    let inBlock = false;
    let currentFence = '';
    let currentLang = '';
    let blockLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!inBlock) {
        const match = trimmedLine.match(this.fenceStartRegex);
        if (match) {
          inBlock = true;
          currentFence = match[1];
          currentLang = match[2].trim().toLowerCase();
          blockLines = [];
        }
      } else {
        if (trimmedLine === currentFence) {
          inBlock = false;
          let fullContent = blockLines.join('\n');
          // 仿照 Quipu 统一剔除尾部单个多余换行符
          if (fullContent.endsWith('\n')) {
            fullContent = fullContent.slice(0, -1);
          }

          if (currentLang === 'act') {
            const actionName = fullContent.trim();
            currentStatement = { act: actionName, contexts: [] };
            statements.push(currentStatement);
          } else if (currentStatement) {
            currentStatement.contexts.push(fullContent);
          }

          currentFence = '';
          currentLang = '';
          blockLines = [];
        } else {
          blockLines.push(line);
        }
      }
    }

    return statements;
  }
}

/**
 * 暗房指令调度器：将通用的 Statement 序列映射为工件系统能够执行的 PatchCommand
 */
export class DarkroomPatchFSM {
  private parser = new StateBlockParser();

  public parse(input: string): PatchCommand[] {
    const statements = this.parser.parse(input);
    const commands: PatchCommand[] = [];

    for (const stmt of statements) {
      const rawAct = stmt.act.trim();
      const tokens = rawAct.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;

      const action = tokens[0] as PatchAction;

      if (action === 'add_tag' || action === 'remove_tag') {
        // 允许从 act 行内（如 add_tag tag1）或后续 contexts 块中提取标签
        const tagTokens: string[] = tokens.slice(1);
        for (const ctx of stmt.contexts) {
          tagTokens.push(...ctx.trim().split(/\s+/).filter(Boolean));
        }

        if (tagTokens.length > 0) {
          commands.push({
            action,
            oldDoc: '',
            newDoc: stmt.contexts.join('\n'),
            tags: tagTokens,
          });
        }
      } else if (action === 'set_description') {
        commands.push({
          action,
          oldDoc: '',
          newDoc: '',
          description: stmt.contexts.join('\n').trim(),
        });
      } else if (action === 'write_file') {
        commands.push({
          action,
          oldDoc: '',
          newDoc: stmt.contexts[0] || '',
        });
      } else if (action === 'patch_file') {
        commands.push({
          action,
          oldDoc: stmt.contexts[0] || '',
          newDoc: stmt.contexts[1] || '',
        });
      }
    }

    return commands;
  }
}

export const DarkroomApplier = {
  apply(sourceCode: string, command: PatchCommand): string {
    if (command.action === 'write_file') {
      return command.newDoc;
    }

    if (command.action === 'patch_file') {
      const normalizedSource = sourceCode.replace(/\r\n/g, '\n');
      const normalizedOld = command.oldDoc.replace(/\r\n/g, '\n');
      const normalizedNew = command.newDoc.replace(/\r\n/g, '\n');

      if (!normalizedSource.includes(normalizedOld)) {
        throw new Error('【补丁冲突】目标代码未匹配到 old_doc 指定的内容，无法应用补丁。');
      }

      return normalizedSource.replace(normalizedOld, normalizedNew);
    }

    return sourceCode;
  },

  applyTags(currentTags: string[], command: PatchCommand): string[] {
    if (!command.tags || command.tags.length === 0) return currentTags;

    if (command.action === 'add_tag') {
      const set = new Set(currentTags);
      for (const t of command.tags) {
        set.add(t);
      }
      return Array.from(set);
    }

    if (command.action === 'remove_tag') {
      const removeSet = new Set(command.tags.map((t) => t.toLowerCase()));
      return currentTags.filter((t) => !removeSet.has(t.toLowerCase()));
    }

    return currentTags;
  },
};
