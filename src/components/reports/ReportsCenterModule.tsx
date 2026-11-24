import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  BookMarked,
  Check,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  FolderKanban,
  Globe,
  History,
  LayoutTemplate,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  CompanyProfile,
  GovernmentTransaction,
  Language,
  Project,
  RateLibraryItem,
  Role,
} from '../../types/bunyan';
import type {
  GeneratedReport,
  MarginPreset,
  PageOrientation,
  PaperSize,
  PrintAuditLogEntry,
  PrintExportAction,
  PrintSettings,
  ReportAccentPalette,
  ReportFilterState,
  ReportModuleCategory,
  ReportTemplate,
  ReportTemplateStyleId,
  ReportTypeId,
  ReportsWorkspaceStorage,
  SavedReportRecord,
} from '../../types/reports';
import type { WorkspaceAlert } from '../../utils/workspaceAlerts';
import { getRolePermissions } from '../../utils/rbacPermissions';
import {
  DEFAULT_REPORT_FILTERS,
  REPORT_CATEGORY_META,
  computeReportsDashboardAnalytics,
  generateReport,
  generateReportNumber,
  getAvailableReportDefinitions,
  getReportDefinitionById,
} from '../../utils/reportEngine';
import {
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_REPORT_TEMPLATES,
  TEMPLATE_PALETTE_TOKENS,
} from '../../utils/reportTemplates';
import {
  applyDynamicPrintPageStyle,
  clearDynamicPrintPageStyle,
  exportReportToCsv,
  exportReportToExcel,
  exportReportToPdf,
} from '../../utils/reportExportEngine';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Select,
  StatusIndicator,
  useToast,
} from '../ui';
import { PrintableReportDocument } from './PrintableReportDocument';
import { ReportVisualCharts } from './ReportVisualCharts';

type ReportsTabId =
  | 'dashboard'
  | 'catalog'
  | 'builder'
  | 'archive'
  | 'audit'
  | 'templates';

interface ReportsCenterModuleProps {
  projects: Project[];
  activeProject: Project;
  transactions: GovernmentTransaction[];
  rateLibrary: RateLibraryItem[];
  company: CompanyProfile;
  alerts: WorkspaceAlert[];
  lang: Language;
  currentRole: Role;
  actorName: string;
  storageState: ReportsWorkspaceStorage;
  onSaveStorage: (updater: (prev: ReportsWorkspaceStorage) => ReportsWorkspaceStorage) => void;
  onRecordAuditLog: (entry: Omit<PrintAuditLogEntry, 'id' | 'timestamp'>) => void;
}

