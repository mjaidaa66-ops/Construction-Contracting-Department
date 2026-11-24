import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  Calculator,
  Check,
  FileSpreadsheet,
  FileUp,
  Hand,
  Hexagon,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer,
  PenTool,
  PlusSquare,
  Printer,
  Ruler,
  Scissors,
  Square,
  Trash2,
} from 'lucide-react';
import { Button, Card, EmptyState, SegmentedTabs, SkeletonBlock, useToast } from '../ui';
import type {
  CompanyProfile,
  Language,
  PdfPoint,
  Project,
  RateLibraryItem,
  TakeoffCategory,
  TakeoffMeasurement,
  TakeoffSheet,
  TakeoffSummaryConfig,
  TakeoffTool,
} from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import { generateGisPlotTakeoffSheet } from '../../utils/gisTakeoffGenerator';
import {
  calibratePointsPerMeter,
  DEFAULT_POINTS_PER_METER,
  distanceInPdfPoints,
} from '../../utils/pdfMeasurementMath';
import {
  calculateTakeoffMeasurementValues,
  computeTakeoffSummary,
  evaluateTakeoffVerificationState,
} from '../../utils/takeoffCalculations';
import { uploadSheetBinaryToCloud } from '../../services/cloudSyncService';
import { parseUploadedDrawingFile } from '../../utils/takeoffSheetLoader';
import { PdfCanvasSheet } from './PdfCanvasSheet';
import { PdfScaleModal } from './PdfScaleModal';
import { PdfTakeoffBoqModal } from './PdfTakeoffBoqModal';
import { RateLibraryModal } from './RateLibraryModal';
import { SheetBackdropRenderer } from './SheetBackdropRenderer';

const ComprehensiveReportPrinter = lazy(() =>
  import('./ComprehensiveReportPrinter').then((m) => ({
    default: m.ComprehensiveReportPrinter,
  }))
);
const EngineeringPdfViewer = lazy(() =>
  import('./EngineeringPdfViewer').then((m) => ({
    default: m.EngineeringPdfViewer,
  }))
);
const TakeoffPrintSummaryView = lazy(() =>
  import('./TakeoffPrintSummaryView').then((m) => ({
    default: m.TakeoffPrintSummaryView,
  }))
);

interface TakeoffModuleProps {
  project: Project;
  company: CompanyProfile;
  rateLibrary: RateLibraryItem[];
  lang: Language;
  cloudUid?: string | null;
  highlightedMeasurementId?: string | null;
  onUpdateProject: (p: Project) => void;
  onUpdateRate: (item: RateLibraryItem) => void;
  onAddRate: (item: RateLibraryItem) => void;
}

const TOOL_ITEMS: Array<{
  id: TakeoffTool;
  ar: string;
  en: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'select', ar: 'تحديد', en: 'Select', icon: MousePointer },
  { id: 'pan', ar: 'تحريك', en: 'Pan', icon: Hand },
  { id: 'calibrate', ar: 'معايرة', en: 'Calibrate', icon: Ruler },
  { id: 'linear', ar: 'خطي', en: 'Linear', icon: Minus },
  { id: 'polyline', ar: 'متعدد الخطوط', en: 'Polyline', icon: PenTool },
  { id: 'area', ar: 'مساحة', en: 'Area', icon: Square },
  { id: 'polygon', ar: 'مضلع', en: 'Polygon', icon: Hexagon },
  { id: 'rectangle', ar: 'مستطيل', en: 'Rectangle', icon: PlusSquare },
  { id: 'perimeter', ar: 'محيط', en: 'Perimeter', icon: Square },
  { id: 'volume', ar: 'حجم m³', en: 'Volume', icon: Box },
  { id: 'count', ar: 'عدّ نقاط', en: 'Count', icon: PlusSquare },
  { id: 'deduction', ar: 'خصم فتحة', en: 'Deduction', icon: Scissors },
];

