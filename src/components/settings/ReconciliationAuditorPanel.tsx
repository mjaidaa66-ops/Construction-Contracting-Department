import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudOff,
  FileDiff,
  GitCompareArrows,
  Lock,
  LogIn,
  RefreshCw,
} from 'lucide-react';
import {
  applyPulledItemToLocalWorkspace,
  diffWorkspaceSnapshots,
  formatShortHash,
  runLiveReconciliationAudit,
  resolvePullItemToLocal,
  resolvePushItemToCloud,
  type ReconciliationAuditItem,
  type ReconciliationAuditReport,
  type ReconciliationDriftStatus,
  type ReconciliationEntityType,
  type WorkspaceSnapshotData,
} from '../../services/reconciliationAuditor';
import type { Language, Project, Role } from '../../types/bunyan';
import { getRolePermissions } from '../../utils/rbacPermissions';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  SegmentedTabs,
  StatusIndicator,
  useToast,
} from '../ui';

export interface ReconciliationAuditorPanelProps {
  lang: Language;
  cloudUid: string | null;
  userEmail?: string | null;
  currentRole: Role;
  isOnline: boolean;
  localWorkspace: WorkspaceSnapshotData;
  onApplyPulledWorkspacePatch: (patch: Partial<WorkspaceSnapshotData>) => void;
  onManifestAttached?: (updatedProject: Project) => void;
  onSignInGoogle: () => Promise<void>;
}

type StatusFilter = 'all' | 'drift' | 'matched';
type EntityFilter = 'all' | ReconciliationEntityType;

function formatCompactValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value.length > 90 ? `${value.slice(0, 87)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 110 ? `${serialized.slice(0, 107)}...` : serialized;
  } catch {
    return String(value);
  }
}

export const ReconciliationAuditorPanel: React.FC<ReconciliationAuditorPanelProps> = ({
  lang,
  cloudUid,
  userEmail,
  currentRole,
  isOnline,
  localWorkspace,
  onApplyPulledWorkspacePatch,
  onManifestAttached,
  onSignInGoogle,
}) => {
  const isAr = lang === 'ar';
  const perms = getRolePermissions(currentRole);
  const canAdminOverrideTerminalLock = userEmail === 'mjaidaa66@gmail.com';
  const { pushToast } = useToast();

  const [report, setReport] = useState<ReconciliationAuditReport | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [busyEntityKey, setBusyEntityKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<'push' | 'pull' | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [confirmBulkAction, setConfirmBulkAction] = useState<'push' | 'pull' | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const canPushEntity = (entityType: ReconciliationEntityType): boolean => {
    switch (entityType) {
      case 'project':
        return perms.canManageProjects || perms.canEditEngineering || perms.canEditFinancials;
      case 'company_profile':
        return perms.canManageCompanySettings;
      case 'rate_item':
        return perms.canEditEngineering || perms.canEditFinancials;
      case 'transaction':
        return perms.canManageGovernment;
      case 'reports_workspace':
        return perms.canManageTemplates || perms.canExportReports;
    }
  };

  const executeAudit = async (overrideLocal?: WorkspaceSnapshotData) => {
    if (!cloudUid) return;
    setAuditing(true);
    setAuditError(null);
    try {
      const targetLocal = overrideLocal || localWorkspace;
      const { report: nextReport } = await runLiveReconciliationAudit({
        ownerId: cloudUid,
        local: targetLocal,
        canAdminOverrideTerminalLock,
      });
      setReport(nextReport);
      if (nextReport.driftCount === 0) {
        pushToast(
          isAr
            ? `تمت المطابقة بنجاح: جميع السجلات (${nextReport.totalCount}) متطابقة مع السحابة.`
            : `Audit complete: all ${nextReport.totalCount} records match Firestore snapshots.`,
          'success'
        );
      } else {
        pushToast(
          isAr
            ? `تم رصد ${nextReport.driftCount} اختلافات بين مساحة العمل المحلية و Cloud Firestore.`
            : `Detected ${nextReport.driftCount} data drift item(s) against Firestore snapshots.`,
          'info'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAuditError(msg);
      pushToast(
        isAr ? 'تعذر إتمام الفحص السحابي للمطابقة.' : 'Cloud reconciliation audit failed.',
        'error'
      );
    } finally {
      setAuditing(false);
    }
  };

  const handlePushItem = async (item: ReconciliationAuditItem) => {
    if (!cloudUid) return;
    if (!canPushEntity(item.entityType)) {
      pushToast(
        isAr
          ? 'صلاحية الدور النشط لا تسمح بدفع هذا النوع من البيانات إلى السحابة.'
          : 'Active role does not have permission to push this entity type to Cloud.',
        'error'
      );
      return;
    }
    if (item.terminalLocked) {
      pushToast(
        isAr
          ? 'هذا السجل مغلق نهائياً في السحابة (مكتمل/معتمد) ويتطلب صلاحية Admin.'
          : 'This record is terminal-locked in Firestore (completed/approved) and requires Admin access.',
        'error'
      );
      return;
    }

    setBusyEntityKey(item.entityKey);
    try {
      await resolvePushItemToCloud({
        item,
        ownerId: cloudUid,
        localProjects: localWorkspace.projects,
        onManifestAttached,
      });
      pushToast(
        isAr
          ? `تم دفع (${item.labelAr}) وتحديث البصمة السحابية.`
          : `Pushed "${item.labelEn}" to Firestore.`,
        'success'
      );
      await executeAudit();
    } catch (err) {
      pushToast(
        err instanceof Error
          ? err.message
          : isAr
          ? 'فشل دفع السجل إلى السحابة.'
          : 'Failed to push record to Cloud.',
        'error'
      );
    } finally {
      setBusyEntityKey(null);
    }
  };

  const handlePullItem = async (item: ReconciliationAuditItem) => {
    if (!cloudUid) return;
    setBusyEntityKey(item.entityKey);
    try {
      const patch = await resolvePullItemToLocal({
        item,
        local: localWorkspace,
        ownerId: cloudUid,
      });
      onApplyPulledWorkspacePatch(patch);
      const nextLocal: WorkspaceSnapshotData = {
        ...localWorkspace,
        ...patch,
      };
      pushToast(
        isAr
          ? `تم سحب نسخة السحابة لـ (${item.labelAr}) محلياً.`
          : `Pulled Firestore snapshot for "${item.labelEn}" to local workspace.`,
        'success'
      );
      await executeAudit(nextLocal);
    } catch (err) {
      pushToast(
        err instanceof Error
          ? err.message
          : isAr
          ? 'فشل سحب نسخة السحابة.'
          : 'Failed to pull Cloud snapshot.',
        'error'
      );
    } finally {
      setBusyEntityKey(null);
    }
  };

  const driftedItems = useMemo(
    () => (report ? report.items.filter((i) => i.driftStatus !== 'MATCHED') : []),
    [report]
  );

  const pushableItems = useMemo(
    () =>
      driftedItems.filter(
        (i) => i.localRecord && !i.terminalLocked && canPushEntity(i.entityType)
      ),
    [driftedItems, currentRole]
  );

  const pullableItems = useMemo(
    () => driftedItems.filter((i) => i.cloudRecord),
    [driftedItems]
  );

  const handleBulkPushAll = async () => {
    if (!cloudUid || pushableItems.length === 0) return;
    setBulkBusy('push');
    let pushed = 0;
    try {
      for (const item of pushableItems) {
        await resolvePushItemToCloud({
          item,
          ownerId: cloudUid,
          localProjects: localWorkspace.projects,
          onManifestAttached,
        });
        pushed += 1;
      }
      pushToast(
        isAr
          ? `تم دفع ${pushed} سجل(سجلات) من المحلي إلى Cloud Firestore بنجاح.`
          : `Pushed ${pushed} local record(s) to Cloud Firestore.`,
        'success'
      );
      await executeAudit();
    } catch (err) {
      pushToast(
        err instanceof Error
          ? err.message
          : isAr
          ? 'توقف الدفع الجماعي بسبب خطأ سحابي.'
          : 'Bulk push halted due to a cloud error.',
        'error'
      );
      if (pushed > 0) {
        await executeAudit();
      }
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkPullAll = async () => {
    if (!cloudUid || pullableItems.length === 0) return;
    setBulkBusy('pull');
    try {
      let workingLocal: WorkspaceSnapshotData = { ...localWorkspace };
      const combinedPatch: Partial<WorkspaceSnapshotData> = {};

      for (const item of pullableItems) {
        const patch = applyPulledItemToLocalWorkspace(item, workingLocal);
        workingLocal = { ...workingLocal, ...patch };
        Object.assign(combinedPatch, patch);
      }

      onApplyPulledWorkspacePatch(combinedPatch);
      pushToast(
        isAr
          ? `تم سحب ${pullableItems.length} سجل(سجلات) من Cloud Firestore إلى مساحة العمل المحلية.`
          : `Pulled ${pullableItems.length} Cloud Firestore snapshot(s) to local workspace.`,
        'success'
      );
      await executeAudit(workingLocal);
    } catch (err) {
      pushToast(
        err instanceof Error
          ? err.message
          : isAr
          ? 'فشل السحب الجماعي من السحابة.'
          : 'Bulk pull from Cloud failed.',
        'error'
      );
    } finally {
      setBulkBusy(null);
    }
  };

  const filteredItems = useMemo(() => {
    if (!report) return [];
    return report.items.filter((item) => {
      if (statusFilter === 'drift' && item.driftStatus === 'MATCHED') return false;
      if (statusFilter === 'matched' && item.driftStatus !== 'MATCHED') return false;
      if (entityFilter !== 'all' && item.entityType !== entityFilter) return false;
      return true;
    });
  }, [report, statusFilter, entityFilter]);

  const entityTypeLabel = (type: ReconciliationEntityType): string => {
    switch (type) {
      case 'project':
        return isAr ? 'مشروع' : 'Project';
      case 'company_profile':
        return isAr ? 'ملف المنشأة' : 'Company';
      case 'rate_item':
        return isAr ? 'فئة تسعير' : 'Rate Item';
      case 'transaction':
        return isAr ? 'معاملة حكومية' : 'Clearance';
      case 'reports_workspace':
        return isAr ? 'مركز التقارير' : 'Reports';
    }
  };

  const driftStatusMeta = (
    status: ReconciliationDriftStatus
  ): { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } => {
    switch (status) {
      case 'MATCHED':
        return { label: isAr ? 'متطابق' : 'Matched', tone: 'success' };
      case 'CONTENT_DRIFT':
        return { label: isAr ? 'انحراف محتوى' : 'Content Drift', tone: 'danger' };
      case 'PENDING_LOCAL':
        return { label: isAr ? 'بانتظار الرفع' : 'Pending Sync', tone: 'warning' };
      case 'LOCAL_ONLY':
        return { label: isAr ? 'محلي فقط' : 'Local Only', tone: 'info' };
      case 'CLOUD_ONLY':
        return { label: isAr ? 'سحابي فقط' : 'Cloud Only', tone: 'warning' };
    }
  };

  // Pre-compute local baseline count even before running live audit
  const localItemCount =
    localWorkspace.projects.length +
    localWorkspace.rateLibrary.length +
    localWorkspace.transactions.length +
    2; // companyProfile + reportsWorkspace

  return (
    <Card id="reconciliation-auditor" className="overflow-hidden">
      <CardHeader
        icon={<GitCompareArrows className="w-5 h-5" />}
        title={isAr ? 'مدقق المطابقة السحابية وبصمات البيانات' : 'Cloud Snapshot Reconciliation Auditor'}
        subtitle={
          isAr
            ? 'مقارنة البصمات المعيارية بين مساحة العمل المحلية و Cloud Firestore ورصد أي انحراف أو تعارض ومعالجته'
            : 'Compare deterministic local workspace hashes against live Firestore snapshots and resolve data drift'
        }
        action={
          cloudUid ? (
            <Button
              variant="cyan"
              size="sm"
              loading={auditing}
              disabled={bulkBusy !== null}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => void executeAudit()}
            >
              {auditing
                ? isAr
                  ? 'جاري الفحص...'
                  : 'Auditing...'
                : report
                ? isAr
                  ? 'إعادة فحص البصمات'
                  : 'Re-run Audit'
                : isAr
                ? 'تشغيل تدقيق المطابقة'
                : 'Run Reconciliation Audit'}
            </Button>
          ) : (
            <Button
              variant="cyan"
              size="sm"
              icon={<LogIn className="w-3.5 h-3.5" />}
              onClick={() => void onSignInGoogle()}
            >
              {isAr ? 'تسجيل الدخول للفحص' : 'Sign In to Audit'}
            </Button>
          )
        }
      />

      <div className="p-5 space-y-4">
        {!cloudUid ? (
          <EmptyState
            icon={<CloudOff className="w-6 h-6" />}
            title={
              isAr
                ? 'يتطلب تدقيق المطابقة تسجيل الدخول بحساب Google الموثق'
                : 'Verified Google Sign-In Required for Cloud Audit'
            }
            description={
              isAr
                ? `يوجد حالياً ${localItemCount} سجل محفوظ محلياً. سجّل الدخول بحساب Google لمقارنة البصمات المحلية مع لقطات Cloud Firestore الحية.`
                : `${localItemCount} local workspace records are ready. Sign in with your verified Google account to compare local canonical hashes against Cloud Firestore.`
            }
          />
        ) : !report ? (
          <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {isAr
                  ? 'جاهز لتدقيق البصمات المعيارية عبر 5 مجموعات سحابية'
                  : 'Ready to Audit Canonical Snapshot Hashes Across 5 Cloud Collections'}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap items-center gap-2">
                <span>
                  {isAr
                    ? `النطاق المحلي: ${localWorkspace.projects.length} مشاريع · ${localWorkspace.transactions.length} معاملات · ${localWorkspace.rateLibrary.length} فئات أسعار · ملف المنشأة · مركز التقارير`
                    : `Local scope: ${localWorkspace.projects.length} projects · ${localWorkspace.transactions.length} clearances · ${localWorkspace.rateLibrary.length} rates · company profile · reports`}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isOnline && (
                <StatusIndicator
                  tone="warning"
                  label={isAr ? 'غير متصل بالإنترنت' : 'Offline'}
                />
              )}
              <Button
                variant="primary"
                size="sm"
                loading={auditing}
                icon={<GitCompareArrows className="w-3.5 h-3.5" />}
                onClick={() => void executeAudit()}
              >
                {isAr ? 'بدء المطابقة الآن' : 'Start Audit Now'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {auditError && (
              <div className="p-3 rounded-xl border border-[#FF405C]/35 bg-[#FF405C]/10 text-xs text-[#FF405C] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="break-all">{auditError}</span>
              </div>
            )}

            {/* Compact Audit Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {isAr ? 'حالة التطابق العام' : 'Overall Integrity'}
                </div>
                <div className="mt-1.5">
                  <StatusIndicator
                    tone={report.overallStatus === 'IN_SYNC' ? 'success' : 'danger'}
                    label={
                      report.overallStatus === 'IN_SYNC'
                        ? isAr
                          ? 'متطابق بالكامل'
                          : 'In Sync'
                        : isAr
                        ? 'تم رصد انحراف'
                        : 'Drift Detected'
                    }
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {isAr ? 'إجمالي السجلات' : 'Total Audited'}
                </div>
                <div dir="ltr" className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--text-primary)]">
                  {report.totalCount}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {isAr ? 'متطابقة البصمة' : 'Matched Hashes'}
                </div>
                <div dir="ltr" className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-[#00E5A8]">
                  {report.matchedCount}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)]">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {isAr ? 'انحراف / تعارض' : 'Drifted Items'}
                </div>
                <div
                  dir="ltr"
                  className={`mt-1 text-lg font-bold font-mono tabular-nums ${
                    report.driftCount > 0 ? 'text-[#FF405C]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {report.driftCount}
                </div>
              </div>

              <div className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] col-span-2 lg:col-span-1">
                <div className="text-[11px] text-[var(--text-muted)]">
                  {isAr ? 'مصدر اللقطة السحابية' : 'Snapshot Source'}
                </div>
                <div className="mt-1 text-xs font-semibold text-[var(--text-primary)]">
                  {report.source === 'server'
                    ? isAr
                      ? 'خادم Firestore الحي'
                      : 'Live Server'
                    : isAr
                    ? 'ذاكرة Firestore المؤقتة'
                    : 'Offline Cache'}
                </div>
                <div dir="ltr" className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">
                  {new Date(report.auditedAt).toLocaleTimeString(isAr ? 'ar-AE' : 'en-AE')}
                </div>
              </div>
            </div>

            {/* Drift Breakdown + Filters + Bulk Resolution */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedTabs<StatusFilter>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  items={[
                    { id: 'all', label: isAr ? 'الكل' : 'All', count: report.totalCount },
                    { id: 'drift', label: isAr ? 'الاختلافات' : 'Mismatches', count: report.driftCount },
                    { id: 'matched', label: isAr ? 'متطابقة' : 'Matched', count: report.matchedCount },
                  ]}
                />

                <select
                  aria-label={isAr ? 'تصفية حسب المجموعة' : 'Filter by collection'}
                  value={entityFilter}
                  onChange={(e) => setEntityFilter(e.target.value as EntityFilter)}
                  className="h-9 px-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-cyan)]"
                >
                  <option value="all">{isAr ? 'كل المجموعات' : 'All Collections'}</option>
                  <option value="project">{isAr ? 'المشاريع' : 'Projects'}</option>
                  <option value="transaction">{isAr ? 'المعاملات البلدية' : 'Clearances'}</option>
                  <option value="rate_item">{isAr ? 'مكتبة الأسعار' : 'Rate Library'}</option>
                  <option value="company_profile">{isAr ? 'ملف المنشأة' : 'Company Profile'}</option>
                  <option value="reports_workspace">{isAr ? 'مركز التقارير' : 'Reports Workspace'}</option>
                </select>
              </div>

              {report.driftCount > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={bulkBusy === 'push'}
                    disabled={pushableItems.length === 0 || auditing || bulkBusy !== null}
                    icon={<ArrowUpFromLine className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />}
                    onClick={() => setConfirmBulkAction('push')}
                  >
                    {isAr
                      ? `دفع الكل للسحابة (${pushableItems.length})`
                      : `Push All to Cloud (${pushableItems.length})`}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={bulkBusy === 'pull'}
                    disabled={pullableItems.length === 0 || auditing || bulkBusy !== null}
                    icon={<ArrowDownToLine className="w-3.5 h-3.5 text-[var(--accent-gold)]" />}
                    onClick={() => setConfirmBulkAction('pull')}
                  >
                    {isAr
                      ? `سحب الكل للمحلي (${pullableItems.length})`
                      : `Pull All to Local (${pullableItems.length})`}
                  </Button>
                </div>
              )}
            </div>

            {/* Detail Breakdown Metadata Line */}
            {report.driftCount > 0 && (
              <div className="text-[11px] text-[var(--text-secondary)] flex flex-wrap items-center gap-2 px-1">
                <span>
                  {isAr ? 'ملخص الفروقات:' : 'Drift breakdown:'}
                </span>
                <span dir="ltr" className="font-mono">
                  {report.contentDriftCount} {isAr ? 'تعارض محتوى' : 'content drift'} ·{' '}
                  {report.localOnlyCount} {isAr ? 'محلي فقط' : 'local-only'} ·{' '}
                  {report.cloudOnlyCount} {isAr ? 'سحابي فقط' : 'cloud-only'} ·{' '}
                  {report.pendingLocalCount} {isAr ? 'بانتظار الرفع' : 'pending'}
                </span>
              </div>
            )}

            {/* Audited Items List */}
            {filteredItems.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="w-6 h-6" />}
                title={
                  statusFilter === 'drift'
                    ? isAr
                      ? 'لا توجد أي اختلافات أو انحرافات'
                      : 'Zero Mismatches Detected'
                    : isAr
                    ? 'لا توجد عناصر مطابقة للفلتر الحالي'
                    : 'No Records Match Active Filter'
                }
                description={
                  statusFilter === 'drift'
                    ? isAr
                      ? 'جميع السجلات المحلية مطابقة تماماً لبصمات Cloud Firestore.'
                      : 'All audited local entities match their live Firestore snapshot hashes.'
                    : isAr
                    ? 'جرّب تغيير فلتر الحالة أو المجموعة لعرض بقية السجلات.'
                    : 'Switch status or collection filters to view other audited records.'
                }
              />
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] overflow-hidden">
                {filteredItems.map((item) => {
                  const meta = driftStatusMeta(item.driftStatus);
                  const expanded = Boolean(expandedKeys[item.entityKey]);
                  const canPush =
                    Boolean(item.localRecord) &&
                    !item.terminalLocked &&
                    canPushEntity(item.entityType) &&
                    item.driftStatus !== 'MATCHED';
                  const canPull = Boolean(item.cloudRecord) && item.driftStatus !== 'MATCHED';
                  const isBusy = busyEntityKey === item.entityKey || bulkBusy !== null;

                  return (
                    <div key={item.entityKey} className="bg-[var(--bg-surface)]">
                      <div className="p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                        {/* Identity & Drift Summary */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {entityTypeLabel(item.entityType)}
                            </span>
                            <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
                            <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-md">
                              {isAr ? item.labelAr : item.labelEn}
                            </span>
                            {item.subtitle && (
                              <>
                                <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
                                <span dir="ltr" className="font-mono text-[11px] text-[var(--text-muted)]">
                                  {item.subtitle}
                                </span>
                              </>
                            )}
                            <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
                            <StatusIndicator tone={meta.tone} label={meta.label} />
                            {item.terminalLocked && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-[#FF9D42]"
                                title={
                                  isAr
                                    ? 'مغلق في قواعد Firestore (مكتمل/معتمد)'
                                    : 'Locked by Firestore terminal-state rule'
                                }
                              >
                                <Lock className="w-3 h-3" />
                                <span>{isAr ? 'مقفل' : 'Locked'}</span>
                              </span>
                            )}
                          </div>

                          {/* Canonical Hash Comparison */}
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--text-muted)]">
                                {isAr ? 'البصمة المحلية:' : 'Local Hash:'}
                              </span>
                              <code
                                dir="ltr"
                                title={item.localHash || undefined}
                                className="font-mono tabular-nums font-semibold text-[var(--text-primary)]"
                              >
                                {formatShortHash(item.localHash)}
                              </code>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[var(--text-muted)]">
                                {isAr ? 'بصمة السحابة:' : 'Cloud Hash:'}
                              </span>
                              <code
                                dir="ltr"
                                title={item.cloudHash || undefined}
                                className={`font-mono tabular-nums font-semibold ${
                                  item.driftStatus === 'MATCHED'
                                    ? 'text-emerald-600 dark:text-[#00E5A8]'
                                    : item.cloudHash
                                    ? 'text-[var(--accent-cyan)]'
                                    : 'text-[var(--text-muted)]'
                                }`}
                              >
                                {formatShortHash(item.cloudHash)}
                              </code>
                            </div>

                            {item.changedFields.length > 0 && (
                              <div className="flex items-center gap-1.5 text-[#FF405C]">
                                <FileDiff className="w-3.5 h-3.5 shrink-0" />
                                <span dir="ltr" className="font-mono">
                                  {item.changedFields.slice(0, 4).join(', ')}
                                  {item.changedFields.length > 4
                                    ? ` +${item.changedFields.length - 4}`
                                    : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {item.fieldDiffs.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={
                                expanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )
                              }
                              onClick={() =>
                                setExpandedKeys((prev) => ({
                                  ...prev,
                                  [item.entityKey]: !prev[item.entityKey],
                                }))
                              }
                            >
                              {isAr ? 'تفاصيل الفروقات' : 'Inspect Diff'}
                            </Button>
                          )}

                          {item.driftStatus !== 'MATCHED' && (
                            <>
                              <Button
                                variant={item.recommendedAction === 'push_local' ? 'primary' : 'outline'}
                                size="sm"
                                loading={busyEntityKey === item.entityKey}
                                disabled={!canPush || isBusy}
                                icon={<ArrowUpFromLine className="w-3.5 h-3.5" />}
                                onClick={() => void handlePushItem(item)}
                              >
                                {isAr ? 'دفع للسحابة' : 'Push to Cloud'}
                              </Button>

                              <Button
                                variant={item.recommendedAction === 'pull_cloud' ? 'cyan' : 'outline'}
                                size="sm"
                                loading={busyEntityKey === item.entityKey}
                                disabled={!canPull || isBusy}
                                icon={<ArrowDownToLine className="w-3.5 h-3.5" />}
                                onClick={() => void handlePullItem(item)}
                              >
                                {isAr ? 'سحب للمحلي' : 'Pull to Local'}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expandable Field-Level Drift Inspector */}
                      {expanded && item.fieldDiffs.length > 0 && (
                        <div className="px-4 pb-4 pt-1 bg-[var(--bg-surface-subtle)] border-t border-[var(--border-hairline)]">
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px] border-collapse">
                              <thead>
                                <tr className="text-[var(--text-muted)] border-b border-[var(--border-hairline)]">
                                  <th className="py-2 pe-3 text-start font-semibold">
                                    {isAr ? 'الحقل المتغير' : 'Changed Field'}
                                  </th>
                                  <th className="py-2 px-3 text-start font-semibold">
                                    {isAr ? 'القيمة المحلية' : 'Local Value'}
                                  </th>
                                  <th className="py-2 ps-3 text-start font-semibold">
                                    {isAr ? 'القيمة السحابية (Firestore)' : 'Cloud Value (Firestore)'}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border-hairline)]">
                                {item.fieldDiffs.map((diff) => (
                                  <tr key={diff.field}>
                                    <td dir="ltr" className="py-2 pe-3 font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                                      {diff.field}
                                    </td>
                                    <td dir="ltr" className="py-2 px-3 font-mono text-[var(--text-secondary)] break-all">
                                      {formatCompactValue(diff.localValue)}
                                    </td>
                                    <td dir="ltr" className="py-2 ps-3 font-mono text-[var(--accent-cyan)] break-all">
                                      {formatCompactValue(diff.cloudValue)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmBulkAction !== null}
        onClose={() => setConfirmBulkAction(null)}
        onConfirm={() => {
          if (confirmBulkAction === 'push') {
            void handleBulkPushAll();
          } else if (confirmBulkAction === 'pull') {
            void handleBulkPullAll();
          }
        }}
        danger={confirmBulkAction === 'push'}
        title={
          confirmBulkAction === 'push'
            ? isAr
              ? 'تأكيد دفع جميع التعديلات المحلية إلى السحابة'
              : 'Confirm Bulk Push to Cloud Firestore'
            : isAr
            ? 'تأكيد سحب جميع لقطات السحابة إلى المحلي'
            : 'Confirm Bulk Pull from Cloud Firestore'
        }
        message={
          confirmBulkAction === 'push'
            ? isAr
              ? `سيتم استبدال السجلات السحابية المتعارضة (${pushableItems.length}) بالنسخة المحلية الحالية.`
              : `This will overwrite ${pushableItems.length} drifted Firestore snapshot(s) with your local workspace records.`
            : isAr
            ? `سيتم استبدال السجلات المحلية المتعارضة (${pullableItems.length}) باللقطات المحفوظة في Cloud Firestore.`
            : `This will replace ${pullableItems.length} local workspace record(s) with their live Cloud Firestore snapshots.`
        }
        confirmLabel={
          confirmBulkAction === 'push'
            ? isAr
              ? 'دفع الكل الآن'
              : 'Push All Now'
            : isAr
            ? 'سحب الكل الآن'
            : 'Pull All Now'
        }
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
      />
    </Card>
  );
};
