import React from 'react';
import { Cloud, CloudOff, Loader2, RefreshCw } from 'lucide-react';
import type { CloudSyncState } from '../../services/cloudSyncService';
import type { Language } from '../../types/bunyan';

export interface CloudSyncStatusBadgeProps {
  syncState: CloudSyncState;
  lang: Language;
  onSyncNow: () => void;
}

function formatSyncTime(iso: string | null, lang: Language): string {
  if (!iso) return lang === 'ar' ? 'محلي' : 'Local';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-AE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const CloudSyncStatusBadge: React.FC<CloudSyncStatusBadgeProps> = ({
  syncState,
  lang,
  onSyncNow,
}) => {
  const isAr = lang === 'ar';
  const isSynced = syncState.status === 'synced' && syncState.isOnline && syncState.isAuthenticated;
  const isSyncing = syncState.status === 'syncing';
  const timeLabel = formatSyncTime(syncState.lastSyncedAt, lang);

  const statusText = isSyncing
    ? isAr
      ? 'جاري المزامنة...'
      : 'Syncing...'
    : isSynced
    ? isAr
      ? 'متزامن سحابياً'
      : 'Cloud Synced'
    : !syncState.isOnline
    ? isAr
      ? 'غير متصل'
      : 'Offline'
    : isAr
    ? 'محفوظ محلياً'
    : 'Cached';

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-1 text-xs"
      title={
        syncState.lastError
          ? syncState.lastError
          : isAr
          ? 'حالة المزامنة الفورية مع Firebase Firestore والتخزين دون إنترنت'
          : 'Firebase Firestore Real-Time Sync & Offline Persistence Status'
      }
    >
      <div className="inline-flex items-center gap-1.5 px-2 py-0.5">
        {isSyncing ? (
          <Loader2 className="w-3.5 h-3.5 text-[#B4863C] animate-spin shrink-0" />
        ) : isSynced ? (
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
        ) : (
          <CloudOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}

        <span
          className={`text-[11px] font-semibold whitespace-nowrap ${
            isSyncing
              ? 'text-[#B4863C] dark:text-[#C99A49]'
              : isSynced
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          {statusText}
        </span>

        {syncState.lastSyncedAt && !isSyncing && (
          <span
            dir="ltr"
            className="hidden 2xl:inline-block font-mono tabular-nums text-[10px] text-[var(--text-muted)]"
          >
            {timeLabel}
          </span>
        )}

        {syncState.pendingCount > 0 && !isSynced && (
          <span
            dir="ltr"
            className="font-mono tabular-nums text-[10px] font-bold text-[#B4863C] dark:text-[#C99A49]"
          >
            ({syncState.pendingCount})
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={onSyncNow}
        disabled={isSyncing}
        aria-label={isAr ? 'مزامنة يدوية الآن' : 'Sync Now'}
        className="inline-flex items-center gap-1 rounded-md bg-[#B4863C] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#9E7330] disabled:opacity-60 bunyan-transition whitespace-nowrap shrink-0 cursor-pointer"
      >
        {isSyncing ? (
          <Cloud className="w-3 h-3 shrink-0" />
        ) : (
          <RefreshCw className="w-3 h-3 shrink-0" />
        )}
        <span className="hidden lg:inline">{isAr ? 'مزامنة' : 'Sync'}</span>
      </button>
    </div>
  );
};
