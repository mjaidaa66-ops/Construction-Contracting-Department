import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AlertCircle, CloudDownload, FileWarning, Loader2 } from 'lucide-react';
import { resolveSheetBinaryUrl } from '../../services/cloudSyncService';
import type { Language, TakeoffSheet } from '../../types/bunyan';
import { disposePdfDocumentProxy, ensurePdfWorkerConfigured } from '../../utils/pdfWorkerConfig';
import { sanitizeSvgMarkup } from '../../utils/sanitize';
import { dataUrlOrBlobToUint8Array } from '../../utils/takeoffSheetLoader';

interface SheetBackdropRendererProps {
  sheet: TakeoffSheet;
  lang: Language;
  onPdfLoaded?: (totalPages: number) => void;
}

export const SheetBackdropRenderer: React.FC<SheetBackdropRendererProps> = ({
  sheet,
  lang,
  onPdfLoaded,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(sheet.pdfDataUrl || null);
  const [fetchingFromCloud, setFetchingFromCloud] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const onPdfLoadedRef = useRef(onPdfLoaded);
  onPdfLoadedRef.current = onPdfLoaded;
  const sanitizedSvg = useMemo(
    () => (sheet.svgContent ? sanitizeSvgMarkup(sheet.svgContent) : ''),
    [sheet.svgContent]
  );

  // Resolve sheet binary from local cache or reassemble from Firestore DocumentManifest + DocumentChunk
  useEffect(() => {
    if (sheet.sheetType === 'blueprint_svg') {
      setResolvedUrl(null);
      setFetchingFromCloud(false);
      return;
    }

    if (sheet.pdfDataUrl) {
      setResolvedUrl(sheet.pdfDataUrl);
      setFetchingFromCloud(false);
      return;
    }

    let cancelled = false;
    setFetchingFromCloud(true);
    setRenderError(null);

    resolveSheetBinaryUrl(sheet)
      .then((url) => {
        if (!cancelled) {
          setResolvedUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRenderError(
            err instanceof Error
              ? err.message
              : lang === 'ar'
              ? 'تعذر استرجاع المخطط من السحابة.'
              : 'Failed to download chunked drawing from cloud.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFetchingFromCloud(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sheet.id, sheet.sheetType, sheet.pdfDataUrl, sheet.pdfManifestId, lang]);

  const activePdfDocRef = useRef<PDFDocumentProxy | null>(null);

  // Load PDFDocumentProxy whenever resolvedUrl changes for a pdf_document sheet
  useEffect(() => {
    if (sheet.sheetType !== 'pdf_document' || !resolvedUrl) {
      if (activePdfDocRef.current) {
        void disposePdfDocumentProxy(activePdfDocRef.current);
        activePdfDocRef.current = null;
      }
      setPdfDoc(null);
      setLoadingPdf(false);
      onPdfLoadedRef.current?.(1);
      return;
    }

    let cancelled = false;
    setLoadingPdf(true);
    setRenderError(null);

    async function loadDocument() {
      try {
        const pdfjs = ensurePdfWorkerConfigured();
        const bytes = await dataUrlOrBlobToUint8Array(resolvedUrl!);
        if (cancelled) return;
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) {
          await disposePdfDocumentProxy(doc);
          return;
        }
        if (activePdfDocRef.current && activePdfDocRef.current !== doc) {
          void disposePdfDocumentProxy(activePdfDocRef.current);
        }
        activePdfDocRef.current = doc;
        setPdfDoc(doc);
        onPdfLoadedRef.current?.(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setPdfDoc(null);
          setRenderError(
            err instanceof Error
              ? err.message
              : lang === 'ar'
              ? 'تعذر قراءة ملف PDF المرفوع.'
              : 'Unable to parse uploaded PDF document.'
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPdf(false);
        }
      }
    }

    loadDocument();
    return () => {
      cancelled = true;
      if (activePdfDocRef.current) {
        void disposePdfDocumentProxy(activePdfDocRef.current);
        activePdfDocRef.current = null;
      }
    };
  }, [sheet.id, sheet.sheetType, resolvedUrl, lang]);

  // Render active page onto high-DPI canvas sized to sheet coordinates
  useEffect(() => {
    if (sheet.sheetType !== 'pdf_document' || !pdfDoc) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    async function renderActivePage() {
      if (!pdfDoc) return;
      const safePageNum = Math.min(Math.max(1, sheet.pageNumber || 1), pdfDoc.numPages);
      try {
        const page = await pdfDoc.getPage(safePageNum);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetScale = Math.max(1.5, sheet.width / Math.max(1, baseViewport.width));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: targetScale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        });
        await renderTask.promise;
      } catch (err) {
        if (!cancelled && err && (err as { name?: string }).name !== 'RenderingCancelledException') {
          setRenderError(
            err instanceof Error
              ? err.message
              : lang === 'ar'
              ? 'تعذر عرض صفحة PDF.'
              : 'Failed to render PDF page.'
          );
        }
      }
    }

    renderActivePage();
    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore cancellation
        }
      }
    };
  }, [pdfDoc, sheet.sheetType, sheet.pageNumber, sheet.width, lang]);

  // 1. Default Built-in Blueprint SVG
  if (sheet.sheetType === 'blueprint_svg' && sanitizedSvg) {
    return (
      <div
        className="w-full h-full pointer-events-none select-none"
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    );
  }

  // Cloud chunk reassembly loading state
  if (fetchingFromCloud) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0B1324] text-slate-200 text-xs gap-2 p-6 text-center">
        <CloudDownload className="w-6 h-6 text-[#38BDF8] animate-pulse" />
        <span>
          {lang === 'ar'
            ? 'جارٍ استرجاع المخطط السحابي المقسّم من Firestore...'
            : 'Reassembling chunked blueprint from Firestore...'}
        </span>
      </div>
    );
  }

  // 2. Uploaded Raster Image (PNG, JPG, WebP, SVG)
  if (sheet.sheetType === 'raster_image') {
    if (!resolvedUrl) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs gap-2 p-6 text-center">
          <FileWarning className="w-6 h-6 text-[#B4863C]" />
          <span>
            {lang === 'ar'
              ? 'بيانات الصورة غير متوفرة حالياً — أعد رفع الملف أو تأكد من الاتصال بالسحابة.'
              : 'Raster image data unavailable — please re-upload or sync from cloud.'}
          </span>
        </div>
      );
    }
    return (
      <img
        src={resolvedUrl}
        alt={lang === 'ar' ? sheet.titleAr : sheet.title}
        className="w-full h-full object-fill pointer-events-none select-none block bg-white"
        draggable={false}
      />
    );
  }

  // 3. Uploaded PDF Document (pdfjs-dist high-DPI canvas)
  if (sheet.sheetType === 'pdf_document') {
    if (!resolvedUrl) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs gap-2 p-6 text-center">
          <FileWarning className="w-6 h-6 text-[#B4863C]" />
          <span>
            {lang === 'ar'
              ? 'بيانات ملف PDF غير متوفرة — أعد رفع المخطط أو اضغط مزامنة.'
              : 'PDF binary data unavailable — please re-upload or sync from cloud.'}
          </span>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full bg-white pointer-events-none select-none">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {loadingPdf && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B1324]/80 text-slate-200 text-xs gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#B4863C]" />
            <span>
              {lang === 'ar' ? 'جارٍ معالجة ورسم ملف PDF الهندسي...' : 'Rendering PDF blueprint...'}
            </span>
          </div>
        )}
        {renderError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-rose-400 text-xs gap-2 p-6 text-center">
            <AlertCircle className="w-6 h-6" />
            <span>{renderError}</span>
          </div>
        )}
      </div>
    );
  }

  // Fallback for legacy sheets containing svgContent
  if (sanitizedSvg) {
    return (
      <div
        className="w-full h-full pointer-events-none select-none"
        dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
      />
    );
  }

  return null;
};
