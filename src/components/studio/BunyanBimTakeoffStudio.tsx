import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Columns2,
  Download,
  FileUp,
  Info,
  Link2,
  Loader2,
  Ruler,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  BimCalibrationData,
  BimElement,
  CompanyProfile,
  DrawingAnalysisReport,
  Language,
  Project,
  RateLibraryItem,
  TakeoffMeasurement,
  TakeoffSheet,
  TakeoffSummaryConfig,
} from '../../types/bunyan';
import { DEFAULT_COMPANY_PROFILE } from '../../data/uaeSeedData';
import {
  computeProjectTelemetry,
  generateGisPlotTakeoffSheet,
  generateProjectBimElements,
} from '../../utils/gisTakeoffGenerator';
import { formatAED } from '../../utils/i18n';
import { computeTakeoffSummary } from '../../utils/takeoffCalculations';
import { uploadSheetBinaryToCloud } from '../../services/cloudSyncService';
import { parseUploadedDrawingFile } from '../../utils/takeoffSheetLoader';
import { BimAuditModal } from '../bim/BimAuditModal';
import { Bim3DViewport } from '../bim/Bim3DViewport';
import { BunyanExportCenter } from '../export/BunyanExportCenter';
import { PlanSwiftCanvasWorkspace } from '../takeoff/PlanSwiftCanvasWorkspace';
import type {
  ComplianceViolation,
  SharjahComplianceReport,
} from '../../../server/services/sharjahComplianceAudit';

export interface BunyanBimTakeoffStudioProps {
  project: Project;
  company?: CompanyProfile;
  rateLibrary: RateLibraryItem[];
  lang: Language;
  cloudUid?: string | null;
  onUpdateProject: (p: Project) => void;
}

type StudioViewMode = '2d' | '3d' | 'split';

