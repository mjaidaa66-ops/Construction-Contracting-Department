import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  FileSpreadsheet,
  Play,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import type { Language } from '../../types/bunyan';
import type { EtabsAgentStatus } from '../../modules/structural/types/etabs.types';
import type {
  ImportStepState,
  StructuralImportPreview,
} from '../../modules/structural/types/structural-results.types';
import {
  Button,
  Card,
  CardHeader,
  HolographicPanel,
  Input,
  Select,
  StatusIndicator,
} from '../ui';
import { getReliabilityTone } from './StructuralProjectOverview';

interface StructuralImportCenterProps {
  lang: Language;
  agentStatus: EtabsAgentStatus | null;
  canStageImport: boolean;
  canConfirmRevision: boolean;
  preview: StructuralImportPreview | null;
  steps: ImportStepState[];
  busy: boolean;
  errorMessage: string | null;
  onRunLiveAgentImport: (allowDuplicate: boolean) => Promise<void>;
  onUploadFallbackTables: (params: {
    file: File;
    forceUnit: string;
    lengthUnit: string;
    sourceVersion: string;
    allowDuplicate: boolean;
  }) => Promise<void>;
  onConfirmSaveRevision: (allowDuplicateOverride: boolean) => Promise<void>;
  onCancelWorkflow: () => void;
}