export const TakeoffModule: React.FC<TakeoffModuleProps> = ({
  project,
  company,
  rateLibrary,
  lang,
  cloudUid = null,
  highlightedMeasurementId,
  onUpdateProject,
  onUpdateRate,
  onAddRate,
}) => {
  const sheets: TakeoffSheet[] = useMemo(() => {
    if (project.takeoffSheets && project.takeoffSheets.length > 0) {
      return project.takeoffSheets;
    }
    return [generateGisPlotTakeoffSheet(project)];
  }, [project]);
  const measurements: TakeoffMeasurement[] = project.takeoffMeasurements || [];
  const summaryConfig: TakeoffSummaryConfig = project.takeoffSummaryConfig || {
    overheadPercent: 10,
    profitPercent: 12,
    vatPercent: 5,
  };

  const [viewMode, setViewMode] = useState<'svg_sheets' | 'pdf_engine' | 'print_summary'>('svg_sheets');
  const [activeSheetId, setActiveSheetId] = useState<string>(sheets[0]?.id || 'sheet-a101');
  const [pdfPageNum, setPdfPageNum] = useState<number>(1);

  const [activeTool, setActiveTool] = useState<TakeoffTool>('polygon');
  const [activeCategory, setActiveCategory] = useState<TakeoffCategory>('concrete');
  const [heightOrDepth, setHeightOrDepth] = useState<number>(0.45);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [customLabel, setCustomLabel] = useState<string>('');
  const [draftPoints, setDraftPoints] = useState<PdfPoint[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(
    highlightedMeasurementId || null
  );

  const { pushToast } = useToast();
  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [calibrationSpanUnits, setCalibrationSpanUnits] = useState<number | null>(null);
  const [calibrationPts, setCalibrationPts] = useState<[PdfPoint, PdfPoint] | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [boqModalOpen, setBoqModalOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [expandCanvas, setExpandCanvas] = useState(false);
  const sheetUploadInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (sheets.length > 0 && !sheets.some((s) => s.id === activeSheetId)) {
      setActiveSheetId(sheets[0].id);
    }
  }, [project.id, sheets, activeSheetId]);

  useEffect(() => {
    setDraftPoints([]);
    setSelectedMeasurementId(highlightedMeasurementId || measurements[0]?.id || null);
  }, [project.id]);

  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
  const uploadedMasterPdfSheet = useMemo(
    () => sheets.find((s) => s.sheetType === 'pdf_document' && (s.pdfDataUrl || s.pdfManifestId)) || null,
    [sheets]
  );
  const activePdfPageSheet = useMemo(
    () =>
      sheets.find((s) => s.id === `pdf-page-${pdfPageNum}`) ||
      (uploadedMasterPdfSheet && (uploadedMasterPdfSheet.pageNumber || 1) === pdfPageNum
        ? uploadedMasterPdfSheet
        : undefined),
    [sheets, pdfPageNum, uploadedMasterPdfSheet]
  );

  const currentSheetId =
    viewMode === 'pdf_engine'
      ? activePdfPageSheet?.id || `pdf-page-${pdfPageNum}`
      : activeSheet?.id || 'sheet-a101';

  const currentPpm =
    viewMode === 'pdf_engine'
      ? activePdfPageSheet?.pixelsPerMeter ?? DEFAULT_POINTS_PER_METER
      : activeSheet?.pixelsPerMeter || 40;
  const currentScaleLabel =
    viewMode === 'pdf_engine'
      ? activePdfPageSheet?.scaleLabel || '1:100 (Uncalibrated)'
      : activeSheet?.scaleLabel || '1:100';
  const currentIsCalibrated =
    viewMode === 'pdf_engine'
      ? Boolean(activePdfPageSheet?.calibrated)
      : Boolean(activeSheet?.calibrated);

  const sheetMeasurements = useMemo(
    () => measurements.filter((m) => m.sheetId === currentSheetId),
    [measurements, currentSheetId]
  );

  const summary = useMemo(
    () =>
      computeTakeoffSummary(
        project.id,
        measurements,
        summaryConfig.overheadPercent,
        summaryConfig.profitPercent,
        summaryConfig.vatPercent
      ),
    [project.id, measurements, summaryConfig]
  );

  const verification = useMemo(
    () => evaluateTakeoffVerificationState(sheets, measurements, project.bimElements),
    [sheets, measurements, project.bimElements]
  );

  const matchingRate =
    rateLibrary.find((r) => r.category === activeCategory) || rateLibrary[0];

  const handleAddDraftPoint = (pt: PdfPoint) => {
    setDraftPoints((prev) => [...prev, pt]);
  };

  const handleCommitShape = () => {
    const minPts = activeTool === 'count' ? 1 : 2;
    if (draftPoints.length < minPts) return;

    const rateAed = matchingRate?.rateAed || 100;
    const calc = calculateTakeoffMeasurementValues({
      tool: activeTool,
      category: activeCategory,
      points: draftPoints,
      pointsPerMeter: currentPpm,
      heightOrDepth,
      multiplier,
      unitRateAed: rateAed,
    });

    const catInfo = CATEGORY_LABELS[activeCategory];
    const newMeas: TakeoffMeasurement = {
      id: `tm-${Date.now()}`,
      sheetId: currentSheetId,
      projectId: project.id,
      category: activeCategory,
      tool: activeTool,
      label: customLabel.trim() || `${catInfo.en} (${activeTool})`,
      labelAr: customLabel.trim() || `${catInfo.ar} (${activeTool})`,
      points: draftPoints,
      heightOrDepth,
      multiplier,
      unit: calc.unit,
      rawValue: calc.rawValue,
      computedQuantity: calc.computedQuantity,
      rateItemId: matchingRate?.id,
      unitRateAed: rateAed,
      totalCostAed: calc.totalCostAed,
      color: catInfo.color,
      createdAt: new Date().toISOString(),
    };

    onUpdateProject({
      ...project,
      takeoffMeasurements: [newMeas, ...measurements],
    });
    setDraftPoints([]);
    setCustomLabel('');
    setSelectedMeasurementId(newMeas.id);
  };

  const handleDeleteMeasurement = (id: string) => {
    onUpdateProject({
      ...project,
      takeoffMeasurements: measurements.filter((m) => m.id !== id),
    });
    if (selectedMeasurementId === id) setSelectedMeasurementId(null);
  };

  const handleTwoPointCalibrate = (p1: PdfPoint, p2: PdfPoint) => {
    const span = distanceInPdfPoints(p1, p2);
    setCalibrationPts([p1, p2]);
    setCalibrationSpanUnits(span);
    setDraftPoints([]);
    setScaleModalOpen(true);
  };

  const persistPdfPageCalibration = (nextPpm: number, nextLabel: string) => {
    const targetId = activePdfPageSheet?.id || `pdf-page-${pdfPageNum}`;
    const exists = sheets.some((s) => s.id === targetId);
    const updatedSheets = exists
      ? sheets.map((s) =>
          s.id === targetId
            ? { ...s, pixelsPerMeter: nextPpm, scaleLabel: nextLabel, calibrated: true }
            : s
        )
      : [
          ...sheets,
          {
            id: targetId,
            projectId: project.id,
            code: `PDF-P${pdfPageNum}`,
            title: uploadedMasterPdfSheet
              ? `${uploadedMasterPdfSheet.title} (P.${pdfPageNum})`
              : `Engineering PDF · Page ${pdfPageNum}`,
            titleAr: uploadedMasterPdfSheet
              ? `${uploadedMasterPdfSheet.titleAr} (ص ${pdfPageNum})`
              : `مخطط PDF · صفحة ${pdfPageNum}`,
            sheetType: 'pdf_document' as const,
            pageNumber: pdfPageNum,
            pixelsPerMeter: nextPpm,
            scaleLabel: nextLabel,
            calibrated: true,
            width: uploadedMasterPdfSheet?.width || 1191,
            height: uploadedMasterPdfSheet?.height || 842,
            pdfDataUrl: uploadedMasterPdfSheet?.pdfDataUrl,
            pdfManifestId: uploadedMasterPdfSheet?.pdfManifestId,
          },
        ];
    onUpdateProject({ ...project, takeoffSheets: updatedSheets });
  };

  const handleConfirmTwoPointDistance = (knownMeters: number) => {
    if (!calibrationPts) return;
    const newPpm = calibratePointsPerMeter(calibrationPts[0], calibrationPts[1], knownMeters);
    if (viewMode === 'pdf_engine') {
      persistPdfPageCalibration(newPpm, `Calibrated (${knownMeters.toFixed(2)}m Ref)`);
    } else if (activeSheet) {
      const updatedSheets = sheets.map((s) =>
        s.id === activeSheet.id
          ? {
              ...s,
              pixelsPerMeter: newPpm,
              scaleLabel: `Calibrated (${knownMeters.toFixed(2)}m Ref)`,
              calibrated: true,
            }
          : s
      );
      onUpdateProject({ ...project, takeoffSheets: updatedSheets });
    }
    setCalibrationPts(null);
    setCalibrationSpanUnits(null);
  };

  const handleApplyPresetScale = (label: string, ppm: number) => {
    if (viewMode === 'pdf_engine') {
      persistPdfPageCalibration(ppm, label);
    } else if (activeSheet) {
      // Scale SVG sheets relative to 40 px/m baseline for 1:100
      const svgPpm = (ppm / DEFAULT_POINTS_PER_METER) * 40;
      const updatedSheets = sheets.map((s) =>
        s.id === activeSheet.id
          ? { ...s, pixelsPerMeter: svgPpm, scaleLabel: label, calibrated: true }
          : s
      );
      onUpdateProject({ ...project, takeoffSheets: updatedSheets });
    }
  };

  const handleUploadBlueprintSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingSheet(true);
    try {
      const { sheet: parsedSheet } = await parseUploadedDrawingFile(file, project.id, sheets);
      const { sheet: newSheet } = await uploadSheetBinaryToCloud({
        project,
        sheet: parsedSheet,
        ownerId: cloudUid,
      });
      onUpdateProject({
        ...project,
        takeoffSheets: [...sheets, newSheet],
      });
      setActiveSheetId(newSheet.id);
      setViewMode('svg_sheets');
      setDraftPoints([]);
      setSelectedMeasurementId(null);
      pushToast(
        lang === 'ar'
          ? `تم تحميل المخطط "${newSheet.titleAr}" بنجاح`
          : `Loaded blueprint "${newSheet.title}"`,
        'success'
      );
    } catch (err) {
      console.error('Upload blueprint error:', err);
      pushToast(
        lang === 'ar' ? 'تعذر قراءة ملف المخطط المرفوع' : 'Failed to load blueprint file',
        'error'
      );
    } finally {
      setUploadingSheet(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Engine Mode & BOQ Summary Bar */}
      <Card className="no-print p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedTabs<'svg_sheets' | 'pdf_engine' | 'print_summary'>
            value={viewMode}
            onChange={(next) => {
              setViewMode(next);
              setDraftPoints([]);
            }}
            items={[
              {
                id: 'svg_sheets',
                label:
                  lang === 'ar'
                    ? `لوحات المخططات (${sheets.length})`
                    : `Blueprint Sheets (${sheets.length})`,
              },
              {
                id: 'pdf_engine',
                label: lang === 'ar' ? 'عارض PDF (pdfjs-dist)' : 'Multi-Page PDF Engine',
              },
              {
                id: 'print_summary',
                label: lang === 'ar' ? 'ملخص للطباعة' : 'Print Summary',
                icon: <Printer className="w-3.5 h-3.5" />,
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            <span>{lang === 'ar' ? 'المقياس:' : 'Scale:'}</span>{' '}
            <strong className="text-[#B4863C]">{currentScaleLabel}</strong>{' '}
            <span className="text-[var(--text-muted)]">({currentPpm.toFixed(2)} u/m)</span>
            <span
              className={`px-2 py-0.5 rounded font-sans text-[10px] font-semibold ${
                currentIsCalibrated
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
              }`}
            >
              {currentIsCalibrated
                ? lang === 'ar'
                  ? 'معايرة معتمدة'
                  : 'Calibrated'
                : lang === 'ar'
                ? 'غير معاير (مسودة)'
                : 'Uncalibrated Draft'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs font-mono tabular-nums">
            <span className="font-sans text-[var(--text-muted)]">
              {lang === 'ar' ? 'الإجمالي + ضريبة 5%:' : 'Total + 5% VAT:'}
            </span>{' '}
            <strong className="text-[#B4863C] dark:text-[#C99A49]">
              {formatAED(summary.grandTotalAed, lang)}
            </strong>
          </div>

          {viewMode !== 'print_summary' && (
            <Button
              variant="outline"
              size="sm"
              icon={expandCanvas ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              onClick={() => setExpandCanvas((v) => !v)}
            >
              {expandCanvas
                ? lang === 'ar'
                  ? 'إظهار السجل'
                  : 'Show Ledger'
                : lang === 'ar'
                ? 'تكبير اللوحة'
                : 'Expand Canvas'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={<Ruler className="w-3.5 h-3.5 text-[#B4863C]" />}
            onClick={() => setScaleModalOpen(true)}
          >
            {lang === 'ar' ? 'معايرة المقياس' : 'Scale'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={<BookOpen className="w-3.5 h-3.5 text-[#B4863C]" />}
            onClick={() => setRateModalOpen(true)}
          >
            {lang === 'ar' ? `دليل الأسعار (${rateLibrary.length})` : `Rates (${rateLibrary.length})`}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
            onClick={() => setBoqModalOpen(true)}
          >
            {lang === 'ar' ? 'المقايسة BOQ والتصدير' : 'BOQ & Export'}
          </Button>
        </div>
      </Card>

      {verification.status === 'uncalibrated_draft' && (
        <div className="no-print px-4 py-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
          <span>{lang === 'ar' ? verification.noticeAr : verification.noticeEn}</span>
          <span className="font-mono font-bold text-[11px]">
            {lang === 'ar' ? verification.badgeAr : verification.badgeEn}
          </span>
        </div>
      )}

      {viewMode === 'print_summary' ? (
        <div className={printerOpen ? 'no-print' : undefined}>
          <Suspense
            fallback={
              <Card className="p-6 space-y-3">
                <SkeletonBlock className="h-8 w-64" />
                <SkeletonBlock className="h-80 w-full" />
              </Card>
            }
          >
            <TakeoffPrintSummaryView
              lang={lang}
              project={project}
              company={company}
              sheets={sheets}
              measurements={measurements}
              summary={summary}
              rateLibrary={rateLibrary}
              onJumpToMeasurement={(m) => {
                setSelectedMeasurementId(m.id);
                const targetSheet = sheets.find((s) => s.id === m.sheetId);
                if (targetSheet) {
                  setViewMode('svg_sheets');
                  setActiveSheetId(targetSheet.id);
                } else if (m.sheetId.startsWith('pdf-page-')) {
                  const pNum = Number(m.sheetId.replace('pdf-page-', '')) || 1;
                  setPdfPageNum(pNum);
                  setViewMode('pdf_engine');
                }
              }}
            />
          </Suspense>
        </div>
      ) : (
        <div className="no-print space-y-4">
          {/* 12 Takeoff Tools & Category Parameters Bar */}
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {TOOL_ITEMS.map((tool) => {
                const Icon = tool.icon;
                const active = activeTool === tool.id;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      setActiveTool(tool.id);
                      setDraftPoints([]);
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#B4863C] text-white'
                        : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] hover:border-[#B4863C]/50 hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? tool.ar : tool.en}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2.5 border-t border-[var(--border-hairline)] text-xs">
              <label className="flex items-center gap-2">
                <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'التخصص:' : 'Category:'}</span>
                <select
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(e.target.value as TakeoffCategory)}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] font-medium text-[var(--text-primary)]"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {lang === 'ar' ? v.ar : v.en}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5">
                <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'الارتفاع/العمق (م):' : 'Height/Depth (m):'}</span>
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  value={heightOrDepth}
                  onChange={(e) => setHeightOrDepth(Number(e.target.value) || 0)}
                  className="w-20 px-2 py-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] font-mono tabular-nums text-[var(--text-primary)]"
                />
              </label>

              <label className="flex items-center gap-1.5">
                <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'المعامل:' : 'Mult:'}</span>
                <input
                  type="number"
                  min={1}
                  value={multiplier}
                  onChange={(e) => setMultiplier(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 px-2 py-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] font-mono tabular-nums text-[var(--text-primary)]"
                />
              </label>

              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder={lang === 'ar' ? 'وصف البند (اختياري)...' : 'Custom measurement label...'}
                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />

              {draftPoints.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Check className="w-3.5 h-3.5" />}
                    onClick={handleCommitShape}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {lang === 'ar'
                      ? `اعتماد الشكل (${draftPoints.length})`
                      : `Commit (${draftPoints.length} pts)`}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDraftPoints([])}>
                    {lang === 'ar' ? 'مسح' : 'Clear'}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Main Takeoff Canvas + Measurements Ledger */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className={`${expandCanvas ? 'xl:col-span-12' : 'xl:col-span-8'} space-y-3`}>
              {viewMode === 'svg_sheets' ? (
                <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden">
                  {/* Sheet Tabs + Upload Button */}
                  <div className="px-3 py-2 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2 bg-[var(--bg-surface-subtle)]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sheets.map((sh) => (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() => {
                            setActiveSheetId(sh.id);
                            setDraftPoints([]);
                          }}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                            activeSheet?.id === sh.id
                              ? 'bg-[#B4863C] text-white'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'
                          }`}
                        >
                          <span className="font-mono font-bold me-1.5">{sh.code}</span>
                          <span>{lang === 'ar' ? sh.titleAr : sh.title}</span>
                        </button>
                      ))}
                    </div>

                    <input
                      ref={sheetUploadInputRef}
                      type="file"
                      accept=".pdf,.dxf,application/pdf,image/*"
                      onChange={handleUploadBlueprintSheet}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      loading={uploadingSheet}
                      icon={!uploadingSheet ? <FileUp className="w-3.5 h-3.5 text-[#B4863C]" /> : undefined}
                      onClick={() => sheetUploadInputRef.current?.click()}
                    >
                      {lang === 'ar' ? 'رفع مخطط (PDF/DXF/صورة)' : 'Upload PDF / DXF / Image'}
                    </Button>
                  </div>

                  {activeSheet && (
                    <div className="relative bg-[#0B1324] overflow-auto min-h-[560px]">
                      <div
                        className="relative mx-auto"
                        style={{
                          width: '100%',
                          maxWidth: `${activeSheet.width}px`,
                          aspectRatio: `${activeSheet.width} / ${activeSheet.height}`,
                        }}
                      >
                        <SheetBackdropRenderer sheet={activeSheet} lang={lang} />
                        <PdfCanvasSheet
                          width={activeSheet.width}
                          height={activeSheet.height}
                          activeTool={activeTool}
                          activeColor={CATEGORY_LABELS[activeCategory].color}
                          measurements={sheetMeasurements}
                          selectedMeasurementId={selectedMeasurementId}
                          draftPoints={draftPoints}
                          onAddPoint={handleAddDraftPoint}
                          onFinishShape={handleCommitShape}
                          onSelectMeasurement={setSelectedMeasurementId}
                          onCalibrateTwoPoints={handleTwoPointCalibrate}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Suspense
                  fallback={
                    <Card className="p-6 h-[560px] flex flex-col items-center justify-center gap-3">
                      <SkeletonBlock className="h-full w-full rounded-lg" />
                      <span className="text-xs text-[var(--text-muted)]">
                        {lang === 'ar' ? 'جاري تحميل محرك عرض PDF الهندسي...' : 'Loading Engineering PDF Engine...'}
                      </span>
                    </Card>
                  }
                >
                  <EngineeringPdfViewer
                    lang={lang}
                    activeTool={activeTool}
                    activeColor={CATEGORY_LABELS[activeCategory].color}
                    measurements={sheetMeasurements}
                    selectedMeasurementId={selectedMeasurementId}
                    draftPoints={draftPoints}
                    uploadedPdfSheet={uploadedMasterPdfSheet}
                    currentScaleLabel={currentScaleLabel}
                    currentPpm={currentPpm}
                    isCalibrated={currentIsCalibrated}
                    onAddPoint={handleAddDraftPoint}
                    onFinishShape={handleCommitShape}
                    onSelectMeasurement={setSelectedMeasurementId}
                    onCalibrateTwoPoints={handleTwoPointCalibrate}
                    onPageChanged={(p) => {
                      setPdfPageNum(p);
                      setDraftPoints([]);
                    }}
                    onPdfUploadedSheet={async (file) => {
                      try {
                        const { sheet: parsedSheet } = await parseUploadedDrawingFile(
                          file,
                          project.id,
                          sheets
                        );
                        const { sheet: savedSheet } = await uploadSheetBinaryToCloud({
                          project,
                          sheet: { ...parsedSheet, id: 'pdf-page-1', pageNumber: 1 },
                          ownerId: cloudUid,
                        });
                        const otherSheets = sheets.filter((s) => s.id !== savedSheet.id);
                        onUpdateProject({
                          ...project,
                          takeoffSheets: [...otherSheets, savedSheet],
                        });
                        setPdfPageNum(1);
                        pushToast(
                          lang === 'ar'
                            ? `تم حفظ ملف PDF "${savedSheet.titleAr}" في المشروع`
                            : `Saved PDF "${savedSheet.title}" to project`,
                          'success'
                        );
                      } catch (err) {
                        console.error('Failed persisting PDF upload:', err);
                        pushToast(
                          lang === 'ar'
                            ? 'تعذر حفظ ملف PDF المرفوع في المشروع'
                            : 'Failed to save uploaded PDF to project',
                          'error'
                        );
                      }
                    }}
                  />
                </Suspense>
              )}
            </div>

            {/* Measurements Ledger Panel */}
            {!expandCanvas && (
              <div className="xl:col-span-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col h-[620px] overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-[#B4863C]" />
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      {lang === 'ar' ? 'سجل القياسات والكميات' : 'Takeoff Measurements'}
                    </span>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[var(--text-muted)]">
                    {measurements.length} {lang === 'ar' ? 'بند' : 'items'}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]">
                  {measurements.length === 0 ? (
                    <EmptyState
                      title={lang === 'ar' ? 'لا توجد قياسات حصر بعد' : 'No Measurements Recorded'}
                      description={
                        lang === 'ar'
                          ? 'اختر أداة قياس من الشريط العلوي وارسم على المخطط لحساب الكميات والتكلفة فوراً.'
                          : 'Pick a measurement tool above and draw on the blueprint sheet to compute quantities & costs.'
                      }
                    />
                  ) : (
                    measurements.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => {
                          setSelectedMeasurementId(m.id);
                          const targetSheet = sheets.find((s) => s.id === m.sheetId);
                          if (targetSheet) {
                            setViewMode('svg_sheets');
                            setActiveSheetId(targetSheet.id);
                          }
                        }}
                        className={`p-3.5 cursor-pointer transition-colors space-y-1.5 ${
                          selectedMeasurementId === m.id
                            ? 'bg-[#B4863C]/12'
                            : 'hover:bg-[var(--bg-surface-subtle)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium">
                              <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: m.color }}
                              />
                              <span className="text-[var(--text-muted)]">
                                {lang === 'ar' ? CATEGORY_LABELS[m.category].ar : CATEGORY_LABELS[m.category].en}
                              </span>
                              <span className="font-mono text-[var(--text-muted)]">· {m.sheetId}</span>
                            </div>
                            <div className="text-xs font-semibold text-[var(--text-primary)] mt-0.5 truncate">
                              {lang === 'ar' ? m.labelAr : m.label}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMeasurement(m.id);
                            }}
                            className="p-1 rounded text-rose-500 hover:bg-rose-500/10 shrink-0"
                            aria-label={lang === 'ar' ? 'حذف القياس' : 'Delete measurement'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono tabular-nums pt-1">
                          <span className="text-[var(--text-secondary)] font-semibold">
                            {m.computedQuantity.toFixed(2)} {m.unit} × {m.unitRateAed} AED
                          </span>
                          <span className="font-bold text-[#B4863C] dark:text-[#C99A49]">
                            {formatAED(m.totalCostAed, lang)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] space-y-1 text-xs font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="font-sans text-[var(--text-muted)]">{lang === 'ar' ? 'التكلفة المباشرة' : 'Direct Cost'}</span>
                    <span className="text-[var(--text-primary)]">{formatAED(summary.directCostAed, lang)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[var(--text-primary)]">
                    <span className="font-sans">{lang === 'ar' ? 'الإجمالي مع 5% VAT' : 'Grand Total (incl. 5% VAT)'}</span>
                    <span className="text-[#B4863C]">{formatAED(summary.grandTotalAed, lang)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <PdfScaleModal
        isOpen={scaleModalOpen}
        onClose={() => setScaleModalOpen(false)}
        lang={lang}
        currentPointsPerMeter={currentPpm}
        currentScaleLabel={currentScaleLabel}
        calibrationPixelDistance={calibrationSpanUnits}
        onApplyPreset={handleApplyPresetScale}
        onStartTwoPointCalibrate={() => {
          setActiveTool('calibrate');
          setDraftPoints([]);
        }}
        onConfirmTwoPointDistance={handleConfirmTwoPointDistance}
      />

      <RateLibraryModal
        isOpen={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        lang={lang}
        rateLibrary={rateLibrary}
        onUpdateRate={onUpdateRate}
        onAddRate={onAddRate}
      />

      <PdfTakeoffBoqModal
        isOpen={boqModalOpen}
        onClose={() => setBoqModalOpen(false)}
        lang={lang}
        project={project}
        company={company}
        measurements={measurements}
        summary={summary}
        summaryConfig={summaryConfig}
        rateLibrary={rateLibrary}
        onChangeSummaryConfig={(cfg) =>
          onUpdateProject({ ...project, takeoffSummaryConfig: cfg })
        }
        onOpenPrintReport={() => {
          setBoqModalOpen(false);
          setPrinterOpen(true);
        }}
      />

      {printerOpen && (
        <Suspense fallback={null}>
          <ComprehensiveReportPrinter
            isOpen={printerOpen}
            onClose={() => setPrinterOpen(false)}
            lang={lang}
            project={project}
            company={company}
            sheets={sheets}
            measurements={measurements}
            summary={summary}
            rateLibrary={rateLibrary}
          />
        </Suspense>
      )}
    </div>
  );
};
