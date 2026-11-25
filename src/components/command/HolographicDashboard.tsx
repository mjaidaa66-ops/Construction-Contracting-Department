import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Box,
  Building2,
  CheckCircle2,
  Columns2,
  Compass,
  Cpu,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  Layers,
  MapPin,
  Printer,
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
import type { CloudSyncState } from '../../services/cloudSyncService';
import { computeProjectTelemetry, generateProjectBimElements } from '../../utils/gisTakeoffGenerator';
import { formatAED, PROJECT_STATUS_LABELS } from '../../utils/i18n';
import { deriveWorkspaceAlerts } from '../../utils/workspaceAlerts';
import type { ActiveModule } from '../layout/Sidebar';
import {
  AlertPanel,
  Button,
  Card,
  CardHeader,
  FinancialChart,
  HolographicPanel,
  KPIWidget,
  ProjectDataTable,
  StatusBadge,
} from '../ui';

interface HolographicDashboardProps {
  projects: Project[];
  activeProject: Project;
  company?: CompanyProfile;
  transactions: GovernmentTransaction[];
  lang: Language;
  currentRole: Role;
  syncState: CloudSyncState;
  onNavigate: (mod: ActiveModule) => void;
  onSelectProject: (id: string) => void;
  onOpenNotifications: () => void;
  onOpenExport: () => void;
}

