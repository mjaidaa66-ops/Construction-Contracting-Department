import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  FileUp,
  Loader2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  Language,
  PdfBoxOrigin,
  PdfPoint,
  TakeoffMeasurement,
  TakeoffSheet,
  TakeoffTool,
} from '../../types/bunyan';
import { resolveSheetBinaryUrl } from '../../services/cloudSyncService';
import { disposePdfDocumentProxy, ensurePdfWorkerConfigured } from '../../utils/pdfWorkerConfig';
import { dataUrlOrBlobToUint8Array } from '../../utils/takeoffSheetLoader';
import { PdfCanvasSheet } from './PdfCanvasSheet';
import { PdfPageRenderer } from './PdfPageRenderer';
import { PdfThumbnailSidebar } from './PdfThumbnailSidebar';

interface EngineeringPdfViewerProps {
  lang: Language;
  activeTool: TakeoffTool;
  activeColor: string;
  measurements: TakeoffMeasurement[];
  selectedMeasurementId: string | null;
  draftPoints: PdfPoint[];
  uploadedPdfSheet?: TakeoffSheet | null;
  currentScaleLabel?: string;
  currentPpm?: number;
  isCalibrated?: boolean;
  onAddPoint: (pt: PdfPoint) => void;
  onFinishShape: () => void;
  onSelectMeasurement: (id: string | null) => void;
  onCalibrateTwoPoints: (p1: PdfPoint, p2: PdfPoint) => void;
  onPageChanged?: (pageNum: number) => void;
  onPdfUploadedSheet?: (file: File, totalPages: number) => Promise<void> | void;
}

