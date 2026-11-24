import React from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
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
import { evaluateTakeoffVerificationState } from '../../utils/takeoffCalculations';
import { Button, Input, Modal } from '../ui';

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

  const verification = evaluateTakeoffVerificationState(
    project.takeoffSheets || [],
    measurements,
    project.bimElements
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      title={
        lang === 'ar'
          ? 'جدول الكميات والتكلفة التقديرية (5D BOQ · ضريبة 5%)'
          : 'Bill of Quantities & UAE 5% VAT Summary (AED)'
      }
      subtitle={`${project.code} · ${lang === 'ar' ? project.name : project.nameEn}`}
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
            onClick={async () => {
              const { exportTakeoffToExcel } = await import('../../utils/takeoffExportEngine');
              exportTakeoffToExcel({
                project,
                company,
                measurements,
                summary,
                rateLibrary,
              });
            }}
          >
            {lang === 'ar' ? 'تصدير Excel (.xlsx)' : 'Export Excel (.xlsx)'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Printer className="w-3.5 h-3.5" />}
            onClick={onOpenPrintReport}
          >
            {lang === 'ar' ? 'تقرير للطباعة PDF' : 'Print Report'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {verification.status !== 'certified_calibrated' && (
          <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              {lang === 'ar' ? verification.badgeAr : verification.badgeEn}
            </span>
            <span>{lang === 'ar' ? verification.noticeAr : verification.noticeEn}</span>
          </div>
        )}
        {/* Category Breakdown Table */}
        <div className="rounded-xl border border-[var(--border-hairline)] overflow-hidden">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'التخصص الإنشائي' : 'Category'}</th>
                <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'عدد البنود' : 'Items'}</th>
                <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'إجمالي الكمية' : 'Quantity'}</th>
                <th className="px-4 py-2.5 text-start">{lang === 'ar' ? 'الوحدة' : 'Unit'}</th>
                <th className="px-4 py-2.5 text-end">{lang === 'ar' ? 'التكلفة المباشرة (د.إ)' : 'Direct Cost (AED)'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)]">
              {summary.categoryBreakdown.map((row) => (
                <tr key={`${row.category}-${row.unit}`} className="hover:bg-[var(--bg-surface-subtle)]">
                  <td className="px-4 py-2.5 font-semibold text-[var(--text-primary)]">
                    {lang === 'ar' ? CATEGORY_LABELS[row.category].ar : CATEGORY_LABELS[row.category].en}
                  </td>
                  <td className="px-4 py-2.5 text-end font-mono tabular-nums text-[var(--text-secondary)]">
                    {row.itemCount}
                  </td>
                  <td className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                    {row.quantity.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{row.unit}</td>
                  <td className="px-4 py-2.5 text-end font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                    {formatAED(row.costAed, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Overhead, Profit & 5% UAE VAT Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] space-y-3 text-xs">
            <div className="font-semibold text-[var(--text-primary)]">
              {lang === 'ar' ? 'نسب التكاليف الإدارية والربح والضريبة' : 'Overhead, Profit & UAE VAT Parameters'}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label={lang === 'ar' ? 'إدارية %' : 'Overhead %'}
                type="number"
                min={0}
                max={50}
                value={summaryConfig.overheadPercent}
                onChange={(e) =>
                  onChangeSummaryConfig({ ...summaryConfig, overheadPercent: Number(e.target.value) || 0 })
                }
                className="font-mono tabular-nums"
              />
              <Input
                label={lang === 'ar' ? 'أرباح %' : 'Profit %'}
                type="number"
                min={0}
                max={50}
                value={summaryConfig.profitPercent}
                onChange={(e) =>
                  onChangeSummaryConfig({ ...summaryConfig, profitPercent: Number(e.target.value) || 0 })
                }
                className="font-mono tabular-nums"
              />
              <Input
                label={lang === 'ar' ? 'ضريبة UAE %' : 'UAE VAT %'}
                type="number"
                min={0}
                max={25}
                value={summaryConfig.vatPercent}
                onChange={(e) =>
                  onChangeSummaryConfig({ ...summaryConfig, vatPercent: Number(e.target.value) || 0 })
                }
                className="font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#B4863C]/40 bg-[#B4863C]/8 space-y-2 text-xs font-mono tabular-nums">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)] font-sans">
                {lang === 'ar' ? 'التكلفة المباشرة' : 'Direct Construction Cost'}
              </span>
              <span className="font-semibold text-[var(--text-primary)]">{formatAED(summary.directCostAed, lang)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span className="font-sans">
                {lang === 'ar' ? `المصاريف الإدارية (${summary.overheadPercent}%)` : `Site Overhead (${summary.overheadPercent}%)`}
              </span>
              <span>{formatAED(summary.overheadAed, lang)}</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span className="font-sans">
                {lang === 'ar' ? `هامش الربح (${summary.profitPercent}%)` : `Contractor Profit (${summary.profitPercent}%)`}
              </span>
              <span>{formatAED(summary.profitAed, lang)}</span>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-[var(--border-hairline)]">
              <span className="text-[var(--text-muted)] font-sans">
                {lang === 'ar' ? 'الإجمالي قبل الضريبة' : 'Subtotal Excl. VAT'}
              </span>
              <span className="font-semibold text-[var(--text-primary)]">
                {formatAED(summary.subtotalBeforeVatAed, lang)}
              </span>
            </div>
            <div className="flex justify-between text-amber-600 dark:text-amber-400">
              <span className="font-sans">
                {lang === 'ar' ? `ضريبة القيمة المضافة (${summary.vatPercent}%)` : `UAE VAT (${summary.vatPercent}%)`}
              </span>
              <span>{formatAED(summary.vatAed, lang)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-[#B4863C]/40 text-sm font-bold text-[var(--text-primary)]">
              <span className="font-sans">
                {lang === 'ar' ? 'الإجمالي النهائي شامل الضريبة' : 'GRAND TOTAL INCL. VAT'}
              </span>
              <span className="text-[#B4863C] dark:text-[#C99A49]">{formatAED(summary.grandTotalAed, lang)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
