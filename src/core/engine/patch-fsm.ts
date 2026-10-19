import type { PatchAction, PatchCommand } from '@/types';

export interface Statement {
  act: string;
  contexts: string[];
}

export interface PatchSimulationResult {
  nextCode: string;
  nextTags: string[];
  nextDescription?: string;
  nextCommitMessage?: string;
  hasCodeChange: boolean;
  hasTagChange: boolean;
  hasDescChange: boolean;
  hasCommitChange: boolean;
  executedCommands: PatchCommand[];
}

/**
 * 遵循 Quipu 规范的通用代码块解析器
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
 * 暗房指令调度器
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
      } else if (action === 'commit') {
        commands.push({
          action,
          oldDoc: '',
          newDoc: '',
          commitMessage: stmt.contexts.join('\n').trim(),
        });
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
  apply(sourceCode: string, command: PatchCommand, index = 0): string {
    if (command.action === 'write_file') {
      if (!command.newDoc || !command.newDoc.trim()) {
        throw new Error(
          `【指令 #${index + 1} write_file 失败】未能解析到待写入的代码内容，请检查代码围栏。`,
        );
      }
      return command.newDoc;
    }

    if (command.action === 'patch_file') {
      const normalizedSource = sourceCode.replace(/\r\n/g, '\n');
      const normalizedOld = command.oldDoc.replace(/\r\n/g, '\n');
      const normalizedNew = command.newDoc.replace(/\r\n/g, '\n');

      if (!normalizedOld) {
        throw new Error(`【指令 #${index + 1} patch_file 失败】未提供需要替换的 old_doc 片段。`);
      }

      if (!normalizedSource.includes(normalizedOld)) {
        const snippet = normalizedOld.slice(0, 48).replace(/\n/g, '↵');
        throw new Error(
          `【指令 #${index + 1} 补丁冲突】源码中未匹配到 old_doc：“${snippet}${normalizedOld.length > 48 ? '...' : ''}”。请核对代码行是否已被修改。`,
        );
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

  /**
   * 事务性沙箱预演模拟：必须全量无冲突通过，否则立即阻断抛错
   */
  simulate(
    baseCode: string,
    baseTags: string[],
    baseDescription: string | undefined,
    commands: PatchCommand[],
  ): PatchSimulationResult {
    if (commands.length === 0) {
      throw new Error('未识别到有效的指令块。请确认围栏语法是否符合规范（包含 ```act 指令）。');
    }

    let tempCode = baseCode;
    let tempTags = [...baseTags];
    let tempDesc = baseDescription;
    let tempCommitMessage: string | undefined;

    let hasCodeChange = false;
    let hasTagChange = false;
    let hasDescChange = false;
    let hasCommitChange = false;

    for (let idx = 0; idx < commands.length; idx++) {
      const cmd = commands[idx];
      if (cmd.action === 'patch_file' || cmd.action === 'write_file') {
        tempCode = this.apply(tempCode, cmd, idx);
        hasCodeChange = true;
      } else if (cmd.action === 'add_tag' || cmd.action === 'remove_tag') {
        const nextTags = this.applyTags(tempTags, cmd);
        if (JSON.stringify(nextTags) !== JSON.stringify(tempTags)) {
          tempTags = nextTags;
          hasTagChange = true;
        }
      } else if (cmd.action === 'set_description') {
        tempDesc = cmd.description ?? '';
        hasDescChange = true;
      } else if (cmd.action === 'commit') {
        tempCommitMessage = cmd.commitMessage ?? '';
        hasCommitChange = true;
      }
    }

    return {
      nextCode: tempCode,
      nextTags: tempTags,
      nextDescription: tempDesc,
      nextCommitMessage: tempCommitMessage,
      hasCodeChange,
      hasTagChange,
      hasDescChange,
      hasCommitChange,
      executedCommands: commands,
    };
  },
};
