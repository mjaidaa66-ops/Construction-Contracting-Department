import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  pushToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 end-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-elevated)] shadow-lg text-xs font-medium text-[var(--text-primary)]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : t.tone === 'error' || t.tone === 'warning' ? (
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-[#B4863C] shrink-0" />
              )}
              <span className="truncate">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
