import React from 'react';
import { AlertCircle, FolderOpen } from 'lucide-react';
import { Button } from './Button';

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-3">
    <div className="w-11 h-11 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-center text-[#B4863C]">
      {icon || <FolderOpen className="w-5 h-5" />}
    </div>
    <div className="space-y-1 max-w-sm">
      <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{description}</p>
    </div>
    {actionLabel && onAction && (
      <Button size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);

export const ErrorState: React.FC<{
  title: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}> = ({ title, message, retryLabel, onRetry }) => (
  <div className="p-5 rounded-xl border border-rose-500/30 bg-rose-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
      <div className="space-y-1 text-xs">
        <div className="font-bold text-rose-600 dark:text-rose-400">{title}</div>
        <p className="text-[var(--text-secondary)]">{message}</p>
      </div>
    </div>
    {retryLabel && onRetry && (
      <Button variant="danger" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    )}
  </div>
);

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`bunyan-skeleton rounded-md ${className}`} aria-hidden="true" />
);

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-rose-600 dark:text-rose-400',
  info: 'text-sky-600 dark:text-sky-400',
  neutral: 'text-[var(--text-muted)]',
};

const TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-slate-400',
};

export const StatusIndicator: React.FC<{
  tone: StatusTone;
  label: string;
  className?: string;
}> = ({ tone, label, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${TONE_TEXT[tone]} ${className}`}>
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} aria-hidden="true" />
    <span>{label}</span>
  </span>
);
