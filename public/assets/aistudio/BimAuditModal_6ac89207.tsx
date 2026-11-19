import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, ShieldCheck, X } from 'lucide-react';
import type { DrawingAnalysisReport, Language } from '../../types/bunyan';

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

  if (!isOpen || !report) return null;

  const scaleFactor =
    Number(measuredUnits) > 0 && Number(refMeters) > 0
      ? Number(refMeters) / (Number(measuredUnits) / 40)
      : 1.0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#B4863C]" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'تدقيق ومعايرة المخطط الهندسي قبل فتح BOQ' : 'Drawing Audit & Scale Calibration Lock'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'اسم الملف' : 'Source File'}</div>
            <div className="font-semibold text-slate-900 dark:text-white truncate">{report.fileName}</div>
          </div>
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'شارة التحقق' : 'Verification Badge'}</div>
            <div className="font-mono font-bold text-[#B4863C]">{report.badge}</div>
          </div>
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'نوع المصدر' : 'Source Type'}</div>
            <div className="font-mono uppercase">{report.sourceType}</div>
          </div>
          <div>
            <div className="text-slate-500">{lang === 'ar' ? 'العناصر المستخرجة' : 'Extracted Elements'}</div>
            <div className="font-mono tabular-nums font-bold">{report.elementCount}</div>
          </div>
        </div>

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
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            {lang === 'ar'
              ? 'تأكيد معامل المقياس المرجعي (BimCalibrationData)'
              : 'Confirm Reference Span Calibration (BimCalibrationData)'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-slate-500">{lang === 'ar' ? 'الطول الحقيقي المرجعي (م)' : 'Known Reference Length (m)'}</span>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={refMeters}
                onChange={(e) => setRefMeters(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums text-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-500">{lang === 'ar' ? 'الوحدات المقاسة على الرسم' : 'Measured Drawing Units'}</span>
              <input
                type="number"
                step="1"
                min={1}
                value={measuredUnits}
                onChange={(e) => setMeasuredUnits(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums text-slate-900 dark:text-white"
              />
            </label>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Calculated Scale Factor: <span className="font-bold text-slate-900 dark:text-white">{scaleFactor.toFixed(4)}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
          >
            {lang === 'ar' ? 'إغلاق' : 'Close'}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmCalibrationLock(Number(refMeters) || 5, Number(measuredUnits) || 200);
              onClose();
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
          >
            {report.boqUnlocked ? <CheckCircle2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>
              {lang === 'ar' ? 'تثبيت المقياس وفتح BOQ النهائي' : 'Lock Scale & Unlock 5D BOQ'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
