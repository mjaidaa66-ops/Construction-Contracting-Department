import React, { useState } from 'react';
import type { Language } from '../../types/bunyan';
import { PDF_SCALE_PRESETS } from '../../utils/pdfMeasurementMath';
import { Button, Input, Modal } from '../ui';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={lang === 'ar' ? 'معايرة مقياس الرسم (72 DPI)' : 'Drawing Scale Calibration'}
      subtitle={`${currentScaleLabel} · ${currentPointsPerMeter.toFixed(4)} pt/m`}
    >
      <div className="space-y-5">
        <div className="p-3 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-xs flex justify-between font-mono tabular-nums">
          <span className="font-sans text-[var(--text-muted)]">
            {lang === 'ar' ? 'المقياس الحالي:' : 'Active Scale:'}
          </span>
          <span className="font-bold text-[#B4863C]">
            {currentScaleLabel} ({currentPointsPerMeter.toFixed(4)} pt/m)
          </span>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">
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
                    : 'border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-[var(--border-hairline)] space-y-3">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">
            {lang === 'ar'
              ? 'معايرة يدوية بنقطتين مرجعيتين'
              : 'Two-Point Reference Line Calibration'}
          </div>

          {calibrationPixelDistance && calibrationPixelDistance > 0 ? (
            <div className="space-y-3">
              <div className="text-xs font-mono text-[#B4863C]">
                {lang === 'ar'
                  ? `المسافة المقاسة: ${calibrationPixelDistance.toFixed(2)} وحدة PDF`
                  : `Measured span: ${calibrationPixelDistance.toFixed(2)} PDF pts`}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min={0.01}
                    value={knownMeters}
                    onChange={(e) => setKnownMeters(e.target.value)}
                    className="font-mono tabular-nums"
                    placeholder="Meters"
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => {
                    onConfirmTwoPointDistance(Number(knownMeters) || 5);
                    onClose();
                  }}
                >
                  {lang === 'ar' ? 'اعتماد المقياس' : 'Apply Scale'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="md"
              className="w-full border-[#B4863C]/50 text-[#B4863C]"
              onClick={() => {
                onStartTwoPointCalibrate();
                onClose();
              }}
            >
              {lang === 'ar'
                ? 'تحديد نقطتين مرجعيتين على المخطط الآن'
                : 'Pick Two Reference Points on Drawing'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
