import type {
  GovernmentAuthority,
  Language,
  ProjectStatus,
  ProjectType,
  TakeoffCategory,
  TransactionStatus,
} from '../types/bunyan';

export function formatAED(amount: number, lang: Language = 'ar'): string {
  const formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
  return lang === 'ar' ? `${formatted} د.إ` : `AED ${formatted}`;
}

export function formatNumber(val: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(val) ? val : 0);
}

export const CATEGORY_LABELS: Record<
  TakeoffCategory,
  { ar: string; en: string; color: string; defaultUnit: 'm' | 'm2' | 'm3' | 'ton' | 'unit' }
> = {
  excavation: { ar: 'أعمال الحفر والردم', en: 'Excavation & Earthworks', color: '#D97706', defaultUnit: 'm3' },
  concrete: { ar: 'الخرسانة المسلحة', en: 'Reinforced Concrete', color: '#64748B', defaultUnit: 'm3' },
  steel: { ar: 'حديد التسليح', en: 'Reinforcement Steel', color: '#0EA5E9', defaultUnit: 'ton' },
  masonry: { ar: 'أعمال الطابوق والمباني', en: 'Masonry & Blockwork', color: '#B45309', defaultUnit: 'm2' },
  plastering: { ar: 'أعمال اللياسة والقصارة', en: 'Plastering Works', color: '#8B5CF6', defaultUnit: 'm2' },
  waterproofing: { ar: 'العزل المائي والحراري', en: 'Waterproofing & Insulation', color: '#06B6D4', defaultUnit: 'm2' },
  flooring: { ar: 'الأرضيات والرخام', en: 'Flooring & Tiling', color: '#EC4899', defaultUnit: 'm2' },
  painting: { ar: 'أعمال الدهانات', en: 'Painting Works', color: '#10B981', defaultUnit: 'm2' },
  ceilings: { ar: 'الأسقف المستعارة', en: 'False Ceilings', color: '#6366F1', defaultUnit: 'm2' },
  doors_windows: { ar: 'الأبواب والنوافذ', en: 'Doors & Windows', color: '#F59E0B', defaultUnit: 'unit' },
  electrical: { ar: 'الأعمال الكهربائية', en: 'Electrical Systems', color: '#EAB308', defaultUnit: 'unit' },
  plumbing_hvac: { ar: 'السباكة والتكييف', en: 'Plumbing & HVAC', color: '#3B82F6', defaultUnit: 'm' },
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, { ar: string; en: string; tone: string }> = {
  permitting: { ar: 'قيد التراخيص', en: 'Permitting', tone: 'text-amber-600 dark:text-amber-400' },
  under_construction: { ar: 'تحت التنفيذ', en: 'Under Construction', tone: 'text-emerald-600 dark:text-emerald-400' },
  suspended: { ar: 'متوقف مؤقتاً', en: 'Suspended', tone: 'text-rose-600 dark:text-rose-400' },
  completed: { ar: 'منجز ومسلّم', en: 'Completed', tone: 'text-sky-600 dark:text-sky-400' },
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, { ar: string; en: string }> = {
  villa: { ar: 'فيلا سكنية', en: 'Residential Villa' },
  commercial_tower: { ar: 'برج تجاري', en: 'Commercial Tower' },
  residential_complex: { ar: 'مجمع سكني', en: 'Residential Complex' },
  warehouse: { ar: 'مستودع صناعي', en: 'Industrial Warehouse' },
  infrastructure: { ar: 'بنية تحتية', en: 'Infrastructure' },
  institutional: { ar: 'مبنى مؤسسي', en: 'Institutional' },
};

export const AUTHORITY_LABELS: Record<GovernmentAuthority, { ar: string; en: string; short: string }> = {
  sharjah_municipality: { ar: 'بلدية مدينة الشارقة', en: 'Sharjah Municipality', short: 'SHJ-MUN' },
  sewa: { ar: 'هيئة كهرباء ومياه وغاز الشارقة', en: 'SEWA', short: 'SEWA' },
  szhp: { ar: 'برنامج الشيخ زايد للإسكان', en: 'Sheikh Zayed Housing Programme', short: 'SZHP' },
  civil_defense: { ar: 'الدفاع المدني بالشارقة', en: 'Sharjah Civil Defense', short: 'SCD' },
  planning_survey: { ar: 'دائرة التخطيط والمساحة', en: 'Dept. of Planning & Survey', short: 'DTPS' },
  municipalities_affairs: { ar: 'دائرة شؤون البلديات', en: 'Municipalities Affairs Dept.', short: 'DMA' },
  sharjah_housing: { ar: 'دائرة الإسكان بالشارقة', en: 'Sharjah Housing Dept.', short: 'SHD' },
};

export const TX_STATUS_LABELS: Record<TransactionStatus, { ar: string; en: string; tone: string }> = {
  approved: { ar: 'معتمد', en: 'Approved', tone: 'text-emerald-600 dark:text-emerald-400' },
  in_review: { ar: 'قيد المراجعة الفنية', en: 'In Technical Review', tone: 'text-sky-600 dark:text-sky-400' },
  action_required: { ar: 'يتطلب تعديل / استكمال', en: 'Action Required', tone: 'text-rose-600 dark:text-rose-400' },
  pending_inspection: { ar: 'بانتظار التفتيش الميداني', en: 'Pending Inspection', tone: 'text-amber-600 dark:text-amber-400' },
};

export const UI_TEXT = {
  ar: {
    appName: 'منصة بنيان',
    appSubtitle: 'نظام القيادة الهندسي والتوأم الرقمي 5D BIM',
    nav: {
      dashboard: 'لوحة التحكم',
      command: 'مركز القيادة التنفيذي',
      projects: 'المشاريع والعقود',
      financials: 'الملخص المالي والمستخلصات',
      documents: 'أرشيف المخططات والوثائق',
      reports: 'مركز التقارير واللوائح',
      studio: 'استوديو الحصر و BIM 3D',
      bim: 'محاكي BIM 5D',
      takeoff: 'المحرر الهندسي و PDF',
      gis: 'مستكشف الأقمار GIS',
      structural: 'الذكاء الإنشائي (ETABS)',
      government: 'بوابة البلدية والجهات',
      accounts: 'الحسابات والصلاحيات',
      settings: 'الإعدادات والدعم الفني',
    },
    navGroups: {
      executive: 'الرئيسية',
      portfolio: 'المشاريع والبيانات',
      engineering: 'الهندسة والنمذجة (BIM)',
      system: 'الإدارة والإعدادات',
    },
    actions: {
      newProject: 'مشروع جديد',
      backupSync: 'النسخ الاحتياطي والمزامنة',
      exportExcel: 'تصدير Excel',
      printReport: 'طباعة التقرير',
      save: 'حفظ',
      cancel: 'إلغاء',
      edit: 'تعديل',
      delete: 'حذف',
      close: 'إغلاق',
      uploadDoc: 'رفع مستند هندسي',
      signInGoogle: 'تسجيل الدخول عبر Google',
      signOut: 'تسجيل الخروج',
    },
  },
  en: {
    appName: 'BUNYAN · بنيان',
    appSubtitle: '5D BIM Digital Twin & Engineering Command Platform',
    nav: {
      dashboard: 'Control Dashboard',
      command: 'Executive Command Center',
      projects: 'Projects & Contracts',
      financials: 'Financials & Certificates',
      documents: 'Blueprints & Documents Vault',
      reports: 'Reports & Regulations Center',
      studio: 'Takeoff & 3D BIM Studio',
      bim: '5D BIM Simulator',
      takeoff: 'Engineering & PDF Editor',
      gis: 'Satellite & GIS Explorer',
      structural: 'Structural Intelligence',
      government: 'Municipal & Authority Portal',
      accounts: 'Accounts & Permissions',
      settings: 'Settings & Tech Support',
    },
    navGroups: {
      executive: 'Main',
      portfolio: 'Projects & Data',
      engineering: 'Engineering & BIM',
      system: 'Administration & Settings',
    },
    actions: {
      newProject: 'New Project',
      backupSync: 'Backup & Sync',
      exportExcel: 'Export Excel',
      printReport: 'Print Report',
      save: 'Save',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      close: 'Close',
      uploadDoc: 'Upload Document',
      signInGoogle: 'Sign in with Google',
      signOut: 'Sign Out',
    },
  },
};
