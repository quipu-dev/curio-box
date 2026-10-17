import type { NegativeLedgerEntry } from '@/types';
import { Eye, Undo2 } from 'lucide-react';
import type React from 'react';

interface DarkroomHistoryTabProps {
  currentRevision: number;
  lastUpdatedAt: string;
  historyLedger: NegativeLedgerEntry[];
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
        点击 <span className="text-sky-400 font-semibold">检视 (Checkout)</span>{' '}
        可在沙箱中只读预览历史版本；点击 <span className="text-amber-400 font-semibold">还原</span>{' '}
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
                className={`p-2.5 rounded border text-xs flex items-center justify-between transition-colors ${
                  isCurrentlyViewing
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-background border-border text-zinc-300'
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono">REV:{item.revision}</span>
                    {item.action === 'genesis' && (
                      <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.2 rounded border border-sky-500/30">
                        初始版本
                      </span>
                    )}
                    {item.action === 'rollback' && (
                      <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.2 rounded border border-purple-500/30">
                        还原版本
                      </span>
                    )}
                    {isPhysicalHead && (
                      <span className="text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.2 rounded">
                        HEAD
                      </span>
                    )}
                    {isCurrentlyViewing && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded">
                        当前预览
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted truncate max-w-[210px]">
                    {item.description || new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onCheckoutRevision(item.revision)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors border ${
                      viewingRevision === item.revision
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'border-border text-muted hover:text-main hover:bg-border'
                    }`}
                    title="在沙箱中只读预览该版本"
                  >
                    <Eye className="w-3 h-3 text-sky-400" />
                    <span>{viewingRevision === item.revision ? '预览中' : '检视'}</span>
                  </button>

                  {!isPhysicalHead && (
                    <button
                      type="button"
                      onClick={() => onRestoreRevision(item.revision)}
                      className="flex items-center gap-1 border border-border px-2 py-1 rounded hover:bg-border text-[11px] text-main"
                      title={`基于 REV:${item.revision} 跃迁生成新 Revision`}
                    >
                      <Undo2 className="w-3 h-3 text-amber-400" />
                      <span>还原</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
