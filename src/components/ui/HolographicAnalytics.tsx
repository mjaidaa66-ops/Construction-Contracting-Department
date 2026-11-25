import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarRange,
  FileText,
  FolderKanban,
  Info,
  Printer,
  TrendingUp,
} from 'lucide-react';
import type { Language, Project, ProjectStatus } from '../../types/bunyan';
import { formatAED, PROJECT_STATUS_LABELS } from '../../utils/i18n';
import type { WorkspaceAlert } from '../../utils/workspaceAlerts';
import { Button } from './Button';
import { Card, CardHeader } from './Card';
import { EmptyState, StatusBadge, type StatusTone } from './StateViews';

/* ============================================================================
 * 1. KPIWidget — Animated Futuristic Metric Card with Sparkline
 * ========================================================================== */
export interface KPIWidgetProps {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  delta?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  icon?: React.ReactNode;
  accent?: 'cyan' | 'blue' | 'gold' | 'green' | 'orange';
  sparkline?: number[];
  onClick?: () => void;
  className?: string;
}

const ACCENT_STROKE: Record<NonNullable<KPIWidgetProps['accent']>, string> = {
  cyan: '#0EA5E9',
  blue: '#2563EB',
  gold: '#D6A64F',
  green: '#10B981',
  orange: '#F59E0B',
};

const ACCENT_BADGE: Record<NonNullable<KPIWidgetProps['accent']>, string> = {
  cyan: 'text-[#0284C7] dark:text-[#38BDF8] bg-[#0284C7]/10 dark:bg-[#38BDF8]/12 border-[#0284C7]/25 dark:border-[#38BDF8]/30',
  blue: 'text-[#2563EB] dark:text-[#60A5FA] bg-[#2563EB]/10 border-[#2563EB]/25',
  gold: 'text-[#B4863C] dark:text-[#D6A64F] bg-[#B4863C]/10 dark:bg-[#D6A64F]/12 border-[#B4863C]/25 dark:border-[#D6A64F]/30',
  green: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  orange: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
};

