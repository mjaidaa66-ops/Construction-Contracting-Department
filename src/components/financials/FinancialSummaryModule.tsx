import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileDown,
  Receipt,
  Search,
  Wallet,
} from 'lucide-react';
import type { CompanyProfile, Language, Project, Role } from '../../types/bunyan';
import { computeTakeoffSummary } from '../../utils/takeoffCalculations';
import { formatAED } from '../../utils/i18n';
import { getRolePermissions } from '../../utils/rbacPermissions';
import { BunyanExportCenter } from '../export/BunyanExportCenter';
import { Button, Card, CardHeader, Input, StatusIndicator, useToast } from '../ui';

interface FinancialSummaryModuleProps {
  projects: Project[];
  activeProject: Project;
  company: CompanyProfile;
  lang: Language;
  currentRole?: Role;
  onSelectProject: (id: string) => void;
  onSaveProject: (project: Project) => void;
}

export const FinancialSummaryModule: React.FC<FinancialSummaryModuleProps> = ({
  projects,
  activeProject,
  company,
  lang,
  currentRole = 'admin',
  onSelectProject,
  onSaveProject,
}) => {
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const { pushToast } = useToast();
  const isAr = lang === 'ar';
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

  const totals = useMemo(() => {
    return projects.reduce(
      (acc, p) => {
        acc.budget += p.approvedBudget;
        acc.paid += p.paidAmount;
        return acc;
      },
      { budget: 0, paid: 0 }
    );
  }, [projects]);

  const remainingTotal = Math.max(0, totals.budget - totals.paid);
  const collectionPct = totals.budget > 0 ? Math.round((totals.paid / totals.budget) * 100) : 0;

  const activeBoqSummary = useMemo(() => {
    const cfg = activeProject.takeoffSummaryConfig || {
      overheadPercent: 10,
      profitPercent: 12,
      vatPercent: 5,
    };
    return computeTakeoffSummary(
      activeProject.id,
      activeProject.takeoffMeasurements || [],
      cfg.overheadPercent,
      cfg.profitPercent,
      cfg.vatPercent
    );
  }, [activeProject]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q)
    );
  }, [projects, search]);

  const handleCycleMilestone = (milestoneId: string) => {
    if (!perms.canEditFinancials) {
      pushToast(
        isAr ? 'تعديل الدفعات متاح للمدير والمحاسب فقط.' : 'Payment updates require Admin or Accountant role.',
        'error'
      );
      return;
    }
    const nextMilestones = activeProject.paymentMilestones.map((m) => {
      if (m.id !== milestoneId) return m;
      const nextStatus: 'pending' | 'paid' = m.status === 'paid' ? 'pending' : 'paid';
      return { ...m, status: nextStatus };
    });

    const paidSum = nextMilestones
      .filter((m) => m.status === 'paid')
      .reduce((acc, m) => acc + m.amountAed, 0);

    onSaveProject({
      ...activeProject,
      paymentMilestones: nextMilestones,
      paidAmount: Math.round(paidSum),
      invoicedAmount: Math.round(paidSum),
    });
    pushToast(
      isAr ? 'تم تحديث حالة الدفعة وحساب المدفوعات تلقائياً.' : 'Milestone payment updated.',
      'success'
    );
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Financial Overview KPIs — Project Values & Payments Received */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'إجمالي قيمة المشاريع' : 'Total Project Values'}</span>
            <Wallet className="w-4 h-4 text-[#B4863C]" />
          </div>
          <div dir="ltr" className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-2 truncate">
            {formatAED(totals.budget, lang)}
          </div>
        </Card>

        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'إجمالي الدفعات المستلمة' : 'Total Payments Received'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div dir="ltr" className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-2 truncate">
            {formatAED(totals.paid, lang)}
          </div>
          <div dir="ltr" className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] mt-1">
            {collectionPct}% {isAr ? 'نسبة التحصيل' : 'collected'}
          </div>
        </Card>

        <Card padded>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{isAr ? 'الرصيد المتبقي للتحصيل' : 'Remaining Balance'}</span>
            <Clock className="w-4 h-4 text-[#B4863C]" />
          </div>
          <div dir="ltr" className="text-xl font-bold font-mono tabular-nums text-[#B4863C] dark:text-[#C99A49] mt-2 truncate">
            {formatAED(remainingTotal, lang)}
          </div>
        </Card>
      </div>

      {/* Active Project Milestones & 5D BOQ + UAE 5% VAT Comparison */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-7">
          <CardHeader
            icon={<Receipt className="w-4 h-4" />}
            title={
              isAr
                ? `جدول الدفعات المستلمة — ${activeProject.code}`
                : `Project Payments Schedule — ${activeProject.code}`
            }
            subtitle={isAr ? activeProject.name : activeProject.nameEn}
            action={
              <Button size="xs" icon={<FileDown className="w-3.5 h-3.5" />} onClick={() => setExportOpen(true)}>
                {isAr ? 'تصدير PDF / Excel' : 'Export Report'}
              </Button>
            }
          />
          <div className="divide-y divide-[var(--border-hairline)]">
            {activeProject.paymentMilestones.map((m) => (
              <div key={m.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {isAr ? m.titleAr : m.titleEn}
                  </div>
                  <div dir="ltr" className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] mt-0.5">
                    {m.percentage}% · {m.dueDate}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span dir="ltr" className="text-xs font-mono tabular-nums font-bold text-[var(--text-primary)]">
                    {formatAED(m.amountAed, lang)}
                  </span>
                  <button
                    type="button"
                    disabled={!perms.canEditFinancials}
                    onClick={() => handleCycleMilestone(m.id)}
                    className={`px-2.5 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] bunyan-transition ${
                      perms.canEditFinancials
                        ? 'hover:border-[#B4863C] cursor-pointer'
                        : 'opacity-65 cursor-not-allowed'
                    }`}
                    title={
                      perms.canEditFinancials
                        ? isAr ? 'اضغط لتغيير حالة الدفعة' : 'Click to toggle paid status'
                        : isAr ? 'للقراءة فقط (دور المهندس)' : 'Read-only for Engineer role'
                    }
                  >
                    <StatusIndicator
                      tone={m.status === 'paid' ? 'success' : 'neutral'}
                      label={
                        m.status === 'paid'
                          ? isAr ? 'مدفوعة' : 'Paid'
                          : isAr ? 'مجدولة' : 'Pending'
                      }
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            icon={<Wallet className="w-4 h-4" />}
            title={isAr ? 'مقارنة الميزانية والمقايسة 5D BOQ' : 'Budget vs 5D BOQ & UAE 5% VAT'}
            subtitle={`${company.trnNumber}`}
          />
          <div className="p-5 space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'الميزانية التعاقدية' : 'Approved Contract Budget'}</span>
              <span dir="ltr" className="font-mono tabular-nums font-bold text-[var(--text-primary)]">
                {formatAED(activeProject.approvedBudget, lang)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'التكلفة المباشرة للحصر 2D' : 'Takeoff Direct Cost'}</span>
              <span dir="ltr" className="font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                {formatAED(activeBoqSummary.directCostAed, lang)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">
                {isAr
                  ? `المصاريف الإدارية والربح (${activeBoqSummary.overheadPercent + activeBoqSummary.profitPercent}%)`
                  : `Overhead & Profit (${activeBoqSummary.overheadPercent + activeBoqSummary.profitPercent}%)`}
              </span>
              <span dir="ltr" className="font-mono tabular-nums text-[var(--text-secondary)]">
                {formatAED(activeBoqSummary.overheadAed + activeBoqSummary.profitAed, lang)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--border-hairline)]">
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {isAr ? `ضريبة القيمة المضافة UAE VAT (${activeBoqSummary.vatPercent}%)` : `UAE VAT (${activeBoqSummary.vatPercent}%)`}
              </span>
              <span dir="ltr" className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                {formatAED(activeBoqSummary.vatAed, lang)}
              </span>
            </div>
            <div className="flex justify-between pt-2 text-sm font-bold">
              <span className="text-[var(--text-primary)]">{isAr ? 'إجمالي مقايسة BOQ شاملة الضريبة' : 'BOQ Grand Total Incl. VAT'}</span>
              <span dir="ltr" className="font-mono tabular-nums text-[#B4863C] dark:text-[#C99A49]">
                {formatAED(activeBoqSummary.grandTotalAed, lang)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Portfolio Financial Ledger Table */}
      <Card>
        <CardHeader
          icon={<Wallet className="w-4 h-4" />}
          title={isAr ? `السجل المالي لكافة المشاريع (${projects.length})` : `Portfolio Financial Ledger (${projects.length})`}
          action={
            <div className="w-64">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                startIcon={<Search className="w-3.5 h-3.5" />}
                placeholder={isAr ? 'بحث بالكود أو اسم المشروع...' : 'Filter projects...'}
              />
            </div>
          }
        />
        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)] sticky top-0">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المشروع' : 'Project'}</th>
                <th className="px-4 py-3 text-end font-semibold">{isAr ? 'قيمة المشروع' : 'Project Value'}</th>
                <th className="px-4 py-3 text-end font-semibold">{isAr ? 'الدفعات المستلمة' : 'Payments Received'}</th>
                <th className="px-4 py-3 text-end font-semibold">{isAr ? 'المتبقي' : 'Remaining'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {filteredProjects.map((p) => {
                const remaining = Math.max(0, p.approvedBudget - p.paidAmount);
                const selected = p.id === activeProject.id;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={`cursor-pointer bunyan-transition ${
                      selected ? 'bg-[#B4863C]/8' : 'hover:bg-[var(--bg-surface-subtle)]'
                    }`}
                  >
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="font-semibold text-[var(--text-primary)]">{isAr ? p.name : p.nameEn}</div>
                      <div className="font-mono text-[11px] text-[#B4863C]">{p.code}</div>
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums font-semibold">
                      {formatAED(p.approvedBudget, lang)}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                      {formatAED(p.paidAmount, lang)}
                    </td>
                    <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums text-[var(--text-muted)]">
                      {formatAED(remaining, lang)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <BunyanExportCenter
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        project={activeProject}
        company={company}
        lang={lang}
      />
    </div>
  );
};
