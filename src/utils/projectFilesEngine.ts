import * as XLSX from 'xlsx';
import type { CompanyProfile, Language, Project, ProjectDocument } from '../types/bunyan';
import { formatCsvCell } from './reportExportEngine';
import { sanitizePreviewBinaryUrl, sanitizeSvgMarkup } from './sanitize';

export interface ProjectFilesBundle {
  format: 'bunyan-project-files-v1';
  exportedAt: string;
  projectCode: string;
  projectName: string;
  documents: Array<{
    id: string;
    name: string;
    category: ProjectDocument['category'];
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    dataUrl?: string;
  }>;
}

export type InlineDocRenderKind =
  | 'pdf'
  | 'image'
  | 'svg'
  | 'text'
  | 'seeded_official'
  | 'unsupported_binary';

export function inferMimeTypeFromFilename(fileName: string, rawMime?: string): string {
  if (rawMime && rawMime !== 'application/octet-stream') return rawMime;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  if (lower.endsWith('.dxf')) return 'application/dxf';
  if (lower.endsWith('.dwg')) return 'application/acad';
  if (lower.endsWith('.ifc')) return 'application/x-step';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return rawMime || 'application/octet-stream';
}

export function inferDocCategoryFromFilename(fileName: string): ProjectDocument['category'] {
  const lower = fileName.toLowerCase();
  if (lower.includes('contract') || lower.includes('عقد')) return 'contract';
  if (lower.includes('permit') || lower.includes('رخص')) return 'permit';
  if (lower.includes('gis') || lower.includes('plot') || lower.includes('قطعة')) return 'gis';
  if (lower.includes('mep') || lower.includes('sewa') || lower.includes('elec')) return 'mep';
  if (lower.includes('struct') || lower.includes('إنشائ') || lower.endsWith('.dwg') || lower.endsWith('.ifc')) {
    return 'structural';
  }
  return 'architectural';
}

export function detectInlineDocRenderKind(
  docItem: ProjectDocument,
  rawBinaryUrl: string | null
): InlineDocRenderKind {
  if (!rawBinaryUrl) return 'seeded_official';
  const mime = (docItem.mimeType || '').toLowerCase();
  const name = (docItem.name || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf') || rawBinaryUrl.startsWith('data:application/pdf')) {
    return 'pdf';
  }
  if (mime === 'image/svg+xml' || name.endsWith('.svg') || rawBinaryUrl.startsWith('data:image/svg+xml')) {
    return 'svg';
  }
  if (
    mime.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif)$/i.test(name) ||
    /^data:image\/(png|jpeg|jpg|webp|gif)/i.test(rawBinaryUrl)
  ) {
    return 'image';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/dxf' ||
    mime === 'application/x-step' ||
    /\.(txt|csv|json|dxf|ifc|md|xml)$/i.test(name)
  ) {
    return 'text';
  }
  return 'unsupported_binary';
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const cleaned = base64.replace(/\s+/g, '');
  const binaryStr = atob(cleaned);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export function decodeDataUrlAsUtf8Text(dataUrl: string): string {
  try {
    if (dataUrl.startsWith('data:') && !dataUrl.includes(';base64,')) {
      const commaIdx = dataUrl.indexOf(',');
      return decodeURIComponent(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    }
    const bytes = dataUrlToUint8Array(dataUrl);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

export function extractSanitizedSvgFromDataUrl(dataUrl: string): string {
  const raw = decodeDataUrlAsUtf8Text(dataUrl);
  return sanitizeSvgMarkup(raw);
}

export function isSafeExportBinaryDataUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  if (sanitizePreviewBinaryUrl(url)) return true;
  // Allow safe encoded non-HTML document binaries for explicit user export/download
  return /^data:(application\/(json|dxf|acad|x-step|octet-stream|vnd\.openxmlformats-officedocument\.[a-z.]+)|text\/(plain|csv)|image\/svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/i.test(
    url.trim()
  );
}

export function buildProjectFilesBundle(params: {
  project: Project;
  documents: ProjectDocument[];
  binariesByDocId: Record<string, string>;
}): ProjectFilesBundle {
  const { project, documents, binariesByDocId } = params;
  return {
    format: 'bunyan-project-files-v1',
    exportedAt: new Date().toISOString(),
    projectCode: project.code,
    projectName: project.name,
    documents: documents.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt,
      dataUrl: binariesByDocId[d.id] || d.localDataUrl,
    })),
  };
}

