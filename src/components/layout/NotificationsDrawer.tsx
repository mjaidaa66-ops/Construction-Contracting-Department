import React from 'react';
import { AlertOctagon, AlertTriangle, ArrowUpRight, Bell, CheckCircle2, Info } from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type { WorkspaceAlert } from '../../utils/workspaceAlerts';
import type { ActiveModule } from './Sidebar';
import { Drawer } from '../ui';

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
        <div className="p-8 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
          <div className="text-xs font-semibold text-[var(--text-primary)]">
            {lang === 'ar' ? 'جميع المشاريع والمعاملات منتظمة' : 'All Projects & Clearances Nominal'}
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            {lang === 'ar'
              ? 'لا توجد تأخيرات زمنية أو معاملات بلدية معلقة حالياً.'
              : 'No schedule variances, expiring permits, or pending municipal actions.'}
          </p>
        </div>
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
                    <AlertOctagon className="w-4 h-4 text-rose-500" />
                  ) : alert.severity === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Info className="w-4 h-4 text-[#B4863C]" />
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
