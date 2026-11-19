import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileUp,
  Hand,
  Hash,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Minus,
  MousePointer2,
  Pentagon,
  RotateCcw,
  Ruler,
  Scissors,
  Spline,
  Square,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  BimCalibrationData,
  GisPlotData,
  Language,
  PdfPoint,
  RateLibraryItem,
  TakeoffCategory,
  TakeoffMeasurement,
  TakeoffSheet,
  TakeoffTool,
} from '../../types/bunyan';
import { generateGisPlotTakeoffSheet } from '../../utils/gisTakeoffGenerator';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import {
  calibratePointsPerMeter,
  DEFAULT_POINTS_PER_METER,
  distanceInPdfPoints,
} from '../../utils/pdfMeasurementMath';
import {
  calculateTakeoffMeasurementValues,
  computeRectanglePoints,
} from '../../utils/takeoffCalculations';
import { parseUploadedDrawingFile } from '../../utils/takeoffSheetLoader';
import { SheetBackdropRenderer } from './SheetBackdropRenderer';

export interface PlanSwiftCanvasWorkspaceProps {
  lang: Language;
  projectId: string;
  projectCode?: string;
  gisData?: GisPlotData;
  sheets: TakeoffSheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet?: (sheet: TakeoffSheet) => void;
  onUpdateSheet: (sheet: TakeoffSheet) => void;
  onDeleteSheet?: (sheetId: string) => void;
  measurements: TakeoffMeasurement[];
  selectedMeasurementId: string | null;
  highlightedMeasurementIds?: string[];
  onSelectMeasurement: (id: string | null) => void;
  onAddMeasurement: (m: TakeoffMeasurement) => void;
  onUpdateMeasurement: (m: TakeoffMeasurement) => void;
  onDeleteMeasurement: (id: string) => void;
  rateLibrary: RateLibraryItem[];
  onCalibrationCommitted?: (calibration: BimCalibrationData) => void;
  onJumpToBimElement?: (bimElementId: string) => void;
}

const PLAN_SWIFT_TOOLS: Array<{
  id: TakeoffTool;
  ar: string;
  en: string;
  icon: React.ComponentType<{ className?: string }>;
  emphasize?: boolean;
}> = [
  { id: 'select', ar: 'تحديد', en: 'Select', icon: MousePointer2 },
  { id: 'pan', ar: 'تحريك', en: 'Pan', icon: Hand },
  { id: 'calibrate', ar: 'معايرة المقياس', en: 'Calibrate', icon: Ruler, emphasize: true },
  { id: 'linear', ar: 'طول مستقيم', en: 'Linear', icon: Minus },
  { id: 'polyline', ar: 'خط متعدد', en: 'Polyline', icon: Spline },
  { id: 'area', ar: 'مساحة حرة', en: 'Area', icon: Pentagon },
  { id: 'polygon', ar: 'مضلع مغلق', en: 'Polygon', icon: Pentagon },
  { id: 'rectangle', ar: 'مستطيل', en: 'Rectangle', icon: Square },
  { id: 'perimeter', ar: 'محيط', en: 'Perimeter', icon: Maximize2 },
  { id: 'volume', ar: 'حجم m³', en: 'Volume', icon: Box },
  { id: 'count', ar: 'عدّ نقاط', en: 'Count', icon: Hash },
  { id: 'deduction', ar: 'خصم فتحة', en: 'Deduction', icon: Scissors, emphasize: true },
];