export const BunyanBimTakeoffStudio: React.FC<BunyanBimTakeoffStudioProps> = ({
  project,
  company = DEFAULT_COMPANY_PROFILE,
  rateLibrary,
  lang,
  cloudUid = null,
  onUpdateProject,
}) => {
  const sheets: TakeoffSheet[] = useMemo(() => {
    if (project.takeoffSheets && project.takeoffSheets.length > 0) {
      return project.takeoffSheets;
    }
    return [generateGisPlotTakeoffSheet(project)];
  }, [project]);

  const measurements: TakeoffMeasurement[] = project.takeoffMeasurements || [];
  const bimElements: BimElement[] = useMemo(() => {
    if (project.bimElements && project.bimElements.length > 0) {
      return project.bimElements;
    }
    return generateProjectBimElements(project);
  }, [project]);

  const summaryConfig: TakeoffSummaryConfig = project.takeoffSummaryConfig || {
    overheadPercent: 10,
    profitPercent: 12,
    vatPercent: 5,
  };

  const [viewMode, setViewMode] = useState<StudioViewMode>('split');
  const [activeSheetId, setActiveSheetId] = useState<string>(sheets[0]?.id || 'sheet-a101');
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(
    measurements[0]?.id || null
  );
  const [selectedBimElementId, setSelectedBimElementId] = useState<string | null>(
    bimElements[0]?.id || null
  );
  const studioUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingStudioSheet, setUploadingStudioSheet] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Keep activeSheetId & selected element valid when switching across the 56 projects
  useEffect(() => {
    if (sheets.length > 0 && !sheets.some((s) => s.id === activeSheetId)) {
      setActiveSheetId(sheets[0].id);
    }
  }, [project.id, sheets, activeSheetId]);

  useEffect(() => {
    setSelectedMeasurementId(measurements[0]?.id || null);
    setSelectedBimElementId(bimElements[0]?.id || null);
    setHighlightedBimIds([]);
    setAuditReport(null);
    setAuditError(null);
  }, [project.id]);

  // Calibration Lock & BimAuditModal state
  const [calibrationAuditOpen, setCalibrationAuditOpen] = useState(false);
  const [analysisReport, setAnalysisReport] = useState<DrawingAnalysisReport>({
    id: `rep-${project.id}`,
    fileName: `${project.code}_Sharjah_BIM_Takeoff.ifc`,
    sourceType: 'vector_pdf',
    verificationStatus: 'verified',
    badge: 'BIM VERIFIED',
    confidenceScore: 98,
    elementCount: bimElements.length,
    warnings: [],
    calibration: {
      isCalibrated: true,
      referenceLengthM: 5.0,
      measuredUnits: 200,
      scaleFactor: 1.0,
      lockedAt: new Date().toISOString(),
    },
    analyzedAt: new Date().toISOString(),
    boqUnlocked: true,
  });

  // Sharjah Municipality AI Audit State
  const [auditRunning, setAuditRunning] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditReport, setAuditReport] = useState<SharjahComplianceReport | null>(null);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [selectedViolationCode, setSelectedViolationCode] = useState<string | null>(null);
  const [highlightedBimIds, setHighlightedBimIds] = useState<string[]>([]);

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

  const telemetry = useMemo(() => computeProjectTelemetry(project), [project]);

  // Highlighted 2D measurements corresponding to highlighted 3D elements or active violation
  const highlightedMeasurementIds = useMemo(() => {
    if (highlightedBimIds.length === 0) return [];
    const bimSet = new Set(highlightedBimIds);
    return measurements
      .filter((m) => {
        if (m.linkedBimElementId && bimSet.has(m.linkedBimElementId)) return true;
        const matchedBim = bimElements.find(
          (el) => bimSet.has(el.id) && el.linkedMeasurementId === m.id
        );
        return Boolean(matchedBim);
      })
      .map((m) => m.id);
  }, [highlightedBimIds, measurements, bimElements]);

  // Bi-directional Sync: 2D Measurement -> 3D BIM Element
  const handleSelectMeasurementSynced = (measId: string | null) => {
    setSelectedMeasurementId(measId);
    if (!measId) return;

    const meas = measurements.find((m) => m.id === measId);
    if (!meas) return;

    if (meas.linkedBimElementId) {
      setSelectedBimElementId(meas.linkedBimElementId);
      return;
    }
    const reverseMatch = bimElements.find((el) => el.linkedMeasurementId === meas.id);
    if (reverseMatch) {
      setSelectedBimElementId(reverseMatch.id);
    }
  };

  // Bi-directional Sync: 3D BIM Element -> 2D Measurement & Active Sheet
  const handleSelectBimSynced = (bimId: string | null) => {
    setSelectedBimElementId(bimId);
    if (!bimId) return;

    const el = bimElements.find((b) => b.id === bimId);
    const linkedMeasId =
      el?.linkedMeasurementId ||
      measurements.find((m) => m.linkedBimElementId === bimId)?.id ||
      null;

    if (linkedMeasId) {
      setSelectedMeasurementId(linkedMeasId);
      const targetMeas = measurements.find((m) => m.id === linkedMeasId);
      if (targetMeas && targetMeas.sheetId !== activeSheetId) {
        setActiveSheetId(targetMeas.sheetId);
      }
    }
  };

  // Manual 2D <-> 3D Linker for current selected items
  const handleLinkSelected2DTo3D = () => {
    if (!selectedMeasurementId || !selectedBimElementId) return;
    const nextMeasurements = measurements.map((m) =>
      m.id === selectedMeasurementId ? { ...m, linkedBimElementId: selectedBimElementId } : m
    );
    const nextBim = bimElements.map((el) =>
      el.id === selectedBimElementId ? { ...el, linkedMeasurementId: selectedMeasurementId } : el
    );
    onUpdateProject({
      ...project,
      takeoffMeasurements: nextMeasurements,
      bimElements: nextBim,
    });
  };

  // Sheet creation, update, deletion & auto-switch (with Firestore DocumentManifest chunk upload)
  const handleAddSheet = (newSheet: TakeoffSheet) => {
    const nextProject: Project = {
      ...project,
      takeoffSheets: [...sheets, newSheet],
    };
    onUpdateProject(nextProject);
    setActiveSheetId(newSheet.id);
    setSelectedMeasurementId(null);
    if (viewMode === '3d') {
      setViewMode('split');
    }

    if (newSheet.sheetType !== 'blueprint_svg' && newSheet.pdfDataUrl && !newSheet.pdfManifestId) {
      void uploadSheetBinaryToCloud({
        project: nextProject,
        sheet: newSheet,
        ownerId: cloudUid,
      }).then((res) => {
        if (res.manifest) {
          onUpdateProject({
            ...nextProject,
            takeoffSheets: nextProject.takeoffSheets!.map((s) =>
              s.id === newSheet.id ? res.sheet : s
            ),
          });
        }
      });
    }
  };

  const handleUpdateSheet = (updatedSheet: TakeoffSheet) => {
    const exists = sheets.some((s) => s.id === updatedSheet.id);
    const nextSheets = exists
      ? sheets.map((s) => (s.id === updatedSheet.id ? updatedSheet : s))
      : [...sheets, updatedSheet];
    onUpdateProject({ ...project, takeoffSheets: nextSheets });
  };

  const handleDeleteSheet = (sheetId: string) => {
    const nextSheets = sheets.filter((s) => s.id !== sheetId);
    const nextMeasurements = measurements.filter((m) => m.sheetId !== sheetId);
    onUpdateProject({
      ...project,
      takeoffSheets: nextSheets,
      takeoffMeasurements: nextMeasurements,
    });
    if (activeSheetId === sheetId && nextSheets[0]) {
      setActiveSheetId(nextSheets[0].id);
    }
  };

  const handleStudioUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingStudioSheet(true);
    try {
      const { sheet: parsedSheet } = await parseUploadedDrawingFile(file, project.id, sheets);
      const { sheet: uploadedSheet } = await uploadSheetBinaryToCloud({
        project,
        sheet: parsedSheet,
        ownerId: cloudUid,
      });
      handleAddSheet(uploadedSheet);
    } catch (err) {
      setAuditError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'تعذر قراءة ملف المخطط المرفوع.'
          : 'Failed to load uploaded drawing.'
      );
      setAuditDrawerOpen(true);
    } finally {
      setUploadingStudioSheet(false);
    }
  };

  const handleCalibrationCommitted = (cal: BimCalibrationData) => {
    setAnalysisReport((prev) => ({
      ...prev,
      verificationStatus: 'verified',
      badge: 'BIM VERIFIED',
      calibration: cal,
      boqUnlocked: true,
    }));
  };

  const handleConfirmCalibrationLock = (refMeters: number, measuredUnits: number) => {
    const scaleFactor = measuredUnits > 0 ? refMeters / (measuredUnits / 40) : 1.0;
    const newPpm = measuredUnits > 0 && refMeters > 0 ? measuredUnits / refMeters : 40;
    const updatedSheets = sheets.map((s) =>
      s.id === activeSheetId ? { ...s, pixelsPerMeter: newPpm, calibrated: true } : s
    );
    onUpdateProject({ ...project, takeoffSheets: updatedSheets });
    setAnalysisReport((prev) => ({
      ...prev,
      verificationStatus: 'verified',
      badge: 'BIM VERIFIED',
      boqUnlocked: true,
      warnings: [],
      calibration: {
        isCalibrated: true,
        referenceLengthM: refMeters,
        measuredUnits,
        scaleFactor,
        lockedAt: new Date().toISOString(),
      },
    }));
  };

  // Server-Side Sharjah Municipality AI Audit Call
  const handleRunSharjahAudit = async () => {
    setAuditRunning(true);
    setAuditError(null);
    setAuditDrawerOpen(true);

    try {
      const response = await fetch('/api/audit/sharjah', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectType: project.projectType,
          gisData: project.gisData,
          bimElements,
          takeoffMeasurements: measurements,
          preferredLang: lang,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `Audit failed with status ${response.status}`);
      }

      const report = payload as SharjahComplianceReport;
      setAuditReport(report);
      if (report.violations.length > 0) {
        const first = report.violations[0];
        setSelectedViolationCode(first.ruleCode);
        setHighlightedBimIds(first.affectedElementIds || []);
        if (viewMode === '2d') setViewMode('split');
      } else {
        setHighlightedBimIds([]);
      }
    } catch (err) {
      setAuditError(
        err instanceof Error
          ? err.message
          : lang === 'ar'
          ? 'تعذر تنفيذ التدقيق الهندسي الذكي عبر الخادم.'
          : 'Failed to execute Sharjah Municipality AI audit.'
      );
    } finally {
      setAuditRunning(false);
    }
  };

  const handleSelectViolation = (v: ComplianceViolation) => {
    setSelectedViolationCode(v.ruleCode);
    const ids = v.affectedElementIds || [];
    setHighlightedBimIds(ids);
    if (ids.length > 0) {
      setSelectedBimElementId(ids[0]);
      const matched = bimElements.find((el) => el.id === ids[0]);
      if (matched?.linkedMeasurementId) {
        setSelectedMeasurementId(matched.linkedMeasurementId);
      }
    }
    if (viewMode === '2d') setViewMode('split');
  };

  const selectedMeasObj = measurements.find((m) => m.id === selectedMeasurementId) || null;
  const selectedBimObj = bimElements.find((b) => b.id === selectedBimElementId) || null;
  const canLinkPair =
    Boolean(selectedMeasObj && selectedBimObj) &&
    selectedMeasObj?.linkedBimElementId !== selectedBimObj?.id;

  return (
    <div className="space-y-4">
      {/* Futuristic BIM Command HUD Header + Floating Live Telemetry */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#B4863C]/30 bg-white/95 dark:bg-[#0B1120]/90 backdrop-blur-md p-4 space-y-3.5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* View Mode Segmented Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#111A2C] border border-slate-200 dark:border-[#B4863C]/25">
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === '2d'
                    ? 'bg-[#B4863C] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? '2D PlanSwift الحصر' : '2D PlanSwift'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === 'split'
                    ? 'bg-[#B4863C] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'العرض المزدوج المتزامن (2D + 3D)' : 'Split-Screen 2D + 3D'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  viewMode === '3d'
                    ? 'bg-[#B4863C] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? '3D BIM التفاعلي' : '3D BIM'}</span>
              </button>
            </div>

            {canLinkPair && (
              <button
                type="button"
                onClick={handleLinkSelected2DTo3D}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#B4863C]/40 bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4AF37] text-xs font-semibold hover:bg-[#B4863C]/20 whitespace-nowrap"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>
                  {lang === 'ar' ? 'ربط القياس المحدد بالعنصر 3D' : 'Link Selected 2D ↔ 3D'}
                </span>
              </button>
            )}
          </div>

          {/* Blueprint Upload, Calibration Audit, Export Center & Sharjah AI Compliance Trigger */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={studioUploadInputRef}
              type="file"
              accept=".pdf,application/pdf,image/*"
              onChange={handleStudioUploadFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => studioUploadInputRef.current?.click()}
              disabled={uploadingStudioSheet}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#B4863C]/45 bg-[#B4863C]/10 text-[#B4863C] dark:text-[#D4AF37] text-xs font-semibold hover:bg-[#B4863C]/20 disabled:opacity-60 whitespace-nowrap"
            >
              {uploadingStudioSheet ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileUp className="w-3.5 h-3.5" />
              )}
              <span>{lang === 'ar' ? 'إضافة مخطط PDF/صورة' : 'Upload PDF / Image'}</span>
            </button>

            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#38BDF8]/45 bg-[#38BDF8]/10 text-sky-700 dark:text-[#38BDF8] text-xs font-semibold hover:bg-[#38BDF8]/20 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تصدير 5D BOQ' : 'Export 5D BOQ'}</span>
            </button>

            <button
              type="button"
              onClick={() => setCalibrationAuditOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#B4863C]" />
              <span>{lang === 'ar' ? 'قفل معايرة المقياس' : 'Scale Lock Audit'}</span>
            </button>

            <button
              type="button"
              onClick={handleRunSharjahAudit}
              disabled={auditRunning}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] disabled:opacity-60 whitespace-nowrap"
            >
              {auditRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ClipboardCheck className="w-3.5 h-3.5" />
              )}
              <span>
                {lang === 'ar'
                  ? 'تدقيق بلدية الشارقة الذكي (AI)'
                  : 'Sharjah Municipality AI Audit'}
              </span>
            </button>
          </div>
        </div>

        {/* Floating Live Quantity Telemetry Strip (Concrete, Rebar, Masonry, Budget, Progress) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2.5 border-t border-slate-100 dark:border-[#B4863C]/20">
          <div className="animate-hud-breathe rounded-xl border border-slate-200 dark:border-[#38BDF8]/30 bg-slate-50/90 dark:bg-[#111A2C]/80 backdrop-blur-md px-3 py-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'الخرسانة (Concrete)' : 'Concrete Volume'}
            </div>
            <div className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.concreteM3.toLocaleString('en-AE')}{' '}
                <span className="text-[11px] text-[#38BDF8]">m³</span>
              </span>
            </div>
          </div>
          <div className="animate-hud-breathe rounded-xl border border-slate-200 dark:border-[#38BDF8]/30 bg-slate-50/90 dark:bg-[#111A2C]/80 backdrop-blur-md px-3 py-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'حديد التسليح (Rebar)' : 'Rebar Weight'}
            </div>
            <div className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.steelKg.toLocaleString('en-AE')}{' '}
                <span className="text-[11px] text-[#D4AF37]">kg</span>
                <span className="text-[10px] text-slate-500 ms-1.5">({telemetry.steelTon} ton)</span>
              </span>
            </div>
          </div>
          <div className="animate-hud-breathe rounded-xl border border-slate-200 dark:border-[#38BDF8]/30 bg-slate-50/90 dark:bg-[#111A2C]/80 backdrop-blur-md px-3 py-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'المباني (Masonry)' : 'Masonry Blockwork'}
            </div>
            <div className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.masonryM2.toLocaleString('en-AE')}{' '}
                <span className="text-[11px] text-[#38BDF8]">m²</span>
              </span>
            </div>
          </div>
          <div className="animate-hud-breathe rounded-xl border border-slate-200 dark:border-[#38BDF8]/30 bg-slate-50/90 dark:bg-[#111A2C]/80 backdrop-blur-md px-3 py-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'الميزانية المعتمدة' : 'Approved Budget'}
            </div>
            <div className="font-bold text-xs sm:text-sm text-[#B4863C] dark:text-[#D4AF37] mt-0.5 truncate">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {formatAED(telemetry.approvedBudgetAed, 'en')}
              </span>
            </div>
          </div>
          <div className="animate-hud-breathe rounded-xl border border-slate-200 dark:border-[#38BDF8]/30 bg-slate-50/90 dark:bg-[#111A2C]/80 backdrop-blur-md px-3 py-2">
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {lang === 'ar' ? 'نسبة الإنجاز / GIS' : 'Progress & Plot'}
            </div>
            <div className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {telemetry.actualProgress}%{' '}
                <span className="text-[11px] font-normal text-[#38BDF8]">
                  · #{project.gisData.plotNumber}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Live 5D BOQ Cost Strip (Updates instantaneously with 2D changes) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'التكلفة المباشرة' : 'Direct Cost'}</div>
            <div className="font-bold text-slate-900 dark:text-white mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {formatAED(summary.directCostAed, 'en')}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-500">
              {lang === 'ar'
                ? `الإدارية والربح (${summary.overheadPercent + summary.profitPercent}%)`
                : `OH & Profit (${summary.overheadPercent + summary.profitPercent}%)`}
            </div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {formatAED(summary.overheadAed + summary.profitAed, 'en')}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-500">
              {lang === 'ar' ? `ضريبة UAE VAT (${summary.vatPercent}%)` : `UAE VAT (${summary.vatPercent}%)`}
            </div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {formatAED(summary.vatAed, 'en')}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'عناصر BIM / بنود 2D' : 'BIM / 2D Sync'}</div>
            <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {bimElements.length} · {measurements.length}
              </span>
            </div>
          </div>
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'الإجمالي النهائي AED' : 'Grand Total AED'}</div>
            <div className="font-bold text-sm text-[#B4863C] dark:text-[#D4AF37] mt-0.5">
              <span dir="ltr" className="font-mono tabular-nums inline-block">
                {formatAED(summary.grandTotalAed, 'en')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Synchronized Studio Viewport Area + Optional Sharjah Compliance Side Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div
          className={
            auditDrawerOpen
              ? 'xl:col-span-8 space-y-4'
              : 'xl:col-span-12 space-y-4'
          }
        >
          {viewMode === 'split' ? (
            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
              <PlanSwiftCanvasWorkspace
                lang={lang}
                projectId={project.id}
                projectCode={project.code}
                gisData={project.gisData}
                sheets={sheets}
                activeSheetId={activeSheetId}
                onSelectSheet={setActiveSheetId}
                onAddSheet={handleAddSheet}
                onUpdateSheet={handleUpdateSheet}
                onDeleteSheet={handleDeleteSheet}
                measurements={measurements}
                selectedMeasurementId={selectedMeasurementId}
                highlightedMeasurementIds={highlightedMeasurementIds}
                onSelectMeasurement={handleSelectMeasurementSynced}
                onAddMeasurement={(m) =>
                  onUpdateProject({ ...project, takeoffMeasurements: [m, ...measurements] })
                }
                onUpdateMeasurement={(updated) =>
                  onUpdateProject({
                    ...project,
                    takeoffMeasurements: measurements.map((m) =>
                      m.id === updated.id ? updated : m
                    ),
                  })
                }
                onDeleteMeasurement={(id) => {
                  onUpdateProject({
                    ...project,
                    takeoffMeasurements: measurements.filter((m) => m.id !== id),
                  });
                  if (selectedMeasurementId === id) setSelectedMeasurementId(null);
                }}
                rateLibrary={rateLibrary}
                onCalibrationCommitted={handleCalibrationCommitted}
                onJumpToBimElement={(bimId) => setSelectedBimElementId(bimId)}
              />

              <Bim3DViewport
                elements={bimElements}
                selectedId={selectedBimElementId}
                highlightedElementIds={highlightedBimIds}
                onSelectElement={handleSelectBimSynced}
                onJumpToTakeoff={(measId) => handleSelectMeasurementSynced(measId)}
                gisData={project.gisData}
                projectCode={project.code}
                lang={lang}
              />
            </div>
          ) : viewMode === '2d' ? (
            <PlanSwiftCanvasWorkspace
              lang={lang}
              projectId={project.id}
              projectCode={project.code}
              gisData={project.gisData}
              sheets={sheets}
              activeSheetId={activeSheetId}
              onSelectSheet={setActiveSheetId}
              onAddSheet={handleAddSheet}
              onUpdateSheet={handleUpdateSheet}
              onDeleteSheet={handleDeleteSheet}
              measurements={measurements}
              selectedMeasurementId={selectedMeasurementId}
              highlightedMeasurementIds={highlightedMeasurementIds}
              onSelectMeasurement={handleSelectMeasurementSynced}
              onAddMeasurement={(m) =>
                onUpdateProject({ ...project, takeoffMeasurements: [m, ...measurements] })
              }
              onUpdateMeasurement={(updated) =>
                onUpdateProject({
                  ...project,
                  takeoffMeasurements: measurements.map((m) =>
                    m.id === updated.id ? updated : m
                  ),
                })
              }
              onDeleteMeasurement={(id) => {
                onUpdateProject({
                  ...project,
                  takeoffMeasurements: measurements.filter((m) => m.id !== id),
                });
                if (selectedMeasurementId === id) setSelectedMeasurementId(null);
              }}
              rateLibrary={rateLibrary}
              onCalibrationCommitted={handleCalibrationCommitted}
              onJumpToBimElement={(bimId) => {
                setSelectedBimElementId(bimId);
                setViewMode('split');
              }}
            />
          ) : (
            <Bim3DViewport
              elements={bimElements}
              selectedId={selectedBimElementId}
              highlightedElementIds={highlightedBimIds}
              onSelectElement={handleSelectBimSynced}
              onJumpToTakeoff={(measId) => {
                handleSelectMeasurementSynced(measId);
                setViewMode('split');
              }}
              gisData={project.gisData}
              projectCode={project.code}
              lang={lang}
            />
          )}
        </div>

        {/* Sharjah Municipality AI Compliance Audit Side Panel */}
        {auditDrawerOpen && (
          <aside className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden flex flex-col max-h-[820px]">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#B4863C]" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                  {lang === 'ar'
                    ? 'تقرير تدقيق بلدية الشارقة الآلي'
                    : 'Sharjah Municipality Compliance Audit'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAuditDrawerOpen(false);
                  setHighlightedBimIds([]);
                }}
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close audit panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {auditRunning && (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 text-slate-500">
                  <Loader2 className="w-7 h-7 animate-spin text-[#B4863C]" />
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {lang === 'ar'
                      ? 'جارٍ مطابقة حدود الأرض GIS والارتدادات مع النموذج 3D وحصر الكميات...'
                      : 'Auditing GIS plot setbacks, coverage ratio, 3D BIM elements & 2D quantities...'}
                  </p>
                </div>
              )}

              {!auditRunning && auditError && (
                <div className="p-4 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertOctagon className="w-4 h-4 shrink-0" />
                    <span>{lang === 'ar' ? 'تعذر إتمام التدقيق الذكي' : 'Audit Execution Error'}</span>
                  </div>
                  <p>{auditError}</p>
                  <button
                    type="button"
                    onClick={handleRunSharjahAudit}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700"
                  >
                    {lang === 'ar' ? 'إعادة المحاولة' : 'Retry Audit'}
                  </button>
                </div>
              )}

              {!auditRunning && !auditError && auditReport && (
                <>
                  {/* Overall Compliance Verdict */}
                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        {auditReport.overallStatus === 'COMPLIANT' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : auditReport.overallStatus === 'NEEDS_REVISION' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        ) : (
                          <AlertOctagon className="w-4 h-4 text-rose-500" />
                        )}
                        <span
                          className={
                            auditReport.overallStatus === 'COMPLIANT'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : auditReport.overallStatus === 'NEEDS_REVISION'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {auditReport.overallStatus}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-sm text-[#B4863C]">
                        {auditReport.complianceScore.toFixed(0)} / 100
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {lang === 'ar' ? auditReport.summaryAr : auditReport.summaryEn}
                    </p>
                  </div>

                  {/* Calculated Sharjah Spatial Metrics */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    <div className="px-3 py-2 flex justify-between">
                      <span className="font-sans text-slate-500">
                        {lang === 'ar' ? 'مساحة الأرض / المسموح' : 'Plot / Max Allowed BUA'}
                      </span>
                      <span>
                        {auditReport.calculatedMetrics.plotAreaSqM.toFixed(0)} /{' '}
                        {auditReport.calculatedMetrics.maxAllowedBuiltUpSqM.toFixed(0)} m²
                      </span>
                    </div>
                    <div className="px-3 py-2 flex justify-between">
                      <span className="font-sans text-slate-500">
                        {lang === 'ar' ? 'المسطح الأرضي / الإجمالي' : 'Footprint / Total BUA'}
                      </span>
                      <span>
                        {auditReport.calculatedMetrics.actualGroundFootprintSqM.toFixed(1)} /{' '}
                        {auditReport.calculatedMetrics.actualTotalBuiltUpSqM.toFixed(1)} m²
                      </span>
                    </div>
                    <div className="px-3 py-2 flex justify-between">
                      <span className="font-sans text-slate-500">
                        {lang === 'ar' ? 'نسبة تغطية البناء BCR' : 'Coverage Ratio (BCR)'}
                      </span>
                      <span className="font-bold">
                        {auditReport.calculatedMetrics.buildingCoverageRatioPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="px-3 py-2 flex justify-between">
                      <span className="font-sans text-slate-500">
                        {lang === 'ar' ? 'الارتدادات المكتشفة (م)' : 'Detected Setbacks (m)'}
                      </span>
                      <span>
                        F:{auditReport.calculatedMetrics.detectedSetbacks.front} · R:
                        {auditReport.calculatedMetrics.detectedSetbacks.rear} · L:
                        {auditReport.calculatedMetrics.detectedSetbacks.sideLeft} · R:
                        {auditReport.calculatedMetrics.detectedSetbacks.sideRight}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Violations List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                      <span>
                        {lang === 'ar'
                          ? `الملاحظات والمخالفات (${auditReport.violations.length})`
                          : `Compliance Findings (${auditReport.violations.length})`}
                      </span>
                      {highlightedBimIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setHighlightedBimIds([]);
                            setSelectedViolationCode(null);
                          }}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          {lang === 'ar' ? 'مسح التظليل' : 'Clear Highlight'}
                        </button>
                      )}
                    </div>

                    {auditReport.violations.length === 0 ? (
                      <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        {lang === 'ar'
                          ? 'لم يتم رصد أي مخالفات للارتدادات أو نسبة البناء.'
                          : 'No setback, coverage, or structural code violations detected.'}
                      </div>
                    ) : (
                      auditReport.violations.map((v) => {
                        const isActive = selectedViolationCode === v.ruleCode;
                        return (
                          <button
                            key={v.ruleCode}
                            type="button"
                            onClick={() => handleSelectViolation(v)}
                            className={`w-full text-start p-3 rounded-lg border transition-colors space-y-1.5 ${
                              isActive
                                ? 'border-rose-500 bg-rose-500/10'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-bold text-[11px] text-[#B4863C]">
                                {v.ruleCode}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                                  v.severity === 'critical'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : v.severity === 'warning'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {v.severity === 'critical' ? (
                                  <AlertOctagon className="w-3 h-3" />
                                ) : v.severity === 'warning' ? (
                                  <AlertTriangle className="w-3 h-3" />
                                ) : (
                                  <Info className="w-3 h-3" />
                                )}
                                <span>{v.severity.toUpperCase()}</span>
                              </span>
                            </div>

                            <div className="font-bold text-slate-900 dark:text-white">
                              {lang === 'ar' ? v.titleAr : v.titleEn}
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                              {lang === 'ar' ? v.descriptionAr : v.descriptionEn}
                            </p>
                            <div className="pt-1 border-t border-slate-200 dark:border-slate-800 text-[11px] text-emerald-700 dark:text-emerald-300">
                              <strong>{lang === 'ar' ? 'التوصية:' : 'Fix:'}</strong>{' '}
                              {lang === 'ar' ? v.recommendedFixAr : v.recommendedFixEn}
                            </div>
                            {v.affectedElementIds.length > 0 && (
                              <div className="font-mono text-[10px] text-rose-600 dark:text-rose-400">
                                3D BIM Targets ({v.affectedElementIds.length}):{' '}
                                {v.affectedElementIds.join(', ')}
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      <BimAuditModal
        isOpen={calibrationAuditOpen}
        onClose={() => setCalibrationAuditOpen(false)}
        report={analysisReport}
        lang={lang}
        onConfirmCalibrationLock={handleConfirmCalibrationLock}
      />

      <BunyanExportCenter
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        project={project}
        company={company}
        lang={lang}
      />
    </div>
  );
};