export function parseProjectFilesBundle(raw: unknown): {
  ok: true;
  bundle: ProjectFilesBundle;
} | {
  ok: false;
  error: string;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid project files bundle JSON object.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.documents)) {
    return { ok: false, error: 'Bundle does not contain a documents array.' };
  }

  const allowedCategories = new Set<ProjectDocument['category']>([
    'permit',
    'structural',
    'architectural',
    'mep',
    'contract',
    'gis',
  ]);

  const cleanDocs: ProjectFilesBundle['documents'] = [];
  for (const item of obj.documents.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 250) : '';
    if (!name) continue;
    const rawCat = typeof rec.category === 'string' ? rec.category : 'architectural';
    const category = allowedCategories.has(rawCat as ProjectDocument['category'])
      ? (rawCat as ProjectDocument['category'])
      : 'architectural';
    const mimeType = inferMimeTypeFromFilename(
      name,
      typeof rec.mimeType === 'string' ? rec.mimeType : undefined
    );
    const rawUrl = typeof rec.dataUrl === 'string' ? rec.dataUrl : undefined;
    const safeDataUrl = rawUrl && isSafeExportBinaryDataUrl(rawUrl) ? rawUrl : undefined;
    cleanDocs.push({
      id:
        typeof rec.id === 'string' && rec.id.trim()
          ? rec.id.trim().slice(0, 120)
          : `doc-${Date.now()}-${cleanDocs.length}`,
      name,
      category,
      mimeType,
      sizeBytes: Math.max(0, Number(rec.sizeBytes) || (safeDataUrl ? safeDataUrl.length : 1024)),
      uploadedAt:
        typeof rec.uploadedAt === 'string' && rec.uploadedAt.trim()
          ? rec.uploadedAt.trim().slice(0, 40)
          : new Date().toISOString().slice(0, 10),
      dataUrl: safeDataUrl,
    });
  }

  if (cleanDocs.length === 0) {
    return { ok: false, error: 'No valid documents found inside the bundle.' };
  }

  return {
    ok: true,
    bundle: {
      format: 'bunyan-project-files-v1',
      exportedAt:
        typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      projectCode:
        typeof obj.projectCode === 'string' ? obj.projectCode.slice(0, 60) : 'PROJECT',
      projectName:
        typeof obj.projectName === 'string' ? obj.projectName.slice(0, 200) : 'Project',
      documents: cleanDocs,
    },
  };
}

export function buildProjectDocumentsIndexCsv(
  project: Project,
  documents: ProjectDocument[],
  lang: Language
): string {
  const isAr = lang === 'ar';
  const headers = isAr
    ? ['كود المشروع', 'اسم المشروع', 'اسم الملف', 'التصنيف', 'الصيغة', 'الحجم (KB)', 'تاريخ الرفع', 'المزامنة السحابية']
    : ['Project Code', 'Project Name', 'File Name', 'Category', 'MIME Type', 'Size (KB)', 'Uploaded At', 'Cloud Sync'];

  const lines = [headers.map(formatCsvCell).join(',')];
  for (const doc of documents) {
    lines.push(
      [
        project.code,
        isAr ? project.name : project.nameEn,
        doc.name,
        doc.category,
        doc.mimeType,
        Number((doc.sizeBytes / 1024).toFixed(1)),
        doc.uploadedAt,
        doc.manifestId ? (isAr ? 'مجزأ ومزامن' : 'Cloud Chunked') : isAr ? 'محلي / مرجعي' : 'Local / Reference',
      ]
        .map(formatCsvCell)
        .join(',')
    );
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export function exportProjectDocumentsToExcel(
  project: Project,
  documents: ProjectDocument[],
  company: CompanyProfile,
  lang: Language
): void {
  const isAr = lang === 'ar';
  const wb = XLSX.utils.book_new();
  const rows: Array<Array<string | number>> = [
    [isAr ? 'المنظمة — سجل ملفات ومستندات المشروع' : 'ORGANIZATION — PROJECT DOCUMENTS REGISTER', ''],
    [isAr ? 'الشركة' : 'Company', isAr ? company.nameAr : company.nameEn],
    [isAr ? 'كود المشروع' : 'Project Code', project.code],
    [isAr ? 'اسم المشروع' : 'Project Name', isAr ? project.name : project.nameEn],
    [isAr ? 'عدد المستندات' : 'Documents Count', documents.length],
    [],
    isAr
      ? ['#', 'اسم المستند', 'التصنيف', 'النوع', 'الحجم (KB)', 'تاريخ الرفع', 'معرّف السحابة']
      : ['#', 'Document Name', 'Category', 'MIME Type', 'Size (KB)', 'Uploaded At', 'Manifest ID'],
  ];

  documents.forEach((doc, idx) => {
    rows.push([
      idx + 1,
      doc.name,
      doc.category,
      doc.mimeType,
      Number((doc.sizeBytes / 1024).toFixed(1)),
      doc.uploadedAt,
      doc.manifestId || '—',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 42 },
    { wch: 16 },
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, isAr ? 'مستندات المشروع' : 'Project Files');
  const safeCode = (project.code || project.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `Bunyan_Files_${safeCode}.xlsx`);
}

const LEGACY_SEEDED_DOC_IDS = new Set([
  'doc-1793559184751-hyo44',
  'DOC-1794636223181',
]);

export function isSeededDemoDocument(doc: ProjectDocument): boolean {
  if (!doc || typeof doc.id !== 'string') return false;
  // Never remove a document that has an actual uploaded/chunked file attached
  if (doc.localDataUrl || doc.manifestId) return false;
  if (/^doc-proj-\d+-\d+$/.test(doc.id)) return true;
  if (LEGACY_SEEDED_DOC_IDS.has(doc.id)) return true;
  return false;
}

export function purgeSeededDemoDocuments(projects: Project[]): {
  projects: Project[];
  removedCount: number;
} {
  let removedCount = 0;
  const cleaned = projects.map((proj) => {
    const docs = proj.documents || [];
    if (docs.length === 0) return proj;
    const kept = docs.filter((d) => !isSeededDemoDocument(d));
    if (kept.length === docs.length) return proj;
    removedCount += docs.length - kept.length;
    return {
      ...proj,
      documents: kept,
    };
  });
  return { projects: cleaned, removedCount };
}

