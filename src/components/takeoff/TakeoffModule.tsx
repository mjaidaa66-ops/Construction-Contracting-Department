import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  Calculator,
  Check,
  FileSpreadsheet,
  FileUp,
  Hand,
  Hexagon,
  Loader2,
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
import {
  calibratePointsPerMeter,
  DEFAULT_POINTS_PER_METER,
  distanceInPdfPoints,
} from '../../utils/pdfMeasurementMath';
import {
  calculateTakeoffMeasurementValues,
  computeTakeoffSummary,
} from '../../utils/takeoffCalculations';
import { uploadSheetBinaryToCloud } from '../../services/cloudSyncService';
import { parseUploadedDrawingFile } from '../../utils/takeoffSheetLoader';
import { ComprehensiveReportPrinter } from './ComprehensiveReportPrinter';
import { EngineeringPdfViewer } from './EngineeringPdfViewer';
import { PdfCanvasSheet } from './PdfCanvasSheet';
import { PdfScaleModal } from './PdfScaleModal';
import { PdfTakeoffBoqModal } from './PdfTakeoffBoqModal';
import { RateLibraryModal } from './RateLibraryModal';
import { SheetBackdropRenderer } from './SheetBackdropRenderer';
import { TakeoffPrintSummaryView } from './TakeoffPrintSummaryView';

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
  const sheets: TakeoffSheet[] = project.takeoffSheets || [];
  const measurements: TakeoffMeasurement[] = project.takeoffMeasurements || [];
  const summaryConfig: TakeoffSummaryConfig = project.takeoffSummaryConfig || {
    overheadPercent: 10,
    profitPercent: 12,
    vatPercent: 5,
  };

  const [viewMode, setViewMode] = useState<'svg_sheets' | 'pdf_engine' | 'print_summary'>('svg_sheets');
  const [activeSheetId, setActiveSheetId] = useState<string>(sheets[0]?.id || 'sheet-a101');
  const [pdfPageNum, setPdfPageNum] = useState<number>(1);
  const [pdfPointsPerMeter, setPdfPointsPerMeter] = useState<number>(DEFAULT_POINTS_PER_METER);
  const [pdfScaleLabel, setPdfScaleLabel] = useState<string>('1:100');

  const [activeTool, setActiveTool] = useState<TakeoffTool>('polygon');
  const [activeCategory, setActiveCategory] = useState<TakeoffCategory>('concrete');
  const [heightOrDepth, setHeightOrDepth] = useState<number>(0.45);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [customLabel, setCustomLabel] = useState<string>('');
  const [draftPoints, setDraftPoints] = useState<PdfPoint[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(
    highlightedMeasurementId || null
  );

  const [scaleModalOpen, setScaleModalOpen] = useState(false);
  const [calibrationSpanUnits, setCalibrationSpanUnits] = useState<number | null>(null);
  const [calibrationPts, setCalibrationPts] = useState<[PdfPoint, PdfPoint] | null>(null);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [boqModalOpen, setBoqModalOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const sheetUploadInputRef = useRef<HTMLInputElement | null>(null);

  const activeSheet = sheets.find((s) => s.id === activeSheetId) || sheets[0];
  const currentSheetId =
    viewMode === 'pdf_engine' ? `pdf-page-${pdfPageNum}` : activeSheet?.id || 'sheet-a101';

  const currentPpm =
    viewMode === 'pdf_engine' ? pdfPointsPerMeter : activeSheet?.pixelsPerMeter || 40;
  const currentScaleLabel =
    viewMode === 'pdf_engine' ? pdfScaleLabel : activeSheet?.scaleLabel || '1:100';

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

  const handleConfirmTwoPointDistance = (knownMeters: number) => {
    if (!calibrationPts) return;
    const newPpm = calibratePointsPerMeter(calibrationPts[0], calibrationPts[1], knownMeters);
    if (viewMode === 'pdf_engine') {
      setPdfPointsPerMeter(newPpm);
      setPdfScaleLabel(`Calibrated`);
    } else if (activeSheet) {
      const updatedSheets = sheets.map((s) =>
        s.id === activeSheet.id
          ? { ...s, pixelsPerMeter: newPpm, scaleLabel: 'Calibrated', calibrated: true }
          : s
      );
      onUpdateProject({ ...project, takeoffSheets: updatedSheets });
    }
    setCalibrationPts(null);
    setCalibrationSpanUnits(null);
  };

  const handleApplyPresetScale = (label: string, ppm: number) => {
    if (viewMode === 'pdf_engine') {
      setPdfPointsPerMeter(ppm);
      setPdfScaleLabel(label);
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
    } catch (err) {
      console.error('Upload blueprint error:', err);
    } finally {
      setUploadingSheet(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Engine Mode & BOQ Summary Bar */}
      <div className="no-print rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                setViewMode('svg_sheets');
                setDraftPoints([]);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'svg_sheets'
                  ? 'bg-[#B4863C] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar'
                ? `لوحات المخططات المعايرة (${sheets.length})`
                : `Calibrated Blueprint Sheets (${sheets.length})`}
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('pdf_engine');
                setDraftPoints([]);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'pdf_engine'
                  ? 'bg-[#B4863C] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {lang === 'ar' ? 'عارض PDF الهندسي (pdfjs-dist)' : 'Multi-Page PDF Engine'}
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('print_summary');
                setDraftPoints([]);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'print_summary'
                  ? 'bg-[#B4863C] text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'ملخص للطباعة' : 'Print Summary'}</span>
            </button>
          </div>

          <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            <span>{lang === 'ar' ? 'المقياس:' : 'Scale:'}</span>{' '}
            <strong className="text-[#B4863C]">{currentScaleLabel}</strong>{' '}
            <span className="text-slate-400">({currentPpm.toFixed(2)} u/m)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-mono tabular-nums">
            <span className="text-slate-500">{lang === 'ar' ? 'الإجمالي + ضريبة 5%:' : 'Total + 5% VAT:'}</span>{' '}
            <strong className="text-[#B4863C] dark:text-[#D4A853]">
              {formatAED(summary.grandTotalAed, lang)}
            </strong>
          </div>

          <button
            type="button"
            onClick={() => setScaleModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Ruler className="w-3.5 h-3.5 text-[#B4863C]" />
            <span>{lang === 'ar' ? 'معايرة المقياس' : 'Scale'}</span>
          </button>

          <button
            type="button"
            onClick={() => setRateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#B4863C]" />
            <span>{lang === 'ar' ? `دليل الأسعار (${rateLibrary.length})` : `Rates (${rateLibrary.length})`}</span>
          </button>

          <button
            type="button"
            onClick={() => setBoqModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'المقايسة BOQ والتصدير' : 'BOQ & Export'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'print_summary' ? (
        <div className={printerOpen ? 'no-print' : undefined}>
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
        </div>
      ) : (
        <div className="no-print space-y-5">
      {/* 12 Takeoff Tools & Category Parameters Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-3 space-y-3">
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
                    : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? tool.ar : tool.en}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-slate-500">{lang === 'ar' ? 'التخصص:' : 'Category:'}</span>
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value as TakeoffCategory)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-medium"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {lang === 'ar' ? v.ar : v.en}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">{lang === 'ar' ? 'الارتفاع/العمق (م):' : 'Height/Depth (m):'}</span>
            <input
              type="number"
              step="0.05"
              min={0}
              value={heightOrDepth}
              onChange={(e) => setHeightOrDepth(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums"
            />
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">{lang === 'ar' ? 'المعامل:' : 'Mult:'}</span>
            <input
              type="number"
              min={1}
              value={multiplier}
              onChange={(e) => setMultiplier(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums"
            />
          </label>

          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder={lang === 'ar' ? 'وصف البند (اختياري)...' : 'Custom measurement label...'}
            className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          />

          {draftPoints.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCommitShape}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {lang === 'ar'
                    ? `اعتماد الشكل (${draftPoints.length})`
                    : `Commit (${draftPoints.length} pts)`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDraftPoints([])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {lang === 'ar' ? 'مسح' : 'Clear'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Takeoff Canvas + Measurements Ledger */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 space-y-3">
          {viewMode === 'svg_sheets' ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
              {/* Sheet Tabs + Upload Button */}
              <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/60">
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
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
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
                  accept=".pdf,application/pdf,image/*"
                  onChange={handleUploadBlueprintSheet}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => sheetUploadInputRef.current?.click()}
                  disabled={uploadingSheet}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#B4863C]/45 bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4A853] hover:bg-[#B4863C]/20 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
                >
                  {uploadingSheet ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileUp className="w-3.5 h-3.5" />
                  )}
                  <span>{lang === 'ar' ? 'رفع مخطط (PDF/صورة)' : 'Upload PDF / Image'}</span>
                </button>
              </div>

              {activeSheet && (
                <div className="relative bg-[#0B1324] overflow-auto">
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
            <EngineeringPdfViewer
              lang={lang}
              activeTool={activeTool}
              activeColor={CATEGORY_LABELS[activeCategory].color}
              measurements={sheetMeasurements}
              selectedMeasurementId={selectedMeasurementId}
              draftPoints={draftPoints}
              onAddPoint={handleAddDraftPoint}
              onFinishShape={handleCommitShape}
              onSelectMeasurement={setSelectedMeasurementId}
              onCalibrateTwoPoints={handleTwoPointCalibrate}
              onPageChanged={(p) => {
                setPdfPageNum(p);
                setDraftPoints([]);
              }}
            />
          )}
        </div>

        {/* Measurements Ledger Panel */}
        <div className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] flex flex-col h-[560px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#B4863C]" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'سجل القياسات والكميات' : 'Takeoff Measurements'}
              </span>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {measurements.length} {lang === 'ar' ? 'بند' : 'items'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {measurements.map((m) => (
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
                    ? 'bg-[#B4863C]/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: m.color }}
                      />
                      <span className="text-slate-500">
                        {lang === 'ar' ? CATEGORY_LABELS[m.category].ar : CATEGORY_LABELS[m.category].en}
                      </span>
                      <span className="font-mono text-slate-400">· {m.sheetId}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
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
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs font-mono tabular-nums pt-1">
                  <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    {m.computedQuantity.toFixed(2)} {m.unit} × {m.unitRateAed} AED
                  </span>
                  <span className="font-bold text-[#B4863C] dark:text-[#D4A853]">
                    {formatAED(m.totalCostAed, lang)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-1 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="font-sans text-slate-500">{lang === 'ar' ? 'التكلفة المباشرة' : 'Direct Cost'}</span>
              <span>{formatAED(summary.directCostAed, lang)}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 dark:text-white">
              <span className="font-sans">{lang === 'ar' ? 'الإجمالي مع 5% VAT' : 'Grand Total (incl. 5% VAT)'}</span>
              <span className="text-[#B4863C]">{formatAED(summary.grandTotalAed, lang)}</span>
            </div>
          </div>
        </div>
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
    </div>
  );
};
