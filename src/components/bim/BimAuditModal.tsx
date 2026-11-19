import React, { useEffect, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import type { DrawingAnalysisReport, Language } from '../../types/bunyan';
import { Button, Input, Modal } from '../ui';

interface BimAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DrawingAnalysisReport | null;
  lang: Language;
  onConfirmCalibrationLock: (referenceLengthM: number, measuredUnits: number) => void;
}

export const BimAuditModal: React.FC<BimAuditModalProps> = ({
  isOpen,
  onClose,
  report,
  lang,
  onConfirmCalibrationLock,
}) => {
  const [refMeters, setRefMeters] = useState(String(report?.calibration.referenceLengthM || 5.0));
  const [measuredUnits, setMeasuredUnits] = useState(String(report?.calibration.measuredUnits || 200));

  useEffect(() => {
    if (!report) return;
    setRefMeters(String(report.calibration.referenceLengthM > 0 ? report.calibration.referenceLengthM : 5.0));
    setMeasuredUnits(String(report.calibration.measuredUnits > 0 ? report.calibration.measuredUnits : 200));
  }, [report?.id, isOpen, report?.calibration.referenceLengthM, report?.calibration.measuredUnits]);

  if (!isOpen || !report) return null;

  const parsedRef = Number(refMeters);
  const parsedUnits = Number(measuredUnits);
  const validInputs = Number.isFinite(parsedRef) && parsedRef > 0 && Number.isFinite(parsedUnits) && parsedUnits > 0;
  const canUnlockBoq =
    report.elementCount > 0 &&
    report.badge !== 'EXTRACTION FAILED' &&
    report.sourceType !== 'dwg' &&
    validInputs;

  const baseUnitsPerM =
    report.calibration.referenceLengthM > 0 && report.calibration.measuredUnits > 0
      ? report.calibration.measuredUnits / report.calibration.referenceLengthM
      : 40;
  const scaleFactor =
    validInputs && baseUnitsPerM > 0 ? parsedRef / (parsedUnits / baseUnitsPerM) : 1.0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      title={lang === 'ar' ? 'تدقيق ومعايرة المخطط الهندسي قبل فتح BOQ' : 'Drawing Audit & Scale Calibration Lock'}
      subtitle={report.fileName}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canUnlockBoq}
            icon={report.boqUnlocked ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            onClick={() => {
              if (!canUnlockBoq) return;
              onConfirmCalibrationLock(parsedRef, parsedUnits);
              onClose();
            }}
          >
            {lang === 'ar' ? 'تثبيت المقياس وفتح BOQ النهائي' : 'Lock Scale & Unlock 5D BOQ'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs">
          <div>
            <div className="text-[var(--text-muted)]">{lang === 'ar' ? 'اسم الملف' : 'Source File'}</div>
            <div className="font-semibold text-[var(--text-primary)] truncate mt-0.5">{report.fileName}</div>
          </div>
          <div>
            <div className="text-[var(--text-muted)]">{lang === 'ar' ? 'شارة التحقق' : 'Verification Badge'}</div>
            <div
              className={`font-mono font-bold flex items-center gap-1 mt-0.5 ${
                report.badge === 'EXTRACTION FAILED'
                  ? 'text-rose-500'
                  : report.badge === 'BIM VERIFIED'
                  ? 'text-emerald-500'
                  : 'text-[#B4863C]'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{report.badge}</span>
            </div>
          </div>
          <div>
            <div className="text-[var(--text-muted)]">{lang === 'ar' ? 'نوع المصدر' : 'Source Type'}</div>
            <div className="font-mono uppercase text-[var(--text-primary)] mt-0.5">{report.sourceType}</div>
          </div>
          <div>
            <div className="text-[var(--text-muted)]">{lang === 'ar' ? 'العناصر المستخرجة' : 'Extracted Elements'}</div>
            <div className="font-mono tabular-nums font-bold text-[var(--text-primary)] mt-0.5">{report.elementCount}</div>
          </div>
        </div>

        {(report.elementCount === 0 || report.badge === 'EXTRACTION FAILED') && (
          <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
            <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {lang === 'ar'
                ? 'لا يمكن فتح جدول الكميات 5D BOQ لأن الملف لا يحتوي على عناصر 3D مستخرجة صالحة. استورد ملف IFC أو ASCII DXF صالحاً، أو استخدم أداة الحصر 2D PlanSwift.'
                : 'Cannot unlock 5D BOQ: no valid 3D BIM elements were extracted from this file. Import a valid IFC / ASCII DXF model, or calibrate & trace in 2D PlanSwift.'}
            </span>
          </div>
        )}

        {report.warnings.length > 0 && (
          <div className="space-y-2">
            {report.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div className="font-semibold text-[var(--text-primary)]">
            {lang === 'ar'
              ? 'تأكيد معامل المقياس المرجعي (BimCalibrationData)'
              : 'Confirm Reference Span Calibration (BimCalibrationData)'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={lang === 'ar' ? 'الطول الحقيقي المرجعي (م)' : 'Known Reference Length (m)'}
              type="number"
              step="0.1"
              min={0.1}
              disabled={report.elementCount === 0}
              value={refMeters}
              onChange={(e) => setRefMeters(e.target.value)}
              className="font-mono tabular-nums"
            />
            <Input
              label={lang === 'ar' ? 'الوحدات المقاسة على الرسم' : 'Measured Drawing Units'}
              type="number"
              step="1"
              min={1}
              disabled={report.elementCount === 0}
              value={measuredUnits}
              onChange={(e) => setMeasuredUnits(e.target.value)}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)]">
            Calculated Scale Correction Factor:{' '}
            <span className="font-bold text-[var(--text-primary)]">{scaleFactor.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
