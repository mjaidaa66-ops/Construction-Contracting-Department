import type { TakeoffSheet } from '../types/bunyan';
import { ensurePdfWorkerConfigured } from './pdfWorkerConfig';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as Data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

function measureImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 1200,
        height: img.naturalHeight || 850,
      });
    };
    img.onerror = () => reject(new Error('Failed to decode image dimensions'));
    img.src = src;
  });
}

export async function dataUrlOrBlobToUint8Array(src: string): Promise<Uint8Array> {
  if (src.startsWith('data:')) {
    const commaIdx = src.indexOf(',');
    if (commaIdx === -1) {
      throw new Error('Malformed data URL');
    }
    const meta = src.slice(0, commaIdx);
    const body = src.slice(commaIdx + 1);
    if (meta.includes(';base64')) {
      const binary = atob(body);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    const decoded = decodeURIComponent(body);
    return new TextEncoder().encode(decoded);
  }

  const resp = await fetch(src);
  if (!resp.ok) {
    throw new Error(`Unable to fetch drawing resource (${resp.status})`);
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const lower = file.name.toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].some((ext) =>
    lower.endsWith(ext)
  );
}

export async function parseUploadedDrawingFile(
  file: File,
  projectId: string,
  existingSheets: TakeoffSheet[]
): Promise<{ sheet: TakeoffSheet; totalPages: number }> {
  const pdf = isPdfFile(file);
  const image = !pdf && isImageFile(file);

  if (!pdf && !image) {
    throw new Error('Unsupported file format. Please upload a PDF or image (PNG, JPG, WebP, SVG).');
  }

  const dataUrl = await readFileAsDataUrl(file);
  const cleanTitle = file.name.replace(/\.[^/.]+$/, '').trim() || 'Uploaded Blueprint';
  const nextIndex = existingSheets.length + 1;
  const sheetId = `sheet-upload-${Date.now()}`;
  const sheetCode = `UP-${String(nextIndex).padStart(2, '0')}`;

  if (pdf) {
    const pdfjs = ensurePdfWorkerConfigured();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });
    const width = Math.max(400, Math.round(viewport.width));
    const height = Math.max(300, Math.round(viewport.height));

    return {
      totalPages: doc.numPages,
      sheet: {
        id: sheetId,
        projectId,
        code: sheetCode,
        title: cleanTitle,
        titleAr: cleanTitle,
        sheetType: 'pdf_document',
        pageNumber: 1,
        pixelsPerMeter: 40,
        scaleLabel: '1:100 (Uncalibrated)',
        calibrated: false,
        width,
        height,
        pdfDataUrl: dataUrl,
      },
    };
  }

  const dims = await measureImageDimensions(dataUrl);
  return {
    totalPages: 1,
    sheet: {
      id: sheetId,
      projectId,
      code: sheetCode,
      title: cleanTitle,
      titleAr: cleanTitle,
      sheetType: 'raster_image',
      pageNumber: 1,
      pixelsPerMeter: 40,
      scaleLabel: '1:100 (Uncalibrated)',
      calibrated: false,
      width: Math.max(400, Math.round(dims.width)),
      height: Math.max(300, Math.round(dims.height)),
      pdfDataUrl: dataUrl,
    },
  };
}
