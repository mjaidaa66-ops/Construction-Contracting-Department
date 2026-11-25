import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  FileUp,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Unlock,
} from 'lucide-react';
import type {
  BimCameraPreset,
  BimDiscipline,
  BimElement,
  BimRenderMode,
  BimSectionMode,
  DrawingAnalysisReport,
  Language,
  Project,
} from '../../types/bunyan';
import { formatAED } from '../../utils/i18n';
import { parseIfcFile } from '../../utils/ifcParser';
import { parseCadOrPdfDrawing } from '../../utils/cadPdfParser';
import { generateProjectBimElements } from '../../utils/gisTakeoffGenerator';
import { Button, Card, SkeletonBlock, StatusIndicator, useToast } from '../ui';
import { BimAuditModal } from './BimAuditModal';
import { BimModelTree } from './BimModelTree';
import { BimPropertiesPanel } from './BimPropertiesPanel';

const BimViewer3D = lazy(() =>
  import('./BimViewer3D').then((m) => ({ default: m.BimViewer3D }))
);

interface BimModuleProps {
  project: Project;
  lang: Language;
  onUpdateProject: (p: Project) => void;
  onJumpToTakeoff?: (measurementId: string) => void;
}

function buildInitialBimReport(project: Project, elements: BimElement[], isParametricFallback: boolean): DrawingAnalysisReport {
  const hasElements = elements.length > 0;
  if (!hasElements) {
    return {
      id: `rep-empty-${project.id}`,
      fileName: `${project.code}_No_BIM_Model`,
      sourceType: 'ifc',
      verificationStatus: 'missing_data',
      badge: 'EXTRACTION FAILED',
      confidenceScore: 0,
      elementCount: 0,
      warnings: [
        'No BIM/CAD elements loaded for this project. Import a valid IFC or ASCII DXF file.',
      ],
      calibration: {
        isCalibrated: false,
        referenceLengthM: 0,
        measuredUnits: 0,
        scaleFactor: 1.0,
      },
      analyzedAt: new Date().toISOString(),
      boqUnlocked: false,
    };
  }

  const isSeedVerified = project.id === 'proj-01' && !isParametricFallback;
  return {
    id: `rep-seed-${project.id}`,
    fileName: isParametricFallback
      ? `${project.code}_GIS_Parametric_Preview`
      : `${project.code}_BIM_Model.ifc`,
    sourceType: 'ifc',
    verificationStatus: isSeedVerified ? 'verified' : 'estimated',
    badge: isSeedVerified ? 'BIM VERIFIED' : 'HUMAN REVIEW REQUIRED',
    confidenceScore: isSeedVerified ? 98 : 74,
    elementCount: elements.length,
    warnings: isSeedVerified
      ? []
      : ['Parametric GIS-derived BIM estimate — import IFC/DXF or lock scale calibration to certify BOQ.'],
    calibration: {
      isCalibrated: isSeedVerified,
      referenceLengthM: 16.0,
      measuredUnits: 640,
      scaleFactor: 1.0,
      lockedAt: isSeedVerified ? '2026-02-01T10:00:00Z' : undefined,
    },
    analyzedAt: new Date().toISOString(),
    boqUnlocked: isSeedVerified,
  };
}

