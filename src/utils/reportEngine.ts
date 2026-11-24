import type {
  CompanyProfile,
  GovernmentTransaction,
  Language,
  Project,
  RateLibraryItem,
  Role,
} from '../types/bunyan';
import type {
  GeneratedReport,
  PrintAuditLogEntry,
  ReportChartSeries,
  ReportColumnDef,
  ReportDefinition,
  ReportFilterState,
  ReportKpiMetric,
  ReportModuleCategory,
  ReportRow,
  ReportTemplateStyleId,
  ReportTypeId,
} from '../types/reports';
import type { WorkspaceAlert } from './workspaceAlerts';
import {
  AUTHORITY_LABELS,
  CATEGORY_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  TX_STATUS_LABELS,
  formatAED,
} from './i18n';
import { getRolePermissions } from './rbacPermissions';
import { computeTakeoffSummary } from './takeoffCalculations';

export const REPORT_CATEGORY_META: Record<
  ReportModuleCategory,
  { labelAr: string; labelEn: string; descAr: string; descEn: string }
> = {
  executive: {
    labelAr: 'الإدارة التنفيذية والحوكمة',
    labelEn: 'Executive & Governance',
    descAr: 'ملخصات المحفظة، التنبيهات الحرجة، مصفوفة الصلاحيات وسجل الطباعة.',
    descEn: 'Portfolio briefs, compliance alerts, RBAC matrix & audit logs.',
  },
  financials: {
    labelAr: 'المالية والمستخلصات والأسعار',
    labelEn: 'Financials, BOQ & Rates',
    descAr: 'الميزانيات والدفعات المستلمة، جدول الاستحقاقات، 5D BOQ وضريبة 5% VAT.',
    descEn: 'Approved budgets, milestone payouts, 5D BOQ & UAE 5% VAT ledgers.',
  },
  projects: {
    labelAr: 'المشاريع والجدول الزمني و 5D BIM',
    labelEn: 'Projects, Schedules & 5D BIM',
    descAr: 'سجل المشاريع والعقود، انحراف المراحل والتأخيرات، وكميات BIM والحصر.',
    descEn: 'Contract registry, construction phase variance/delays & 5D quantities.',
  },
  clients: {
    labelAr: 'الملاك والبلدية والوثائق و GIS',
    labelEn: 'Clients, Permits, Docs & GIS',
    descAr: 'ملخص الملاك، المعاملات الحكومية بالشارقة، أرشيف المخططات وأراضي GIS.',
    descEn: 'Client portfolios, municipal clearances, document vault & GIS plots.',
  },
};

export const DEFAULT_REPORT_FILTERS: ReportFilterState = {
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
};

const PROJECT_STATUS_OPTIONS = [
  { value: 'all', labelAr: 'كل الحالات', labelEn: 'All Statuses' },
  { value: 'under_construction', labelAr: 'تحت التنفيذ', labelEn: 'Under Construction' },
  { value: 'permitting', labelAr: 'قيد التراخيص', labelEn: 'Permitting' },
  { value: 'suspended', labelAr: 'متوقف مؤقتاً', labelEn: 'Suspended' },
  { value: 'completed', labelAr: 'منجز ومسلّم', labelEn: 'Completed' },
];

