import type { TakeoffSheet } from '../types/bunyan';
import { parseDxfContent } from './cadPdfParser';
import { disposePdfDocumentProxy, ensurePdfWorkerConfigured } from './pdfWorkerConfig';

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

export function isDxfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dxf');
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const lower = file.name.toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'].some((ext) =>
    lower.endsWith(ext)
  );
}

function detectScaleHintFromText(text: string): number | null {
  const m = /\b(?:SCALE\s*[:=]?\s*)?1\s*:\s*(20|25|50|75|100|125|150|200|250|500)\b/i.exec(text);
  if (!m) return null;
  const ratio = Number.parseInt(m[1], 10);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export async function parseUploadedDrawingFile(
  file: File,
  projectId: string,
  existingSheets: TakeoffSheet[]
): Promise<{ sheet: TakeoffSheet; totalPages: number }> {
  const pdf = isPdfFile(file);
  const dxf = !pdf && isDxfFile(file);
  const image = !pdf && !dxf && isImageFile(file);

  if (!pdf && !dxf && !image) {
    throw new Error('Unsupported file format. Please upload PDF, ASCII DXF, or an image (PNG, JPG, WebP, SVG).');
  }

  const cleanTitle = file.name.replace(/\.[^/.]+$/, '').trim() || 'Uploaded Blueprint';
  const nextIndex = existingSheets.length + 1;
  const sheetId = `sheet-upload-${Date.now()}`;
  const sheetCode = `UP-${String(nextIndex).padStart(2, '0')}`;

  if (dxf) {
    const text = await file.text();
    if (text.startsWith('AutoCAD Binary DXF')) {
      throw new Error('Binary DXF is not supported directly. Export as ASCII DXF.');
    }
    const parsed = parseDxfContent(text);
    if (parsed.summary.entityCount === 0) {
      throw new Error('DXF file contains 0 vector entities in ENTITIES section.');
    }
    const svgW = 1200;
    const svgH = 850;
    const pad = 80;
    const spanW = Math.max(1, parsed.summary.boundsMeters.widthM);
    const spanH = Math.max(1, parsed.summary.boundsMeters.heightM);
    const pxPerM = Number(Math.min((svgW - pad * 2) / spanW, (svgH - pad * 2) / spanH).toFixed(3));
    const isHeaderCalibrated = parsed.summary.unitSource === 'header' && parsed.summary.insUnitsCode > 0;

    return {
      totalPages: 1,
      sheet: {
        id: sheetId,
        projectId,
        code: sheetCode,
        title: `${cleanTitle} (DXF)`,
        titleAr: `${cleanTitle} (DXF)`,
        sheetType: 'blueprint_svg',
        pageNumber: 1,
        pixelsPerMeter: pxPerM,
        scaleLabel: isHeaderCalibrated
          ? `DXF $INSUNITS=${parsed.summary.insUnitsCode} (${parsed.summary.unitLabel})`
          : 'DXF Uncalibrated (Verify Scale)',
        calibrated: isHeaderCalibrated,
        width: svgW,
        height: svgH,
        svgContent: parsed.summary.svgContent,
      },
    };
  }

  const dataUrl = await readFileAsDataUrl(file);

  if (pdf) {
    const pdfjs = ensurePdfWorkerConfigured();
    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const width = Math.max(400, Math.round(viewport.width));
      const height = Math.max(300, Math.round(viewport.height));
      const totalPages = doc.numPages;

      // Inspect PDF text layer for printed scale ratio (e.g. "SCALE 1:100") while requiring calibration confirmation
      let scaleHint: number | null = null;
      try {
        const textContent = await page.getTextContent();
        const combined = textContent.items
          .map((it) => ('str' in it ? String(it.str) : ''))
          .join(' ');
        scaleHint = detectScaleHintFromText(combined);
      } catch {
        // Text extraction optional; ignore if scanned raster PDF
      }

      const detectedRatio = scaleHint || 100;
      const estimatedPpm = Number((((72 / 0.0254) * 1.5) / detectedRatio).toFixed(2));

      return {
        totalPages,
        sheet: {
          id: sheetId,
          projectId,
          code: sheetCode,
          title: cleanTitle,
          titleAr: cleanTitle,
          sheetType: 'pdf_document',
          pageNumber: 1,
          pixelsPerMeter: estimatedPpm,
          scaleLabel: scaleHint
            ? `1:${scaleHint} Detected (Confirm 2-Pt Calibration)`
            : '1:100 Nominal (Uncalibrated)',
          calibrated: false,
          width,
          height,
          pdfDataUrl: dataUrl,
        },
      };
    } finally {
      await disposePdfDocumentProxy(doc);
    }
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
