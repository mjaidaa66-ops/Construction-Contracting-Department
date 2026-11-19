import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { parseIfcFile } from '../src/utils/ifcParser';
import { parseCadOrPdfDrawing, parseDxfContent } from '../src/utils/cadPdfParser';
import {
  DEFAULT_POINTS_PER_METER,
  calibratePointsPerMeter,
  distanceInPdfPoints,
  pdfPointToViewportWithMediaBox,
  viewportPointToPdfWithMediaBox,
} from '../src/utils/pdfMeasurementMath';
import {
  calculateTakeoffMeasurementValues,
  computePolylineLengthM,
  computeShoelaceAreaM2,
  computeTakeoffSummary,
  evaluateTakeoffVerificationState,
} from '../src/utils/takeoffCalculations';
import { buildTakeoffWorkbook } from '../src/utils/takeoffExportEngine';
import {
  analyzeGisPlot,
  computeInsetPolygonSetback,
  computePolygonAreaM2,
  computePolygonEdgeSurveys,
  computeProjectTelemetry,
  evaluateGisCoordinates,
  generateGisPlotTakeoffSheet,
  utm40NToWgs84,
  wgs84ToUtm40N,
} from '../src/utils/gisTakeoffGenerator';
import { validateAndSanitizeBackupData } from '../src/utils/backupValidator';
import { getRolePermissions } from '../src/utils/rbacPermissions';
import { mergeRemoteProjectsWithLocal, parseSyncTimestampMs } from '../src/services/cloudSyncMerge';

import type {
  CompanyProfile,
  PdfBoxOrigin,
  Project,
  RateLibraryItem,
  TakeoffMeasurement,
  TakeoffSheet,
} from '../src/types/bunyan';

const SAMPLE_COMPANY: CompanyProfile = {
  nameAr: 'شركة بنيان للمقاولات الهندسية ذ.م.م',
  nameEn: 'Bunyan Engineering Contracting LLC',
  licenseNumber: 'SHJ-CN-88412',
  municipalityClass: 'First Class — Sharjah Municipality',
  trnNumber: '100458921400003',
  addressAr: 'الشارقة، المنطقة الصناعية',
  addressEn: 'Sharjah, Industrial Area',
  phone: '+971 6 555 0190',
  email: 'eng@bunyan-uae.ae',
};

const SAMPLE_RATE_LIBRARY: RateLibraryItem[] = [
  {
    id: 'rate-conc',
    code: 'CON-C40',
    category: 'concrete',
    nameAr: 'خرسانة مسلحة C40',
    nameEn: 'Reinforced Concrete C40',
    unit: 'm3',
    rateAed: 425,
    materialSpec: 'BS EN 206 C40/50 SRC',
  },
  {
    id: 'rate-mas',
    code: 'MAS-200',
    category: 'masonry',
    nameAr: 'طابوق حراري 200مم',
    nameEn: 'Thermal Hollow Block 200mm',
    unit: 'm2',
    rateAed: 90,
    materialSpec: 'Sharjah Green Spec U<=0.57',
  },
];

function makeBaseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-test-1',
    code: 'BNY-TEST-01',
    name: 'مشروع اختبار بنيان',
    nameEn: 'Bunyan Test Project',
    category: 'المشاريع الإنشائية',
    projectType: 'villa',
    status: 'under_construction',
    ownerName: 'أحمد الكتبي',
    ownerPhone: '+971500000001',
    ownerEmail: 'owner@test.ae',
    ownerNationalId: '784-1985-0000000-1',
    consultantOffice: 'Sharjah Consultants',
    consultantEngineer: 'Eng. Tariq',
    consultantPhone: '+971500000002',
    consultantLicenseNo: 'CON-101',
    residentEngineer: 'Eng. Sara',
    contractorBranch: 'Sharjah HQ',
    permitNumber: 'SHJ-PRM-2026-99',
    permitDate: '2026-01-10',
    permitExpiryDate: '2027-01-10',
    licensingAuthority: 'Sharjah Municipality',
    approvedBudget: 2400000,
    invoicedAmount: 1200000,
    paidAmount: 1200000,
    retentionPercentage: 10,
    actualProgress: 50,
    plannedProgress: 48,
    phases: [],
    paymentMilestones: [],
    documents: [],
    gisData: {
      plotNumber: '412-ALJADA',
      basinNumber: 'SHJ-04',
      sectorName: 'Aljada / Muwaileh',
      emirate: 'الشارقة / Sharjah',
      latitude: 25.3176,
      longitude: 55.4793,
      plotAreaSqFt: 9687.5,
      plotAreaSqM: 900,
      builtUpAreaSqFt: 6458,
      zoning: 'Residential Villa (G+1)',
      setbacks: { front: 5, rear: 3, sideLeft: 2, sideRight: 2 },
      boundaryPoints: [
        { x: 0, y: 0, label: 'P1' },
        { x: 30, y: 0, label: 'P2' },
        { x: 30, y: 30, label: 'P3' },
        { x: 0, y: 30, label: 'P4' },
      ],
    },
    updatedAt: '2026-11-19T08:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// 1. IFC Parser Engine Suite
