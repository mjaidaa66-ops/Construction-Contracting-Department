import React, { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfBoxOrigin } from '../../types/bunyan';

interface PdfPageRendererProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  zoomScale: number;
  rotation: 0 | 90 | 180 | 270;
  onPageMetrics: (metrics: {
    box: PdfBoxOrigin;
    viewportWidth: number;
    viewportHeight: number;
  }) => void;
}

export const PdfPageRenderer: React.FC<PdfPageRendererProps> = ({
  pdfDoc,
  pageNumber,
  zoomScale,
  rotation,
  onPageMetrics,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metricsCbRef = useRef(onPageMetrics);
  metricsCbRef.current = onPageMetrics;

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    async function renderPage() {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;

      const view = page.view; // [x1, y1, x2, y2] MediaBox/CropBox
      const pageBaseRotation = ((page.rotate || 0) % 360) as 0 | 90 | 180 | 270;
      const effectiveRot = (((pageBaseRotation + rotation) % 360) as 0 | 90 | 180 | 270);
      const viewport = page.getViewport({ scale: zoomScale, rotation: effectiveRot });

      const box: PdfBoxOrigin = {
        x: view[0],
        y: view[1],
        width: view[2] - view[0],
        height: view[3] - view[1],
        userUnit: page.userUnit || 1,
        rotation: pageBaseRotation,
      };

      metricsCbRef.current({
        box,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      });

      try {
        await renderTask.promise;
      } catch (err) {
        if (!cancelled) {
          console.warn('PDF render interrupted:', err);
        }
      }
    }

    renderPage();

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
  }, [pdfDoc, pageNumber, zoomScale, rotation]);

  return <canvas ref={canvasRef} className="block bg-white shadow-sm" />;
};
