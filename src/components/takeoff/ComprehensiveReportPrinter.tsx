import React from 'react';
import { Printer, X } from 'lucide-react';
import type {
  CompanyProfile,
  Language,
  Project,
  RateLibraryItem,
  TakeoffMeasurement,
  TakeoffProjectSummary,
  TakeoffSheet,
} from '../../types/bunyan';
import { TakeoffPrintSummaryView } from './TakeoffPrintSummaryView';

interface ComprehensiveReportPrinterProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  project: Project;
  company: CompanyProfile;
  sheets?: TakeoffSheet[];
  measurements: TakeoffMeasurement[];
  summary: TakeoffProjectSummary;
  rateLibrary?: RateLibraryItem[];
}

export const ComprehensiveReportPrinter: React.FC<ComprehensiveReportPrinterProps> = ({
  isOpen,
  onClose,
  lang,
  project,
  company,
  sheets,
  measurements,
  summary,
  rateLibrary = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="print-modal-root fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4">
      <div className="print-modal-card w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#B4863C]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {lang === 'ar'
                ? 'التقرير الهندسي الشامل للكميات (جاهز للطباعة)'
                : 'Print-Friendly Engineering Quantities Report'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="print-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950">
          <TakeoffPrintSummaryView
            lang={lang}
            project={project}
            company={company}
            sheets={sheets || project.takeoffSheets || []}
            measurements={measurements}
            summary={summary}
            rateLibrary={rateLibrary}
            compactHeader
          />
        </div>
      </div>
    </div>
  );
};
