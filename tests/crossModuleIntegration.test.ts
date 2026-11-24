import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_COMPANY_PROFILE, INITIAL_PROJECTS, INITIAL_RATE_LIBRARY } from '../src/data/uaeSeedData';
import {
  analyzeBackupMergePreview,
  computePortfolioKpis,
  extractUniqueClients,
  extractUniqueLocations,
  filterAndSortProjects,
  mergeImportedBackupProjects,
  validateProjectFormInput,
} from '../src/utils/projectHelpers';
import { validateAndSanitizeBackupData } from '../src/utils/backupValidator';
import {
  computeProjectTelemetry,
  generateGisPlotTakeoffSheet,
  generateProjectBimElements,
} from '../src/utils/gisTakeoffGenerator';
import {
  calculateTakeoffMeasurementValues,
  computeTakeoffSummary,
  evaluateTakeoffVerificationState,
} from '../src/utils/takeoffCalculations';
import { buildTakeoffWorkbook } from '../src/utils/takeoffExportEngine';
import {
  sanitizePreviewBinaryUrl,
  sanitizeSafeHttpUrl,
  sanitizeSvgMarkup,
} from '../src/utils/sanitize';
import type { BackupData, Project, TakeoffMeasurement } from '../src/types/bunyan';

describe('Cross-Module Integration & Projects Module Verification', () => {
  it('filters, sorts, extracts unique options, and computes portfolio KPIs accurately across all 56 UAE seed projects', () => {
    assert.equal(INITIAL_PROJECTS.length, 56);

    const locations = extractUniqueLocations(INITIAL_PROJECTS);
    const clients = extractUniqueClients(INITIAL_PROJECTS);
    assert.ok(locations.length > 0, 'Should extract at least one sector location');
    assert.ok(clients.length > 0, 'Should extract at least one owner/client');

    const sortedByBudgetDesc = filterAndSortProjects(
      INITIAL_PROJECTS,
      { sortField: 'approvedBudget', sortDir: 'desc' },
      'en'
    );
    assert.equal(sortedByBudgetDesc.length, 56);
    assert.ok(
      sortedByBudgetDesc[0].approvedBudget >= sortedByBudgetDesc[1].approvedBudget,
      'Descending budget sort should place highest budget first'
    );

    const targetLoc = locations[0];
    const filteredByLoc = filterAndSortProjects(
      INITIAL_PROJECTS,
      { location: targetLoc, status: 'all' },
      'ar'
    );
    assert.ok(filteredByLoc.length > 0);
    assert.ok(
      filteredByLoc.every((p) => p.gisData.sectorName.trim() === targetLoc),
      'Every filtered project should match the selected sector'
    );

    const kpis = computePortfolioKpis(filteredByLoc);
    const expectedBudget = filteredByLoc.reduce((acc, p) => acc + p.approvedBudget, 0);
    const expectedPaid = filteredByLoc.reduce((acc, p) => acc + p.paidAmount, 0);
    assert.equal(kpis.totalProjects, filteredByLoc.length);
    assert.equal(kpis.totalBudgetAed, expectedBudget);
    assert.equal(kpis.totalPaidAed, expectedPaid);
    assert.equal(kpis.remainingAed, Math.max(0, expectedBudget - expectedPaid));
  });

  it('validates ProjectFormInput strictly against duplicate codes, invalid financials, progress bounds, plot area, and permit dates', () => {
    const existing = INITIAL_PROJECTS.slice(0, 3);
    const duplicateCodeResult = validateProjectFormInput(
      {
        code: existing[0].code,
        name: 'مشروع مكرر',
        nameEn: 'Duplicate Project',
        approvedBudget: 1500000,
        paidAmount: 2000000, // exceeds budget
        actualProgress: 120, // > 100
        plotNumber: '',
        plotAreaSqFt: 0,
        permitDate: '2026-08-01',
        permitExpiryDate: '2026-01-01', // before permitDate
      },
      existing,
      undefined,
      'en'
    );

    assert.equal(duplicateCodeResult.valid, false);
    assert.ok(duplicateCodeResult.errors.code);
    assert.ok(duplicateCodeResult.errors.paidAmount);
    assert.ok(duplicateCodeResult.errors.actualProgress);
    assert.ok(duplicateCodeResult.errors.plotNumber);
    assert.ok(duplicateCodeResult.errors.plotAreaSqFt);
    assert.ok(duplicateCodeResult.errors.permitExpiryDate);

    // Editing the same project with its own code and valid fields succeeds
    const editSelfValid = validateProjectFormInput(
      {
        code: existing[0].code,
        name: existing[0].name,
        nameEn: existing[0].nameEn,
        approvedBudget: 2000000,
        paidAmount: 1000000,
        actualProgress: 50,
        plotNumber: '112-SHJ',
        plotAreaSqFt: 8500,
        permitDate: '2026-01-15',
        permitExpiryDate: '2027-01-15',
      },
      existing,
      existing[0].id,
      'ar'
    );
    assert.equal(editSelfValid.valid, true);
    assert.deepEqual(editSelfValid.errors, {});
  });

  it('analyzes backup merge previews (ID updates, new projects, code collisions) and executes merge vs replace safely', () => {
    const base = INITIAL_PROJECTS.slice(0, 2);
    const updatedFirst: Project = { ...base[0], nameEn: 'Updated Flagship Project' };
    const collidingBrandNew: Project = {
      ...base[1],
      id: 'proj-brand-new-999',
      code: base[1].code, // same code, different ID -> collision warning
      nameEn: 'Colliding Code Project',
    };

    const rawBackup: BackupData = {
      version: '2026.1',
      exportedAt: '2026-11-23T00:00:00Z',
      companyProfile: DEFAULT_COMPANY_PROFILE,
      projects: [updatedFirst, collidingBrandNew],
      transactions: [],
      rateLibrary: INITIAL_RATE_LIBRARY,
    };

    const sanitized = validateAndSanitizeBackupData(rawBackup);
    assert.equal(sanitized.ok, true);
    if (!sanitized.ok) return;

    const preview = analyzeBackupMergePreview(base, sanitized.data);
    assert.equal(preview.totalIncomingProjects, 2);
    assert.equal(preview.matchedByIdCount, 1);
    assert.equal(preview.newProjectsCount, 1);
    assert.equal(preview.codeCollisionCount, 1);
    assert.deepEqual(preview.collidingCodes, [base[1].code]);

    const merged = mergeImportedBackupProjects(
      base,
      sanitized.data.projects,
      'merge',
      '2026-11-23T12:00:00Z'
    );
    assert.equal(merged.length, 3);
    assert.equal(merged.find((p) => p.id === base[0].id)?.nameEn, 'Updated Flagship Project');

    const replaced = mergeImportedBackupProjects(
      base,
      sanitized.data.projects,
      'replace',
      '2026-11-23T12:00:00Z'
    );
    assert.equal(replaced.length, 2);
  });

  it('defers heavy BIM/GIS geometry on seed proj-02..56 for fast startup and generates consistent BIM, GIS, Takeoff & Excel BOQ', () => {
    assert.ok((INITIAL_PROJECTS[0].bimElements?.length || 0) > 0, 'proj-01 should stay eagerly hydrated');
    assert.equal(INITIAL_PROJECTS[1].bimElements, undefined, 'proj-02 should hydrate BIM lazily');
    assert.equal(INITIAL_PROJECTS[1].takeoffSheets, undefined, 'proj-02 should hydrate GIS sheet lazily');

    const lazyProj = INITIAL_PROJECTS[1];
    const generatedBim = generateProjectBimElements(lazyProj);
    const generatedSheet = generateGisPlotTakeoffSheet(lazyProj);
    assert.ok(generatedBim.length > 0);
    assert.equal(generatedSheet.projectId, lazyProj.id);

    const calc = calculateTakeoffMeasurementValues({
      tool: 'volume',
      category: 'concrete',
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 200 },
        { x: 0, y: 200 },
      ],
      pointsPerMeter: 40, // 10m x 5m = 50 m2
      heightOrDepth: 0.6, // 30 m3
      multiplier: 1,
      unitRateAed: 360,
    });

    const meas: TakeoffMeasurement = {
      id: 'tm-cross-01',
      sheetId: generatedSheet.id,
      projectId: lazyProj.id,
      category: 'concrete',
      tool: 'volume',
      label: 'Foundation Raft C40',
      labelAr: 'لبشة خرسانية C40',
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 200 },
        { x: 0, y: 200 },
      ],
      heightOrDepth: 0.6,
      multiplier: 1,
      unit: calc.unit,
      rawValue: calc.rawValue,
      computedQuantity: calc.computedQuantity,
      unitRateAed: 360,
      totalCostAed: calc.totalCostAed,
      color: '#B4863C',
      createdAt: new Date().toISOString(),
    };

    const hydratedProj: Project = {
      ...lazyProj,
      bimElements: generatedBim,
      takeoffSheets: [{ ...generatedSheet, calibrated: true }],
      takeoffMeasurements: [meas],
    };

    const telemetry = computeProjectTelemetry(hydratedProj);
    assert.equal(telemetry.source, 'takeoff');
    assert.equal(telemetry.concreteM3, 30);

    const verif = evaluateTakeoffVerificationState(
      hydratedProj.takeoffSheets!,
      hydratedProj.takeoffMeasurements!,
      hydratedProj.bimElements
    );
    assert.equal(verif.status, 'certified_calibrated');

    const summary = computeTakeoffSummary(lazyProj.id, [meas], 10, 12, 5);
    const wb = buildTakeoffWorkbook({
      project: hydratedProj,
      company: DEFAULT_COMPANY_PROFILE,
      measurements: [meas],
      summary,
      rateLibrary: INITIAL_RATE_LIBRARY,
    });
    assert.ok(wb.SheetNames.includes('BOQ Summary AED'));
    assert.ok(wb.SheetNames.includes('Detailed Takeoff'));
    assert.ok(wb.SheetNames.includes('5D BIM Quantities'));
  });

  it('sanitizes and preserves RateLibraryItem equipmentRate across backup validation', () => {
    const rawBackup = {
      version: '2026.1',
      exportedAt: new Date().toISOString(),
      projects: [INITIAL_PROJECTS[0]],
      transactions: [],
      rateLibrary: [
        {
          id: 'rl-equip-valid',
          code: 'RL-EQ-01',
          category: 'concrete',
          nameAr: 'ضخ خرسانة مع معدة',
          nameEn: 'Pumped Concrete with Equipment',
          unit: 'm3',
          rateAed: 365,
          equipmentRate: 45,
          materialSpec: 'BS EN 206 C40/50',
        },
        {
          id: 'rl-equip-negative',
          code: 'RL-EQ-02',
          category: 'masonry',
          nameAr: 'طابوق معزول',
          nameEn: 'Insulated Blockwork',
          unit: 'm2',
          rateAed: 95,
          equipmentRate: -25,
          materialSpec: 'Sharjah Spec',
        },
      ],
    };

    const res = validateAndSanitizeBackupData(rawBackup);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.data.rateLibrary.length, 2);
    assert.equal(res.data.rateLibrary[0].equipmentRate, 45);
    assert.equal(res.data.rateLibrary[1].equipmentRate, 0);
  });

  it('sanitizes untrusted SVG markup, portal URLs, and preview data URLs across backup imports', () => {
    const dirtySvg =
      '<svg viewBox="0 0 100 100" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10" onclick="alert(3)"/><a href="javascript:alert(4)"><text x="1" y="1">Plot</text></a></svg>';
    const cleanSvg = sanitizeSvgMarkup(dirtySvg);
    assert.ok(cleanSvg.includes('<rect'));
    assert.ok(!cleanSvg.includes('<script'));
    assert.ok(!cleanSvg.includes('onload='));
    assert.ok(!cleanSvg.includes('onclick='));
    assert.ok(!cleanSvg.includes('javascript:'));

    assert.equal(
      sanitizeSafeHttpUrl('javascript:alert(1)'),
      'https://portal.shjmun.gov.ae'
    );
    assert.equal(
      sanitizeSafeHttpUrl('https://www.sewa.gov.ae/en'),
      'https://www.sewa.gov.ae/en'
    );

    assert.equal(sanitizePreviewBinaryUrl('data:text/html;base64,PHNjcmlwdD4='), null);
    assert.ok(
      sanitizePreviewBinaryUrl('data:application/pdf;base64,JVBERi0xLjQ=') !== null
    );

    const dirtyBackup = {
      version: '2026.1',
      exportedAt: new Date().toISOString(),
      projects: [
        {
          ...INITIAL_PROJECTS[0],
          takeoffSheets: [
            {
              ...(INITIAL_PROJECTS[0].takeoffSheets?.[0] || {
                id: 'sheet-dirty',
                projectId: INITIAL_PROJECTS[0].id,
                code: 'S-1',
                title: 'Dirty Sheet',
                titleAr: 'مخطط',
                sheetType: 'blueprint_svg',
                pageNumber: 1,
                pixelsPerMeter: 20,
                scaleLabel: '1:100',
                calibrated: true,
                width: 1000,
                height: 700,
              }),
              svgContent: dirtySvg,
            },
          ],
        },
      ],
      transactions: [
        {
          id: 'tx-sec-1',
          projectId: INITIAL_PROJECTS[0].id,
          authority: 'sharjah_municipality',
          transactionNumber: 'TX-99',
          serviceName: 'Building Permit',
          status: 'in_review',
          officialPortalUrl: 'javascript:alert(9)',
        },
      ],
      rateLibrary: [],
    };

    const backupCheck = validateAndSanitizeBackupData(dirtyBackup);
    assert.equal(backupCheck.ok, true);
    if (!backupCheck.ok) return;
    assert.ok(!backupCheck.data.projects[0].takeoffSheets![0].svgContent!.includes('<script'));
    assert.equal(
      backupCheck.data.transactions[0].officialPortalUrl,
      'https://portal.shjmun.gov.ae'
    );
  });
});
