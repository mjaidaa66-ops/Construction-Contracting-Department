import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let configured = false;

export function ensurePdfWorkerConfigured(): typeof pdfjsLib {
  if (!configured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    configured = true;
  }
  return pdfjsLib;
}

export async function disposePdfDocumentProxy(
  doc: PDFDocumentProxy | null | undefined
): Promise<void> {
  if (!doc) return;
  try {
    await doc.cleanup();
  } catch {
    // ignore cleanup errors on already-disposed documents
  }
  const maybeDestroy = (doc as unknown as { destroy?: () => Promise<void> }).destroy;
  if (typeof maybeDestroy === 'function') {
    try {
      await maybeDestroy.call(doc);
    } catch {
      // ignore destroy errors
    }
  }
}
