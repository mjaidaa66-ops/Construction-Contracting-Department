import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Globe,
  Loader2,
  Printer,
  X,
} from 'lucide-react';
import type {
  CompanyProfile,
  Language,
  Project,
  TakeoffCategory,
  TakeoffMeasurement,
  TakeoffProjectSummary,
} from '../../types/bunyan';
import { CATEGORY_LABELS, formatAED } from '../../utils/i18n';
import {
  computeTakeoffSummary,
  evaluateTakeoffVerificationState,
  type TakeoffVerificationSummary,
} from '../../utils/takeoffCalculations';
import { generateProjectBimElements } from '../../utils/gisTakeoffGenerator';
import { BUNYAN_OFFICIAL_LOGO_SRC, BunyanLogo } from '../common/BunyanLogo';

export interface BunyanExportCenterProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  company: CompanyProfile;
  lang: Language;
  onLogExport?: (action: 'pdf' | 'xlsx' | 'print', project: Project, rowCount: number) => void;
}

interface ExportBoqLine {
  id: string;
  category: TakeoffCategory;
  labelAr: string;
  labelEn: string;
  unit: string;
  quantity: number;
  unitRateAed: number;
  totalCostAed: number;
  source: '2D PlanSwift' | '5D BIM';
}

function resolveCssColorToRgba(value: string): string {
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

function sanitizeCloneForHtml2Canvas(clonedDoc: Document, clonedEl: HTMLElement): void {
  // Tailwind CSS v4 emits oklch()/oklab()/color-mix() rules in <style>/<link> sheets which html2canvas 1.4.1 cannot parse.
  // Since #bunyan-official-pdf-sheet uses explicit inline hex styles, remove non-font stylesheets inside the cloned DOM.
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
  if (!win) return;

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

interface OfficialSheetProps {
  id?: string;
  sheetRef?: React.RefObject<HTMLDivElement | null>;
  isOffscreen?: boolean;
  reportLang: Language;
  project: Project;
  company: CompanyProfile;
  boqLines: ExportBoqLine[];
  summary: TakeoffProjectSummary;
  verification: TakeoffVerificationSummary;
  generatedDate: string;
}

const OfficialReportSheet: React.FC<OfficialSheetProps> = ({
  id,
  sheetRef,
  isOffscreen = false,
  reportLang,
  project,
  company,
  boqLines,
  summary,
  verification,
  generatedDate,
}) => {
  const isAr = reportLang === 'ar';

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
              width: '794px',
              zIndex: -1,
              pointerEvents: 'none',
            }
          : {
              width: '100%',
              maxWidth: '794px',
              margin: '0 auto',
              borderRadius: '12px',
              boxShadow: '0 20px 35px -15px rgba(15, 23, 42, 0.35)',
            }),
        backgroundColor: '#ffffff',
        color: '#0f172a',
        padding: '30px',
        boxSizing: 'border-box',
        border: '1px solid #cbd5e1',
        fontFamily: isAr
          ? "'IBM Plex Sans Arabic', system-ui, sans-serif"
          : "'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      {/* 1. Official Header with Official Silver Chrome Logo, Company Profile & UAE TRN */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          paddingBottom: '18px',
          marginBottom: '18px',
          borderBottom: '2px solid #94A3B8',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '12px',
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
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#020617', lineHeight: 1.25 }}>
                {isAr ? 'المنظمة' : 'ORGANIZATION'}
              </div>
              <div
                dir="ltr"
                style={{
                  fontSize: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#475569',
                  letterSpacing: '0.06em',
                }}
              >
                {isAr ? 'ORGANIZATION · 5D BIM' : 'المنظمة · 5D BIM'}
              </div>
            </div>
          </div>

          <div style={{ paddingTop: '4px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#020617' }}>
              {isAr ? company.nameAr : company.nameEn}
            </div>
            <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '2px' }}>
              {isAr ? company.addressAr : company.addressEn}
            </div>
          </div>
        </div>

        <div
          style={{
            textAlign: isAr ? 'left' : 'right',
            fontSize: '11.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            alignItems: isAr ? 'flex-start' : 'flex-end',
          }}
        >
          <div
            dir="ltr"
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: '#0B1120',
              color: '#D4AF37',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              fontSize: '11.5px',
            }}
          >
            TRN: {company.trnNumber}
          </div>
          <div style={{ color: '#334155', fontFamily: "'JetBrains Mono', monospace" }}>
            {isAr ? 'رقم الرخصة التجارية:' : 'License No:'} <strong>{company.licenseNumber}</strong>
          </div>
          <div style={{ color: '#475569' }}>{company.municipalityClass}</div>
          <div style={{ fontSize: '10.5px', color: '#64748b' }}>{generatedDate}</div>
        </div>
      </header>

      {/* 2. Title Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: '#f8fafc',
          border: '1px solid #cbd5e1',
          marginBottom: '16px',
        }}
      >
        <h1 style={{ fontSize: '14px', fontWeight: 700, color: '#020617', margin: 0 }}>
          {verification.status === 'certified_calibrated'
            ? isAr
              ? 'جدول الكميات والتكاليف الهندسية المعتمد (5D BOQ & ضريبة القيمة المضافة UAE VAT)'
              : 'Verified 5D Engineering Bill of Quantities & UAE VAT Financial Schedule'
            : isAr
            ? `جدول الكميات (${verification.badgeAr})`
            : `5D Bill of Quantities (${verification.badgeEn})`}
        </h1>
        <span
          dir="ltr"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#9E7330',
            whiteSpace: 'nowrap',
          }}
        >
          REF: {project.code}
        </span>
      </div>

      {/* 3. Project, Permit & GIS Plot Card */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          padding: '14px',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          backgroundColor: '#f8fafc',
          fontSize: '11.5px',
          marginBottom: '18px',
          lineHeight: 1.6,
        }}
      >
        <div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'اسم المشروع: ' : 'Project Name: '}</span>
            <strong style={{ color: '#020617' }}>{isAr ? project.name : project.nameEn}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'المالك: ' : 'Owner: '}</span>
            <strong style={{ color: '#0f172a' }}>{project.ownerName}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'الاستشاري المشرف: ' : 'Consultant: '}</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{project.consultantOffice}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'المقاول المنفذ: ' : 'Contractor: '}</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{project.contractorBranch}</span>
          </div>
        </div>

        <div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'رقم رخصة البناء: ' : 'Building Permit No: '}</span>
            <strong dir="ltr" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#020617' }}>
              {project.permitNumber}
            </strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'الجهة المرخصة: ' : 'Authority: '}</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{project.licensingAuthority}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'بيانات الأرض GIS: ' : 'GIS Land Plot: '}</span>
            <strong dir="ltr" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#020617' }}>
              {project.gisData.plotNumber}
            </strong>{' '}
            — <span>{project.gisData.sectorName}</span>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>{isAr ? 'المساحة والارتدادات: ' : 'Area & Setbacks: '}</span>
            <span dir="ltr" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0f172a' }}>
              {project.gisData.plotAreaSqM} m² (F:{project.gisData.setbacks.front} / R:
              {project.gisData.setbacks.rear} / L:{project.gisData.setbacks.sideLeft} / R:
              {project.gisData.setbacks.sideRight}m)
            </span>
          </div>
        </div>
      </section>

      {/* 4. UAE Financial & 5% VAT Summary Table */}
      <section style={{ marginBottom: '18px' }}>
        <h2
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#1e293b',
            margin: '0 0 8px 0',
          }}
        >
          {isAr ? 'ملخص التكاليف والضريبة الاتحادية (5% UAE VAT)' : 'Financial & UAE 5% VAT Summary'}
        </h2>
        <div style={{ borderRadius: '8px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#334155', backgroundColor: '#f8fafc' }}>
                  {isAr ? 'التكلفة المباشرة للأعمال (Direct Cost)' : 'Direct Construction Cost'}
                </td>
                <td
                  dir="ltr"
                  style={{
                    padding: '8px 12px',
                    textAlign: isAr ? 'left' : 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {formatAED(summary.directCostAed, 'en')}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 12px', color: '#334155', backgroundColor: '#f8fafc' }}>
                  {isAr
                    ? `المصاريف الإدارية والتشغيلية (${summary.overheadPercent}%)`
                    : `General Overhead (${summary.overheadPercent}%)`}
                </td>
                <td
                  dir="ltr"
                  style={{
                    padding: '8px 12px',
                    textAlign: isAr ? 'left' : 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#1e293b',
                  }}
                >
                  {formatAED(summary.overheadAed, 'en')}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 12px', color: '#334155', backgroundColor: '#f8fafc' }}>
                  {isAr
                    ? `هامش ربح المقاول (${summary.profitPercent}%)`
                    : `Contractor Profit (${summary.profitPercent}%)`}
                </td>
                <td
                  dir="ltr"
                  style={{
                    padding: '8px 12px',
                    textAlign: isAr ? 'left' : 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#1e293b',
                  }}
                >
                  {formatAED(summary.profitAed, 'en')}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', backgroundColor: '#f8fafc' }}>
                  {isAr ? 'الإجمالي قبل الضريبة (Subtotal Before VAT)' : 'Subtotal Before VAT'}
                </td>
                <td
                  dir="ltr"
                  style={{
                    padding: '8px 12px',
                    textAlign: isAr ? 'left' : 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {formatAED(summary.subtotalBeforeVatAed, 'en')}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', backgroundColor: '#f8fafc' }}>
                  {isAr
                    ? `ضريبة القيمة المضافة الإماراتية (${summary.vatPercent}% UAE VAT)`
                    : `UAE Value Added Tax (${summary.vatPercent}% VAT)`}
                </td>
                <td
                  dir="ltr"
                  style={{
                    padding: '8px 12px',
                    textAlign: isAr ? 'left' : 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                >
                  {formatAED(summary.vatAed, 'en')}
                </td>
              </tr>
              <tr style={{ backgroundColor: '#0B1120', color: '#ffffff' }}>
                <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: '13px' }}>
                  {verification.status === 'certified_calibrated'
                    ? isAr
                      ? 'الإجمالي النهائي المعتمد شامل الضريبة'
                      : 'VERIFIED GRAND TOTAL INCLUDING UAE VAT'
                    : isAr
                    ? 'الإجمالي التقديري شامل الضريبة (غير معتمد نهائياً)'
                    : 'ESTIMATED GRAND TOTAL INCL. UAE VAT (DRAFT)'}
                </td>
                <td
                  dir="ltr"
                  style={{
                    padding: '10px 12px',
                    textAlign: isAr ? 'left' : 'right',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 700,
                    fontSize: '13px',
                    color: '#D4AF37',
                  }}
                >
                  {formatAED(summary.grandTotalAed, 'en')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Detailed Categorized Quantities Table */}
      <section style={{ marginBottom: '20px' }}>
        <h2
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: '#1e293b',
            margin: '0 0 8px 0',
          }}
        >
          {isAr ? 'تفاصيل بنود الكميات المصنفة حسب الفئات الهندسية' : 'Detailed Quantities Breakdown by Category'}
        </h2>
        <div style={{ borderRadius: '8px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9', color: '#1e293b', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'right' : 'left', fontWeight: 700 }}>#</th>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'right' : 'left', fontWeight: 700 }}>
                  {isAr ? 'الفئة الهندسية' : 'Category'}
                </th>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'right' : 'left', fontWeight: 700 }}>
                  {isAr ? 'وصف البند' : 'Item Description'}
                </th>
                <th style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700 }}>
                  {isAr ? 'الوحدة' : 'Unit'}
                </th>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'left' : 'right', fontWeight: 700 }}>
                  {isAr ? 'الكمية' : 'Qty'}
                </th>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'left' : 'right', fontWeight: 700 }}>
                  {isAr ? 'سعر الوحدة' : 'Rate (AED)'}
                </th>
                <th style={{ padding: '7px 8px', textAlign: isAr ? 'left' : 'right', fontWeight: 700 }}>
                  {isAr ? 'الإجمالي (AED)' : 'Total (AED)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {boqLines.map((line, index) => {
                const catMeta = CATEGORY_LABELS[line.category];
                return (
                  <tr key={line.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', fontFamily: "'JetBrains Mono', monospace", color: '#64748b' }}>
                      {index + 1}
                    </td>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                      {isAr ? catMeta?.ar : catMeta?.en}
                    </td>
                    <td style={{ padding: '6px 8px', color: '#1e293b' }}>
                      {isAr ? line.labelAr : line.labelEn}
                    </td>
                    <td
                      dir="ltr"
                      style={{
                        padding: '6px 8px',
                        textAlign: 'center',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: '#334155',
                      }}
                    >
                      {line.unit}
                    </td>
                    <td
                      dir="ltr"
                      style={{
                        padding: '6px 8px',
                        textAlign: isAr ? 'left' : 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        color: '#0f172a',
                      }}
                    >
                      {line.quantity.toFixed(2)}
                    </td>
                    <td
                      dir="ltr"
                      style={{
                        padding: '6px 8px',
                        textAlign: isAr ? 'left' : 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: '#334155',
                      }}
                    >
                      {line.unitRateAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      dir="ltr"
                      style={{
                        padding: '6px 8px',
                        textAlign: isAr ? 'left' : 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700,
                        color: '#020617',
                      }}
                    >
                      {line.totalCostAed.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. Official Signatures & Contractor Stamp Grid */}
      <footer
        className="print-break-inside-avoid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          fontSize: '11px',
        }}
      >
        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div style={{ fontWeight: 700, color: '#1e293b' }}>
            {isAr ? 'المهندس المقيم (حصر الكميات)' : 'Resident QS Engineer'}
          </div>
          <div style={{ color: '#475569' }}>{project.residentEngineer}</div>
          <div style={{ paddingTop: '8px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8' }}>
            {isAr ? 'التوقيع والتاريخ' : 'Signature & Date'}
          </div>
        </div>

        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px dashed #cbd5e1',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div style={{ fontWeight: 700, color: '#1e293b' }}>
            {isAr ? 'الاستشاري الهندسي المشرف' : 'Supervising Consultant'}
          </div>
          <div style={{ color: '#475569' }}>{project.consultantOffice}</div>
          <div style={{ paddingTop: '8px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#94a3b8' }}>
            {isAr ? 'الختم والاعتماد' : 'Approval & Stamp'}
          </div>
        </div>

        <div
          style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px dashed #B4863C',
            backgroundColor: '#fdfaf3',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a' }}>
            {isAr ? 'ختم المقاول المعتمد' : 'Authorized Contractor Stamp'}
          </div>
          <div style={{ color: '#334155', fontWeight: 600 }}>{isAr ? company.nameAr : company.nameEn}</div>
          <div
            dir="ltr"
            style={{
              paddingTop: '8px',
              borderTop: '1px solid #e5d2a7',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace",
              color: '#9E7330',
            }}
          >
            TRN: {company.trnNumber}
          </div>
        </div>
      </footer>
    </div>
  );
};

