import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { CompanyProfile } from '../types/bunyan';
import type { GeneratedReport, MarginPreset, PaperSize, PrintSettings } from '../types/reports';

export function resolveCssColorToRgba(value: string): string {
  if (!value || !/(oklch|oklab|color-mix|lch\(|lab\()/i.test(value)) return value;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#0f172a';
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#0f172a';
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    const alpha = Number((data[3] / 255).toFixed(3));
    return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${alpha})`;
  } catch {
    return '#0f172a';
  }
}

export function sanitizeCloneForHtml2Canvas(
  clonedDoc: Document,
  clonedEl: HTMLElement,
  monochrome = false
): void {
  const styleNodes = Array.from(clonedDoc.querySelectorAll('style, link[rel="stylesheet"]'));
  for (const node of styleNodes) {
    if (node.tagName === 'LINK') {
      const href = (node as HTMLLinkElement).href || '';
      if (href.includes('fonts.googleapis.com')) continue;
      node.remove();
    } else {
      const text = node.textContent || '';
      if (/(oklch|oklab|color-mix|@layer|@property)/i.test(text)) {
        node.remove();
      }
    }
  }

  const win = clonedDoc.defaultView;
  if (win) {
    const colorProps: Array<[keyof CSSStyleDeclaration, string]> = [
      ['color', 'color'],
      ['backgroundColor', 'background-color'],
      ['borderTopColor', 'border-top-color'],
      ['borderRightColor', 'border-right-color'],
      ['borderBottomColor', 'border-bottom-color'],
      ['borderLeftColor', 'border-left-color'],
      ['outlineColor', 'outline-color'],
      ['textDecorationColor', 'text-decoration-color'],
      ['fill', 'fill'],
      ['stroke', 'stroke'],
    ];

    const allNodes = [clonedEl, ...Array.from(clonedEl.querySelectorAll<HTMLElement>('*'))];
    for (const el of allNodes) {
      const computed = win.getComputedStyle(el);
      for (const [jsProp, cssProp] of colorProps) {
        const rawVal = String(computed[jsProp] || '');
        if (rawVal && /(oklch|oklab|color-mix|lch\(|lab\()/i.test(rawVal)) {
          el.style.setProperty(cssProp, resolveCssColorToRgba(rawVal), 'important');
        }
      }
      if (computed.boxShadow && /(oklch|oklab|color-mix)/i.test(computed.boxShadow)) {
        el.style.setProperty('box-shadow', 'none', 'important');
      }
      if (computed.textShadow && /(oklch|oklab|color-mix)/i.test(computed.textShadow)) {
        el.style.setProperty('text-shadow', 'none', 'important');
      }
    }
  }

  if (monochrome) {
    clonedEl.style.setProperty('filter', 'grayscale(100%)', 'important');
  }
}

const MARGIN_MM_MAP: Record<MarginPreset, number> = {
  narrow: 7,
  standard: 12,
  wide: 18,
};

const PAPER_PX_WIDTH_MAP: Record<PaperSize, { portrait: number; landscape: number }> = {
  A4: { portrait: 794, landscape: 1123 },
  A3: { portrait: 1123, landscape: 1587 },
  A5: { portrait: 559, landscape: 794 },
  Letter: { portrait: 816, landscape: 1056 },
  Legal: { portrait: 816, landscape: 1344 },
};

const DYNAMIC_STYLE_ID = 'bunyan-dynamic-page-style';

export function applyDynamicPrintPageStyle(settings: PrintSettings): void {
  if (typeof document === 'undefined') return;
  let styleEl = document.getElementById(DYNAMIC_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = DYNAMIC_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  const marginMm = MARGIN_MM_MAP[settings.margins] ?? 12;
  styleEl.textContent = `@page { size: ${settings.paperSize} ${settings.orientation}; margin: ${marginMm}mm; }`;
}

export function clearDynamicPrintPageStyle(): void {
  if (typeof document === 'undefined') return;
  const styleEl = document.getElementById(DYNAMIC_STYLE_ID);
  if (styleEl) styleEl.remove();
}

export function getPaperRenderWidthPx(settings: PrintSettings): number {
  const dims = PAPER_PX_WIDTH_MAP[settings.paperSize] || PAPER_PX_WIDTH_MAP.A4;
  return settings.orientation === 'landscape' ? dims.landscape : dims.portrait;
}

export async function exportReportToPdf(params: {
  element: HTMLElement;
  report: GeneratedReport;
  printSettings: PrintSettings;
  company: CompanyProfile;
}): Promise<void> {
  const { element, report, printSettings, company } = params;

  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    await document.fonts.ready.catch(() => undefined);
  }

  const targetWidthPx = getPaperRenderWidthPx(printSettings);
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    width: targetWidthPx,
    windowWidth: targetWidthPx,
    scrollX: 0,
    scrollY: 0,
    logging: false,
    onclone: (clonedDoc, clonedEl) => {
      sanitizeCloneForHtml2Canvas(
        clonedDoc,
        clonedEl,
        printSettings.colorMode === 'monochrome'
      );
    },
  });

  if (!canvas.width || !canvas.height) {
    throw new Error('Rendered report canvas is empty');
  }

  const pdfFormat = printSettings.paperSize.toLowerCase() as
    | 'a4'
    | 'a3'
    | 'a5'
    | 'letter'
    | 'legal';

  const pdf = new jsPDF({
    orientation: printSettings.orientation,
    unit: 'mm',
    format: pdfFormat,
  });

  const marginMm = MARGIN_MM_MAP[printSettings.margins] ?? 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const footerReserveMm = printSettings.showPageNumbers || printSettings.showFooter ? 8 : 0;
  const contentWidthMm = pageWidth - marginMm * 2;
  const contentHeightMm = pageHeight - marginMm * 2 - footerReserveMm;
  const sliceHeightPx = Math.max(
    1,
    Math.floor((contentHeightMm / contentWidthMm) * canvas.width)
  );

  let offsetY = 0;
  let pageIndex = 0;

  while (offsetY < canvas.height) {
    const currentSlicePx = Math.min(sliceHeightPx, canvas.height - offsetY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSlicePx;

    const ctx = pageCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D context for PDF page slicing');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      currentSlicePx,
      0,
      0,
      canvas.width,
      currentSlicePx
    );

    const sliceImgData = pageCanvas.toDataURL('image/png', 1.0);
    const sliceHeightMm = (currentSlicePx * contentWidthMm) / canvas.width;

    if (pageIndex > 0) {
      pdf.addPage();
    }
    pdf.addImage(sliceImgData, 'PNG', marginMm, marginMm, contentWidthMm, sliceHeightMm);

    offsetY += currentSlicePx;
    pageIndex += 1;
  }

  const totalPages = pdf.getNumberOfPages();
  if (printSettings.showPageNumbers || printSettings.showFooter) {
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      const footerY = pageHeight - Math.max(4, marginMm * 0.55);
      if (printSettings.showFooter) {
        pdf.text(
          `${company.nameEn} · ${report.reportNumber}`,
          marginMm,
          footerY
        );
      }
      if (printSettings.showPageNumbers) {
        pdf.text(
          `Page ${i} of ${totalPages}`,
          pageWidth - marginMm,
          footerY,
          { align: 'right' }
        );
      }
    }
  }

  const safeNum = report.reportNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  pdf.save(`Bunyan_Report_${safeNum}.pdf`);
}

export function formatCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Protect Excel / LibreOffice against formula injection on leading = + - @ \t \r
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildReportCsvString(report: GeneratedReport): string {
  const isAr = report.lang === 'ar';
  const activeCols = report.columns.filter((c) => report.visibleColumnKeys.includes(c.key));
  const lines: string[] = [];

  lines.push([report.reportNumber, isAr ? report.titleAr : report.titleEn].map(formatCsvCell).join(','));
  lines.push(activeCols.map((c) => formatCsvCell(isAr ? c.labelAr : c.labelEn)).join(','));

  for (const row of report.rows) {
    lines.push(activeCols.map((c) => formatCsvCell(row.cells[c.key] ?? '')).join(','));
  }

  if (report.showTotals && report.totalsRow) {
    lines.push(activeCols.map((c) => formatCsvCell(report.totalsRow?.[c.key] ?? '')).join(','));
  }

  // UTF-8 BOM guarantees clean Arabic character rendering in Microsoft Excel
  return `\uFEFF${lines.join('\r\n')}`;
}

export function exportReportToCsv(report: GeneratedReport): void {
  const csvContent = buildReportCsvString(report);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeNum = report.reportNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  a.href = url;
  a.download = `Bunyan_Report_${safeNum}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildReportWorkbook(report: GeneratedReport, company: CompanyProfile): XLSX.WorkBook {
  const isAr = report.lang === 'ar';
  const activeCols = report.columns.filter((c) => report.visibleColumnKeys.includes(c.key));
  const wb = XLSX.utils.book_new();

  // Sheet 1: Official Cover & KPI Summary
  const metaRows: Array<Array<string | number>> = [
    [isAr ? 'منصة بنيان — مركز التقارير والطباعة' : 'BUNYAN CORE — REPORTS & PRINTING CENTER', ''],
    [isAr ? 'الشركة / المؤسسة' : 'Company', isAr ? company.nameAr : company.nameEn],
    [isAr ? 'رقم الرخصة' : 'License No.', company.licenseNumber],
    [isAr ? 'الرقم الضريبي UAE TRN' : 'UAE VAT TRN', company.trnNumber],
    [],
    [isAr ? 'رقم التقرير' : 'Report Number', report.reportNumber],
    [isAr ? 'عنوان التقرير' : 'Report Title', isAr ? report.titleAr : report.titleEn],
    [isAr ? 'تاريخ الإنشاء' : 'Generated At', report.generatedAt.slice(0, 19).replace('T', ' ')],
    [isAr ? 'معد التقرير' : 'Generated By', `${report.generatedBy} (${report.generatedRole})`],
    [isAr ? 'عدد السجلات' : 'Row Count', report.rows.length],
  ];

  if (report.showKpis && report.kpis.length > 0) {
    metaRows.push([], [isAr ? 'المؤشرات الإحصائية' : 'Key Performance Indicators', isAr ? 'القيمة' : 'Value']);
    for (const kpi of report.kpis) {
      metaRows.push([isAr ? kpi.labelAr : kpi.labelEn, kpi.valueText]);
    }
  }

  if (report.notes.trim()) {
    metaRows.push([], [isAr ? 'الملاحظات والاعتمادات' : 'Notes & Approvals', report.notes.trim()]);
  }

  const wsMeta = XLSX.utils.aoa_to_sheet(metaRows);
  wsMeta['!cols'] = [{ wch: 36 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(wb, wsMeta, isAr ? 'ملخص التقرير' : 'Report Summary');

  // Sheet 2: Data Table
  const headerRow = activeCols.map((c) => (isAr ? c.labelAr : c.labelEn));
  const dataRows: Array<Array<string | number>> = [headerRow];
  for (const row of report.rows) {
    dataRows.push(activeCols.map((c) => row.cells[c.key] ?? ''));
  }
  if (report.showTotals && report.totalsRow) {
    dataRows.push(activeCols.map((c) => report.totalsRow?.[c.key] ?? ''));
  }

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData['!cols'] = activeCols.map((c) => ({
    wch: c.format === 'text' ? 28 : 18,
  }));
  XLSX.utils.book_append_sheet(wb, wsData, isAr ? 'بيانات التقرير' : 'Report Data');

  return wb;
}

export function exportReportToExcel(report: GeneratedReport, company: CompanyProfile): void {
  const wb = buildReportWorkbook(report, company);
  const safeNum = report.reportNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Bunyan_Report_${safeNum}.xlsx`);
}