const TX_STATUS_OPTIONS = [
  { value: 'all', labelAr: 'كل الحالات', labelEn: 'All Statuses' },
  { value: 'approved', labelAr: 'معتمد', labelEn: 'Approved' },
  { value: 'in_review', labelAr: 'قيد المراجعة الفنية', labelEn: 'In Technical Review' },
  { value: 'action_required', labelAr: 'يتطلب استكمال', labelEn: 'Action Required' },
  { value: 'pending_inspection', labelAr: 'بانتظار التفتيش', labelEn: 'Pending Inspection' },
];

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  // 1. EXECUTIVE & AUDIT
  {
    id: 'exec_portfolio_summary',
    category: 'executive',
    titleAr: 'التقرير التنفيذي العام لمحفظة المشاريع',
    titleEn: 'Executive Portfolio Summary Report',
    descriptionAr: 'ملخص قيادي شامل لحالة المشاريع ونسب الإنجاز والاستشاريين والتراخيص.',
    descriptionEn: 'Executive overview of portfolio projects, progress variance, consultants & permits.',
    recommendedTemplate: 'official',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: true,
    supportsEngineerFilter: true,
    statusOptions: PROJECT_STATUS_OPTIONS,
    columns: [
      { key: 'code', labelAr: 'الكود', labelEn: 'Code', format: 'text', defaultVisible: true },
      { key: 'name', labelAr: 'اسم المشروع', labelEn: 'Project Name', format: 'text', defaultVisible: true },
      { key: 'projectType', labelAr: 'النوع', labelEn: 'Type', format: 'badge', defaultVisible: true },
      { key: 'status', labelAr: 'الحالة', labelEn: 'Status', format: 'badge', defaultVisible: true },
      { key: 'ownerName', labelAr: 'المالك / العميل', labelEn: 'Client / Owner', format: 'text', defaultVisible: true },
      { key: 'engineer', labelAr: 'المهندس المقيم', labelEn: 'Resident Engineer', format: 'text', defaultVisible: true },
      { key: 'actualProgress', labelAr: 'الإنجاز الفعلي', labelEn: 'Actual %', format: 'percent', align: 'end', aggregatable: 'avg', defaultVisible: true },
      { key: 'plannedProgress', labelAr: 'المخطط', labelEn: 'Planned %', format: 'percent', align: 'end', aggregatable: 'avg', defaultVisible: true },
      { key: 'approvedBudget', labelAr: 'قيمة المشروع (AED)', labelEn: 'Contract Value (AED)', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'permitExpiryDate', labelAr: 'انتهاء الرخصة', labelEn: 'Permit Expiry', format: 'date', defaultVisible: false },
    ],
  },
  {
    id: 'exec_workspace_alerts',
    category: 'executive',
    titleAr: 'تقرير التنبيهات الحرجة ومهام الامتثال',
    titleEn: 'Compliance Alerts & Action Tasks Report',
    descriptionAr: 'حصر فوري للمعاملات التي تتطلب استكمالاً، التأخيرات الزمنية >10%، والرخص القريبة من الانتهاء.',
    descriptionEn: 'Live compliance report covering action-required clearances, >10% schedule delays, and expiring permits.',
    recommendedTemplate: 'administrative',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: false,
    supportsEngineerFilter: false,
    statusOptions: [
      { value: 'all', labelAr: 'كل المستويات', labelEn: 'All Severities' },
      { value: 'critical', labelAr: 'حرج', labelEn: 'Critical' },
      { value: 'warning', labelAr: 'تحذير', labelEn: 'Warning' },
      { value: 'info', labelAr: 'معلومة', labelEn: 'Info' },
    ],
    columns: [
      { key: 'severity', labelAr: 'الأولوية', labelEn: 'Severity', format: 'badge', defaultVisible: true },
      { key: 'title', labelAr: 'التنبيه / المهمة', labelEn: 'Alert / Task', format: 'text', defaultVisible: true },
      { key: 'detail', labelAr: 'التفاصيل الفنية', labelEn: 'Technical Details', format: 'text', defaultVisible: true },
      { key: 'targetModule', labelAr: 'الوحدة المرتبطة', labelEn: 'Module', format: 'badge', defaultVisible: true },
      { key: 'dateLabel', labelAr: 'التاريخ المرجعي', labelEn: 'Reference Date', format: 'date', defaultVisible: true },
    ],
  },
  {
    id: 'exec_rbac_matrix',
    category: 'executive',
    titleAr: 'تقرير مصفوفة الصلاحيات والأدوار (RBAC)',
    titleEn: 'RBAC Roles & Access Matrix Report',
    descriptionAr: 'توثيق حوكمة الوصول لجميع الأدوار (المدير، المهندس، المحاسب) عبر وحدات النظام والتقارير.',
    descriptionEn: 'Governance audit matrix detailing Admin, Engineer, and Accountant privileges across system & reports.',
    recommendedTemplate: 'administrative',
    isFinancial: false,
    supportsDateRange: false,
    supportsProjectFilter: false,
    supportsClientFilter: false,
    supportsEngineerFilter: false,
    statusOptions: [
      { value: 'all', labelAr: 'كل الأدوار', labelEn: 'All Roles' },
      { value: 'admin', labelAr: 'المدير التنفيذي (Admin)', labelEn: 'Admin' },
      { value: 'engineer', labelAr: 'المهندس (Engineer)', labelEn: 'Engineer' },
      { value: 'accountant', labelAr: 'المحاسب (Accountant)', labelEn: 'Accountant' },
    ],
    columns: [
      { key: 'role', labelAr: 'الدور الوظيفي', labelEn: 'Role', format: 'badge', defaultVisible: true },
      { key: 'canManageProjects', labelAr: 'إدارة المشاريع', labelEn: 'Manage Projects', format: 'text', defaultVisible: true },
      { key: 'canDeleteProjects', labelAr: 'حذف المشاريع', labelEn: 'Delete Projects', format: 'text', defaultVisible: true },
      { key: 'canEditEngineering', labelAr: 'تعديل الهندسة/BIM', labelEn: 'Edit Engineering', format: 'text', defaultVisible: true },
      { key: 'canEditFinancials', labelAr: 'تعديل المالية', labelEn: 'Edit Financials', format: 'text', defaultVisible: true },
      { key: 'canViewFinancialReports', labelAr: 'التقارير المالية', labelEn: 'Financial Reports', format: 'text', defaultVisible: true },
      { key: 'canManageTemplates', labelAr: 'إدارة القوالب', labelEn: 'Manage Templates', format: 'text', defaultVisible: true },
      { key: 'canDeleteReports', labelAr: 'حذف التقارير', labelEn: 'Delete Reports', format: 'text', defaultVisible: true },
    ],
  },
  {
    id: 'exec_print_audit_log',
    category: 'executive',
    titleAr: 'سجل عمليات الطباعة والتصدير والأرشفة',
    titleEn: 'Print, Export & Archiving Audit Log',
    descriptionAr: 'تقرير تدقيقي لكافة عمليات الطباعة وتصدير PDF و Excel و CSV المنفذة داخل المنصة.',
    descriptionEn: 'Chronological audit report of all prints, PDF, Excel, CSV exports, and archives.',
    recommendedTemplate: 'administrative',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: false,
    supportsClientFilter: false,
    supportsEngineerFilter: true,
    statusOptions: [
      { value: 'all', labelAr: 'كل العمليات', labelEn: 'All Actions' },
      { value: 'print', labelAr: 'طباعة مباشرة', labelEn: 'Direct Print' },
      { value: 'pdf', labelAr: 'تصدير PDF', labelEn: 'PDF Export' },
      { value: 'xlsx', labelAr: 'تصدير Excel', labelEn: 'Excel Export' },
      { value: 'csv', labelAr: 'تصدير CSV', labelEn: 'CSV Export' },
      { value: 'archive', labelAr: 'حفظ بالأرشيف', labelEn: 'Archived' },
    ],
    columns: [
      { key: 'reportNumber', labelAr: 'رقم التقرير', labelEn: 'Report #', format: 'text', defaultVisible: true },
      { key: 'reportTitle', labelAr: 'عنوان التقرير', labelEn: 'Report Title', format: 'text', defaultVisible: true },
      { key: 'action', labelAr: 'نوع العملية', labelEn: 'Action', format: 'badge', defaultVisible: true },
      { key: 'actorName', labelAr: 'المستخدم', labelEn: 'User', format: 'text', defaultVisible: true },
      { key: 'actorRole', labelAr: 'الدور', labelEn: 'Role', format: 'badge', defaultVisible: true },
      { key: 'paperSpec', labelAr: 'إعداد الورق', labelEn: 'Paper Spec', format: 'text', defaultVisible: true },
      { key: 'rowCount', labelAr: 'السجلات', labelEn: 'Rows', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'timestamp', labelAr: 'وقت التنفيذ', labelEn: 'Timestamp', format: 'date', defaultVisible: true },
    ],
  },

  // 2. FINANCIALS (STRICT RBAC: admin & accountant ONLY)
  {
    id: 'fin_portfolio_ledger',
    category: 'financials',
    titleAr: 'التقرير المالي الشامل للمحفظة والتحصيل',
    titleEn: 'Portfolio Financial & Collection Ledger',
    descriptionAr: 'تحليل القيم التعاقدية، المفوتر، الدفعات المستلمة، الرصيد المتبقي ونسب التحصيل والاستقطاع.',
    descriptionEn: 'Contract values, invoiced amounts, collected payments, remaining balances & retention ratios.',
    recommendedTemplate: 'financial',
    isFinancial: true,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: true,
    supportsEngineerFilter: false,
    statusOptions: PROJECT_STATUS_OPTIONS,
    columns: [
      { key: 'code', labelAr: 'الكود', labelEn: 'Code', format: 'text', defaultVisible: true },
      { key: 'name', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'ownerName', labelAr: 'المالك', labelEn: 'Client', format: 'text', defaultVisible: true },
      { key: 'approvedBudget', labelAr: 'الميزانية التعاقدية', labelEn: 'Contract Value', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'invoicedAmount', labelAr: 'المفوتر', labelEn: 'Invoiced', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'paidAmount', labelAr: 'المستلم', labelEn: 'Received', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'remainingAmount', labelAr: 'المتبقي للتحصيل', labelEn: 'Remaining', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'collectionPct', labelAr: 'نسبة التحصيل', labelEn: 'Collection %', format: 'percent', align: 'end', aggregatable: 'avg', defaultVisible: true },
      { key: 'retentionAmount', labelAr: 'محجوز الضمان', labelEn: 'Retention', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: false },
    ],
  },
  {
    id: 'fin_payment_milestones',
    category: 'financials',
    titleAr: 'تقرير جدول الدفعات والمستخلصات المجدولة',
    titleEn: 'Payment Milestones & Disbursements Schedule',
    descriptionAr: 'تفصيل مراحل الدفع لجميع المشاريع حسب تاريخ الاستحقاق وحالة السداد.',
    descriptionEn: 'Milestone-by-milestone breakdown of project payments by due date and payment status.',
    recommendedTemplate: 'financial',
    isFinancial: true,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: true,
    supportsEngineerFilter: false,
    statusOptions: [
      { value: 'all', labelAr: 'كل الدفعات', labelEn: 'All Milestones' },
      { value: 'paid', labelAr: 'مدفوعة', labelEn: 'Paid' },
      { value: 'invoiced', labelAr: 'مفوترة', labelEn: 'Invoiced' },
      { value: 'pending', labelAr: 'مجدولة / مستحقة', labelEn: 'Pending' },
    ],
    columns: [
      { key: 'projectCode', labelAr: 'كود المشروع', labelEn: 'Project Code', format: 'text', defaultVisible: true },
      { key: 'projectName', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'title', labelAr: 'بيان الدفعة', labelEn: 'Milestone', format: 'text', defaultVisible: true },
      { key: 'percentage', labelAr: 'النسبة', labelEn: 'Weight %', format: 'percent', align: 'end', defaultVisible: true },
      { key: 'amountAed', labelAr: 'المبلغ (AED)', labelEn: 'Amount (AED)', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'dueDate', labelAr: 'تاريخ الاستحقاق', labelEn: 'Due Date', format: 'date', defaultVisible: true },
      { key: 'status', labelAr: 'الحالة', labelEn: 'Status', format: 'badge', defaultVisible: true },
    ],
  },
  {
    id: 'fin_boq_vat_valuation',
    category: 'financials',
    titleAr: 'تقرير تقييم المقايسات 5D BOQ وضريبة القيمة المضافة 5%',
    titleEn: '5D BOQ Cost & UAE 5% VAT Valuation Report',
    descriptionAr: 'ملخص التكاليف المباشرة، المصاريف الإدارية والربح، وضريبة القيمة المضافة 5% لكل مشروع.',
    descriptionEn: 'Direct takeoff cost, overhead & profit, UAE 5% VAT and grand BOQ valuation per project.',
    recommendedTemplate: 'financial',
    isFinancial: true,
    supportsDateRange: false,
    supportsProjectFilter: true,
    supportsClientFilter: true,
    supportsEngineerFilter: false,
    statusOptions: PROJECT_STATUS_OPTIONS,
    columns: [
      { key: 'code', labelAr: 'الكود', labelEn: 'Code', format: 'text', defaultVisible: true },
      { key: 'name', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'itemCount', labelAr: 'بنود الحصر', labelEn: 'BOQ Items', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'directCostAed', labelAr: 'التكلفة المباشرة', labelEn: 'Direct Cost', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'overheadProfitAed', labelAr: 'الإدارية والربح', labelEn: 'OH & Profit', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'vatAed', labelAr: 'ضريبة 5% VAT', labelEn: 'UAE 5% VAT', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
      { key: 'grandTotalAed', labelAr: 'الإجمالي شامل الضريبة', labelEn: 'Grand Total', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
    ],
  },
  {
    id: 'fin_rate_library',
    category: 'financials',
    titleAr: 'كتالوج أسعار البنود والمعدات المعتمد (Rate Library)',
    titleEn: 'Unit Rate & Equipment Library Cost Catalog',
    descriptionAr: 'قائمة أسعار السوق الإماراتي المرجعية للمواد والمعدات حسب بنود الأعمال الإنشائية.',
    descriptionEn: 'UAE benchmark unit rates, equipment rates, and technical specifications by CSI/BOQ category.',
    recommendedTemplate: 'financial',
    isFinancial: true,
    supportsDateRange: false,
    supportsProjectFilter: false,
    supportsClientFilter: false,
    supportsEngineerFilter: false,
    statusOptions: [{ value: 'all', labelAr: 'كل البنود', labelEn: 'All Items' }],
    columns: [
      { key: 'code', labelAr: 'الرمز', labelEn: 'Code', format: 'text', defaultVisible: true },
      { key: 'category', labelAr: 'التصنيف', labelEn: 'Category', format: 'badge', defaultVisible: true },
      { key: 'name', labelAr: 'وصف البند', labelEn: 'Item Description', format: 'text', defaultVisible: true },
      { key: 'unit', labelAr: 'الوحدة', labelEn: 'Unit', format: 'text', align: 'center', defaultVisible: true },
      { key: 'rateAed', labelAr: 'سعر الوحدة (AED)', labelEn: 'Unit Rate (AED)', format: 'currency', align: 'end', aggregatable: 'avg', sensitiveFinancial: true, defaultVisible: true },
      { key: 'equipmentRate', labelAr: 'معدل المعدات', labelEn: 'Equip. Rate', format: 'currency', align: 'end', aggregatable: 'avg', sensitiveFinancial: true, defaultVisible: true },
      { key: 'materialSpec', labelAr: 'المواصفة الفنية', labelEn: 'Material Spec', format: 'text', defaultVisible: true },
    ],
  },

  // 3. PROJECTS & ENGINEERING SCHEDULES
  {
    id: 'proj_status_registry',
    category: 'projects',
    titleAr: 'سجل المشاريع والعقود والجهات المرخصة',
    titleEn: 'Projects & Contracts Master Registry',
    descriptionAr: 'قائمة المشاريع الإنشائية شاملة المالك، الاستشاري، المهندس المقيم، رقم الرخصة ونسب الإنجاز.',
    descriptionEn: 'Master registry covering owner, consultant office, resident engineer, permit number & progress.',
    recommendedTemplate: 'projects',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: true,
    supportsEngineerFilter: true,
    statusOptions: PROJECT_STATUS_OPTIONS,
    columns: [
      { key: 'code', labelAr: 'الكود', labelEn: 'Code', format: 'text', defaultVisible: true },
      { key: 'name', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'status', labelAr: 'الحالة', labelEn: 'Status', format: 'badge', defaultVisible: true },
      { key: 'consultantOffice', labelAr: 'المكتب الاستشاري', labelEn: 'Consultant', format: 'text', defaultVisible: true },
      { key: 'engineer', labelAr: 'المهندس المقيم', labelEn: 'Resident Eng.', format: 'text', defaultVisible: true },
      { key: 'permitNumber', labelAr: 'رقم الرخصة', labelEn: 'Permit No.', format: 'text', defaultVisible: true },
      { key: 'permitDate', labelAr: 'تاريخ الرخصة', labelEn: 'Permit Date', format: 'date', defaultVisible: true },
      { key: 'actualProgress', labelAr: 'الإنجاز الفعلي', labelEn: 'Actual %', format: 'percent', align: 'end', aggregatable: 'avg', defaultVisible: true },
    ],
  },
  {
    id: 'proj_phases_delays',
    category: 'projects',
    titleAr: 'تقرير المراحل الإنشائية والانحراف الزمني والتأخيرات',
    titleEn: 'Construction Phases & Schedule Delay Variance',
    descriptionAr: 'تحليل تفصيلي لمراحل تنفيذ المشاريع، الأوزان النسبية، ومقارنة الفعلي بالمخطط لرصد التأخيرات.',
    descriptionEn: 'Granular phase execution tracking, weights, and planned vs actual schedule delay variance.',
    recommendedTemplate: 'projects',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: false,
    supportsEngineerFilter: true,
    statusOptions: [
      { value: 'all', labelAr: 'كل المراحل', labelEn: 'All Phases' },
      { value: 'completed', labelAr: 'مكتملة', labelEn: 'Completed' },
      { value: 'in_progress', labelAr: 'قيد التنفيذ', labelEn: 'In Progress' },
      { value: 'not_started', labelAr: 'لم تبدأ', labelEn: 'Not Started' },
    ],
    columns: [
      { key: 'projectCode', labelAr: 'كود المشروع', labelEn: 'Project Code', format: 'text', defaultVisible: true },
      { key: 'projectName', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'phaseName', labelAr: 'المرحلة الإنشائية', labelEn: 'Phase', format: 'text', defaultVisible: true },
      { key: 'weightPercentage', labelAr: 'الوزن', labelEn: 'Weight %', format: 'percent', align: 'end', defaultVisible: true },
      { key: 'progressPercentage', labelAr: 'إنجاز المرحلة', labelEn: 'Phase %', format: 'percent', align: 'end', aggregatable: 'avg', defaultVisible: true },
      { key: 'projectGap', labelAr: 'انحراف المشروع', labelEn: 'Proj. Variance', format: 'percent', align: 'end', defaultVisible: true },
      { key: 'startDate', labelAr: 'تاريخ البدء', labelEn: 'Start Date', format: 'date', defaultVisible: true },
      { key: 'endDate', labelAr: 'تاريخ الانتهاء', labelEn: 'End Date', format: 'date', defaultVisible: true },
      { key: 'status', labelAr: 'حالة المرحلة', labelEn: 'Status', format: 'badge', defaultVisible: true },
    ],
  },
  {
    id: 'proj_bim_takeoff_quantities',
    category: 'projects',
    titleAr: 'تقرير الكميات الهندسية والحصر ثنائي وثلاثي الأبعاد',
    titleEn: 'Engineering Quantities & 2D/5D BIM Summary',
    descriptionAr: 'بيان بالكميات المستخرجة من المخططات والنماذج ثلاثية الأبعاد (أمتار، مساحات، حجوم، أطنان).',
    descriptionEn: 'Extracted quantities from calibrated 2D PDF sheets and 5D BIM elements without pricing.',
    recommendedTemplate: 'detailed',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: false,
    supportsEngineerFilter: true,
    statusOptions: [{ value: 'all', labelAr: 'كل البنود', labelEn: 'All Measurements' }],
    columns: [
      { key: 'projectCode', labelAr: 'كود المشروع', labelEn: 'Project Code', format: 'text', defaultVisible: true },
      { key: 'category', labelAr: 'فئة العمل', labelEn: 'Work Category', format: 'badge', defaultVisible: true },
      { key: 'label', labelAr: 'البند الهندسي', labelEn: 'Engineering Item', format: 'text', defaultVisible: true },
      { key: 'tool', labelAr: 'أداة القياس', labelEn: 'Method', format: 'text', defaultVisible: true },
      { key: 'computedQuantity', labelAr: 'الكمية المحسوبة', labelEn: 'Quantity', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'unit', labelAr: 'الوحدة', labelEn: 'Unit', format: 'text', align: 'center', defaultVisible: true },
      { key: 'createdAt', labelAr: 'تاريخ الحصر', labelEn: 'Measured At', format: 'date', defaultVisible: true },
    ],
  },

  // 4. CLIENTS, CLEARANCES, DOCUMENTS & GIS
  {
    id: 'client_owners_summary',
    category: 'clients',
    titleAr: 'تقرير محفظة الملاك والعملاء',
    titleEn: 'Clients & Owners Portfolio Summary',
    descriptionAr: 'تجميع المشاريع حسب المالك مع بيانات التواصل ومتوسط التقدم وحالة الرخص.',
    descriptionEn: 'Portfolio grouped by client/owner with contact info, project count, and average progress.',
    recommendedTemplate: 'official',
    isFinancial: false,
    supportsDateRange: false,
    supportsProjectFilter: false,
    supportsClientFilter: true,
    supportsEngineerFilter: false,
    statusOptions: [{ value: 'all', labelAr: 'كل الملاك', labelEn: 'All Clients' }],
    columns: [
      { key: 'ownerName', labelAr: 'اسم المالك / العميل', labelEn: 'Client / Owner', format: 'text', defaultVisible: true },
      { key: 'ownerPhone', labelAr: 'الهاتف', labelEn: 'Phone', format: 'text', defaultVisible: true },
      { key: 'ownerEmail', labelAr: 'البريد الإلكتروني', labelEn: 'Email', format: 'text', defaultVisible: true },
      { key: 'projectCount', labelAr: 'عدد المشاريع', labelEn: 'Projects', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'avgProgress', labelAr: 'متوسط الإنجاز', labelEn: 'Avg Progress', format: 'percent', align: 'end', aggregatable: 'avg', defaultVisible: true },
      { key: 'approvedBudget', labelAr: 'إجمالي العقود (AED)', labelEn: 'Total Value (AED)', format: 'currency', align: 'end', aggregatable: 'sum', sensitiveFinancial: true, defaultVisible: true },
    ],
  },
  {
    id: 'gov_clearances_registry',
    category: 'clients',
    titleAr: 'تقرير معاملات البلدية والهيئات الحكومية بالشارقة',
    titleEn: 'Sharjah Municipal & Authority Clearances Report',
    descriptionAr: 'متابعة المعاملات لدى بلدية الشارقة و SEWA والدفاع المدني والتخطيط والمساحة والإسكان.',
    descriptionEn: 'Tracking clearances across Sharjah Municipality, SEWA, Civil Defense, DTPS & Housing.',
    recommendedTemplate: 'official',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: false,
    supportsEngineerFilter: true,
    statusOptions: TX_STATUS_OPTIONS,
    columns: [
      { key: 'transactionNumber', labelAr: 'رقم المعاملة', labelEn: 'Reference #', format: 'text', defaultVisible: true },
      { key: 'projectCode', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'authority', labelAr: 'الجهة الحكومية', labelEn: 'Authority', format: 'badge', defaultVisible: true },
      { key: 'serviceName', labelAr: 'الخدمة / الإجراء', labelEn: 'Service', format: 'text', defaultVisible: true },
      { key: 'reviewEngineer', labelAr: 'المهندس المراجع', labelEn: 'Review Eng.', format: 'text', defaultVisible: true },
      { key: 'status', labelAr: 'الحالة', labelEn: 'Status', format: 'badge', defaultVisible: true },
      { key: 'submissionDate', labelAr: 'تاريخ التقديم', labelEn: 'Submitted', format: 'date', defaultVisible: true },
      { key: 'lastUpdatedDate', labelAr: 'آخر تحديث', labelEn: 'Updated', format: 'date', defaultVisible: true },
    ],
  },
  {
    id: 'doc_vault_registry',
    category: 'clients',
    titleAr: 'سجل أرشيف المخططات والوثائق الهندسية',
    titleEn: 'Engineering Documents & Blueprints Registry',
    descriptionAr: 'جرد لكافة الملفات المرفوعة (إنشائي، معماري، MEP، رخص، عقود، GIS) وحالتها السحابية.',
    descriptionEn: 'Complete inventory of uploaded architectural, structural, MEP, permit & contract files.',
    recommendedTemplate: 'detailed',
    isFinancial: false,
    supportsDateRange: true,
    supportsProjectFilter: true,
    supportsClientFilter: false,
    supportsEngineerFilter: false,
    statusOptions: [
      { value: 'all', labelAr: 'كل التصنيفات', labelEn: 'All Categories' },
      { value: 'permit', labelAr: 'رخص البناء', labelEn: 'Permits' },
      { value: 'architectural', labelAr: 'معماري', labelEn: 'Architectural' },
      { value: 'structural', labelAr: 'إنشائي', labelEn: 'Structural' },
      { value: 'mep', labelAr: 'MEP', labelEn: 'MEP' },
      { value: 'contract', labelAr: 'عقود', labelEn: 'Contracts' },
      { value: 'gis', labelAr: 'وثائق GIS', labelEn: 'GIS Docs' },
    ],
    columns: [
      { key: 'projectCode', labelAr: 'كود المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'name', labelAr: 'اسم الوثيقة', labelEn: 'Document Name', format: 'text', defaultVisible: true },
      { key: 'category', labelAr: 'التصنيف', labelEn: 'Category', format: 'badge', defaultVisible: true },
      { key: 'sizeKb', labelAr: 'الحجم (KB)', labelEn: 'Size (KB)', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'cloudStatus', labelAr: 'التخزين السحابي', labelEn: 'Cloud Sync', format: 'badge', defaultVisible: true },
      { key: 'uploadedAt', labelAr: 'تاريخ الرفع', labelEn: 'Uploaded', format: 'date', defaultVisible: true },
    ],
  },
  {
    id: 'gis_plots_compliance',
    category: 'clients',
    titleAr: 'تقرير قطع الأراضي والمساحة والارتدادات (GIS)',
    titleEn: 'GIS Land Plots, Zoning & Setbacks Compliance',
    descriptionAr: 'سجل أرقام القطع، الأحواض، المناطق، المساحات بالمتر والقدم المربع، والارتدادات المعتمدة.',
    descriptionEn: 'Registry of plot numbers, basins, sectors, areas (m² / ft²), zoning & setback rules.',
    recommendedTemplate: 'detailed',
    isFinancial: false,
    supportsDateRange: false,
    supportsProjectFilter: true,
    supportsClientFilter: true,
    supportsEngineerFilter: false,
    statusOptions: PROJECT_STATUS_OPTIONS,
    columns: [
      { key: 'projectCode', labelAr: 'المشروع', labelEn: 'Project', format: 'text', defaultVisible: true },
      { key: 'plotNumber', labelAr: 'رقم القطعة', labelEn: 'Plot No.', format: 'text', defaultVisible: true },
      { key: 'sectorName', labelAr: 'المنطقة / القطاع', labelEn: 'Sector', format: 'text', defaultVisible: true },
      { key: 'zoning', labelAr: 'الاستخدام التنظيمي', labelEn: 'Zoning', format: 'text', defaultVisible: true },
      { key: 'plotAreaSqM', labelAr: 'مساحة الأرض (م²)', labelEn: 'Plot Area (m²)', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'builtUpAreaSqM', labelAr: 'مساحة البناء (م²)', labelEn: 'BUA (m²)', format: 'number', align: 'end', aggregatable: 'sum', defaultVisible: true },
      { key: 'setbacksSummary', labelAr: 'الارتدادات (أمام/خلف/جانبي)', labelEn: 'Setbacks (F/R/S)', format: 'text', defaultVisible: true },
    ],
  },
];

export function getAvailableReportDefinitions(role: Role): ReportDefinition[] {
  const perms = getRolePermissions(role);
  if (!perms.canViewReports) return [];
  return REPORT_DEFINITIONS.filter((def) => !def.isFinancial || perms.canViewFinancialReports);
}

export function getReportDefinitionById(id: ReportTypeId): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((def) => def.id === id);
}

export function generateReportNumber(definitionId: ReportTypeId): string {
  const prefixMap: Record<ReportModuleCategory, string> = {
    executive: 'EXE',
    financials: 'FIN',
    projects: 'PRJ',
    clients: 'CLR',
  };
  const def = getReportDefinitionById(definitionId);
  const prefix = def ? prefixMap[def.category] : 'RPT';
  const year = new Date().getFullYear();
  const serial = String(Math.floor(1000 + Math.random() * 9000));
  return `BNY-${prefix}-${year}-${serial}`;
}

function inDateRange(dateStr: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!dateStr) return true;
  const isoDay = dateStr.slice(0, 10);
  if (from && isoDay < from) return false;
  if (to && isoDay > to) return false;
  return true;
}

