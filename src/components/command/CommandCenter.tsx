import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Columns2,
  Compass,
  FileDown,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  MapPin,
} from 'lucide-react';
import type {
  CompanyProfile,
  GovernmentTransaction,
  Language,
  Project,
} from '../../types/bunyan';
import { DEFAULT_COMPANY_PROFILE } from '../../data/uaeSeedData';
import { computeProjectTelemetry } from '../../utils/gisTakeoffGenerator';
import type { CloudSyncState } from '../../services/cloudSyncService';
import { BunyanLogo } from '../common/BunyanLogo';
import { BunyanExportCenter } from '../export/BunyanExportCenter';
import { CloudSyncStatusBadge } from '../layout/CloudSyncStatusBadge';
import type { ActiveModule } from '../layout/Sidebar';

interface CommandCenterProps {
  projects: Project[];
  activeProject: Project;
  company?: CompanyProfile;
  transactions: GovernmentTransaction[];
  lang: Language;
  syncState?: CloudSyncState;
  onSyncNow?: () => void;
  onNavigate: (mod: ActiveModule) => void;
  onSelectProject: (id: string) => void;
}

interface NavCardItem {
  id: string;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  metaAr: string;
  metaEn: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'gold' | 'cyan';
  action: () => void;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({
  projects,
  activeProject,
  company = DEFAULT_COMPANY_PROFILE,
  transactions,
  lang,
  syncState,
  onSyncNow,
  onNavigate,
  onSelectProject,
}) => {
  const [exportOpen, setExportOpen] = useState(false);

  const totalPortfolioBudget = useMemo(
    () => projects.reduce((sum, p) => sum + p.approvedBudget, 0),
    [projects]
  );

  const telemetry = useMemo(() => computeProjectTelemetry(activeProject), [activeProject]);

  const activeTxCount = useMemo(
    () => transactions.filter((t) => t.projectId === activeProject.id).length,
    [transactions, activeProject.id]
  );

  const navCards: NavCardItem[] = [
    {
      id: 'studio',
      titleAr: 'استوديو الحصر و 3D BIM',
      titleEn: '2D PlanSwift + 3D BIM Studio',
      subtitleAr: 'بيئة عمل هولوغرافية متزامنة لحصر المخططات ومعاينة المجسمات ثلاثية الأبعاد وخطوط الارتداد.',
      subtitleEn: 'Synchronized 2D digital takeoff and interactive 3D BIM viewport with GIS setbacks.',
      metaAr: 'PlanSwift 2D · Three.js 3D',
      metaEn: 'PlanSwift 2D · Three.js 3D',
      icon: Columns2,
      accent: 'gold',
      action: () => onNavigate('studio'),
    },
    {
      id: 'projects',
      titleAr: `المشاريع الإنشائية (${projects.length} مشروعاً)`,
      titleEn: `Construction Projects (${projects.length})`,
      subtitleAr: 'إدارة محفظة المشاريع المعتمدة، مراحل التنفيذ، المستخلصات المالية، ومستندات الرخص.',
      subtitleEn: 'Manage Sharjah project portfolio, execution phases, financial milestones, and permits.',
      metaAr: `${projects.length} مشروع نشط`,
      metaEn: `${projects.length} Active Projects`,
      icon: FolderKanban,
      accent: 'cyan',
      action: () => onNavigate('projects'),
    },
    {
      id: 'takeoff',
      titleAr: 'الحصر الهندسي من PDF',
      titleEn: 'PDF Quantity Takeoff',
      subtitleAr: 'استيراد المخططات الهندسية، المعايرة الدقيقة، وحساب جداول الكميات والتسعير 5D BOQ.',
      subtitleEn: 'Upload engineering PDFs, calibrate drawing scale, and compute live 5D BOQ costs.',
      metaAr: 'معايرة دقيقة · حصر كميات',
      metaEn: 'Scale Calibration · 5D BOQ',
      icon: FileSpreadsheet,
      accent: 'gold',
      action: () => onNavigate('takeoff'),
    },
    {
      id: 'gis',
      titleAr: 'منصة الأراضي والخرائط',
      titleEn: 'Sharjah GIS Plot Platform',
      subtitleAr: 'استعراض إحداثيات القطع، الحوض والمنطقة، الحدود المساحية، واشتراطات البناء.',
      subtitleEn: 'Inspect plot coordinates, sector demarcation, boundaries, and zoning setbacks.',
      metaAr: `قطعة ${activeProject.gisData.plotNumber}`,
      metaEn: `Plot ${activeProject.gisData.plotNumber}`,
      icon: Compass,
      accent: 'cyan',
      action: () => onNavigate('gis'),
    },
    {
      id: 'government',
      titleAr: 'التدقيق الذكي والمعاملات الحكومية',
      titleEn: 'Municipality AI Audit & SEWA',
      subtitleAr: 'متابعة معاملات بلدية الشارقة وهيئة كهرباء ومياه الشارقة والدفاع المدني والتخطيط.',
      subtitleEn: 'Track Sharjah Municipality, SEWA, Civil Defense, and DTPS regulatory approvals.',
      metaAr: `${activeTxCount} معاملة مسجلة`,
      metaEn: `${activeTxCount} Tracked Clearances`,
      icon: Landmark,
      accent: 'gold',
      action: () => onNavigate('government'),
    },
    {
      id: 'export',
      titleAr: 'مركز التقارير والتصدير الرسمي',
      titleEn: 'Official 5D BOQ Export Center',
      subtitleAr: 'إصدار تقارير Excel متعددة الأوراق وملفات PDF رسمية معتمدة بالرقم الضريبي UAE VAT 5%.',
      subtitleEn: 'Generate multi-sheet Excel workbooks and print-ready A4 PDF reports with UAE TRN.',
      metaAr: 'Excel (.xlsx) · A4 PDF',
      metaEn: 'Excel (.xlsx) · A4 PDF',
      icon: FileDown,
      accent: 'cyan',
      action: () => setExportOpen(true),
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Hero Command Banner with Holographic Blueprint Grid & Rotating Radar Rings */}
      <section className="relative overflow-hidden rounded-2xl border border-[#B4863C]/35 dark:border-[#38BDF8]/30 bg-white/95 dark:bg-[#060D1A] p-6 sm:p-8 shadow-lg">
        {/* Blueprint SVG Grid & Concentric Rotating Radar Rings Backdrop */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-35 dark:opacity-55">
          <svg
            className="h-full w-full"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <pattern id="heroBlueprintGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="#38BDF8"
                  strokeOpacity="0.16"
                  strokeWidth="0.75"
                />
              </pattern>
              <radialGradient id="heroCyanGlow" cx="75%" cy="35%" r="55%">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.22" />
                <stop offset="55%" stopColor="#B4863C" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#060D1A" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#heroBlueprintGrid)" />
            <rect width="100%" height="100%" fill="url(#heroCyanGlow)" />
          </svg>

          {/* Concentric Holographic Radar Rings */}
          <div className="absolute -end-20 -top-24 w-[420px] h-[420px] sm:w-[480px] sm:h-[480px] opacity-65">
            <svg viewBox="0 0 400 400" className="w-full h-full">
              <g className="animate-radar-slow" style={{ transformOrigin: '200px 200px' }}>
                <circle
                  cx="200"
                  cy="200"
                  r="182"
                  fill="none"
                  stroke="#38BDF8"
                  strokeOpacity="0.35"
                  strokeWidth="1.2"
                  strokeDasharray="14 8 4 8"
                />
                <circle
                  cx="200"
                  cy="200"
                  r="146"
                  fill="none"
                  stroke="#B4863C"
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                  strokeDasharray="28 12"
                />
                <line x1="200" y1="10" x2="200" y2="390" stroke="#38BDF8" strokeOpacity="0.15" />
                <line x1="10" y1="200" x2="390" y2="200" stroke="#38BDF8" strokeOpacity="0.15" />
              </g>
              <g className="animate-radar-reverse" style={{ transformOrigin: '200px 200px' }}>
                <circle
                  cx="200"
                  cy="200"
                  r="108"
                  fill="none"
                  stroke="#38BDF8"
                  strokeOpacity="0.55"
                  strokeWidth="1.2"
                  strokeDasharray="6 6"
                />
                <circle
                  cx="200"
                  cy="200"
                  r="64"
                  fill="none"
                  stroke="#D4AF37"
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                />
              </g>
            </svg>
          </div>
        </div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          {/* Official Platform Identity & Active Project Telemetry Readout */}
          <div className="space-y-4 max-w-2xl">
            <div className="flex flex-wrap items-center gap-3">
              <BunyanLogo lang={lang} size="lg" />
              {syncState && onSyncNow && (
                <CloudSyncStatusBadge syncState={syncState} lang={lang} onSyncNow={onSyncNow} />
              )}
            </div>

            <div className="space-y-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {lang === 'ar'
                  ? 'مركز القيادة الهندسية الهولوغرافي — 5D BIM & GIS'
                  : 'Holographic 5D BIM & GIS Engineering Command Center'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {lang === 'ar'
                  ? 'بوابة موحدة لإدارة مشاريع بلدية الشارقة، حصر الكميات الرقمي، النمذجة ثلاثية الأبعاد، والتقارير المالية المعتمدة.'
                  : 'Unified executive gateway for Sharjah Municipality projects, digital takeoff, 3D BIM visualization, and certified BOQ reports.'}
              </p>
            </div>
          </div>

          {/* Active Project Selector (56 Projects) + Instant Plot & Authority Card */}
          <div className="w-full xl:w-[440px] shrink-0 rounded-xl border border-slate-200 dark:border-[#38BDF8]/30 bg-slate-50/90 dark:bg-[#0B1426]/85 backdrop-blur-md p-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-[#38BDF8]">
                {lang === 'ar'
                  ? `المشروع النشط (${projects.length} مشروعاً في المنصة)`
                  : `Active Project (${projects.length} Total Projects)`}
              </span>
              <select
                value={activeProject.id}
                onChange={(e) => onSelectProject(e.target.value)}
                aria-label={lang === 'ar' ? 'اختيار المشروع النشط' : 'Select Active Project'}
                className="w-full rounded-lg border border-slate-300 dark:border-[#B4863C]/45 bg-white dark:bg-[#060D1A] px-3 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {lang === 'ar' ? p.name : p.nameEn}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                  <span>{lang === 'ar' ? 'رقم قطعة الأرض' : 'GIS Plot Number'}</span>
                </div>
                <div className="font-semibold text-slate-900 dark:text-white truncate">
                  <span dir="ltr" className="font-mono tabular-nums text-[#B4863C] dark:text-[#D4AF37]">
                    {activeProject.gisData.plotNumber}
                  </span>
                  <span className="mx-1 text-slate-400">·</span>
                  <span>{activeProject.gisData.sectorName}</span>
                </div>
              </div>

              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Building2 className="w-3.5 h-3.5 text-[#B4863C] shrink-0" />
                  <span>{lang === 'ar' ? 'الجهة المرخصة' : 'Licensing Authority'}</span>
                </div>
                <div className="font-semibold text-slate-900 dark:text-white truncate">
                  {activeProject.licensingAuthority}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Main Navigation Grid — 6 Clean Glassmorphism HUD Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {navCards.map((card) => {
          const Icon = card.icon;
          const isCyan = card.accent === 'cyan';

          return (
            <button
              key={card.id}
              type="button"
              onClick={card.action}
              className={`group text-start rounded-2xl border p-5 sm:p-6 transition-all duration-200 backdrop-blur-md bg-white/95 dark:bg-[#0B1426]/80 flex flex-col justify-between gap-4 ${
                isCyan
                  ? 'border-slate-200 dark:border-[#38BDF8]/25 hover:border-[#38BDF8] dark:hover:border-[#38BDF8] hover:shadow-[0_0_24px_rgba(56,189,248,0.18)]'
                  : 'border-slate-200 dark:border-[#B4863C]/30 hover:border-[#B4863C] dark:hover:border-[#D4AF37] hover:shadow-[0_0_24px_rgba(180,134,60,0.2)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                    isCyan
                      ? 'bg-[#38BDF8]/10 border-[#38BDF8]/30 text-sky-600 dark:text-[#38BDF8]'
                      : 'bg-[#B4863C]/12 border-[#B4863C]/35 text-[#B4863C] dark:text-[#D4AF37]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-[#38BDF8] dark:group-hover:text-[#38BDF8] transition-transform group-hover:-translate-y-0.5 shrink-0" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-[#B4863C] dark:group-hover:text-[#38BDF8] transition-colors">
                  {lang === 'ar' ? card.titleAr : card.titleEn}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {lang === 'ar' ? card.subtitleAr : card.subtitleEn}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span
                  dir={lang === 'en' || card.id === 'studio' || card.id === 'export' ? 'ltr' : 'rtl'}
                  className="font-mono tabular-nums inline-block"
                >
                  {lang === 'ar' ? card.metaAr : card.metaEn}
                </span>
              </div>
            </button>
          );
        })}
      </section>

      {/* 3. Bottom Telemetry Strip — Strictly 4 Concise Summary Figures with Bidi-Safe LTR Spans */}
      <section className="rounded-2xl border border-slate-200 dark:border-[#38BDF8]/25 bg-white/95 dark:bg-[#0B1426]/85 backdrop-blur-md p-4 sm:p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'إجمالي الميزانية المعتمدة (56 مشروعاً)' : 'Total Portfolio Budget'}
            </div>
            <div className="text-lg sm:text-xl font-bold text-[#B4863C] dark:text-[#D4AF37]">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {totalPortfolioBudget.toLocaleString('en-AE')} AED
              </span>
            </div>
          </div>

          <div className="lg:border-s lg:border-slate-200 lg:dark:border-slate-800 lg:ps-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'كمية الخرسانة (المشروع النشط)' : 'Concrete Volume (Active)'}
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.concreteM3.toLocaleString('en-AE')} m³
              </span>
            </div>
          </div>

          <div className="lg:border-s lg:border-slate-200 lg:dark:border-slate-800 lg:ps-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'حديد التسليح (المشروع النشط)' : 'Steel Rebar (Active)'}
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.steelTon.toLocaleString('en-AE')} ton
              </span>
            </div>
          </div>

          <div className="lg:border-s lg:border-slate-200 lg:dark:border-slate-800 lg:ps-4 space-y-1">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'نسبة الإنجاز الفعلي' : 'Actual Progress'}
            </div>
            <div className="text-lg sm:text-xl font-bold text-sky-600 dark:text-[#38BDF8]">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.actualProgress}%
              </span>
            </div>
          </div>
        </div>
      </section>

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