export const BimModule: React.FC<BimModuleProps> = ({
  project,
  lang,
  onUpdateProject,
  onJumpToTakeoff,
}) => {
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isParametricPreview = project.bimElements === undefined;
  const elements = useMemo(
    () => (project.bimElements !== undefined ? project.bimElements : generateProjectBimElements(project)),
    [project]
  );

  const [selectedId, setSelectedId] = useState<string | null>(elements[0]?.id || null);
  const [hiddenDisciplines, setHiddenDisciplines] = useState<Set<BimDiscipline>>(new Set());
  const [cameraPreset, setCameraPreset] = useState<BimCameraPreset>('iso');
  const [renderMode, setRenderMode] = useState<BimRenderMode>('pbr');
  const [sectionMode, setSectionMode] = useState<BimSectionMode>('none');
  const [sectionOffset, setSectionOffset] = useState<number>(6);
  const [auditOpen, setAuditOpen] = useState(false);
  const [focus3d, setFocus3d] = useState(false);
  const [simPct, setSimPct] = useState<number>(100);
  const [simPlaying, setSimPlaying] = useState(false);

  const [analysisReport, setAnalysisReport] = useState<DrawingAnalysisReport>(() =>
    buildInitialBimReport(project, elements, isParametricPreview)
  );

  useEffect(() => {
    setSelectedId(elements[0]?.id || null);
    setAnalysisReport(buildInitialBimReport(project, elements, project.bimElements === undefined));
    setSimPct(100);
    setSimPlaying(false);
  }, [project.id]);

  // 4D/5D Construction Simulation Playback
  useEffect(() => {
    if (!simPlaying) return;
    const timer = window.setInterval(() => {
      setSimPct((prev) => {
        if (prev >= 100) {
          setSimPlaying(false);
          return 100;
        }
        return Math.min(100, prev + 5);
      });
    }, 320);
    return () => window.clearInterval(timer);
  }, [simPlaying]);

  const LEVEL_ORDER: Record<string, number> = {
    site_grid: 0.05,
    foundation: 0.2,
    ground: 0.42,
    level1: 0.62,
    level2: 0.78,
    level3: 0.9,
    roof: 1.0,
  };

  const simulatedElements = useMemo(() => {
    if (simPct >= 100) return elements;
    const ratio = simPct / 100;
    return elements.filter((el) => {
      const threshold = LEVEL_ORDER[el.level] ?? 0.5;
      return threshold <= ratio + 0.04;
    });
  }, [elements, simPct]);

  const activeSimCost = useMemo(
    () => simulatedElements.reduce((acc, el) => acc + el.estimatedCost, 0),
    [simulatedElements]
  );

  const selectedElement: BimElement | null =
    elements.find((e) => e.id === selectedId) || null;

  const totalBimCost = elements.reduce((acc, el) => acc + el.estimatedCost, 0);
  const totalConcreteVol = simulatedElements
    .filter((e) => e.boqCategory === 'concrete')
    .reduce((acc, e) => acc + e.volumeM3, 0);
  const totalNetWallArea = simulatedElements
    .filter((e) => e.category === 'wall')
    .reduce((acc, e) => acc + e.netAreaM2, 0);

  const handleToggleDiscipline = (disc: BimDiscipline) => {
    setHiddenDisciplines((prev) => {
      const next = new Set(prev);
      if (next.has(disc)) next.delete(disc);
      else next.add(disc);
      return next;
    });
  };

  const handleUploadDrawing = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.ifc')) {
      const text = await file.text();
      const res = parseIfcFile(text, file.name);
      onUpdateProject({ ...project, bimElements: res.elements });
      setAnalysisReport(res.report);
      setSelectedId(res.elements[0]?.id || null);
      if (res.elements.length === 0) {
        setAuditOpen(true);
        pushToast(
          lang === 'ar'
            ? `فشل استخراج عناصر IFC من ${file.name} — راجع تقرير التدقيق`
            : `IFC extraction failed for ${file.name} — check Audit Report`,
          'error'
        );
      } else {
        if (!res.report.boqUnlocked) setAuditOpen(true);
        pushToast(
          lang === 'ar'
            ? `تم استيراد نموذج IFC (${res.elements.length} عنصر)`
            : `Imported IFC model (${res.elements.length} elements)`,
          res.report.boqUnlocked ? 'success' : 'warning'
        );
      }
    } else {
      const text = lower.endsWith('.dxf') ? await file.text() : undefined;
      const res = parseCadOrPdfDrawing(file.name, text);
      onUpdateProject({ ...project, bimElements: res.elements });
      setAnalysisReport(res.report);
      setSelectedId(res.elements[0]?.id || null);
      setAuditOpen(true);
      if (res.elements.length === 0) {
        pushToast(
          lang === 'ar'
            ? `لم يتم توليد مجسم 3D: ${res.report.warnings[0] || file.name}`
            : `No 3D geometry extracted for ${file.name}; inspect audit notice.`,
          'warning'
        );
      } else {
        pushToast(
          lang === 'ar'
            ? `تم استخراج ${res.elements.length} عنصر هندسي من ${file.name}`
            : `Extracted ${res.elements.length} elements from ${file.name}`,
          res.report.boqUnlocked ? 'success' : 'warning'
        );
      }
    }
    e.target.value = '';
  };

  const handleConfirmCalibrationLock = (refM: number, measuredUnits: number) => {
    if (elements.length === 0 || analysisReport.badge === 'EXTRACTION FAILED') {
      return;
    }

    const prevRef = analysisReport.calibration.referenceLengthM || refM;
    const prevUnits = analysisReport.calibration.measuredUnits || measuredUnits;
    const prevUnitsPerM = prevRef > 0 && prevUnits > 0 ? prevUnits / prevRef : 40;
    const scaleCorrection =
      measuredUnits > 0 && refM > 0 && prevUnitsPerM > 0
        ? refM / (measuredUnits / prevUnitsPerM)
        : 1.0;

    let updatedElements = elements;
    if (Math.abs(scaleCorrection - 1.0) > 0.001 && scaleCorrection > 0.01 && scaleCorrection < 100) {
      const areaFactor = scaleCorrection * scaleCorrection;
      const volFactor = scaleCorrection * scaleCorrection * scaleCorrection;
      updatedElements = elements.map((el) => {
        const nextDims: [number, number, number] = [
          Number((el.dimensions[0] * scaleCorrection).toFixed(3)),
          Number((el.dimensions[1] * scaleCorrection).toFixed(3)),
          Number((el.dimensions[2] * scaleCorrection).toFixed(3)),
        ];
        const nextPos: [number, number, number] = [
          Number((el.position[0] * scaleCorrection).toFixed(3)),
          Number((el.position[1] * scaleCorrection).toFixed(3)),
          Number((el.position[2] * scaleCorrection).toFixed(3)),
        ];
        const nextGross = Number((el.grossAreaM2 * areaFactor).toFixed(2));
        const nextDeduct = Number((el.deductedOpeningAreaM2 * areaFactor).toFixed(2));
        const nextNet = Number((el.netAreaM2 * areaFactor).toFixed(2));
        const nextVol = Number((el.volumeM3 * volFactor).toFixed(3));
        const qty = el.boqCategory === 'concrete' ? nextVol : el.boqCategory === 'doors_windows' ? 1 : nextNet;
        return {
          ...el,
          dimensions: nextDims,
          position: nextPos,
          grossAreaM2: nextGross,
          deductedOpeningAreaM2: nextDeduct,
          netAreaM2: nextNet,
          volumeM3: nextVol,
          estimatedCost: Number((qty * el.unitRate).toFixed(2)),
        };
      });
      onUpdateProject({ ...project, bimElements: updatedElements });
    }

    setAnalysisReport((prev) => ({
      ...prev,
      verificationStatus: 'verified',
      badge: 'BIM VERIFIED',
      boqUnlocked: true,
      warnings: [],
      calibration: {
        isCalibrated: true,
        referenceLengthM: refM,
        measuredUnits,
        scaleFactor: Number(scaleCorrection.toFixed(4)),
        lockedAt: new Date().toISOString(),
      },
    }));
    pushToast(
      lang === 'ar' ? 'تم تثبيت المقياس وتفعيل جدول الكميات 5D' : 'Scale locked & 5D BOQ unlocked',
      'success'
    );
  };

  return (
    <div className="space-y-4">
      {/* BIM Toolbar & Verification Audit Banner */}
      <Card className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <StatusIndicator
            tone={
              analysisReport.badge === 'EXTRACTION FAILED'
                ? 'danger'
                : analysisReport.boqUnlocked
                ? 'success'
                : 'warning'
            }
            label={analysisReport.badge}
          />
          <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
          <span className="text-[var(--text-secondary)] truncate max-w-[220px]">
            {analysisReport.fileName}
          </span>
          <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {lang === 'ar' ? 'الخرسانة:' : 'RC Vol:'} {totalConcreteVol.toFixed(1)} m³
          </span>
          <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {lang === 'ar' ? 'صافي المباني:' : 'Net Walls:'} {totalNetWallArea.toFixed(1)} m²
          </span>
          <span className="text-[var(--text-muted)]" aria-hidden="true">·</span>
          <span dir="ltr" className="font-mono tabular-nums font-bold text-[#B4863C]">
            {analysisReport.boqUnlocked
              ? formatAED(totalBimCost, lang)
              : lang === 'ar' ? 'BOQ مقفل للمعايرة' : 'BOQ Locked'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            icon={focus3d ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            onClick={() => setFocus3d((v) => !v)}
          >
            {focus3d
              ? lang === 'ar'
                ? 'عرض الألواح الثلاثة'
                : '3-Panel View'
              : lang === 'ar'
              ? 'تكبير العارض 3D'
              : 'Expand 3D'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={
              analysisReport.boqUnlocked ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              )
            }
            onClick={() => setAuditOpen(true)}
          >
            {lang === 'ar' ? 'تدقيق المقياس' : 'Calibration Audit'}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ifc,.dxf,.dwg,.pdf,.png,.jpg,.jpeg"
            onChange={handleUploadDrawing}
            className="hidden"
          />
          <Button
            variant="primary"
            size="sm"
            icon={<FileUp className="w-3.5 h-3.5" />}
            onClick={() => fileInputRef.current?.click()}
          >
            {lang === 'ar' ? 'استيراد IFC / DXF / PDF' : 'Import IFC / DXF / PDF'}
          </Button>
        </div>
      </Card>

      {elements.length === 0 && (
        <Card className="p-4 border-rose-500/35 bg-rose-500/5 flex items-start gap-3 text-xs text-rose-700 dark:text-rose-300">
          <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">
              {lang === 'ar'
                ? 'لم يتم عرض نموذج 3D بديل (التزاماً بمبدأ مصدر المخطط الحقيقي)'
                : 'No 3D BIM Elements Loaded (Zero Synthetic Fallback Policy)'}
            </div>
            <div className="mt-0.5 opacity-90">
              {analysisReport.warnings[0] ||
                (lang === 'ar'
                  ? 'استورد ملف IFC أو ASCII DXF صالحاً، أو استخدم أداة الحصر 2D للمخططات الممسوحة.'
                  : 'Import a valid IFC or ASCII DXF file, or use 2D PlanSwift Takeoff for raster/PDF plans.')}
            </div>
          </div>
        </Card>
      )}

      {/* Interactive 4D/5D Construction Timeline & Cost Simulator */}
      {elements.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <CalendarClock className="w-4 h-4 text-[var(--accent-cyan)]" />
              <span>
                {lang === 'ar'
                  ? 'محاكي الجدول الزمني والتكلفة 4D / 5D BIM'
                  : '4D Schedule & 5D Cost Progression Simulator'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span dir="ltr" className="font-mono tabular-nums text-[var(--accent-cyan)] font-bold">
                {simPct}% ({simulatedElements.length}/{elements.length}{' '}
                {lang === 'ar' ? 'عنصر' : 'EL'})
              </span>
              <span className="text-[var(--text-muted)]">·</span>
              <span dir="ltr" className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {formatAED(activeSimCost, lang)}
              </span>
              <Button
                variant="cyan"
                size="xs"
                icon={simPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                onClick={() => {
                  if (simPct >= 100 && !simPlaying) setSimPct(15);
                  setSimPlaying((p) => !p);
                }}
              >
                {simPlaying
                  ? lang === 'ar' ? 'إيقاف' : 'Pause'
                  : lang === 'ar' ? 'تشغيل المحاكاة' : 'Simulate'}
              </Button>
            </div>
          </div>

          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={simPct}
            onChange={(e) => {
              setSimPlaying(false);
              setSimPct(Number(e.target.value));
            }}
            className="w-full accent-[var(--accent-blue)] cursor-pointer"
            aria-label={lang === 'ar' ? 'شريط محاكاة مراحل البناء 4D' : '4D Construction Timeline Scrubber'}
          />

          {project.phases && project.phases.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {project.phases.map((ph, idx) => {
                const targetPct = Math.round(((idx + 1) / project.phases.length) * 100);
                const active = simPct >= targetPct - 15 && simPct <= targetPct + 5;
                return (
                  <button
                    key={ph.id}
                    type="button"
                    onClick={() => {
                      setSimPlaying(false);
                      setSimPct(targetPct);
                    }}
                    className={`px-2.5 py-1 rounded-xl border bunyan-transition cursor-pointer ${
                      active
                        ? 'border-[var(--accent-blue)]/50 bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] font-semibold'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-blue)]/40'
                    }`}
                  >
                    {lang === 'ar' ? ph.nameAr : ph.nameEn || ph.nameAr} ({ph.progressPercentage}%)
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 3-Column 5D BIM Workbench: Tree + 3D Viewport + Properties (or Focused 3D) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {!focus3d && (
          <div className="xl:col-span-3">
            <BimModelTree
              elements={simulatedElements}
              selectedId={selectedId}
              hiddenDisciplines={hiddenDisciplines}
              onSelectElement={setSelectedId}
              onToggleDiscipline={handleToggleDiscipline}
              lang={lang}
            />
          </div>
        )}

        <div className={focus3d ? 'xl:col-span-9' : 'xl:col-span-6'}>
          <Suspense
            fallback={
              <Card className="p-6 h-[560px] flex flex-col items-center justify-center gap-3">
                <SkeletonBlock className="h-full w-full rounded-lg" />
                <span className="text-xs text-[var(--text-muted)]">
                  {lang === 'ar' ? 'جاري تهيئة عارض 3D BIM (Three.js)...' : 'Loading 3D BIM Engine...'}
                </span>
              </Card>
            }
          >
            <BimViewer3D
              elements={simulatedElements}
              selectedId={selectedId}
              hiddenDisciplines={hiddenDisciplines}
              cameraPreset={cameraPreset}
              renderMode={renderMode}
              sectionMode={sectionMode}
              sectionOffset={sectionOffset}
              onSelectElement={setSelectedId}
              onChangeCameraPreset={setCameraPreset}
              onChangeRenderMode={setRenderMode}
              onChangeSectionMode={setSectionMode}
              onChangeSectionOffset={setSectionOffset}
              lang={lang}
            />
          </Suspense>
        </div>

        <div className="xl:col-span-3">
          <BimPropertiesPanel
            element={selectedElement}
            lang={lang}
            onJumpToTakeoff={onJumpToTakeoff}
          />
        </div>
      </div>

      {analysisReport.boqUnlocked && elements.length > 0 && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {lang === 'ar'
                ? 'النموذج ثلاثي الأبعاد معتمد ومعاير — جميع الكميات الصافية والتكاليف مرتبطة بنظام المقايسات 5D.'
                : '3D BIM model verified and calibrated — all net quantities & void deductions are linked to 5D BOQ.'}
            </span>
          </div>
          <span dir="ltr" className="font-mono tabular-nums font-bold text-[var(--text-primary)]">
            {formatAED(totalBimCost, lang)}
          </span>
        </Card>
      )}

      <BimAuditModal
        isOpen={auditOpen}
        onClose={() => setAuditOpen(false)}
        report={analysisReport}
        lang={lang}
        onConfirmCalibrationLock={handleConfirmCalibrationLock}
      />
    </div>
  );
};
