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
  if (!iso) return lang === 'ar' ? 'جاهز محلياً' : 'Local Cache';
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
      ? 'غير متصل · محفوظ محلياً'
      : 'Offline Cached'
    : isAr
    ? 'محفوظ محلياً'
    : 'Offline Cached';

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-lg border border-[#B4863C]/40 bg-slate-100/95 dark:bg-[#111A2C] px-2 py-1 text-xs shadow-sm"
      title={
        syncState.lastError
          ? syncState.lastError
          : isAr
          ? 'حالة المزامنة الفورية مع Firebase Firestore والتخزين دون إنترنت'
          : 'Firebase Firestore Real-Time Sync & Offline Persistence Status'
      }
    >
      {/* Status Indicator */}
      <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5">
        {isSyncing ? (
          <Loader2 className="w-3.5 h-3.5 text-[#D4AF37] animate-spin shrink-0" />
        ) : isSynced ? (
          <span
            className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <CloudOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        )}

        <span
          className={`font-semibold whitespace-nowrap ${
            isSyncing
              ? 'text-[#B4863C] dark:text-[#D4AF37]'
              : isSynced
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-amber-700 dark:text-amber-400'
          }`}
        >
          {statusText}
        </span>

        {syncState.lastSyncedAt && !isSyncing && (
          <span
            dir="ltr"
            className="hidden xl:inline-block font-mono tabular-nums text-[10.5px] text-slate-500 dark:text-slate-400"
          >
            {timeLabel}
          </span>
        )}

        {syncState.pendingCount > 0 && !isSynced && (
          <span
            dir="ltr"
            className="hidden sm:inline-block font-mono tabular-nums text-[10px] font-bold text-[#B4863C] dark:text-[#D4AF37]"
          >
            ({syncState.pendingCount})
          </span>
        )}
      </div>

      {/* Manual Sync Now Action Button */}
      <button
        type="button"
        onClick={onSyncNow}
        disabled={isSyncing}
        aria-label={isAr ? 'مزامنة يدوية الآن' : 'Sync Now'}
        className="inline-flex items-center gap-1 rounded-md bg-[#B4863C] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#9E7330] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
      >
        {isSyncing ? (
          <Cloud className="w-3 h-3 shrink-0" />
        ) : (
          <RefreshCw className="w-3 h-3 shrink-0" />
        )}
        <span className="hidden md:inline">
          {isAr ? 'مزامنة يدوية الآن' : 'Sync Now'}
        </span>
      </button>
    </div>
  );
};
