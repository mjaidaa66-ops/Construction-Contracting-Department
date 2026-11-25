import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Box,
  Building2,
  CheckCircle2,
  Compass,
  FileArchive,
  FileDown,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Landmark,
  Layers,
  MapPin,
  Search,
  Settings,
  SlidersHorizontal,
  Wallet,
} from 'lucide-react';
import type {
  CompanyProfile,
  GovernmentTransaction,
  Language,
  Project,
  Role,
} from '../../types/bunyan';
import { DEFAULT_COMPANY_PROFILE } from '../../data/uaeSeedData';
import { computeProjectTelemetry, generateProjectBimElements } from '../../utils/gisTakeoffGenerator';
import { formatAED, PROJECT_STATUS_LABELS } from '../../utils/i18n';
import type { CloudSyncState } from '../../services/cloudSyncService';
import { deriveWorkspaceAlerts } from '../../utils/workspaceAlerts';
import { BunyanLogo } from '../common/BunyanLogo';
import { CloudSyncStatusBadge } from '../layout/CloudSyncStatusBadge';
import type { ActiveModule } from '../layout/Sidebar';
import {
  AlertPanel,
  Button,
  Card,
  CardHeader,
  HolographicPanel,
  KPIWidget,
  StatusIndicator,
} from '../ui';

const BunyanExportCenter = lazy(() =>
  import('../export/BunyanExportCenter').then((m) => ({
    default: m.BunyanExportCenter,
  }))
);

interface CommandCenterProps {
  projects: Project[];
  activeProject: Project;
  company?: CompanyProfile;
  transactions: GovernmentTransaction[];
  lang: Language;
  currentRole?: Role;
  userEmail?: string | null;
  syncState?: CloudSyncState;
  onSyncNow?: () => void;
  onNavigate: (mod: ActiveModule) => void;
  onSelectProject: (id: string) => void;
  onOpenSearch?: () => void;
  onOpenNotifications?: () => void;
}

type WidgetKey = 'charts' | 'activeProjects' | 'files' | 'alerts' | 'shortcuts';

const DEFAULT_WIDGETS: Record<WidgetKey, boolean> = {
  charts: true,
  activeProjects: true,
  files: true,
  alerts: true,
  shortcuts: true,
};

