import { computeLineDiff } from '@/layer2_darkroom/engine/diff-engine';
import type { PatchSimulationResult } from '@/layer2_darkroom/fsm/patch-fsm';
import {
  CheckCircle2,
  Code2,
  FileDiff,
  GitCommit,
  Loader2,
  MessageSquareQuote,
  Plus,
  Save,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';

interface DarkroomDiffModalProps {
  originalCode: string;
  originalTags: string[];
  originalDescription?: string;
  targetRevision: number;
  simulation: PatchSimulationResult;
  isCommitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DarkroomDiffModal: React.FC<DarkroomDiffModalProps> = ({
  originalCode,
  originalTags,
  targetRevision,
  simulation,
  isCommitting,
  onConfirm,
  onCancel,
}) => {
  const [activeView, setActiveView] = useState<'diff' | 'raw_new'>('diff');

  const diffResult = useMemo(() => {
    if (!simulation.hasCodeChange) return null;
    return computeLineDiff(originalCode, simulation.nextCode);
  }, [originalCode, simulation.nextCode, simulation.hasCodeChange]);

  const tagChanges = useMemo(() => {
    const origSet = new Set(originalTags);
    const nextSet = new Set(simulation.nextTags);

    const added = simulation.nextTags.filter((t) => !origSet.has(t));
    const removed = originalTags.filter((t) => !nextSet.has(t));

    return { added, removed };
  }, [originalTags, simulation.nextTags]);

  return (
    <div className="fixed inset-0 z-50 bg-surface-overlay flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in">
      <div className="w-full max-w-5xl h-[90vh] bg-surface border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden text-main">
        {/* 顶部标题栏 */}
        <header className="h-14 bg-background border-b border-border px-4 md:px-6 flex justify-between items-center gap-4 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-status-info-bg border border-status-info-border text-status-info rounded">
              <FileDiff className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-sm font-sans tracking-wide flex items-center gap-2">
                <span>暗房指令审查 (Diff Review)</span>
                <span className="text-xs font-mono bg-status-info-bg text-status-info px-1.5 py-0.5 rounded border border-status-info-border">
                  即将跃迁至 REV:{targetRevision}
                </span>
              </div>
              <div className="text-[11px] text-muted">
                已通过内存沙箱预演。请核验指令拟执行的变动，确认无误后提交落盘。
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isCommitting}
              onClick={onCancel}
              className="px-3 py-1.5 border border-border rounded hover:bg-surface transition-colors text-muted hover:text-main text-xs disabled:opacity-50"
            >
              放弃并返回
            </button>

            <button
              type="button"
              disabled={isCommitting}
              onClick={onConfirm}
              className="flex items-center gap-1.5 bg-main text-surface px-4 py-1.5 rounded font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在提交落盘...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>确认应用并提交 (REV:{targetRevision})</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isCommitting}
              onClick={onCancel}
              className="p-1.5 text-muted hover:text-main rounded hover:bg-border transition-colors ml-1 disabled:opacity-50"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 统计指标栏 */}
        <div className="bg-background/80 border-b border-border px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-zinc-400">
              已预演指令: {simulation.executedCommands.length} 条
            </span>
            <div className="h-3 w-px bg-border" />
            {simulation.hasCodeChange ? (
              <span className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-status-info" />
                <span className="text-status-success">+{diffResult?.additions || 0} 行</span>
                <span className="text-status-error">-{diffResult?.deletions || 0} 行</span>
              </span>
            ) : (
              <span className="text-muted">代码无改动</span>
            )}
            {simulation.hasTagChange && (
              <>
                <div className="h-3 w-px bg-border" />
                <span className="text-status-warn flex items-center gap-1">
                  <TagIcon className="w-3 h-3" />
                  <span>标签变动</span>
                </span>
              </>
            )}
            {simulation.hasDescChange && (
              <>
                <div className="h-3 w-px bg-border" />
                <span className="text-purple-400 flex items-center gap-1">
                  <MessageSquareQuote className="w-3 h-3" />
                  <span>备忘已更新</span>
                </span>
              </>
            )}
            {simulation.hasCommitChange && (
              <>
                <div className="h-3 w-px bg-border" />
                <span className="text-status-success flex items-center gap-1">
                  <GitCommit className="w-3 h-3" />
                  <span>包含提交说明</span>
                </span>
              </>
            )}
          </div>

          {simulation.hasCodeChange && (
            <div className="flex items-center border border-border rounded overflow-hidden text-[11px]">
              <button
                type="button"
                onClick={() => setActiveView('diff')}
                className={`px-2.5 py-1 transition-colors ${
                  activeView === 'diff'
                    ? 'bg-accent text-accent-text font-semibold'
                    : 'text-muted hover:text-main'
                }`}
              >
                增删 Diff 对比
              </button>
              <button
                type="button"
                onClick={() => setActiveView('raw_new')}
                className={`px-2.5 py-1 transition-colors ${
                  activeView === 'raw_new'
                    ? 'bg-accent text-accent-text font-semibold'
                    : 'text-muted hover:text-main'
                }`}
              >
                最终代码全貌
              </button>
            </div>
          )}
        </div>

        {/* 差异详情主体 */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-4 md:p-6 font-mono text-xs">
          {/* 提交说明卡片 (Commit Message) */}
          {simulation.hasCommitChange && simulation.nextCommitMessage && (
            <div className="bg-background border border-status-success-border rounded p-3 flex flex-col gap-1.5 shrink-0">
              <div className="text-[10px] uppercase text-status-success tracking-wider flex items-center gap-1">
                <GitCommit className="w-3.5 h-3.5 text-status-success" />
                <span>本次变更提交说明 (Commit Message)</span>
              </div>
              <div className="text-xs font-sans text-zinc-200 leading-relaxed bg-surface/80 p-2.5 rounded border border-border whitespace-pre-wrap select-text">
                {simulation.nextCommitMessage}
              </div>
            </div>
          )}

          {/* 元数据差异展示 */}
          {(simulation.hasTagChange || simulation.hasDescChange) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
              {simulation.hasTagChange && (
                <div className="bg-background border border-border rounded p-3 flex flex-col gap-2">
                  <div className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1">
                    <TagIcon className="w-3 h-3 text-status-warn" />
                    <span>标签变动明细</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {tagChanges.added.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 bg-status-success-bg border border-status-success-border text-status-success px-2 py-0.5 rounded text-[11px]"
                      >
                        <Plus className="w-3 h-3 text-status-success" />
                        <span>{t}</span>
                      </span>
                    ))}
                    {tagChanges.removed.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 bg-status-error-bg border border-status-error-border text-status-error px-2 py-0.5 rounded text-[11px] line-through"
                      >
                        <X className="w-3 h-3 text-status-error" />
                        <span>{t}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {simulation.hasDescChange && (
                <div className="bg-background border border-border rounded p-3 flex flex-col gap-2">
                  <div className="text-[10px] uppercase text-muted tracking-wider flex items-center gap-1">
                    <MessageSquareQuote className="w-3 h-3 text-purple-400" />
                    <span>研判备忘更新</span>
                  </div>
                  <div className="text-[11px] font-sans leading-relaxed text-zinc-300 bg-surface p-2 rounded border border-border whitespace-pre-wrap">
                    {simulation.nextDescription || (
                      <span className="text-muted italic">（清空备忘）</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 源码差异展示 */}
          {simulation.hasCodeChange ? (
            <div className="border border-border rounded overflow-hidden flex-1 flex flex-col bg-code min-h-[350px]">
              {activeView === 'diff' ? (
                <div className="overflow-x-auto flex-1 p-2 font-mono text-[11px] leading-relaxed">
                  {diffResult?.lines.map((line, index) => {
                    const isAdd = line.type === 'add';
                    const isDel = line.type === 'delete';
                    const lineKey = `${line.type}_${line.oldLineNumber || 0}_${line.newLineNumber || 0}_${index}`;
                    return (
                      <div
                        key={lineKey}
                        className={`flex items-start px-2 py-0.5 rounded-sm select-text ${
                          isAdd
                            ? 'bg-status-success-bg text-status-success'
                            : isDel
                              ? 'bg-status-error-bg text-status-error line-through'
                              : 'text-zinc-400 hover:bg-zinc-900/60'
                        }`}
                      >
                        <span className="w-10 shrink-0 text-zinc-600 select-none text-right pr-2">
                          {line.oldLineNumber || ''}
                        </span>
                        <span className="w-10 shrink-0 text-zinc-600 select-none text-right pr-2">
                          {line.newLineNumber || ''}
                        </span>
                        <span className="w-4 shrink-0 select-none font-bold">
                          {isAdd ? '+' : isDel ? '-' : ' '}
                        </span>
                        <span className="whitespace-pre font-mono flex-1">
                          {line.content || ' '}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  readOnly
                  value={simulation.nextCode}
                  className="w-full flex-1 p-3 bg-transparent text-zinc-300 font-mono text-[11px] outline-none resize-none leading-relaxed select-text"
                />
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed border-border rounded flex flex-col items-center justify-center text-muted gap-2">
              <CheckCircle2 className="w-8 h-8 text-status-info" />
              <span>本次指令不包含 HTML 源码修改，仅更新元数据</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