function formatBooleanLabel(val: boolean, lang: Language): string {
  if (lang === 'ar') return val ? 'نعم (مصرّح)' : 'لا (محجوب)';
  return val ? 'Allowed' : 'Denied';
}

export interface GenerateReportInput {
  definitionId: ReportTypeId;
  lang: Language;
  role: Role;
  actorName: string;
  projects: Project[];
  transactions: GovernmentTransaction[];
  rateLibrary: RateLibraryItem[];
  company: CompanyProfile;
  alerts: WorkspaceAlert[];
  auditLogs: PrintAuditLogEntry[];
  templateId?: ReportTemplateStyleId;
  filters?: Partial<ReportFilterState>;
  visibleColumnKeys?: string[];
  notes?: string;
  showTotals?: boolean;
  showKpis?: boolean;
  showCharts?: boolean;
  showSignatures?: boolean;
  showStamp?: boolean;
  customTitleAr?: string;
  customTitleEn?: string;
  reportNumber?: string;
}

export function generateReport(input: GenerateReportInput): GeneratedReport {
  const {
    definitionId,
    lang,
    role,
    actorName,
    projects,
    transactions,
    rateLibrary,
    alerts,
    auditLogs,
  } = input;

  const perms = getRolePermissions(role);
  const def = getReportDefinitionById(definitionId);
  if (!def) {
    throw new Error(`Unknown report definition: ${definitionId}`);
  }
  if (!perms.canViewReports) {
    throw new Error(
      lang === 'ar' ? 'الصلاحية الحالية لا تسمح بعرض التقارير.' : 'Current role cannot view reports.'
    );
  }
  if (def.isFinancial && !perms.canViewFinancialReports) {
    throw new Error(
      lang === 'ar'
        ? 'التقارير المالية محجوبة عن هذا الدور الوظيفي وفق سياسة الصلاحيات (RBAC).'
        : 'Financial reports are restricted for this role by RBAC policy.'
    );
  }

  const isAr = lang === 'ar';
  const filters: ReportFilterState = {
    ...DEFAULT_REPORT_FILTERS,
    ...input.filters,
  };

  // Mask sensitive financial columns if role lacks canViewFinancialReports
  const effectiveColumns: ReportColumnDef[] = def.columns.filter(
    (col) => !col.sensitiveFinancial || perms.canViewFinancialReports
  );

  const allowedKeys = new Set(effectiveColumns.map((c) => c.key));
  const requestedKeys =
    input.visibleColumnKeys && input.visibleColumnKeys.length > 0
      ? input.visibleColumnKeys.filter((k) => allowedKeys.has(k))
      : effectiveColumns.filter((c) => c.defaultVisible !== false).map((c) => c.key);

  const visibleColumnKeys =
    requestedKeys.length > 0 ? requestedKeys : effectiveColumns.map((c) => c.key);

  // Filter projects helper
  const filterProjectsList = (datePicker?: (p: Project) => string | undefined): Project[] => {
    return projects.filter((p) => {
      if (filters.projectId !== 'all' && p.id !== filters.projectId) return false;
      if (filters.clientName !== 'all' && p.ownerName !== filters.clientName) return false;
      if (
        filters.engineerName !== 'all' &&
        p.residentEngineer !== filters.engineerName &&
        p.consultantEngineer !== filters.engineerName
      ) {
        return false;
      }
      if (filters.status !== 'all' && p.status !== filters.status) return false;
      const refDate = datePicker ? datePicker(p) : p.permitDate;
      if (!inDateRange(refDate, filters.dateFrom, filters.dateTo)) return false;
      return true;
    });
  };

  let rows: ReportRow[] = [];
  let kpis: ReportKpiMetric[] = [];
  let charts: ReportChartSeries[] = [];

  switch (definitionId) {
    case 'exec_portfolio_summary':
    case 'proj_status_registry': {
      const list = filterProjectsList((p) => p.permitDate);
      rows = list.map((p) => ({
        id: p.id,
        projectId: p.id,
        dateValue: p.permitDate,
        groupKey: isAr ? PROJECT_STATUS_LABELS[p.status].ar : PROJECT_STATUS_LABELS[p.status].en,
        cells: {
          code: p.code,
          name: isAr ? p.name : p.nameEn,
          projectType: isAr
            ? PROJECT_TYPE_LABELS[p.projectType].ar
            : PROJECT_TYPE_LABELS[p.projectType].en,
          status: isAr ? PROJECT_STATUS_LABELS[p.status].ar : PROJECT_STATUS_LABELS[p.status].en,
          ownerName: p.ownerName,
          consultantOffice: p.consultantOffice,
          engineer: p.residentEngineer,
          actualProgress: p.actualProgress,
          plannedProgress: p.plannedProgress,
          approvedBudget: perms.canViewFinancialReports ? p.approvedBudget : 0,
          permitNumber: p.permitNumber,
          permitDate: p.permitDate,
          permitExpiryDate: p.permitExpiryDate,
        },
      }));

      const avgActual =
        list.length > 0
          ? Math.round(list.reduce((s, p) => s + p.actualProgress, 0) / list.length)
          : 0;
      const activeCount = list.filter((p) => p.status === 'under_construction').length;
      const delayedCount = list.filter(
        (p) => p.status === 'under_construction' && p.plannedProgress - p.actualProgress >= 10
      ).length;

      kpis = [
        {
          id: 'k-total',
          labelAr: 'المشاريع المطابقة',
          labelEn: 'Matching Projects',
          valueText: String(list.length),
          numericValue: list.length,
        },
        {
          id: 'k-active',
          labelAr: 'قيد التنفيذ الميداني',
          labelEn: 'Under Construction',
          valueText: String(activeCount),
          numericValue: activeCount,
          tone: 'positive',
        },
        {
          id: 'k-avg',
          labelAr: 'متوسط الإنجاز الفعلي',
          labelEn: 'Avg Actual Progress',
          valueText: `${avgActual}%`,
          numericValue: avgActual,
        },
        perms.canViewFinancialReports
          ? {
              id: 'k-budget',
              labelAr: 'إجمالي القيم التعاقدية',
              labelEn: 'Total Contract Value',
              valueText: formatAED(
                list.reduce((s, p) => s + p.approvedBudget, 0),
                lang
              ),
            }
          : {
              id: 'k-delayed',
              labelAr: 'مشاريع متأخرة (≥10%)',
              labelEn: 'Delayed Projects (≥10%)',
              valueText: String(delayedCount),
              numericValue: delayedCount,
              tone: delayedCount > 0 ? 'warning' : 'positive',
            },
      ];

      charts = [
        buildStatusDonutChart(list),
        buildProgressBarChart(list, isAr),
      ];
      break;
    }

    case 'exec_workspace_alerts': {
      const filtered = alerts.filter((a) => {
        if (filters.projectId !== 'all' && a.projectId && a.projectId !== filters.projectId) {
          return false;
        }
        if (filters.status !== 'all' && a.severity !== filters.status) return false;
        if (!inDateRange(a.dateLabel, filters.dateFrom, filters.dateTo)) return false;
        return true;
      });
      const sevMap = {
        critical: { ar: 'حرج', en: 'Critical' },
        warning: { ar: 'تحذير', en: 'Warning' },
        info: { ar: 'معلومة', en: 'Info' },
      };
      rows = filtered.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        dateValue: a.dateLabel,
        groupKey: isAr ? sevMap[a.severity].ar : sevMap[a.severity].en,
        cells: {
          severity: isAr ? sevMap[a.severity].ar : sevMap[a.severity].en,
          title: isAr ? a.titleAr : a.titleEn,
          detail: isAr ? a.detailAr : a.detailEn,
          targetModule: a.targetModule.toUpperCase(),
          dateLabel: a.dateLabel || '-',
        },
      }));
      const crit = filtered.filter((a) => a.severity === 'critical').length;
      const warn = filtered.filter((a) => a.severity === 'warning').length;
      kpis = [
        { id: 'ka-1', labelAr: 'إجمالي التنبيهات', labelEn: 'Total Alerts', valueText: String(filtered.length) },
        { id: 'ka-2', labelAr: 'تنبيهات حرجة', labelEn: 'Critical', valueText: String(crit), tone: crit > 0 ? 'critical' : 'positive' },
        { id: 'ka-3', labelAr: 'تحذيرات فنية', labelEn: 'Warnings', valueText: String(warn), tone: warn > 0 ? 'warning' : 'neutral' },
      ];
      charts = [
        {
          id: 'ch-alerts-sev',
          titleAr: 'توزيع التنبيهات حسب الخطورة',
          titleEn: 'Alerts by Severity',
          kind: 'donut',
          data: [
            { key: 'critical', labelAr: 'حرج', labelEn: 'Critical', value: crit, color: '#DC2626' },
            { key: 'warning', labelAr: 'تحذير', labelEn: 'Warning', value: warn, color: '#D97706' },
            {
              key: 'info',
              labelAr: 'معلومة',
              labelEn: 'Info',
              value: filtered.filter((a) => a.severity === 'info').length,
              color: '#0284C7',
            },
          ].filter((d) => d.value > 0),
        },
      ];
      break;
    }

    case 'exec_rbac_matrix': {
      const roles: Role[] = ['admin', 'engineer', 'accountant'].filter(
        (r) => filters.status === 'all' || filters.status === r
      ) as Role[];
      const roleLabels: Record<Role, { ar: string; en: string }> = {
        admin: { ar: 'المدير التنفيذي (Admin)', en: 'Admin' },
        engineer: { ar: 'المهندس (Engineer)', en: 'Engineer' },
        accountant: { ar: 'المحاسب (Accountant)', en: 'Accountant' },
      };
      rows = roles.map((r) => {
        const rp = getRolePermissions(r);
        return {
          id: `role-${r}`,
          groupKey: r,
          cells: {
            role: isAr ? roleLabels[r].ar : roleLabels[r].en,
            canManageProjects: formatBooleanLabel(rp.canManageProjects, lang),
            canDeleteProjects: formatBooleanLabel(rp.canDeleteProjects, lang),
            canEditEngineering: formatBooleanLabel(rp.canEditEngineering, lang),
            canEditFinancials: formatBooleanLabel(rp.canEditFinancials, lang),
            canViewFinancialReports: formatBooleanLabel(rp.canViewFinancialReports, lang),
            canManageTemplates: formatBooleanLabel(rp.canManageTemplates, lang),
            canDeleteReports: formatBooleanLabel(rp.canDeleteReports, lang),
          },
        };
      });
      kpis = [
        { id: 'kr-1', labelAr: 'الأدوار المعتمدة', labelEn: 'Active Roles', valueText: String(roles.length) },
        { id: 'kr-2', labelAr: 'الدور الحالي للجلسة', labelEn: 'Current Session Role', valueText: role.toUpperCase() },
      ];
      break;
    }

    case 'exec_print_audit_log': {
      const actionMap: Record<string, { ar: string; en: string }> = {
        print: { ar: 'طباعة مباشرة', en: 'Direct Print' },
        pdf: { ar: 'تصدير PDF', en: 'PDF Export' },
        xlsx: { ar: 'تصدير Excel', en: 'Excel Export' },
        csv: { ar: 'تصدير CSV', labelEn: 'CSV Export', en: 'CSV Export' } as { ar: string; en: string },
        archive: { ar: 'حفظ بالأرشيف', en: 'Archived' },
      };
      const filtered = auditLogs.filter((entry) => {
        if (filters.status !== 'all' && entry.action !== filters.status) return false;
        if (filters.engineerName !== 'all' && entry.actorName !== filters.engineerName) return false;
        if (!inDateRange(entry.timestamp, filters.dateFrom, filters.dateTo)) return false;
        return true;
      });
      rows = filtered.map((e) => ({
        id: e.id,
        dateValue: e.timestamp.slice(0, 10),
        groupKey: e.action,
        cells: {
          reportNumber: e.reportNumber,
          reportTitle: isAr ? e.reportTitleAr : e.reportTitleEn,
          action: actionMap[e.action] ? (isAr ? actionMap[e.action].ar : actionMap[e.action].en) : e.action,
          actorName: e.actorName,
          actorRole: e.actorRole.toUpperCase(),
          paperSpec: `${e.paperSize} · ${e.orientation}`,
          rowCount: e.rowCount,
          timestamp: e.timestamp.slice(0, 16).replace('T', ' '),
        },
      }));
      kpis = [
        { id: 'kl-1', labelAr: 'إجمالي العمليات', labelEn: 'Total Operations', valueText: String(filtered.length) },
        { id: 'kl-2', labelAr: 'ملفات PDF', labelEn: 'PDF Exports', valueText: String(filtered.filter((l) => l.action === 'pdf').length) },
        { id: 'kl-3', labelAr: 'طباعة مباشرة', labelEn: 'Direct Prints', valueText: String(filtered.filter((l) => l.action === 'print').length) },
      ];
      break;
    }

    case 'fin_portfolio_ledger': {
      const list = filterProjectsList((p) => p.permitDate);
      rows = list.map((p) => {
        const remaining = Math.max(0, p.approvedBudget - p.paidAmount);
        const pct = p.approvedBudget > 0 ? Math.round((p.paidAmount / p.approvedBudget) * 100) : 0;
        const retention = Math.round((p.approvedBudget * (p.retentionPercentage || 0)) / 100);
        return {
          id: p.id,
          projectId: p.id,
          dateValue: p.permitDate,
          groupKey: isAr ? PROJECT_STATUS_LABELS[p.status].ar : PROJECT_STATUS_LABELS[p.status].en,
          cells: {
            code: p.code,
            name: isAr ? p.name : p.nameEn,
            ownerName: p.ownerName,
            approvedBudget: p.approvedBudget,
            invoicedAmount: p.invoicedAmount,
            paidAmount: p.paidAmount,
            remainingAmount: remaining,
            collectionPct: pct,
            retentionAmount: retention,
          },
        };
      });
      const totalBudget = list.reduce((s, p) => s + p.approvedBudget, 0);
      const totalPaid = list.reduce((s, p) => s + p.paidAmount, 0);
      const totalRemaining = Math.max(0, totalBudget - totalPaid);
      const pct = totalBudget > 0 ? Math.round((totalPaid / totalBudget) * 100) : 0;

      kpis = [
        { id: 'kf-1', labelAr: 'القيمة التعاقدية الإجمالية', labelEn: 'Approved Budget', valueText: formatAED(totalBudget, lang) },
        { id: 'kf-2', labelAr: 'إجمالي الدفعات المستلمة', labelEn: 'Payments Received', valueText: formatAED(totalPaid, lang), tone: 'positive' },
        { id: 'kf-3', labelAr: 'الرصيد المتبقي', labelEn: 'Remaining Balance', valueText: formatAED(totalRemaining, lang), tone: 'warning' },
        { id: 'kf-4', labelAr: 'نسبة التحصيل', labelEn: 'Collection Rate', valueText: `${pct}%`, numericValue: pct },
      ];
      charts = [buildFinancialBarChart(list, isAr)];
      break;
    }

    case 'fin_payment_milestones': {
      const list = filterProjectsList();
      const milestoneStatusMap = {
        paid: { ar: 'مدفوعة', en: 'Paid' },
        invoiced: { ar: 'مفوترة', en: 'Invoiced' },
        pending: { ar: 'مجدولة', en: 'Pending' },
      };
      const items: Array<{ p: Project; m: Project['paymentMilestones'][number] }> = [];
      for (const p of list) {
        for (const m of p.paymentMilestones) {
          if (filters.status !== 'all' && m.status !== filters.status) continue;
          if (!inDateRange(m.dueDate, filters.dateFrom, filters.dateTo)) continue;
          items.push({ p, m });
        }
      }
      rows = items.map(({ p, m }) => ({
        id: `${p.id}-${m.id}`,
        projectId: p.id,
        dateValue: m.dueDate,
        groupKey: p.code,
        cells: {
          projectCode: p.code,
          projectName: isAr ? p.name : p.nameEn,
          title: isAr ? m.titleAr : m.titleEn,
          percentage: m.percentage,
          amountAed: m.amountAed,
          dueDate: m.dueDate,
          status: isAr ? milestoneStatusMap[m.status].ar : milestoneStatusMap[m.status].en,
        },
      }));
      const paidSum = items.filter((x) => x.m.status === 'paid').reduce((s, x) => s + x.m.amountAed, 0);
      const pendingSum = items.filter((x) => x.m.status !== 'paid').reduce((s, x) => s + x.m.amountAed, 0);
      kpis = [
        { id: 'km-1', labelAr: 'عدد الدفعات', labelEn: 'Milestones Count', valueText: String(items.length) },
        { id: 'km-2', labelAr: 'الدفعات المسددة', labelEn: 'Paid Total', valueText: formatAED(paidSum, lang), tone: 'positive' },
        { id: 'km-3', labelAr: 'الدفعات المجدولة', labelEn: 'Pending Total', valueText: formatAED(pendingSum, lang), tone: 'warning' },
      ];
      break;
    }

    case 'fin_boq_vat_valuation': {
      const list = filterProjectsList();
      let sumDirect = 0;
      let sumVat = 0;
      let sumGrand = 0;
      rows = list.map((p) => {
        const cfg = p.takeoffSummaryConfig || { overheadPercent: 10, profitPercent: 12, vatPercent: 5 };
        const summary = computeTakeoffSummary(
          p.id,
          p.takeoffMeasurements || [],
          cfg.overheadPercent,
          cfg.profitPercent,
          cfg.vatPercent
        );
        sumDirect += summary.directCostAed;
        sumVat += summary.vatAed;
        sumGrand += summary.grandTotalAed;
        return {
          id: p.id,
          projectId: p.id,
          groupKey: isAr ? PROJECT_TYPE_LABELS[p.projectType].ar : PROJECT_TYPE_LABELS[p.projectType].en,
          cells: {
            code: p.code,
            name: isAr ? p.name : p.nameEn,
            itemCount: (p.takeoffMeasurements || []).length,
            directCostAed: summary.directCostAed,
            overheadProfitAed: summary.overheadAed + summary.profitAed,
            vatAed: summary.vatAed,
            grandTotalAed: summary.grandTotalAed,
          },
        };
      });
      kpis = [
        { id: 'kb-1', labelAr: 'إجمالي التكلفة المباشرة', labelEn: 'Total Direct Cost', valueText: formatAED(sumDirect, lang) },
        { id: 'kb-2', labelAr: 'إجمالي ضريبة القيمة المضافة 5%', labelEn: 'Total UAE 5% VAT', valueText: formatAED(sumVat, lang), tone: 'warning' },
        { id: 'kb-3', labelAr: 'الإجمالي العام للمقايسات', labelEn: 'BOQ Grand Total', valueText: formatAED(sumGrand, lang), tone: 'positive' },
      ];
      break;
    }

    case 'fin_rate_library': {
      rows = rateLibrary.map((r) => ({
        id: r.id,
        groupKey: isAr ? CATEGORY_LABELS[r.category].ar : CATEGORY_LABELS[r.category].en,
        cells: {
          code: r.code,
          category: isAr ? CATEGORY_LABELS[r.category].ar : CATEGORY_LABELS[r.category].en,
          name: isAr ? r.nameAr : r.nameEn,
          unit: r.unit,
          rateAed: r.rateAed,
          equipmentRate: r.equipmentRate || 0,
          materialSpec: r.materialSpec,
        },
      }));
      kpis = [
        { id: 'krl-1', labelAr: 'بنود كتالوج الأسعار', labelEn: 'Rate Items', valueText: String(rateLibrary.length) },
      ];
      break;
    }

    case 'proj_phases_delays': {
      const list = filterProjectsList();
      const phaseStatusMap = {
        completed: { ar: 'مكتملة', en: 'Completed' },
        in_progress: { ar: 'قيد التنفيذ', en: 'In Progress' },
        not_started: { ar: 'لم تبدأ', en: 'Not Started' },
      };
      const items: Array<{ p: Project; ph: Project['phases'][number] }> = [];
      for (const p of list) {
        for (const ph of p.phases) {
          if (filters.status !== 'all' && ph.status !== filters.status) continue;
          if (!inDateRange(ph.startDate, filters.dateFrom, filters.dateTo)) continue;
          items.push({ p, ph });
        }
      }
      rows = items.map(({ p, ph }) => {
        const gap = p.actualProgress - p.plannedProgress;
        return {
          id: `${p.id}-${ph.id}`,
          projectId: p.id,
          dateValue: ph.startDate,
          groupKey: `${p.code} — ${isAr ? p.name : p.nameEn}`,
          cells: {
            projectCode: p.code,
            projectName: isAr ? p.name : p.nameEn,
            phaseName: isAr ? ph.nameAr : ph.nameEn,
            weightPercentage: ph.weightPercentage,
            progressPercentage: ph.progressPercentage,
            projectGap: gap,
            startDate: ph.startDate,
            endDate: ph.endDate,
            status: isAr ? phaseStatusMap[ph.status].ar : phaseStatusMap[ph.status].en,
          },
        };
      });
      const delayedProjects = list.filter(
        (p) => p.status === 'under_construction' && p.plannedProgress - p.actualProgress >= 10
      ).length;
      kpis = [
        { id: 'kp-1', labelAr: 'إجمالي المراحل', labelEn: 'Total Phases', valueText: String(items.length) },
        { id: 'kp-2', labelAr: 'مراحل مكتملة', labelEn: 'Completed Phases', valueText: String(items.filter((x) => x.ph.status === 'completed').length), tone: 'positive' },
        { id: 'kp-3', labelAr: 'مشاريع متأخرة (≥10%)', labelEn: 'Delayed Projects', valueText: String(delayedProjects), tone: delayedProjects > 0 ? 'warning' : 'positive' },
      ];
      break;
    }

    case 'proj_bim_takeoff_quantities': {
      const list = filterProjectsList();
      const entries: Array<{ p: Project; m: NonNullable<Project['takeoffMeasurements']>[number] }> = [];
      for (const p of list) {
        for (const m of p.takeoffMeasurements || []) {
          if (!inDateRange(m.createdAt, filters.dateFrom, filters.dateTo)) continue;
          entries.push({ p, m });
        }
      }
      rows = entries.map(({ p, m }) => ({
        id: `${p.id}-${m.id}`,
        projectId: p.id,
        dateValue: m.createdAt?.slice(0, 10),
        groupKey: isAr ? CATEGORY_LABELS[m.category].ar : CATEGORY_LABELS[m.category].en,
        cells: {
          projectCode: p.code,
          category: isAr ? CATEGORY_LABELS[m.category].ar : CATEGORY_LABELS[m.category].en,
          label: isAr ? m.labelAr : m.label,
          tool: m.tool,
          computedQuantity: m.computedQuantity,
          unit: m.unit,
          createdAt: (m.createdAt || '').slice(0, 10),
        },
      }));
      kpis = [
        { id: 'kqt-1', labelAr: 'بنود الحصر الهندسي', labelEn: 'Takeoff Lines', valueText: String(entries.length) },
        { id: 'kqt-2', labelAr: 'مشاريع محصورة', labelEn: 'Projects Measured', valueText: String(new Set(entries.map((e) => e.p.id)).size) },
      ];
      break;
    }

    case 'client_owners_summary': {
      const grouped = new Map<
        string,
        {
          ownerName: string;
          ownerPhone: string;
          ownerEmail: string;
          projects: Project[];
        }
      >();
      for (const p of projects) {
        if (filters.clientName !== 'all' && p.ownerName !== filters.clientName) continue;
        const existing = grouped.get(p.ownerName) || {
          ownerName: p.ownerName,
          ownerPhone: p.ownerPhone,
          ownerEmail: p.ownerEmail,
          projects: [],
        };
        existing.projects.push(p);
        grouped.set(p.ownerName, existing);
      }
      rows = Array.from(grouped.values()).map((c, idx) => {
        const avg = Math.round(
          c.projects.reduce((s, p) => s + p.actualProgress, 0) / Math.max(1, c.projects.length)
        );
        const totalBudget = c.projects.reduce((s, p) => s + p.approvedBudget, 0);
        return {
          id: `client-${idx}`,
          cells: {
            ownerName: c.ownerName,
            ownerPhone: c.ownerPhone,
            ownerEmail: c.ownerEmail,
            projectCount: c.projects.length,
            avgProgress: avg,
            approvedBudget: perms.canViewFinancialReports ? totalBudget : 0,
          },
        };
      });
      kpis = [
        { id: 'kc-1', labelAr: 'إجمالي الملاك / العملاء', labelEn: 'Total Clients', valueText: String(rows.length) },
        { id: 'kc-2', labelAr: 'إجمالي المشاريع المملوكة', labelEn: 'Client Projects', valueText: String(projects.length) },
      ];
      break;
    }

    case 'gov_clearances_registry': {
      const projectById = new Map(projects.map((p) => [p.id, p]));
      const filtered = transactions.filter((tx) => {
        if (filters.projectId !== 'all' && tx.projectId !== filters.projectId) return false;
        if (filters.engineerName !== 'all' && tx.reviewEngineer !== filters.engineerName) return false;
        if (filters.status !== 'all' && tx.status !== filters.status) return false;
        if (!inDateRange(tx.submissionDate, filters.dateFrom, filters.dateTo)) return false;
        return true;
      });
      rows = filtered.map((tx) => {
        const proj = projectById.get(tx.projectId);
        return {
          id: tx.id,
          projectId: tx.projectId,
          dateValue: tx.submissionDate,
          groupKey: isAr ? AUTHORITY_LABELS[tx.authority].ar : AUTHORITY_LABELS[tx.authority].en,
          cells: {
            transactionNumber: tx.transactionNumber,
            projectCode: proj ? `${proj.code} · ${isAr ? proj.name : proj.nameEn}` : tx.projectId,
            authority: isAr ? AUTHORITY_LABELS[tx.authority].ar : AUTHORITY_LABELS[tx.authority].en,
            serviceName: isAr ? tx.serviceName : tx.serviceNameEn || tx.serviceName,
            reviewEngineer: tx.reviewEngineer,
            status: isAr ? TX_STATUS_LABELS[tx.status].ar : TX_STATUS_LABELS[tx.status].en,
            submissionDate: tx.submissionDate,
            lastUpdatedDate: tx.lastUpdatedDate,
          },
        };
      });
      const approved = filtered.filter((t) => t.status === 'approved').length;
      const actionReq = filtered.filter((t) => t.status === 'action_required').length;
      kpis = [
        { id: 'kg-1', labelAr: 'إجمالي المعاملات', labelEn: 'Total Clearances', valueText: String(filtered.length) },
        { id: 'kg-2', labelAr: 'معاملات معتمدة', labelEn: 'Approved', valueText: String(approved), tone: 'positive' },
        { id: 'kg-3', labelAr: 'تتطلب استكمال', labelEn: 'Action Required', valueText: String(actionReq), tone: actionReq > 0 ? 'critical' : 'positive' },
      ];
      charts = [buildClearanceAuthorityChart(filtered, isAr)];
      break;
    }

    case 'doc_vault_registry': {
      const list = filterProjectsList();
      const docEntries: Array<{ p: Project; d: Project['documents'][number] }> = [];
      for (const p of list) {
        for (const d of p.documents) {
          if (filters.status !== 'all' && d.category !== filters.status) continue;
          if (!inDateRange(d.uploadedAt, filters.dateFrom, filters.dateTo)) continue;
          docEntries.push({ p, d });
        }
      }
      rows = docEntries.map(({ p, d }) => ({
        id: `${p.id}-${d.id}`,
        projectId: p.id,
        dateValue: d.uploadedAt,
        groupKey: d.category.toUpperCase(),
        cells: {
          projectCode: p.code,
          name: d.name,
          category: d.category.toUpperCase(),
          sizeKb: Number((d.sizeBytes / 1024).toFixed(1)),
          cloudStatus: d.manifestId
            ? isAr ? 'مجزأ ومزامن' : 'Cloud Chunked'
            : isAr ? 'محلي' : 'Local Cache',
          uploadedAt: d.uploadedAt,
        },
      }));
      kpis = [
        { id: 'kd-1', labelAr: 'إجمالي الوثائق', labelEn: 'Documents Count', valueText: String(docEntries.length) },
      ];
      break;
    }

    case 'gis_plots_compliance': {
      const list = filterProjectsList();
      rows = list.map((p) => ({
        id: p.id,
        projectId: p.id,
        groupKey: p.gisData.sectorName,
        cells: {
          projectCode: `${p.code} · ${isAr ? p.name : p.nameEn}`,
          plotNumber: p.gisData.plotNumber,
          sectorName: p.gisData.sectorName,
          zoning: p.gisData.zoning,
          plotAreaSqM: p.gisData.plotAreaSqM,
          builtUpAreaSqM: Number((p.gisData.builtUpAreaSqFt * 0.092903).toFixed(1)),
          setbacksSummary: `${p.gisData.setbacks.front}m / ${p.gisData.setbacks.rear}m / ${p.gisData.setbacks.sideLeft}-${p.gisData.setbacks.sideRight}m`,
        },
      }));
      kpis = [
        { id: 'kgs-1', labelAr: 'قطع الأراضي المسجلة', labelEn: 'Registered Plots', valueText: String(list.length) },
        {
          id: 'kgs-2',
          labelAr: 'إجمالي مساحات الأراضي (م²)',
          labelEn: 'Total Land Area (m²)',
          valueText: Math.round(list.reduce((s, p) => s + p.gisData.plotAreaSqM, 0)).toLocaleString('en-US'),
        },
      ];
      break;
    }
  }

  // Keyword filter across visible/all cell values
  const kw = filters.keyword.trim().toLowerCase();
  if (kw) {
    rows = rows.filter((row) =>
      Object.values(row.cells).some((v) => String(v).toLowerCase().includes(kw))
    );
  }

  // Sorting
  if (filters.sortColumn && allowedKeys.has(filters.sortColumn)) {
    const colKey = filters.sortColumn;
    const dir = filters.sortDirection === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const va = a.cells[colKey];
      const vb = b.cells[colKey];
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va ?? '').localeCompare(String(vb ?? ''), isAr ? 'ar' : 'en') * dir;
    });
  }

  // Optional grouping sort prefix so rows of same group sit contiguously
  if (filters.groupBy && filters.groupBy !== 'none' && allowedKeys.has(filters.groupBy)) {
    const gKey = filters.groupBy;
    rows = [...rows].sort((a, b) =>
      String(a.cells[gKey] ?? '').localeCompare(String(b.cells[gKey] ?? ''), isAr ? 'ar' : 'en')
    );
  }

  // Totals row
  const showTotals = input.showTotals ?? true;
  let totalsRow: Record<string, string | number> | null = null;
  if (showTotals && rows.length > 0) {
    const tRow: Record<string, string | number> = {};
    let hasAgg = false;
    effectiveColumns.forEach((col, index) => {
      if (index === 0) {
        tRow[col.key] = isAr ? `الإجمالي (${rows.length})` : `Total (${rows.length})`;
      } else if (col.aggregatable === 'sum') {
        hasAgg = true;
        const sum = rows.reduce((acc, r) => acc + (Number(r.cells[col.key]) || 0), 0);
        tRow[col.key] = Number(sum.toFixed(2));
      } else if (col.aggregatable === 'avg') {
        hasAgg = true;
        const avg = rows.reduce((acc, r) => acc + (Number(r.cells[col.key]) || 0), 0) / rows.length;
        tRow[col.key] = Number(avg.toFixed(1));
      } else {
        tRow[col.key] = '';
      }
    });
    if (hasAgg) totalsRow = tRow;
  }

  const nowIso = new Date().toISOString();

  return {
    reportNumber: input.reportNumber || generateReportNumber(definitionId),
    definitionId,
    category: def.category,
    titleAr: input.customTitleAr?.trim() || def.titleAr,
    titleEn: input.customTitleEn?.trim() || def.titleEn,
    subtitleAr: def.descriptionAr,
    subtitleEn: def.descriptionEn,
    generatedAt: nowIso,
    generatedBy: actorName,
    generatedRole: role,
    lang,
    templateId: input.templateId || def.recommendedTemplate,
    filters,
    columns: effectiveColumns,
    visibleColumnKeys,
    rows,
    totalsRow,
    kpis,
    charts,
    notes: input.notes ?? '',
    showTotals,
    showKpis: input.showKpis ?? true,
    showCharts: input.showCharts ?? charts.length > 0,
    showSignatures: input.showSignatures ?? true,
    showStamp: input.showStamp ?? true,
  };
}