export const ReportsCenterModule: React.FC<ReportsCenterModuleProps> = ({
  projects,
  activeProject,
  transactions,
  rateLibrary,
  company,
  alerts,
  lang,
  currentRole,
  actorName,
  storageState,
  onSaveStorage,
  onRecordAuditLog,
}) => {
  const isAr = lang === 'ar';
  const { pushToast } = useToast();
  const perms = useMemo(() => getRolePermissions(currentRole), [currentRole]);

  const availableDefs = useMemo(() => getAvailableReportDefinitions(currentRole), [currentRole]);

  const [activeTab, setActiveTab] = useState<ReportsTabId>('dashboard');
  const [catalogCategory, setCatalogCategory] = useState<'all' | ReportModuleCategory>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Builder state
  const [selectedDefId, setSelectedDefId] = useState<ReportTypeId>(
    availableDefs[0]?.id || 'exec_portfolio_summary'
  );
  const [reportLang, setReportLang] = useState<Language>(lang);
  const [selectedTemplateId, setSelectedTemplateId] = useState<ReportTemplateStyleId>(
    availableDefs[0]?.recommendedTemplate || 'official'
  );
  const [filters, setFilters] = useState<ReportFilterState>(DEFAULT_REPORT_FILTERS);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([]);
  const [showTotals, setShowTotals] = useState(true);
  const [showKpis, setShowKpis] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  const [showSignatures, setShowSignatures] = useState(true);
  const [showStamp, setShowStamp] = useState(true);
  const [customTitle, setCustomTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [reportNumber, setReportNumber] = useState<string>(() =>
    generateReportNumber(availableDefs[0]?.id || 'exec_portfolio_summary')
  );
  const [exportingPdf, setExportingPdf] = useState(false);

  // Archive & Audit filters
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveFavoritesOnly, setArchiveFavoritesOnly] = useState(false);
  const [archiveCategory, setArchiveCategory] = useState<'all' | ReportModuleCategory>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');

  // Template manager state
  const [editingTemplateId, setEditingTemplateId] = useState<ReportTemplateStyleId>('official');

  const offscreenSheetRef = useRef<HTMLDivElement | null>(null);

  // Ensure selected definition stays RBAC-valid when role switches
  useEffect(() => {
    const stillAllowed = availableDefs.some((d) => d.id === selectedDefId);
    if (!stillAllowed && availableDefs[0]) {
      const nextDef = availableDefs[0];
      setSelectedDefId(nextDef.id);
      setSelectedTemplateId(nextDef.recommendedTemplate);
      setReportNumber(generateReportNumber(nextDef.id));
    }
  }, [availableDefs, selectedDefId]);

  const currentDef = useMemo(
    () => availableDefs.find((d) => d.id === selectedDefId) || availableDefs[0],
    [availableDefs, selectedDefId]
  );

  // Reset visible columns when definition changes unless loaded from archive
  useEffect(() => {
    if (!currentDef) return;
    const allowedCols = currentDef.columns.filter(
      (c) => !c.sensitiveFinancial || perms.canViewFinancialReports
    );
    setVisibleColumnKeys((prev) => {
      const allowedSet = new Set(allowedCols.map((c) => c.key));
      const preserved = prev.filter((k) => allowedSet.has(k));
      if (preserved.length > 0 && activeSavedId) return preserved;
      return allowedCols.filter((c) => c.defaultVisible !== false).map((c) => c.key);
    });
  }, [currentDef, perms.canViewFinancialReports, activeSavedId]);

  // Cleanup browser print classes
  useEffect(() => {
    const onAfterPrint = () => {
      document.body.classList.remove('bunyan-printing-report-center');
      clearDynamicPrintPageStyle();
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
      onAfterPrint();
    };
  }, []);

  const activeTemplate: ReportTemplate = useMemo(
    () =>
      storageState.customTemplates[selectedTemplateId] ||
      DEFAULT_REPORT_TEMPLATES[selectedTemplateId] ||
      DEFAULT_REPORT_TEMPLATES.official,
    [storageState.customTemplates, selectedTemplateId]
  );

  // Distinct dropdown options derived from live projects & transactions
  const clientOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.ownerName).filter(Boolean))).sort(),
    [projects]
  );
  const engineerOptions = useMemo(() => {
    const set = new Set<string>();
    projects.forEach((p) => {
      if (p.residentEngineer) set.add(p.residentEngineer);
      if (p.consultantEngineer) set.add(p.consultantEngineer);
    });
    transactions.forEach((t) => {
      if (t.reviewEngineer) set.add(t.reviewEngineer);
    });
    storageState.auditLogs.forEach((l) => {
      if (l.actorName) set.add(l.actorName);
    });
    return Array.from(set).sort();
  }, [projects, transactions, storageState.auditLogs]);

  const generatedReport: GeneratedReport | null = useMemo(() => {
    if (!currentDef) return null;
    try {
      return generateReport({
        definitionId: currentDef.id,
        lang: reportLang,
        role: currentRole,
        actorName,
        projects,
        transactions,
        rateLibrary,
        company,
        alerts,
        auditLogs: storageState.auditLogs,
        templateId: selectedTemplateId,
        filters,
        visibleColumnKeys,
        notes,
        showTotals,
        showKpis,
        showCharts,
        showSignatures,
        showStamp,
        customTitleAr: customTitle && reportLang === 'ar' ? customTitle : undefined,
        customTitleEn: customTitle && reportLang === 'en' ? customTitle : undefined,
        reportNumber,
      });
    } catch {
      return null;
    }
  }, [
    currentDef,
    reportLang,
    currentRole,
    actorName,
    projects,
    transactions,
    rateLibrary,
    company,
    alerts,
    storageState.auditLogs,
    selectedTemplateId,
    filters,
    visibleColumnKeys,
    notes,
    showTotals,
    showKpis,
    showCharts,
    showSignatures,
    showStamp,
    customTitle,
    reportNumber,
  ]);

  const dashboardAnalytics = useMemo(
    () =>
      computeReportsDashboardAnalytics({
        projects,
        transactions,
        role: currentRole,
        lang,
      }),
    [projects, transactions, currentRole, lang]
  );

  const selectDefinitionForBuilder = (defId: ReportTypeId, overrideTemplate?: ReportTemplateStyleId) => {
    const def = getReportDefinitionById(defId);
    if (!def) return;
    if (def.isFinancial && !perms.canViewFinancialReports) {
      pushToast(
        isAr
          ? 'التقارير المالية متاحة لدور المدير أو المحاسب فقط.'
          : 'Financial reports require Admin or Accountant permissions.',
        'error'
      );
      return;
    }
    const tplId = overrideTemplate || def.recommendedTemplate;
    const tpl = storageState.customTemplates[tplId] || DEFAULT_REPORT_TEMPLATES[tplId];
    setActiveSavedId(null);
    setSelectedDefId(defId);
    setSelectedTemplateId(tplId);
    setFilters({ ...DEFAULT_REPORT_FILTERS });
    setCustomTitle('');
    setNotes(isAr ? tpl.defaultNotesAr : tpl.defaultNotesEn);
    setShowKpis(tpl.showKpiSummary);
    setShowCharts(tpl.showCharts);
    setShowSignatures(tpl.showSignatureBlocks);
    setShowStamp(tpl.showOfficialStamp);
    setShowTotals(true);
    setReportNumber(generateReportNumber(defId));
    setActiveTab('builder');
  };

  const loadSavedReportIntoBuilder = (rec: SavedReportRecord) => {
    const def = getReportDefinitionById(rec.definitionId);
    if (def?.isFinancial && !perms.canViewFinancialReports) {
      pushToast(
        isAr
          ? 'هذا التقرير المالي محجوب عن صلاحيات دورك الحالي.'
          : 'This archived financial report is restricted for your current role.',
        'error'
      );
      return;
    }
    setActiveSavedId(rec.id);
    setSelectedDefId(rec.definitionId);
    setSelectedTemplateId(rec.templateId);
    setReportLang(rec.lang);
    setFilters({ ...DEFAULT_REPORT_FILTERS, ...rec.filters });
    setVisibleColumnKeys(rec.visibleColumnKeys);
    setCustomTitle(rec.lang === 'ar' ? rec.titleAr : rec.titleEn);
    setNotes(rec.notes);
    setShowTotals(rec.showTotals);
    setShowKpis(rec.showKpis);
    setShowCharts(rec.showCharts);
    setShowSignatures(rec.showSignatures);
    setShowStamp(rec.showStamp);
    setReportNumber(rec.reportNumber);
    setActiveTab('builder');
  };

  const logAction = (action: PrintExportAction, rep: GeneratedReport) => {
    onRecordAuditLog({
      reportNumber: rep.reportNumber,
      reportTitleAr: rep.titleAr,
      reportTitleEn: rep.titleEn,
      definitionId: rep.definitionId,
      action,
      actorName,
      actorRole: currentRole,
      templateId: rep.templateId,
      paperSize: storageState.printSettings.paperSize,
      orientation: storageState.printSettings.orientation,
      rowCount: rep.rows.length,
    });
  };

  const handleSaveToArchive = (markFavorite = false) => {
    if (!generatedReport) return;
    if (!perms.canCreateReports) {
      pushToast(isAr ? 'لا تملك صلاحية حفظ التقارير.' : 'Permission denied.', 'error');
      return;
    }
    if (activeSavedId && !perms.canEditReports) {
      pushToast(
        isAr ? 'تحديث التقارير المحفوظة يتطلب صلاحية التعديل.' : 'Updating saved reports requires edit permission.',
        'error'
      );
      return;
    }
    const existing = activeSavedId
      ? storageState.savedReports.find((r) => r.id === activeSavedId)
      : undefined;
    const nowIso = new Date().toISOString();
    const recordId = existing?.id || `rpt-${Date.now()}`;
    const nextRecord: SavedReportRecord = {
      id: recordId,
      reportNumber: generatedReport.reportNumber,
      definitionId: generatedReport.definitionId,
      category: generatedReport.category,
      titleAr: generatedReport.titleAr,
      titleEn: generatedReport.titleEn,
      isFavorite: existing ? existing.isFavorite || markFavorite : markFavorite,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      createdBy: actorName,
      createdRole: currentRole,
      templateId: selectedTemplateId,
      lang: reportLang,
      filters: { ...filters },
      visibleColumnKeys: [...generatedReport.visibleColumnKeys],
      notes,
      showTotals,
      showKpis,
      showCharts,
      showSignatures,
      showStamp,
      rowCount: generatedReport.rows.length,
    };
    onSaveStorage((prev) => {
      const existsInList = prev.savedReports.some((r) => r.id === nextRecord.id);
      return {
        ...prev,
        savedReports: existsInList
          ? prev.savedReports.map((r) => (r.id === nextRecord.id ? nextRecord : r))
          : [nextRecord, ...prev.savedReports],
      };
    });
    setActiveSavedId(recordId);
    logAction('archive', generatedReport);
    pushToast(
      isAr
        ? `تم حفظ التقرير (${generatedReport.reportNumber}) في الأرشيف المركزي`
        : `Saved report (${generatedReport.reportNumber}) to archive`,
      'success'
    );
  };

  const handleDirectPrint = () => {
    if (!generatedReport) return;
    if (!perms.canPrintReports) {
      pushToast(isAr ? 'الطباعة غير مصرح بها لهذا الدور.' : 'Print permission denied.', 'error');
      return;
    }
    applyDynamicPrintPageStyle(storageState.printSettings);
    document.body.classList.add('bunyan-printing-report-center');
    logAction('print', generatedReport);
    window.print();
  };

  const handleExportPdf = async () => {
    if (!generatedReport) return;
    if (!perms.canExportReports) {
      pushToast(isAr ? 'التصدير غير مصرح به لهذا الدور.' : 'Export permission denied.', 'error');
      return;
    }
    const targetEl =
      offscreenSheetRef.current ||
      (document.getElementById('bunyan-report-center-print-sheet') as HTMLDivElement | null);
    if (!targetEl) return;

    setExportingPdf(true);
    try {
      await exportReportToPdf({
        element: targetEl,
        report: generatedReport,
        printSettings: storageState.printSettings,
        company,
      });
      logAction('pdf', generatedReport);
      pushToast(
        isAr ? 'تم تصدير التقرير بصيغة PDF بنجاح' : 'PDF report exported successfully',
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushToast(
        isAr
          ? `تعذر إنشاء ملف PDF (${msg}). استخدم الطباعة المباشرة كبديل.`
          : `PDF export error (${msg}). Use Direct Print as fallback.`,
        'error'
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportExcel = () => {
    if (!generatedReport) return;
    if (!perms.canExportReports) return;
    exportReportToExcel(generatedReport, company);
    logAction('xlsx', generatedReport);
    pushToast(isAr ? 'تم تصدير ملف Excel (.xlsx) بنجاح' : 'Excel workbook exported', 'success');
  };

  const handleExportCsv = () => {
    if (!generatedReport) return;
    if (!perms.canExportReports) return;
    exportReportToCsv(generatedReport);
    logAction('csv', generatedReport);
    pushToast(isAr ? 'تم تصدير ملف CSV بترميز UTF-8 بنجاح' : 'CSV exported (UTF-8 BOM)', 'success');
  };

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return availableDefs.filter((def) => {
      if (catalogCategory !== 'all' && def.category !== catalogCategory) return false;
      if (!q) return true;
      return (
        def.titleAr.toLowerCase().includes(q) ||
        def.titleEn.toLowerCase().includes(q) ||
        def.descriptionAr.toLowerCase().includes(q) ||
        def.descriptionEn.toLowerCase().includes(q)
      );
    });
  }, [availableDefs, catalogCategory, catalogSearch]);

  const filteredSavedReports = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    return storageState.savedReports.filter((rec) => {
      const def = getReportDefinitionById(rec.definitionId);
      if (def?.isFinancial && !perms.canViewFinancialReports) return false;
      if (archiveFavoritesOnly && !rec.isFavorite) return false;
      if (archiveCategory !== 'all' && rec.category !== archiveCategory) return false;
      if (!q) return true;
      return (
        rec.reportNumber.toLowerCase().includes(q) ||
        rec.titleAr.toLowerCase().includes(q) ||
        rec.titleEn.toLowerCase().includes(q) ||
        rec.createdBy.toLowerCase().includes(q)
      );
    });
  }, [
    storageState.savedReports,
    archiveSearch,
    archiveFavoritesOnly,
    archiveCategory,
    perms.canViewFinancialReports,
  ]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return storageState.auditLogs.filter((entry) => {
      if (auditActionFilter !== 'all' && entry.action !== auditActionFilter) return false;
      if (!q) return true;
      return (
        entry.reportNumber.toLowerCase().includes(q) ||
        entry.reportTitleAr.toLowerCase().includes(q) ||
        entry.reportTitleEn.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q)
      );
    });
  }, [storageState.auditLogs, auditSearch, auditActionFilter]);

  const favoritesCount = useMemo(
    () => storageState.savedReports.filter((r) => r.isFavorite).length,
    [storageState.savedReports]
  );

  const editingTemplate: ReportTemplate =
    storageState.customTemplates[editingTemplateId] || DEFAULT_REPORT_TEMPLATES[editingTemplateId];

  const updateEditingTemplate = (patch: Partial<ReportTemplate>) => {
    if (!perms.canManageTemplates) {
      pushToast(
        isAr ? 'تعديل القوالب متاح لدور المدير (Admin) فقط.' : 'Template management requires Admin role.',
        'error'
      );
      return;
    }
    onSaveStorage((prev) => ({
      ...prev,
      customTemplates: {
        ...prev.customTemplates,
        [editingTemplateId]: {
          ...editingTemplate,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const updatePrintSettings = (patch: Partial<PrintSettings>) => {
    onSaveStorage((prev) => ({
      ...prev,
      printSettings: {
        ...prev.printSettings,
        ...patch,
      },
    }));
  };

  const navTabs: Array<{ id: ReportsTabId; labelAr: string; labelEn: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'dashboard', labelAr: 'لوحة تحكم التقارير', labelEn: 'Reports Dashboard', icon: BarChart3 },
    { id: 'catalog', labelAr: 'جميع التقارير والأقسام', labelEn: 'All Reports & Modules', icon: FolderKanban, badge: availableDefs.length },
    { id: 'builder', labelAr: 'منشئ ومعاينة التقارير', labelEn: 'Builder & Print Preview', icon: SlidersHorizontal },
    { id: 'archive', labelAr: 'المحفوظة والمفضلة', labelEn: 'Saved & Favorites', icon: Archive, badge: storageState.savedReports.length },
    { id: 'audit', labelAr: 'سجل الطباعة والتصدير', labelEn: 'Print & Export Log', icon: History, badge: storageState.auditLogs.length },
    { id: 'templates', labelAr: 'القوالب وإعدادات الطباعة', labelEn: 'Templates & Print Setup', icon: LayoutTemplate },
  ];

  return (
    <div className="space-y-6">
      {/* Unified Header & Module Navigation Bar */}
      <Card padded className="no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-[#B4863C]" />
              <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                {isAr ? 'مركز التقارير والطباعة المؤسسي' : 'Central Reports & Printing Operating System'}
              </h2>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {isAr
                ? `منظومة تقارير حية مرتبطة بـ ${projects.length} مشروعاً و ${transactions.length} معاملة حكومية · إعداد الورق النشط: ${storageState.printSettings.paperSize} (${storageState.printSettings.orientation})`
                : `Live workspace engine across ${projects.length} projects & ${transactions.length} clearances · Paper: ${storageState.printSettings.paperSize} (${storageState.printSettings.orientation})`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusIndicator
              tone={perms.canViewFinancialReports ? 'success' : 'neutral'}
              label={
                perms.canViewFinancialReports
                  ? isAr ? `صلاحية كاملة (${currentRole})` : `Full Access (${currentRole})`
                  : isAr ? `صلاحية هندسية دون تقارير مالية (${currentRole})` : `Engineering Scope (${currentRole})`
              }
            />
            <Button
              size="sm"
              variant="primary"
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={() => selectDefinitionForBuilder('exec_portfolio_summary', 'statistical')}
            >
              {isAr ? 'إصدار تقرير تنفيذي فوري' : 'Quick Executive Brief'}
            </Button>
          </div>
        </div>

        {/* Sub-navigation tabs */}
        <div className="mt-4 pt-3 border-t border-[var(--border-hairline)] flex flex-wrap gap-1.5">
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bunyan-transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#B4863C] text-white'
                    : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{isAr ? tab.labelAr : tab.labelEn}</span>
                {tab.badge !== undefined && (
                  <span
                    dir="ltr"
                    className={`font-mono tabular-nums text-[10.5px] px-1.5 py-0.5 rounded ${
                      active ? 'bg-white/20 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ==================== TAB 1: REPORTS DASHBOARD ==================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 no-print">
          {/* Top KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card padded>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{isAr ? 'التقارير المتاحة لدورك' : 'Available Report Types'}</span>
                <FolderKanban className="w-4 h-4 text-[#B4863C]" />
              </div>
              <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-2">
                {dashboardAnalytics.availableReportsCount}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">
                {isAr ? 'موزعة على 4 قطاعات تشغيلية' : 'Across 4 live operational modules'}
              </div>
            </Card>

            <Card padded>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{isAr ? 'التقارير المحفوظة والمفضلة' : 'Archived & Favorites'}</span>
                <BookMarked className="w-4 h-4 text-emerald-500" />
              </div>
              <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-2">
                {storageState.savedReports.length}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">
                {isAr ? `منها ${favoritesCount} تقارير مفضلة` : `${favoritesCount} marked as favorite`}
              </div>
            </Card>

            <Card padded>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{isAr ? 'عمليات الطباعة والتصدير' : 'Print & Export Operations'}</span>
                <History className="w-4 h-4 text-sky-500" />
              </div>
              <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-2">
                {storageState.auditLogs.length}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-1">
                {isAr ? 'مسجلة وموثقة في سجل التدقيق' : 'Tracked in print audit log'}
              </div>
            </Card>

            <Card padded>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{isAr ? 'مقارنة الإنجاز الفعلي بالمخطط' : 'Actual vs Planned Progress'}</span>
                <BarChart3 className="w-4 h-4 text-[#B4863C]" />
              </div>
              <div dir="ltr" className="text-2xl font-bold font-mono tabular-nums text-[var(--text-primary)] mt-2">
                {dashboardAnalytics.avgActualProgress}%
              </div>
              <div
                className={`text-[11px] font-mono tabular-nums mt-1 ${
                  dashboardAnalytics.progressPeriodDelta >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {dashboardAnalytics.progressPeriodDelta >= 0 ? '+' : ''}
                {dashboardAnalytics.progressPeriodDelta}%{' '}
                {isAr
                  ? `مقابل المخطط (${dashboardAnalytics.avgPlannedProgress}%)`
                  : `vs planned (${dashboardAnalytics.avgPlannedProgress}%)`}
              </div>
            </Card>
          </div>

          {/* Interactive SVG Charts */}
          <ReportVisualCharts
            series={[
              dashboardAnalytics.statusDonut,
              dashboardAnalytics.comparisonBar,
              dashboardAnalytics.authorityDonut,
            ]}
            lang={lang}
          />

          {/* Quick-Launch Reports by Department */}
          <Card>
            <CardHeader
              icon={<FileText className="w-4 h-4" />}
              title={isAr ? 'التقارير الموصى بها حسب القسم' : 'Recommended Reports by Department'}
              subtitle={
                isAr
                  ? 'انقر لفتح التقرير مباشرة في محرك المعاينة والطباعة الرسمية'
                  : 'Launch any live dataset report directly into print & export preview'
              }
              action={
                <Button
                  size="xs"
                  icon={<FileDown className="w-3.5 h-3.5" />}
                  onClick={() => selectDefinitionForBuilder('exec_portfolio_summary', 'statistical')}
                >
                  {isAr ? 'تصدير لوحة المؤشرات' : 'Export Dashboard Report'}
                </Button>
              }
            />
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {availableDefs.slice(0, 6).map((def) => (
                <div
                  key={def.id}
                  className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="text-[11px] font-semibold text-[#B4863C]">
                      {isAr
                        ? REPORT_CATEGORY_META[def.category].labelAr
                        : REPORT_CATEGORY_META[def.category].labelEn}
                    </div>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] mt-1">
                      {isAr ? def.titleAr : def.titleEn}
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2">
                      {isAr ? def.descriptionAr : def.descriptionEn}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-hairline)]">
                    <span className="text-[10.5px] font-mono text-[var(--text-muted)]">
                      {def.columns.length} {isAr ? 'عمود' : 'cols'}
                    </span>
                    <Button size="xs" onClick={() => selectDefinitionForBuilder(def.id)}>
                      {isAr ? 'إعداد ومعاينة' : 'Build & Preview'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ==================== TAB 2: ALL REPORTS & DEPARTMENTS ==================== */}
      {activeTab === 'catalog' && (
        <div className="space-y-5 no-print">
          <Card padded>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full sm:w-80">
                <Input
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  startIcon={<Search className="w-3.5 h-3.5" />}
                  placeholder={isAr ? 'بحث متقدم في كافة تقارير المنصة...' : 'Search all platform reports...'}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCatalogCategory('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    catalogCategory === 'all'
                      ? 'bg-[#B4863C] text-white border-[#B4863C]'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  {isAr ? `الكل (${availableDefs.length})` : `All (${availableDefs.length})`}
                </button>
                {(['executive', 'financials', 'projects', 'clients'] as ReportModuleCategory[]).map(
                  (cat) => {
                    if (cat === 'financials' && !perms.canViewFinancialReports) return null;
                    const count = availableDefs.filter((d) => d.category === cat).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCatalogCategory(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          catalogCategory === cat
                            ? 'bg-[#B4863C] text-white border-[#B4863C]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {isAr ? REPORT_CATEGORY_META[cat].labelAr : REPORT_CATEGORY_META[cat].labelEn} ({count})
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {!perms.canViewFinancialReports && (
              <div className="mt-3 px-3.5 py-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  {isAr
                    ? 'تم إخفاء قسم التقارير المالية تلقائياً وفق سياسة الصلاحيات للدور الحالي (Engineer).'
                    : 'Financial reports are automatically restricted by RBAC for your current role.'}
                </span>
              </div>
            )}
          </Card>

          {filteredCatalog.length === 0 ? (
            <Card padded>
              <EmptyState
                title={isAr ? 'لا توجد تقارير مطابقة' : 'No Matching Reports'}
                description={isAr ? 'جرب تعديل عبارة البحث أو القسم المحدد.' : 'Try adjusting search keywords or category.'}
                actionLabel={isAr ? 'عرض الكل' : 'Reset'}
                onAction={() => {
                  setCatalogSearch('');
                  setCatalogCategory('all');
                }}
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredCatalog.map((def) => (
                <Card key={def.id} padded className="flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#B4863C]">
                        {isAr
                          ? REPORT_CATEGORY_META[def.category].labelAr
                          : REPORT_CATEGORY_META[def.category].labelEn}
                      </span>
                      <span className="text-[10.5px] font-mono text-[var(--text-muted)]">
                        {isAr
                          ? DEFAULT_REPORT_TEMPLATES[def.recommendedTemplate].nameAr
                          : DEFAULT_REPORT_TEMPLATES[def.recommendedTemplate].nameEn}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {isAr ? def.titleAr : def.titleEn}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      {isAr ? def.descriptionAr : def.descriptionEn}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {def.supportsDateRange ? (isAr ? 'يدعم الفترة الزمنية' : 'Date Filter') : ''}
                    </span>
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => selectDefinitionForBuilder(def.id)}
                    >
                      {isAr ? 'فتح في منشئ التقارير' : 'Open Builder'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: DYNAMIC REPORT BUILDER & PREVIEW ==================== */}
      {activeTab === 'builder' && currentDef && generatedReport && (
        <div className="space-y-5">
          {/* Action & Export Toolbar */}
          <Card padded className="no-print">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="text-xs font-mono font-bold text-[#B4863C]">
                    {generatedReport.reportNumber}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">·</span>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {isAr ? currentDef.titleAr : currentDef.titleEn}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {generatedReport.rows.length} {isAr ? 'سجل مطابق' : 'matching rows'} ·{' '}
                  {isAr ? activeTemplate.nameAr : activeTemplate.nameEn} ·{' '}
                  {storageState.printSettings.paperSize} ({storageState.printSettings.orientation})
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  icon={<Globe className="w-3.5 h-3.5" />}
                  onClick={() => setReportLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                >
                  {reportLang === 'ar' ? 'لغة التقرير: العربية' : 'Report: English'}
                </Button>

                {perms.canCreateReports && (
                  <Button
                    size="xs"
                    icon={<Save className="w-3.5 h-3.5" />}
                    onClick={() => handleSaveToArchive(false)}
                  >
                    {activeSavedId
                      ? isAr ? 'تحديث المحفوظ' : 'Update Saved'
                      : isAr ? 'حفظ بالأرشيف' : 'Save Archive'}
                  </Button>
                )}

                {perms.canCreateReports && (
                  <Button
                    size="xs"
                    icon={<Star className="w-3.5 h-3.5 text-amber-500" />}
                    onClick={() => handleSaveToArchive(true)}
                  >
                    {isAr ? 'حفظ بالمفضلة' : 'Save Favorite'}
                  </Button>
                )}

                {perms.canExportReports && (
                  <>
                    <Button
                      size="xs"
                      icon={<FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />}
                      onClick={handleExportExcel}
                    >
                      Excel
                    </Button>
                    <Button
                      size="xs"
                      icon={<Download className="w-3.5 h-3.5" />}
                      onClick={handleExportCsv}
                    >
                      CSV
                    </Button>
                    <Button
                      size="xs"
                      variant="primary"
                      disabled={exportingPdf}
                      icon={
                        exportingPdf ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )
                      }
                      onClick={handleExportPdf}
                    >
                      {exportingPdf ? (isAr ? 'جاري التجهيز...' : 'Generating...') : 'PDF'}
                    </Button>
                  </>
                )}

                {perms.canPrintReports && (
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={<Printer className="w-3.5 h-3.5" />}
                    onClick={handleDirectPrint}
                  >
                    {isAr ? 'طباعة مباشرة' : 'Print'}
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* Left / Start Controls Panel */}
            <Card padded className="xl:col-span-4 space-y-4 no-print">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                  <Filter className="w-4 h-4 text-[#B4863C]" />
                  <span>{isAr ? 'إعداد التقرير والفلاتر' : 'Report Config & Filters'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFilters({ ...DEFAULT_REPORT_FILTERS })}
                  className="text-[11px] text-[#B4863C] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
                </button>
              </div>

              {/* Report Type & Template */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                    {isAr ? 'نوع التقرير' : 'Report Type'}
                  </label>
                  <Select
                    value={selectedDefId}
                    onChange={(e) => selectDefinitionForBuilder(e.target.value as ReportTypeId)}
                  >
                    {availableDefs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {isAr ? d.titleAr : d.titleEn}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'القالب المعتمد' : 'Template'}
                    </label>
                    <Select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value as ReportTemplateStyleId)}
                    >
                      {(Object.keys(storageState.customTemplates) as ReportTemplateStyleId[]).map(
                        (tid) => (
                          <option key={tid} value={tid}>
                            {isAr
                              ? storageState.customTemplates[tid].nameAr
                              : storageState.customTemplates[tid].nameEn}
                          </option>
                        )
                      )}
                    </Select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'حالة السجلات' : 'Status Filter'}
                    </label>
                    <Select
                      value={filters.status}
                      onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    >
                      {currentDef.statusOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {isAr ? opt.labelAr : opt.labelEn}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Keyword & Date Range */}
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                    {isAr ? 'بحث نصي داخل التقرير' : 'Keyword Filter'}
                  </label>
                  <Input
                    value={filters.keyword}
                    onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                    startIcon={<Search className="w-3.5 h-3.5" />}
                    placeholder={isAr ? 'كود، اسم، وصف، رقم...' : 'Code, name, ref...'}
                  />
                </div>

                {currentDef.supportsDateRange && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        {isAr ? 'من تاريخ' : 'From Date'}
                      </label>
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        {isAr ? 'إلى تاريخ' : 'To Date'}
                      </label>
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* Entity Filters: Project, Client, Engineer */}
                {currentDef.supportsProjectFilter && (
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'المشروع' : 'Project'}
                    </label>
                    <Select
                      value={filters.projectId}
                      onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))}
                    >
                      <option value="all">{isAr ? 'كافة المشاريع' : 'All Projects'}</option>
                      <option value={activeProject.id}>
                        ★ {activeProject.code} · {isAr ? activeProject.name : activeProject.nameEn}
                      </option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {isAr ? p.name : p.nameEn}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentDef.supportsClientFilter && (
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        {isAr ? 'المالك / العميل' : 'Client / Owner'}
                      </label>
                      <Select
                        value={filters.clientName}
                        onChange={(e) => setFilters((f) => ({ ...f, clientName: e.target.value }))}
                      >
                        <option value="all">{isAr ? 'الكل' : 'All'}</option>
                        {clientOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}

                  {currentDef.supportsEngineerFilter && (
                    <div>
                      <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                        {isAr ? 'المستخدم / المهندس' : 'Engineer / User'}
                      </label>
                      <Select
                        value={filters.engineerName}
                        onChange={(e) => setFilters((f) => ({ ...f, engineerName: e.target.value }))}
                      >
                        <option value="all">{isAr ? 'الكل' : 'All'}</option>
                        {engineerOptions.map((eng) => (
                          <option key={eng} value={eng}>
                            {eng}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>

                {/* Sorting & Grouping */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-hairline)]">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'الترتيب حسب' : 'Sort Column'}
                    </label>
                    <Select
                      value={filters.sortColumn}
                      onChange={(e) => setFilters((f) => ({ ...f, sortColumn: e.target.value }))}
                    >
                      <option value="">{isAr ? 'الافتراضي' : 'Default'}</option>
                      {generatedReport.columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {isAr ? c.labelAr : c.labelEn}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'التجميع حسب' : 'Group By'}
                    </label>
                    <Select
                      value={filters.groupBy}
                      onChange={(e) => setFilters((f) => ({ ...f, groupBy: e.target.value }))}
                    >
                      <option value="none">{isAr ? 'بدون تجميع' : 'No Grouping'}</option>
                      {generatedReport.columns
                        .filter((c) => c.format === 'badge' || c.format === 'text')
                        .map((c) => (
                          <option key={c.key} value={c.key}>
                            {isAr ? c.labelAr : c.labelEn}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>

                {filters.sortColumn && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, sortDirection: 'asc' }))}
                      className={`flex-1 py-1.5 rounded-lg border cursor-pointer ${
                        filters.sortDirection === 'asc'
                          ? 'bg-[#B4863C] text-white border-[#B4863C]'
                          : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {isAr ? 'تصاعدي (A-Z / 0-9)' : 'Ascending'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, sortDirection: 'desc' }))}
                      className={`flex-1 py-1.5 rounded-lg border cursor-pointer ${
                        filters.sortDirection === 'desc'
                          ? 'bg-[#B4863C] text-white border-[#B4863C]'
                          : 'border-[var(--border-hairline)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {isAr ? 'تنازلي (Z-A / 9-0)' : 'Descending'}
                    </button>
                  </div>
                )}

                {/* Column Selector */}
                <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                    {isAr ? 'الأعمدة الظاهرة في التقرير' : 'Visible Report Columns'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {generatedReport.columns.map((col) => {
                      const checked = generatedReport.visibleColumnKeys.includes(col.key);
                      return (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => {
                            setVisibleColumnKeys((prev) => {
                              const current = prev.length > 0 ? prev : generatedReport.visibleColumnKeys;
                              if (current.includes(col.key)) {
                                if (current.length <= 1) return current;
                                return current.filter((k) => k !== col.key);
                              }
                              return [...current, col.key];
                            });
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] border cursor-pointer ${
                            checked
                              ? 'bg-[#B4863C]/15 border-[#B4863C] text-[var(--text-primary)] font-semibold'
                              : 'border-[var(--border-hairline)] text-[var(--text-muted)]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 text-[#B4863C]" />}
                          <span>{isAr ? col.labelAr : col.labelEn}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Display Toggles */}
                <div className="pt-2 border-t border-[var(--border-hairline)] grid grid-cols-2 gap-2 text-xs">
                  {[
                    { val: showTotals, set: setShowTotals, ar: 'صف الإجماليات', en: 'Totals Row' },
                    { val: showKpis, set: setShowKpis, ar: 'بطاقات المؤشرات', en: 'KPI Cards' },
                    { val: showCharts, set: setShowCharts, ar: 'الرسوم البيانية', en: 'SVG Charts' },
                    { val: showSignatures, set: setShowSignatures, ar: 'التواقيع', en: 'Signatures' },
                    { val: showStamp, set: setShowStamp, ar: 'الختم الرسمي', en: 'Official Stamp' },
                  ].map((item, idx) => (
                    <label key={idx} className="inline-flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={item.val}
                        onChange={(e) => item.set(e.target.checked)}
                        className="rounded border-[var(--border-hairline)] accent-[#B4863C]"
                      />
                      <span>{isAr ? item.ar : item.en}</span>
                    </label>
                  ))}
                </div>

                {/* Custom Title & Notes */}
                <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'عنوان مخصص (اختياري)' : 'Custom Report Title'}
                    </label>
                    <Input
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder={isAr ? currentDef.titleAr : currentDef.titleEn}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                      {isAr ? 'ملاحظات واعتمادات التقرير' : 'Report Notes & Approvals'}
                    </label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] p-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#B4863C]/60"
                      placeholder={isAr ? 'أضف أي ملاحظات هندسية أو إدارية...' : 'Add remarks or approval notes...'}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Right / End: Live Printable Preview */}
            <div className="xl:col-span-8 rounded-xl border border-[var(--border-hairline)] bg-slate-200/70 dark:bg-slate-900/90 p-3 sm:p-5 overflow-x-auto no-print">
              <PrintableReportDocument
                report={generatedReport}
                template={activeTemplate}
                printSettings={storageState.printSettings}
                company={company}
              />
            </div>
          </div>

          {/* Dedicated Off-screen & Direct Print Sheet */}
          <PrintableReportDocument
            id="bunyan-report-center-print-sheet"
            sheetRef={offscreenSheetRef}
            report={generatedReport}
            template={activeTemplate}
            printSettings={storageState.printSettings}
            company={company}
            isOffscreen
          />
        </div>
      )}

      {/* ==================== TAB 4: SAVED ARCHIVE & FAVORITES ==================== */}
      {activeTab === 'archive' && (
        <div className="space-y-4 no-print">
          <Card padded>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                <div className="w-64">
                  <Input
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    startIcon={<Search className="w-3.5 h-3.5" />}
                    placeholder={isAr ? 'بحث برقم التقرير أو العنوان...' : 'Search archive...'}
                  />
                </div>
                <div className="w-48">
                  <Select
                    value={archiveCategory}
                    onChange={(e) => setArchiveCategory(e.target.value as 'all' | ReportModuleCategory)}
                  >
                    <option value="all">{isAr ? 'كل الأقسام' : 'All Categories'}</option>
                    <option value="executive">{isAr ? REPORT_CATEGORY_META.executive.labelAr : REPORT_CATEGORY_META.executive.labelEn}</option>
                    {perms.canViewFinancialReports && (
                      <option value="financials">{isAr ? REPORT_CATEGORY_META.financials.labelAr : REPORT_CATEGORY_META.financials.labelEn}</option>
                    )}
                    <option value="projects">{isAr ? REPORT_CATEGORY_META.projects.labelAr : REPORT_CATEGORY_META.projects.labelEn}</option>
                    <option value="clients">{isAr ? REPORT_CATEGORY_META.clients.labelAr : REPORT_CATEGORY_META.clients.labelEn}</option>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => setArchiveFavoritesOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                    archiveFavoritesOnly
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Star className="w-3.5 h-3.5" />
                  <span>{isAr ? `المفضلة فقط (${favoritesCount})` : `Favorites (${favoritesCount})`}</span>
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<Archive className="w-4 h-4" />}
              title={isAr ? `التقارير المحفوظة (${filteredSavedReports.length})` : `Saved Reports Archive (${filteredSavedReports.length})`}
            />
            {filteredSavedReports.length === 0 ? (
              <EmptyState
                title={isAr ? 'الأرشيف فارغ حالياً' : 'No Saved Reports Yet'}
                description={
                  isAr
                    ? 'افتح أي تقرير في "منشئ ومعاينة التقارير" واضغط "حفظ بالأرشيف" لحفظه والرجوع إليه لاحقاً.'
                    : 'Generate a report in the Builder tab and save it to populate your archive.'
                }
                actionLabel={isAr ? 'فتح منشئ التقارير' : 'Open Builder'}
                onAction={() => setActiveTab('builder')}
              />
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {filteredSavedReports.map((rec) => (
                  <div
                    key={rec.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-[var(--bg-surface-subtle)]"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() =>
                          onSaveStorage((prev) => ({
                            ...prev,
                            savedReports: prev.savedReports.map((r) =>
                              r.id === rec.id ? { ...r, isFavorite: !r.isFavorite } : r
                            ),
                          }))
                        }
                        aria-label="Toggle favorite"
                        className="mt-0.5 cursor-pointer"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            rec.isFavorite ? 'text-amber-500 fill-amber-500' : 'text-[var(--text-muted)]'
                          }`}
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--text-primary)] truncate">
                          {isAr ? rec.titleAr : rec.titleEn}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[var(--text-muted)] mt-0.5">
                          {rec.reportNumber} · {rec.rowCount} {isAr ? 'سجل' : 'rows'} · {rec.createdBy} ({rec.createdRole}) ·{' '}
                          {rec.updatedAt.slice(0, 16).replace('T', ' ')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="xs" onClick={() => loadSavedReportIntoBuilder(rec)}>
                        {isAr ? 'استعراض وطباعة' : 'Open & Print'}
                      </Button>
                      {perms.canDeleteReports && (
                        <Button
                          size="xs"
                          variant="danger"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                          onClick={() => {
                            onSaveStorage((prev) => ({
                              ...prev,
                              savedReports: prev.savedReports.filter((r) => r.id !== rec.id),
                            }));
                            if (activeSavedId === rec.id) setActiveSavedId(null);
                            pushToast(isAr ? 'تم حذف التقرير من الأرشيف' : 'Report deleted', 'info');
                          }}
                        >
                          {isAr ? 'حذف' : 'Delete'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ==================== TAB 5: PRINT & EXPORT AUDIT LOG ==================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4 no-print">
          <Card padded>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="w-64">
                  <Input
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    startIcon={<Search className="w-3.5 h-3.5" />}
                    placeholder={isAr ? 'بحث برقم التقرير أو المستخدم...' : 'Search audit log...'}
                  />
                </div>
                <div className="w-44">
                  <Select value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value)}>
                    <option value="all">{isAr ? 'كل العمليات' : 'All Actions'}</option>
                    <option value="print">{isAr ? 'طباعة مباشرة' : 'Print'}</option>
                    <option value="pdf">PDF</option>
                    <option value="xlsx">Excel</option>
                    <option value="csv">CSV</option>
                    <option value="archive">{isAr ? 'حفظ بالأرشيف' : 'Archived'}</option>
                  </Select>
                </div>
              </div>
              <Button
                size="xs"
                variant="primary"
                icon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => selectDefinitionForBuilder('exec_print_audit_log', 'administrative')}
              >
                {isAr ? 'طباعة سجل العمليات' : 'Print Audit Report'}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<History className="w-4 h-4" />}
              title={isAr ? `سجل عمليات الطباعة والتصدير (${filteredAuditLogs.length})` : `Print & Export Activity Log (${filteredAuditLogs.length})`}
            />
            {filteredAuditLogs.length === 0 ? (
              <EmptyState
                title={isAr ? 'لا توجد عمليات مسجلة بعد' : 'No Print or Export Events Yet'}
                description={
                  isAr
                    ? 'أي عملية طباعة أو تصدير PDF أو Excel أو CSV سيتم تسجيلها تلقائياً هنا.'
                    : 'Every print, PDF, Excel, or CSV export across Bunyan is logged here.'
                }
              />
            ) : (
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-start text-xs">
                  <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-hairline)] text-[var(--text-muted)] sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-start font-semibold">{isAr ? 'رقم التقرير' : 'Report #'}</th>
                      <th className="px-4 py-3 text-start font-semibold">{isAr ? 'عنوان التقرير' : 'Title'}</th>
                      <th className="px-4 py-3 text-start font-semibold">{isAr ? 'العملية' : 'Action'}</th>
                      <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المستخدم والدور' : 'Actor'}</th>
                      <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الورق' : 'Paper'}</th>
                      <th className="px-4 py-3 text-end font-semibold">{isAr ? 'التوقيت' : 'Timestamp'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {filteredAuditLogs.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[var(--bg-surface-subtle)]">
                        <td dir="ltr" className="px-4 py-3 font-mono font-bold text-[#B4863C]">
                          {entry.reportNumber}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--text-primary)]">
                          {isAr ? entry.reportTitleAr : entry.reportTitleEn}
                        </td>
                        <td className="px-4 py-3 font-mono uppercase text-[11px]">{entry.action}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {entry.actorName} · {entry.actorRole}
                        </td>
                        <td dir="ltr" className="px-4 py-3 font-mono text-[11px] text-[var(--text-muted)]">
                          {entry.paperSize} ({entry.orientation})
                        </td>
                        <td dir="ltr" className="px-4 py-3 text-end font-mono tabular-nums text-[var(--text-muted)]">
                          {entry.timestamp.slice(0, 16).replace('T', ' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ==================== TAB 6: TEMPLATES & PRINT SETTINGS ==================== */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 no-print">
          {/* Templates Manager */}
          <Card padded className="xl:col-span-7 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <LayoutTemplate className="w-4 h-4 text-[#B4863C]" />
                <span>{isAr ? 'إدارة وتخصيص قوالب التقارير (7 قوالب)' : 'Report Templates Customizer (7 Templates)'}</span>
              </div>
              {perms.canManageTemplates && (
                <Button
                  size="xs"
                  icon={<RotateCcw className="w-3.5 h-3.5" />}
                  onClick={() => {
                    updateEditingTemplate({ ...DEFAULT_REPORT_TEMPLATES[editingTemplateId] });
                    pushToast(isAr ? 'تم استعادة إعدادات القالب الافتراضية' : 'Template reset to default', 'info');
                  }}
                >
                  {isAr ? 'استعادة الافتراضي' : 'Reset Template'}
                </Button>
              )}
            </div>

            {!perms.canManageTemplates && (
              <div className="px-3.5 py-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                {isAr
                  ? 'تعديل إعدادات القوالب متاح لدور المدير التنفيذي (Admin) فقط. يمكنك معاينة القوالب.'
                  : 'Template editing requires Admin permissions. Read-only view active.'}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(storageState.customTemplates) as ReportTemplateStyleId[]).map((tid) => {
                const t = storageState.customTemplates[tid];
                const active = editingTemplateId === tid;
                return (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => setEditingTemplateId(tid)}
                    className={`p-2.5 rounded-lg border text-start text-xs cursor-pointer bunyan-transition ${
                      active
                        ? 'border-[#B4863C] bg-[#B4863C]/12 text-[var(--text-primary)] font-bold'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    <div className="truncate">{isAr ? t.nameAr : t.nameEn}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'حجم الشعار' : 'Logo Size'}
                </label>
                <Select
                  disabled={!perms.canManageTemplates}
                  value={editingTemplate.logoSize}
                  onChange={(e) =>
                    updateEditingTemplate({ logoSize: e.target.value as ReportTemplate['logoSize'] })
                  }
                >
                  <option value="sm">{isAr ? 'صغير (Compact)' : 'Small'}</option>
                  <option value="md">{isAr ? 'متوسط (Standard)' : 'Medium'}</option>
                  <option value="lg">{isAr ? 'كبير (Executive)' : 'Large'}</option>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'موقع الشعار' : 'Logo Position'}
                </label>
                <Select
                  disabled={!perms.canManageTemplates}
                  value={editingTemplate.logoPosition}
                  onChange={(e) =>
                    updateEditingTemplate({
                      logoPosition: e.target.value as ReportTemplate['logoPosition'],
                    })
                  }
                >
                  <option value="start">{isAr ? 'بداية الترويسة' : 'Start'}</option>
                  <option value="center">{isAr ? 'وسط الترويسة' : 'Center'}</option>
                  <option value="end">{isAr ? 'نهاية الترويسة' : 'End'}</option>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'هوية وألوان القالب' : 'Accent Palette'}
                </label>
                <Select
                  disabled={!perms.canManageTemplates}
                  value={editingTemplate.palette}
                  onChange={(e) =>
                    updateEditingTemplate({ palette: e.target.value as ReportAccentPalette })
                  }
                >
                  {(Object.keys(TEMPLATE_PALETTE_TOKENS) as ReportAccentPalette[]).map((pKey) => (
                    <option key={pKey} value={pKey}>
                      {isAr
                        ? TEMPLATE_PALETTE_TOKENS[pKey].labelAr
                        : TEMPLATE_PALETTE_TOKENS[pKey].labelEn}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'نص الترويسة العليا' : 'Header Text'}
                </label>
                <Input
                  disabled={!perms.canManageTemplates}
                  value={isAr ? editingTemplate.headerTextAr : editingTemplate.headerTextEn}
                  onChange={(e) =>
                    updateEditingTemplate(
                      isAr ? { headerTextAr: e.target.value } : { headerTextEn: e.target.value }
                    )
                  }
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'نص التذييل السفلي' : 'Footer Text'}
                </label>
                <Input
                  disabled={!perms.canManageTemplates}
                  value={isAr ? editingTemplate.footerTextAr : editingTemplate.footerTextEn}
                  onChange={(e) =>
                    updateEditingTemplate(
                      isAr ? { footerTextAr: e.target.value } : { footerTextEn: e.target.value }
                    )
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                {isAr ? 'ملاحظات واعتمادات القالب الافتراضية' : 'Default Template Notes'}
              </label>
              <Input
                disabled={!perms.canManageTemplates}
                value={isAr ? editingTemplate.defaultNotesAr : editingTemplate.defaultNotesEn}
                onChange={(e) =>
                  updateEditingTemplate(
                    isAr ? { defaultNotesAr: e.target.value } : { defaultNotesEn: e.target.value }
                  )
                }
              />
            </div>

            <div className="flex flex-wrap gap-4 pt-2 border-t border-[var(--border-hairline)] text-xs">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!perms.canManageTemplates}
                  checked={editingTemplate.showSignatureBlocks}
                  onChange={(e) => updateEditingTemplate({ showSignatureBlocks: e.target.checked })}
                  className="accent-[#B4863C]"
                />
                <span>{isAr ? 'إظهار خانات التوقيع' : 'Signature Blocks'}</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!perms.canManageTemplates}
                  checked={editingTemplate.showOfficialStamp}
                  onChange={(e) => updateEditingTemplate({ showOfficialStamp: e.target.checked })}
                  className="accent-[#B4863C]"
                />
                <span>{isAr ? 'إظهار الختم الرسمي' : 'Official Stamp'}</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!perms.canManageTemplates}
                  checked={editingTemplate.denseTable}
                  onChange={(e) => updateEditingTemplate({ denseTable: e.target.checked })}
                  className="accent-[#B4863C]"
                />
                <span>{isAr ? 'جدول مضغوط' : 'Compact Dense Table'}</span>
              </label>
            </div>
          </Card>

          {/* Centralized Print Settings Manager */}
          <Card padded className="xl:col-span-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <Settings2 className="w-4 h-4 text-[#B4863C]" />
                <span>{isAr ? 'إعدادات الطباعة المركزية' : 'Centralized Print Settings'}</span>
              </div>
              <Button
                size="xs"
                onClick={() => updatePrintSettings({ ...DEFAULT_PRINT_SETTINGS })}
              >
                {isAr ? 'افتراضي A4' : 'Default A4'}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'حجم الورق' : 'Paper Size'}
                </label>
                <Select
                  value={storageState.printSettings.paperSize}
                  onChange={(e) => updatePrintSettings({ paperSize: e.target.value as PaperSize })}
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="A3">A3 (297 × 420 mm)</option>
                  <option value="A5">A5 (148 × 210 mm)</option>
                  <option value="Letter">Letter (216 × 279 mm)</option>
                  <option value="Legal">Legal (216 × 356 mm)</option>
                </Select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'اتجاه الصفحة' : 'Orientation'}
                </label>
                <Select
                  value={storageState.printSettings.orientation}
                  onChange={(e) =>
                    updatePrintSettings({ orientation: e.target.value as PageOrientation })
                  }
                >
                  <option value="portrait">{isAr ? 'عمودي (Portrait)' : 'Portrait'}</option>
                  <option value="landscape">{isAr ? 'أفقي (Landscape)' : 'Landscape'}</option>
                </Select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'الهوامش' : 'Page Margins'}
                </label>
                <Select
                  value={storageState.printSettings.margins}
                  onChange={(e) => updatePrintSettings({ margins: e.target.value as MarginPreset })}
                >
                  <option value="narrow">{isAr ? 'ضيقة (7 mm)' : 'Narrow (7 mm)'}</option>
                  <option value="standard">{isAr ? 'قياسية (12 mm)' : 'Standard (12 mm)'}</option>
                  <option value="wide">{isAr ? 'واسعة (18 mm)' : 'Wide (18 mm)'}</option>
                </Select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isAr ? 'نمط الألوان' : 'Color Mode'}
                </label>
                <Select
                  value={storageState.printSettings.colorMode}
                  onChange={(e) =>
                    updatePrintSettings({
                      colorMode: e.target.value as PrintSettings['colorMode'],
                    })
                  }
                >
                  <option value="color">{isAr ? 'ملون رسمي' : 'Official Color'}</option>
                  <option value="monochrome">{isAr ? 'أبيض وأسود (B&W)' : 'Monochrome (B&W)'}</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-[var(--border-hairline)] text-xs">
              {[
                {
                  key: 'repeatTableHeaders' as const,
                  ar: 'تكرار رؤوس الجداول تلقائياً عند تعدد الصفحات (<thead>)',
                  en: 'Repeat table headers automatically across pages',
                },
                {
                  key: 'showPageNumbers' as const,
                  ar: 'ترقيم الصفحات التلقائي في ملفات PDF المصدّرة',
                  en: 'Automatic page numbering on exported PDF pages',
                },
                {
                  key: 'showHeader' as const,
                  ar: 'إظهار الترويسة الرسمية أعلى التقرير',
                  en: 'Show institutional document header',
                },
                {
                  key: 'showFooter' as const,
                  ar: 'إظهار التذييل الرسمي وبيانات التواصل أسفل التقرير',
                  en: 'Show institutional footer & contact metadata',
                },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={storageState.printSettings[opt.key]}
                    onChange={(e) => updatePrintSettings({ [opt.key]: e.target.checked })}
                    className="accent-[#B4863C]"
                  />
                  <span>{isAr ? opt.ar : opt.en}</span>
                </label>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
