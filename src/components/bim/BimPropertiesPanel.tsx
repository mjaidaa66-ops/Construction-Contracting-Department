import React from 'react';
import { Box, CheckSquare, Link2 } from 'lucide-react';
import type { BimElement, Language } from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import { Button } from '../ui';

interface BimPropertiesPanelProps {
  element: BimElement | null;
  lang: Language;
  onJumpToTakeoff?: (measurementId: string) => void;
}

export const BimPropertiesPanel: React.FC<BimPropertiesPanelProps> = ({
  element,
  lang,
  onJumpToTakeoff,
}) => {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col h-[600px] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center gap-2">
        <Box className="w-4 h-4 text-[#B4863C]" />
        <span className="text-xs font-bold text-[var(--text-primary)]">
          {lang === 'ar' ? 'خصائص العنصر 5D' : '5D Element Inspector'}
        </span>
      </div>

      {!element ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-[var(--text-muted)]">
          <Box className="w-8 h-8 text-[var(--text-muted)] opacity-50 mb-2" />
          <p className="leading-relaxed">
            {lang === 'ar'
              ? 'انقر على أي عنصر في المجسم ثلاثي الأبعاد أو شجرة النموذج لعرض الكميات والتكلفة.'
              : 'Select any element in the 3D viewport or hierarchy tree to inspect net/gross quantities and 5D cost.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <div className="text-[11px] font-mono text-[#B4863C]">{element.guid}</div>
            <h4 className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
              {lang === 'ar' ? element.nameAr : element.name}
            </h4>
            <div className="text-[var(--text-muted)] mt-0.5 font-mono text-[11px]">
              {element.discipline} · {element.category} · {element.level}
            </div>
            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">
              {element.id.startsWith('ifc-')
                ? lang === 'ar' ? 'المصدر: ملف IFC مستخرج' : 'Source: Extracted IFC'
                : element.id.startsWith('dxf-')
                ? lang === 'ar' ? 'المصدر: مخطط CAD DXF' : 'Source: Extracted DXF'
                : element.id.startsWith('pdf-')
                ? lang === 'ar' ? 'المصدر: مخطط PDF متجهي' : 'Source: Extracted Vector PDF'
                : lang === 'ar' ? 'المصدر: نموذج بارامتري / مرجعي (غير مستخرج من لوحة مرفوعة)' : 'Source: Parametric / Reference BIM'}
            </div>
          </div>

          <div className="space-y-2 pt-2.5 border-t border-[var(--border-hairline)]">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'المادة' : 'Material'}</span>
              <span className="font-medium text-[var(--text-primary)] text-end">{element.materialName}</span>
            </div>
            {element.concreteGrade && (
              <div className="flex justify-between gap-2">
                <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'رتبة الخرسانة' : 'Concrete Grade'}</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">{element.concreteGrade}</span>
              </div>
            )}
            {element.rebarSpec && (
              <div className="flex justify-between gap-2">
                <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'التسليح' : 'Rebar Spec'}</span>
                <span className="font-mono text-[var(--text-secondary)]">{element.rebarSpec}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'الأبعاد (م)' : 'Dimensions (m)'}</span>
              <span dir="ltr" className="font-mono tabular-nums text-[var(--text-secondary)]">
                {element.dimensions[0].toFixed(2)} × {element.dimensions[1].toFixed(2)} × {element.dimensions[2].toFixed(2)}
              </span>
            </div>
          </div>

          {/* Net vs Gross Areas with Void Cutouts */}
          <div className="p-3 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] space-y-2">
            <div className="font-semibold text-[var(--text-primary)]">
              {lang === 'ar' ? 'المساحات الصافية والحجوم' : 'Net / Gross Quantities'}
            </div>
            <div className="flex justify-between font-mono tabular-nums text-[var(--text-secondary)]">
              <span className="font-sans text-[var(--text-muted)]">{lang === 'ar' ? 'المساحة الإجمالية' : 'Gross Area'}</span>
              <span>{element.grossAreaM2.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums text-amber-600 dark:text-amber-400">
              <span className="font-sans">{lang === 'ar' ? 'خصم الفتحات' : 'Void Deductions'}</span>
              <span>-{element.deductedOpeningAreaM2.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums font-bold text-[var(--text-primary)]">
              <span className="font-sans">{lang === 'ar' ? 'المساحة الصافية' : 'Net Area'}</span>
              <span>{element.netAreaM2.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums font-bold text-[#B4863C]">
              <span className="font-sans">{lang === 'ar' ? 'الحجم الهندسي' : 'Volume'}</span>
              <span>{element.volumeM3.toFixed(3)} m³</span>
            </div>
          </div>

          {element.voidCutouts && element.voidCutouts.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-semibold text-[var(--text-secondary)]">
                {lang === 'ar' ? 'الفتحات المخصومة (أبواب / نوافذ)' : 'Deducted Void Cutouts'}
              </div>
              {element.voidCutouts.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-hairline)] font-mono tabular-nums"
                >
                  <span className="truncate font-sans text-[var(--text-secondary)]">{v.label}</span>
                  <span className="text-amber-600 dark:text-amber-400 shrink-0">-{v.areaM2.toFixed(2)} m²</span>
                </div>
              ))}
            </div>
          )}

          {/* 5D BOQ Cost Linkage */}
          <div className="p-3 rounded-lg border border-[#B4863C]/35 bg-[#B4863C]/8 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#B4863C] dark:text-[#C99A49]">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'ربط التكلفة 5D BOQ' : '5D BOQ Cost Linkage'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">{lang === 'ar' ? 'البند' : 'BOQ Category'}</span>
              <span className="font-medium text-[var(--text-primary)]">
                {lang === 'ar'
                  ? CATEGORY_LABELS[element.boqCategory].ar
                  : CATEGORY_LABELS[element.boqCategory].en}
              </span>
            </div>
            <div className="flex justify-between font-mono tabular-nums text-[var(--text-secondary)]">
              <span className="font-sans text-[var(--text-muted)]">{lang === 'ar' ? 'سعر الوحدة' : 'Unit Rate'}</span>
              <span>{formatAED(element.unitRate, lang)}</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums font-bold text-[var(--text-primary)]">
              <span className="font-sans">{lang === 'ar' ? 'التكلفة التقديرية' : 'Estimated Cost'}</span>
              <span className="text-[#B4863C]">{formatAED(element.estimatedCost, lang)}</span>
            </div>

            {element.linkedMeasurementId && onJumpToTakeoff && (
              <Button
                variant="primary"
                size="sm"
                icon={<Link2 className="w-3.5 h-3.5" />}
                onClick={() => onJumpToTakeoff(element.linkedMeasurementId!)}
                className="w-full mt-1"
              >
                {lang === 'ar' ? 'عرض في الحصر الهندسي' : 'View Linked Takeoff'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
