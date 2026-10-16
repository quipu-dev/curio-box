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
          this.state = FSMState.SEEKING_OLD_DOC;
          this.currentFence = null;
        } else {
          this.bufferAction += line.trim();
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
    if (rawAction !== 'patch_file' && rawAction !== 'write_file') {
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
        throw new Error('【暗房冲突】目标底片未匹配到 old_doc 指定的内容，拒绝应用补丁。');
      }

      return normalizedSource.replace(normalizedOld, normalizedNew);
    }

    return sourceCode;
  },
};
