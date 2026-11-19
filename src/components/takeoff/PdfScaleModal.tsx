import React, { useState } from 'react';
import { Ruler, X } from 'lucide-react';
import type { Language } from '../../types/bunyan';
import { PDF_SCALE_PRESETS } from '../../utils/pdfMeasurementMath';

interface PdfScaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  currentPointsPerMeter: number;
  currentScaleLabel: string;
  calibrationPixelDistance?: number | null;
  onApplyPreset: (scaleLabel: string, pointsPerMeter: number) => void;
  onStartTwoPointCalibrate: () => void;
  onConfirmTwoPointDistance: (knownMeters: number) => void;
}

export const PdfScaleModal: React.FC<PdfScaleModalProps> = ({
  isOpen,
  onClose,
  lang,
  currentPointsPerMeter,
  currentScaleLabel,
  calibrationPixelDistance,
  onApplyPreset,
  onStartTwoPointCalibrate,
  onConfirmTwoPointDistance,
}) => {
  const [knownMeters, setKnownMeters] = useState('5.0');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-[#B4863C]" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar' ? 'معايرة مقياس الرسم (72 DPI)' : 'Drawing Scale Calibration'}
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

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs flex justify-between font-mono tabular-nums">
          <span className="text-slate-500">{lang === 'ar' ? 'المقياس الحالي:' : 'Active Scale:'}</span>
          <span className="font-bold text-[#B4863C]">
            {currentScaleLabel} ({currentPointsPerMeter.toFixed(4)} pt/m)
          </span>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {lang === 'ar' ? 'المقاييس المعمارية القياسية' : 'Standard Architectural Presets'}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PDF_SCALE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onApplyPreset(preset.label, preset.pointsPerMeter);
                  onClose();
                }}
                className={`py-2 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                  currentScaleLabel === preset.label
                    ? 'border-[#B4863C] bg-[#B4863C] text-white'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {lang === 'ar'
              ? 'معايرة يدوية بنقطتين مرجعيتين'
              : 'Two-Point Reference Line Calibration'}
          </div>

          {calibrationPixelDistance && calibrationPixelDistance > 0 ? (
            <div className="space-y-3">
              <div className="text-xs font-mono text-sky-500">
                {lang === 'ar'
                  ? `المسافة المقاسة: ${calibrationPixelDistance.toFixed(2)} وحدة PDF`
                  : `Measured span: ${calibrationPixelDistance.toFixed(2)} PDF pts`}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={knownMeters}
                  onChange={(e) => setKnownMeters(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono tabular-nums text-slate-900 dark:text-white"
                  placeholder="Meters"
                />
                <button
                  type="button"
                  onClick={() => {
                    onConfirmTwoPointDistance(Number(knownMeters) || 5);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
                >
                  {lang === 'ar' ? 'اعتماد المقياس' : 'Apply Scale'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                onStartTwoPointCalibrate();
                onClose();
              }}
              className="w-full py-2.5 rounded-lg border border-[#B4863C] text-[#B4863C] dark:text-[#D4A853] text-xs font-semibold hover:bg-[#B4863C]/10 transition-colors"
            >
              {lang === 'ar'
                ? 'تحديد نقطتين مرجعيتين على المخطط الآن'
                : 'Pick Two Reference Points on Drawing'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
