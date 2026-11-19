import React, { useState } from 'react';
import { CheckCircle2, FileUp, Lock, ShieldAlert, ShieldCheck, Unlock } from 'lucide-react';
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
import { BimAuditModal } from './BimAuditModal';
import { BimModelTree } from './BimModelTree';
import { BimPropertiesPanel } from './BimPropertiesPanel';
import { BimViewer3D } from './BimViewer3D';

interface BimModuleProps {
  project: Project;
  lang: Language;
  onUpdateProject: (p: Project) => void;
  onJumpToTakeoff?: (measurementId: string) => void;
}

export const BimModule: React.FC<BimModuleProps> = ({
  project,
  lang,
  onUpdateProject,
  onJumpToTakeoff,
}) => {
  const elements = project.bimElements || [];
  const [selectedId, setSelectedId] = useState<string | null>(elements[0]?.id || null);
  const [hiddenDisciplines, setHiddenDisciplines] = useState<Set<BimDiscipline>>(new Set());
  const [cameraPreset, setCameraPreset] = useState<BimCameraPreset>('iso');
  const [renderMode, setRenderMode] = useState<BimRenderMode>('pbr');
  const [sectionMode, setSectionMode] = useState<BimSectionMode>('none');
  const [sectionOffset, setSectionOffset] = useState<number>(6);
  const [auditOpen, setAuditOpen] = useState(false);

  const [analysisReport, setAnalysisReport] = useState<DrawingAnalysisReport>({
    id: 'rep-seed',
    fileName: `${project.code}_Sharjah_Villa_Model.ifc`,
    sourceType: 'ifc',
    verificationStatus: 'verified',
    badge: 'BIM VERIFIED',
    confidenceScore: 98,
    elementCount: elements.length,
    warnings: [],
    calibration: {
      isCalibrated: true,
      referenceLengthM: 16.0,
      measuredUnits: 640,
      scaleFactor: 1.0,
      lockedAt: '2026-02-01T10:00:00Z',
    },
    analyzedAt: '2026-02-01T10:00:00Z',
    boqUnlocked: true,
  });

  const selectedElement: BimElement | null =
    elements.find((e) => e.id === selectedId) || null;

  const totalBimCost = elements.reduce((acc, el) => acc + el.estimatedCost, 0);
  const totalConcreteVol = elements
    .filter((e) => e.boqCategory === 'concrete')
    .reduce((acc, e) => acc + e.volumeM3, 0);
  const totalNetWallArea = elements
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
    } else {
      const text = lower.endsWith('.dxf') ? await file.text() : undefined;
      const res = parseCadOrPdfDrawing(file.name, text);
      onUpdateProject({ ...project, bimElements: res.elements });
      setAnalysisReport(res.report);
      setSelectedId(res.elements[0]?.id || null);
      setAuditOpen(true);
    }
    e.target.value = '';
  };

  const handleConfirmCalibrationLock = (refM: number, measuredUnits: number) => {
    const scaleFactor = measuredUnits > 0 ? refM / (measuredUnits / 40) : 1.0;
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
        scaleFactor,
        lockedAt: new Date().toISOString(),
      },
    }));
  };

  return (
    <div className="space-y-5">
      {/* BIM Toolbar & Verification Audit Banner */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            {analysisReport.boqUnlocked ? (
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-500" />
            )}
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {analysisReport.badge}
            </span>
          </div>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="text-slate-600 dark:text-slate-300 truncate max-w-[240px]">
            {analysisReport.fileName}
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {lang === 'ar' ? 'الخرسانة:' : 'RC Vol:'} {totalConcreteVol.toFixed(1)} m³
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
            {lang === 'ar' ? 'صافي المباني:' : 'Net Walls:'} {totalNetWallArea.toFixed(1)} m²
          </span>
          <span className="text-slate-400" aria-hidden="true">·</span>
          <span className="font-mono tabular-nums font-bold text-[#B4863C]">
            {analysisReport.boqUnlocked
              ? formatAED(totalBimCost, lang)
              : lang === 'ar' ? 'BOQ مقفل للمعايرة' : 'BOQ Locked'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAuditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {analysisReport.boqUnlocked ? (
              <Unlock className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Lock className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span>{lang === 'ar' ? 'تدقيق المقياس' : 'Calibration Audit'}</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer">
            <FileUp className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'استيراد IFC / DXF / PDF' : 'Import IFC / DXF / PDF'}</span>
            <input
              type="file"
              accept=".ifc,.dxf,.dwg,.pdf,.png,.jpg,.jpeg"
              onChange={handleUploadDrawing}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* 3-Column 5D BIM Workbench: Tree + 3D Viewport + Properties */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-3">
          <BimModelTree
            elements={elements}
            selectedId={selectedId}
            hiddenDisciplines={hiddenDisciplines}
            onSelectElement={setSelectedId}
            onToggleDiscipline={handleToggleDiscipline}
            lang={lang}
          />
        </div>

        <div className="xl:col-span-6">
          <BimViewer3D
            elements={elements}
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
        </div>

        <div className="xl:col-span-3">
          <BimPropertiesPanel
            element={selectedElement}
            lang={lang}
            onJumpToTakeoff={onJumpToTakeoff}
          />
        </div>
      </div>

      {analysisReport.boqUnlocked && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {lang === 'ar'
                ? 'النموذج ثلاثي الأبعاد معتمد ومعاير — جميع الكميات الصافية والتكاليف مرتبطة بنظام المقايسات 5D.'
                : '3D BIM model verified and calibrated — all net quantities & void deductions are linked to 5D BOQ.'}
            </span>
          </div>
          <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white">
            {formatAED(totalBimCost, lang)}
          </span>
        </div>
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
