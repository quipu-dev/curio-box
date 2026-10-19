import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type React from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type ToastType = 'info' | 'success' | 'warn' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  toast: {
    info: (message: string, duration?: number) => void;
    success: (message: string, duration?: number) => void;
    warn: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 3000) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const newItem: ToastItem = { id, message, type, duration };

      setToasts((prev) => [...prev, newItem]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const toastHelpers = useMemo(
    () => ({
      info: (msg: string, d?: number) => showToast(msg, 'info', d),
      success: (msg: string, d?: number) => showToast(msg, 'success', d),
      warn: (msg: string, d?: number) => showToast(msg, 'warn', d),
      error: (msg: string, d?: number) => showToast(msg, 'error', d),
    }),
    [showToast],
  );

  const contextValue = useMemo(
    () => ({
      showToast,
      toast: toastHelpers,
    }),
    [showToast, toastHelpers],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* 脱离文档流的右下角悬浮 Toast 视口 */}
      <div
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-lg border border-border shadow-xl text-xs font-mono transition-all animate-in fade-in slide-in-from-bottom-2 bg-surface ${
              item.type === 'success'
                ? 'border-status-success-border text-status-success'
                : item.type === 'error'
                  ? 'border-status-error-border text-status-error'
                  : item.type === 'warn'
                    ? 'border-status-warn-border text-status-warn'
                    : 'border-border text-main'
            }`}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {item.type === 'success' && (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-status-success" />
              )}
              {item.type === 'error' && <XCircle className="w-4 h-4 shrink-0 text-status-error" />}
              {item.type === 'warn' && (
                <AlertCircle className="w-4 h-4 shrink-0 text-status-warn" />
              )}
              {item.type === 'info' && <Info className="w-4 h-4 shrink-0 text-status-info" />}
              <span className="truncate">{item.message}</span>
            </div>

            <button
              type="button"
              onClick={() => removeToast(item.id)}
              className="p-1 text-muted hover:text-main rounded hover:bg-surface-subtle transition-colors shrink-0"
              title="关闭通知"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