export const CommandCenter: React.FC<CommandCenterProps> = ({
  projects,
  activeProject,
  company = DEFAULT_COMPANY_PROFILE,
  transactions,
  lang,
  currentRole = 'admin',
  userEmail,
  syncState,
  onSyncNow,
  onNavigate,
  onSelectProject,
  onOpenSearch,
  onOpenNotifications,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [chartTab, setChartTab] = useState<'financials' | 'status'>('financials');
  const [visibleWidgets, setVisibleWidgets] = useState<Record<WidgetKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem('bunyan_command_widgets');
      return raw ? { ...DEFAULT_WIDGETS, ...JSON.parse(raw) } : DEFAULT_WIDGETS;
    } catch {
      return DEFAULT_WIDGETS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('bunyan_command_widgets', JSON.stringify(visibleWidgets));
    } catch {
      // ignore storage quota errors
    }
  }, [visibleWidgets]);

  // Strictly real portfolio calculations from live projects & transactions
  const portfolioStats = useMemo(() => {
    let totalBudget = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let activeCount = 0;
    let permittingCount = 0;
    let completedCount = 0;
    let suspendedCount = 0;
    let progressSum = 0;

    for (const p of projects) {
      totalBudget += p.approvedBudget;
      totalInvoiced += p.invoicedAmount;
      totalPaid += p.paidAmount;
      progressSum += p.actualProgress;
      if (p.status === 'under_construction') activeCount += 1;
      else if (p.status === 'permitting') permittingCount += 1;
      else if (p.status === 'completed') completedCount += 1;
      else suspendedCount += 1;
    }

    const avgProgress = projects.length > 0 ? Math.round(progressSum / projects.length) : 0;
    const collectionRate = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;
    const sample = projects.slice(0, 7);

    return {
      totalBudget,
      totalInvoiced,
      totalPaid,
      activeCount,
      permittingCount,
      completedCount,
      suspendedCount,
      avgProgress,
      collectionRate,
      budgetSpark: sample.map((p) => Math.max(1, Math.round(p.approvedBudget / 100000))),
      paidSpark: sample.map((p) => Math.max(1, Math.round(p.paidAmount / 100000))),
      progressSpark: sample.map((p) => p.actualProgress),
    };
  }, [projects]);

  const telemetry = useMemo(() => computeProjectTelemetry(activeProject), [activeProject]);

  const activeProjectsList = useMemo(
    () =>
      projects
        .filter((p) => p.status === 'under_construction' || p.status === 'permitting')
        .slice(0, 6),
    [projects]
  );

  // Recent real documents & engineering sheets aggregated across projects
  const recentFiles = useMemo(() => {
    const items: Array<{
      id: string;
      name: string;
      kind: 'document' | 'sheet';
      projectCode: string;
      projectId: string;
      meta: string;
    }> = [];

    for (const p of projects) {
      for (const doc of p.documents) {
        items.push({
          id: `${p.id}-${doc.id}`,
          name: doc.name,
          kind: 'document',
          projectCode: p.code,
          projectId: p.id,
          meta: `${doc.category} · ${doc.uploadedAt}`,
        });
      }
      if (items.length >= 12) break;
    }

    for (const sh of activeProject.takeoffSheets || []) {
      items.unshift({
        id: `sheet-${sh.id}`,
        name: `${sh.code} · ${lang === 'ar' ? sh.titleAr : sh.title}`,
        kind: 'sheet',
        projectCode: activeProject.code,
        projectId: activeProject.id,
        meta: `${sh.scaleLabel} · ${sh.sheetType}`,
      });
    }

    return items.slice(0, 6);
  }, [projects, activeProject, lang]);

  const alerts = useMemo(
    () =>
      deriveWorkspaceAlerts({
        projects,
        transactions,
        syncState: syncState || {
          status: 'offline_cached',
          isOnline: true,
          isAuthenticated: false,
          persistenceEnabled: true,
          lastSyncedAt: null,
          pendingCount: 0,
          lastError: null,
        },
        lang,
      }),
    [projects, transactions, syncState, lang]
  );

  // Top 5 projects financial comparison for interactive bar chart
  const topFinancialProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => b.approvedBudget - a.approvedBudget)
        .slice(0, 5),
    [projects]
  );
  const maxBarBudget = Math.max(1, ...topFinancialProjects.map((p) => p.approvedBudget));

  const shortcuts: Array<{
    id: ActiveModule;
    titleAr: string;
    titleEn: string;
    metaAr: string;
    metaEn: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'studio',
      titleAr: 'استوديو 2D + 3D BIM',
      titleEn: '2D + 3D BIM Studio',
      metaAr: 'PlanSwift + Three.js',
      metaEn: 'PlanSwift + Three.js',
      icon: Layers,
    },
    {
      id: 'bim',
      titleAr: 'محرك 5D BIM الثلاثي الأبعاد',
      titleEn: '5D BIM Engine',
      metaAr: `${(activeProject.bimElements !== undefined ? activeProject.bimElements : generateProjectBimElements(activeProject)).length} عنصر`,
      metaEn: `${(activeProject.bimElements !== undefined ? activeProject.bimElements : generateProjectBimElements(activeProject)).length} elements`,
      icon: Box,
    },
    {
      id: 'takeoff',
      titleAr: 'الحصر الهندسي PDF',
      titleEn: 'PDF Quantity Takeoff',
      metaAr: `${(activeProject.takeoffMeasurements || []).length} قياس`,
      metaEn: `${(activeProject.takeoffMeasurements || []).length} items`,
      icon: FileSpreadsheet,
    },
    {
      id: 'gis',
      titleAr: 'مستكشف الأراضي GIS',
      titleEn: 'GIS Plot Explorer',
      metaAr: `${activeProject.gisData.plotNumber}`,
      metaEn: `Plot ${activeProject.gisData.plotNumber}`,
      icon: Compass,
    },
    {
      id: 'government',
      titleAr: 'بوابة البلدية والهيئات',
      titleEn: 'Municipal Clearances',
      metaAr: `${transactions.length} معاملة`,
      metaEn: `${transactions.length} tracked`,
      icon: Landmark,
    },
    {
      id: 'financials',
      titleAr: 'الملخص المالي والمستخلصات',
      titleEn: 'Financial Controller',
      metaAr: 'AED · UAE VAT 5%',
      metaEn: 'AED · UAE VAT 5%',
      icon: Wallet,
    },
  ];

  const isAr = lang === 'ar';

  return (
    <div className="space-y-6">
      {/* 1. Executive Holographic Command Banner & Active Project Switcher */}
      <HolographicPanel className="p-5 sm:p-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3.5">
              <BunyanLogo size="lg" lang={lang} />
              <div className="flex flex-wrap items-center gap-2 text-xs border-s border-[var(--border-hairline)] ps-3">
                <span className="font-mono font-semibold text-[var(--accent-cyan)]">
                  {company.licenseNumber}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="text-[var(--text-secondary)]">
                  {isAr ? company.nameAr : company.nameEn}
                </span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="capitalize text-[var(--text-muted)]">
                  {userEmail || currentRole}
                </span>
              </div>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              {isAr
                ? 'مركز القيادة التنفيذي للهندسة والمشاريع'
                : 'Executive Engineering Command Center'}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {isAr
                ? 'نظرة شاملة وفورية على محفظة مشاريع بلدية الشارقة، التدفقات المالية المعتمدة، نماذج 5D BIM، وأرشيف المخططات.'
                : 'Real-time operational overview across Sharjah Municipality projects, certified cashflow, 5D BIM models, and engineering blueprints.'}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onOpenSearch && (
                <Button variant="outline" size="sm" icon={<Search className="w-3.5 h-3.5 text-[var(--accent-cyan)]" />} onClick={onOpenSearch}>
                  {isAr ? 'بحث في المنصة (Ctrl+K)' : 'Global Search (Ctrl+K)'}
                </Button>
              )}
              <Button variant="cyan" size="sm" icon={<FileDown className="w-3.5 h-3.5" />} onClick={() => setExportOpen(true)}>
                {isAr ? 'إصدار تقرير رسمي PDF / Excel' : 'Official Export PDF / Excel'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                onClick={() => setCustomizeOpen((v) => !v)}
              >
                {isAr ? 'تخصيص اللوحة' : 'Customize Widgets'}
              </Button>
            </div>
          </div>

          {/* Active Project Context Card */}
          <div className="w-full xl:w-[420px] shrink-0 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                {isAr ? 'المشروع النشط في بيئة العمل' : 'Active Workspace Project'}
              </span>
              {syncState && onSyncNow && (
                <CloudSyncStatusBadge syncState={syncState} lang={lang} onSyncNow={onSyncNow} />
              )}
            </div>

            <select
              value={activeProject.id}
              onChange={(e) => onSelectProject(e.target.value)}
              aria-label={isAr ? 'اختيار المشروع النشط' : 'Select Active Project'}
              className="w-full h-9 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)]/45"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {isAr ? p.name : p.nameEn}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-hairline)] text-[11px]">
              <div className="min-w-0">
                <div className="text-[var(--text-muted)] flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[var(--accent-cyan)] shrink-0" />
                  <span className="truncate">{isAr ? 'القطعة' : 'Plot'}</span>
                </div>
                <div dir="ltr" className="font-mono tabular-nums font-semibold text-[var(--text-primary)] truncate mt-0.5">
                  {activeProject.gisData.plotNumber}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[var(--text-muted)] flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-[var(--accent-gold)] shrink-0" />
                  <span className="truncate">{isAr ? 'الخرسانة' : 'Concrete'}</span>
                </div>
                <div dir="ltr" className="font-mono tabular-nums font-semibold text-[var(--text-primary)] truncate mt-0.5">
                  {telemetry.concreteM3} m³
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[var(--text-muted)]">{isAr ? 'الإنجاز' : 'Progress'}</div>
                <div dir="ltr" className="font-mono tabular-nums font-bold text-[#00E5A8] mt-0.5">
                  {telemetry.actualProgress}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customizable Widget Toggle Bar */}
        {customizeOpen && (
          <div className="mt-4 pt-4 border-t border-[var(--border-hairline)] flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[var(--text-muted)] font-medium me-1">
              {isAr ? 'إظهار أقسام لوحة القيادة:' : 'Visible Dashboard Sections:'}
            </span>
            {(
              [
                ['charts', isAr ? 'الرسوم المالية والتنفيذية' : 'Financial & Status Charts'],
                ['activeProjects', isAr ? 'المشاريع النشطة' : 'Active Projects'],
                ['files', isAr ? 'آخر الملفات والمخططات' : 'Recent Files & Sheets'],
                ['alerts', isAr ? 'التنبيهات والإشعارات' : 'Alerts & Notifications'],
                ['shortcuts', isAr ? 'اختصارات الوحدات' : 'Module Shortcuts'],
              ] as Array<[WidgetKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setVisibleWidgets((prev) => ({ ...prev, [key]: !prev[key] }))
                }
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium cursor-pointer bunyan-transition ${
                  visibleWidgets[key]
                    ? 'border-[var(--accent-cyan)]/50 bg-[#2563EB]/10 dark:bg-[#38BDF8]/12 text-[var(--accent-cyan)]'
                    : 'border-[var(--border-hairline)] text-[var(--text-muted)]'
                }`}
              >
                {visibleWidgets[key] ? '✓ ' : ''}
                {label}
              </button>
            ))}
          </div>
        )}
      </HolographicPanel>

      {/* 2. Four Core Portfolio KPIs (100% Real Aggregated Data) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIWidget
          label={isAr ? 'إجمالي المشاريع الهندسية' : 'Total Portfolio Projects'}
          value={projects.length}
          accent="cyan"
          icon={<FolderKanban className="w-4 h-4" />}
          sparkline={portfolioStats.progressSpark}
          subtitle={`${isAr ? 'تراخيص' : 'Permits'}: ${portfolioStats.permittingCount} · ${isAr ? 'منجز' : 'Done'}: ${portfolioStats.completedCount}`}
          onClick={() => onNavigate('projects')}
        />

        <KPIWidget
          label={isAr ? 'إجمالي قيمة العقود والميزانيات' : 'Total Portfolio Contract Value'}
          value={formatAED(portfolioStats.totalBudget, lang)}
          accent="gold"
          icon={<Wallet className="w-4 h-4" />}
          sparkline={portfolioStats.budgetSpark}
          subtitle={`${isAr ? 'المتبقي:' : 'Remaining:'} ${formatAED(Math.max(0, portfolioStats.totalBudget - portfolioStats.totalPaid), lang)}`}
          onClick={() => onNavigate('financials')}
        />

        <KPIWidget
          label={isAr ? 'إجمالي الدفعات المستلمة' : 'Total Payments Received'}
          value={formatAED(portfolioStats.totalPaid, lang)}
          accent="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
          sparkline={portfolioStats.paidSpark}
          delta={`${portfolioStats.collectionRate}%`}
          deltaTone="positive"
          subtitle={isAr ? 'نسبة التحصيل الفعلي' : 'Portfolio Collection Rate'}
          onClick={() => onNavigate('financials')}
        />

        <KPIWidget
          label={isAr ? 'المشاريع النشطة قيد التنفيذ' : 'Active Construction Projects'}
          value={`${portfolioStats.activeCount} / ${projects.length}`}
          accent="blue"
          icon={<BarChart3 className="w-4 h-4" />}
          sparkline={portfolioStats.progressSpark}
          delta={`${portfolioStats.avgProgress}%`}
          deltaTone="neutral"
          subtitle={isAr ? 'متوسط الإنجاز العام' : 'Avg Portfolio Progress'}
          onClick={() => onNavigate('projects')}
        />
      </section>

      {/* 3. Interactive Charts & Real Alerts */}
      {(visibleWidgets.charts || visibleWidgets.alerts) && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {visibleWidgets.charts && (
            <Card className={visibleWidgets.alerts ? 'xl:col-span-8' : 'xl:col-span-12'}>
              <CardHeader
                icon={<BarChart3 className="w-4 h-4" />}
                title={isAr ? 'تحليل المحفظة المالية وتقدم المشاريع' : 'Portfolio Financial & Progress Analytics'}
                subtitle={isAr ? 'مقارنة قيمة المشاريع والدفعات المستلمة لأعلى المشاريع' : 'Project Value vs Payments Received across top capital projects'}
                action={
                  <div className="inline-flex rounded-xl border border-[var(--border-hairline)] p-0.5 bg-[var(--bg-surface-subtle)] text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setChartTab('financials')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer bunyan-transition ${
                        chartTab === 'financials'
                          ? 'bg-gradient-to-l from-[#2563EB] to-[#0284C7] dark:from-[#3B82F6] dark:to-[#0284C7] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {isAr ? 'الدفعات والقيمة' : 'Values & Payments'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartTab('status')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer bunyan-transition ${
                        chartTab === 'status'
                          ? 'bg-gradient-to-l from-[#2563EB] to-[#0284C7] dark:from-[#3B82F6] dark:to-[#0284C7] text-white'
                          : 'text-[var(--text-secondary)]'
                      }`}
                    >
                      {isAr ? 'توزيع الحالات' : 'Status Mix'}
                    </button>
                  </div>
                }
              />

              <div className="p-5">
                {chartTab === 'financials' ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-slate-400/50 dark:bg-slate-600" />
                        <span>{isAr ? 'قيمة المشروع' : 'Project Value'}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#00E5A8]" />
                        <span>{isAr ? 'الدفعات المستلمة' : 'Payments Received'}</span>
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      {topFinancialProjects.map((proj) => {
                        const budgetPct = Math.round((proj.approvedBudget / maxBarBudget) * 100);
                        const paidPct =
                          proj.approvedBudget > 0
                            ? Math.min(100, Math.round((proj.paidAmount / proj.approvedBudget) * 100))
                            : 0;

                        return (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() => onSelectProject(proj.id)}
                            className="w-full text-start group space-y-1.5 cursor-pointer"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] truncate">
                                <span className="font-mono text-[var(--accent-cyan)] me-1.5">{proj.code}</span>
                                {isAr ? proj.name : proj.nameEn}
                              </span>
                              <span dir="ltr" className="font-mono tabular-nums text-[11px] text-[var(--text-secondary)] shrink-0">
                                {formatAED(proj.approvedBudget, lang)}
                              </span>
                            </div>
                            <div
                              className="h-3 rounded-full bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] overflow-hidden relative"
                              style={{ width: `${Math.max(20, budgetPct)}%` }}
                            >
                              <div
                                className="h-full bg-gradient-to-l from-[#10B981] to-[#38BDF8] absolute inset-y-0 start-0 rounded-full"
                                style={{ width: `${paidPct}%` }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                    {(
                      [
                        ['under_construction', portfolioStats.activeCount, 'bg-emerald-500'],
                        ['permitting', portfolioStats.permittingCount, 'bg-amber-500'],
                        ['completed', portfolioStats.completedCount, 'bg-sky-500'],
                        ['suspended', portfolioStats.suspendedCount, 'bg-rose-500'],
                      ] as const
                    ).map(([statusKey, count, barClass]) => {
                      const pct =
                        projects.length > 0 ? Math.round((count / projects.length) * 100) : 0;
                      return (
                        <div
                          key={statusKey}
                          className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[var(--text-primary)]">
                              {isAr
                                ? PROJECT_STATUS_LABELS[statusKey].ar
                                : PROJECT_STATUS_LABELS[statusKey].en}
                            </span>
                            <span dir="ltr" className="font-mono tabular-nums font-bold text-[var(--text-primary)]">
                              {count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}

          {visibleWidgets.alerts && (
            <div className={visibleWidgets.charts ? 'xl:col-span-4' : 'xl:col-span-12'}>
              <AlertPanel
                alerts={alerts}
                lang={lang}
                maxItems={5}
                onViewAll={onOpenNotifications}
                onSelectAlert={(al) => {
                  if (al.projectId) onSelectProject(al.projectId);
                  onNavigate(al.targetModule);
                }}
              />
            </div>
          )}
        </section>
      )}

      {/* 4. Active Projects + Recent Documents/Sheets + Account & Sync Card */}
      {(visibleWidgets.activeProjects || visibleWidgets.files) && (
        <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {visibleWidgets.activeProjects && (
            <Card className={visibleWidgets.files ? 'xl:col-span-7' : 'xl:col-span-12'}>
              <CardHeader
                icon={<FolderKanban className="w-4 h-4" />}
                title={isAr ? 'آخر المشاريع والأنشطة الهندسية' : 'Active Projects & Field Progress'}
                action={
                  <Button variant="ghost" size="xs" onClick={() => onNavigate('projects')}>
                    {isAr ? `عرض الـ ${projects.length}` : `View All ${projects.length}`}
                  </Button>
                }
              />
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                    <tr>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'المشروع' : 'Project'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'القطاع' : 'Sector'}</th>
                      <th className="px-4 py-2.5 text-end font-semibold">{isAr ? 'الإنجاز' : 'Progress'}</th>
                      <th className="px-4 py-2.5 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {activeProjectsList.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => {
                          onSelectProject(p.id);
                          onNavigate('projects');
                        }}
                        className="hover:bg-[var(--bg-surface-subtle)] cursor-pointer bunyan-transition"
                      >
                        <td className="px-4 py-2.5 min-w-[200px]">
                          <div className="font-semibold text-[var(--text-primary)] truncate">
                            {isAr ? p.name : p.nameEn}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--accent-cyan)]">
                            {p.code} · {p.gisData.plotNumber}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">
                          {p.gisData.sectorName}
                        </td>
                        <td dir="ltr" className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                          {p.actualProgress}%
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <StatusIndicator
                            tone={
                              p.status === 'under_construction'
                                ? 'success'
                                : p.status === 'permitting'
                                ? 'warning'
                                : p.status === 'completed'
                                ? 'info'
                                : 'danger'
                            }
                            label={
                              isAr
                                ? PROJECT_STATUS_LABELS[p.status].ar
                                : PROJECT_STATUS_LABELS[p.status].en
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {visibleWidgets.files && (
            <Card className={visibleWidgets.activeProjects ? 'xl:col-span-5' : 'xl:col-span-12'}>
              <CardHeader
                icon={<FileArchive className="w-4 h-4" />}
                title={isAr ? 'آخر الملفات والمخططات' : 'Recent Sheets & Documents'}
                action={
                  <Button variant="ghost" size="xs" onClick={() => onNavigate('documents')}>
                    {isAr ? 'أرشيف الوثائق' : 'Open Vault'}
                  </Button>
                }
              />
              <div className="divide-y divide-[var(--border-hairline)]">
                {recentFiles.length === 0 ? (
                  <div className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                    {isAr
                      ? 'لا توجد ملفات أو مستندات مرفوعة بعد. افتح أرشيف الوثائق لاستيراد ملفات المشروع.'
                      : 'No project documents uploaded yet. Open the Vault to import files.'}
                  </div>
                ) : (
                  recentFiles.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectProject(item.projectId);
                        onNavigate(item.kind === 'sheet' ? 'takeoff' : 'documents');
                      }}
                      className="w-full px-4 py-3 flex items-center justify-between gap-3 text-start hover:bg-[var(--bg-surface-subtle)] bunyan-transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-[var(--accent-cyan)] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                            {item.projectCode} · {item.meta}
                          </div>
                        </div>
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                    </button>
                  ))
                )}
              </div>

              <div className="px-4 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)]">
                  {isAr ? 'الحساب والنسخ الاحتياطي السحابي' : 'Account, Cloud Sync & Backup'}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className="inline-flex items-center gap-1 font-semibold text-[var(--accent-cyan)] hover:underline cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إدارة' : 'Manage'}</span>
                </button>
              </div>
            </Card>
          )}
        </section>
      )}

      {/* 5. Quick Engineering Module Shortcuts */}
      {visibleWidgets.shortcuts && (
        <section className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {isAr ? 'اختصارات سريعة للوحدات الهندسية' : 'Quick Engineering Workspace Shortcuts'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shortcuts.map((sc) => {
              const Icon = sc.icon;
              return (
                <Card
                  key={sc.id}
                  padded
                  interactive
                  onClick={() => onNavigate(sc.id)}
                  className="flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-center text-[var(--accent-cyan)] shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] truncate">
                        {isAr ? sc.titleAr : sc.titleEn}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-0.5">
                        {isAr ? sc.metaAr : sc.metaEn}
                      </div>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--accent-cyan)] shrink-0" />
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {exportOpen && (
        <Suspense fallback={null}>
          <BunyanExportCenter
            isOpen={exportOpen}
            onClose={() => setExportOpen(false)}
            project={activeProject}
            company={company}
            lang={lang}
          />
        </Suspense>
      )}
    </div>
  );
};