// ============================================================================
describe('Group 1 — IFC STEP Parser Engine', () => {
  it('parses multi-line STEP entities in millimetres with local placement, extruded solids, and quantity overrides', () => {
    const ifcPayload = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#10=IFCCARTESIANPOINT((0.,0.,0.));
#11=IFCDIRECTION((1.,0.,0.));
#12=IFCAXIS2PLACEMENT3D(#10,$,#11);
#13=IFCLOCALPLACEMENT($,#12);
#20=IFCBUILDINGSTOREY('G-STOREY',$,'Ground Floor',$,$,#13,$,'GF',.ELEMENT.,0.);
#21=IFCBUILDINGSTOREY('L1-STOREY',$,'First Floor Level 1',$,$,#13,$,'L1',.ELEMENT.,3600.);
#30=IFCCARTESIANPOINT((2000.,1000.,0.));
#31=IFCDIRECTION((0.,1.,0.));
#32=IFCAXIS2PLACEMENT3D(#30,$,#31);
#33=IFCLOCALPLACEMENT(#13,#32);
#34=IFCRECTANGLEPROFILEDEF(.AREA.,'C1-PROF',$,500.,500.);
#35=IFCEXTRUDEDAREASOLID(#34,#12,#11,3600.);
#36=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#35));
#37=IFCPRODUCTDEFINITIONSHAPE($,$,(#36));
#40=IFCCOLUMN(
  'GUID-COL-01',$,'Column C1',$,$,#33,#37,'C1-500x500'
);
#50=IFCCARTESIANPOINT((6000.,4000.,3600.));
#51=IFCAXIS2PLACEMENT3D(#50,$,#11);
#52=IFCLOCALPLACEMENT(#13,#51);
#53=IFCRECTANGLEPROFILEDEF(.AREA.,'SLAB-PROF',$,8000.,6000.);
#54=IFCEXTRUDEDAREASOLID(#53,#12,#11,250.);
#55=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#54));
#56=IFCPRODUCTDEFINITIONSHAPE($,$,(#55));
#60=IFCSLAB('GUID-SLAB-01',$,'First Floor Slab',$,$,#52,#56,'S1-250',.FLOOR.);
#61=IFCQUANTITYAREA('NetArea',$,$,48.0);
#62=IFCQUANTITYVOLUME('NetVolume',$,$,12.0);
#63=IFCELEMENTQUANTITY('Q-SLAB',$,'BaseQuantities',$,$,(#61,#62));
#64=IFCRELDEFINESBYPROPERTIES('REL-Q',$,$,$,(#60),#63);
#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('REL-G',$,$,$,(#40),#20);
#71=IFCRELCONTAINEDINSPATIALSTRUCTURE('REL-L1',$,$,$,(#60),#21);
ENDSEC;
END-ISO-10303-21;`;

    const res = parseIfcFile(ifcPayload, 'tower_structure.ifc');
    assert.equal(res.elements.length, 2);
    assert.equal(res.report.badge, 'BIM VERIFIED');
    assert.equal(res.report.boqUnlocked, true);
    assert.equal(res.report.verificationStatus, 'verified');

    const col = res.elements.find((e) => e.guid === 'GUID-COL-01');
    const slab = res.elements.find((e) => e.guid === 'GUID-SLAB-01');
    assert.ok(col);
    assert.ok(slab);

    assert.equal(col.category, 'column');
    assert.equal(col.level, 'ground');
    assert.deepEqual(col.dimensions, [0.5, 3.6, 0.5]);
    assert.ok(col.rotation && Math.abs(col.rotation[1] + Math.PI / 2) < 0.01);

    assert.equal(slab.category, 'slab');
    assert.equal(slab.level, 'level1');
    assert.deepEqual(slab.dimensions, [8, 0.25, 6]);
    assert.equal(slab.netAreaM2, 48);
    assert.equal(slab.volumeM3, 12);
    assert.equal(slab.estimatedCost, 12 * 425);
  });

  it('never generates a synthetic Sharjah Villa fallback on empty or corrupt IFC payloads', () => {
    const emptyRes = parseIfcFile('ISO-10303-21;\nDATA;\nENDSEC;\n', 'empty.ifc');
    assert.equal(emptyRes.elements.length, 0);
    assert.equal(emptyRes.report.badge, 'EXTRACTION FAILED');
    assert.equal(emptyRes.report.boqUnlocked, false);
    assert.equal(emptyRes.report.verificationStatus, 'missing_data');
  });
});

// ============================================================================
// 2. DXF / DWG / Raster Parser Engine Suite
// ============================================================================
describe('Group 1 — CAD / DXF / DWG / Raster Parser Engine', () => {
  it('parses ASCII DXF with $INSUNITS=4 (mm) into exact metric BIM elements and SVG backdrop', () => {
    const dxfMm = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '4',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      // 10m wall on A-WALL
      '0', 'LINE', '8', 'A-WALL',
      '10', '0', '20', '0', '30', '0',
      '11', '10000', '21', '0', '31', '0',
      // Closed 10m x 8m slab on S-SLAB
      '0', 'LWPOLYLINE', '8', 'S-SLAB', '70', '1',
      '10', '0', '20', '0',
      '10', '10000', '20', '0',
      '10', '10000', '20', '8000',
      '10', '0', '20', '8000',
      // Circular column r=300mm -> D=0.6m on S-COL
      '0', 'CIRCLE', '8', 'S-COL',
      '10', '5000', '20', '4000', '40', '300',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');

    const res = parseCadOrPdfDrawing('villa_plan.dxf', dxfMm);
    assert.equal(res.elements.length, 3);
    assert.equal(res.report.badge, 'BIM VERIFIED');
    assert.equal(res.report.boqUnlocked, true);
    assert.ok(res.dxfSummary);
    assert.equal(res.dxfSummary.insUnitsCode, 4);
    assert.equal(res.dxfSummary.unitToMeters, 0.001);
    assert.equal(res.dxfSummary.unitSource, 'header');
    assert.equal(res.dxfSummary.boundsMeters.widthM, 10);
    assert.equal(res.dxfSummary.boundsMeters.heightM, 8);
    assert.ok(res.dxfSummary.svgContent.includes('CAD DXF VECTOR SHEET'));

    const slab = res.elements.find((e) => e.category === 'slab');
    const col = res.elements.find((e) => e.category === 'column');
    const wall = res.elements.find((e) => e.category === 'wall');
    assert.ok(slab && col && wall);
    assert.equal(slab.netAreaM2, 80);
    assert.equal(wall.dimensions[0], 10);
    assert.equal(col.dimensions[0], 0.6);
  });

  it('keeps boqUnlocked=false when DXF header omits $INSUNITS (inferred units)', () => {
    const unitlessDxf = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '0',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '8', 'A-WALL',
      '10', '0', '20', '0', '11', '6000', '21', '0',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');

    const res = parseCadOrPdfDrawing('unitless.dxf', unitlessDxf);
    assert.equal(res.elements.length, 1);
    assert.equal(res.dxfSummary?.unitSource, 'inferred');
    assert.equal(res.dxfSummary?.unitToMeters, 0.001);
    assert.equal(res.report.badge, 'CALIBRATION REQUIRED');
    assert.equal(res.report.boqUnlocked, false);
  });

  it('rejects binary DWG, binary DXF, raster images, and unparsed PDF without fabricating geometry', () => {
    const dwgRes = parseCadOrPdfDrawing('drawing.dwg', 'AC1032 binary bytes');
    assert.equal(dwgRes.elements.length, 0);
    assert.equal(dwgRes.report.badge, 'EXTRACTION FAILED');
    assert.equal(dwgRes.report.boqUnlocked, false);

    const binDxfRes = parseCadOrPdfDrawing('bin.dxf', 'AutoCAD Binary DXF\r\n...');
    assert.equal(binDxfRes.elements.length, 0);
    assert.equal(binDxfRes.report.badge, 'EXTRACTION FAILED');
    assert.equal(binDxfRes.report.boqUnlocked, false);

    const imgRes = parseCadOrPdfDrawing('scan.png');
    assert.equal(imgRes.elements.length, 0);
    assert.equal(imgRes.report.badge, 'CALIBRATION REQUIRED');
    assert.equal(imgRes.report.boqUnlocked, false);

    const pdfRes = parseCadOrPdfDrawing('arch.pdf');
    assert.equal(pdfRes.elements.length, 0);
    assert.equal(pdfRes.report.badge, 'CALIBRATION REQUIRED');
    assert.equal(pdfRes.report.boqUnlocked, false);
  });
});

// ============================================================================
// 3. PDF & 2D Takeoff Engine Suite
// ============================================================================
describe('Group 2 — PDF Geometry, 2D Takeoff Math & Export Engine', () => {
  it('performs lossless MediaBox/CropBox forward & inverse projections across rotations 0/90/180/270', () => {
    const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270];
    const nativePt = { x: 145.25, y: 312.75 };

    for (const rot of rotations) {
      const box: PdfBoxOrigin = {
        x: 12,
        y: 24,
        width: 841.89,
        height: 595.28,
        rotation: rot,
        userUnit: 2,
      };
      for (const vpRot of rotations) {
        const vp = pdfPointToViewportWithMediaBox(nativePt, box, 1.75, vpRot);
        const recovered = viewportPointToPdfWithMediaBox(vp, box, 1.75, vpRot);
        assert.ok(
          Math.abs(recovered.x - nativePt.x) < 1e-6,
          `X mismatch for boxRot=${rot}, vpRot=${vpRot}`
        );
        assert.ok(
          Math.abs(recovered.y - nativePt.y) < 1e-6,
          `Y mismatch for boxRot=${rot}, vpRot=${vpRot}`
        );
      }
    }
  });

  it('calibrates 72-DPI points-per-meter accurately and handles invalid inputs safely', () => {
    const ppm = calibratePointsPerMeter({ x: 0, y: 0 }, { x: 283.465, y: 0 }, 10);
    assert.ok(Math.abs(ppm - DEFAULT_POINTS_PER_METER) < 1e-4);
    assert.equal(distanceInPdfPoints({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
    assert.equal(calibratePointsPerMeter({ x: 10, y: 10 }, { x: 10, y: 10 }, 5), DEFAULT_POINTS_PER_METER);
  });

  it('calculates Shoelace area, polyline length, volumetric deductions (m3 vs m2), and unit-safe BOQ rollup', () => {
    const ppm = 20;
    const rectPts = [
      { x: 0, y: 0 },
      { x: 200, y: 0 }, // 10m
      { x: 200, y: 100 }, // 5m
      { x: 0, y: 100 },
    ];
    assert.equal(computeShoelaceAreaM2(rectPts, ppm), 50);
    assert.equal(computePolylineLengthM(rectPts, ppm, true), 30);

    // Volumetric concrete slab deduction (2m x 1m x 0.25m = -0.50 m3)
    const volDeduct = calculateTakeoffMeasurementValues({
      tool: 'deduction',
      category: 'concrete',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 20 },
      ],
      pointsPerMeter: ppm,
      heightOrDepth: 0.25,
      unitRateAed: 425,
    });
    assert.equal(volDeduct.unit, 'm3');
    assert.equal(volDeduct.computedQuantity, -0.5);
    assert.equal(volDeduct.totalCostAed, -212.5);

    // Area finish deduction (-2.00 m2)
    const areaDeduct = calculateTakeoffMeasurementValues({
      tool: 'deduction',
      category: 'flooring',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 0, y: 20 },
      ],
      pointsPerMeter: ppm,
      heightOrDepth: 0.25,
      unitRateAed: 120,
    });
    assert.equal(areaDeduct.unit, 'm2');
    assert.equal(areaDeduct.computedQuantity, -2);

    // Unit-safe aggregation: linear concrete curb (m) vs volume slab (m3) remain separate breakdown rows
    const mVol: TakeoffMeasurement = {
      id: 'm1',
      projectId: 'p1',
      sheetId: 's1',
      tool: 'volume',
      category: 'concrete',
      label: 'Slab C40',
      labelAr: 'بلاطة',
      points: rectPts,
      rawValue: 50,
      computedQuantity: 12.5,
      unit: 'm3',
      unitRateAed: 400,
      totalCostAed: 5000,
      color: '#F59E0B',
      createdAt: '2026-11-19T00:00:00Z',
    };
    const mLin: TakeoffMeasurement = {
      id: 'm2',
      projectId: 'p1',
      sheetId: 's1',
      tool: 'linear',
      category: 'concrete',
      label: 'Precast Kerbstone',
      labelAr: 'بردورة خرسانية',
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      rawValue: 10,
      computedQuantity: 10,
      unit: 'm',
      unitRateAed: 100,
      totalCostAed: 1000,
      color: '#F59E0B',
      createdAt: '2026-11-19T00:00:00Z',
    };

    const summary = computeTakeoffSummary('p1', [mVol, mLin], 10, 10, 5);
    assert.equal(summary.categoryBreakdown.length, 2);
    assert.equal(summary.directCostAed, 6000);
    assert.equal(summary.overheadAed, 600);
    assert.equal(summary.profitAed, 600);
    assert.equal(summary.subtotalBeforeVatAed, 7200);
    assert.equal(summary.vatAed, 360);
    assert.equal(summary.grandTotalAed, 7560);

    const calSheet: TakeoffSheet = {
      id: 's1',
      projectId: 'p1',
      code: 'A-101',
      title: 'Ground Floor',
      titleAr: 'الدور الأرضي',
      sheetType: 'pdf_document',
      pageNumber: 1,
      pixelsPerMeter: 20,
      scaleLabel: '1:100',
      calibrated: true,
      width: 1000,
      height: 800,
    };
    const uncalSheet: TakeoffSheet = { ...calSheet, id: 's2', calibrated: false };

    const verCal = evaluateTakeoffVerificationState([calSheet], [mVol, mLin]);
    assert.equal(verCal.status, 'certified_calibrated');
    assert.deepEqual(verCal.mixedUnitCategories, ['concrete']);

    const verDraft = evaluateTakeoffVerificationState([calSheet, uncalSheet], [
      mVol,
      { ...mLin, sheetId: 's2' },
    ]);
    assert.equal(verDraft.status, 'uncalibrated_draft');
    assert.equal(verDraft.uncalibratedCount, 1);

    const proj = makeBaseProject({ takeoffSheets: [calSheet] });
    const verParam = evaluateTakeoffVerificationState([calSheet], [], [
      {
        id: 'b1',
        guid: 'G1',
        name: 'Footing',
        nameAr: 'قاعدة',
        discipline: 'structural',
        category: 'foundation',
        level: 'foundation',
        position: [0, 0, 0],
        dimensions: [2, 0.5, 2],
        materialName: 'C40',
        grossAreaM2: 4,
        deductedOpeningAreaM2: 0,
        netAreaM2: 4,
        volumeM3: 2,
        boqCategory: 'concrete',
        unitRate: 400,
        estimatedCost: 800,
      },
    ]);
    assert.equal(verParam.status, 'parametric_estimate');

    const wb = buildTakeoffWorkbook({
      project: proj,
      company: SAMPLE_COMPANY,
      measurements: [mVol, mLin],
      summary,
      rateLibrary: SAMPLE_RATE_LIBRARY,
    });
    assert.deepEqual(wb.SheetNames, [
      'BOQ Summary AED',
      'Detailed Takeoff',
      'UAE Rate Library',
      '5D BIM Quantities',
    ]);
    const summaryRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['BOQ Summary AED'], { header: 1 });
    const verificationRow = summaryRows.find(
      (r) => Array.isArray(r) && r[0] === 'Verification Status'
    );
    assert.ok(verificationRow && verificationRow[1] === 'Verified Calibrated 2D Takeoff');
    const detailRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Detailed Takeoff']);
    assert.equal(detailRows.length, 2);
    assert.equal(detailRows[0]['Scale Status'], 'Calibrated');
  });
});

// ============================================================================
// 4. GIS & Survey Engine Suite
// ============================================================================
describe('Group 3 — GIS Coordinate Projection (WGS84 <-> UTM 40N) & Survey Setbacks', () => {
  it('converts Sharjah Aljada WGS84 coordinates to EPSG:32640 UTM 40N and round-trips accurately', () => {
    const lat = 25.3176;
    const lng = 55.4793;
    const utm = wgs84ToUtm40N(lat, lng);
    assert.ok(utm);
    assert.equal(utm.epsg, 'EPSG:32640');
    assert.equal(utm.zone, 40);
    assert.equal(utm.hemisphere, 'N');
    assert.ok(utm.eastingM > 340000 && utm.eastingM < 360000);
    assert.ok(utm.northingM > 2790000 && utm.northingM < 2820000);

    const back = utm40NToWgs84(utm.eastingM, utm.northingM, true);
    assert.ok(back);
    assert.ok(Math.abs(back.latitude - lat) < 1e-5);
    assert.ok(Math.abs(back.longitude - lng) < 1e-5);
  });

  it('rejects (0, 0) null island coordinates and classifies non-UAE coordinates accurately', () => {
    const missing = evaluateGisCoordinates({
      plotNumber: 'P1',
      basinNumber: 'B1',
      sectorName: 'S1',
      emirate: 'Sharjah',
      latitude: 0,
      longitude: 0,
      plotAreaSqFt: 0,
      plotAreaSqM: 0,
      builtUpAreaSqFt: 0,
      zoning: '',
      setbacks: { front: 3, rear: 3, sideLeft: 2, sideRight: 2 },
      boundaryPoints: [],
    });
    assert.equal(missing.status, 'missing');
    assert.equal(missing.utm40N, null);

    const outside = evaluateGisCoordinates({
      plotNumber: 'P2',
      basinNumber: 'B2',
      sectorName: 'London',
      emirate: 'UK',
      latitude: 51.5074,
      longitude: -0.1278,
      plotAreaSqFt: 1000,
      plotAreaSqM: 100,
      builtUpAreaSqFt: 500,
      zoning: '',
      setbacks: { front: 3, rear: 3, sideLeft: 2, sideRight: 2 },
      boundaryPoints: [],
    });
    assert.equal(outside.status, 'outside_uae');
  });

  it('computes Shoelace plot area, edge azimuths, and true polygonal inward setback for a skewed trapezoid', () => {
    // Skewed trapezoid: top width 20m (y=0), bottom width 30m (y=20) => Area = ((20+30)/2)*20 = 500 m2
    const trapezoid = [
      { x: 5, y: 0, label: 'P1' },
      { x: 25, y: 0, label: 'P2' },
      { x: 30, y: 20, label: 'P3' },
      { x: 0, y: 20, label: 'P4' },
    ];
    assert.equal(computePolygonAreaM2(trapezoid), 500);

    const edges = computePolygonEdgeSurveys(trapezoid);
    assert.equal(edges.length, 4);
    assert.equal(edges[0].lengthM, 20);
    assert.equal(edges[0].azimuthDeg, 90); // Due East
    assert.equal(edges[0].bearingCardinal, 'E');
    assert.equal(edges[2].lengthM, 30);
    assert.equal(edges[2].azimuthDeg, 270); // Due West

    const inset = computeInsetPolygonSetback(
      trapezoid,
      { front: 4, rear: 3, sideLeft: 2, sideRight: 2 },
      'south'
    );
    assert.equal(inset.length, 4);
    const buildableArea = computePolygonAreaM2(inset);
    assert.ok(buildableArea > 200 && buildableArea < 500);

    const project = makeBaseProject({
      gisData: {
        plotNumber: 'TRAP-77',
        basinNumber: 'SHJ-09',
        sectorName: 'Al Majaz',
        emirate: 'Sharjah',
        latitude: 25.324,
        longitude: 55.388,
        plotAreaSqFt: 5381.96,
        plotAreaSqM: 500,
        builtUpAreaSqFt: 3200,
        zoning: 'Mixed',
        setbacks: { front: 4, rear: 3, sideLeft: 2, sideRight: 2 },
        boundaryPoints: trapezoid,
      },
    });
    const survey = analyzeGisPlot(project.gisData);
    assert.equal(survey.reliability, 'verified_survey');
    assert.equal(survey.surveyedAreaM2, 500);
    assert.equal(survey.buildableAreaM2, Number(buildableArea.toFixed(2)));

    const sheet = generateGisPlotTakeoffSheet(project);
    assert.equal(sheet.calibrated, true);
    assert.ok(sheet.svgContent?.includes('ALLOWABLE BUILDABLE ENVELOPE'));
  });

  it('respects explicit empty bimElements=[] in computeProjectTelemetry without regenerating synthetic villa', () => {
    const emptyBimProject = makeBaseProject({
      bimElements: [],
      takeoffMeasurements: [],
    });
    const telemetry = computeProjectTelemetry(emptyBimProject);
    assert.equal(telemetry.concreteM3, 0);
    assert.equal(telemetry.steelKg, 0);
    assert.equal(telemetry.masonryM2, 0);
    assert.equal(telemetry.concreteEstimated, true);
    assert.equal(telemetry.steelEstimated, true);
  });
});

// ============================================================================
// 5. Backup Validator, RBAC & Sync Merge Suite
// ============================================================================
describe('Group 4 — Backup Validation, RBAC Permissions & Timestamp Sync Merge', () => {
  it('sanitizes valid backup payloads, clamps negative amounts, skips duplicates, and rejects corrupt JSON', () => {
    const invalidRoot = validateAndSanitizeBackupData('not-an-object');
    assert.equal(invalidRoot.ok, false);

    const noProjects = validateAndSanitizeBackupData({ projects: [] });
    assert.equal(noProjects.ok, false);

    const mixedPayload = {
      version: '2026.2',
      projects: [
        {
          id: 'p-valid',
          code: 'BNY-100',
          name: 'Valid Villa',
          approvedBudget: -5000, // should clamp to 0
          paidAmount: 250000,
          actualProgress: 140, // should clamp to 100
          gisData: {
            plotNumber: '101',
            setbacks: { front: 4, rear: 3, sideLeft: 2, sideRight: 2 },
            boundaryPoints: [
              { x: 0, y: 0 },
              { x: 20, y: 0 },
              { x: 20, y: 20 },
            ],
          },
        },
        {
          id: 'p-valid', // duplicate ID
          code: 'BNY-DUP',
          name: 'Duplicate',
          gisData: { plotNumber: '102' },
        },
        {
          id: 'p-broken', // missing gisData
          code: 'B1',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          projectId: 'p-valid',
          transactionNumber: 'TR-99',
          serviceName: 'Building Permit',
          authority: 'sharjah_municipality',
          status: 'approved',
        },
        { id: 'tx-bad' },
      ],
      rateLibrary: [
        {
          id: 'r-1',
          code: 'CON-1',
          category: 'concrete',
          nameAr: 'خرسانة',
          unit: 'm3',
          rateAed: 410,
        },
      ],
    };

    const res = validateAndSanitizeBackupData(mixedPayload);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.data.projects.length, 1);
    assert.equal(res.data.projects[0].approvedBudget, 0);
    assert.equal(res.data.projects[0].actualProgress, 100);
    assert.equal(res.data.transactions.length, 1);
    assert.equal(res.data.rateLibrary.length, 1);
    assert.ok(res.warnings.length >= 3);
  });

  it('enforces exact RBAC permission matrix across admin, engineer, and accountant roles', () => {
    const admin = getRolePermissions('admin');
    assert.equal(admin.canDeleteProjects, true);
    assert.equal(admin.canEditFinancials, true);
    assert.equal(admin.canEditEngineering, true);
    assert.equal(admin.canManageCompanySettings, true);

    const engineer = getRolePermissions('engineer');
    assert.equal(engineer.canManageProjects, true);
    assert.equal(engineer.canDeleteProjects, false);
    assert.equal(engineer.canEditEngineering, true);
    assert.equal(engineer.canEditFinancials, false);
    assert.equal(engineer.canManageGovernment, true);
    assert.equal(engineer.canManageCompanySettings, false);

    const accountant = getRolePermissions('accountant');
    assert.equal(accountant.canManageProjects, false);
    assert.equal(accountant.canDeleteProjects, false);
    assert.equal(accountant.canEditEngineering, false);
    assert.equal(accountant.canEditFinancials, true);
    assert.equal(accountant.canManageGovernment, false);
  });

  it('preserves newer local unsynced edits and pending projects during Firestore snapshot merge', () => {
    assert.equal(parseSyncTimestampMs('2026-11-19T10:00:00.000Z'), Date.parse('2026-11-19T10:00:00.000Z'));
    assert.equal(parseSyncTimestampMs({ seconds: 1700000000 }), 1700000000 * 1000);

    const localNewer = makeBaseProject({
      id: 'p1',
      nameEn: 'Local Newer Edit',
      updatedAt: '2026-11-19T12:00:00.000Z',
    });
    const remoteOlder = makeBaseProject({
      id: 'p1',
      nameEn: 'Stale Cloud Copy',
      updatedAt: '2026-11-19T11:50:00.000Z',
    });
    const remoteBrandNew = makeBaseProject({
      id: 'p2',
      code: 'BNY-CLOUD-02',
      nameEn: 'New Device Project',
      updatedAt: '2026-11-19T12:05:00.000Z',
    });

    const merged = mergeRemoteProjectsWithLocal(
      [localNewer],
      [remoteOlder, remoteBrandNew],
      () => false
    );
    assert.equal(merged.length, 2);
    assert.equal(merged.find((p) => p.id === 'p1')?.nameEn, 'Local Newer Edit');
    assert.equal(merged.find((p) => p.id === 'p2')?.nameEn, 'New Device Project');

    // Remote wins if newer than local by >1.5s and not pending
    const remoteEvenNewer = makeBaseProject({
      id: 'p1',
      nameEn: 'Fresh Cloud Edit',
      updatedAt: '2026-11-19T12:10:00.000Z',
    });
    const merged2 = mergeRemoteProjectsWithLocal([localNewer], [remoteEvenNewer], () => false);
    assert.equal(merged2[0].nameEn, 'Fresh Cloud Edit');

    // Pending sync flag protects local even if remote has newer timestamp
    const mergedPending = mergeRemoteProjectsWithLocal(
      [localNewer],
      [remoteEvenNewer],
      (id) => id === 'p1'
    );
    assert.equal(mergedPending[0].nameEn, 'Local Newer Edit');
  });
});

// ============================================================================
// 6. End-to-End Integrated Acceptance Scenarios
// ============================================================================
describe('Group 5 — End-to-End Integrated Engineering Acceptance Scenarios', () => {
  it('E2E A: ASCII DXF Floor Plan -> Calibrated 2D Takeoff -> Unit-Safe BOQ -> Certified Excel Workbook', () => {
    const dxfMeters = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '6',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LWPOLYLINE', '8', 'S-SLAB', '70', '1',
      '10', '0', '20', '0',
      '10', '12', '20', '0',
      '10', '12', '20', '10',
      '10', '0', '20', '10',
      '0', 'LINE', '8', 'A-WALL',
      '10', '0', '20', '0', '11', '12', '21', '0',
      '0', 'ENDSEC',
      '0', 'EOF',
    ].join('\n');

    const cad = parseCadOrPdfDrawing('floorplan_meters.dxf', dxfMeters);
    assert.equal(cad.report.boqUnlocked, true);
    assert.ok(cad.dxfSummary);

    const sheet: TakeoffSheet = {
      id: 'sheet-dxf-1',
      projectId: 'proj-e2e-a',
      code: 'DXF-01',
      title: 'DXF Ground Floor',
      titleAr: 'مخطط DXF للدور الأرضي',
      sheetType: 'blueprint_svg',
      pageNumber: 1,
      pixelsPerMeter: 50,
      scaleLabel: 'DXF Metric 1:1',
      calibrated: true,
      width: 1200,
      height: 850,
      svgContent: cad.dxfSummary.svgContent,
    };

    const slabCalc = calculateTakeoffMeasurementValues({
      tool: 'volume',
      category: 'concrete',
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 500 },
        { x: 0, y: 500 },
      ],
      pointsPerMeter: sheet.pixelsPerMeter,
      heightOrDepth: 0.25,
      unitRateAed: 425,
    });
    assert.equal(slabCalc.unit, 'm3');
    assert.equal(slabCalc.computedQuantity, 30); // 12m * 10m * 0.25m = 30 m3

    const shaftDeductCalc = calculateTakeoffMeasurementValues({
      tool: 'deduction',
      category: 'concrete',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      pointsPerMeter: sheet.pixelsPerMeter,
      heightOrDepth: 0.25,
      unitRateAed: 425,
    });
    assert.equal(shaftDeductCalc.unit, 'm3');
    assert.equal(shaftDeductCalc.computedQuantity, -1); // 2m * 2m * 0.25m = -1 m3

    const wallCalc = calculateTakeoffMeasurementValues({
      tool: 'linear',
      category: 'masonry',
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
      ],
      pointsPerMeter: sheet.pixelsPerMeter,
      heightOrDepth: 3.2,
      unitRateAed: 90,
    });
    assert.equal(wallCalc.unit, 'm2');
    assert.equal(wallCalc.computedQuantity, 38.4); // 12m * 3.2m = 38.4 m2

    const measurements: TakeoffMeasurement[] = [
      {
        id: 'e2e-m1',
        projectId: 'proj-e2e-a',
        sheetId: sheet.id,
        tool: 'volume',
        category: 'concrete',
        label: 'Ground Slab',
        labelAr: 'بلاطة الأرضي',
        points: [],
        ...slabCalc,
        unitRateAed: 425,
        color: '#F59E0B',
        createdAt: '2026-11-19T09:00:00Z',
      },
      {
        id: 'e2e-m2',
        projectId: 'proj-e2e-a',
        sheetId: sheet.id,
        tool: 'deduction',
        category: 'concrete',
        label: 'Lift Shaft Void',
        labelAr: 'خصم منور المصعد',
        points: [],
        ...shaftDeductCalc,
        unitRateAed: 425,
        color: '#EF4444',
        createdAt: '2026-11-19T09:01:00Z',
      },
      {
        id: 'e2e-m3',
        projectId: 'proj-e2e-a',
        sheetId: sheet.id,
        tool: 'linear',
        category: 'masonry',
        label: 'North Thermal Wall',
        labelAr: 'جدار حراري شمالي',
        points: [],
        ...wallCalc,
        unitRateAed: 90,
        color: '#38BDF8',
        createdAt: '2026-11-19T09:02:00Z',
      },
    ];

    const summary = computeTakeoffSummary('proj-e2e-a', measurements);
    const concreteRow = summary.categoryBreakdown.find((b) => b.category === 'concrete');
    assert.ok(concreteRow);
    assert.equal(concreteRow.quantity, 29); // 30 - 1 = 29 m3
    assert.equal(concreteRow.costAed, 29 * 425);

    const project = makeBaseProject({
      id: 'proj-e2e-a',
      bimElements: cad.elements,
      takeoffSheets: [sheet],
      takeoffMeasurements: measurements,
    });
    const verification = evaluateTakeoffVerificationState(
      project.takeoffSheets || [],
      measurements,
      project.bimElements
    );
    assert.equal(verification.status, 'certified_calibrated');

    const wb = buildTakeoffWorkbook({
      project,
      company: SAMPLE_COMPANY,
      measurements,
      summary,
      rateLibrary: SAMPLE_RATE_LIBRARY,
    });
    const bimSheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['5D BIM Quantities']
    );
    assert.equal(bimSheetRows.length, cad.elements.length);
  });

  it('E2E B: Skewed GIS Plot -> Survey Analysis -> Auto-Calibrated Takeoff Sheet -> Project Telemetry', () => {
    const plot = makeBaseProject({
      id: 'proj-e2e-b',
      bimElements: undefined,
      takeoffMeasurements: [],
      gisData: {
        plotNumber: '518-MUWAILEH',
        basinNumber: 'SHJ-12',
        sectorName: 'Muwaileh Commercial',
        emirate: 'الشارقة / Sharjah',
        latitude: 25.3112,
        longitude: 55.4621,
        plotAreaSqFt: 8072.93,
        plotAreaSqM: 750,
        builtUpAreaSqFt: 5200,
        zoning: 'Villa G+1',
        setbacks: { front: 5, rear: 3, sideLeft: 2, sideRight: 2 },
        boundaryPoints: [
          { x: 0, y: 0, label: 'P1' },
          { x: 25, y: 0, label: 'P2' },
          { x: 30, y: 25, label: 'P3' },
          { x: 5, y: 25, label: 'P4' },
        ],
      },
    });

    const survey = analyzeGisPlot(plot.gisData);
    assert.equal(survey.coordinateStatus, 'verified');
    assert.equal(survey.reliability, 'verified_survey');
    assert.equal(survey.surveyedAreaM2, 625);
    assert.ok(survey.utm40N && survey.utm40N.zone === 40);

    const gisSheet = generateGisPlotTakeoffSheet(plot);
    assert.equal(gisSheet.calibrated, true);
    assert.ok(gisSheet.pixelsPerMeter > 0);

    const telemetry = computeProjectTelemetry(plot);
    assert.equal(telemetry.source, 'bim');
    assert.ok(telemetry.concreteM3 > 0);
    assert.ok(telemetry.steelKg > 0);
    assert.equal(telemetry.concreteEstimated, true);
    assert.equal(telemetry.steelEstimated, true);
  });
});
