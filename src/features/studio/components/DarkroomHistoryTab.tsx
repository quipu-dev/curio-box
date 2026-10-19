import type { CommitLogEntry } from '@/types';
import { Eye, GitCommit, Undo2 } from 'lucide-react';
import type React from 'react';

interface DarkroomHistoryTabProps {
  currentRevision: number;
  lastUpdatedAt: string;
  historyLedger: CommitLogEntry[];
  viewingRevision: number | null;
  onCheckoutRevision: (rev: number) => void;
  onRestoreRevision: (rev: number) => void;
}

export const DarkroomHistoryTab: React.FC<DarkroomHistoryTabProps> = ({
  currentRevision,
  lastUpdatedAt,
  historyLedger,
  viewingRevision,
  onCheckoutRevision,
  onRestoreRevision,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-background border border-border p-3 rounded">
        <div className="text-[10px] uppercase text-muted tracking-wider mb-1">
          当前最新版本 (HEAD)
        </div>
        <div className="text-sm font-bold text-main">REV:{currentRevision}</div>
        <div className="text-[11px] text-muted mt-1">
          最后更新：{new Date(lastUpdatedAt).toLocaleString()}
        </div>
      </div>

      <div className="text-muted text-[11px] leading-relaxed">
        点击 <span className="text-status-info font-semibold">检视 (Checkout)</span>{' '}
        可在沙箱中只读预览历史版本；点击{' '}
        <span className="text-status-warn font-semibold">还原</span>{' '}
        可将历史版本内容作为新版本提交。
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <div className="text-[10px] uppercase text-muted tracking-wider">
          版本快照记录（{historyLedger.length} 个记录）
        </div>

        <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
          {historyLedger.map((item) => {
            const isPhysicalHead = item.revision === currentRevision;
            const isCurrentlyViewing =
              viewingRevision === item.revision || (viewingRevision === null && isPhysicalHead);

            return (
              <div
                key={item.revision}
                className={`p-3 rounded border text-xs flex flex-col gap-2 transition-colors ${
                  isCurrentlyViewing
                    ? 'bg-status-warn-bg border-status-warn-border text-status-warn'
                    : 'bg-background border-border text-main'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold font-mono">REV:{item.revision}</span>
                    {item.action === 'genesis' && (
                      <span className="text-[10px] bg-status-info-bg text-status-info px-1.5 py-0.2 rounded border border-status-info-border">
                        初始版本
                      </span>
                    )}
                    {item.action === 'rollback' && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/30">
                        还原版本
                      </span>
                    )}
                    {isPhysicalHead && (
                      <span className="text-[10px] bg-surface-subtle text-main border border-border px-1.5 py-0.2 rounded">
                        HEAD
                      </span>
                    )}
                    {isCurrentlyViewing && (
                      <span className="text-[10px] bg-status-warn-bg text-status-warn px-1.5 py-0.2 rounded">
                        当前预览
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onCheckoutRevision(item.revision)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors border ${
                        viewingRevision === item.revision
                          ? 'bg-status-warn-bg text-status-warn border-status-warn-border'
                          : 'border-border text-muted hover:text-main hover:bg-surface-subtle'
                      }`}
                      title="在沙箱中只读预览该版本"
                    >
                      <Eye className="w-3 h-3 text-status-info" />
                      <span>{viewingRevision === item.revision ? '预览中' : '检视'}</span>
                    </button>

                    {!isPhysicalHead && (
                      <button
                        type="button"
                        onClick={() => onRestoreRevision(item.revision)}
                        className="flex items-center gap-1 border border-border px-2 py-1 rounded hover:bg-surface-subtle text-[11px] text-main"
                        title={`基于 REV:${item.revision} 跃迁生成新 Revision`}
                      >
                        <Undo2 className="w-3 h-3 text-status-warn" />
                        <span>还原</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Commit 提交日志说明与时间 */}
                <div className="flex flex-col gap-1 text-[11px] font-sans bg-surface p-2 rounded border border-border">
                  <div className="flex items-start gap-1 text-main leading-relaxed select-text">
                    <GitCommit className="w-3.5 h-3.5 text-status-info shrink-0 mt-0.5" />
                    <span className="break-words font-medium">
                      {item.message || (item.action === 'genesis' ? '初始版本' : '无详细说明')}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-muted pl-4.5">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
