import React from 'react';
import { AlertOctagon, AlertTriangle, ArrowUpRight, Bell, CheckCircle2, Info } from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type { WorkspaceAlert } from '../../utils/workspaceAlerts';
import type { ActiveModule } from './Sidebar';
import { Drawer, EmptyState } from '../ui';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: WorkspaceAlert[];
  lang: Language;
  onNavigateAlert: (mod: ActiveModule, projectId?: string) => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  alerts,
  lang,
  onNavigateAlert,
}) => {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      icon={<Bell className="w-4 h-4" />}
      title={lang === 'ar' ? 'مركز التنبيهات والإشعارات الهندسية' : 'Engineering Alerts & Notifications'}
      subtitle={
        lang === 'ar'
          ? `${alerts.length} إشعار فعلي مرتبط بالمشاريع والرخص والمزامنة`
          : `${alerts.length} active alert(s) from permits, municipal clearances & sync`
      }
    >
      {alerts.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          title={lang === 'ar' ? 'جميع المشاريع والمعاملات منتظمة' : 'All Projects & Clearances Nominal'}
          description={
            lang === 'ar'
              ? 'لا توجد تأخيرات زمنية أو معاملات بلدية معلقة حالياً.'
              : 'No schedule variances, expiring permits, or pending municipal actions.'
          }
        />
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              onClick={() => {
                onNavigateAlert(alert.targetModule, alert.projectId);
                onClose();
              }}
              className="w-full p-4 text-start hover:bg-[var(--bg-surface-subtle)] flex items-start justify-between gap-3 bunyan-transition cursor-pointer"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 shrink-0">
                  {alert.severity === 'critical' ? (
                    <AlertOctagon className="w-4 h-4 text-[#FF405C]" />
                  ) : alert.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-[#FF9D42]" />
                  ) : (
                    <Info className="w-4 h-4 text-[var(--accent-gold)]" />
                  )}
                </span>
                <div className="space-y-1 min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    {lang === 'ar' ? alert.titleAr : alert.titleEn}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {lang === 'ar' ? alert.detailAr : alert.detailEn}
                  </p>
                  {alert.dateLabel && (
                    <div dir="ltr" className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                      {alert.dateLabel}
                    </div>
                  )}
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
};
