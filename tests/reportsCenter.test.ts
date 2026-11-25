import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMPANY_PROFILE,
  INITIAL_PROJECTS,
  INITIAL_RATE_LIBRARY,
  INITIAL_TRANSACTIONS,
} from '../src/data/uaeSeedData';
import { getRolePermissions } from '../src/utils/rbacPermissions';
import { deriveWorkspaceAlerts } from '../src/utils/workspaceAlerts';
import {
  REPORT_DEFINITIONS,
  computeReportsDashboardAnalytics,
  generateReport,
  getAvailableReportDefinitions,
} from '../src/utils/reportEngine';
import {
  buildReportCsvString,
  buildReportWorkbook,
  formatCsvCell,
} from '../src/utils/reportExportEngine';
import {
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_REPORT_TEMPLATES,
  cloneDefaultTemplates,
} from '../src/utils/reportTemplates';
import {
  appendPrintAuditLogInState,
  createDefaultReportsWorkspace,
  deleteSavedReportInState,
  toggleFavoriteInState,
  upsertSavedReportInState,
} from '../src/services/reportStorageService';

const BASE_SYNC_STATE = {
  status: 'synced' as const,
  isOnline: true,
  isAuthenticated: true,
  pendingCount: 0,
  syncing: false,
  persistenceEnabled: true,
  lastSyncedAt: '2026-11-23T10:00:00.000Z',
  lastError: null,
};

const BASE_ALERTS = deriveWorkspaceAlerts({
  projects: INITIAL_PROJECTS,
  transactions: INITIAL_TRANSACTIONS,
  syncState: BASE_SYNC_STATE,
  lang: 'ar',
});

