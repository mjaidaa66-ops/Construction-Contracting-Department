import React, { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Language } from '../../types/bunyan';

interface PdfThumbnailSidebarProps {
  pdfDoc: PDFDocumentProxy;
  currentPage: number;
  onSelectPage: (pageNum: number) => void;
  lang: Language;
}

const ThumbnailItem: React.FC<{
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  onSelect: () => void;
}> = ({ pdfDoc, pageNumber, isActive, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function drawThumb() {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;
      const vp = page.getViewport({ scale: 0.16 });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    }
    drawThumb();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full p-2 rounded-lg border text-center transition-colors ${
        isActive
          ? 'border-[#B4863C] bg-[#B4863C]/10'
          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/50'
      }`}
    >
      <canvas ref={canvasRef} className="mx-auto rounded border border-slate-200 bg-white max-w-full" />
      <div className="mt-1.5 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
        P.{pageNumber}
      </div>
    </button>
  );
};

export const PdfThumbnailSidebar: React.FC<PdfThumbnailSidebarProps> = ({
  pdfDoc,
  currentPage,
  onSelectPage,
  lang,
}) => {
  const pages = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

  return (
    <div className="w-36 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A] flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
        {lang === 'ar' ? `الصفحات (${pdfDoc.numPages})` : `Pages (${pdfDoc.numPages})`}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {pages.map((p) => (
          <ThumbnailItem
            key={p}
            pdfDoc={pdfDoc}
            pageNumber={p}
            isActive={currentPage === p}
            onSelect={() => onSelectPage(p)}
          />
        ))}
      </div>
    </div>
  );
};
