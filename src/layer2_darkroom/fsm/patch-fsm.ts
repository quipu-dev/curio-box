import type { PatchAction, PatchCommand } from '@/types';

interface FenceDelimiter {
  char: '`' | '~';
  length: number;
}

enum FSMState {
  SEEKING_ACT = 0,
  IN_ACT = 1,
  SEEKING_OLD_DOC = 2,
  IN_OLD_DOC = 3,
  SEEKING_NEW_DOC = 4,
  IN_NEW_DOC = 5,
  SEEKING_TAG = 6,
  IN_TAG = 7,
}

export class DarkroomPatchFSM {
  private state: FSMState = FSMState.SEEKING_ACT;
  private currentFence: FenceDelimiter | null = null;
  private bufferAction = '';
  private bufferOldDoc: string[] = [];
  private bufferNewDoc: string[] = [];
  private commands: PatchCommand[] = [];

  private readonly fenceOpenRegex = /^(`{3,}|~{3,})\s*([a-zA-Z0-9_-]*)\s*$/;

  public parse(input: string): PatchCommand[] {
    this.reset();
    const lines = input.split(/\r?\n/);
    for (const line of lines) {
      this.consumeLine(line);
    }
    return this.commands;
  }

  public reset(): void {
    this.state = FSMState.SEEKING_ACT;
    this.currentFence = null;
    this.bufferAction = '';
    this.bufferOldDoc = [];
    this.bufferNewDoc = [];
    this.commands = [];
  }

  private consumeLine(line: string): void {
    switch (this.state) {
      case FSMState.SEEKING_ACT: {
        const match = line.match(this.fenceOpenRegex);
        if (match && match[2].trim() === 'act') {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_ACT;
          this.bufferAction = '';
        }
        break;
      }

      case FSMState.IN_ACT: {
        if (this.isMatchingClosingFence(line)) {
          const act = this.bufferAction.trim();
          if (act === 'add_tag' || act === 'remove_tag') {
            this.state = FSMState.SEEKING_TAG;
          } else {
            this.state = FSMState.SEEKING_OLD_DOC;
          }
          this.currentFence = null;
        } else {
          this.bufferAction += line.trim();
        }
        break;
      }

      case FSMState.SEEKING_TAG: {
        const match = line.match(this.fenceOpenRegex);
        if (
          match &&
          (match[2].trim() === 'tag' || match[2].trim() === 'tags' || match[2].trim() === 'text')
        ) {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_TAG;
          this.bufferNewDoc = [];
        }
        break;
      }

      case FSMState.IN_TAG: {
        if (this.isMatchingClosingFence(line)) {
          this.emitCommand();
          this.state = FSMState.SEEKING_ACT;
          this.currentFence = null;
        } else {
          this.bufferNewDoc.push(line);
        }
        break;
      }

      case FSMState.SEEKING_OLD_DOC: {
        const match = line.match(this.fenceOpenRegex);
        if (match && match[2].trim() === 'old_doc') {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_OLD_DOC;
          this.bufferOldDoc = [];
        }
        break;
      }

      case FSMState.IN_OLD_DOC: {
        if (this.isMatchingClosingFence(line)) {
          this.state = FSMState.SEEKING_NEW_DOC;
          this.currentFence = null;
        } else {
          this.bufferOldDoc.push(line);
        }
        break;
      }

      case FSMState.SEEKING_NEW_DOC: {
        const match = line.match(this.fenceOpenRegex);
        if (match && match[2].trim() === 'new_doc') {
          this.currentFence = this.extractFence(match[1]);
          this.state = FSMState.IN_NEW_DOC;
          this.bufferNewDoc = [];
        }
        break;
      }

      case FSMState.IN_NEW_DOC: {
        if (this.isMatchingClosingFence(line)) {
          this.emitCommand();
          this.state = FSMState.SEEKING_ACT;
          this.currentFence = null;
        } else {
          this.bufferNewDoc.push(line);
        }
        break;
      }
    }
  }

  private extractFence(rawFence: string): FenceDelimiter {
    return {
      char: rawFence[0] as '`' | '~',
      length: rawFence.length,
    };
  }

  private isMatchingClosingFence(line: string): boolean {
    if (!this.currentFence) return false;
    const trimmed = line.trim();
    if (trimmed.length < this.currentFence.length) return false;

    const expectedChar = this.currentFence.char;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] !== expectedChar) return false;
    }
    return true;
  }

  private emitCommand(): void {
    const rawAction = this.bufferAction.trim();
    if (
      rawAction !== 'patch_file' &&
      rawAction !== 'write_file' &&
      rawAction !== 'add_tag' &&
      rawAction !== 'remove_tag'
    ) {
      return;
    }

    if (rawAction === 'add_tag' || rawAction === 'remove_tag') {
      const parsedTags = this.bufferNewDoc
        .join(' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);

      this.commands.push({
        action: rawAction as PatchAction,
        oldDoc: '',
        newDoc: this.bufferNewDoc.join('\n'),
        tags: parsedTags,
      });
      return;
    }

    this.commands.push({
      action: rawAction as PatchAction,
      oldDoc: this.bufferOldDoc.join('\n'),
      newDoc: this.bufferNewDoc.join('\n'),
    });
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