describe('Reports & Printing Center Engine', () => {
  it('enforces strict RBAC boundaries for report types, templates, deletion, and financial access', () => {
    const admin = getRolePermissions('admin');
    assert.equal(admin.canViewReports, true);
    assert.equal(admin.canCreateReports, true);
    assert.equal(admin.canEditReports, true);
    assert.equal(admin.canDeleteReports, true);
    assert.equal(admin.canManageTemplates, true);
    assert.equal(admin.canViewFinancialReports, true);

    const engineer = getRolePermissions('engineer');
    assert.equal(engineer.canViewReports, true);
    assert.equal(engineer.canEditReports, true);
    assert.equal(engineer.canDeleteReports, false);
    assert.equal(engineer.canManageTemplates, false);
    assert.equal(engineer.canViewFinancialReports, false);

    const accountant = getRolePermissions('accountant');
    assert.equal(accountant.canViewReports, true);
    assert.equal(accountant.canEditReports, false);
    assert.equal(accountant.canDeleteReports, false);
    assert.equal(accountant.canManageTemplates, false);
    assert.equal(accountant.canViewFinancialReports, true);

    const adminCatalog = getAvailableReportDefinitions('admin');
    const engineerCatalog = getAvailableReportDefinitions('engineer');
    const accountantCatalog = getAvailableReportDefinitions('accountant');

    assert.equal(adminCatalog.length, REPORT_DEFINITIONS.length);
    assert.equal(accountantCatalog.length, REPORT_DEFINITIONS.length);
    assert.ok(engineerCatalog.length < adminCatalog.length);
    assert.equal(
      engineerCatalog.some((d) => d.isFinancial),
      false
    );

    // Direct invocation of financial report by engineer MUST throw RBAC error
    assert.throws(() =>
      generateReport({
        definitionId: 'fin_portfolio_ledger',
        lang: 'ar',
        role: 'engineer',
        actorName: 'Site Eng',
        projects: INITIAL_PROJECTS,
        transactions: INITIAL_TRANSACTIONS,
        rateLibrary: INITIAL_RATE_LIBRARY,
        company: DEFAULT_COMPANY_PROFILE,
        alerts: BASE_ALERTS,
        auditLogs: [],
      })
    );

    // Non-financial report for engineer MUST strip sensitiveFinancial columns
    const engExecReport = generateReport({
      definitionId: 'exec_portfolio_summary',
      lang: 'en',
      role: 'engineer',
      actorName: 'Site Eng',
      projects: INITIAL_PROJECTS,
      transactions: INITIAL_TRANSACTIONS,
      rateLibrary: INITIAL_RATE_LIBRARY,
      company: DEFAULT_COMPANY_PROFILE,
      alerts: BASE_ALERTS,
      auditLogs: [],
    });
    assert.equal(
      engExecReport.columns.some((c) => c.key === 'approvedBudget'),
      false
    );
  });

  it('generates valid live data across all 15 report definitions for admin', () => {
    const sampleLogs = [
      {
        id: 'log-1',
        reportNumber: 'BNY-EXE-2026-1001',
        reportTitleAr: 'تقرير اختباري',
        reportTitleEn: 'Test Report',
        definitionId: 'exec_portfolio_summary' as const,
        action: 'pdf' as const,
        actorName: 'Executive Admin',
        actorRole: 'admin' as const,
        templateId: 'official' as const,
        paperSize: 'A4' as const,
        orientation: 'portrait' as const,
        rowCount: INITIAL_PROJECTS.length,
        timestamp: '2026-11-23T12:00:00.000Z',
      },
    ];

    for (const def of REPORT_DEFINITIONS) {
      const testProjects =
        def.id === 'doc_vault_registry'
          ? [
              {
                ...INITIAL_PROJECTS[0],
                documents: [
                  {
                    id: 'doc-real-test-1',
                    name: 'Uploaded_Permit.pdf',
                    category: 'permit' as const,
                    mimeType: 'application/pdf',
                    sizeBytes: 2048,
                    uploadedAt: '2026-11-24',
                    localDataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
                  },
                ],
              },
              ...INITIAL_PROJECTS.slice(1),
            ]
          : INITIAL_PROJECTS;

      const report = generateReport({
        definitionId: def.id,
        lang: 'ar',
        role: 'admin',
        actorName: 'Admin',
        projects: testProjects,
        transactions: INITIAL_TRANSACTIONS,
        rateLibrary: INITIAL_RATE_LIBRARY,
        company: DEFAULT_COMPANY_PROFILE,
        alerts: BASE_ALERTS,
        auditLogs: sampleLogs,
      });

      assert.equal(report.definitionId, def.id);
      assert.ok(report.reportNumber.startsWith('BNY-'));
      assert.ok(report.columns.length > 0);
      assert.ok(report.visibleColumnKeys.length > 0);
      assert.ok(report.rows.length > 0, `Expected non-empty rows for ${def.id}`);
    }
  });

  it('supports filtering, sorting, visible columns toggling, and totals row calculation', () => {
    const firstProj = INITIAL_PROJECTS[0];
    const filtered = generateReport({
      definitionId: 'fin_portfolio_ledger',
      lang: 'en',
      role: 'accountant',
      actorName: 'Accountant',
      projects: INITIAL_PROJECTS,
      transactions: INITIAL_TRANSACTIONS,
      rateLibrary: INITIAL_RATE_LIBRARY,
      company: DEFAULT_COMPANY_PROFILE,
      alerts: BASE_ALERTS,
      auditLogs: [],
      filters: {
        projectId: firstProj.id,
        sortColumn: 'approvedBudget',
        sortDirection: 'desc',
      },
      visibleColumnKeys: ['code', 'name', 'approvedBudget', 'paidAmount'],
    });

    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.rows[0].cells.code, firstProj.code);
    assert.deepEqual(filtered.visibleColumnKeys, ['code', 'name', 'approvedBudget', 'paidAmount']);
    assert.ok(filtered.totalsRow);
    assert.equal(filtered.totalsRow?.approvedBudget, firstProj.approvedBudget);
  });

  it('computes real dashboard analytics and period progress variance', () => {
    const dash = computeReportsDashboardAnalytics({
      projects: INITIAL_PROJECTS,
      transactions: INITIAL_TRANSACTIONS,
      role: 'admin',
      lang: 'ar',
    });

    assert.equal(dash.totalProjects, INITIAL_PROJECTS.length);
    assert.equal(dash.activeClearances, INITIAL_TRANSACTIONS.length);
    assert.equal(dash.availableReportsCount, REPORT_DEFINITIONS.length);
    assert.ok(dash.statusDonut.data.length > 0);
    assert.ok(dash.comparisonBar.data.length > 0);
    assert.ok(dash.authorityDonut.data.length > 0);
  });

  it('escapes CSV formulas and prepends UTF-8 BOM + generates multi-sheet Excel workbooks', () => {
    assert.equal(formatCsvCell('=CMD|calc'), '"\'=CMD|calc"');
    assert.equal(formatCsvCell('+SUM(A1:A2)'), '"\'+SUM(A1:A2)"');
    assert.equal(formatCsvCell('Project "Al Madam"'), '"Project ""Al Madam"""');

    const report = generateReport({
      definitionId: 'exec_portfolio_summary',
      lang: 'ar',
      role: 'admin',
      actorName: 'Admin',
      projects: INITIAL_PROJECTS.slice(0, 5),
      transactions: INITIAL_TRANSACTIONS,
      rateLibrary: INITIAL_RATE_LIBRARY,
      company: DEFAULT_COMPANY_PROFILE,
      alerts: BASE_ALERTS,
      auditLogs: [],
    });

    const csv = buildReportCsvString(report);
    assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Arabic Excel');
    assert.ok(csv.includes(report.reportNumber));

    const wb = buildReportWorkbook(report, DEFAULT_COMPANY_PROFILE);
    assert.equal(wb.SheetNames.length, 2);
  });

  it('manages 7 customizable templates, print defaults, saved reports, favorites, and audit logs cleanly', () => {
    const templates = cloneDefaultTemplates();
    assert.equal(Object.keys(templates).length, 7);
    assert.equal(DEFAULT_PRINT_SETTINGS.paperSize, 'A4');
    assert.equal(DEFAULT_REPORT_TEMPLATES.official.showOfficialStamp, true);

    let store = createDefaultReportsWorkspace();
    store = upsertSavedReportInState(store, {
      id: 'saved-1',
      reportNumber: 'BNY-PRJ-2026-9001',
      definitionId: 'proj_status_registry',
      category: 'projects',
      titleAr: 'سجل المشاريع',
      titleEn: 'Projects Registry',
      isFavorite: false,
      createdAt: '2026-11-23T10:00:00.000Z',
      updatedAt: '2026-11-23T10:00:00.000Z',
      createdBy: 'Admin',
      createdRole: 'admin',
      templateId: 'projects',
      lang: 'ar',
      filters: {
        dateFrom: '',
        dateTo: '',
        projectId: 'all',
        clientName: 'all',
        engineerName: 'all',
        status: 'all',
        subCategory: 'all',
        keyword: '',
        sortColumn: '',
        sortDirection: 'desc',
        groupBy: 'none',
      },
      visibleColumnKeys: ['code', 'name', 'status'],
      notes: 'Approved',
      showTotals: true,
      showKpis: true,
      showCharts: false,
      showSignatures: true,
      showStamp: true,
      rowCount: 56,
    });

    assert.equal(store.savedReports.length, 1);
    store = toggleFavoriteInState(store, 'saved-1');
    assert.equal(store.savedReports[0].isFavorite, true);

    store = appendPrintAuditLogInState(store, {
      id: 'log-1',
      reportNumber: 'BNY-PRJ-2026-9001',
      reportTitleAr: 'سجل المشاريع',
      reportTitleEn: 'Projects Registry',
      definitionId: 'proj_status_registry',
      action: 'print',
      actorName: 'Admin',
      actorRole: 'admin',
      templateId: 'projects',
      paperSize: 'A4',
      orientation: 'portrait',
      rowCount: 56,
      timestamp: '2026-11-23T10:05:00.000Z',
    });
    assert.equal(store.auditLogs.length, 1);

    store = deleteSavedReportInState(store, 'saved-1');
    assert.equal(store.savedReports.length, 0);
  });
});
