import React from 'react';
import { Box, CheckSquare, Link2 } from 'lucide-react';
import type { BimElement, Language } from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';

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
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] flex flex-col h-[520px] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <Box className="w-4 h-4 text-[#B4863C]" />
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
          {lang === 'ar' ? 'خصائص العنصر 5D' : '5D Element Inspector'}
        </span>
      </div>

      {!element ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500">
          <Box className="w-8 h-8 text-slate-400 mb-2" />
          <p>
            {lang === 'ar'
              ? 'انقر على أي عنصر في المجسم ثلاثي الأبعاد أو شجرة النموذج لعرض الكميات والتكلفة.'
              : 'Select any element in the 3D viewport or hierarchy tree to inspect net/gross quantities and 5D cost.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div>
            <div className="text-[11px] font-mono text-[#B4863C]">{element.guid}</div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
              {lang === 'ar' ? element.nameAr : element.name}
            </h4>
            <div className="text-slate-500 dark:text-slate-400 mt-0.5">
              {element.discipline} · {element.category} · {element.level}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'ar' ? 'المادة' : 'Material'}</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 text-end">{element.materialName}</span>
            </div>
            {element.concreteGrade && (
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'ar' ? 'رتبة الخرسانة' : 'Concrete Grade'}</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">{element.concreteGrade}</span>
              </div>
            )}
            {element.rebarSpec && (
              <div className="flex justify-between">
                <span className="text-slate-500">{lang === 'ar' ? 'التسليح' : 'Rebar Spec'}</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{element.rebarSpec}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'ar' ? 'الأبعاد (م)' : 'Dimensions (m)'}</span>
              <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                {element.dimensions[0].toFixed(2)} × {element.dimensions[1].toFixed(2)} × {element.dimensions[2].toFixed(2)}
              </span>
            </div>
          </div>

          {/* Net vs Gross Areas with Void Cutouts */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              {lang === 'ar' ? 'المساحات الصافية والحجوم' : 'Net / Gross Quantities'}
            </div>
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-slate-500">{lang === 'ar' ? 'المساحة الإجمالية' : 'Gross Area'}</span>
              <span>{element.grossAreaM2.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums text-amber-600 dark:text-amber-400">
              <span>{lang === 'ar' ? 'خصم الفتحات' : 'Void Deductions'}</span>
              <span>-{element.deductedOpeningAreaM2.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              <span>{lang === 'ar' ? 'المساحة الصافية' : 'Net Area'}</span>
              <span>{element.netAreaM2.toFixed(2)} m²</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums font-bold text-sky-600 dark:text-sky-400">
              <span>{lang === 'ar' ? 'الحجم الهندسي' : 'Volume'}</span>
              <span>{element.volumeM3.toFixed(3)} m³</span>
            </div>
          </div>

          {element.voidCutouts && element.voidCutouts.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {lang === 'ar' ? 'الفتحات المخصومة (أبواب / نوافذ)' : 'Deducted Void Cutouts'}
              </div>
              {element.voidCutouts.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-mono tabular-nums"
                >
                  <span className="truncate font-sans">{v.label}</span>
                  <span className="text-amber-600 dark:text-amber-400 shrink-0">-{v.areaM2.toFixed(2)} m²</span>
                </div>
              ))}
            </div>
          )}

          {/* 5D BOQ Cost Linkage */}
          <div className="p-3 rounded-lg border border-[#B4863C]/30 bg-[#B4863C]/5 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#B4863C] dark:text-[#D4A853]">
              <CheckSquare className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'ربط التكلفة 5D BOQ' : '5D BOQ Cost Linkage'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">{lang === 'ar' ? 'البند' : 'BOQ Category'}</span>
              <span className="font-medium">
                {lang === 'ar'
                  ? CATEGORY_LABELS[element.boqCategory].ar
                  : CATEGORY_LABELS[element.boqCategory].en}
              </span>
            </div>
            <div className="flex justify-between font-mono tabular-nums">
              <span className="text-slate-500">{lang === 'ar' ? 'سعر الوحدة' : 'Unit Rate'}</span>
              <span>{formatAED(element.unitRate, lang)}</span>
            </div>
            <div className="flex justify-between font-mono tabular-nums font-bold text-slate-900 dark:text-white">
              <span>{lang === 'ar' ? 'التكلفة التقديرية' : 'Estimated Cost'}</span>
              <span>{formatAED(element.estimatedCost, lang)}</span>
            </div>

            {element.linkedMeasurementId && onJumpToTakeoff && (
              <button
                type="button"
                onClick={() => onJumpToTakeoff(element.linkedMeasurementId!)}
                className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330]"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'عرض في الحصر الهندسي' : 'View Linked Takeoff'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