export const PlanSwiftCanvasWorkspace: React.FC<PlanSwiftCanvasWorkspaceProps> = ({
  lang,
  projectId,
  projectCode,
  gisData,
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onUpdateSheet,
  onDeleteSheet,
  measurements,
  selectedMeasurementId,
  highlightedMeasurementIds = [],
  onSelectMeasurement,
  onAddMeasurement,
  onUpdateMeasurement,
  onDeleteMeasurement,
  rateLibrary,
  onCalibrationCommitted,
  onJumpToBimElement,
}) => {
  const effectiveSheets = useMemo(() => {
    if (sheets.length > 0) return sheets;
    if (!gisData) return [];
    return [
      generateGisPlotTakeoffSheet({
        id: projectId,
        code: projectCode || projectId,
        gisData,
      } as Parameters<typeof generateGisPlotTakeoffSheet>[0]),
    ];
  }, [sheets, gisData, projectId, projectCode]);

  const activeSheet = effectiveSheets.find((s) => s.id === activeSheetId) || effectiveSheets[0];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTool, setActiveTool] = useState<TakeoffTool>('polygon');
  const [activeCategory, setActiveCategory] = useState<TakeoffCategory>('concrete');
  const [selectedRateId, setSelectedRateId] = useState<string>(rateLibrary[0]?.id || '');
  const [heightOrDepth, setHeightOrDepth] = useState<number>(0.45);
  const [multiplier, setMultiplier] = useState<number>(1);
  const [customLabel, setCustomLabel] = useState<string>('');
  const [draftPoints, setDraftPoints] = useState<PdfPoint[]>([]);
  const [hoverPoint, setHoverPoint] = useState<PdfPoint | null>(null);

  // Drawing Upload & Multi-Page PDF State
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pdfTotalPages, setPdfTotalPages] = useState<number>(1);

  // Layer Tree Scope ('active_sheet' prevents sample measurements from cluttering uploaded sheets)
  const [treeScope, setTreeScope] = useState<'active_sheet' | 'all_sheets'>('active_sheet');

  // Zoom & Pan state + responsive viewport box size
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({
    width: 720,
    height: 480,
  });
  const panStartRef = useRef<{ clientX: number; clientY: number; origX: number; origY: number } | null>(null);

  // Layer visibility per TakeoffCategory
  const [hiddenCategories, setHiddenCategories] = useState<Set<TakeoffCategory>>(new Set());

  // 2-Point Calibration State
  const [calibrationDraft, setCalibrationDraft] = useState<{
    p1: PdfPoint;
    p2: PdfPoint;
    pixelSpan: number;
  } | null>(null);
  const [knownMetersInput, setKnownMetersInput] = useState<string>('5.00');

  // Measure viewport dimensions so any sheet aspect ratio fits cleanly inside 500px stage
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 40 && height > 40) {
          setViewportSize({ width, height });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeSheet?.id]);

  // Reset transient drawing/calibration drafts when switching sheets
  useEffect(() => {
    setDraftPoints([]);
    setHoverPoint(null);
    setCalibrationDraft(null);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
    setPdfTotalPages(1);
  }, [activeSheet?.id]);

  const sheetFitSize = useMemo(() => {
    if (!activeSheet) return { width: 720, height: 480 };
    const pad = 20;
    const availW = Math.max(200, viewportSize.width - pad);
    const availH = Math.max(200, viewportSize.height - pad);
    const scale = Math.min(availW / activeSheet.width, availH / activeSheet.height);
    return {
      width: Math.max(120, Math.round(activeSheet.width * scale)),
      height: Math.max(120, Math.round(activeSheet.height * scale)),
    };
  }, [activeSheet, viewportSize]);

  const handleUploadDrawingFile = async (file: File) => {
    setUploadingSheet(true);
    setUploadError(null);
    try {
      const { sheet: newSheet, totalPages } = await parseUploadedDrawingFile(
        file,
        projectId,
        sheets
      );
      if (onAddSheet) {
        onAddSheet(newSheet);
      } else {
        onUpdateSheet(newSheet);
      }
      onSelectSheet(newSheet.id);
      onSelectMeasurement(null);
      setDraftPoints([]);
      setCalibrationDraft(null);
      setPdfTotalPages(totalPages);
      setTreeScope('active_sheet');
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'تعذر تحميل ملف المخطط المرفوع.'
          : 'Failed to process uploaded blueprint file.'
      );
    } finally {
      setUploadingSheet(false);
    }
  };

  const activeCategoryRates = useMemo(
    () => rateLibrary.filter((r) => r.category === activeCategory),
    [rateLibrary, activeCategory]
  );

  const activeRateItem = useMemo(() => {
    const exact = rateLibrary.find((r) => r.id === selectedRateId && r.category === activeCategory);
    return exact || activeCategoryRates[0] || rateLibrary[0];
  }, [rateLibrary, selectedRateId, activeCategory, activeCategoryRates]);

  const activeSheetMeasurements = useMemo(
    () => measurements.filter((m) => m.sheetId === (activeSheet?.id || '')),
    [measurements, activeSheet]
  );

  const sheetMeasurements = useMemo(
    () => activeSheetMeasurements.filter((m) => !hiddenCategories.has(m.category)),
    [activeSheetMeasurements, hiddenCategories]
  );

  const treeMeasurements = useMemo(
    () => (treeScope === 'active_sheet' ? activeSheetMeasurements : measurements),
    [treeScope, activeSheetMeasurements, measurements]
  );

  const measurementsByCategory = useMemo(() => {
    const grouped = new Map<TakeoffCategory, TakeoffMeasurement[]>();
    for (const m of treeMeasurements) {
      const list = grouped.get(m.category) || [];
      list.push(m);
      grouped.set(m.category, list);
    }
    return grouped;
  }, [treeMeasurements]);

  const highlightedSet = useMemo(() => new Set(highlightedMeasurementIds), [highlightedMeasurementIds]);

  const toSheetCoords = (clientX: number, clientY: number): PdfPoint => {
    const svg = svgRef.current;
    if (!svg || !activeSheet) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * activeSheet.width,
      y: ((clientY - rect.top) / rect.height) * activeSheet.height,
    };
  };

  const commitDraftMeasurement = (ptsToCommit?: PdfPoint[]) => {
    const pts = ptsToCommit || draftPoints;
    if (!activeSheet) return;
    const minPts = activeTool === 'count' ? 1 : 2;
    if (pts.length < minPts) return;

    const unitRateAed = activeRateItem?.rateAed || 100;
    const ppm = activeSheet.pixelsPerMeter || DEFAULT_POINTS_PER_METER;

    const calc = calculateTakeoffMeasurementValues({
      tool: activeTool,
      category: activeCategory,
      points: pts,
      pointsPerMeter: ppm,
      heightOrDepth,
      multiplier,
      unitRateAed,
    });

    const catMeta = CATEGORY_LABELS[activeCategory];
    const defaultEn = activeRateItem ? `${activeRateItem.nameEn}` : `${catMeta.en} (${activeTool})`;
    const defaultAr = activeRateItem ? `${activeRateItem.nameAr}` : `${catMeta.ar} (${activeTool})`;

    const newMeas: TakeoffMeasurement = {
      id: `tm-${Date.now()}`,
      sheetId: activeSheet.id,
      projectId,
      category: activeCategory,
      tool: activeTool,
      label: customLabel.trim() || defaultEn,
      labelAr: customLabel.trim() || defaultAr,
      points: pts,
      heightOrDepth,
      multiplier,
      unit: calc.unit,
      rawValue: calc.rawValue,
      computedQuantity: calc.computedQuantity,
      rateItemId: activeRateItem?.id,
      unitRateAed,
      totalCostAed: calc.totalCostAed,
      color: activeTool === 'deduction' ? '#F43F5E' : catMeta.color,
      createdAt: new Date().toISOString(),
    };

    onAddMeasurement(newMeas);
    onSelectMeasurement(newMeas.id);
    setDraftPoints([]);
    setCustomLabel('');
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'pan') return;
    if (activeTool === 'select') {
      onSelectMeasurement(null);
      return;
    }

    const pt = toSheetCoords(e.clientX, e.clientY);

    if (activeTool === 'calibrate') {
      if (draftPoints.length === 1) {
        const span = distanceInPdfPoints(draftPoints[0], pt);
        if (span > 2) {
          setCalibrationDraft({ p1: draftPoints[0], p2: pt, pixelSpan: span });
          setDraftPoints([]);
        }
        return;
      }
      setCalibrationDraft(null);
      setDraftPoints([pt]);
      return;
    }

    if (activeTool === 'count') {
      commitDraftMeasurement([pt]);
      return;
    }

    if ((activeTool === 'linear' || activeTool === 'rectangle') && draftPoints.length === 1) {
      const pair = [draftPoints[0], pt];
      commitDraftMeasurement(pair);
      return;
    }

    setDraftPoints((prev) => [...prev, pt]);
  };

  const handleApplyCalibration = () => {
    if (!calibrationDraft || !activeSheet) return;
    const knownM = Number(knownMetersInput);
    if (!Number.isFinite(knownM) || knownM <= 0) return;

    const newPpm = calibratePointsPerMeter(calibrationDraft.p1, calibrationDraft.p2, knownM);
    const ratioApprox = Math.max(1, Math.round((40 / newPpm) * 100));
    const nextLabel = `1:${ratioApprox} (${knownM.toFixed(2)}m Ref)`;

    onUpdateSheet({
      ...activeSheet,
      pixelsPerMeter: newPpm,
      scaleLabel: nextLabel,
      calibrated: true,
    });

    onCalibrationCommitted?.({
      isCalibrated: true,
      referenceLengthM: knownM,
      measuredUnits: Number(calibrationDraft.pixelSpan.toFixed(2)),
      scaleFactor: Number((40 / newPpm).toFixed(4)),
      lockedAt: new Date().toISOString(),
    });

    setCalibrationDraft(null);
    setActiveTool('polygon');
  };

  const handleToggleCategoryVisibility = (cat: TakeoffCategory) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleReassignMeasurementRate = (meas: TakeoffMeasurement, rateId: string) => {
    const rate = rateLibrary.find((r) => r.id === rateId);
    if (!rate) return;
    const updatedTotal = Number((meas.computedQuantity * rate.rateAed).toFixed(2));
    onUpdateMeasurement({
      ...meas,
      rateItemId: rate.id,
      unitRateAed: rate.rateAed,
      totalCostAed: updatedTotal,
    });
  };

  const liveDraftPreview = useMemo(() => {
    if (!activeSheet || draftPoints.length === 0) return null;
    const ppm = activeSheet.pixelsPerMeter || DEFAULT_POINTS_PER_METER;
    const pts =
      activeTool === 'rectangle' && draftPoints.length === 1 && hoverPoint
        ? [draftPoints[0], hoverPoint]
        : draftPoints;
    if (pts.length < 2 && activeTool !== 'count') return null;

    return calculateTakeoffMeasurementValues({
      tool: activeTool,
      category: activeCategory,
      points: pts,
      pointsPerMeter: ppm,
      heightOrDepth,
      multiplier,
      unitRateAed: activeRateItem?.rateAed || 0,
    });
  }, [activeSheet, draftPoints, hoverPoint, activeTool, activeCategory, heightOrDepth, multiplier, activeRateItem]);

  return (
    <div className="space-y-3">
      {/* PlanSwift Tool & Assembly Parameters Ribbon */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {PLAN_SWIFT_TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => {
                    setActiveTool(tool.id);
                    setDraftPoints([]);
                    if (tool.id !== 'calibrate') setCalibrationDraft(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? tool.id === 'deduction'
                        ? 'bg-rose-600 text-white'
                        : 'bg-[#B4863C] text-white'
                      : tool.emphasize
                      ? 'bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4A853] border border-[#B4863C]/35 hover:bg-[#B4863C]/20'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{lang === 'ar' ? tool.ar : tool.en}</span>
                </button>
              );
            })}
          </div>

          {/* Zoom & Pan Reset Controls */}
          <div className="flex items-center gap-1 border-s border-slate-200 dark:border-slate-800 ps-2">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono tabular-nums px-1.5 text-slate-700 dark:text-slate-200">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPanOffset({ x: 0, y: 0 });
              }}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Reset view"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Assembly, Rate Library & Geometric Parameters Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">{lang === 'ar' ? 'الطبقة:' : 'Category:'}</span>
            <select
              value={activeCategory}
              onChange={(e) => {
                const cat = e.target.value as TakeoffCategory;
                setActiveCategory(cat);
                const firstRate = rateLibrary.find((r) => r.category === cat);
                if (firstRate) setSelectedRateId(firstRate.id);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-medium text-slate-900 dark:text-slate-100"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {lang === 'ar' ? v.ar : v.en}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 min-w-0">
            <BookOpen className="w-3.5 h-3.5 text-[#B4863C] shrink-0" />
            <span className="text-slate-500 shrink-0">{lang === 'ar' ? 'بند التسعير:' : 'Rate Item:'}</span>
            <select
              value={activeRateItem?.id || ''}
              onChange={(e) => setSelectedRateId(e.target.value)}
              className="max-w-[240px] truncate px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              {(activeCategoryRates.length > 0 ? activeCategoryRates : rateLibrary).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {lang === 'ar' ? r.nameAr : r.nameEn} ({r.rateAed} AED/{r.unit})
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">{lang === 'ar' ? 'العمق/الارتفاع (م):' : 'Height/Depth (m):'}</span>
            <input
              type="number"
              step="0.05"
              min={0}
              value={heightOrDepth}
              onChange={(e) => setHeightOrDepth(Number(e.target.value) || 0)}
              className="w-20 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums text-slate-900 dark:text-white"
            />
          </label>

          <label className="flex items-center gap-1.5">
            <span className="text-slate-500">{lang === 'ar' ? 'المعامل:' : 'Mult:'}</span>
            <input
              type="number"
              min={1}
              value={multiplier}
              onChange={(e) => setMultiplier(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums text-slate-900 dark:text-white"
            />
          </label>

          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder={lang === 'ar' ? 'تسمية القياس (اختياري)...' : 'Custom assembly label...'}
            className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
          />

          {draftPoints.length > 0 && (
            <div className="flex items-center gap-2">
              {liveDraftPreview && (
                <span className="text-xs font-mono tabular-nums text-[#B4863C] dark:text-[#D4A853] font-semibold">
                  {liveDraftPreview.computedQuantity.toFixed(2)} {liveDraftPreview.unit}
                </span>
              )}
              <button
                type="button"
                onClick={() => commitDraftMeasurement()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {lang === 'ar' ? `اعتماد (${draftPoints.length})` : `Commit (${draftPoints.length})`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDraftPoints([])}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {lang === 'ar' ? 'إلغاء' : 'Clear'}
              </button>
            </div>
          )}
        </div>

        {/* Inline Two-Point Reference Calibration Prompt */}
        {calibrationDraft && (
          <div className="p-3 rounded-lg border border-[#B4863C]/40 bg-[#B4863C]/10 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Ruler className="w-4 h-4 text-[#B4863C] shrink-0" />
              <span>
                {lang === 'ar'
                  ? `تم رسم خط مرجعي بطول ${calibrationDraft.pixelSpan.toFixed(1)} وحدة. أدخل الطول الحقيقي بالمتر:`
                  : `Reference line drawn (${calibrationDraft.pixelSpan.toFixed(1)} units). Enter real-world length (m):`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min={0.1}
                value={knownMetersInput}
                onChange={(e) => setKnownMetersInput(e.target.value)}
                className="w-24 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleApplyCalibration}
                className="px-3 py-1 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
              >
                {lang === 'ar' ? 'تحديث مقياس اللوحة' : 'Apply Sheet Scale'}
              </button>
              <button
                type="button"
                onClick={() => setCalibrationDraft(null)}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Split: Blueprint Canvas + Layers/Assemblies Tree */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Blueprint Overlay Sheet Canvas */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden flex flex-col">
          {/* Sheet Tabs + Upload Control + Active Scale & Page Metadata */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-900/60">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {effectiveSheets.map((sh) => {
                const isActive = activeSheet?.id === sh.id;
                const isCustom = sh.sheetType !== 'blueprint_svg';
                return (
                  <div
                    key={sh.id}
                    className={`inline-flex items-center rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[#B4863C] text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSheet(sh.id);
                        setDraftPoints([]);
                      }}
                      className="px-2.5 py-1 whitespace-nowrap flex items-center"
                    >
                      <span className="font-mono font-bold me-1.5">{sh.code}</span>
                      <span className="max-w-[140px] truncate">
                        {lang === 'ar' ? sh.titleAr : sh.title}
                      </span>
                    </button>
                    {isCustom && onDeleteSheet && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSheet(sh.id);
                        }}
                        className={`pe-1.5 ps-0.5 py-1 hover:opacity-80 ${
                          isActive ? 'text-white/90' : 'text-slate-400 hover:text-rose-500'
                        }`}
                        aria-label="Remove uploaded sheet"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleUploadDrawingFile(file);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingSheet}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#B4863C]/45 bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4A853] hover:bg-[#B4863C]/20 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
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
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {activeSheet.sheetType === 'pdf_document' && pdfTotalPages > 1 && (
                  <div className="inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-white dark:bg-slate-900">
                    <button
                      type="button"
                      disabled={(activeSheet.pageNumber || 1) <= 1}
                      onClick={() =>
                        onUpdateSheet({
                          ...activeSheet,
                          pageNumber: Math.max(1, (activeSheet.pageNumber || 1) - 1),
                        })
                      }
                      className="p-0.5 disabled:opacity-40 hover:text-[#B4863C]"
                      aria-label="Previous PDF page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span>
                      P.{activeSheet.pageNumber || 1}/{pdfTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={(activeSheet.pageNumber || 1) >= pdfTotalPages}
                      onClick={() =>
                        onUpdateSheet({
                          ...activeSheet,
                          pageNumber: Math.min(pdfTotalPages, (activeSheet.pageNumber || 1) + 1),
                        })
                      }
                      className="p-0.5 disabled:opacity-40 hover:text-[#B4863C]"
                      aria-label="Next PDF page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <span>
                  {activeSheet.scaleLabel} · {activeSheet.pixelsPerMeter.toFixed(1)} px/m
                </span>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="px-3 py-2 bg-rose-500/10 border-b border-rose-500/25 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-2">
              <span>{uploadError}</span>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="p-0.5 hover:opacity-75"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Interactive Zoom/Pan Blueprint Viewport (with Drag & Drop File Upload) */}
          {activeSheet ? (
            <div
              ref={viewportRef}
              className="relative bg-[#0B1324] overflow-hidden h-[500px] select-none flex items-center justify-center"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDragOver) setIsDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDragOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragOver(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) {
                  void handleUploadDrawingFile(file);
                }
              }}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.15 : -0.15;
                  setZoom((z) => Math.min(3, Math.max(0.5, Number((z + delta).toFixed(2)))));
                }
              }}
              onMouseDown={(e) => {
                if (activeTool === 'pan' || e.button === 1) {
                  setIsDraggingPan(true);
                  panStartRef.current = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    origX: panOffset.x,
                    origY: panOffset.y,
                  };
                }
              }}
              onMouseMove={(e) => {
                if (isDraggingPan && panStartRef.current) {
                  setPanOffset({
                    x: panStartRef.current.origX + (e.clientX - panStartRef.current.clientX),
                    y: panStartRef.current.origY + (e.clientY - panStartRef.current.clientY),
                  });
                }
              }}
              onMouseUp={() => {
                setIsDraggingPan(false);
                panStartRef.current = null;
              }}
              onMouseLeave={() => {
                setIsDraggingPan(false);
                panStartRef.current = null;
              }}
            >
              <div
                className="relative origin-center transition-transform duration-75 shrink-0 shadow-xl"
                style={{
                  width: `${sheetFitSize.width}px`,
                  height: `${sheetFitSize.height}px`,
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                }}
              >
                <SheetBackdropRenderer
                  sheet={activeSheet}
                  lang={lang}
                  onPdfLoaded={setPdfTotalPages}
                />

                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${activeSheet.width} ${activeSheet.height}`}
                  onClick={handleSvgClick}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    if (draftPoints.length >= 2 || (activeTool === 'count' && draftPoints.length >= 1)) {
                      commitDraftMeasurement();
                    }
                  }}
                  onMouseMove={(e) => setHoverPoint(toSheetCoords(e.clientX, e.clientY))}
                  onMouseLeave={() => setHoverPoint(null)}
                  className={`absolute inset-0 w-full h-full ${
                    activeTool === 'pan'
                      ? 'cursor-grab'
                      : activeTool === 'select'
                      ? 'cursor-default'
                      : 'cursor-crosshair'
                  }`}
                >
                  {sheetMeasurements.map((m) => {
                    const isSelected = m.id === selectedMeasurementId;
                    const isAuditHit = highlightedSet.has(m.id);
                    const strokeCol = isAuditHit ? '#EF4444' : isSelected ? '#FDE047' : m.color;

                    if (m.tool === 'count') {
                      return (
                        <g
                          key={m.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMeasurement(m.id);
                          }}
                          className="cursor-pointer"
                        >
                          {m.points.map((p, idx) => (
                            <circle
                              key={idx}
                              cx={p.x}
                              cy={p.y}
                              r={isSelected || isAuditHit ? 8 : 6}
                              fill={m.color}
                              stroke={strokeCol}
                              strokeWidth={2}
                            />
                          ))}
                        </g>
                      );
                    }

                    if (m.tool === 'linear' || m.tool === 'polyline') {
                      const ptsStr = m.points.map((p) => `${p.x},${p.y}`).join(' ');
                      const last = m.points[m.points.length - 1];
                      return (
                        <g
                          key={m.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMeasurement(m.id);
                          }}
                          className="cursor-pointer"
                        >
                          <polyline
                            points={ptsStr}
                            fill="none"
                            stroke={strokeCol}
                            strokeWidth={isSelected || isAuditHit ? 4 : 2.5}
                          />
                          {last && (
                            <text
                              x={last.x + 6}
                              y={last.y - 6}
                              fill="#F8FAFC"
                              fontSize="11"
                              fontFamily="monospace"
                            >
                              {m.computedQuantity.toFixed(2)} {m.unit}
                            </text>
                          )}
                        </g>
                      );
                    }

                    const polyPts =
                      m.tool === 'rectangle' && m.points.length === 2
                        ? computeRectanglePoints(m.points[0], m.points[1])
                        : m.points;
                    const ptsStr = polyPts.map((p) => `${p.x},${p.y}`).join(' ');
                    const cx = polyPts.reduce((acc, p) => acc + p.x, 0) / Math.max(1, polyPts.length);
                    const cy = polyPts.reduce((acc, p) => acc + p.y, 0) / Math.max(1, polyPts.length);

                    return (
                      <g
                        key={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMeasurement(m.id);
                        }}
                        className="cursor-pointer"
                      >
                        <polygon
                          points={ptsStr}
                          fill={
                            m.tool === 'deduction'
                              ? 'rgba(244,63,94,0.28)'
                              : isAuditHit
                              ? 'rgba(239,68,68,0.28)'
                              : `${m.color}36`
                          }
                          stroke={strokeCol}
                          strokeWidth={isSelected || isAuditHit ? 3.5 : 2}
                          strokeDasharray={m.tool === 'deduction' ? '6 4' : undefined}
                        />
                        {polyPts.length >= 3 && (
                          <g transform={`translate(${cx}, ${cy})`}>
                            <rect
                              x="-56"
                              y="-11"
                              width="112"
                              height="22"
                              rx="4"
                              fill="rgba(15,23,42,0.88)"
                              stroke={strokeCol}
                              strokeWidth="1"
                            />
                            <text
                              textAnchor="middle"
                              y="4"
                              fill="#F8FAFC"
                              fontSize="10.5"
                              fontFamily="monospace"
                              fontWeight="600"
                            >
                              {m.computedQuantity.toFixed(2)} {m.unit}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Active Draft Geometry */}
                  {draftPoints.length > 0 && (
                    <g>
                      {draftPoints.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r="4.5"
                          fill={activeTool === 'calibrate' ? '#38BDF8' : CATEGORY_LABELS[activeCategory].color}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                      ))}
                      {draftPoints.length >= 2 && (
                        <polyline
                          points={draftPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                          fill="none"
                          stroke={CATEGORY_LABELS[activeCategory].color}
                          strokeWidth="2"
                          strokeDasharray="4 3"
                        />
                      )}
                      {hoverPoint && activeTool !== 'count' && (
                        <line
                          x1={draftPoints[draftPoints.length - 1].x}
                          y1={draftPoints[draftPoints.length - 1].y}
                          x2={hoverPoint.x}
                          y2={hoverPoint.y}
                          stroke={activeTool === 'calibrate' ? '#38BDF8' : CATEGORY_LABELS[activeCategory].color}
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                      )}
                    </g>
                  )}

                  {/* Drawn Calibration Reference Line */}
                  {calibrationDraft && (
                    <line
                      x1={calibrationDraft.p1.x}
                      y1={calibrationDraft.p1.y}
                      x2={calibrationDraft.p2.x}
                      y2={calibrationDraft.p2.y}
                      stroke="#38BDF8"
                      strokeWidth="3"
                      strokeDasharray="6 3"
                    />
                  )}
                </svg>
              </div>

              {isDragOver && (
                <div className="absolute inset-3 z-20 rounded-xl border-2 border-dashed border-[#B4863C] bg-[#0B1324]/90 flex flex-col items-center justify-center gap-2 text-center pointer-events-none">
                  <UploadCloud className="w-9 h-9 text-[#B4863C]" />
                  <p className="text-sm font-bold text-white">
                    {lang === 'ar'
                      ? 'أفلت ملف المخطط (PDF أو صورة) لعرضه وبدء الحصر فوراً'
                      : 'Drop PDF or Image blueprint to load & start takeoff'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) void handleUploadDrawingFile(file);
              }}
              className="h-[500px] flex flex-col items-center justify-center gap-3 text-xs text-slate-400 p-6 text-center"
            >
              <UploadCloud className="w-8 h-8 text-[#B4863C]" />
              <span>
                {lang === 'ar'
                  ? 'لا توجد لوحات مخططات متاحة — ارفع ملف PDF أو صورة هندسية للبدء.'
                  : 'No takeoff sheets loaded — upload a PDF or image blueprint to begin.'}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
              >
                {lang === 'ar' ? 'اختيار مخطط للرفع' : 'Select Blueprint File'}
              </button>
            </div>
          )}
        </div>

        {/* Assemblies, Category Layers & Rate Linkage Tree */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] flex flex-col h-[542px] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#B4863C]" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {lang === 'ar' ? 'شجرة الطبقات والتسعير' : 'Layers & Assemblies Tree'}
                </span>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {treeMeasurements.length} {lang === 'ar' ? 'بند' : 'items'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setTreeScope('active_sheet')}
                className={`py-1 rounded-md transition-colors ${
                  treeScope === 'active_sheet'
                    ? 'bg-[#B4863C] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ar'
                  ? `اللوحة النشطة (${activeSheetMeasurements.length})`
                  : `Active Sheet (${activeSheetMeasurements.length})`}
              </button>
              <button
                type="button"
                onClick={() => setTreeScope('all_sheets')}
                className={`py-1 rounded-md transition-colors ${
                  treeScope === 'all_sheets'
                    ? 'bg-[#B4863C] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {lang === 'ar'
                  ? `كل المشروع (${measurements.length})`
                  : `All Sheets (${measurements.length})`}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
            {treeMeasurements.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  {lang === 'ar'
                    ? 'لا توجد قياسات مسجلة على هذه اللوحة بعد'
                    : 'No measurements recorded on this sheet yet'}
                </p>
                <p>
                  {lang === 'ar'
                    ? 'استخدم "معايرة المقياس" ثم أدوات الرسم (مضلع، طول، عدّ) للبدء في حصر هذه اللوحة.'
                    : 'Use "Calibrate" to set scale, then select Polygon, Linear, or Count to measure directly on this drawing.'}
                </p>
              </div>
            )}
            {(Object.keys(CATEGORY_LABELS) as TakeoffCategory[]).map((cat) => {
              const items = measurementsByCategory.get(cat) || [];
              if (items.length === 0) return null;
              const catMeta = CATEGORY_LABELS[cat];
              const isHidden = hiddenCategories.has(cat);
              const catCost = items.reduce((acc, m) => acc + m.totalCostAed, 0);

              return (
                <div key={cat} className="py-1">
                  {/* Layer Group Header */}
                  <div className="px-3.5 py-2 flex items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-900/40">
                    <button
                      type="button"
                      onClick={() => handleToggleCategoryVisibility(cat)}
                      className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 min-w-0"
                    >
                      {isHidden ? (
                        <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-[#B4863C] shrink-0" />
                      )}
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: catMeta.color }}
                      />
                      <span className={`truncate ${isHidden ? 'line-through opacity-50' : ''}`}>
                        {lang === 'ar' ? catMeta.ar : catMeta.en}
                      </span>
                    </button>
                    <span className="text-[11px] font-mono tabular-nums font-bold text-slate-700 dark:text-slate-300 shrink-0">
                      {formatAED(catCost, lang)}
                    </span>
                  </div>

                  {/* Individual Measurements Under Category Layer */}
                  {!isHidden && (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {items.map((m) => {
                        const isSelected = selectedMeasurementId === m.id;
                        const isAuditHit = highlightedSet.has(m.id);
                        const catRates = rateLibrary.filter((r) => r.category === m.category);

                        return (
                          <div
                            key={m.id}
                            onClick={() => {
                              onSelectMeasurement(m.id);
                              if (m.sheetId !== activeSheet?.id) {
                                onSelectSheet(m.sheetId);
                              }
                            }}
                            className={`px-3.5 py-2.5 cursor-pointer transition-colors space-y-1.5 ${
                              isAuditHit
                                ? 'bg-rose-500/15'
                                : isSelected
                                ? 'bg-[#B4863C]/12'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {lang === 'ar' ? m.labelAr : m.label}
                                </div>
                                <div className="text-[11px] font-mono tabular-nums text-slate-500">
                                  {m.computedQuantity.toFixed(2)} {m.unit} · {m.sheetId}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteMeasurement(m.id);
                                }}
                                className="p-1 rounded text-rose-500 hover:bg-rose-500/10 shrink-0"
                                aria-label="Delete measurement"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <select
                                value={m.rateItemId || ''}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => handleReassignMeasurementRate(m, e.target.value)}
                                className="flex-1 min-w-0 truncate px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                              >
                                <option value="" disabled>
                                  {lang === 'ar' ? 'اختر بند تسعير...' : 'Assign rate...'}
                                </option>
                                {(catRates.length > 0 ? catRates : rateLibrary).map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.code} ({r.rateAed} AED)
                                  </option>
                                ))}
                              </select>

                              <span className="font-mono tabular-nums font-bold text-[#B4863C] dark:text-[#D4A853] shrink-0">
                                {formatAED(m.totalCostAed, lang)}
                              </span>
                            </div>

                            {m.linkedBimElementId && (
                              <div className="flex items-center justify-between pt-0.5 text-[11px]">
                                <span className="font-mono text-sky-600 dark:text-sky-400 truncate">
                                  3D: {m.linkedBimElementId}
                                </span>
                                {onJumpToBimElement && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onJumpToBimElement(m.linkedBimElementId!);
                                    }}
                                    className="inline-flex items-center gap-1 text-[#B4863C] hover:underline font-medium shrink-0"
                                  >
                                    <Link2 className="w-3 h-3" />
                                    <span>{lang === 'ar' ? 'تحديد في 3D' : 'Focus 3D'}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