export const EngineeringPdfViewer: React.FC<EngineeringPdfViewerProps> = ({
  lang,
  activeTool,
  activeColor,
  measurements,
  selectedMeasurementId,
  draftPoints,
  uploadedPdfSheet = null,
  currentScaleLabel,
  currentPpm,
  isCalibrated = false,
  onAddPoint,
  onFinishShape,
  onSelectMeasurement,
  onCalibrateTwoPoints,
  onPageChanged,
  onPdfUploadedSheet,
}) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageMetrics, setPageMetrics] = useState<{
    box: PdfBoxOrigin;
    viewportWidth: number;
    viewportHeight: number;
  }>({
    box: { x: 0, y: 0, width: 1190.55, height: 841.89, userUnit: 1, rotation: 0 },
    viewportWidth: 1190.55 * 1.1,
    viewportHeight: 841.89 * 1.1,
  });

  useEffect(() => {
    let active = true;
    async function loadPdfDocument() {
      if (!uploadedPdfSheet) {
        if (pdfDocRef.current) {
          void disposePdfDocumentProxy(pdfDocRef.current);
          pdfDocRef.current = null;
        }
        setPdfDoc(null);
        setFileName('');
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const pdfjs = ensurePdfWorkerConfigured();
        const resolvedPdfUrl = uploadedPdfSheet.pdfDataUrl || (await resolveSheetBinaryUrl(uploadedPdfSheet));
        if (!resolvedPdfUrl) {
          throw new Error(
            lang === 'ar'
              ? 'بيانات ملف PDF السحابية غير متوفرة حالياً — يرجى إعادة المزامنة أو فتح الملف مجدداً.'
              : 'Synced PDF binary is unavailable — please sync or reload the PDF file.'
          );
        }
        const bytes = await dataUrlOrBlobToUint8Array(resolvedPdfUrl);
        const nextTitle = `${uploadedPdfSheet.title || 'Uploaded_Drawing'}.pdf`;
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (!active) {
          await disposePdfDocumentProxy(doc);
          return;
        }
        if (pdfDocRef.current && pdfDocRef.current !== doc) {
          void disposePdfDocumentProxy(pdfDocRef.current);
        }
        pdfDocRef.current = doc;
        setPdfDoc(doc);
        setFileName(nextTitle);
        const startPage = Math.min(
          Math.max(1, uploadedPdfSheet?.pageNumber || 1),
          Math.max(1, doc.numPages)
        );
        setCurrentPage(startPage);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to initialize PDF engine');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadPdfDocument();
    return () => {
      active = false;
      if (pdfDocRef.current) {
        void disposePdfDocumentProxy(pdfDocRef.current);
        pdfDocRef.current = null;
      }
    };
  }, [uploadedPdfSheet?.id, uploadedPdfSheet?.pdfDataUrl, uploadedPdfSheet?.pdfManifestId, lang]);

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const pdfjs = ensurePdfWorkerConfigured();
      const buffer = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      if (pdfDocRef.current && pdfDocRef.current !== doc) {
        void disposePdfDocumentProxy(pdfDocRef.current);
      }
      pdfDocRef.current = doc;
      setPdfDoc(doc);
      setFileName(file.name);
      setCurrentPage(1);
      onPageChanged?.(1);
      if (onPdfUploadedSheet) {
        await onPdfUploadedSheet(file, doc.numPages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PDF file');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const handleSelectPage = (p: number) => {
    setCurrentPage(p);
    onPageChanged?.(p);
  };

  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] overflow-hidden flex flex-col h-[620px]">
      {/* PDF Viewer Top Bar */}
      <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-semibold text-[#B4863C] truncate max-w-[220px]">
            {fileName || (lang === 'ar' ? 'لم يتم تحميل ملف PDF' : 'No PDF Loaded')}
          </span>
          {pdfDoc && (
            <span className="text-[var(--text-muted)] font-mono tabular-nums">
              · {lang === 'ar' ? 'صفحة' : 'Page'} {currentPage}/{pdfDoc.numPages}
            </span>
          )}
          {currentScaleLabel && (
            <span
              className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                isCalibrated
                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              }`}
            >
              {currentScaleLabel}
              {typeof currentPpm === 'number' ? ` · ${currentPpm.toFixed(1)} u/m` : ''}
              {!isCalibrated ? (lang === 'ar' ? ' · غير معاير' : ' · Uncalibrated') : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
            className="p-1.5 rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono tabular-nums px-1.5 text-[var(--text-primary)]">{Math.round(zoomScale * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
            className="p-1.5 rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] font-mono"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{rotation}°</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330] cursor-pointer ms-1 transition-colors">
            <FileUp className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'فتح ملف PDF' : 'Load PDF'}</span>
            <input type="file" accept=".pdf,application/pdf" onChange={handleUploadPdf} className="hidden" />
          </label>
        </div>
      </div>

      {/* Main Body: Thumbnail Sidebar + Scrollable PDF Page & SVG Overlay */}
      <div className="flex-1 flex overflow-hidden">
        {pdfDoc && (
          <PdfThumbnailSidebar
            pdfDoc={pdfDoc}
            currentPage={currentPage}
            onSelectPage={handleSelectPage}
            lang={lang}
          />
        )}

        <div className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-950 p-6 flex items-start justify-center">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 my-auto">
              <Loader2 className="w-5 h-5 animate-spin text-[#B4863C]" />
              <span>{lang === 'ar' ? 'جاري تشغيل محرك PDF الهندسي...' : 'Rendering Engineering PDF...'}</span>
            </div>
          ) : error ? (
            <div className="text-xs text-rose-500 font-mono my-auto">{error}</div>
          ) : pdfDoc ? (
            <div
              className="relative shrink-0 shadow-lg"
              style={{
                width: `${pageMetrics.viewportWidth}px`,
                height: `${pageMetrics.viewportHeight}px`,
              }}
            >
              <PdfPageRenderer
                pdfDoc={pdfDoc}
                pageNumber={currentPage}
                zoomScale={zoomScale}
                rotation={rotation}
                onPageMetrics={setPageMetrics}
              />
              <PdfCanvasSheet
                width={pageMetrics.viewportWidth}
                height={pageMetrics.viewportHeight}
                activeTool={activeTool}
                activeColor={activeColor}
                measurements={measurements}
                selectedMeasurementId={selectedMeasurementId}
                draftPoints={draftPoints}
                pdfMode={{
                  box: pageMetrics.box,
                  zoomScale,
                  viewportRotation: rotation,
                }}
                onAddPoint={onAddPoint}
                onFinishShape={onFinishShape}
                onSelectMeasurement={onSelectMeasurement}
                onCalibrateTwoPoints={onCalibrateTwoPoints}
              />
            </div>
          ) : (
            <div className="my-auto text-center space-y-3 max-w-md px-4">
              <FileUp className="w-10 h-10 text-[#B4863C] mx-auto" />
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {lang === 'ar' ? 'لا يوجد ملف PDF مفتوح حالياً' : 'No PDF Drawing Loaded'}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lang === 'ar'
                  ? 'اختر ملف مخطط هندسي بصيغة PDF من جهازك لفتحه ومعايرة المقياس وحساب الكميات مباشرة.'
                  : 'Select an architectural or structural PDF file to view, calibrate scale, and perform 2D takeoff.'}
              </p>
              <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B4863C] text-white text-xs font-semibold hover:bg-[#9E7330] cursor-pointer transition-colors">
                <FileUp className="w-4 h-4" />
                <span>{lang === 'ar' ? 'اختيار ملف PDF' : 'Load PDF File'}</span>
                <input type="file" accept=".pdf,application/pdf" onChange={handleUploadPdf} className="hidden" />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
