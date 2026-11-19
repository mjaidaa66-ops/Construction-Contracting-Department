import type { CloudSyncState } from '../services/cloudSyncService';
import type { GovernmentTransaction, Language, Project } from '../types/bunyan';
import type { ActiveModule } from '../components/layout/Sidebar';

export interface WorkspaceAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  targetModule: ActiveModule;
  projectId?: string;
  dateLabel?: string;
}

export function deriveWorkspaceAlerts(params: {
  projects: Project[];
  transactions: GovernmentTransaction[];
  syncState: CloudSyncState;
  lang?: Language;
}): WorkspaceAlert[] {
  const { projects, transactions, syncState } = params;
  const alerts: WorkspaceAlert[] = [];
  const nowMs = Date.now();

  // 1. Municipal transactions requiring action or inspection
  for (const tx of transactions) {
    if (tx.status === 'action_required') {
      const proj = projects.find((p) => p.id === tx.projectId);
      alerts.push({
        id: `alert-tx-${tx.id}`,
        severity: 'critical',
        titleAr: `معاملة تتطلب استكمال (${tx.transactionNumber})`,
        titleEn: `Municipal Action Required (${tx.transactionNumber})`,
        detailAr: `${proj ? `${proj.code} · ` : ''}${tx.serviceName}${tx.notes ? ` — ${tx.notes}` : ''}`,
        detailEn: `${proj ? `${proj.code} · ` : ''}${tx.serviceNameEn || tx.serviceName}${tx.notes ? ` — ${tx.notes}` : ''}`,
        targetModule: 'government',
        projectId: tx.projectId,
        dateLabel: tx.lastUpdatedDate,
      });
    } else if (tx.status === 'pending_inspection') {
      const proj = projects.find((p) => p.id === tx.projectId);
      alerts.push({
        id: `alert-tx-${tx.id}`,
        severity: 'warning',
        titleAr: `تفتيش ميداني قيد الانتظار (${tx.transactionNumber})`,
        titleEn: `Pending Field Inspection (${tx.transactionNumber})`,
        detailAr: `${proj ? `${proj.code} · ` : ''}${tx.serviceName}`,
        detailEn: `${proj ? `${proj.code} · ` : ''}${tx.serviceNameEn || tx.serviceName}`,
        targetModule: 'government',
        projectId: tx.projectId,
        dateLabel: tx.lastUpdatedDate,
      });
    }
  }

  // 2. Schedule variance behind planned progress (>10% gap)
  for (const p of projects) {
    if (p.status === 'under_construction' && p.plannedProgress - p.actualProgress >= 10) {
      const gap = p.plannedProgress - p.actualProgress;
      alerts.push({
        id: `alert-sched-${p.id}`,
        severity: gap >= 20 ? 'critical' : 'warning',
        titleAr: `تأخر زمني عن المخطط (-${gap}%) · ${p.code}`,
        titleEn: `Schedule Variance (-${gap}%) · ${p.code}`,
        detailAr: `${p.name} (الفعلي ${p.actualProgress}% مقابل المخطط ${p.plannedProgress}%)`,
        detailEn: `${p.nameEn} (Actual ${p.actualProgress}% vs Planned ${p.plannedProgress}%)`,
        targetModule: 'projects',
        projectId: p.id,
      });
    }

    // 3. Permit expiry within 90 days
    if (p.permitExpiryDate) {
      const expMs = Date.parse(p.permitExpiryDate);
      if (Number.isFinite(expMs)) {
        const daysLeft = Math.ceil((expMs - nowMs) / 86400000);
        if (daysLeft <= 90 && p.status !== 'completed') {
          alerts.push({
            id: `alert-permit-${p.id}`,
            severity: daysLeft <= 30 ? 'critical' : 'warning',
            titleAr:
              daysLeft < 0
                ? `رخصة بناء منتهية · ${p.code}`
                : `تجديد رخصة البناء خلال ${daysLeft} يوم · ${p.code}`,
            titleEn:
              daysLeft < 0
                ? `Expired Building Permit · ${p.code}`
                : `Permit Expiring in ${daysLeft}d · ${p.code}`,
            detailAr: `${p.permitNumber} · ${p.name}`,
            detailEn: `${p.permitNumber} · ${p.nameEn}`,
            targetModule: 'government',
            projectId: p.id,
            dateLabel: p.permitExpiryDate,
          });
        }
      }
    }
  }

  // 4. Real Cloud Sync & Offline Cache Warning
  if (!syncState.isOnline) {
    alerts.unshift({
      id: 'alert-sync-offline',
      severity: 'warning',
      titleAr: 'العمل في وضع التخزين المحلي دون اتصال',
      titleEn: 'Working in Offline IndexedDB Cache Mode',
      detailAr:
        syncState.pendingCount > 0
          ? `يوجد ${syncState.pendingCount} تعديلات بانتظار عودة الاتصال للمزامنة.`
          : 'سيتم مزامنة التعديلات تلقائياً فور استعادة الاتصال.',
      detailEn:
        syncState.pendingCount > 0
          ? `${syncState.pendingCount} pending local changes awaiting reconnection.`
          : 'Changes will synchronize automatically when online.',
      targetModule: 'settings',
    });
  } else if (!syncState.isAuthenticated && syncState.pendingCount > 0) {
    alerts.push({
      id: 'alert-sync-auth',
      severity: 'info',
      titleAr: 'تعديلات محفوظة محلياً بانتظار تسجيل الدخول',
      titleEn: 'Local Changes Awaiting Cloud Sign-In',
      detailAr: `يوجد ${syncState.pendingCount} عنصر غير متزامن مع Firestore. سجل الدخول للمزامنة السحابية.`,
      detailEn: `${syncState.pendingCount} item(s) cached locally. Sign in with Google to sync to Firestore.`,
      targetModule: 'settings',
    });
  }

  return alerts;
}