function buildStatusDonutChart(list: Project[]): ReportChartSeries {
  const counts = {
    under_construction: list.filter((p) => p.status === 'under_construction').length,
    permitting: list.filter((p) => p.status === 'permitting').length,
    suspended: list.filter((p) => p.status === 'suspended').length,
    completed: list.filter((p) => p.status === 'completed').length,
  };
  return {
    id: 'chart-proj-status',
    titleAr: 'توزيع المشاريع حسب الحالة التنفيذية',
    titleEn: 'Projects Distribution by Execution Status',
    kind: 'donut',
    valueFormat: 'number',
    data: [
      { key: 'under_construction', labelAr: 'تحت التنفيذ', labelEn: 'Under Construction', value: counts.under_construction, color: '#059669' },
      { key: 'permitting', labelAr: 'قيد التراخيص', labelEn: 'Permitting', value: counts.permitting, color: '#D97706' },
      { key: 'completed', labelAr: 'منجز ومسلّم', labelEn: 'Completed', value: counts.completed, color: '#0284C7' },
      { key: 'suspended', labelAr: 'متوقف', labelEn: 'Suspended', value: counts.suspended, color: '#DC2626' },
    ].filter((d) => d.value > 0),
  };
}

function buildProgressBarChart(list: Project[], isAr: boolean): ReportChartSeries {
  return {
    id: 'chart-proj-progress',
    titleAr: 'مقارنة الإنجاز الفعلي مقابل المخطط (أبرز المشاريع)',
    titleEn: 'Actual vs Planned Progress (Top Active Projects)',
    kind: 'bar',
    valueFormat: 'percent',
    data: list.slice(0, 7).map((p) => ({
      key: p.code,
      labelAr: p.code,
      labelEn: p.code,
      value: p.actualProgress,
      secondaryValue: p.plannedProgress,
      color: isAr ? '#334155' : '#334155',
    })),
  };
}

