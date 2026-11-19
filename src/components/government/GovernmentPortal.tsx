import React, { useMemo, useState } from 'react';
import { ExternalLink, Landmark, Plus, Search, Trash2 } from 'lucide-react';
import type {
  GovernmentAuthority,
  GovernmentTransaction,
  Language,
  Project,
  Role,
  TransactionStatus,
} from '../../types/bunyan';
import { AUTHORITY_LABELS, TX_STATUS_LABELS } from '../../utils/i18n';
import { getRolePermissions } from '../../utils/rbacPermissions';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  SegmentedTabs,
  Select,
  StatusIndicator,
  useToast,
} from '../ui';

interface GovernmentPortalProps {
  transactions: GovernmentTransaction[];
  projects: Project[];
  activeProjectId: string;
  lang: Language;
  currentRole?: Role;
  onSaveTransaction: (tx: GovernmentTransaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const PORTAL_URLS: Record<GovernmentAuthority, string> = {
  sharjah_municipality: 'https://portal.shjmun.gov.ae',
  sewa: 'https://www.sewa.gov.ae',
  szhp: 'https://www.szhp.gov.ae',
  civil_defense: 'https://www.dcd.gov.ae',
  planning_survey: 'https://www.sdtps.gov.ae',
  municipalities_affairs: 'https://www.dma.shj.ae',
  sharjah_housing: 'https://www.shd.gov.ae',
};

export const GovernmentPortal: React.FC<GovernmentPortalProps> = ({
  transactions,
  projects,
  activeProjectId,
  lang,
  currentRole = 'admin',
  onSaveTransaction,
  onDeleteTransaction,
}) => {
  const [filterAuth, setFilterAuth] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GovernmentTransaction | null>(null);

  const [authority, setAuthority] = useState<GovernmentAuthority>('sharjah_municipality');
  const [txNumber, setTxNumber] = useState(`MUN-2026-${Math.floor(1000 + Math.random() * 8999)}`);
  const [serviceName, setServiceName] = useState('');
  const [reviewEngineer, setReviewEngineer] = useState('م. عبيد الشامسي');
  const [status, setStatus] = useState<TransactionStatus>('in_review');
  const [notes, setNotes] = useState('');
  const { pushToast } = useToast();

  const isAr = lang === 'ar';
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

  const statusCounts = useMemo(() => {
    const counts = { approved: 0, in_review: 0, pending_inspection: 0, action_required: 0 };
    transactions.forEach((t) => {
      counts[t.status] += 1;
    });
    return counts;
  }, [transactions]);

  const filtered = transactions.filter((t) => {
    const matchAuth = filterAuth === 'all' || t.authority === filterAuth;
    const q = search.trim().toLowerCase();
    const matchQ =
      !q ||
      t.transactionNumber.toLowerCase().includes(q) ||
      t.serviceName.toLowerCase().includes(q) ||
      t.reviewEngineer.toLowerCase().includes(q);
    return matchAuth && matchQ;
  });

  const handleAddTx = (e: React.FormEvent) => {
    e.preventDefault();
    const today = new Date().toISOString().slice(0, 10);
    onSaveTransaction({
      id: `tx-${Date.now()}`,
      projectId: activeProjectId || projects[0]?.id || 'proj-01',
      authority,
      transactionNumber: txNumber.trim(),
      serviceName: serviceName.trim() || 'طلب اعتماد فني',
      serviceNameEn: serviceName.trim() || 'Technical Approval Request',
      status,
      submissionDate: today,
      lastUpdatedDate: today,
      reviewEngineer: reviewEngineer.trim(),
      notes: notes.trim(),
      officialPortalUrl: PORTAL_URLS[authority],
    });
    setServiceName('');
    setNotes('');
    setModalOpen(false);
    pushToast(isAr ? 'تم تسجيل المعاملة الحكومية بنجاح' : 'Transaction registered', 'success');
  };

  const handleCycleStatus = (tx: GovernmentTransaction) => {
    if (!perms.canManageGovernment) {
      pushToast(
        isAr ? 'تحديث المعاملات متاح للمدير والمهندس فقط.' : 'Transaction updates require Admin or Engineer role.',
        'error'
      );
      return;
    }
    const order: TransactionStatus[] = ['in_review', 'pending_inspection', 'action_required', 'approved'];
    const next = order[(order.indexOf(tx.status) + 1) % order.length];
    onSaveTransaction({
      ...tx,
      status: next,
      lastUpdatedDate: new Date().toISOString().slice(0, 10),
    });
  };

  return (
    <div className="space-y-6">
      {/* Status Overview Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padded>
          <div className="text-xs text-[var(--text-muted)]">{isAr ? 'معتمد' : 'Approved'}</div>
          <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {statusCounts.approved}
          </div>
        </Card>
        <Card padded>
          <div className="text-xs text-[var(--text-muted)]">{isAr ? 'قيد المراجعة' : 'In Review'}</div>
          <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400 mt-1">
            {statusCounts.in_review}
          </div>
        </Card>
        <Card padded>
          <div className="text-xs text-[var(--text-muted)]">{isAr ? 'بانتظار التفتيش' : 'Pending Inspection'}</div>
          <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
            {statusCounts.pending_inspection}
          </div>
        </Card>
        <Card padded>
          <div className="text-xs text-[var(--text-muted)]">{isAr ? 'يتطلب إجراء' : 'Action Required'}</div>
          <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-1">
            {statusCounts.action_required}
          </div>
        </Card>
      </div>

      {/* Filter & Actions Bar */}
      <Card padded className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-60">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              startIcon={<Search className="w-3.5 h-3.5" />}
              placeholder={isAr ? 'بحث برقم المعاملة أو الخدمة...' : 'Search reference or service...'}
            />
          </div>

          <SegmentedTabs
            value={filterAuth}
            onChange={setFilterAuth}
            items={[
              { id: 'all', label: isAr ? 'الكل' : 'All' },
              { id: 'sharjah_municipality', label: isAr ? AUTHORITY_LABELS.sharjah_municipality.ar : AUTHORITY_LABELS.sharjah_municipality.short },
              { id: 'sewa', label: 'SEWA' },
              { id: 'civil_defense', label: isAr ? AUTHORITY_LABELS.civil_defense.ar : AUTHORITY_LABELS.civil_defense.short },
              { id: 'planning_survey', label: isAr ? AUTHORITY_LABELS.planning_survey.ar : AUTHORITY_LABELS.planning_survey.short },
            ]}
          />
        </div>

        <Button
          size="md"
          disabled={!perms.canManageGovernment}
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setModalOpen(true)}
        >
          {isAr ? 'معاملة بلدية جديدة' : 'New Transaction'}
        </Button>
      </Card>

      {/* Transactions Table */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title={isAr ? 'لا توجد معاملات مطابقة' : 'No Municipal Clearances Found'}
            description={isAr ? 'أضف معاملة جديدة أو غير معايير البحث.' : 'Register a new clearance or change filters.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'رقم المعاملة' : 'Reference'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الجهة الحكومية' : 'Authority'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الخدمة والملاحظات' : 'Service & Notes'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المهندس المراجع' : 'Reviewer'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{isAr ? 'البوابة / إجراء' : 'Portal / Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[var(--bg-surface-subtle)] bunyan-transition">
                    <td className="px-4 py-3 font-mono font-semibold text-[#B4863C] whitespace-nowrap">
                      <div>{tx.transactionNumber}</div>
                      <div className="text-[11px] text-[var(--text-muted)] font-normal">{tx.lastUpdatedDate}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-[var(--text-primary)]">
                      <div className="flex items-center gap-2">
                        <Landmark className="w-3.5 h-3.5 text-[#B4863C] shrink-0" />
                        <span>{isAr ? AUTHORITY_LABELS[tx.authority].ar : AUTHORITY_LABELS[tx.authority].en}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[240px]">
                      <div className="font-semibold text-[var(--text-primary)]">
                        {isAr ? tx.serviceName : tx.serviceNameEn || tx.serviceName}
                      </div>
                      {tx.notes && <div className="text-[var(--text-muted)] mt-0.5">{tx.notes}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {tx.reviewEngineer}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={!perms.canManageGovernment}
                        onClick={() => handleCycleStatus(tx)}
                        className={`px-2.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] ${
                          perms.canManageGovernment ? 'hover:border-[#B4863C] cursor-pointer' : 'opacity-65 cursor-not-allowed'
                        }`}
                        title={
                          perms.canManageGovernment
                            ? isAr ? 'اضغط لتحديث الحالة' : 'Click to cycle status'
                            : isAr ? 'للقراءة فقط' : 'Read-only role'
                        }
                      >
                        <StatusIndicator
                          tone={
                            tx.status === 'approved'
                              ? 'success'
                              : tx.status === 'in_review'
                              ? 'info'
                              : tx.status === 'pending_inspection'
                              ? 'warning'
                              : 'danger'
                          }
                          label={isAr ? TX_STATUS_LABELS[tx.status].ar : TX_STATUS_LABELS[tx.status].en}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-end whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <a
                          href={tx.officialPortalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[#B4863C]"
                        >
                          <ExternalLink className="w-3 h-3 text-[#B4863C]" />
                          <span>{isAr ? 'البوابة' : 'Portal'}</span>
                        </a>
                        {perms.canManageGovernment && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(tx)}
                            className="p-1.5 rounded-md text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            aria-label="Delete transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidthClass="max-w-lg"
        icon={<Landmark className="w-4 h-4" />}
        title={isAr ? 'تسجيل معاملة حكومية جديدة' : 'Register Municipal Transaction'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" form="bunyan-gov-tx-form">
              {isAr ? 'حفظ المعاملة' : 'Save Transaction'}
            </Button>
          </>
        }
      >
        <form id="bunyan-gov-tx-form" onSubmit={handleAddTx} className="p-5 space-y-4">
          <Select
            label={isAr ? 'الجهة الحكومية' : 'Authority'}
            value={authority}
            onChange={(e) => setAuthority(e.target.value as GovernmentAuthority)}
          >
            {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{isAr ? v.ar : v.en}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={isAr ? 'رقم المعاملة' : 'Transaction No.'}
              required
              value={txNumber}
              onChange={(e) => setTxNumber(e.target.value)}
              className="font-mono"
            />
            <Select
              label={isAr ? 'الحالة' : 'Status'}
              value={status}
              onChange={(e) => setStatus(e.target.value as TransactionStatus)}
            >
              {Object.entries(TX_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{isAr ? v.ar : v.en}</option>
              ))}
            </Select>
          </div>

          <Input
            label={isAr ? 'اسم الخدمة المطلوبة' : 'Service Description'}
            required
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder={isAr ? 'شهادة عدم ممانعة تمديد مياه' : 'Water Connection NOC'}
          />

          <Input
            label={isAr ? 'المهندس المراجع' : 'Review Engineer'}
            value={reviewEngineer}
            onChange={(e) => setReviewEngineer(e.target.value)}
          />

          <label className="block space-y-1.5 text-xs">
            <span className="font-medium text-[var(--text-secondary)] block">{isAr ? 'ملاحظات المراجعة' : 'Review Notes'}</span>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)]"
            />
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteTransaction(deleteTarget.id);
            pushToast(isAr ? 'تم حذف المعاملة' : 'Transaction deleted', 'info');
          }
        }}
        title={isAr ? 'حذف المعاملة الحكومية' : 'Delete Municipal Transaction'}
        message={
          deleteTarget
            ? isAr
              ? `حذف المعاملة ${deleteTarget.transactionNumber}؟`
              : `Delete transaction ${deleteTarget.transactionNumber}?`
            : ''
        }
        confirmLabel={isAr ? 'حذف' : 'Delete'}
        cancelLabel={isAr ? 'إلغاء' : 'Cancel'}
      />
    </div>
  );
};
