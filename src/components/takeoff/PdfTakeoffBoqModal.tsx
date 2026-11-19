import React from 'react';
import { FileSpreadsheet, Printer, X } from 'lucide-react';
import type {
  CompanyProfile,
  Language,
  Project,
  RateLibraryItem,
  TakeoffMeasurement,
  TakeoffProjectSummary,
  TakeoffSummaryConfig,
} from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import { exportTakeoffToExcel } from '../../utils/takeoffExportEngine';

interface PdfTakeoffBoqModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  project: Project;
  company: CompanyProfile;
  measurements: TakeoffMeasurement[];
  summary: TakeoffProjectSummary;
  summaryConfig: TakeoffSummaryConfig;
  rateLibrary: RateLibraryItem[];
  onChangeSummaryConfig: (cfg: TakeoffSummaryConfig) => void;
  onOpenPrintReport: () => void;
}

export const PdfTakeoffBoqModal: React.FC<PdfTakeoffBoqModalProps> = ({
  isOpen,
  onClose,
  lang,
  project,
  company,
  measurements,
  summary,
  summaryConfig,
  rateLibrary,
  onChangeSummaryConfig,
  onOpenPrintReport,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar'
                ? 'جدول الكميات والتكلفة التقديرية (5D BOQ · ضريبة 5%)'
                : 'Bill of Quantities & UAE 5% VAT Summary (AED)'}
            </h3>
            <p className="text-xs text-slate-500">
              {project.code} · {lang === 'ar' ? project.name : project.nameEn}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportTakeoffToExcel({
                  project,
                  company,
                  measurements,
                  summary,
                  rateLibrary,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تصدير Excel (.xlsx)' : 'Export Excel'}</span>
            </button>
            <button
              type="button"
              onClick={onOpenPrintReport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{lang === 'ar' ? 'تقرير للطباعة PDF' : 'Print Report'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Category Breakdown Table */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'التخصص الإنشائي' : 'Category'}</th>
                  <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'عدد البنود' : 'Items'}</th>
                  <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'إجمالي الكمية' : 'Quantity'}</th>
                  <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                  <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'التكلفة المباشرة (د.إ)' : 'Direct Cost (AED)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {summary.categoryBreakdown.map((row) => (
                  <tr key={row.category}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">
                      {lang === 'ar' ? CATEGORY_LABELS[row.category].ar : CATEGORY_LABELS[row.category].en}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums">{row.itemCount}</td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold">{row.quantity.toFixed(2)}</td>
                    <td className="px-4 py-2.5 font-mono">{row.unit}</td>
                    <td className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {formatAED(row.costAed, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Overhead, Profit & 5% UAE VAT Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {lang === 'ar' ? 'نسب التكاليف الإدارية والربح والضريبة' : 'Overhead, Profit & UAE VAT Parameters'}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-500">{lang === 'ar' ? 'إدارية %' : 'Overhead %'}</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={summaryConfig.overheadPercent}
                    onChange={(e) =>
                      onChangeSummaryConfig({ ...summaryConfig, overheadPercent: Number(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">{lang === 'ar' ? 'أرباح %' : 'Profit %'}</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={summaryConfig.profitPercent}
                    onChange={(e) =>
                      onChangeSummaryConfig({ ...summaryConfig, profitPercent: Number(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-500">{lang === 'ar' ? 'ضريبة UAE %' : 'UAE VAT %'}</span>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={summaryConfig.vatPercent}
                    onChange={(e) =>
                      onChangeSummaryConfig({ ...summaryConfig, vatPercent: Number(e.target.value) || 0 })
                    }
                    className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono tabular-nums"
                  />
                </label>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-[#B4863C]/40 bg-[#B4863C]/5 space-y-2 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-sans">{lang === 'ar' ? 'التكلفة المباشرة' : 'Direct Construction Cost'}</span>
                <span className="font-semibold">{formatAED(summary.directCostAed, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-sans">{lang === 'ar' ? `المصاريف الإدارية (${summary.overheadPercent}%)` : `Site Overhead (${summary.overheadPercent}%)`}</span>
                <span>{formatAED(summary.overheadAed, lang)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400 font-sans">{lang === 'ar' ? `هامش الربح (${summary.profitPercent}%)` : `Contractor Profit (${summary.profitPercent}%)`}</span>
                <span>{formatAED(summary.profitAed, lang)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400 font-sans">{lang === 'ar' ? 'الإجمالي قبل الضريبة' : 'Subtotal Excl. VAT'}</span>
                <span className="font-semibold">{formatAED(summary.subtotalBeforeVatAed, lang)}</span>
              </div>
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span className="font-sans">{lang === 'ar' ? `ضريبة القيمة المضافة (${summary.vatPercent}%)` : `UAE VAT (${summary.vatPercent}%)`}</span>
                <span>{formatAED(summary.vatAed, lang)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#B4863C]/40 text-sm font-bold text-slate-900 dark:text-white">
                <span className="font-sans">{lang === 'ar' ? 'الإجمالي النهائي شامل الضريبة' : 'GRAND TOTAL INCL. VAT'}</span>
                <span className="text-[#B4863C] dark:text-[#D4A853]">{formatAED(summary.grandTotalAed, lang)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
