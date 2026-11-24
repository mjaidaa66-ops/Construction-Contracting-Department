import React, { useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  CheckSquare,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Printer,
  RotateCcw,
  Square,
} from 'lucide-react';
import type {
  CompanyProfile,
  Language,
  Project,
  RateLibraryItem,
  TakeoffCategory,
  TakeoffMeasurement,
  TakeoffProjectSummary,
  TakeoffSheet,
} from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import {
  computeTakeoffSummary,
  evaluateTakeoffVerificationState,
} from '../../utils/takeoffCalculations';
import { exportTakeoffToExcel } from '../../utils/takeoffExportEngine';
import { BunyanLogo } from '../common/BunyanLogo';

interface TakeoffPrintSummaryViewProps {
  lang: Language;
  project: Project;
  company: CompanyProfile;
  sheets: TakeoffSheet[];
  measurements: TakeoffMeasurement[];
  summary: TakeoffProjectSummary;
  rateLibrary: RateLibraryItem[];
  onJumpToMeasurement?: (measurement: TakeoffMeasurement) => void;
  compactHeader?: boolean;
}

export const TakeoffPrintSummaryView: React.FC<TakeoffPrintSummaryViewProps> = ({
  lang,
  project,
  company,
  sheets,
  measurements,
  summary,
  rateLibrary,
  onJumpToMeasurement,
  compactHeader = false,
}) => {
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<TakeoffCategory | 'all'>('all');
  const [sheetFilter, setSheetFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showCategorySummary, setShowCategorySummary] = useState(true);
  const [showSheetSchedule, setShowSheetSchedule] = useState(true);
  const [showDetailedSchedule, setShowDetailedSchedule] = useState(true);
  const [showFinancialSummary, setShowFinancialSummary] = useState(true);
  const [showSignOff, setShowSignOff] = useState(true);

  const filteredMeasurements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return measurements.filter((m) => {
      if (categoryFilter !== 'all' && m.category !== categoryFilter) return false;
      if (sheetFilter !== 'all' && m.sheetId !== sheetFilter) return false;
      if (q) {
        const hay = `${m.label} ${m.labelAr} ${m.sheetId} ${m.category} ${m.linkedBimElementId || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [measurements, categoryFilter, sheetFilter, searchQuery]);

  const isFiltered = categoryFilter !== 'all' || sheetFilter !== 'all' || searchQuery.trim().length > 0;

  const activeSummary = useMemo(() => {
    if (!isFiltered) return summary;
    return computeTakeoffSummary(
      project.id,
      filteredMeasurements,
      summary.overheadPercent,
      summary.profitPercent,
      summary.vatPercent
    );
  }, [isFiltered, summary, project.id, filteredMeasurements]);

  const sheetLookup = useMemo(() => {
    const map = new Map<string, TakeoffSheet>();
    sheets.forEach((s) => map.set(s.id, s));
    return map;
  }, [sheets]);

  const sheetStats = useMemo(() => {
    const stats = new Map<string, { count: number; totalCostAed: number }>();
    filteredMeasurements.forEach((m) => {
      const prev = stats.get(m.sheetId) || { count: 0, totalCostAed: 0 };
      stats.set(m.sheetId, {
        count: prev.count + 1,
        totalCostAed: prev.totalCostAed + m.totalCostAed,
      });
    });
    return stats;
  }, [filteredMeasurements]);

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const printableWidth = pageWidth - margin * 2;
      const printableHeight = pageHeight - margin * 2;
      const imgHeight = (canvas.height * printableWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, printableWidth, imgHeight);
      heightLeft -= printableHeight;

      while (heightLeft > 1) {
        position = heightLeft - imgHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, printableWidth, imgHeight);
        heightLeft -= printableHeight;
      }

      const safeCode = project.code.replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`${safeCode}_Takeoff_Quantities_Report.pdf`);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    exportTakeoffToExcel({
      project,
      company,
      measurements: filteredMeasurements,
      summary: activeSummary,
      rateLibrary,
    });
  };

  const resetFilters = () => {
    setCategoryFilter('all');
    setSheetFilter('all');
    setSearchQuery('');
  };

  const reportDate = new Date().toISOString().slice(0, 10);
  const linkedBimCount = filteredMeasurements.filter((m) => Boolean(m.linkedBimElementId)).length;
  const verification = useMemo(
    () => evaluateTakeoffVerificationState(sheets, filteredMeasurements, project.bimElements),
    [sheets, filteredMeasurements, project.bimElements]
  );

  const sectionToggles = [
    {
      id: 'cat',
      labelAr: 'ملخص التخصصات',
      labelEn: 'Category Summary',
      checked: showCategorySummary,
      toggle: () => setShowCategorySummary((v) => !v),
    },
    {
      id: 'sheets',
      labelAr: 'جدول اللوحات والمقاييس',
      labelEn: 'Sheets & Scales',
      checked: showSheetSchedule,
      toggle: () => setShowSheetSchedule((v) => !v),
    },
    {
      id: 'details',
      labelAr: 'تفصيل الكميات',
      labelEn: 'Detailed Schedule',
      checked: showDetailedSchedule,
      toggle: () => setShowDetailedSchedule((v) => !v),
    },
    {
      id: 'finance',
      labelAr: 'الملخص المالي والضريبة',
      labelEn: 'Financial & VAT',
      checked: showFinancialSummary,
      toggle: () => setShowFinancialSummary((v) => !v),
    },
    {
      id: 'sign',
      labelAr: 'اعتماد المهندس والاستشاري',
      labelEn: 'Sign-off Block',
      checked: showSignOff,
      toggle: () => setShowSignOff((v) => !v),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Interactive Report Configuration & Export Toolbar (Hidden during print) */}
      <div
        className={`no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] ${
          compactHeader ? 'p-3.5' : 'p-4'
        } space-y-3`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
              <Filter className="w-3.5 h-3.5 text-[#B4863C]" />
              <span>{lang === 'ar' ? 'نطاق التقرير:' : 'Report Scope:'}</span>
            </span>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as TakeoffCategory | 'all')}
              aria-label={lang === 'ar' ? 'تصفية حسب التخصص' : 'Filter by category'}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              <option value="all">{lang === 'ar' ? 'جميع التخصصات' : 'All Categories'}</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {lang === 'ar' ? v.ar : v.en}
                </option>
              ))}
            </select>

            <select
              value={sheetFilter}
              onChange={(e) => setSheetFilter(e.target.value)}
              aria-label={lang === 'ar' ? 'تصفية حسب اللوحة' : 'Filter by sheet'}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              <option value="all">{lang === 'ar' ? 'جميع اللوحات' : 'All Sheets'}</option>
              {sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {lang === 'ar' ? s.titleAr : s.title}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'بحث في البنود...' : 'Search items...'}
              className="w-44 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            />

            {isFiltered && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إعادة ضبط' : 'Reset'}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{lang === 'ar' ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            >
              {exportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B4863C]" />
              ) : (
                <Download className="w-3.5 h-3.5 text-[#B4863C]" />
              )}
              <span>{lang === 'ar' ? 'تنزيل PDF متعدد الصفحات' : 'Save PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'طباعة التقرير' : 'Print Report'}</span>
            </button>
          </div>
        </div>

        {/* Section Visibility Toggles */}
        <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-500 dark:text-slate-400 me-1">
            {lang === 'ar' ? 'أقسام التقرير المطبوع:' : 'Visible Sections:'}
          </span>
          {sectionToggles.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={sec.toggle}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors whitespace-nowrap ${
                sec.checked
                  ? 'bg-[#B4863C]/10 border-[#B4863C]/40 text-slate-900 dark:text-slate-100'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {sec.checked ? (
                <CheckSquare className="w-3.5 h-3.5 text-[#B4863C]" />
              ) : (
                <Square className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{lang === 'ar' ? sec.labelAr : sec.labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Structured A4 Print-Ready Engineering Report Canvas */}
      <div className="print-scroll-area rounded-xl bg-slate-200/70 dark:bg-slate-950/80 p-4 sm:p-6 lg:p-8 border border-slate-200 dark:border-slate-800">
        <div
          ref={reportRef}
          className="print-report-paper bg-white text-slate-900 max-w-[820px] mx-auto p-6 sm:p-10 rounded-lg border border-slate-300 shadow-sm space-y-6 text-xs"
        >
          {/* Letterhead */}
          <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-slate-400 pb-4">
            <div className="flex items-start gap-3.5">
              <BunyanLogo iconOnly size="lg" variant="print" lang={lang} />
              <div className="space-y-1">
                <div className="text-[11px] font-semibold tracking-wide text-slate-600">
                  {verification.status === 'certified_calibrated'
                    ? lang === 'ar'
                      ? 'تقرير ملخص الكميات والمقايسة الهندسية المعتمد'
                      : 'VERIFIED QUANTITIES & 5D BOQ TAKEOFF SUMMARY'
                    : lang === 'ar'
                    ? `تقرير حصر كميات — ${verification.badgeAr}`
                    : `QUANTITIES REPORT — ${verification.badgeEn.toUpperCase()}`}
                </div>
                <h1 className="text-lg font-bold text-slate-900">
                  {lang === 'ar' ? company.nameAr : company.nameEn}
                </h1>
                <div className="text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{company.municipalityClass}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">TRN: {company.trnNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{company.licenseNumber}</span>
                </div>
                <div className="text-slate-500">
                  {lang === 'ar' ? company.addressAr : company.addressEn} · {company.phone}
                </div>
              </div>
            </div>

            <div className="sm:text-end font-mono tabular-nums space-y-0.5 shrink-0">
              <div className="text-sm font-bold text-[#B4863C]">{project.code}</div>
              <div className="text-slate-700">
                {lang === 'ar' ? 'تاريخ التقرير:' : 'Issue Date:'} {reportDate}
              </div>
              <div className="text-slate-600">
                {lang === 'ar' ? 'تصريح البناء:' : 'Permit:'} {project.permitNumber}
              </div>
              <div className="text-slate-500 font-sans">
                {project.licensingAuthority}
              </div>
            </div>
          </header>

          {/* Project, Parties & GIS Plot Summary */}
          <section className="print-break-inside-avoid grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 p-4 bg-slate-50 border border-slate-200 rounded-md">
            <div>
              <span className="text-slate-500">{lang === 'ar' ? 'اسم المشروع:' : 'Project Name:'}</span>{' '}
              <span className="font-bold text-slate-900">
                {lang === 'ar' ? project.name : project.nameEn}
              </span>
            </div>
            <div>
              <span className="text-slate-500">{lang === 'ar' ? 'المالك:' : 'Owner:'}</span>{' '}
              <span className="font-semibold text-slate-900">{project.ownerName}</span>
            </div>
            <div>
              <span className="text-slate-500">{lang === 'ar' ? 'المكتب الاستشاري:' : 'Consultant Office:'}</span>{' '}
              <span className="font-medium text-slate-800">{project.consultantOffice}</span>
            </div>
            <div>
              <span className="text-slate-500">{lang === 'ar' ? 'المهندس الاستشاري / المقيم:' : 'Engineers:'}</span>{' '}
              <span className="text-slate-800">
                {project.consultantEngineer} · {project.residentEngineer}
              </span>
            </div>
            <div>
              <span className="text-slate-500">{lang === 'ar' ? 'قطعة الأرض GIS:' : 'GIS Plot:'}</span>{' '}
              <span className="font-mono tabular-nums text-slate-800">
                {project.gisData.plotNumber} · {project.gisData.sectorName} ({project.gisData.emirate})
              </span>
            </div>
            <div>
              <span className="text-slate-500">{lang === 'ar' ? 'المساحة والارتدادات:' : 'Area & Setbacks:'}</span>{' '}
              <span className="font-mono tabular-nums text-slate-800">
                {project.gisData.plotAreaSqM.toFixed(0)} m² ({project.gisData.builtUpAreaSqFt.toLocaleString()} ft² BUA)
              </span>
            </div>
          </section>

          {/* Key Quantitative Snapshot Strip */}
          <section className="print-break-inside-avoid grid grid-cols-2 sm:grid-cols-4 border border-slate-300 rounded-md divide-y sm:divide-y-0 sm:divide-x rtl:sm:divide-x-reverse divide-slate-300">
            <div className="p-3">
              <div className="text-[11px] text-slate-500">
                {lang === 'ar' ? 'إجمالي بنود الحصر' : 'Measured Line Items'}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {filteredMeasurements.length}
                {isFiltered ? ` / ${measurements.length}` : ''}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[11px] text-slate-500">
                {lang === 'ar' ? 'التخصصات المشمولة' : 'Active Disciplines'}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {activeSummary.categoryBreakdown.length}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[11px] text-slate-500">
                {lang === 'ar' ? 'بنود مرتبطة بـ 5D BIM' : '5D BIM Linked'}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                {linkedBimCount}
              </div>
            </div>
            <div className="p-3 bg-slate-50">
              <div className="text-[11px] text-slate-500">
                {lang === 'ar' ? 'الإجمالي النهائي (شامل 5%)' : 'Grand Total (incl. 5% VAT)'}
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-[#9E7330] mt-0.5">
                {formatAED(activeSummary.grandTotalAed, lang)}
              </div>
            </div>
          </section>

          {/* Section 1: Executive Category Summary Table */}
          {showCategorySummary && (
            <section className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                <h2 className="text-sm font-bold text-slate-900">
                  {lang === 'ar'
                    ? '01. ملخص الكميات والتكلفة حسب التخصص الهندسي'
                    : '01. Executive Summary by Engineering Category'}
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-slate-500">
                  {activeSummary.categoryBreakdown.length}{' '}
                  {lang === 'ar' ? 'تخصصات' : 'categories'}
                </span>
              </div>

              {activeSummary.categoryBreakdown.length === 0 ? (
                <div className="p-4 text-center border border-slate-200 rounded text-slate-500">
                  {lang === 'ar' ? 'لا توجد بنود مطابقة للتصفية الحالية.' : 'No measurements match the active filter.'}
                </div>
              ) : (
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="border border-slate-300 px-2.5 py-2 text-start">
                        {lang === 'ar' ? 'التخصص الإنشائي / المعماري' : 'Engineering Category'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-2 text-end">
                        {lang === 'ar' ? 'عدد البنود' : 'Items'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-2 text-end">
                        {lang === 'ar' ? 'إجمالي الكمية' : 'Total Quantity'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-2 text-center">
                        {lang === 'ar' ? 'الوحدة' : 'Unit'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-2 text-end">
                        {lang === 'ar' ? 'التكلفة المباشرة (د.إ)' : 'Direct Cost (AED)'}
                      </th>
                      <th className="border border-slate-300 px-2.5 py-2 text-end">
                        {lang === 'ar' ? 'النسبة' : 'Share'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSummary.categoryBreakdown.map((row) => {
                      const pct =
                        activeSummary.directCostAed > 0
                          ? (row.costAed / activeSummary.directCostAed) * 100
                          : 0;
                      return (
                        <tr key={`${row.category}-${row.unit}`}>
                          <td className="border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-900">
                            {lang === 'ar'
                              ? CATEGORY_LABELS[row.category].ar
                              : CATEGORY_LABELS[row.category].en}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums">
                            {row.itemCount}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums font-semibold">
                            {row.quantity.toFixed(2)}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono">
                            {row.unit}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums font-semibold">
                            {row.costAed.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums text-slate-600">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="border border-slate-300 px-2.5 py-2">
                        {lang === 'ar' ? 'إجمالي التكلفة المباشرة' : 'Total Direct Construction Cost'}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-end font-mono tabular-nums">
                        {filteredMeasurements.length}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2" colSpan={2} />
                      <td className="border border-slate-300 px-2.5 py-2 text-end font-mono tabular-nums">
                        {activeSummary.directCostAed.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-end font-mono tabular-nums">
                        100.0%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>
          )}

          {/* Section 2: Drawing Sheets & Scale Schedule */}
          {showSheetSchedule && sheets.length > 0 && (
            <section className="print-break-inside-avoid space-y-2">
              <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                <h2 className="text-sm font-bold text-slate-900">
                  {lang === 'ar'
                    ? '02. سجل اللوحات الهندسية ومعايرة المقياس'
                    : '02. Drawing Sheets & Scale Calibration Schedule'}
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-slate-500">
                  {sheets.length} {lang === 'ar' ? 'لوحات' : 'sheets'}
                </span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-[11px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                      {lang === 'ar' ? 'رمز اللوحة' : 'Sheet Code'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-start">
                      {lang === 'ar' ? 'عنوان المخطط' : 'Drawing Title'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-center">
                      {lang === 'ar' ? 'المقياس' : 'Scale'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-end">
                      {lang === 'ar' ? 'الكثافة (px/m)' : 'Units/m'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-end">
                      {lang === 'ar' ? 'البنود' : 'Items'}
                    </th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-end">
                      {lang === 'ar' ? 'القيمة (د.إ)' : 'Subtotal (AED)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((sh) => {
                    const st = sheetStats.get(sh.id) || { count: 0, totalCostAed: 0 };
                    return (
                      <tr key={sh.id}>
                        <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-bold">
                          {sh.code}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5">
                          {lang === 'ar' ? sh.titleAr : sh.title}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono">
                          {sh.scaleLabel}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums">
                          {sh.pixelsPerMeter.toFixed(1)}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums">
                          {st.count}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-end font-mono tabular-nums font-semibold">
                          {st.totalCostAed.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          {/* Section 3: Detailed Measurements Schedule */}
          {showDetailedSchedule && (
            <section className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                <h2 className="text-sm font-bold text-slate-900">
                  {lang === 'ar'
                    ? '03. جدول القياسات التفصيلي (المقايسة الهندسية)'
                    : '03. Detailed Project Quantities Schedule'}
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-slate-500">
                  {filteredMeasurements.length} {lang === 'ar' ? 'بند' : 'items'}
                </span>
              </div>

              {filteredMeasurements.length === 0 ? (
                <div className="p-4 text-center border border-slate-200 rounded text-slate-500">
                  {lang === 'ar' ? 'لا توجد قياسات مسجلة.' : 'No recorded measurements.'}
                </div>
              ) : (
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="border border-slate-300 px-2 py-2 text-start">#</th>
                      <th className="border border-slate-300 px-2 py-2 text-start">
                        {lang === 'ar' ? 'اللوحة' : 'Sheet'}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 text-start">
                        {lang === 'ar' ? 'التخصص' : 'Category'}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 text-start">
                        {lang === 'ar' ? 'وصف البند والمعاملات' : 'Item Description & Params'}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 text-end">
                        {lang === 'ar' ? 'الكمية' : 'Qty'}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 text-center">
                        {lang === 'ar' ? 'الوحدة' : 'Unit'}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 text-end">
                        {lang === 'ar' ? 'الفئة (د.إ)' : 'Rate'}
                      </th>
                      <th className="border border-slate-300 px-2 py-2 text-end">
                        {lang === 'ar' ? 'الإجمالي (د.إ)' : 'Total (AED)'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeasurements.map((m, idx) => {
                      const sheet = sheetLookup.get(m.sheetId);
                      const sheetCode = sheet?.code || m.sheetId;
                      const dimsMeta = [
                        m.tool,
                        m.heightOrDepth ? `H:${m.heightOrDepth}m` : null,
                        m.multiplier && m.multiplier > 1 ? `×${m.multiplier}` : null,
                        m.linkedBimElementId ? `BIM:${m.linkedBimElementId}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <tr
                          key={m.id}
                          onClick={() => onJumpToMeasurement?.(m)}
                          className={
                            onJumpToMeasurement
                              ? 'cursor-pointer hover:bg-amber-50/60 transition-colors'
                              : undefined
                          }
                        >
                          <td className="border border-slate-300 px-2 py-1.5 font-mono tabular-nums text-slate-600">
                            {idx + 1}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 font-mono font-semibold text-slate-700">
                            {sheetCode}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5">
                            {lang === 'ar'
                              ? CATEGORY_LABELS[m.category].ar
                              : CATEGORY_LABELS[m.category].en}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5">
                            <div className="font-semibold text-slate-900">
                              {lang === 'ar' ? m.labelAr : m.label}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                              {dimsMeta}
                            </div>
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-end font-mono tabular-nums font-semibold">
                            {m.computedQuantity.toFixed(2)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                            {m.unit}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-end font-mono tabular-nums">
                            {m.unitRateAed.toFixed(2)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-end font-mono tabular-nums font-bold text-slate-900">
                            {m.totalCostAed.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}

          {/* Section 4: Financial & UAE 5% VAT Summary */}
          {showFinancialSummary && (
            <section className="print-break-inside-avoid grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 border border-slate-200 rounded bg-slate-50 space-y-2 text-[11px] text-slate-600">
                <div className="font-bold text-slate-900">
                  {lang === 'ar' ? 'ملاحظات الاحتساب والامتثال الضريبي' : 'Pricing Notes & UAE VAT Basis'}
                </div>
                <p>
                  {lang === 'ar'
                    ? 'تم احتساب جميع الكميات من المخططات الهندسية المعايرة وفق دليل أسعار المقاولات في دولة الإمارات العربية المتحدة بالدرهم الإماراتي (AED).'
                    : 'All quantities are computed from scale-calibrated engineering drawings using UAE AED unit rate schedules.'}
                </p>
                <div className="font-mono tabular-nums text-slate-700 pt-1">
                  {lang === 'ar' ? 'إعدادات النسب:' : 'Configured Markups:'}{' '}
                  {activeSummary.overheadPercent}% OH · {activeSummary.profitPercent}% Profit ·{' '}
                  {activeSummary.vatPercent}% UAE VAT
                </div>
                {isFiltered && (
                  <div className="text-amber-800 font-medium">
                    {lang === 'ar'
                      ? `ملاحظة: الأرقام أعلاه تخص البنود المصفاة (${filteredMeasurements.length} من ${measurements.length} بند). إجمالي المشروع الكامل: ${formatAED(summary.grandTotalAed, lang)}.`
                      : `Note: Totals reflect filtered scope (${filteredMeasurements.length} of ${measurements.length} items). Full project total: ${formatAED(summary.grandTotalAed, lang)}.`}
                  </div>
                )}
              </div>

              <div className="border border-slate-300 rounded p-4 space-y-1.5 font-mono tabular-nums bg-white">
                <div className="flex justify-between">
                  <span className="font-sans text-slate-600">
                    {lang === 'ar' ? 'التكلفة المباشرة:' : 'Direct Construction Cost:'}
                  </span>
                  <span className="font-semibold">{formatAED(activeSummary.directCostAed, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-600">
                    {lang === 'ar'
                      ? `المصاريف الإدارية (${activeSummary.overheadPercent}%):`
                      : `Site Overhead (${activeSummary.overheadPercent}%):`}
                  </span>
                  <span>{formatAED(activeSummary.overheadAed, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-600">
                    {lang === 'ar'
                      ? `هامش الربح (${activeSummary.profitPercent}%):`
                      : `Contractor Profit (${activeSummary.profitPercent}%):`}
                  </span>
                  <span>{formatAED(activeSummary.profitAed, lang)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200">
                  <span className="font-sans text-slate-700 font-medium">
                    {lang === 'ar' ? 'الإجمالي قبل الضريبة:' : 'Subtotal Excl. VAT:'}
                  </span>
                  <span className="font-semibold">{formatAED(activeSummary.subtotalBeforeVatAed, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans text-slate-600">
                    {lang === 'ar'
                      ? `ضريبة القيمة المضافة (${activeSummary.vatPercent}%):`
                      : `UAE VAT (${activeSummary.vatPercent}%):`}
                  </span>
                  <span>{formatAED(activeSummary.vatAed, lang)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-slate-900 font-bold text-sm text-slate-900">
                  <span className="font-sans">
                    {lang === 'ar' ? 'الإجمالي النهائي شامل الضريبة:' : 'GRAND TOTAL INCL. VAT:'}
                  </span>
                  <span className="text-[#9E7330]">{formatAED(activeSummary.grandTotalAed, lang)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Section 5: Engineering Sign-Off Block */}
          {showSignOff && (
            <section className="print-break-inside-avoid pt-4 border-t border-slate-300">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px]">
                <div className="p-3 border border-slate-200 rounded space-y-6">
                  <div>
                    <div className="font-bold text-slate-900">
                      {lang === 'ar' ? 'مهندس حصر الكميات' : 'Quantity Surveyor'}
                    </div>
                    <div className="text-slate-500">
                      {lang === 'ar' ? 'إعداد ومطابقة المخططات' : 'Prepared & Measured By'}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-300 flex justify-between text-slate-500">
                    <span>{lang === 'ar' ? 'التوقيع / الختم' : 'Signature'}</span>
                    <span className="font-mono">{reportDate}</span>
                  </div>
                </div>

                <div className="p-3 border border-slate-200 rounded space-y-6">
                  <div>
                    <div className="font-bold text-slate-900">
                      {lang === 'ar' ? 'المهندس الاستشاري المشرف' : 'Consultant Engineer'}
                    </div>
                    <div className="text-slate-600 truncate">
                      {project.consultantEngineer} · {project.consultantOffice}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-300 flex justify-between text-slate-500">
                    <span>{lang === 'ar' ? 'الاعتماد والمراجعة' : 'Verified & Approved'}</span>
                    <span className="font-mono">{project.consultantLicenseNo}</span>
                  </div>
                </div>

                <div className="p-3 border border-slate-200 rounded space-y-6">
                  <div>
                    <div className="font-bold text-slate-900">
                      {lang === 'ar' ? 'مدير المشروع / المقاول' : 'Resident Engineer'}
                    </div>
                    <div className="text-slate-600 truncate">
                      {project.residentEngineer} · {project.contractorBranch}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-dashed border-slate-300 flex justify-between text-slate-500">
                    <span>{lang === 'ar' ? 'اعتماد التنفيذ' : 'Contractor Sign-Off'}</span>
                    <span className="font-mono">{project.code}</span>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