export const HolographicDashboard: React.FC<HolographicDashboardProps> = ({
  projects,
  activeProject,
  company = DEFAULT_COMPANY_PROFILE,
  transactions,
  lang,
  syncState,
  onNavigate,
  onSelectProject,
  onOpenNotifications,
  onOpenExport,
}) => {
  const isAr = lang === 'ar';
  const [tableFilter, setTableFilter] = useState<'all' | 'under_construction' | 'permitting' | 'completed'>('all');

  const portfolioStats = useMemo(() => {
    let totalBudget = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    let activeCount = 0;
    let permittingCount = 0;
    let completedCount = 0;
    let progressSum = 0;

    for (const p of projects) {
      totalBudget += p.approvedBudget;
      totalInvoiced += p.invoicedAmount;
      totalPaid += p.paidAmount;
      progressSum += p.actualProgress;
      if (p.status === 'under_construction') activeCount += 1;
      else if (p.status === 'permitting') permittingCount += 1;
      else if (p.status === 'completed') completedCount += 1;
    }

    const avgProgress = projects.length > 0 ? Math.round(progressSum / projects.length) : 0;
    const collectionRate = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

    // Derive real sparkline arrays from sorted top projects in portfolio
    const topSample = projects.slice(0, 8);
    const budgetSpark = topSample.map((p) => Math.max(1, Math.round(p.approvedBudget / 100000)));
    const paidSpark = topSample.map((p) => Math.max(1, Math.round(p.paidAmount / 100000)));
    const progressSpark = topSample.map((p) => p.actualProgress);

    return {
      totalBudget,
      totalInvoiced,
      totalPaid,
      activeCount,
      permittingCount,
      completedCount,
      avgProgress,
      collectionRate,
      budgetSpark,
      paidSpark,
      progressSpark,
    };
  }, [projects]);

  const telemetry = useMemo(() => computeProjectTelemetry(activeProject), [activeProject]);
  const activeBimElements = useMemo(
    () =>
      activeProject.bimElements !== undefined
        ? activeProject.bimElements
        : generateProjectBimElements(activeProject),
    [activeProject]
  );

  const alerts = useMemo(
    () =>
      deriveWorkspaceAlerts({
        projects,
        transactions,
        syncState,
        lang,
      }),
    [projects, transactions, syncState, lang]
  );

  const filteredProjects = useMemo(() => {
    if (tableFilter === 'all') return projects;
    return projects.filter((p) => p.status === tableFilter);
  }, [projects, tableFilter]);

  const statusCounts = useMemo(
    () => ({
      all: projects.length,
      under_construction: portfolioStats.activeCount,
      permitting: portfolioStats.permittingCount,
      completed: portfolioStats.completedCount,
    }),
    [projects.length, portfolioStats]
  );

  return (
    <div className="space-y-6">
      {/* 1. Holographic Digital Twin Hero Strip */}
      <HolographicPanel scanline className="p-5 sm:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-center">
          <div className="xl:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                tone="info"
                label={isAr ? 'التوأم الرقمي الهندسي 5D BIM' : '5D BIM DIGITAL TWIN'}
              />
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                {company.licenseNumber} · {isAr ? company.nameAr : company.nameEn}
              </span>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] tracking-tight">
                {isAr
                  ? 'لوحة التحكم الهندسية ومؤشرات التوأم الرقمي'
                  : 'Holographic Engineering Control Dashboard'}
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed max-w-2xl">
                {isAr
                  ? 'متابعة فورية لمحفظة المشاريع المعتمدة في بلدية الشارقة، نماذج البناء الثلاثية الأبعاد، الحصر الهندسي الدقيق، والتدفقات المالية.'
                  : 'Unified live oversight for Sharjah Municipality projects, 5D BIM structural models, precision quantity takeoffs, and certified cashflow.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="cyan"
                size="sm"
                icon={<Box className="w-4 h-4" />}
                onClick={() => onNavigate('bim')}
              >
                {isAr ? 'تشغيل محاكي BIM 5D' : 'Launch 5D BIM'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Columns2 className="w-4 h-4 text-[var(--accent-cyan)]" />}
                onClick={() => onNavigate('studio')}
              >
                {isAr ? 'استوديو الحصر 2D + 3D' : '2D+3D Takeoff Studio'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Compass className="w-4 h-4 text-[var(--accent-gold)]" />}
                onClick={() => onNavigate('gis')}
              >
                {isAr ? 'خرائط القطع GIS' : 'GIS Explorer'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={<Printer className="w-4 h-4" />}
                onClick={onOpenExport}
              >
                {isAr ? 'تصدير رسمي' : 'Export BOQ'}
              </Button>
            </div>
          </div>

          {/* Interactive Blueprint Digital Twin Projection Card */}
          <div className="xl:col-span-5">
            <div className="rounded-2xl border border-[#0284C7]/25 dark:border-[#00F0FF]/30 bg-[#050B18] text-slate-100 p-4 relative overflow-hidden">
              {/* Subtle Isometric SVG Wireframe Building */}
              <svg
                viewBox="0 0 320 140"
                className="w-full h-32 opacity-90"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="holoSlab" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#1677FF" stopOpacity="0.06" />
                  </linearGradient>
                </defs>
                {/* Perspective grid floor */}
                <path
                  d="M20 112 L160 132 L300 112 L160 92 Z"
                  fill="url(#holoSlab)"
                  stroke="#00F0FF"
                  strokeOpacity="0.35"
                  strokeWidth="1"
                />
                {/* Structural Floors Wireframe */}
                {[0, 18, 36, 54].map((dy, idx) => (
                  <g key={dy}>
                    <path
                      d={`M85 ${94 - dy} L160 ${108 - dy} L235 ${94 - dy} L160 ${80 - dy} Z`}
                      fill="url(#holoSlab)"
                      stroke={idx === 3 ? '#D6A64F' : '#00F0FF'}
                      strokeOpacity={idx === 3 ? 0.85 : 0.65}
                      strokeWidth="1.2"
                    />
                  </g>
                ))}
                {/* Vertical Columns */}
                <line x1="85" y1="94" x2="85" y2="40" stroke="#00F0FF" strokeOpacity="0.7" strokeWidth="1.2" />
                <line x1="160" y1="108" x2="160" y2="54" stroke="#00F0FF" strokeOpacity="0.9" strokeWidth="1.4" />
                <line x1="235" y1="94" x2="235" y2="40" stroke="#00F0FF" strokeOpacity="0.7" strokeWidth="1.2" />
                <line x1="160" y1="80" x2="160" y2="26" stroke="#1677FF" strokeOpacity="0.55" strokeWidth="1" />
                {/* Telemetry anchor nodes */}
                <circle cx="85" cy="40" r="2.8" fill="#00E5A8" />
                <circle cx="160" cy="54" r="3.2" fill="#00F0FF" />
                <circle cx="235" cy="40" r="2.8" fill="#D6A64F" />
              </svg>

              <div className="mt-2 pt-3 border-t border-[#00F0FF]/20 grid grid-cols-3 gap-2 text-[11px]">
                <div className="min-w-0">
                  <div className="text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#00F0FF] shrink-0" />
                    <span className="truncate">{isAr ? 'القطعة النشطة' : 'Active Plot'}</span>
                  </div>
                  <div dir="ltr" className="font-mono font-bold text-[#00F0FF] truncate mt-0.5">
                    {activeProject.gisData.plotNumber}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-slate-400 flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-[#D6A64F] shrink-0" />
                    <span className="truncate">{isAr ? 'عناصر BIM' : 'BIM Elements'}</span>
                  </div>
                  <div dir="ltr" className="font-mono font-bold text-white tabular-nums mt-0.5">
                    {activeBimElements.length} · {telemetry.concreteM3} m³
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-slate-400 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-[#00E5A8] shrink-0" />
                    <span className="truncate">{isAr ? 'التقدم الفعلي' : 'Completion'}</span>
                  </div>
                  <div dir="ltr" className="font-mono font-bold text-[#00E5A8] tabular-nums mt-0.5">
                    {telemetry.actualProgress}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </HolographicPanel>

      {/* 2. Four Real-Data Portfolio KPIs with Sparklines */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPIWidget
          label={isAr ? 'إجمالي المشاريع المعتمدة' : 'Total Portfolio Projects'}
          value={projects.length}
          accent="cyan"
          icon={<FolderKanban className="w-4 h-4" />}
          sparkline={portfolioStats.progressSpark}
          delta={`${portfolioStats.activeCount} ${isAr ? 'نشط' : 'active'}`}
          deltaTone="positive"
          subtitle={`${portfolioStats.permittingCount} ${isAr ? 'تراخيص' : 'permits'} · ${portfolioStats.completedCount} ${isAr ? 'منجز' : 'done'}`}
          onClick={() => onNavigate('projects')}
        />

        <KPIWidget
          label={isAr ? 'قيمة العقود والميزانيات' : 'Total Contract Value'}
          value={formatAED(portfolioStats.totalBudget, lang)}
          accent="gold"
          icon={<Wallet className="w-4 h-4" />}
          sparkline={portfolioStats.budgetSpark}
          subtitle={`${isAr ? 'المعتمد:' : 'Certified:'} ${formatAED(portfolioStats.totalInvoiced, lang)}`}
          onClick={() => onNavigate('financials')}
        />

        <KPIWidget
          label={isAr ? 'الدفعات المستلمة فعلياً' : 'Payments Received'}
          value={formatAED(portfolioStats.totalPaid, lang)}
          accent="green"
          icon={<CheckCircle2 className="w-4 h-4" />}
          sparkline={portfolioStats.paidSpark}
          delta={`${portfolioStats.collectionRate}%`}
          deltaTone="positive"
          subtitle={isAr ? 'نسبة التحصيل الكلية' : 'Collection rate'}
          onClick={() => onNavigate('financials')}
        />

        <KPIWidget
          label={isAr ? 'متوسط الإنجاز والمراقبة' : 'Avg Portfolio Progress'}
          value={`${portfolioStats.avgProgress}%`}
          accent="blue"
          icon={<BarChart3 className="w-4 h-4" />}
          sparkline={portfolioStats.progressSpark}
          delta={`${transactions.length} ${isAr ? 'معاملة' : 'permits'}`}
          deltaTone="neutral"
          subtitle={isAr ? 'تكامل بلدية الشارقة' : 'Sharjah Mun. tracked'}
          onClick={() => onNavigate('government')}
        />
      </section>

      {/* 3. Financial Intelligence Chart */}
      <FinancialChart
        projects={projects}
        lang={lang}
        onSelectProject={(pid) => {
          onSelectProject(pid);
          onNavigate('financials');
        }}
      />

      {/* 4. Enterprise Project Data Table + Intelligent Operational Alerts */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <Card className="xl:col-span-8 overflow-hidden">
          <CardHeader
            icon={<Building2 className="w-4 h-4" />}
            title={isAr ? 'سجل مشاريع التوأم الرقمي والعقود' : 'Digital Twin Projects & Contracts Registry'}
            subtitle={
              isAr
                ? 'اضغط على أي مشروع لتحديده أو افتح نموذج BIM 5D مباشرة'
                : 'Select any project to focus workspace or launch 5D BIM directly'
            }
            action={
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-1 text-[11px] font-semibold">
                {(
                  [
                    ['all', isAr ? `الكل (${statusCounts.all})` : `All (${statusCounts.all})`],
                    ['under_construction', isAr ? `تنفيذ (${statusCounts.under_construction})` : `Active (${statusCounts.under_construction})`],
                    ['permitting', isAr ? `تراخيص (${statusCounts.permitting})` : `Permits (${statusCounts.permitting})`],
                    ['completed', isAr ? `منجز (${statusCounts.completed})` : `Done (${statusCounts.completed})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTableFilter(key)}
                    className={`px-2.5 py-1 rounded-lg bunyan-transition cursor-pointer whitespace-nowrap ${
                      tableFilter === key
                        ? 'bg-gradient-to-l from-[#1677FF] to-[#0284C7] dark:from-[#00C8E0] dark:to-[#1677FF] text-white dark:text-[#050B18]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />

          <ProjectDataTable
            projects={filteredProjects}
            activeProjectId={activeProject.id}
            lang={lang}
            onSelectProject={onSelectProject}
            onOpenProjectModule={(pid, mod) => {
              onSelectProject(pid);
              onNavigate(mod);
            }}
            maxRows={8}
          />

          <div className="px-5 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-muted)]">
              {isAr
                ? `عرض ${Math.min(8, filteredProjects.length)} من أصل ${filteredProjects.length} مشروع`
                : `Showing ${Math.min(8, filteredProjects.length)} of ${filteredProjects.length} projects`}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="inline-flex items-center gap-1 font-semibold text-[var(--accent-cyan)] hover:underline cursor-pointer"
            >
              <span>{isAr ? 'فتح السجل الكامل' : 'Open Full Registry'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        <div className="xl:col-span-4">
          <AlertPanel
            alerts={alerts}
            lang={lang}
            maxItems={6}
            onViewAll={onOpenNotifications}
            onSelectAlert={(al) => {
              if (al.projectId) onSelectProject(al.projectId);
              onNavigate(al.targetModule);
            }}
          />
        </div>
      </section>

      {/* 5. Quick Digital Twin Engineering Launchpad */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(
          [
            {
              mod: 'takeoff' as ActiveModule,
              icon: FileSpreadsheet,
              title: isAr ? 'الحصر الهندسي PDF' : 'PDF Quantity Takeoff',
              meta: `${(activeProject.takeoffMeasurements || []).length} ${isAr ? 'قياس' : 'items'}`,
            },
            {
              mod: 'studio' as ActiveModule,
              icon: Layers,
              title: isAr ? 'استوديو 2D + 3D' : '2D + 3D Studio',
              meta: 'PlanSwift · Three.js',
            },
            {
              mod: 'government' as ActiveModule,
              icon: Landmark,
              title: isAr ? 'بوابة البلدية' : 'Municipal Portal',
              meta: `${transactions.length} ${isAr ? 'معاملة' : 'clearances'}`,
            },
            {
              mod: 'reports' as ActiveModule,
              icon: Printer,
              title: isAr ? 'مركز التقارير' : 'Reports & Print',
              meta: isAr ? 'A4 RTL رسمي' : 'Official A4 Print',
            },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.mod}
              padded
              interactive
              onClick={() => onNavigate(item.mod)}
              className="flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-center justify-center text-[var(--accent-cyan)] shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-cyan)] truncate">
                    {item.title}
                  </div>
                  <div className="text-[10.5px] font-mono text-[var(--text-muted)] truncate">
                    {item.meta}
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-cyan)] shrink-0" />
            </Card>
          );
        })}
      </section>
    </div>
  );
};
