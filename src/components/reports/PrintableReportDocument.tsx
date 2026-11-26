import React from 'react';
import type { CompanyProfile } from '../../types/bunyan';
import type {
  GeneratedReport,
  PrintSettings,
  ReportColumnDef,
  ReportTemplate,
} from '../../types/reports';
import { formatAED, formatNumber } from '../../utils/i18n';
import { getPaperRenderWidthPx } from '../../utils/reportExportEngine';
import { TEMPLATE_PALETTE_TOKENS } from '../../utils/reportTemplates';
import { BUNYAN_OFFICIAL_LOGO_SRC } from '../common/BunyanLogo';
import { ReportVisualCharts } from './ReportVisualCharts';

interface PrintableReportDocumentProps {
  id?: string;
  sheetRef?: React.RefObject<HTMLDivElement | null>;
  report: GeneratedReport;
  template: ReportTemplate;
  printSettings: PrintSettings;
  company: CompanyProfile;
  isOffscreen?: boolean;
}

function formatCellDisplay(
  value: string | number | undefined,
  col: ReportColumnDef,
  lang: 'ar' | 'en'
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (col.format === 'currency' && typeof value === 'number') {
    return formatAED(value, lang);
  }
  if (col.format === 'percent' && typeof value === 'number') {
    return `${value}%`;
  }
  if (col.format === 'number' && typeof value === 'number') {
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  return String(value);
}

const LOGO_PX_MAP = {
  sm: 44,
  md: 56,
  lg: 70,
};

export const PrintableReportDocument: React.FC<PrintableReportDocumentProps> = ({
  id,
  sheetRef,
  report,
  template,
  printSettings,
  company,
  isOffscreen = false,
}) => {
  const isAr = report.lang === 'ar';
  const palette = TEMPLATE_PALETTE_TOKENS[template.palette] || TEMPLATE_PALETTE_TOKENS.silver_slate;
  const activeCols = report.columns.filter((c) => report.visibleColumnKeys.includes(c.key));
  const widthPx = getPaperRenderWidthPx(printSettings);
  const logoPx = LOGO_PX_MAP[template.logoSize] || 56;
  const paddingPx =
    printSettings.margins === 'narrow' ? 20 : printSettings.margins === 'wide' ? 38 : 28;
  const rowPad = template.denseTable ? '5px 8px' : '8px 10px';
  const cellFont = template.denseTable ? '10px' : '11px';

  const headerTitle = isAr
    ? template.customTitleAr?.trim() || report.titleAr
    : template.customTitleEn?.trim() || report.titleEn;

  const groupedColumn =
    report.filters.groupBy && report.filters.groupBy !== 'none'
      ? report.columns.find((c) => c.key === report.filters.groupBy)
      : undefined;

  let lastGroupVal = '';

  return (
    <div
      id={id}
      ref={sheetRef}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        ...(isOffscreen
          ? {
              position: 'fixed',
              left: '-9999px',
              top: 0,
              width: `${widthPx}px`,
              zIndex: -1,
              pointerEvents: 'none',
            }
          : {
              width: '100%',
              maxWidth: `${widthPx}px`,
              margin: '0 auto',
              borderRadius: '10px',
              boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.28)',
            }),
        backgroundColor: '#FFFFFF',
        color: '#0F172A',
        padding: `${paddingPx}px`,
        boxSizing: 'border-box',
        border: `1px solid ${palette.border}`,
        filter: printSettings.colorMode === 'monochrome' ? 'grayscale(100%)' : 'none',
        fontFamily: isAr
          ? "'IBM Plex Sans Arabic', system-ui, sans-serif"
          : "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* 1. Institutional Header */}
      {printSettings.showHeader && (
        <header
          style={{
            backgroundColor: palette.headerBg,
            color: palette.headerText,
            border: `1px solid ${palette.border}`,
            borderRadius: '8px',
            padding: '16px 18px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: template.logoPosition === 'center' ? 'column' : 'row',
              alignItems: template.logoPosition === 'center' ? 'center' : 'flex-start',
              justifyContent: 'space-between',
              gap: '14px',
              textAlign: template.logoPosition === 'center' ? 'center' : undefined,
            }}
          >
            {/* Brand + Company Block */}
            <div
              style={{
                display: 'flex',
                flexDirection: template.logoPosition === 'center' ? 'column' : 'row',
                alignItems: 'center',
                gap: '12px',
                order: template.logoPosition === 'end' ? 2 : 1,
              }}
            >
              <div
                style={{
                  width: `${logoPx}px`,
                  height: `${logoPx}px`,
                  borderRadius: '10px',
                  backgroundColor: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <img
                  src={BUNYAN_OFFICIAL_LOGO_SRC}
                  alt="شعار المنظمة الرسمي"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, lineHeight: 1.25 }}>
                  {isAr ? company.nameAr : company.nameEn}
                </div>
                <div style={{ fontSize: '10.5px', opacity: 0.8, marginTop: '2px' }}>
                  {isAr ? 'المنظمة لإدارة المشاريع والإنشاءات' : 'ORGANIZATION ENGINEERING SYSTEM'}
                </div>
                <div
                  dir="ltr"
                  style={{
                    fontSize: '10px',
                    fontFamily: "'JetBrains Mono', monospace",
                    opacity: 0.78,
                    marginTop: '3px',
                  }}
                >
                  LIC: {company.licenseNumber} · TRN: {company.trnNumber}
                </div>
              </div>
            </div>

            {/* Report Metadata Stamp */}
            <div
              style={{
                order: template.logoPosition === 'end' ? 1 : 2,
                textAlign:
                  template.logoPosition === 'center'
                    ? 'center'
                    : template.logoPosition === 'end'
                    ? isAr
                      ? 'right'
                      : 'left'
                    : isAr
                    ? 'left'
                    : 'right',
                fontSize: '10.5px',
                lineHeight: 1.6,
              }}
            >
              <div
                dir="ltr"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: '12px',
                }}
              >
                {report.reportNumber}
              </div>
              <div>
                {isAr ? 'التاريخ:' : 'Date:'}{' '}
                <span dir="ltr" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {report.generatedAt.slice(0, 16).replace('T', ' ')}
                </span>
              </div>
              <div>
                {isAr ? 'المستخدم:' : 'Issued By:'} <strong>{report.generatedBy}</strong>
              </div>
              <div style={{ fontSize: '10px', opacity: 0.78 }}>
                {isAr ? template.nameAr : template.nameEn} · {printSettings.paperSize} (
                {printSettings.orientation})
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: `1px solid ${palette.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{headerTitle}</h1>
              <p style={{ margin: '2px 0 0', fontSize: '11px', opacity: 0.82 }}>
                {isAr ? template.headerTextAr : template.headerTextEn}
              </p>
            </div>
            <div
              dir="ltr"
              style={{
                fontSize: '10px',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '4px 8px',
                borderRadius: '4px',
                border: `1px solid ${palette.border}`,
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
              }}
            >
              {report.rows.length} {isAr ? 'سجل' : 'RECORDS'}
            </div>
          </div>
        </header>
      )}

      {/* 2. KPI Summary Grid */}
      {report.showKpis && template.showKpiSummary && report.kpis.length > 0 && (
        <section
          className="print-break-inside-avoid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(4, report.kpis.length)}, minmax(0, 1fr))`,
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          {report.kpis.map((kpi) => {
            const valColor =
              kpi.tone === 'positive'
                ? '#047857'
                : kpi.tone === 'warning'
                ? '#B45309'
                : kpi.tone === 'critical'
                ? '#B91C1C'
                : '#0F172A';
            return (
              <div
                key={kpi.id}
                style={{
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  backgroundColor: '#F8FAFC',
                  padding: '10px 12px',
                }}
              >
                <div style={{ fontSize: '10px', color: '#475569', fontWeight: 600 }}>
                  {isAr ? kpi.labelAr : kpi.labelEn}
                </div>
                <div
                  dir="ltr"
                  style={{
                    fontSize: '14px',
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono', monospace",
                    color: valColor,
                    marginTop: '4px',
                    textAlign: isAr ? 'right' : 'left',
                  }}
                >
                  {kpi.valueText}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* 3. Visual Charts Section */}
      {report.showCharts && report.charts.length > 0 && (
        <ReportVisualCharts series={report.charts} lang={report.lang} printableMode />
      )}

      {/* 4. Tabular Data Table with Repeating <thead> */}
      <section style={{ marginBottom: '16px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: cellFont,
            border: '1px solid #CBD5E1',
          }}
        >
          <thead
            style={{
              display: printSettings.repeatTableHeaders ? 'table-header-group' : 'table-row-group',
              backgroundColor: palette.tableHeadBg,
              color: palette.tableHeadText,
            }}
          >
            <tr>
              <th
                style={{
                  padding: rowPad,
                  textAlign: 'center',
                  fontWeight: 700,
                  borderBottom: `1px solid ${palette.border}`,
                  width: '34px',
                }}
              >
                #
              </th>
              {activeCols.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: rowPad,
                    textAlign: col.align === 'end' ? (isAr ? 'left' : 'right') : col.align === 'center' ? 'center' : isAr ? 'right' : 'left',
                    fontWeight: 700,
                    borderBottom: `1px solid ${palette.border}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isAr ? col.labelAr : col.labelEn}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={activeCols.length + 1}
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#64748B',
                    fontSize: '12px',
                  }}
                >
                  {isAr ? 'لا توجد سجلات مطابقة لمعايير التصفية المحددة.' : 'No records match the selected filters.'}
                </td>
              </tr>
            ) : (
              report.rows.map((row, idx) => {
                const groupVal = groupedColumn ? String(row.cells[groupedColumn.key] ?? '') : '';
                const showGroupHeader = Boolean(groupedColumn && groupVal !== lastGroupVal);
                if (groupedColumn) lastGroupVal = groupVal;

                return (
                  <React.Fragment key={row.id}>
                    {showGroupHeader && (
                      <tr style={{ backgroundColor: '#E2E8F0', breakInside: 'avoid' }}>
                        <td
                          colSpan={activeCols.length + 1}
                          style={{
                            padding: '6px 10px',
                            fontWeight: 700,
                            fontSize: '10.5px',
                            color: '#0F172A',
                            borderTop: '1px solid #94A3B8',
                            borderBottom: '1px solid #CBD5E1',
                          }}
                        >
                          {isAr ? groupedColumn!.labelAr : groupedColumn!.labelEn}: {groupVal || '—'}
                        </td>
                      </tr>
                    )}
                    <tr
                      style={{
                        backgroundColor: idx % 2 === 1 ? palette.stripeBg : '#FFFFFF',
                        borderBottom: '1px solid #E2E8F0',
                        breakInside: 'avoid',
                      }}
                    >
                      <td
                        dir="ltr"
                        style={{
                          padding: rowPad,
                          textAlign: 'center',
                          fontFamily: "'JetBrains Mono', monospace",
                          color: '#64748B',
                        }}
                      >
                        {idx + 1}
                      </td>
                      {activeCols.map((col) => {
                        const val = row.cells[col.key];
                        const isNumeric =
                          col.format === 'currency' ||
                          col.format === 'number' ||
                          col.format === 'percent' ||
                          col.format === 'date';
                        return (
                          <td
                            key={col.key}
                            dir={isNumeric ? 'ltr' : undefined}
                            style={{
                              padding: rowPad,
                              textAlign:
                                col.align === 'end'
                                  ? isAr
                                    ? 'left'
                                    : 'right'
                                  : col.align === 'center'
                                  ? 'center'
                                  : isAr
                                  ? 'right'
                                  : 'left',
                              fontFamily: isNumeric ? "'JetBrains Mono', monospace" : undefined,
                              fontWeight: col.key === 'code' || col.key === 'reportNumber' ? 700 : 400,
                              color: '#0F172A',
                            }}
                          >
                            {formatCellDisplay(val, col, report.lang)}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>

          {report.showTotals && report.totalsRow && (
            <tfoot>
              <tr
                style={{
                  backgroundColor: palette.totalsBg,
                  fontWeight: 800,
                  borderTop: `2px solid ${palette.border}`,
                  breakInside: 'avoid',
                }}
              >
                <td style={{ padding: rowPad, textAlign: 'center' }}>Σ</td>
                {activeCols.map((col) => {
                  const val = report.totalsRow?.[col.key];
                  const isNumeric =
                    col.format === 'currency' || col.format === 'number' || col.format === 'percent';
                  return (
                    <td
                      key={col.key}
                      dir={isNumeric ? 'ltr' : undefined}
                      style={{
                        padding: rowPad,
                        textAlign:
                          col.align === 'end'
                            ? isAr
                              ? 'left'
                              : 'right'
                            : col.align === 'center'
                            ? 'center'
                            : isAr
                            ? 'right'
                            : 'left',
                        fontFamily: isNumeric ? "'JetBrains Mono', monospace" : undefined,
                        color: '#020617',
                      }}
                    >
                      {val === '' || val === undefined
                        ? ''
                        : formatCellDisplay(val, col, report.lang)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {/* 5. Notes & Approvals */}
      {(report.notes.trim() || (isAr ? template.defaultNotesAr : template.defaultNotesEn)) && (
        <section
          className="print-break-inside-avoid"
          style={{
            border: '1px solid #CBD5E1',
            borderRadius: '6px',
            backgroundColor: '#F8FAFC',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '11px',
            color: '#334155',
          }}
        >
          <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
            {isAr ? 'الملاحظات والاعتمادات الفنية' : 'Notes & Engineering Remarks'}
          </div>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {report.notes.trim() || (isAr ? template.defaultNotesAr : template.defaultNotesEn)}
          </div>
        </section>
      )}

      {/* 6. Signature Blocks & Institutional Stamp */}
      {(report.showSignatures || report.showStamp) && (
        <section
          className="print-break-inside-avoid"
          style={{
            display: 'grid',
            gridTemplateColumns: report.showStamp ? 'repeat(4, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
            gap: '12px',
            marginBottom: '16px',
            paddingTop: '8px',
          }}
        >
          {report.showSignatures &&
            (isAr ? template.signatureLabelsAr : template.signatureLabelsEn).map((label, i) => (
              <div
                key={i}
                style={{
                  border: '1px dashed #94A3B8',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  minHeight: '72px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#0F172A' }}>{label}</div>
                <div style={{ fontSize: '9.5px', color: '#64748B', borderTop: '1px solid #E2E8F0', paddingTop: '4px' }}>
                  {isAr ? 'التوقيع والتاريخ' : 'Signature & Date'}
                </div>
              </div>
            ))}

          {report.showStamp && (
            <div
              style={{
                border: '2px solid #94A3B8',
                borderRadius: '8px',
                padding: '8px',
                minHeight: '72px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                backgroundColor: '#F8FAFC',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#334155', letterSpacing: '0.04em' }}>
                {isAr ? 'الختم الرسمي المعتمد' : 'OFFICIAL STAMP'}
              </div>
              <div style={{ fontSize: '9px', color: '#475569', marginTop: '3px' }}>
                {isAr ? company.nameAr : company.nameEn}
              </div>
              <div dir="ltr" style={{ fontSize: '8.5px', fontFamily: "'JetBrains Mono', monospace", color: '#64748B', marginTop: '2px' }}>
                {company.licenseNumber}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 7. Official Repeating Document Footer */}
      {printSettings.showFooter && (
        <footer
          style={{
            borderTop: `1px solid ${palette.border}`,
            paddingTop: '10px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '9.5px',
            color: '#475569',
          }}
        >
          <div>{isAr ? template.footerTextAr : template.footerTextEn}</div>
          <div dir="ltr" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {company.phone} · {company.email} · {report.reportNumber}
          </div>
        </footer>
      )}
    </div>
  );
};