function buildFinancialBarChart(list: Project[], _isAr: boolean): ReportChartSeries {
  return {
    id: 'chart-fin-budget-paid',
    titleAr: 'الميزانية التعاقدية مقابل المحصّل (أعلى 7 مشاريع)',
    titleEn: 'Approved Budget vs Payments Received (Top 7)',
    kind: 'bar',
    valueFormat: 'currency',
    data: [...list]
      .sort((a, b) => b.approvedBudget - a.approvedBudget)
      .slice(0, 7)
      .map((p) => ({
        key: p.code,
        labelAr: p.code,
        labelEn: p.code,
        value: p.paidAmount,
        secondaryValue: p.approvedBudget,
        color: '#059669',
      })),
  };
}

function buildClearanceAuthorityChart(list: GovernmentTransaction[], _isAr: boolean): ReportChartSeries {
  const counts = new Map<string, number>();
  for (const tx of list) {
    counts.set(tx.authority, (counts.get(tx.authority) || 0) + 1);
  }
  const colors = ['#1E293B', '#B4863C', '#0284C7', '#059669', '#D97706', '#6366F1', '#64748B'];
  return {
    id: 'chart-gov-auth',
    titleAr: 'المعاملات حسب الجهة الحكومية',
    titleEn: 'Clearances by Government Authority',
    kind: 'donut',
    valueFormat: 'number',
    data: Array.from(counts.entries()).map(([auth, value], idx) => {
      const meta = AUTHORITY_LABELS[auth as keyof typeof AUTHORITY_LABELS];
      return {
        key: auth,
        labelAr: meta ? meta.ar : auth,
        labelEn: meta ? meta.short : auth,
        value,
        color: colors[idx % colors.length],
      };
    }),
  };
}

