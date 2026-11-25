import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_PROJECTS } from '../src/data/uaeSeedData';
import type { ProjectDocument } from '../src/types/bunyan';
import {
  buildProjectDocumentsIndexCsv,
  buildProjectFilesBundle,
  dataUrlToUint8Array,
  decodeDataUrlAsUtf8Text,
  detectInlineDocRenderKind,
  extractSanitizedSvgFromDataUrl,
  inferDocCategoryFromFilename,
  inferMimeTypeFromFilename,
  isSafeExportBinaryDataUrl,
  isSeededDemoDocument,
  parseProjectFilesBundle,
  purgeSeededDemoDocuments,
} from '../src/utils/projectFilesEngine';

function toBase64DataUrl(mime: string, content: string): string {
  return `data:${mime};base64,${Buffer.from(content, 'utf8').toString('base64')}`;
}

describe('Project Files Import/Export & Inline Preview Engine', () => {
  it('infers MIME types and document categories accurately from engineering filenames', () => {
    assert.equal(inferMimeTypeFromFilename('permit-2026.pdf', ''), 'application/pdf');
    assert.equal(inferMimeTypeFromFilename('foundation.dxf', 'application/octet-stream'), 'application/dxf');
    assert.equal(inferMimeTypeFromFilename('facade.svg', ''), 'image/svg+xml');
    assert.equal(inferMimeTypeFromFilename('boq.xlsx', ''), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    assert.equal(inferDocCategoryFromFilename('Municipality_Permit.pdf'), 'permit');
    assert.equal(inferDocCategoryFromFilename('Main_Contract_Signed.pdf'), 'contract');
    assert.equal(inferDocCategoryFromFilename('GIS_Plot_Boundary.json'), 'gis');
    assert.equal(inferDocCategoryFromFilename('SEWA_MEP_Riser.pdf'), 'mep');
    assert.equal(inferDocCategoryFromFilename('Slab_Structural.dwg'), 'structural');
    assert.equal(inferDocCategoryFromFilename('Ground_Floor_Plan.pdf'), 'architectural');
  });

  it('detects inline render modes without forcing browser downloads', () => {
    const baseDoc: ProjectDocument = {
      id: 'd1',
      name: 'Building_Permit.pdf',
      category: 'permit',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      uploadedAt: '2026-11-24',
    };

    assert.equal(detectInlineDocRenderKind(baseDoc, null), 'seeded_official');
    assert.equal(
      detectInlineDocRenderKind(baseDoc, 'data:application/pdf;base64,JVBERi0xLjQ='),
      'pdf'
    );
    assert.equal(
      detectInlineDocRenderKind(
        { ...baseDoc, name: 'site.png', mimeType: 'image/png' },
        'data:image/png;base64,iVBORw0KGgo='
      ),
      'image'
    );
    assert.equal(
      detectInlineDocRenderKind(
        { ...baseDoc, name: 'plot.svg', mimeType: 'image/svg+xml' },
        toBase64DataUrl('image/svg+xml', '<svg></svg>')
      ),
      'svg'
    );
    assert.equal(
      detectInlineDocRenderKind(
        { ...baseDoc, name: 'axis.dxf', mimeType: 'application/dxf' },
        toBase64DataUrl('application/dxf', '0\nSECTION\n2\nENTITIES')
      ),
      'text'
    );
    assert.equal(
      detectInlineDocRenderKind(
        { ...baseDoc, name: 'model.dwg', mimeType: 'application/acad' },
        'data:application/acad;base64,QUMxMDIx'
      ),
      'unsupported_binary'
    );
  });

  it('decodes UTF-8 payloads and sanitizes SVG scripts/event handlers', () => {
    const utf8Text = 'مشروع الشارقة - مخطط الطابق الأرضي';
    const textUrl = toBase64DataUrl('text/plain', utf8Text);
    assert.equal(decodeDataUrlAsUtf8Text(textUrl), utf8Text);
    assert.ok(dataUrlToUint8Array(textUrl).length > 10);

    const dirtySvg =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>';
    const svgUrl = toBase64DataUrl('image/svg+xml', dirtySvg);
    const cleaned = extractSanitizedSvgFromDataUrl(svgUrl);
    assert.ok(cleaned.includes('<rect'));
    assert.equal(cleaned.includes('<script'), false);
    assert.equal(cleaned.includes('onload='), false);
  });

  it('validates exportable data URLs and rejects unsafe HTML payloads', () => {
    assert.equal(isSafeExportBinaryDataUrl('data:application/pdf;base64,JVBERi0xLjQ='), true);
    assert.equal(isSafeExportBinaryDataUrl('data:application/dxf;base64,QUJD'), true);
    assert.equal(isSafeExportBinaryDataUrl('data:text/html;base64,PHNjcmlwdD4='), false);
    assert.equal(isSafeExportBinaryDataUrl('javascript:alert(1)'), false);
  });

  it('builds and parses portable project files bundles while stripping unsafe binary URLs', () => {
    const project = INITIAL_PROJECTS[0];
    const sampleDocs: ProjectDocument[] = [
      {
        id: 'doc-safe-1',
        name: 'Permit_Scan.pdf',
        category: 'permit',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        uploadedAt: '2026-11-24',
      },
      {
        id: 'doc-unsafe-2',
        name: 'Bad_File.txt',
        category: 'contract',
        mimeType: 'text/plain',
        sizeBytes: 64,
        uploadedAt: '2026-11-24',
      },
    ];

    const bundle = buildProjectFilesBundle({
      project,
      documents: sampleDocs,
      binariesByDocId: {
        'doc-safe-1': 'data:application/pdf;base64,JVBERi0xLjQ=',
        'doc-unsafe-2': 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      },
    });

    assert.equal(bundle.format, 'bunyan-project-files-v1');
    assert.equal(bundle.documents.length, 2);

    const parsed = parseProjectFilesBundle(bundle);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.bundle.documents[0].dataUrl, 'data:application/pdf;base64,JVBERi0xLjQ=');
      assert.equal(parsed.bundle.documents[1].dataUrl, undefined);
    }

    const bad = parseProjectFilesBundle({ hello: 'world' });
    assert.equal(bad.ok, false);
  });

  it('generates UTF-8 BOM CSV register with CSV formula-injection neutralization', () => {
    const project = INITIAL_PROJECTS[0];
    const csv = buildProjectDocumentsIndexCsv(
      project,
      [
        {
          id: 'd-inj',
          name: '=CMD("calc")',
          category: 'contract',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedAt: '2026-11-24',
        },
      ],
      'en'
    );

    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes("'=CMD"));
  });

  it('contains zero seeded demo documents in INITIAL_PROJECTS and purges legacy demo records safely', () => {
    const totalSeededDocs = INITIAL_PROJECTS.reduce((acc, p) => acc + p.documents.length, 0);
    assert.equal(totalSeededDocs, 0);

    const dirtyProjects = [
      {
        ...INITIAL_PROJECTS[0],
        documents: [
          {
            id: 'doc-proj-01-1',
            name: 'Dummy_Permit.pdf',
            category: 'permit' as const,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            uploadedAt: '2020-03-15',
          },
          {
            id: 'DOC-1794636223181',
            name: 'كاش فلو.pdf',
            category: 'contract' as const,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            uploadedAt: '2026-11-14',
          },
          {
            id: 'doc-real-upload-99',
            name: 'Real_Site_Drawing.pdf',
            category: 'architectural' as const,
            mimeType: 'application/pdf',
            sizeBytes: 4096,
            uploadedAt: '2026-11-24',
            localDataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
          },
        ],
      },
    ];

    assert.equal(isSeededDemoDocument(dirtyProjects[0].documents[0]), true);
    assert.equal(isSeededDemoDocument(dirtyProjects[0].documents[2]), false);

    const purged = purgeSeededDemoDocuments(dirtyProjects);
    assert.equal(purged.removedCount, 2);
    assert.equal(purged.projects[0].documents.length, 1);
    assert.equal(purged.projects[0].documents[0].id, 'doc-real-upload-99');
  });
});