export const KPIWidget: React.FC<KPIWidgetProps> = ({
  label,
  value,
  subtitle,
  delta,
  deltaTone = 'neutral',
  icon,
  accent = 'cyan',
  sparkline,
  onClick,
  className = '',
}) => {
  const sparkPath = useMemo(() => {
    if (!sparkline || sparkline.length < 2) return null;
    const min = Math.min(...sparkline);
    const max = Math.max(...sparkline);
    const span = Math.max(1, max - min);
    const w = 120;
    const h = 34;
    const pts = sparkline.map((v, idx) => {
      const x = (idx / (sparkline.length - 1)) * w;
      const y = h - 4 - ((v - min) / span) * (h - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = `M ${pts.join(' L ')}`;
    const area = `${line} L ${w},${h} L 0,${h} Z`;
    return { line, area };
  }, [sparkline]);

  const strokeColor = ACCENT_STROKE[accent];
  const gradId = `kpi-spark-${accent}-${label.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={className}
    >
      <Card
        padded
        interactive={Boolean(onClick)}
        onClick={onClick}
        glow={accent === 'gold' ? 'gold' : accent === 'green' ? 'emerald' : 'cyan'}
        className="relative overflow-hidden h-full flex flex-col justify-between gap-2.5"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text-muted)] leading-snug">
            {label}
          </span>
          {icon && (
            <span
              className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${ACCENT_BADGE[accent]}`}
            >
              {icon}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div
              dir="ltr"
              className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] truncate"
            >
              {value}
            </div>
            {(subtitle || delta) && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px]">
                {delta && (
                  <span
                    dir="ltr"
                    className={`font-mono tabular-nums font-semibold ${
                      deltaTone === 'positive'
                        ? 'text-emerald-600 dark:text-[#00E5A8]'
                        : deltaTone === 'negative'
                        ? 'text-rose-600 dark:text-[#FF405C]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {delta}
                  </span>
                )}
                {subtitle && <span className="text-[var(--text-muted)] truncate">{subtitle}</span>}
              </div>
            )}
          </div>

          {sparkPath && (
            <svg
              viewBox="0 0 120 34"
              className="w-24 h-8 shrink-0 overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.34" />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={sparkPath.area} fill={`url(#${gradId})`} />
              <path
                d={sparkPath.line}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </Card>
    </motion.div>
  );
};

/* ============================================================================
 * 2. FinancialChart — Real Portfolio Cashflow & Financial Completion Analytics
 * ========================================================================== */
export interface FinancialChartProps {
  projects: Project[];
  lang: Language;
  onSelectProject?: (projectId: string) => void;
}

export const FinancialChart: React.FC<FinancialChartProps> = ({
  projects,
  lang,
  onSelectProject,
}) => {
  const isAr = lang === 'ar';
  const [periodFilter, setPeriodFilter] = useState<'all' | 'active' | 'top6'>('top6');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const scopedProjects = useMemo(() => {
    const base =
      periodFilter === 'active'
        ? projects.filter((p) => p.status === 'under_construction' || p.status === 'permitting')
        : projects;
    const sorted = [...base].sort((a, b) => b.approvedBudget - a.approvedBudget);
    return periodFilter === 'all' ? sorted.slice(0, 10) : sorted.slice(0, 6);
  }, [projects, periodFilter]);

  const metrics = useMemo(() => {
    let contractTotal = 0;
    let invoicedTotal = 0;
    let paidTotal = 0;
    for (const p of scopedProjects) {
      contractTotal += p.approvedBudget;
      invoicedTotal += p.invoicedAmount;
      paidTotal += p.paidAmount;
    }
    const remainingTotal = Math.max(0, contractTotal - paidTotal);
    const completionPct = contractTotal > 0 ? Math.round((paidTotal / contractTotal) * 100) : 0;
    const certifiedPct = contractTotal > 0 ? Math.round((invoicedTotal / contractTotal) * 100) : 0;
    return {
      contractTotal,
      invoicedTotal,
      paidTotal,
      remainingTotal,
      completionPct,
      certifiedPct,
    };
  }, [scopedProjects]);

  const maxBudget = Math.max(1, ...scopedProjects.map((p) => p.approvedBudget));
  const hoveredProj = scopedProjects.find((p) => p.id === hoveredId) || scopedProjects[0] || null;

  // Donut Ring SVG Geometry
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const paidStroke = (Math.min(100, metrics.completionPct) / 100) * circumference;
  const certifiedExtraPct = Math.max(0, Math.min(100, metrics.certifiedPct) - metrics.completionPct);
  const certifiedStroke = (certifiedExtraPct / 100) * circumference;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<BarChart3 className="w-4 h-4" />}
        title={isAr ? 'الذكاء المالي والتدفقات المعتمدة (AED)' : 'Financial Intelligence & Certified Cashflow'}
        subtitle={
          isAr
            ? 'قيمة العقود مقابل المستخلصات المعتمدة والدفعات المستلمة ونسبة الإنجاز المالي'
            : 'Contract value vs certified claims, received payments, and financial completion ratio'
        }
        action={
          <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-1 text-[11px] font-semibold">
            <CalendarRange className="w-3.5 h-3.5 text-[var(--accent-cyan)] ms-1.5" />
            {(
              [
                ['top6', isAr ? 'أعلى 6 مشاريع' : 'Top 6'],
                ['active', isAr ? 'النشطة فقط' : 'Active Only'],
                ['all', isAr ? 'أوسع محفظة (10)' : 'Top 10'],
              ] as const
            ).map(([key, lbl]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriodFilter(key)}
                className={`px-2.5 py-1 rounded-lg bunyan-transition cursor-pointer whitespace-nowrap ${
                  periodFilter === key
                    ? 'bg-gradient-to-l from-[#2563EB] to-[#0284C7] dark:from-[#3B82F6] dark:to-[#0284C7] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        }
      />

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left/Start: Radial Completion & Financial Breakdown */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] space-y-4">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
              <circle
                cx="66"
                cy="66"
                r={radius}
                fill="none"
                stroke="rgba(127, 151, 184, 0.16)"
                strokeWidth="12"
              />
              {certifiedStroke > 0 && (
                <circle
                  cx="66"
                  cy="66"
                  r={radius}
                  fill="none"
                  stroke="#D6A64F"
                  strokeWidth="12"
                  strokeDasharray={`${paidStroke + certifiedStroke} ${circumference}`}
                  strokeLinecap="round"
                />
              )}
              <circle
                cx="66"
                cy="66"
                r={radius}
                fill="none"
                stroke="#00E5A8"
                strokeWidth="12"
                strokeDasharray={`${paidStroke} ${circumference}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                {metrics.completionPct}%
              </span>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                {isAr ? 'الإنجاز المالي' : 'Collected'}
              </span>
            </div>
          </div>

          <div className="w-full space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-full bg-[#1677FF]" />
                <span>{isAr ? 'إجمالي قيمة العقود' : 'Contract Value'}</span>
              </span>
              <span dir="ltr" className="font-mono tabular-nums font-bold text-[var(--text-primary)]">
                {formatAED(metrics.contractTotal, lang)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-full bg-[#D6A64F]" />
                <span>{isAr ? 'المستخلصات المعتمدة' : 'Approved Claims'}</span>
              </span>
              <span dir="ltr" className="font-mono tabular-nums font-semibold text-[#B4863C] dark:text-[#D6A64F]">
                {formatAED(metrics.invoicedTotal, lang)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="w-2 h-2 rounded-full bg-[#00E5A8]" />
                <span>{isAr ? 'الدفعات المستلمة' : 'Payments Received'}</span>
              </span>
              <span dir="ltr" className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-[#00E5A8]">
                {formatAED(metrics.paidTotal, lang)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)]">{isAr ? 'المتبقي للتحصيل' : 'Remaining'}</span>
              <span dir="ltr" className="font-mono tabular-nums font-semibold text-[var(--accent-cyan)]">
                {formatAED(metrics.remainingTotal, lang)}
              </span>
            </div>
          </div>
        </div>

        {/* Right/End: Interactive Multi-Series Comparison Bars + Active Tooltip Bar */}
        <div className="lg:col-span-8 space-y-4">
          {/* Interactive Hover Readout Strip */}
          {hoveredProj && (
            <div className="px-4 py-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span dir="ltr" className="font-mono font-bold text-[var(--accent-cyan)]">
                  {hoveredProj.code}
                </span>
                <span className="font-semibold text-[var(--text-primary)] truncate">
                  {isAr ? hoveredProj.name : hoveredProj.nameEn}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[11px]">
                <span className="text-[var(--text-secondary)]">
                  {isAr ? 'العقد:' : 'Contract:'} {formatAED(hoveredProj.approvedBudget, lang)}
                </span>
                <span className="text-emerald-600 dark:text-[#00E5A8]">
                  {isAr ? 'المستلم:' : 'Paid:'} {formatAED(hoveredProj.paidAmount, lang)}
                </span>
                <span className="text-[var(--accent-gold)]">
                  {hoveredProj.approvedBudget > 0
                    ? Math.round((hoveredProj.paidAmount / hoveredProj.approvedBudget) * 100)
                    : 0}
                  %
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {scopedProjects.map((proj) => {
              const budgetWidth = Math.max(16, Math.round((proj.approvedBudget / maxBudget) * 100));
              const invoicedPct =
                proj.approvedBudget > 0
                  ? Math.min(100, Math.round((proj.invoicedAmount / proj.approvedBudget) * 100))
                  : 0;
              const paidPct =
                proj.approvedBudget > 0
                  ? Math.min(100, Math.round((proj.paidAmount / proj.approvedBudget) * 100))
                  : 0;

              return (
                <button
                  key={proj.id}
                  type="button"
                  onMouseEnter={() => setHoveredId(proj.id)}
                  onFocus={() => setHoveredId(proj.id)}
                  onClick={() => onSelectProject?.(proj.id)}
                  className="w-full text-start group space-y-1.5 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] bunyan-transition truncate">
                      <span dir="ltr" className="font-mono text-[var(--accent-cyan)] me-2">
                        {proj.code}
                      </span>
                      {isAr ? proj.name : proj.nameEn}
                    </span>
                    <span dir="ltr" className="font-mono tabular-nums text-[11px] text-[var(--text-secondary)] shrink-0">
                      {formatAED(proj.approvedBudget, lang)}
                    </span>
                  </div>

                  <div
                    className="h-3.5 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] overflow-hidden relative"
                    style={{ width: `${budgetWidth}%` }}
                  >
                    {/* Invoiced Layer */}
                    <div
                      className="h-full bg-[#D6A64F]/55 absolute inset-y-0 start-0 rounded-full"
                      style={{ width: `${invoicedPct}%` }}
                    />
                    {/* Paid Layer */}
                    <div
                      className="h-full bg-gradient-to-l from-[#10B981] to-[#38BDF8] absolute inset-y-0 start-0 rounded-full bunyan-transition"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
};

/* ============================================================================
 * 3. ProjectDataTable — Unified Enterprise Data Table
 * ========================================================================== */
export interface ProjectDataTableProps {
  projects: Project[];
  activeProjectId: string;
  lang: Language;
  onSelectProject: (id: string) => void;
  onOpenProjectModule?: (projectId: string, module: 'projects' | 'bim' | 'financials') => void;
  maxRows?: number;
}

const STATUS_TONE: Record<ProjectStatus, StatusTone> = {
  under_construction: 'success',
  permitting: 'warning',
  completed: 'info',
  suspended: 'danger',
};

export const ProjectDataTable: React.FC<ProjectDataTableProps> = ({
  projects,
  activeProjectId,
  lang,
  onSelectProject,
  onOpenProjectModule,
  maxRows = 8,
}) => {
  const isAr = lang === 'ar';
  const rows = projects.slice(0, maxRows);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban className="w-5 h-5" />}
        title={isAr ? 'لا توجد مشاريع مسجلة' : 'No Projects Found'}
        description={isAr ? 'أضف مشروعاً جديداً لعرضه في لوحة المتابعة.' : 'Create a project to populate the intelligence table.'}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-start text-xs">
        <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
          <tr>
            <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المشروع والكود' : 'Project & Code'}</th>
            <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المقاول / الاستشاري' : 'Contractor / Consultant'}</th>
            <th className="px-4 py-3 text-end font-semibold">{isAr ? 'قيمة العقد' : 'Contract Value'}</th>
            <th className="px-4 py-3 text-end font-semibold">{isAr ? 'الإنجاز %' : 'Completion'}</th>
            <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
            <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الرخصة (بداية - نهاية)' : 'Permit Window'}</th>
            <th className="px-4 py-3 text-end font-semibold">{isAr ? 'إجراء' : 'Action'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-hairline)]">
          {rows.map((p) => {
            const isSelected = p.id === activeProjectId;
            return (
              <tr
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className={`cursor-pointer bunyan-transition ${
                  isSelected
                    ? 'bg-[#2563EB]/8 dark:bg-[#38BDF8]/10'
                    : 'hover:bg-[var(--bg-surface-subtle)]'
                }`}
              >
                <td className="px-4 py-3 min-w-[200px]">
                  <div className="font-bold text-[var(--text-primary)] truncate">
                    {isAr ? p.name : p.nameEn}
                  </div>
                  <div dir="ltr" className="text-[11px] font-mono text-[var(--accent-cyan)] mt-0.5">
                    {p.code} · {p.gisData.plotNumber}
                  </div>
                </td>
                <td className="px-4 py-3 min-w-[160px] text-[var(--text-secondary)]">
                  <div className="truncate">{p.contractorBranch}</div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{p.consultantOffice}</div>
                </td>
                <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums font-bold text-[var(--text-primary)] whitespace-nowrap">
                  {formatAED(p.approvedBudget, lang)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-[var(--bg-surface-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#38BDF8] to-[#2563EB]"
                        style={{ width: `${Math.min(100, Math.max(0, p.actualProgress))}%` }}
                      />
                    </div>
                    <span dir="ltr" className="font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                      {p.actualProgress}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge
                    tone={STATUS_TONE[p.status]}
                    label={isAr ? PROJECT_STATUS_LABELS[p.status].ar : PROJECT_STATUS_LABELS[p.status].en}
                  />
                </td>
                <td dir="ltr" className="px-4 py-3 font-mono tabular-nums text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                  {p.permitDate} → {p.permitExpiryDate}
                </td>
                <td className="px-4 py-3 text-end whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1">
                    <Button
                      variant="cyan"
                      size="xs"
                      onClick={() =>
                        onOpenProjectModule
                          ? onOpenProjectModule(p.id, 'bim')
                          : onSelectProject(p.id)
                      }
                    >
                      5D BIM
                    </Button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenProjectModule
                          ? onOpenProjectModule(p.id, 'projects')
                          : onSelectProject(p.id)
                      }
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-cyan)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                      aria-label={isAr ? `فتح ${p.code}` : `Open ${p.code}`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/* ============================================================================
 * 4. AlertPanel — Intelligent Operational & Municipal Alerts Feed
 * ========================================================================== */
export interface AlertPanelProps {
  alerts: WorkspaceAlert[];
  lang: Language;
  onSelectAlert: (alert: WorkspaceAlert) => void;
  onViewAll?: () => void;
  maxItems?: number;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({
  alerts,
  lang,
  onSelectAlert,
  onViewAll,
  maxItems = 5,
}) => {
  const isAr = lang === 'ar';

  return (
    <Card className="h-full flex flex-col">
      <CardHeader
        icon={<Bell className="w-4 h-4" />}
        title={isAr ? 'التنبيهات الذكية والتشغيلية' : 'Intelligent Operational Alerts'}
        badge={
          alerts.length > 0 ? (
            <span
              dir="ltr"
              className="px-2 py-0.5 rounded-full bg-[#FF405C]/15 text-[#FF405C] font-mono text-[10.5px] font-bold"
            >
              {alerts.length}
            </span>
          ) : undefined
        }
        action={
          onViewAll && (
            <Button variant="ghost" size="xs" onClick={onViewAll}>
              {isAr ? 'عرض الكل' : 'View All'}
            </Button>
          )
        }
      />
      <div className="divide-y divide-[var(--border-hairline)] flex-1">
        {alerts.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--text-muted)]">
            {isAr ? 'جميع المشاريع والمعاملات تعمل ضمن المسار النظامي.' : 'All projects and clearances are nominal.'}
          </div>
        ) : (
          alerts.slice(0, maxItems).map((al) => (
            <button
              key={al.id}
              type="button"
              onClick={() => onSelectAlert(al)}
              className="w-full px-4 py-3.5 text-start hover:bg-[var(--bg-surface-subtle)] flex items-start gap-3 bunyan-transition cursor-pointer"
            >
              <span className="mt-0.5 shrink-0">
                {al.severity === 'critical' ? (
                  <AlertOctagon className="w-4 h-4 text-[#FF405C]" />
                ) : al.severity === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-[#FF9D42]" />
                ) : (
                  <Info className="w-4 h-4 text-[var(--accent-cyan)]" />
                )}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {isAr ? al.titleAr : al.titleEn}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                  {isAr ? al.detailAr : al.detailEn}
                </div>
                {al.dateLabel && (
                  <div dir="ltr" className="text-[10px] font-mono text-[var(--text-muted)]">
                    {al.dateLabel}
                  </div>
                )}
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-1" />
            </button>
          ))
        )}
      </div>
    </Card>
  );
};

/* ============================================================================
 * 5. ReportTemplate — Holographic Report Shell Wrapper
 * ========================================================================== */
export interface ReportTemplateProps {
  title: string;
  subtitle?: string;
  reportCode?: string;
  onPrint?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const ReportTemplate: React.FC<ReportTemplateProps> = ({
  title,
  subtitle,
  reportCode,
  onPrint,
  actions,
  children,
}) => (
  <Card className="overflow-hidden">
    <CardHeader
      icon={<FileText className="w-4 h-4" />}
      title={title}
      subtitle={subtitle}
      badge={
        reportCode ? (
          <span dir="ltr" className="font-mono text-[10.5px] text-[var(--accent-cyan)]">
            {reportCode}
          </span>
        ) : undefined
      }
      action={
        <div className="flex items-center gap-2">
          {actions}
          {onPrint && (
            <Button variant="cyan" size="xs" icon={<Printer className="w-3.5 h-3.5" />} onClick={onPrint}>
              Print
            </Button>
          )}
        </div>
      }
    />
    <div className="p-5">{children}</div>
  </Card>
);

export const TrendingSummaryBadge: React.FC<{ value: string }> = ({ value }) => (
  <span
    dir="ltr"
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00E5A8]/12 text-[#00E5A8] border border-[#00E5A8]/30 font-mono text-[10.5px] font-semibold"
  >
    <TrendingUp className="w-3 h-3" />
    {value}
  </span>
);
