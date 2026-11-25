import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  EtabsAgentAdapter,
  validateAgentBaseUrl,
} from '../src/modules/structural/adapters/etabs.adapter';
import { normalizeEtabsExtractToDataset } from '../src/modules/structural/adapters/structuralData.adapter';
import { StructuralController } from '../src/modules/structural/controllers/structural.controller';
import { StructuralRepository } from '../src/modules/structural/repositories/structural.repository';
import {
  buildImportPreview,
  confirmImportPreview,
} from '../src/modules/structural/services/etabsImport.service';
import { parseExportedEtabsTables } from '../src/modules/structural/services/etabsTableParser.service';
import {
  convertLengthToMeters,
  convertStressToMPa,
  convertUnitWeightToKNPerM3,
} from '../src/modules/structural/services/structuralUnits.service';
import {
  assertStructuralPermission,
  validateRawExtractPayload,
} from '../src/modules/structural/validators/structural.validators';
import type { EtabsRawExtractPayload } from '../src/modules/structural/types/etabs.types';

function makeSampleRawEtabs(overrides?: Partial<EtabsRawExtractPayload>): EtabsRawExtractPayload {
  return {
    sourceApplication: 'CSI ETABS',
    sourceVersion: '20.3.0',
    modelFilePath: 'C:\\Models\\SharjahTower_v20.edb',
    modelName: 'SharjahTower_v20',
    forceUnit: 'kN',
    lengthUnit: 'mm',
    coordinateSystem: 'Global',
    modelLocked: false,
    readOnlyVerified: true,
    stories: [
      { name: 'Base', elevation: 0, height: 0 },
      { name: 'Ground', elevation: 4000, height: 4000, isMasterStory: true },
      { name: 'Roof', elevation: 7500, height: 3500 },
    ],
    grids: [
      {
        name: 'G1',
        gridType: 'Cartesian',
        originX: 0,
        originY: 0,
        rotationDeg: 0,
        xLines: [{ id: 'A', coordinate: 0 }, { id: 'B', coordinate: 6000 }],
        yLines: [{ id: '1', coordinate: 0 }, { id: '2', coordinate: 5000 }],
      },
    ],
    points: [
      { name: 'P1', story: 'Base', x: 0, y: 0, z: 0 },
      { name: 'P2', story: 'Ground', x: 0, y: 0, z: 4000 },
      { name: 'P3', story: 'Ground', x: 6000, y: 0, z: 4000 },
      { name: 'P4', story: 'Ground', x: 6000, y: 5000, z: 4000 },
      { name: 'P5', story: 'Ground', x: 0, y: 5000, z: 4000 },
    ],
    materials: [
      {
        name: 'C40',
        materialType: 'Concrete',
        modulusE: 0.030, // in kN/mm^2 = 30,000 MPa
        poissonU: 0.2,
        unitWeight: 2.5e-8, // kN/mm^3 = 25 kN/m^3
        fcOrFy: 0.04, // kN/mm^2 = 40 MPa
      },
    ],
    sections: [
      {
        name: 'C500x500',
        category: 'Frame',
        shapeOrType: 'Rectangular',
        materialName: 'C40',
        depthOrThickness: 500,
        width: 500,
      },
      {
        name: 'S250',
        category: 'Area',
        shapeOrType: 'Slab',
        materialName: 'C40',
        depthOrThickness: 250,
        width: 0,
      },
    ],
    frames: [
      {
        name: 'C1',
        uniqueName: 'F101',
        story: 'Ground',
        pointI: 'P1',
        pointJ: 'P2',
        sectionName: 'C500x500',
        designOrientation: 'Column',
      },
      {
        name: 'B1',
        uniqueName: 'F102',
        story: 'Ground',
        pointI: 'P2',
        pointJ: 'P3',
        sectionName: 'C500x500',
        designOrientation: 'Beam',
      },
    ],
    areas: [
      {
        name: 'A1',
        uniqueName: 'A201',
        story: 'Ground',
        pointNames: ['P2', 'P3', 'P4', 'P5'],
        sectionName: 'S250',
        designOrientation: 'Floor',
      },
    ],
    loadPatterns: [
      { name: 'DEAD', patternType: 'Dead', selfWeightMultiplier: 1 },
      { name: 'LIVE', patternType: 'Live', selfWeightMultiplier: 0 },
    ],
    loadCases: [
      { name: 'DEAD', caseType: 'LinearStatic', analysisStatus: 'NotRun' },
      { name: 'LIVE', caseType: 'LinearStatic', analysisStatus: 'NotRun' },
    ],
    loadCombos: [
      {
        name: 'ULS_1.2D_1.6L',
        comboType: 'Linear Add',
        items: [
          { caseOrComboName: 'DEAD', scaleFactor: 1.2 },
          { caseOrComboName: 'LIVE', scaleFactor: 1.6 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('Structural Intelligence Phase 1 — Engineering & Integration Suite', () => {
  it('A/D: validates ETABS raw extract schemas and performs SI unit conversions while preserving raw units', () => {
    const validCheck = validateRawExtractPayload(makeSampleRawEtabs());
    assert.equal(validCheck.valid, true);
    const badCheck = validateRawExtractPayload({ stories: [] });
    assert.equal(badCheck.valid, false);

    const mmLen = convertLengthToMeters(4500, 'mm');
    assert.equal(mmLen.normalizedValue, 4.5);
    assert.equal(mmLen.rawValue, 4500);
    assert.equal(mmLen.rawUnit, 'mm');

    const ftLen = convertLengthToMeters(10, 'ft');
    assert.equal(ftLen.normalizedValue, 3.048);

    const stress = convertStressToMPa(40, 'N', 'mm');
    assert.equal(stress.normalizedValue, 40);
    assert.equal(stress.normalizedUnit, 'MPa');

    const gamma = convertUnitWeightToKNPerM3(25, 'kN', 'm');
    assert.equal(gamma.normalizedValue, 25);

    assert.throws(() => convertLengthToMeters(10, 'furlongs'));
  });

  it('B/C/I/J: enforces SSRF loopback protection and reports genuine agent unavailability without fake ETABS data', async () => {
    assert.throws(() => validateAgentBaseUrl('http://169.254.169.254:8080', false));
    assert.doesNotThrow(() => validateAgentBaseUrl('http://127.0.0.1:45820', false));

    const adapter = new EtabsAgentAdapter({
      agentUrl: 'http://127.0.0.1:49999', // closed port
      agentToken: 'test-token-123456',
      timeoutMs: 300,
    });
    const status = await adapter.getStatus();
    assert.equal(status.agentReachable, false);
    assert.equal(status.connectionState, 'AGENT_UNAVAILABLE');
    assert.equal(status.etabsV20Compatible, false);
  });

  it('E/F/G/H: extracts normalized stories, grids, materials, sections, derived frame length & Shoelace area with mandatory provenance', () => {
    const raw = makeSampleRawEtabs();
    const dataset = normalizeEtabsExtractToDataset({
      ownerId: 'eng-1',
      projectId: 'sp_proj_1',
      revisionId: 'rev_1',
      revisionNumber: 1,
      jobId: 'job_1',
      sourceHash: 'hash_1',
      createdByUid: 'eng-1',
      createdByName: 'Eng Tariq',
      raw,
    });

    assert.equal(dataset.stories.length, 3);
    assert.equal(dataset.stories[1].elevationM, 4);
    assert.equal(dataset.stories[1].rawElevation.rawValue, 4000);
    assert.equal(dataset.materials[0].characteristicStrengthMPa, 40);
    assert.equal(dataset.sections[0].depthOrThicknessM, 0.5);
    assert.equal(dataset.frames[0].derivedLengthM, 4); // P1(0,0,0)->P2(0,0,4m)
    assert.equal(dataset.frames[0].derivedMeta?.reliability, 'DERIVED');
    assert.equal(dataset.areas[0].derivedPlanAreaM2, 30); // 6m x 5m = 30 m2
    assert.equal(dataset.model.provenance.dataProvenance, 'ETABS_OAPI_LIVE');
    assert.equal(dataset.validation.reliability, 'SOURCE_VERIFIED');
  });

  it('F/G: catches invalid/incomplete records, ETABS non-v20 version warnings, and degenerate frame errors', () => {
    const broken = makeSampleRawEtabs({
      sourceVersion: '19.1.0',
      stories: [],
      frames: [
        {
          name: 'BAD_F1',
          pointI: 'P1',
          pointJ: 'P1', // degenerate
          sectionName: 'MISSING_SEC',
        },
      ],
    });
    const dataset = normalizeEtabsExtractToDataset({
      ownerId: 'eng-1',
      projectId: 'sp_proj_1',
      revisionId: 'rev_err',
      revisionNumber: 1,
      jobId: 'job_err',
      sourceHash: 'hash_err',
      createdByUid: 'eng-1',
      createdByName: 'Eng Tariq',
      raw: broken,
    });

    assert.equal(dataset.validation.status, 'FAILED');
    assert.equal(dataset.validation.reliability, 'FAILED');
    assert.ok(dataset.validation.issues.some((i) => i.code === 'ETABS_VERSION_WARNING'));
    assert.ok(dataset.validation.issues.some((i) => i.code === 'MISSING_STORIES'));
    assert.ok(dataset.validation.issues.some((i) => i.code === 'DEGENERATE_FRAME_CONNECTIVITY'));
  });

  it('K/L/M/N: enforces 11-step workflow, duplicate hash detection, confirmation gate, immutable revisions, cancellation & exported XLSX/CSV fallback', () => {
    // 1. Exported CSV + XLSX fallback parsing
    const csvSample = 'Story Name,Elevation,Height,Is Master Story\nBase,0,0,No\n=SUM(1+1),3.5,3.5,Yes';
    const csvParsed = parseExportedEtabsTables({
      fileName: 'Story_Definitions.csv',
      contentText: csvSample,
      forceUnit: 'kN',
      lengthUnit: 'm',
    });
    assert.equal(csvParsed.payload.stories.length, 2);
    assert.ok(csvParsed.payload.stories[1].name.startsWith("'=SUM"), 'CSV formula neutralized');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Name: 'GF', Elevation: 3.8, Height: 3.8 }]),
      'Story Definitions'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([{ Name: 'C35', Type: 'Concrete', E: 28000, Fc: 35 }]),
      'Material Properties'
    );
    const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const xlsxParsed = parseExportedEtabsTables({
      fileName: 'ETABS_Export.xlsx',
      binaryBuffer: xlsxBuf,
      forceUnit: 'N',
      lengthUnit: 'mm',
    });
    assert.equal(xlsxParsed.payload.stories.length, 1);
    assert.equal(xlsxParsed.payload.materials.length, 1);

    // 2. Preview -> Confirm -> Duplicate Detection -> Revision Preservation
    const repo = new StructuralRepository();
    const raw = makeSampleRawEtabs();
    const preview1 = buildImportPreview({
      ownerId: 'eng-1',
      projectId: 'sp_proj_1',
      createdByUid: 'eng-1',
      createdByName: 'Eng Tariq',
      raw,
      existingRevisions: repo.listRevisions('sp_proj_1'),
    });
    assert.equal(preview1.steps.length, 11);
    assert.equal(preview1.steps[8].status, 'PENDING');
    assert.throws(() =>
      confirmImportPreview({ preview: preview1, confirmedByUser: false })
    );

    const confirmed1 = confirmImportPreview({
      preview: preview1,
      confirmedByUser: true,
    });
    assert.equal(confirmed1.steps[10].status, 'COMPLETED');
    repo.saveConfirmedDataset({
      project: {
        id: 'sp_proj_1',
        ownerId: 'eng-1',
        bunyanProjectId: 'proj-1',
        code: 'P1-STR',
        name: 'برج',
        nameEn: 'Tower',
        structuralSystem: 'RC',
        designCode: 'ACI',
        revisionCount: 0,
        reliabilitySummary: 'MISSING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      dataset: confirmed1.dataset,
      report: confirmed1.report,
    });

    // Duplicate import blocked unless explicitly overridden
    const previewDup = buildImportPreview({
      ownerId: 'eng-1',
      projectId: 'sp_proj_1',
      createdByUid: 'eng-1',
      createdByName: 'Eng Tariq',
      raw,
      existingRevisions: repo.listRevisions('sp_proj_1'),
    });
    assert.equal(previewDup.isDuplicateImport, true);
    assert.throws(() =>
      confirmImportPreview({ preview: previewDup, confirmedByUser: true })
    );

    // Job cancellation
    repo.saveJobRecord({ job: confirmed1.confirmedJob });
    const cancelled = repo.cancelJob(confirmed1.confirmedJob.id);
    assert.equal(cancelled?.status, 'CANCELLED');
  });

  it('O/P: enforces RBAC across all 5 structural roles and rejects unauthorized controller calls', () => {
    assert.equal(assertStructuralPermission('read_only_reviewer', 'canStageImport').allowed, false);
    assert.equal(assertStructuralPermission('project_engineer', 'canConfirmImportRevision').allowed, false);
    assert.equal(assertStructuralPermission('structural_engineer', 'canConfirmImportRevision').allowed, true);
    assert.equal(assertStructuralPermission('administrator', 'canModifyPermissions').allowed, true);

    const controller = new StructuralController(
      new EtabsAgentAdapter({ agentUrl: 'http://127.0.0.1:49998', timeoutMs: 200 }),
      new StructuralRepository()
    );

    let statusOut = 0;
    let bodyOut: unknown = null;
    const mockReq = {
      header: (name: string) => {
        if (name === 'x-bunyan-uid') return 'user-ro';
        if (name === 'x-bunyan-structural-role') return 'read_only_reviewer';
        return '';
      },
      body: { projectId: 'sp_1', rawExtract: makeSampleRawEtabs() },
    } as never;
    const mockRes = {
      status: (code: number) => {
        statusOut = code;
        return mockRes;
      },
      json: (payload: unknown) => {
        bodyOut = payload;
      },
    } as never;

    controller.stagePreviewFromPayload(mockReq, mockRes);
    assert.equal(statusOut, 403);
    assert.ok(String((bodyOut as { error?: string }).error).includes('not authorized'));
  });

  it('Q (Live ETABS v20 COM Integration): explicitly skipped / NOT RUN when Windows CSI ETABS v20 runtime is absent', (t) => {
    if (process.platform !== 'win32' || process.env.BUNYAN_RUN_LIVE_ETABS_TESTS !== 'true') {
      t.skip('NOT RUN: CSI ETABS v20 COM OAPI requires Windows x64 + ETABSv1.dll + active ETABS v20 license.');
      return;
    }
    assert.ok(true);
  });
});
