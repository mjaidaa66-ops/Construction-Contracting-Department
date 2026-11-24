import type { Language, Role } from './bunyan';

export type ReportModuleCategory =
  | 'executive'
  | 'financials'
  | 'projects'
  | 'clients';

export type ReportTypeId =
  // Executive & Admin Audit
  | 'exec_portfolio_summary'
  | 'exec_workspace_alerts'
  | 'exec_rbac_matrix'
  | 'exec_print_audit_log'
  // Financials (RBAC: admin, accountant)
  | 'fin_portfolio_ledger'
  | 'fin_payment_milestones'
  | 'fin_boq_vat_valuation'
  | 'fin_rate_library'
  // Projects & Engineering Schedules
  | 'proj_status_registry'
  | 'proj_phases_delays'
  | 'proj_bim_takeoff_quantities'
  // Clients, Clearances, GIS & Documents
  | 'client_owners_summary'
  | 'gov_clearances_registry'
  | 'doc_vault_registry'
  | 'gis_plots_compliance';

export type ReportTemplateStyleId =
  | 'official'
  | 'financial'
  | 'administrative'
  | 'projects'
  | 'statistical'
  | 'detailed'
  | 'compact';

export type ReportAccentPalette =
  | 'silver_slate'
  | 'institutional_white'
  | 'executive_charcoal'
  | 'gold_trim';

export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
export type PageOrientation = 'portrait' | 'landscape';
export type MarginPreset = 'narrow' | 'standard' | 'wide';
export type PrintColorMode = 'color' | 'monochrome';
export type LogoSizePreset = 'sm' | 'md' | 'lg';
export type LogoPositionPreset = 'start' | 'center' | 'end';

export interface PrintSettings {
  paperSize: PaperSize;
  orientation: PageOrientation;
  margins: MarginPreset;
  colorMode: PrintColorMode;
  showPageNumbers: boolean;
  repeatTableHeaders: boolean;
  showHeader: boolean;
  showFooter: boolean;
}

export interface ReportTemplate {
  id: ReportTemplateStyleId;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  palette: ReportAccentPalette;
  logoSize: LogoSizePreset;
  logoPosition: LogoPositionPreset;
  customTitleAr?: string;
  customTitleEn?: string;
  headerTextAr: string;
  headerTextEn: string;
  footerTextAr: string;
  footerTextEn: string;
  defaultNotesAr: string;
  defaultNotesEn: string;
  showSignatureBlocks: boolean;
  signatureLabelsAr: [string, string, string];
  signatureLabelsEn: [string, string, string];
  showOfficialStamp: boolean;
  showKpiSummary: boolean;
  showCharts: boolean;
  denseTable: boolean;
  updatedAt?: string;
}

export interface ReportFilterState {
  dateFrom: string;
  dateTo: string;
  projectId: string; // 'all' or project ID
  clientName: string; // 'all' or ownerName
  engineerName: string; // 'all' or engineer/author
  status: string; // 'all' or status value
  subCategory: string; // 'all' or authority / doc category / project type / rate category
  keyword: string;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  groupBy: string; // 'none' or column key
}

export type ReportColumnFormat = 'text' | 'number' | 'currency' | 'percent' | 'date' | 'badge';

export interface ReportColumnDef {
  key: string;
  labelAr: string;
  labelEn: string;
  format: ReportColumnFormat;
  align?: 'start' | 'end' | 'center';
  aggregatable?: 'sum' | 'avg' | 'count';
  sensitiveFinancial?: boolean;
  defaultVisible?: boolean;
}

export interface ReportKpiMetric {
  id: string;
  labelAr: string;
  labelEn: string;
  valueText: string;
  numericValue?: number;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}

export interface ReportChartDatum {
  key: string;
  labelAr: string;
  labelEn: string;
  value: number;
  secondaryValue?: number;
  color: string;
}

export interface ReportChartSeries {
  id: string;
  titleAr: string;
  titleEn: string;
  kind: 'donut' | 'bar';
  data: ReportChartDatum[];
  valueFormat?: 'number' | 'currency' | 'percent';
}

export interface ReportRow {
  id: string;
  projectId?: string;
  dateValue?: string;
  groupKey?: string;
  cells: Record<string, string | number>;
}

export interface ReportDefinition {
  id: ReportTypeId;
  category: ReportModuleCategory;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  recommendedTemplate: ReportTemplateStyleId;
  isFinancial: boolean;
  supportsDateRange: boolean;
  supportsProjectFilter: boolean;
  supportsClientFilter: boolean;
  supportsEngineerFilter: boolean;
  statusOptions: Array<{ value: string; labelAr: string; labelEn: string }>;
  subCategoryOptions?: Array<{ value: string; labelAr: string; labelEn: string }>;
  columns: ReportColumnDef[];
}

export interface GeneratedReport {
  reportNumber: string;
  definitionId: ReportTypeId;
  category: ReportModuleCategory;
  titleAr: string;
  titleEn: string;
  subtitleAr: string;
  subtitleEn: string;
  generatedAt: string;
  generatedBy: string;
  generatedRole: Role;
  lang: Language;
  templateId: ReportTemplateStyleId;
  filters: ReportFilterState;
  columns: ReportColumnDef[];
  visibleColumnKeys: string[];
  rows: ReportRow[];
  totalsRow: Record<string, string | number> | null;
  kpis: ReportKpiMetric[];
  charts: ReportChartSeries[];
  notes: string;
  showTotals: boolean;
  showKpis: boolean;
  showCharts: boolean;
  showSignatures: boolean;
  showStamp: boolean;
}

export interface SavedReportRecord {
  id: string;
  reportNumber: string;
  definitionId: ReportTypeId;
  category: ReportModuleCategory;
  titleAr: string;
  titleEn: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdRole: Role;
  templateId: ReportTemplateStyleId;
  lang: Language;
  filters: ReportFilterState;
  visibleColumnKeys: string[];
  notes: string;
  showTotals: boolean;
  showKpis: boolean;
  showCharts: boolean;
  showSignatures: boolean;
  showStamp: boolean;
  rowCount: number;
}

export type PrintExportAction = 'print' | 'pdf' | 'xlsx' | 'csv' | 'archive';

export interface PrintAuditLogEntry {
  id: string;
  reportNumber: string;
  reportTitleAr: string;
  reportTitleEn: string;
  definitionId: ReportTypeId | 'boq_quick_export' | 'dashboard_summary';
  action: PrintExportAction;
  actorName: string;
  actorRole: Role;
  templateId: ReportTemplateStyleId | 'official_boq';
  paperSize: PaperSize;
  orientation: PageOrientation;
  rowCount: number;
  timestamp: string;
}

export interface ReportsWorkspaceStorage {
  savedReports: SavedReportRecord[];
  customTemplates: Record<ReportTemplateStyleId, ReportTemplate>;
  printSettings: PrintSettings;
  auditLogs: PrintAuditLogEntry[];
}
