import * as XLSX from 'xlsx';
import type {
  CompanyProfile,
  Project,
  RateLibraryItem,
  TakeoffMeasurement,
  TakeoffProjectSummary,
} from '../types/bunyan';
import { CATEGORY_LABELS, formatAED } from './i18n';
import { evaluateTakeoffVerificationState } from './takeoffCalculations';

export function buildTakeoffWorkbook(params: {
  project: Project;
  company: CompanyProfile;
  measurements: TakeoffMeasurement[];
  summary: TakeoffProjectSummary;
  rateLibrary: RateLibraryItem[];
}): XLSX.WorkBook {
  const { project, company, measurements, summary, rateLibrary } = params;
  const wb = XLSX.utils.book_new();
  const verification = evaluateTakeoffVerificationState(
    project.takeoffSheets || [],
    measurements,
    project.bimElements
  );

  // Sheet 1: Executive BOQ Summary (AED + 5% UAE VAT)
  const summaryRows = [
    ['BUNYAN CORE SYSTEM — UAE 5D BOQ SUMMARY'],
    ['Verification Status', verification.badgeEn, 'Source', verification.status],
    ['Audit Notice', verification.noticeEn],
    ['Company', company.nameEn, 'TRN', company.trnNumber],
    ['Project Code', project.code, 'Project Name', project.nameEn],
    ['Permit No.', project.permitNumber, 'Authority', project.licensingAuthority],
    [],
    ['Category', 'Item Count', 'Total Quantity', 'Unit', 'Direct Cost (AED)'],
    ...summary.categoryBreakdown.map((b) => [
      CATEGORY_LABELS[b.category].en,
      b.itemCount,
      b.quantity,
      b.unit,
      b.costAed,
    ]),
    [],
    ['Direct Cost Subtotal (AED)', '', '', '', summary.directCostAed],
    [`Site Overhead (${summary.overheadPercent}%)`, '', '', '', summary.overheadAed],
    [`Contractor Profit (${summary.profitPercent}%)`, '', '', '', summary.profitAed],
    ['Subtotal Before UAE VAT (AED)', '', '', '', summary.subtotalBeforeVatAed],
    [`UAE VAT (${summary.vatPercent}%)`, '', '', '', summary.vatAed],
    ['GRAND TOTAL INCL. VAT (AED)', '', '', '', summary.grandTotalAed],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'BOQ Summary AED');

  // Sheet 2: Detailed Takeoff Measurements (with per-row calibration status)
  const sheetCalibratedMap = new Map(
    (project.takeoffSheets || []).map((s) => [s.id, s.calibrated])
  );
  const measRows = [
    ['ID', 'Sheet ID', 'Scale Status', 'Category', 'Tool', 'Description (EN)', 'Description (AR)', 'Quantity', 'Unit', 'Unit Rate (AED)', 'Total Cost (AED)', 'Linked BIM ID'],
    ...measurements.map((m) => [
      m.id,
      m.sheetId,
      sheetCalibratedMap.get(m.sheetId) ? 'Calibrated' : 'Uncalibrated Draft',
      CATEGORY_LABELS[m.category].en,
      m.tool,
      m.label,
      m.labelAr,
      m.computedQuantity,
      m.unit,
      m.unitRateAed,
      m.totalCostAed,
      m.linkedBimElementId || '-',
    ]),
  ];
  const wsMeas = XLSX.utils.aoa_to_sheet(measRows);
  XLSX.utils.book_append_sheet(wb, wsMeas, 'Detailed Takeoff');

  // Sheet 3: UAE Rate Library
  const rateRows = [
    ['Code', 'Category', 'Description (EN)', 'Description (AR)', 'Unit', 'Rate (AED)', 'Specification'],
    ...rateLibrary.map((r) => [
      r.code,
      CATEGORY_LABELS[r.category].en,
      r.nameEn,
      r.nameAr,
      r.unit,
      r.rateAed,
      r.materialSpec,
    ]),
  ];
  const wsRates = XLSX.utils.aoa_to_sheet(rateRows);
  XLSX.utils.book_append_sheet(wb, wsRates, 'UAE Rate Library');

  // Sheet 4: 5D BIM Element Cost Linkage
  const bimElements = project.bimElements || [];
  const bimRows = [
    ['GUID', 'Element Name', 'Discipline', 'Category', 'Level', 'Net Area (m2)', 'Deducted Voids (m2)', 'Volume (m3)', 'Unit Rate (AED)', 'Estimated Cost (AED)'],
    ...bimElements.map((b) => [
      b.guid,
      b.name,
      b.discipline,
      b.category,
      b.level,
      b.netAreaM2,
      b.deductedOpeningAreaM2,
      b.volumeM3,
      b.unitRate,
      b.estimatedCost,
    ]),
  ];
  const wsBim = XLSX.utils.aoa_to_sheet(bimRows);
  XLSX.utils.book_append_sheet(wb, wsBim, '5D BIM Quantities');

  return wb;
}

export function exportTakeoffToExcel(params: {
  project: Project;
  company: CompanyProfile;
  measurements: TakeoffMeasurement[];
  summary: TakeoffProjectSummary;
  rateLibrary: RateLibraryItem[];
}): void {
  const wb = buildTakeoffWorkbook(params);
  const safeCode = params.project.code.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${safeCode}_BOQ_5D_Takeoff.xlsx`);
}

export function formatSummaryLines(summary: TakeoffProjectSummary): string[] {
  return [
    `Direct Cost: ${formatAED(summary.directCostAed, 'en')}`,
    `Overhead (${summary.overheadPercent}%): ${formatAED(summary.overheadAed, 'en')}`,
    `Profit (${summary.profitPercent}%): ${formatAED(summary.profitAed, 'en')}`,
    `UAE VAT (${summary.vatPercent}%): ${formatAED(summary.vatAed, 'en')}`,
    `Grand Total: ${formatAED(summary.grandTotalAed, 'en')}`,
  ];
}