export const StructuralImportCenter: React.FC<StructuralImportCenterProps> = ({
  lang,
  agentStatus,
  canStageImport,
  canConfirmRevision,
  preview,
  steps,
  busy,
  errorMessage,
  onRunLiveAgentImport,
  onUploadFallbackTables,
  onConfirmSaveRevision,
  onCancelWorkflow,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [forceUnit, setForceUnit] = useState('kN');
  const [lengthUnit, setLengthUnit] = useState('m');
  const [sourceVersion, setSourceVersion] = useState('20.3.0');
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  const liveReady = Boolean(
    agentStatus?.agentReachable &&
      agentStatus?.etabsV20Compatible &&
      agentStatus?.activeInstanceRunning
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUploadFallbackTables({
      file,
      forceUnit,
      lengthUnit,
      sourceVersion,
      allowDuplicate,
    });
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Mode A: Direct CSI ETABS v20 Agent OAPI Extraction */}
        <HolographicPanel
          title={lang === 'ar' ? 'المسار 1: استيراد مباشر من ETABS v20' : 'Path 1: Live CSI ETABS v20 OAPI Import'}
          subtitle={
            lang === 'ar'
              ? 'يتصل بوكيل ويندوز المحلي لاستخراج النموذج النشط في وضع القراءة فقط'
              : 'Connects to Windows Engineering Agent to extract active model read-only'
          }
          icon={<Cpu className="w-4 h-4" />}
          badge={
            <StatusIndicator
              tone={liveReady ? 'success' : 'warning'}
              label={
                liveReady
                  ? lang === 'ar'
                    ? 'جاهز'
                    : 'Ready'
                  : lang === 'ar'
                  ? 'غير متاح حالياً'
                  : 'Agent Offline'
              }
            />
          }
        >
          <div className="p-4 space-y-3 text-xs">
            <p className="text-[var(--text-secondary)] leading-relaxed">
              {agentStatus?.message ||
                (lang === 'ar'
                  ? 'افتح CSI ETABS v20 مع وكيل ويندوز Bunyan.EtabsAgent على جهاز المهندس لتمكين الاستخراج المباشر عبر COM OAPI.'
                  : 'Run CSI ETABS v20 alongside Bunyan.EtabsAgent on Windows to enable live OAPI extraction.')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                disabled={!canStageImport || !liveReady}
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={() => void onRunLiveAgentImport(allowDuplicate)}
              >
                {lang === 'ar' ? 'استخراج النموذج النشط للمعاينة' : 'Extract Active Model to Preview'}
              </Button>
              {busy && (
                <Button size="sm" variant="danger" onClick={onCancelWorkflow}>
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </Button>
              )}
            </div>
          </div>
        </HolographicPanel>

        {/* Mode B: Documented Fallback — Supported Exported ETABS Database Tables */}
        <HolographicPanel
          title={
            lang === 'ar'
              ? 'المسار 2: استيراد جداول ETABS المصدرة (Fallback)'
              : 'Path 2: Exported ETABS Tables Fallback (JSON / CSV / XLSX)'
          }
          subtitle={
            lang === 'ar'
              ? 'مسار بديل موثق عندما لا يكون ETABS v20 متاحاً على نفس الجهاز'
              : 'Documented engineering workflow when local ETABS v20 COM runtime is unavailable'
          }
          icon={<FileSpreadsheet className="w-4 h-4" />}
          badge={<StatusIndicator tone="info" label="JSON / CSV / XLSX" />}
        >
          <div className="p-4 space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <Select
                label={lang === 'ar' ? 'وحدة القوة' : 'Force Unit'}
                value={forceUnit}
                onChange={(e) => setForceUnit(e.target.value)}
              >
                <option value="kN">kN</option>
                <option value="N">N</option>
                <option value="tonf">tonf</option>
                <option value="kip">kip</option>
              </Select>
              <Select
                label={lang === 'ar' ? 'وحدة الطول' : 'Length Unit'}
                value={lengthUnit}
                onChange={(e) => setLengthUnit(e.target.value)}
              >
                <option value="m">m</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="ft">ft</option>
                <option value="in">in</option>
              </Select>
              <Input
                label={lang === 'ar' ? 'إصدار ETABS' : 'ETABS Ver.'}
                value={sourceVersion}
                onChange={(e) => setSourceVersion(e.target.value)}
                dir="ltr"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.xlsx,.xls"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                />
                <span>
                  {lang === 'ar' ? 'السماح بتجاوز بصمة التكرار' : 'Allow duplicate hash override'}
                </span>
              </label>

              <Button
                size="sm"
                variant="gold"
                loading={busy}
                disabled={!canStageImport}
                icon={<Upload className="w-3.5 h-3.5" />}
                onClick={() => fileInputRef.current?.click()}
              >
                {lang === 'ar' ? 'رفع جداول ETABS للمعاينة' : 'Upload Exported ETABS Tables'}
              </Button>
            </div>
          </div>
        </HolographicPanel>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl border border-[#FF405C]/35 bg-[#FF405C]/10 flex items-start gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-[#FF405C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-rose-600 dark:text-[#FF405C]">
              {lang === 'ar' ? 'تنبيه سير العمل الهندسي' : 'Import Workflow Notice'}
            </div>
            <p className="text-[var(--text-secondary)]">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* 11-Step Workflow Progress */}
      {steps.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            title={lang === 'ar' ? 'سير العمل القياسي لاستيراد ETABS (11 خطوة)' : '11-Step Controlled ETABS Import Workflow'}
            icon={<ShieldCheck className="w-4 h-4" />}
          />
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 text-xs">
            {steps.map((step) => (
              <div
                key={step.stepNumber}
                className="p-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex items-start gap-2.5"
              >
                {step.status === 'COMPLETED' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#00E5A8] shrink-0 mt-0.5" />
                ) : step.status === 'FAILED' ? (
                  <XCircle className="w-4 h-4 text-[#FF405C] shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#FF9D42] shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {lang === 'ar' ? step.titleAr : step.titleEn}
                  </div>
                  {step.detail && (
                    <div className="text-[11px] text-[var(--text-muted)] break-words">
                      {step.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Structured Import Preview + Engineer Confirmation Gate */}
      {preview && (
        <HolographicPanel
          title={
            lang === 'ar'
              ? `معاينة الاستيراد قبل الاعتماد — ${preview.dataset.model.name}`
              : `Pre-Save Import Preview — ${preview.dataset.model.name}`
          }
          subtitle={`Source: ${preview.dataset.model.sourceApplication} ${preview.dataset.model.sourceVersion} · Hash: ${preview.sourceHash}`}
          badge={
            <StatusIndicator
              tone={getReliabilityTone(preview.dataset.validation.reliability)}
              label={preview.dataset.validation.reliability}
            />
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={onCancelWorkflow}>
                {lang === 'ar' ? 'رفض المعاينة' : 'Discard Preview'}
              </Button>
              <Button
                size="sm"
                variant="primary"
                loading={busy}
                disabled={
                  !canConfirmRevision ||
                  preview.dataset.validation.status === 'FAILED' ||
                  (preview.isDuplicateImport && !allowDuplicate)
                }
                onClick={() => void onConfirmSaveRevision(allowDuplicate)}
              >
                {lang === 'ar'
                  ? 'تأكيد وحفظ نسخة المراجعة (Step 9-11)'
                  : 'Confirm & Save Immutable Revision'}
              </Button>
            </div>
          }
        >
          <div className="p-4 space-y-3 text-xs">
            {preview.isDuplicateImport && (
              <div className="p-3 rounded-xl border border-[#FF9D42]/40 bg-[#FF9D42]/10 text-[var(--text-primary)]">
                {lang === 'ar'
                  ? `تحذير تكرار: تطابق هذه البيانات المراجعة المحفوظة مسبقاً (${preview.duplicateOfRevisionId}).`
                  : `Duplicate import detected: matches existing revision '${preview.duplicateOfRevisionId}'.`}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                { label: lang === 'ar' ? 'الطوابق' : 'Stories', val: preview.dataset.stories.length },
                { label: lang === 'ar' ? 'الشبكات' : 'Grids', val: preview.dataset.grids.length },
                { label: lang === 'ar' ? 'الإطارات' : 'Frames', val: preview.dataset.frames.length },
                { label: lang === 'ar' ? 'المساحات' : 'Areas', val: preview.dataset.areas.length },
                { label: lang === 'ar' ? 'الأحمال' : 'Combos', val: preview.dataset.loadCombinations.length },
              ].map((stat) => (
                <Card key={stat.label} padded className="text-center">
                  <div className="text-[11px] text-[var(--text-muted)]">{stat.label}</div>
                  <div dir="ltr" className="text-lg font-bold font-mono text-[var(--accent-cyan)]">
                    {stat.val}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </HolographicPanel>
      )}
    </div>
  );
};
