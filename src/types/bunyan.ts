export type Language = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';

export type Role = 'admin' | 'engineer' | 'accountant';

export interface CompanyProfile {
  nameAr: string;
  nameEn: string;
  licenseNumber: string;
  municipalityClass: string;
  trnNumber: string; // UAE VAT Tax Registration Number
  addressAr: string;
  addressEn: string;
  phone: string;
  email: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  companyName?: string;
  licenseNumber?: string;
  biometricRegistered: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectType =
  | 'villa'
  | 'commercial_tower'
  | 'residential_complex'
  | 'warehouse'
  | 'infrastructure'
  | 'institutional';

export type ProjectStatus =
  | 'permitting'
  | 'under_construction'
  | 'suspended'
  | 'completed';

export interface ConstructionPhase {
  id: string;
  nameAr: string;
  nameEn: string;
  weightPercentage: number;
  progressPercentage: number;
  status: 'not_started' | 'in_progress' | 'completed';
  startDate: string;
  endDate: string;
}

export interface FinancialMilestone {
  id: string;
  titleAr: string;
  titleEn: string;
  percentage: number;
  amountAed: number;
  dueDate: string;
  status: 'pending' | 'invoiced' | 'paid';
}

export interface ProjectDocument {
  id: string;
  name: string;
  category: 'permit' | 'structural' | 'architectural' | 'mep' | 'contract' | 'gis';
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  manifestId?: string; // Firestore chunked manifest ID
  localDataUrl?: string; // In-memory / data URL preview
}

export interface GisBoundaryPoint {
  x: number; // meters relative to origin
  y: number; // meters relative to origin
  label?: string;
}

export interface GisPlotData {
  plotNumber: string;
  basinNumber: string;
  sectorName: string;
  emirate: string;
  latitude: number;
  longitude: number;
  plotAreaSqFt: number;
  plotAreaSqM: number;
  builtUpAreaSqFt: number;
  zoning: string;
  setbacks: {
    front: number;
    rear: number;
    sideLeft: number;
    sideRight: number;
  };
  boundaryPoints: GisBoundaryPoint[];
}

export type GovernmentAuthority =
  | 'sharjah_municipality'
  | 'sewa'
  | 'szhp'
  | 'civil_defense'
  | 'planning_survey'
  | 'municipalities_affairs'
  | 'sharjah_housing';

export type TransactionStatus =
  | 'approved'
  | 'in_review'
  | 'action_required'
  | 'pending_inspection';

export interface GovernmentTransaction {
  id: string;
  ownerId?: string;
  projectId: string;
  authority: GovernmentAuthority;
  transactionNumber: string;
  serviceName: string;
  serviceNameEn?: string;
  status: TransactionStatus;
  submissionDate: string;
  lastUpdatedDate: string;
  reviewEngineer: string;
  notes?: string;
  officialPortalUrl: string;
}

// ==================== 5D BIM ENGINE TYPES ====================

export type BimDiscipline = 'structural' | 'architectural' | 'mep' | 'site';

export type BimCategory =
  | 'foundation'
  | 'pedestal'
  | 'tie_beam'
  | 'column'
  | 'beam'
  | 'slab'
  | 'wall'
  | 'door_window'
  | 'stair'
  | 'glass'
  | 'mep_hvac'
  | 'mep_plumbing'
  | 'mep_electrical'
  | 'site_grid';

export type BimLevel =
  | 'foundation'
  | 'ground'
  | 'level1'
  | 'level2'
  | 'level3'
  | 'roof';

export type BimCameraPreset = 'iso' | 'top' | 'front' | 'back' | 'left' | 'right';

export type BimRenderMode = 'pbr' | 'wireframe' | 'xray' | 'transparent';

export type BimSectionMode = 'none' | 'x' | 'y' | 'z' | 'box';

export interface BimVoidCutout {
  id: string;
  label: string;
  width: number;
  height: number;
  areaM2: number;
}

export interface BimElement {
  id: string;
  guid: string;
  name: string;
  nameAr: string;
  discipline: BimDiscipline;
  category: BimCategory;
  level: BimLevel;
  position: [number, number, number];
  dimensions: [number, number, number];
  rotation?: [number, number, number];
  materialName: string;
  concreteGrade?: string;
  rebarSpec?: string;
  grossAreaM2: number;
  deductedOpeningAreaM2: number;
  netAreaM2: number;
  volumeM3: number;
  voidCutouts?: BimVoidCutout[];
  boqCategory: TakeoffCategory;
  unitRate: number;
  estimatedCost: number;
  boqItemId?: string;
  linkedMeasurementId?: string;
}

export type DrawingSourceType =
  | 'ifc'
  | 'dxf'
  | 'dwg'
  | 'vector_pdf'
  | 'raster_image';

export type VerificationStatus =
  | 'verified'
  | 'estimated'
  | 'missing_data'
  | 'needs_review'
  | 'mismatch';

export type ModelVerificationBadge =
  | 'BIM VERIFIED'
  | 'PARTIALLY EXTRACTED'
  | 'CALIBRATION REQUIRED'
  | 'HUMAN REVIEW REQUIRED'
  | 'EXTRACTION FAILED';

export interface BimCalibrationData {
  isCalibrated: boolean;
  referenceLengthM: number;
  measuredUnits: number;
  scaleFactor: number;
  lockedAt?: string;
  lockedBy?: string;
}

export interface DrawingAnalysisReport {
  id: string;
  fileName: string;
  sourceType: DrawingSourceType;
  verificationStatus: VerificationStatus;
  badge: ModelVerificationBadge;
  confidenceScore: number;
  elementCount: number;
  warnings: string[];
  calibration: BimCalibrationData;
  analyzedAt: string;
  boqUnlocked: boolean;
}

// ==================== PDF TAKEOFF & BOQ TYPES ====================

export type TakeoffTool =
  | 'select'
  | 'pan'
  | 'calibrate'
  | 'linear'
  | 'polyline'
  | 'area'
  | 'polygon'
  | 'rectangle'
  | 'perimeter'
  | 'volume'
  | 'count'
  | 'deduction';

export type TakeoffCategory =
  | 'excavation'
  | 'concrete'
  | 'steel'
  | 'masonry'
  | 'plastering'
  | 'waterproofing'
  | 'flooring'
  | 'painting'
  | 'ceilings'
  | 'doors_windows'
  | 'electrical'
  | 'plumbing_hvac';

export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfBoxOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
  userUnit?: number;
  rotation?: 0 | 90 | 180 | 270;
}