export interface ReportsDashboardAnalytics {
  availableReportsCount: number;
  totalProjects: number;
  activeClearances: number;
  delayedProjectsCount: number;
  avgActualProgress: number;
  avgPlannedProgress: number;
  progressPeriodDelta: number;
  statusDonut: ReportChartSeries;
  comparisonBar: ReportChartSeries;
  authorityDonut: ReportChartSeries;
}

export function computeReportsDashboardAnalytics(params: {
  projects: Project[];
  transactions: GovernmentTransaction[];
  role: Role;
  lang: Language;
}): ReportsDashboardAnalytics {
  const { projects, transactions, role, lang } = params;
  const perms = getRolePermissions(role);
  const availableReportsCount = getAvailableReportDefinitions(role).length;
  const isAr = lang === 'ar';

  const avgActualProgress =
    projects.length > 0
      ? Math.round(projects.reduce((s, p) => s + p.actualProgress, 0) / projects.length)
      : 0;
  const avgPlannedProgress =
    projects.length > 0
      ? Math.round(projects.reduce((s, p) => s + p.plannedProgress, 0) / projects.length)
      : 0;

  return {
    availableReportsCount,
    totalProjects: projects.length,
    activeClearances: transactions.length,
    delayedProjectsCount: projects.filter(
      (p) => p.status === 'under_construction' && p.plannedProgress - p.actualProgress >= 10
    ).length,
    avgActualProgress,
    avgPlannedProgress,
    progressPeriodDelta: avgActualProgress - avgPlannedProgress,
    statusDonut: buildStatusDonutChart(projects),
    comparisonBar: perms.canViewFinancialReports
      ? buildFinancialBarChart(projects, isAr)
      : buildProgressBarChart(projects, isAr),
    authorityDonut: buildClearanceAuthorityChart(transactions, isAr),
  };
}