export const BunyanExportCenter: React.FC<BunyanExportCenterProps> = ({
  isOpen,
  onClose,
  project,
  company,
  lang,
  onLogExport,
}) => {
  const [reportLang, setReportLang] = useState<Language>(lang);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const officialSheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setReportLang(lang);
  }, [lang]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('bunyan-printing-official');
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.classList.remove('bunyan-printing-official');
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  const summaryConfig = project.takeoffSummaryConfig || {
    overheadPercent: 10,
    profitPercent: 12,
    vatPercent: 5,
  };

  // Build unified BOQ lines: prefer explicit 2D PlanSwift measurements, fallback cleanly to 5D BIM elements
  const { boqLines, summary, verification } = useMemo(() => {
    const meas = project.takeoffMeasurements || [];
    if (meas.length > 0) {
      const lines: ExportBoqLine[] = meas.map((m) => ({
        id: m.id,
        category: m.category,
        labelAr: m.labelAr || m.label,
        labelEn: m.label,
        unit: m.unit,
        quantity: m.computedQuantity,
        unitRateAed: m.unitRateAed,
        totalCostAed: m.totalCostAed,
        source: '2D PlanSwift',
      }));
      const ver = evaluateTakeoffVerificationState(
        project.takeoffSheets || [],
        meas,
        project.bimElements
      );
      return {
        boqLines: lines,
        summary: computeTakeoffSummary(
          project.id,
          meas,
          summaryConfig.overheadPercent,
          summaryConfig.profitPercent,
          summaryConfig.vatPercent
        ),
        verification: ver,
      };
    }

    const bim =
      project.bimElements && project.bimElements.length > 0
        ? project.bimElements
        : generateProjectBimElements(project);

    const syntheticMeas: TakeoffMeasurement[] = bim.map((el, idx) => {
      const unit: TakeoffMeasurement['unit'] =
        el.boqCategory === 'concrete' || el.boqCategory === 'excavation'
          ? 'm3'
          : el.boqCategory === 'doors_windows' && el.category === 'door_window'
          ? 'unit'
          : 'm2';
      const qty =
        unit === 'm3' ? el.volumeM3 : unit === 'unit' ? 1 : el.netAreaM2 || el.grossAreaM2;
      return {
        id: `bim-line-${idx + 1}`,
        sheetId: project.takeoffSheets?.[0]?.id || `sheet-gis-${project.id}`,
        projectId: project.id,
        category: el.boqCategory,
        tool: unit === 'm3' ? 'volume' : 'area',
        label: el.name,
        labelAr: el.nameAr,
        points: [],
        unit,
        rawValue: qty,
        computedQuantity: Number(qty.toFixed(2)),
        unitRateAed: el.unitRate,
        totalCostAed: Number(el.estimatedCost.toFixed(2)),
        linkedBimElementId: el.id,
        color: CATEGORY_LABELS[el.boqCategory]?.color || '#B4863C',
        createdAt: new Date().toISOString(),
      };
    });

    const lines: ExportBoqLine[] = syntheticMeas.map((m) => ({
      id: m.id,
      category: m.category,
      labelAr: m.labelAr,
      labelEn: m.label,
      unit: m.unit,
      quantity: m.computedQuantity,
      unitRateAed: m.unitRateAed,
      totalCostAed: m.totalCostAed,
      source: '5D BIM',
    }));

    return {
      boqLines: lines,
      summary: computeTakeoffSummary(
        project.id,
        syntheticMeas,
        summaryConfig.overheadPercent,
        summaryConfig.profitPercent,
        summaryConfig.vatPercent
      ),
      verification: evaluateTakeoffVerificationState(
        project.takeoffSheets || [],
        [],
        bim
      ),
    };
  }, [project, summaryConfig]);

  const linesByCategory = useMemo(() => {
    const grouped = new Map<TakeoffCategory, ExportBoqLine[]>();
    for (const line of boqLines) {
      const list = grouped.get(line.category) || [];
      list.push(line);
      grouped.set(line.category, list);
    }
    return grouped;
  }, [boqLines]);

  if (!isOpen) return null;

  const isAr = reportLang === 'ar';
  const generatedDate = new Date().toLocaleDateString(isAr ? 'ar-AE' : 'en-AE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const safeCode = (project.code || project.id).replace(/[^a-zA-Z0-9_-]/g, '_');

    const summarySheetRows: (string | number)[][] = [
      ['المنظمة | ORGANIZATION — 5D BOQ & UAE VAT SUMMARY'],
      ['Verification Status', verification.badgeEn],
      ['Verification Notice', verification.noticeEn],
      [],
      ['COMPANY & TAX REGISTRATION DETAILS', 'بيانات المقاول والضريبة'],
      ['Company (AR)', company.nameAr],
      ['Company (EN)', company.nameEn],
      ['License Number', company.licenseNumber],
      ['Municipality Class', company.municipalityClass],
      ['UAE VAT TRN', company.trnNumber],
      [],
      ['PROJECT & PERMIT METADATA', 'بيانات المشروع والرخصة والـ GIS'],
      ['Project Code', project.code],
      ['Project Name (AR)', project.name],
      ['Project Name (EN)', project.nameEn],
      ['Permit Number', project.permitNumber],
      ['Licensing Authority', project.licensingAuthority],
      ['Owner Name', project.ownerName],
      ['Consultant Office', project.consultantOffice],
      ['Contractor Branch', project.contractorBranch],
      ['GIS Plot Number', project.gisData.plotNumber],
      ['GIS Sector', project.gisData.sectorName],
      ['GIS Plot Area (m²)', project.gisData.plotAreaSqM],
      [],
      ['FINANCIAL & UAE 5% VAT SUMMARY (AED)', 'ملخص التكاليف والضريبة'],
      ['Direct Construction Cost (AED)', summary.directCostAed],
      [`Overhead (${summary.overheadPercent}%)`, summary.overheadAed],
      [`Contractor Profit (${summary.profitPercent}%)`, summary.profitAed],
      ['Subtotal Before VAT (AED)', summary.subtotalBeforeVatAed],
      [`UAE VAT (${summary.vatPercent}%)`, summary.vatAed],
      ['GRAND TOTAL INCLUDING VAT (AED)', summary.grandTotalAed],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(summarySheetRows);
    ws1['!cols'] = [{ wch: 36 }, { wch: 52 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Cost & UAE Tax Summary');

    const boqRows: (string | number)[][] = [
      [
        '#',
        'Category Code',
        'Category (AR)',
        'Category (EN)',
        'Description (AR)',
        'Description (EN)',
        'Source',
        'Unit',
        'Quantity',
        'Unit Rate (AED)',
        'Total Cost (AED)',
      ],
    ];

    let rowIdx = 1;
    (Object.keys(CATEGORY_LABELS) as TakeoffCategory[]).forEach((cat) => {
      const items = linesByCategory.get(cat);
      if (!items || items.length === 0) return;
      const meta = CATEGORY_LABELS[cat];
      const byUnit = new Map<string, ExportBoqLine[]>();
      items.forEach((item) => {
        const list = byUnit.get(item.unit) || [];
        list.push(item);
        byUnit.set(item.unit, list);
        boqRows.push([
          rowIdx++,
          cat.toUpperCase(),
          meta.ar,
          meta.en,
          item.labelAr,
          item.labelEn,
          item.source,
          item.unit,
          item.quantity,
          item.unitRateAed,
          item.totalCostAed,
        ]);
      });
      byUnit.forEach((unitItems, unitKey) => {
        const catQty = unitItems.reduce((s, i) => s + i.quantity, 0);
        const catCost = unitItems.reduce((s, i) => s + i.totalCostAed, 0);
        boqRows.push([
          '',
          cat.toUpperCase(),
          `مجموع فئة (${unitKey}): ${meta.ar}`,
          `SUBTOTAL (${unitKey}): ${meta.en}`,
          '',
          '',
          '',
          unitKey,
          Number(catQty.toFixed(2)),
          '',
          Number(catCost.toFixed(2)),
        ]);
      });
    });

    boqRows.push([]);
    boqRows.push(['', '', 'التكلفة المباشرة', 'DIRECT COST', '', '', '', 'AED', '', '', summary.directCostAed]);
    boqRows.push(['', '', `ضريبة القيمة المضافة (${summary.vatPercent}%)`, `UAE VAT (${summary.vatPercent}%)`, '', '', '', 'AED', '', '', summary.vatAed]);
    boqRows.push(['', '', 'الإجمالي النهائي شامل الضريبة', 'GRAND TOTAL AED', '', '', '', 'AED', '', '', summary.grandTotalAed]);

    const ws2 = XLSX.utils.aoa_to_sheet(boqRows);
    ws2['!cols'] = [
      { wch: 5 },
      { wch: 15 },
      { wch: 24 },
      { wch: 24 },
      { wch: 36 },
      { wch: 36 },
      { wch: 14 },
      { wch: 8 },
      { wch: 12 },
      { wch: 15 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, '5D BOQ by Category');
    XLSX.writeFile(wb, `Bunyan_5D_BOQ_${safeCode}.xlsx`);
    onLogExport?.('xlsx', project, boqLines.length);
  };

  const handleDownloadPdf = async () => {
    const targetEl =
      officialSheetRef.current ||
      (document.getElementById('bunyan-official-pdf-sheet') as HTMLDivElement | null);

    if (!targetEl) {
      setPdfError(
        lang === 'ar'
          ? 'تعذر العثور على قالب التقرير الرسمي في الصفحة. يرجى إعادة فتح نافذة التصدير.'
          : 'Official PDF report template element was not found. Please reopen the export modal.'
      );
      return;
    }

    setPdfError(null);
    setDownloadingPdf(true);

    try {
      if (document.fonts && typeof document.fonts.ready?.then === 'function') {
        await document.fonts.ready.catch(() => undefined);
      }

      const canvas = await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
        scrollX: 0,
        scrollY: 0,
        logging: false,
        onclone: (clonedDoc, clonedEl) => {
          sanitizeCloneForHtml2Canvas(clonedDoc, clonedEl);
        },
      });

      if (!canvas.width || !canvas.height) {
        throw new Error('Rendered PDF canvas is empty');
      }

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const marginMm = 8;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const contentWidthMm = pageWidth - marginMm * 2;
      const contentHeightMm = pageHeight - marginMm * 2;
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

      const safeCode = (project.code || project.id).replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Bunyan_5D_BOQ_${safeCode}.pdf`);
      onLogExport?.('pdf', project, boqLines.length);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setPdfError(
        lang === 'ar'
          ? `تعذر إنشاء ملف PDF تلقائياً (${detail}). يمكنك استخدام زر "طباعة مباشرة (Print)" كخيار بديل فوري.`
          : `Could not generate PDF file automatically (${detail}). Please use "Direct Print" as an instant fallback.`
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDirectPrint = () => {
    setPdfError(null);
    document.body.classList.add('bunyan-printing-official');
    onLogExport?.('print', project, boqLines.length);
    window.print();
  };

  return (
    <>
      <div
        className="print-modal-root fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-5"
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="print-modal-card w-full max-w-6xl max-h-[94vh] flex flex-col rounded-lg border border-slate-700/70 bg-[#0E1628] text-slate-100 overflow-hidden">
          {/* Action Toolbar */}
          <div className="px-5 py-3.5 border-b border-slate-800 bg-[#0B1222] flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-3">
              <BunyanLogo iconOnly size="sm" lang={lang} />
              <div>
                <h3 className="text-sm font-bold text-white">
                  {lang === 'ar'
                    ? 'مركز التصدير الرسمي لجداول الكميات 5D BOQ'
                    : 'Official 5D BOQ & Tax Report Export Center'}
                </h3>
                <p className="text-[11px] font-mono tabular-nums text-slate-400">
                  {project.code} · {boqLines.length}{' '}
                  {lang === 'ar' ? 'بند كميات' : 'BOQ items'} ·{' '}
                  {lang === 'ar' ? verification.badgeAr : verification.badgeEn}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setReportLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900/70 text-xs font-semibold text-slate-200 hover:border-[#B4863C] whitespace-nowrap transition-colors"
              >
                <Globe className="w-3.5 h-3.5 text-[#C99A49]" />
                <span>{reportLang === 'ar' ? 'معاينة: العربية (RTL)' : 'Preview: English (LTR)'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 whitespace-nowrap transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'تصدير Excel (.xlsx)' : 'Export Excel (.xlsx)'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] disabled:opacity-65 whitespace-nowrap transition-colors"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>
                  {downloadingPdf
                    ? lang === 'ar'
                      ? 'جاري تجهيز ملف PDF...'
                      : 'Generating PDF...'
                    : lang === 'ar'
                    ? 'تصدير PDF الرسمي (Download PDF)'
                    : 'Download Official PDF'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDirectPrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-slate-700 bg-slate-800/80 text-slate-100 text-xs font-semibold hover:bg-slate-700 whitespace-nowrap transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-slate-300" />
                <span>{lang === 'ar' ? 'طباعة مباشرة (Print)' : 'Direct Print (A4)'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline PDF Error Notification Banner */}
          {pdfError && (
            <div className="px-5 py-2.5 bg-rose-950/80 border-b border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{pdfError}</span>
              </div>
              <button
                type="button"
                onClick={() => setPdfError(null)}
                className="text-rose-300 hover:text-white shrink-0"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {verification.status !== 'certified_calibrated' && (
            <div className="px-5 py-2 bg-amber-950/60 border-b border-amber-500/35 text-amber-200 text-xs flex items-center justify-between gap-3 no-print">
              <span>{lang === 'ar' ? verification.noticeAr : verification.noticeEn}</span>
              <span className="font-mono font-semibold shrink-0">
                {lang === 'ar' ? verification.badgeAr : verification.badgeEn}
              </span>
            </div>
          )}

          {/* Scrollable Live A4 Preview */}
          <div className="print-scroll-area flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-900/95">
            <OfficialReportSheet
              reportLang={reportLang}
              project={project}
              company={company}
              boqLines={boqLines}
              summary={summary}
              verification={verification}
              generatedDate={generatedDate}
            />
          </div>
        </div>
      </div>

      {/* Isolated Off-Screen Capture & Direct Print DOM Sheet (Visible in DOM, Pure Inline Hex Styles) */}
      <OfficialReportSheet
        id="bunyan-official-pdf-sheet"
        sheetRef={officialSheetRef}
        isOffscreen
        reportLang={reportLang}
        project={project}
        company={company}
        boqLines={boqLines}
        summary={summary}
        verification={verification}
        generatedDate={generatedDate}
      />
    </>
  );
};
