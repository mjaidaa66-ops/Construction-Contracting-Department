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
    <div className="w-12 h-12 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-center text-[var(--accent-cyan)] shadow-xs">
      {icon || <FolderOpen className="w-5 h-5" />}
    </div>
    <div className="space-y-1 max-w-sm">
      <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
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
  <div className="p-5 rounded-2xl border border-[#FF405C]/35 bg-[#FF405C]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-[#FF405C] shrink-0 mt-0.5" />
      <div className="space-y-1 text-xs">
        <div className="font-bold text-rose-600 dark:text-[#FF405C]">{title}</div>
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
  <div className={`bunyan-skeleton rounded-lg ${className}`} aria-hidden="true" />
);

export const LoadingSkeleton = SkeletonBlock;

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_BADGE: Record<StatusTone, string> = {
  success:
    'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  warning:
    'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
  danger:
    'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/25',
  info:
    'text-sky-700 dark:text-sky-400 bg-sky-500/10 border-sky-500/25',
  neutral:
    'text-[var(--text-secondary)] bg-[var(--bg-surface-subtle)] border-[var(--border-hairline)]',
};

const TONE_DOT: Record<StatusTone, string> = {
  success: 'bg-emerald-600 dark:bg-emerald-400',
  warning: 'bg-amber-600 dark:bg-amber-400',
  danger: 'bg-rose-600 dark:bg-rose-400',
  info: 'bg-sky-600 dark:bg-sky-400',
  neutral: 'bg-slate-400',
};

export const StatusIndicator: React.FC<{
  tone: StatusTone;
  label: string;
  className?: string;
}> = ({ tone, label, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${TONE_BADGE[tone]} ${className}`}
  >
    <span className={`w-1.5 h-1.5 rounded-xs shrink-0 ${TONE_DOT[tone]}`} aria-hidden="true" />
    <span>{label}</span>
  </span>
);

export const StatusBadge = StatusIndicator;
