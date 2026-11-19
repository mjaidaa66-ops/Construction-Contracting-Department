import React, { useEffect, useState } from 'react';
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
  TakeoffTool,
} from '../../types/bunyan';
import { ensurePdfWorkerConfigured } from '../../utils/pdfWorkerConfig';
import { generateSampleEngineeringPdfBytes } from '../../utils/samplePdfGenerator';
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
  onAddPoint: (pt: PdfPoint) => void;
  onFinishShape: () => void;
  onSelectMeasurement: (id: string | null) => void;
  onCalibrateTwoPoints: (p1: PdfPoint, p2: PdfPoint) => void;
  onPageChanged?: (pageNum: number) => void;
}

export const EngineeringPdfViewer: React.FC<EngineeringPdfViewerProps> = ({
  lang,
  activeTool,
  activeColor,
  measurements,
  selectedMeasurementId,
  draftPoints,
  onAddPoint,
  onFinishShape,
  onSelectMeasurement,
  onCalibrateTwoPoints,
  onPageChanged,
}) => {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState<string>('BNY-2026-001_Engineering_Set.pdf');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomScale, setZoomScale] = useState(1.1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [loading, setLoading] = useState(true);
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
    async function loadSamplePdf() {
      setLoading(true);
      setError(null);
      try {
        const pdfjs = ensurePdfWorkerConfigured();
        const bytes = generateSampleEngineeringPdfBytes();
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (active) {
          setPdfDoc(doc);
          setCurrentPage(1);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to initialize PDF engine');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSamplePdf();
    return () => {
      active = false;
    };
  }, []);

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const pdfjs = ensurePdfWorkerConfigured();
      const buffer = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
      setPdfDoc(doc);
      setFileName(file.name);
      setCurrentPage(1);
      onPageChanged?.(1);
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
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111A2C] overflow-hidden flex flex-col h-[560px]">
      {/* PDF Viewer Top Bar */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono font-semibold text-[#B4863C] truncate max-w-[220px]">
            {fileName}
          </span>
          {pdfDoc && (
            <span className="text-slate-500 font-mono tabular-nums">
              · {lang === 'ar' ? 'صفحة' : 'Page'} {currentPage}/{pdfDoc.numPages}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono tabular-nums px-1.5">{Math.round(zoomScale * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoomScale((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))))}
            className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-mono"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>{rotation}°</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B4863C] text-white font-semibold hover:bg-[#9E7330] cursor-pointer ms-1">
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
          ) : null}
        </div>
      </div>
    </div>
  );
};
