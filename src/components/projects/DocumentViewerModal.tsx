import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Printer,
  RotateCw,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CompanyProfile, Language, Project, ProjectDocument } from '../../types/bunyan';
import { downloadChunkedDocument } from '../../services/firestoreStorage';
import { cacheBinaryLocally, getCachedBinaryLocally } from '../../services/cloudSyncService';
import { formatAED, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '../../utils/i18n';
import { disposePdfDocumentProxy, ensurePdfWorkerConfigured } from '../../utils/pdfWorkerConfig';
import {
  dataUrlToUint8Array,
  decodeDataUrlAsUtf8Text,
  detectInlineDocRenderKind,
  extractSanitizedSvgFromDataUrl,
  isSafeExportBinaryDataUrl,
} from '../../utils/projectFilesEngine';
import { sanitizeCloneForHtml2Canvas } from '../../utils/reportExportEngine';
import { sanitizePreviewBinaryUrl } from '../../utils/sanitize';
import { BUNYAN_OFFICIAL_LOGO_SRC } from '../common/BunyanLogo';
import { PdfPageRenderer } from '../takeoff/PdfPageRenderer';
import { Button, Modal } from '../ui';

interface DocumentViewerModalProps {
  docItem: ProjectDocument | null;
  project?: Project | null;
  company?: CompanyProfile;
  onClose: () => void;
  lang: Language;
  canUpload?: boolean;
  canPrint?: boolean;
  canExport?: boolean;
  onReplaceDocumentFile?: (docId: string, file: File) => Promise<void> | void;
  onLogDocAction?: (action: 'print' | 'pdf', docItem: ProjectDocument) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  docItem,
  project,
  company,
  onClose,
  lang,
  canUpload = false,
  canPrint = true,
  canExport = true,
  onReplaceDocumentFile,
  onLogDocAction,
}) => {
  const isAr = lang === 'ar';
  const [rawDataUrl, setRawDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // PDF.js inline state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfNumPages, setPdfNumPages] = useState(1);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Shared inline viewer controls
  const [zoomScale, setZoomScale] = useState(1.0);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const printSheetRef = useRef<HTMLDivElement | null>(null);

  // Cleanup print class after print
  useEffect(() => {
    const onAfterPrint = () => {
      document.body.classList.remove('bunyan-printing-doc-viewer');
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
      onAfterPrint();
    };
  }, []);

  // Load binary payload from localDataUrl, IndexedDB, or Firestore chunks
  useEffect(() => {
    let active = true;
    setZoomScale(1.0);
    setRotation(0);
    setPdfPage(1);
    setPdfNumPages(1);

    async function load() {
      if (!docItem) {
        setRawDataUrl(null);
        return;
      }
      setError(null);
      if (docItem.localDataUrl) {
        await cacheBinaryLocally(docItem.id, docItem.localDataUrl);
        if (docItem.manifestId) {
          await cacheBinaryLocally(docItem.manifestId, docItem.localDataUrl);
        }
        if (active) setRawDataUrl(docItem.localDataUrl);
        return;
      }

      if (docItem.manifestId) {
        const cachedManifest = await getCachedBinaryLocally(docItem.manifestId);
        if (cachedManifest) {
          if (active) setRawDataUrl(cachedManifest);
          return;
        }
      }

      const cachedDoc = await getCachedBinaryLocally(docItem.id);
      if (cachedDoc) {
        if (active) setRawDataUrl(cachedDoc);
        return;
      }

      if (docItem.manifestId) {
        setLoading(true);
        try {
          const res = await downloadChunkedDocument(docItem.manifestId);
          if (res?.dataUrl) {
            await cacheBinaryLocally(docItem.manifestId, res.dataUrl);
            await cacheBinaryLocally(docItem.id, res.dataUrl);
          }
          if (active) setRawDataUrl(res?.dataUrl || null);
        } catch (err) {
          if (active) {
            setError(err instanceof Error ? err.message : 'Failed to load chunked document');
          }
        } finally {
          if (active) setLoading(false);
        }
      } else {
        setRawDataUrl(null);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [docItem]);

  const renderKind = useMemo(
    () => (docItem ? detectInlineDocRenderKind(docItem, rawDataUrl) : 'seeded_official'),
    [docItem, rawDataUrl]
  );

  // Load PDF bytes directly into pdfjs-dist so PDF NEVER triggers forced browser download
  useEffect(() => {
    let active = true;
    if (renderKind !== 'pdf' || !rawDataUrl) {
      disposePdfDocumentProxy(pdfDocRef.current);
      pdfDocRef.current = null;
      setPdfDoc(null);
      return;
    }

    async function initPdf() {
      setPdfLoading(true);
      setError(null);
      try {
        const pdfjs = ensurePdfWorkerConfigured();
        const bytes = dataUrlToUint8Array(rawDataUrl!);
        const loaded = await pdfjs.getDocument({ data: bytes }).promise;
        if (!active) {
          disposePdfDocumentProxy(loaded);
          return;
        }
        disposePdfDocumentProxy(pdfDocRef.current);
        pdfDocRef.current = loaded;
        setPdfDoc(loaded);
        setPdfNumPages(Math.max(1, loaded.numPages || 1));
        setPdfPage(1);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : isAr
              ? 'تعذر عرض ملف PDF داخلياً'
              : 'Unable to render PDF inline'
          );
        }
      } finally {
        if (active) setPdfLoading(false);
      }
    }

    void initPdf();
    return () => {
      active = false;
      disposePdfDocumentProxy(pdfDocRef.current);
      pdfDocRef.current = null;
    };
  }, [renderKind, rawDataUrl, isAr]);

  const safeBinaryDownloadUrl = useMemo(() => {
    if (!rawDataUrl) return null;
    if (isSafeExportBinaryDataUrl(rawDataUrl)) return rawDataUrl;
    return sanitizePreviewBinaryUrl(rawDataUrl);
  }, [rawDataUrl]);

  const safeImageSrc = useMemo(
    () => (renderKind === 'image' ? sanitizePreviewBinaryUrl(rawDataUrl) : null),
    [renderKind, rawDataUrl]
  );

  const sanitizedSvg = useMemo(
    () => (renderKind === 'svg' && rawDataUrl ? extractSanitizedSvgFromDataUrl(rawDataUrl) : ''),
    [renderKind, rawDataUrl]
  );

  const decodedText = useMemo(
    () => (renderKind === 'text' && rawDataUrl ? decodeDataUrlAsUtf8Text(rawDataUrl) : ''),
    [renderKind, rawDataUrl]
  );

  if (!docItem) return null;

  const handlePrintInline = () => {
    document.body.classList.add('bunyan-printing-doc-viewer');
    onLogDocAction?.('print', docItem);
    window.print();
  };

  const handleExportSheetPdf = async () => {
    const el = printSheetRef.current;
    if (!el) return;
    setExportingPdf(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc, clonedEl) => {
          sanitizeCloneForHtml2Canvas(clonedDoc, clonedEl);
        },
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const margin = 10;
      const contentW = pageW - margin * 2;
      const contentH = (canvas.height * contentW) / Math.max(1, canvas.width);
      pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', margin, margin, contentW, Math.min(277, contentH));
      const safeName = docItem.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Bunyan_Doc_${safeName || docItem.id}.pdf`);
      onLogDocAction?.('pdf', docItem);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleReplaceInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onReplaceDocumentFile) return;
    await onReplaceDocumentFile(docItem.id, file);
  };

  // Build SVG plot path for architectural/structural/gis inline sheet
  const plotSvgPoints = (() => {
    const pts = project?.gisData?.boundaryPoints || [];
    if (pts.length < 3) return '';
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min(260 / spanX, 150 / spanY);
    const offsetX = (320 - spanX * scale) / 2;
    const offsetY = (190 - spanY * scale) / 2;
    return pts
      .map(
        (p) =>
          `${(offsetX + (p.x - minX) * scale).toFixed(1)},${(offsetY + (p.y - minY) * scale).toFixed(1)}`
      )
      .join(' ');
  })();

  return (
    <Modal
      isOpen={Boolean(docItem)}
      onClose={onClose}
      maxWidthClass="max-w-5xl"
      icon={<FileText className="w-4 h-4" />}
      title={docItem.name}
      subtitle={`${docItem.category.toUpperCase()} · ${(docItem.sizeBytes / 1024).toFixed(1)} KB · ${docItem.uploadedAt}${
        project ? ` · ${project.code}` : ''
      }`}
      headerActions={
        <div className="flex flex-wrap items-center gap-1.5">
          {(renderKind === 'pdf' || renderKind === 'image' || renderKind === 'svg') && (
            <>
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer"
                title={isAr ? 'تصغير' : 'Zoom Out'}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span dir="ltr" className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] px-1">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer"
                title={isAr ? 'تكبير' : 'Zoom In'}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer"
                title={isAr ? 'تدوير 90°' : 'Rotate 90°'}
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {renderKind === 'pdf' && pdfNumPages > 1 && (
            <div className="inline-flex items-center gap-1 border border-[var(--border-hairline)] rounded-lg px-1.5 h-8 bg-[var(--bg-surface-subtle)]">
              <button
                type="button"
                disabled={pdfPage <= 1}
                onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                className="p-1 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
              <span dir="ltr" className="text-[11px] font-mono tabular-nums px-1">
                {pdfPage}/{pdfNumPages}
              </span>
              <button
                type="button"
                disabled={pdfPage >= pdfNumPages}
                onClick={() => setPdfPage((p) => Math.min(pdfNumPages, p + 1))}
                className="p-1 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>
          )}

          {canUpload && onReplaceDocumentFile && (
            <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-primary)] hover:border-[#B4863C] cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-[#B4863C]" />
              <span>{isAr ? 'إرفاق ملف فعلي' : 'Attach File'}</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.svg,.dxf,.dwg,.ifc,.json,.csv,.txt"
                onChange={handleReplaceInput}
                className="hidden"
              />
            </label>
          )}

          {canPrint && (
            <Button
              size="xs"
              variant="outline"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={handlePrintInline}
            >
              {isAr ? 'طباعة' : 'Print'}
            </Button>
          )}

          {canExport && renderKind === 'seeded_official' && (
            <Button
              size="xs"
              variant="primary"
              disabled={exportingPdf}
              icon={exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              onClick={handleExportSheetPdf}
            >
              {isAr ? 'تصدير PDF' : 'Export PDF'}
            </Button>
          )}

          {canExport && safeBinaryDownloadUrl && (
            <a
              href={safeBinaryDownloadUrl}
              download={docItem.name}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isAr ? 'تصدير الملف' : 'Export File'}</span>
            </a>
          )}
        </div>
      }
    >
      <div className="p-4 sm:p-6 bg-[var(--bg-surface-subtle)] flex items-center justify-center min-h-[460px] max-h-[76vh] overflow-auto">
        {loading || pdfLoading ? (
          <div className="flex flex-col items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin text-[#B4863C]" />
            <span>
              {isAr ? 'جاري فتح المستند وعرضه داخل المنصة...' : 'Rendering document inline...'}
            </span>
          </div>
        ) : error ? (
          <div className="text-xs text-rose-500 font-mono">{error}</div>
        ) : (
          <div id="bunyan-doc-viewer-print" ref={printSheetRef} className="w-full flex justify-center">
            {renderKind === 'pdf' && pdfDoc ? (
              <div className="overflow-auto rounded-lg border border-[var(--border-hairline)] bg-white shadow-md">
                <PdfPageRenderer
                  pdfDoc={pdfDoc}
                  pageNumber={pdfPage}
                  zoomScale={zoomScale}
                  rotation={rotation}
                  onPageMetrics={() => {}}
                />
              </div>
            ) : renderKind === 'image' && safeImageSrc ? (
              <img
                src={safeImageSrc}
                alt={docItem.name}
                style={{
                  transform: `scale(${zoomScale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
                className="max-w-full max-h-[65vh] rounded-lg border border-[var(--border-hairline)] object-contain transition-transform"
              />
            ) : renderKind === 'svg' && sanitizedSvg ? (
              <div
                style={{
                  transform: `scale(${zoomScale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                }}
                className="p-4 rounded-lg border border-[var(--border-hairline)] bg-white max-w-full overflow-auto"
                dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
              />
            ) : renderKind === 'text' ? (
              <div className="w-full max-w-4xl rounded-lg border border-[var(--border-hairline)] bg-white dark:bg-slate-950 p-4 text-xs font-mono text-[var(--text-primary)] overflow-auto max-h-[64vh] whitespace-pre-wrap">
                {decodedText || (isAr ? 'ملف نصي فارغ.' : 'Empty text document.')}
              </div>
            ) : renderKind === 'unsupported_binary' ? (
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                style={{
                  width: '100%',
                  maxWidth: '680px',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '28px',
                }}
                className="space-y-4 text-center"
              >
                <FileText className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">{docItem.name}</h4>
                <p className="text-xs text-slate-600">
                  {isAr
                    ? `تم فك تشفير الملف بنجاح (${docItem.mimeType} · ${(docItem.sizeBytes / 1024).toFixed(1)} KB). هذه الصيغة الثنائية (${docItem.name.split('.').pop()?.toUpperCase()}) مخزنة بالكامل وجاهزة للتصدير أو الاستبدال بنسخة PDF/DXF للعرض المباشر.`
                    : `Binary file stored safely (${docItem.mimeType} · ${(docItem.sizeBytes / 1024).toFixed(1)} KB). Ready for export or replacement with PDF/Image/DXF for canvas preview.`}
                </p>
              </div>
            ) : (
              /* Rich In-App Official Document Sheet for Seeded Municipal / Contract / Engineering Archive Records */
              <div
                dir={isAr ? 'rtl' : 'ltr'}
                style={{
                  width: '100%',
                  maxWidth: '760px',
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  border: '1px solid #94A3B8',
                  borderRadius: '8px',
                  padding: '26px',
                  fontFamily: isAr
                    ? "'IBM Plex Sans Arabic', system-ui, sans-serif"
                    : "'Plus Jakarta Sans', system-ui, sans-serif",
                }}
              >
                {/* Institutional Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    paddingBottom: '14px',
                    borderBottom: '2px solid #94A3B8',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={BUNYAN_OFFICIAL_LOGO_SRC}
                      alt="شعار بنيان"
                      style={{ width: '48px', height: '48px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#F1F5F9' }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#020617' }}>
                        {company ? (isAr ? company.nameAr : company.nameEn) : isAr ? 'منصة بنيان للمشاريع' : 'Bunyan Core System'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569' }}>
                        {isAr ? 'وثيقة أرشيف مشروع معتمدة — معاينة مباشرة داخل المنصة' : 'Verified Project Archive Document — Inline Preview'}
                      </div>
                    </div>
                  </div>
                  <div dir="ltr" style={{ textAlign: 'right', fontSize: '10.5px', fontFamily: "'JetBrains Mono', monospace", color: '#334155' }}>
                    <div>{project?.code || docItem.id}</div>
                    <div>{docItem.uploadedAt}</div>
                    <div>{docItem.category.toUpperCase()}</div>
                  </div>
                </div>

                <h3 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                  {docItem.name}
                </h3>

                {project ? (
                  <div className="space-y-4">
                    {/* Project & Permit / Contract Core Metadata */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '8px',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '6px',
                        padding: '12px',
                        fontSize: '11.5px',
                      }}
                    >
                      <div><strong>{isAr ? 'المشروع:' : 'Project:'}</strong> {isAr ? project.name : project.nameEn}</div>
                      <div><strong>{isAr ? 'رقم الرخصة:' : 'Permit No.:'}</strong> <span dir="ltr">{project.permitNumber}</span></div>
                      <div><strong>{isAr ? 'المالك:' : 'Owner:'}</strong> {project.ownerName}</div>
                      <div><strong>{isAr ? 'المكتب الاستشاري:' : 'Consultant:'}</strong> {project.consultantOffice}</div>
                      <div><strong>{isAr ? 'الحالة:' : 'Status:'}</strong> {isAr ? PROJECT_STATUS_LABELS[project.status].ar : PROJECT_STATUS_LABELS[project.status].en}</div>
                      <div><strong>{isAr ? 'نوع المشروع:' : 'Type:'}</strong> {isAr ? PROJECT_TYPE_LABELS[project.projectType].ar : PROJECT_TYPE_LABELS[project.projectType].en}</div>
                      <div><strong>{isAr ? 'رقم القطعة والقطاع:' : 'Plot & Sector:'}</strong> {project.gisData.plotNumber} · {project.gisData.sectorName}</div>
                      <div><strong>{isAr ? 'الجهة المرخصة:' : 'Authority:'}</strong> {project.licensingAuthority}</div>
                    </div>

                    {/* Contract Financials & Payment Milestones if contract */}
                    {docItem.category === 'contract' && (
                      <div className="space-y-2">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', fontSize: '11.5px' }}>
                          <div style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '10px' }}>{isAr ? 'قيمة العقد المعتمدة' : 'Contract Value'}</div>
                            <div dir="ltr" style={{ fontWeight: 700, fontFamily: 'monospace' }}>{formatAED(project.approvedBudget, lang)}</div>
                          </div>
                          <div style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '10px' }}>{isAr ? 'المسدّد حتى تاريخه' : 'Paid to Date'}</div>
                            <div dir="ltr" style={{ fontWeight: 700, fontFamily: 'monospace', color: '#047857' }}>{formatAED(project.paidAmount, lang)}</div>
                          </div>
                          <div style={{ padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '10px' }}>{isAr ? 'محجوز الضمان' : 'Retention %'}</div>
                            <div dir="ltr" style={{ fontWeight: 700, fontFamily: 'monospace' }}>{project.retentionPercentage}%</div>
                          </div>
                        </div>

                        {project.paymentMilestones.length > 0 && (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #CBD5E1' }}>
                            <thead style={{ backgroundColor: '#1E293B', color: '#FFFFFF' }}>
                              <tr>
                                <th style={{ padding: '6px 8px', textAlign: isAr ? 'right' : 'left' }}>{isAr ? 'الدفعة' : 'Milestone'}</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center' }}>%</th>
                                <th style={{ padding: '6px 8px', textAlign: isAr ? 'left' : 'right' }}>{isAr ? 'المبلغ' : 'Amount'}</th>
                                <th style={{ padding: '6px 8px', textAlign: 'center' }}>{isAr ? 'الاستحقاق' : 'Due Date'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {project.paymentMilestones.map((m) => (
                                <tr key={m.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                  <td style={{ padding: '6px 8px' }}>{isAr ? m.titleAr : m.titleEn}</td>
                                  <td dir="ltr" style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{m.percentage}%</td>
                                  <td dir="ltr" style={{ padding: '6px 8px', textAlign: isAr ? 'left' : 'right', fontFamily: 'monospace' }}>{formatAED(m.amountAed, lang)}</td>
                                  <td dir="ltr" style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace' }}>{m.dueDate}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {/* Engineering Vector Plot Boundary Preview for Structural / Architectural / GIS / DWG */}
                    {(docItem.category === 'structural' ||
                      docItem.category === 'architectural' ||
                      docItem.category === 'mep' ||
                      docItem.category === 'gis' ||
                      docItem.category === 'permit') &&
                      plotSvgPoints && (
                        <div style={{ border: '1px solid #CBD5E1', borderRadius: '6px', padding: '12px', backgroundColor: '#F8FAFC' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '8px', color: '#334155' }}>
                            {isAr
                              ? `مخطط الحدود الهندسية والمساحة والارتدادات — قطعة ${project.gisData.plotNumber} (${project.gisData.plotAreaSqM} م²)`
                              : `Site Boundary & Setbacks Schematic — Plot ${project.gisData.plotNumber} (${project.gisData.plotAreaSqM} m²)`}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
                            <svg width="320" height="190" viewBox="0 0 320 190" style={{ backgroundColor: '#0F172A', borderRadius: '6px' }}>
                              <polygon
                                points={plotSvgPoints}
                                fill="rgba(180, 134, 60, 0.2)"
                                stroke="#E2E8F0"
                                strokeWidth="2.5"
                              />
                              <text x="16" y="22" fill="#94A3B8" fontSize="10" fontFamily="monospace">
                                PLOT {project.gisData.plotNumber} · {project.gisData.zoning}
                              </text>
                            </svg>
                            <div style={{ fontSize: '11px', lineHeight: 1.8, color: '#334155' }}>
                              <div><strong>{isAr ? 'الارتداد الأمامي:' : 'Front Setback:'}</strong> {project.gisData.setbacks.front} m</div>
                              <div><strong>{isAr ? 'الارتداد الخلفي:' : 'Rear Setback:'}</strong> {project.gisData.setbacks.rear} m</div>
                              <div><strong>{isAr ? 'الارتداد الجانبي:' : 'Side Setbacks:'}</strong> {project.gisData.setbacks.sideLeft}m / {project.gisData.setbacks.sideRight}m</div>
                              <div><strong>{isAr ? 'المهندس المقيم:' : 'Resident Eng.:'}</strong> {project.residentEngineer}</div>
                              <div><strong>{isAr ? 'تاريخ انتهاء الرخصة:' : 'Permit Expiry:'}</strong> <span dir="ltr">{project.permitExpiryDate}</span></div>
                            </div>
                          </div>
                        </div>
                      )}

                    <div style={{ fontSize: '10.5px', color: '#475569', borderTop: '1px solid #CBD5E1', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <span>
                        {isAr
                          ? 'مستند أرشيفي مرجعي مولّد من بيانات المشروع الحية — يمكنك إرفاق ملف PDF/DWG الفعلي لاستبدال المعاينة.'
                          : 'Live reference sheet generated from project data — attach a PDF/Image/DXF file anytime.'}
                      </span>
                      <span dir="ltr" style={{ fontFamily: 'monospace' }}>{company?.licenseNumber || project.permitNumber}</span>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: '#475569' }}>
                    {isAr
                      ? 'سجل وثيقة معتمد. يمكنك إرفاق ملف PDF أو صورة للمعاينة المباشرة.'
                      : 'Verified archive record. Attach a PDF or image file to inspect it inline.'}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