export interface TakeoffSheet {
  id: string;
  projectId: string;
  code: string;
  title: string;
  titleAr: string;
  sheetType: 'blueprint_svg' | 'pdf_document' | 'raster_image';
  pageNumber: number;
  pixelsPerMeter: number;
  scaleLabel: string;
  calibrated: boolean;
  width: number;
  height: number;
  svgContent?: string;
  pdfManifestId?: string;
  pdfDataUrl?: string;
}

export interface TakeoffMeasurement {
  id: string;
  sheetId: string;
  projectId: string;
  category: TakeoffCategory;
  tool: TakeoffTool;
  label: string;
  labelAr: string;
  points: PdfPoint[];
  heightOrDepth?: number;
  multiplier?: number;
  unit: 'm' | 'm2' | 'm3' | 'ton' | 'unit';
  rawValue: number;
  computedQuantity: number;
  rateItemId?: string;
  unitRateAed: number;
  totalCostAed: number;
  linkedBimElementId?: string;
  color: string;
  createdAt: string;
}

export interface RateLibraryItem {
  id: string;
  ownerId?: string;
  code: string;
  category: TakeoffCategory;
  nameAr: string;
  nameEn: string;
  unit: 'm' | 'm2' | 'm3' | 'ton' | 'unit';
  rateAed: number;
  materialSpec: string;
}

export interface TakeoffCategoryBreakdown {
  category: TakeoffCategory;
  quantity: number;
  unit: string;
  costAed: number;
  itemCount: number;
}

export interface TakeoffProjectSummary {
  projectId: string;
  directCostAed: number;
  overheadPercent: number;
  overheadAed: number;
  profitPercent: number;
  profitAed: number;
  subtotalBeforeVatAed: number;
  vatPercent: number;
  vatAed: number;
  grandTotalAed: number;
  categoryBreakdown: TakeoffCategoryBreakdown[];
}

export interface TakeoffSummaryConfig {
  overheadPercent: number;
  profitPercent: number;
  vatPercent: number;
}

export interface Project {
  id: string;
  ownerId?: string;
  code: string;
  name: string;
  nameEn: string;
  category: 'المشاريع الإنشائية';
  projectType: ProjectType;
  status: ProjectStatus;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  ownerNationalId: string;
  consultantOffice: string;
  consultantEngineer: string;
  consultantPhone: string;
  consultantLicenseNo: string;
  residentEngineer: string;
  contractorBranch: string;
  permitNumber: string;
  permitDate: string;
  permitExpiryDate: string;
  licensingAuthority: string;
  approvedBudget: number;
  invoicedAmount: number;
  paidAmount: number;
  retentionPercentage: number;
  actualProgress: number;
  plannedProgress: number;
  phases: ConstructionPhase[];
  paymentMilestones: FinancialMilestone[];
  documents: ProjectDocument[];
  gisData: GisPlotData;
  bimElements?: BimElement[];
  takeoffSheets?: TakeoffSheet[];
  takeoffMeasurements?: TakeoffMeasurement[];
  takeoffSummaryConfig?: TakeoffSummaryConfig;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentManifest {
  id: string;
  ownerId: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  totalSize: number;
  totalChunks: number;
  chunkSizeBytes: number;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  manifestId: string;
  ownerId: string;
  index: number;
  data: string;
  createdAt: string;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  companyProfile: CompanyProfile;
  projects: Project[];
  transactions: GovernmentTransaction[];
  rateLibrary: RateLibraryItem[];
}
