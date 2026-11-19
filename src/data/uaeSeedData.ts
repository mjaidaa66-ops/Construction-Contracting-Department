import type {
  CompanyProfile,
  ConstructionPhase,
  FinancialMilestone,
  GovernmentTransaction,
  Project,
  ProjectDocument,
  ProjectStatus,
  ProjectType,
  RateLibraryItem,
  TakeoffMeasurement,
  TakeoffSheet,
} from '../types/bunyan';
import { generateSharjahVillaBimElements } from '../utils/bimModelGenerator';
import {
  generateGisPlotTakeoffSheet,
  generateProjectBimElements,
  normalizeBoundaryPoints,
} from '../utils/gisTakeoffGenerator';
import sharjahProjectsRaw from './sharjahProjects56.json';

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  nameAr: 'مجموعة بنيان للمقاولات والإنشاءات الهندسية ذ.م.م',
  nameEn: 'Bunyan Engineering & Contracting LLC',
  licenseNumber: 'SHJ-CN-884920',
  municipalityClass: 'الفئة الأولى — بلدية مدينة الشارقة',
  trnNumber: '100492817400003',
  addressAr: 'برج الممزر التجاري، الطابق 14، الشارقة، الإمارات العربية المتحدة',
  addressEn: 'Al Mamzar Commercial Tower, Floor 14, Sharjah, UAE',
  phone: '+971 6 554 8900',
  email: 'projects@bunyan-core.ae',
};

// 25 Pre-loaded UAE Rate Library Items in AED (RL-01 to RL-25)
export const INITIAL_RATE_LIBRARY: RateLibraryItem[] = [
  { id: 'rl-01', code: 'RL-01', category: 'excavation', nameAr: 'أعمال الحفر والترحيل للموقع والأساسات', nameEn: 'Site & Foundation Excavation + Disposal', unit: 'm3', rateAed: 32, materialSpec: 'Soil Class B / Sharjah Standard' },
  { id: 'rl-02', code: 'RL-02', category: 'excavation', nameAr: 'ردم ودك التربة المختارة على طبقات 25 سم', nameEn: 'Selected Backfill & Compaction (95% MDD)', unit: 'm3', rateAed: 38, materialSpec: 'Approved Sweet Sand + Lab Test' },
  { id: 'rl-03', code: 'RL-03', category: 'concrete', nameAr: 'خرسانة نظافة (C20) بسماكة 100 مم', nameEn: 'Blinding Concrete Grade C20 (100mm)', unit: 'm3', rateAed: 300, materialSpec: 'OPC / SRC Grade C20' },
  { id: 'rl-04', code: 'RL-04', category: 'concrete', nameAr: 'خرسانة مسلحة للأساسات والشدادات (C40 SRC)', nameEn: 'Substructure Reinforced Concrete (C40 SRC)', unit: 'm3', rateAed: 395, materialSpec: 'Sulfate Resistant Cement C40' },
  { id: 'rl-05', code: 'RL-05', category: 'concrete', nameAr: 'خرسانة مسلحة للأعمدة والجسور والأسقف (C40)', nameEn: 'Superstructure Concrete Columns/Slabs (C40)', unit: 'm3', rateAed: 425, materialSpec: 'Ready-Mix C40 + Microsilica' },
  { id: 'rl-06', code: 'RL-06', category: 'steel', nameAr: 'توريد وتقطيع وتركيب حديد تسليح (Grade 60)', nameEn: 'Deformed Steel Rebar BS4449 Grade 60', unit: 'ton', rateAed: 3150, materialSpec: 'Emirates Steel Grade 500B' },
  { id: 'rl-07', code: 'RL-07', category: 'masonry', nameAr: 'بناء طابوق حراري عازل خارجي 200 مم', nameEn: 'External Thermal Insulated Blockwork 200mm', unit: 'm2', rateAed: 90, materialSpec: 'Sharjah Municipality Green Spec' },
  { id: 'rl-08', code: 'RL-08', category: 'masonry', nameAr: 'بناء طابوق أسمنتي مفرغ داخلي 200 مم', nameEn: 'Internal Hollow Concrete Blockwork 200mm', unit: 'm2', rateAed: 68, materialSpec: 'BS EN 771-3 Hollow Block' },
  { id: 'rl-09', code: 'RL-09', category: 'masonry', nameAr: 'بناء طابوق أسمنتي قواطع داخلية 100 مم', nameEn: 'Internal Partition Blockwork 100mm', unit: 'm2', rateAed: 58, materialSpec: 'Hollow Concrete Block 100mm' },
  { id: 'rl-10', code: 'RL-10', category: 'plastering', nameAr: 'لياسة داخلية أسمنتية ناعمة مع شبك زوايا', nameEn: 'Internal Cement Plastering (15mm) + Beads', unit: 'm2', rateAed: 28, materialSpec: '1:4 Cement Sand + Fiberglass Mesh' },
  { id: 'rl-11', code: 'RL-11', category: 'plastering', nameAr: 'لياسة خارجية مقاومة للرطوبة والأملاح', nameEn: 'External Weather-Resistant Plaster (20mm)', unit: 'm2', rateAed: 40, materialSpec: 'Polymer-Modified Cement Render' },
  { id: 'rl-12', code: 'RL-12', category: 'waterproofing', nameAr: 'عزل بيتوميني للأساسات ورقاب الأعمدة (وجهين)', nameEn: 'Substructure Bituminous Waterproofing (2 Coats)', unit: 'm2', rateAed: 54, materialSpec: '4mm SBS Membrane + Primer' },
  { id: 'rl-13', code: 'RL-13', category: 'waterproofing', nameAr: 'نظام عزل السطح المركب (Combo Roof System)', nameEn: 'Combo Roof Waterproofing & Thermal System', unit: 'm2', rateAed: 100, materialSpec: 'PU Foam + Geotextile + Gravel/Tiles' },
  { id: 'rl-14', code: 'RL-14', category: 'waterproofing', nameAr: 'عزل مائي للحمامات والمطابخ (كريستالي)', nameEn: 'Wet Areas Cementitious Waterproofing', unit: 'm2', rateAed: 65, materialSpec: '2-Component Flexible Coating' },
  { id: 'rl-15', code: 'RL-15', category: 'flooring', nameAr: 'توريد وتركيب بلاط بورسلان إسباني 80×80 سم', nameEn: 'Porcelain Floor Tiles 800x800mm', unit: 'm2', rateAed: 100, materialSpec: 'RAK / Spanish First Choice' },
  { id: 'rl-16', code: 'RL-16', category: 'flooring', nameAr: 'توريد وتركيب سيراميك جدران وأرضيات حمامات', nameEn: 'Ceramic Wall & Floor Tiles (Wet Areas)', unit: 'm2', rateAed: 90, materialSpec: 'Anti-Slip R10 Ceramic + Epoxy Grout' },
  { id: 'rl-17', code: 'RL-17', category: 'painting', nameAr: 'دهانات داخلية جوتن فينوماستيك (معجون + 3 أوجه)', nameEn: 'Interior Jotun Fenomastic Paint System', unit: 'm2', rateAed: 29, materialSpec: 'Jotun Fenomastic Hygiene Silk' },
  { id: 'rl-18', code: 'RL-18', category: 'painting', nameAr: 'دهانات واجهات خارجية جوتاشيلد مقاومة للشمس', nameEn: 'Exterior Jotashield UV-Resistant Texture', unit: 'm2', rateAed: 46, materialSpec: 'Jotun Jotashield Extreme' },
  { id: 'rl-19', code: 'RL-19', category: 'ceilings', nameAr: 'أسقف جبسم بورد مقاومة للرطوبة مع جسر إنارة', nameEn: 'Moisture-Resistant Gypsum Board Ceiling', unit: 'm2', rateAed: 90, materialSpec: 'Knauf 12.5mm MR + GI Framing' },
  { id: 'rl-20', code: 'RL-20', category: 'doors_windows', nameAr: 'باب خشبي داخلي صلب قشرة جوز مع الإكسسوارات', nameEn: 'Solid Core Walnut Veneer Timber Door', unit: 'unit', rateAed: 1280, materialSpec: '900x2200mm Fire-Rated Option' },
  { id: 'rl-21', code: 'RL-21', category: 'doors_windows', nameAr: 'نوافذ ألمنيوم دبل جليز عازل للحرارة (Thermal Break)', nameEn: 'Double-Glazed Thermal Break Aluminum Window', unit: 'm2', rateAed: 750, materialSpec: 'Gulf Extrusions 24mm Low-E Glass' },
  { id: 'rl-22', code: 'RL-22', category: 'electrical', nameAr: 'نقطة إنارة LED سبوت لايت مع التمديدات والأسلاك', nameEn: 'LED Recessed Lighting Point & Wiring', unit: 'unit', rateAed: 130, materialSpec: 'Ducab 2.5mm + Philips LED 12W' },
  { id: 'rl-23', code: 'RL-23', category: 'electrical', nameAr: 'مقبس كهربائي ثلاثي 13 أمبير (SEWA Spec)', nameEn: '13A Switched Socket Outlet (SEWA Spec)', unit: 'unit', rateAed: 110, materialSpec: 'MK / Schneider + Ducab 4mm' },
  { id: 'rl-24', code: 'RL-24', category: 'plumbing_hvac', nameAr: 'تمديدات مواسير تغذية مياه PPR ألماني', nameEn: 'PPR Hot/Cold Water Supply Piping', unit: 'm', rateAed: 70, materialSpec: 'Aquatherm PN20 Insulated' },
  { id: 'rl-25', code: 'RL-25', category: 'plumbing_hvac', nameAr: 'تمديدات صرف صحي UPVC ضغط عالي 110 مم', nameEn: 'High-Pressure UPVC Drainage Pipe 110mm', unit: 'm', rateAed: 95, materialSpec: 'Hepworth / Cosmoplast Class 4' },
];

// 4 Pre-calibrated Engineering Blueprint SVG Sheets (at 40 pixelsPerMeter)
export const INITIAL_TAKEOFF_SHEETS: TakeoffSheet[] = [
  {
    id: 'sheet-a101',
    projectId: 'proj-01',
    code: 'A-101',
    title: 'Ground Floor Architectural Plan (1:100)',
    titleAr: 'المخطط المعماري — الطابق الأرضي',
    sheetType: 'blueprint_svg',
    pageNumber: 1,
    pixelsPerMeter: 40,
    scaleLabel: '1:100',
    calibrated: true,
    width: 1000,
    height: 700,
    svgContent: `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid40" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="1000" height="700" fill="#0B1324"/>
      <rect width="1000" height="700" fill="url(#grid40)"/>
      <!-- Plot Setback Boundary (20m x 14m = 800x560px) -->
      <rect x="80" y="60" width="840" height="580" fill="none" stroke="#B4863C" stroke-width="1.5" stroke-dasharray="8 6"/>
      <text x="90" y="50" fill="#D4A853" font-size="11" font-family="monospace">PLOT BOUNDARY: AL RAHMANIYA SECTOR 4 · PLOT 418-SHJ · SCALE 1:100 (40px = 1.00m)</text>
      <!-- Main Villa Footprint (16m x 12m = 640x480px) -->
      <rect x="160" y="100" width="640" height="480" fill="rgba(30,41,59,0.55)" stroke="#E2E8F0" stroke-width="5"/>
      <!-- Interior Partitions -->
      <line x1="160" y1="300" x2="800" y2="300" stroke="#CBD5E1" stroke-width="3"/>
      <line x1="440" y1="100" x2="440" y2="580" stroke="#CBD5E1" stroke-width="3"/>
      <line x1="620" y1="300" x2="620" y2="580" stroke="#CBD5E1" stroke-width="3"/>
      <!-- Room Labels -->
      <text x="300" y="200" text-anchor="middle" fill="#F8FAFC" font-size="14" font-weight="600">MAJLIS / المجلس (7.0 x 5.0m)</text>
      <text x="620" y="200" text-anchor="middle" fill="#F8FAFC" font-size="14" font-weight="600">FAMILY LIVING / الصالة (9.0 x 5.0m)</text>
      <text x="300" y="440" text-anchor="middle" fill="#F8FAFC" font-size="14" font-weight="600">DINING &amp; GUEST SUITE (7.0 x 7.0m)</text>
      <text x="530" y="440" text-anchor="middle" fill="#F8FAFC" font-size="13" font-weight="600">KITCHEN (4.5 x 7.0m)</text>
      <text x="710" y="440" text-anchor="middle" fill="#F8FAFC" font-size="13" font-weight="600">STAIR &amp; CORE</text>
      <!-- Door & Window Symbols -->
      <rect x="240" y="96" width="80" height="8" fill="#38BDF8"/>
      <rect x="560" y="96" width="100" height="8" fill="#38BDF8"/>
      <rect x="436" y="210" width="8" height="40" fill="#F59E0B"/>
      <rect x="436" y="400" width="8" height="40" fill="#F59E0B"/>
      <!-- Scale Reference Bar -->
      <line x1="80" y1="670" x2="280" y2="670" stroke="#38BDF8" stroke-width="3"/>
      <line x1="80" y1="664" x2="80" y2="676" stroke="#38BDF8" stroke-width="2"/>
      <line x1="280" y1="664" x2="280" y2="676" stroke="#38BDF8" stroke-width="2"/>
      <text x="180" y="660" text-anchor="middle" fill="#38BDF8" font-size="11" font-family="monospace">5.00 m (200 px @ 40px/m)</text>
    </svg>`,
  },
  {
    id: 'sheet-s101',
    projectId: 'proj-01',
    code: 'S-101',
    title: 'Structural Foundation & Column Grid',
    titleAr: 'المخطط الإنشائي — القواعد والأعمدة',
    sheetType: 'blueprint_svg',
    pageNumber: 2,
    pixelsPerMeter: 40,
    scaleLabel: '1:100',
    calibrated: true,
    width: 1000,
    height: 700,
    svgContent: `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="sgrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="1000" height="700" fill="#0B1324"/>
      <rect width="1000" height="700" fill="url(#sgrid)"/>
      <!-- Structural Axes -->
      <g stroke="rgba(56,189,248,0.45)" stroke-dasharray="6 4" stroke-width="1">
        <line x1="160" y1="70" x2="160" y2="620"/><line x1="360" y1="70" x2="360" y2="620"/>
        <line x1="580" y1="70" x2="580" y2="620"/><line x1="800" y1="70" x2="800" y2="620"/>
        <line x1="120" y1="100" x2="840" y2="100"/><line x1="120" y1="300" x2="840" y2="300"/>
        <line x1="120" y1="580" x2="840" y2="580"/>
      </g>
      <!-- Footings & Tie Beams -->
      <g fill="rgba(100,116,139,0.4)" stroke="#94A3B8" stroke-width="2">
        <rect x="130" y="70" width="60" height="60"/><rect x="330" y="70" width="60" height="60"/>
        <rect x="550" y="70" width="60" height="60"/><rect x="770" y="70" width="60" height="60"/>
        <rect x="130" y="270" width="60" height="60"/><rect x="330" y="270" width="60" height="60"/>
        <rect x="550" y="270" width="60" height="60"/><rect x="770" y="270" width="60" height="60"/>
        <rect x="130" y="550" width="60" height="60"/><rect x="330" y="550" width="60" height="60"/>
        <rect x="550" y="550" width="60" height="60"/><rect x="770" y="550" width="60" height="60"/>
      </g>
      <!-- RC Columns -->
      <g fill="#D4A853">
        <rect x="152" y="92" width="16" height="16"/><rect x="352" y="92" width="16" height="16"/>
        <rect x="572" y="92" width="16" height="16"/><rect x="792" y="92" width="16" height="16"/>
        <rect x="152" y="292" width="16" height="16"/><rect x="352" y="292" width="16" height="16"/>
        <rect x="572" y="292" width="16" height="16"/><rect x="792" y="292" width="16" height="16"/>
        <rect x="152" y="572" width="16" height="16"/><rect x="352" y="572" width="16" height="16"/>
        <rect x="572" y="572" width="16" height="16"/><rect x="792" y="572" width="16" height="16"/>
      </g>
      <text x="160" y="655" fill="#E2E8F0" font-size="12" font-family="monospace">S-101 · 12x ISOLATED FOOTINGS F1/F2 + TIE BEAMS TB1 (250x600mm) · C40 SRC</text>
    </svg>`,
  },
  {
    id: 'sheet-e101',
    projectId: 'proj-01',
    code: 'E-101',
    title: 'Electrical Lighting & Power Layout (SEWA)',
    titleAr: 'المخطط الكهربائي — الإنارة والقوى (SEWA)',
    sheetType: 'blueprint_svg',
    pageNumber: 3,
    pixelsPerMeter: 40,
    scaleLabel: '1:100',
    calibrated: true,
    width: 1000,
    height: 700,
    svgContent: `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="700" fill="#0B1324"/>
      <rect x="160" y="100" width="640" height="480" fill="rgba(15,23,42,0.75)" stroke="#64748B" stroke-width="3"/>
      <line x1="160" y1="300" x2="800" y2="300" stroke="#475569" stroke-width="2"/>
      <line x1="440" y1="100" x2="440" y2="580" stroke="#475569" stroke-width="2"/>
      <!-- SMDB & DB -->
      <rect x="640" y="310" width="36" height="24" fill="#EAB308" stroke="#FEF08A"/>
      <text x="658" y="350" text-anchor="middle" fill="#FDE047" font-size="10" font-family="monospace">DB-GF</text>
      <!-- Lighting Circuit Arcs & Fixtures -->
      <g stroke="#FACC15" fill="none" stroke-width="1.5" stroke-dasharray="4 3">
        <path d="M 640 322 L 300 200 L 220 150"/>
        <path d="M 640 322 L 620 200 L 720 150"/>
        <path d="M 640 322 L 300 440 L 530 440"/>
      </g>
      <g fill="#FEF08A" stroke="#CA8A04" stroke-width="2">
        <circle cx="240" cy="160" r="8"/><circle cx="360" cy="160" r="8"/><circle cx="240" cy="240" r="8"/><circle cx="360" cy="240" r="8"/>
        <circle cx="540" cy="160" r="8"/><circle cx="700" cy="160" r="8"/><circle cx="540" cy="240" r="8"/><circle cx="700" cy="240" r="8"/>
        <circle cx="240" cy="390" r="8"/><circle cx="360" cy="390" r="8"/><circle cx="530" cy="420" r="8"/>
      </g>
      <text x="160" y="640" fill="#FDE047" font-size="12" font-family="monospace">E-101 · SEWA APPROVED LIGHTING &amp; 13A POWER CIRCUITS · SCALE 1:100</text>
    </svg>`,
  },
  {
    id: 'sheet-m101',
    projectId: 'proj-01',
    code: 'M-101',
    title: 'MEP Plumbing, Drainage & HVAC Ductwork',
    titleAr: 'المخطط الميكانيكي — السباكة والتكييف',
    sheetType: 'blueprint_svg',
    pageNumber: 4,
    pixelsPerMeter: 40,
    scaleLabel: '1:100',
    calibrated: true,
    width: 1000,
    height: 700,
    svgContent: `<svg viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="700" fill="#0B1324"/>
      <rect x="160" y="100" width="640" height="480" fill="rgba(15,23,42,0.75)" stroke="#64748B" stroke-width="3"/>
      <!-- Chilled Water / HVAC Ducting -->
      <rect x="200" y="140" width="520" height="24" fill="rgba(56,189,248,0.28)" stroke="#38BDF8" stroke-width="2"/>
      <rect x="490" y="164" width="24" height="320" fill="rgba(56,189,248,0.28)" stroke="#38BDF8" stroke-width="2"/>
      <!-- PPR & UPVC Runs -->
      <path d="M 120 480 L 530 480 L 530 350 L 710 350" fill="none" stroke="#10B981" stroke-width="4"/>
      <path d="M 120 520 L 680 520 L 680 390" fill="none" stroke="#F97316" stroke-width="4" stroke-dasharray="8 4"/>
      <text x="160" y="640" fill="#38BDF8" font-size="12" font-family="monospace">M-101 · CHILLED WATER DUCTING + PPR WATER SUPPLY + UPVC 110mm DRAINAGE</text>
    </svg>`,
  },
];

// 8 Initial Pre-Calibrated Takeoff Measurements linked to the 25-Item Rate Library
export const INITIAL_TAKEOFF_MEASUREMENTS: TakeoffMeasurement[] = [
  {
    id: 'tm-01',
    sheetId: 'sheet-s101',
    projectId: 'proj-01',
    category: 'excavation',
    tool: 'volume',
    label: 'Foundation Pit Excavation (16m x 12m x 1.6m)',
    labelAr: 'حفر خندق القواعد والأساسات (عمق 1.6 م)',
    points: [{ x: 160, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 580 }, { x: 160, y: 580 }],
    heightOrDepth: 1.6,
    multiplier: 1,
    unit: 'm3',
    rawValue: 192,
    computedQuantity: 307.2,
    rateItemId: 'rl-01',
    unitRateAed: 32,
    totalCostAed: 9830.4,
    color: '#D97706',
    createdAt: '2026-02-15T09:00:00Z',
  },
  {
    id: 'tm-02',
    sheetId: 'sheet-s101',
    projectId: 'proj-01',
    category: 'concrete',
    tool: 'volume',
    label: 'Substructure Footings & Tie Beams (C40 SRC)',
    labelAr: 'خرسانة مسلحة للقواعد والشدادات C40 SRC',
    points: [{ x: 160, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 580 }, { x: 160, y: 580 }],
    heightOrDepth: 0.45,
    multiplier: 1,
    unit: 'm3',
    rawValue: 192,
    computedQuantity: 86.4,
    rateItemId: 'rl-04',
    unitRateAed: 395,
    totalCostAed: 34128,
    linkedBimElementId: 'bim-fnd-01',
    color: '#64748B',
    createdAt: '2026-02-15T09:10:00Z',
  },
  {
    id: 'tm-03',
    sheetId: 'sheet-a101',
    projectId: 'proj-01',
    category: 'masonry',
    tool: 'perimeter',
    label: 'External Thermal Block Perimeter (56m x 3.6m)',
    labelAr: 'حوائط طابوق حراري خارجي 200 مم',
    points: [{ x: 160, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 580 }, { x: 160, y: 580 }],
    heightOrDepth: 3.6,
    multiplier: 1,
    unit: 'm2',
    rawValue: 56,
    computedQuantity: 201.6,
    rateItemId: 'rl-07',
    unitRateAed: 90,
    totalCostAed: 18144,
    linkedBimElementId: 'bim-wall-ext-n',
    color: '#B45309',
    createdAt: '2026-02-15T09:20:00Z',
  },
  {
    id: 'tm-04',
    sheetId: 'sheet-a101',
    projectId: 'proj-01',
    category: 'flooring',
    tool: 'rectangle',
    label: 'Ground Floor Porcelain Flooring (800x800)',
    labelAr: 'أرضيات بورسلان إسباني — الطابق الأرضي',
    points: [{ x: 160, y: 100 }, { x: 800, y: 580 }],
    multiplier: 1,
    unit: 'm2',
    rawValue: 192,
    computedQuantity: 192,
    rateItemId: 'rl-15',
    unitRateAed: 100,
    totalCostAed: 19200,
    linkedBimElementId: 'bim-slab-gf',
    color: '#EC4899',
    createdAt: '2026-02-15T09:30:00Z',
  },
  {
    id: 'tm-05',
    sheetId: 'sheet-a101',
    projectId: 'proj-01',
    category: 'ceilings',
    tool: 'area',
    label: 'Gypsum False Ceiling (Ground Floor)',
    labelAr: 'أسقف جبسم بورد مقاومة للرطوبة',
    points: [{ x: 160, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 580 }, { x: 160, y: 580 }],
    multiplier: 1,
    unit: 'm2',
    rawValue: 192,
    computedQuantity: 192,
    rateItemId: 'rl-19',
    unitRateAed: 90,
    totalCostAed: 17280,
    color: '#6366F1',
    createdAt: '2026-02-15T09:40:00Z',
  },
  {
    id: 'tm-06',
    sheetId: 'sheet-a101',
    projectId: 'proj-01',
    category: 'painting',
    tool: 'polyline',
    label: 'External Jotashield Facade Coating',
    labelAr: 'دهانات خارجية جوتاشيلد للواجهات',
    points: [{ x: 160, y: 100 }, { x: 800, y: 100 }, { x: 800, y: 580 }, { x: 160, y: 580 }, { x: 160, y: 100 }],
    heightOrDepth: 7.4,
    multiplier: 1,
    unit: 'm2',
    rawValue: 56,
    computedQuantity: 414.4,
    rateItemId: 'rl-18',
    unitRateAed: 46,
    totalCostAed: 19062.4,
    color: '#10B981',
    createdAt: '2026-02-15T09:50:00Z',
  },
  {
    id: 'tm-07',
    sheetId: 'sheet-e101',
    projectId: 'proj-01',
    category: 'electrical',
    tool: 'count',
    label: 'LED Recessed Ceiling Luminaires (GF)',
    labelAr: 'نقاط إنارة LED سبوت لايت — الأرضي',
    points: [
      { x: 240, y: 160 }, { x: 360, y: 160 }, { x: 240, y: 240 }, { x: 360, y: 240 },
      { x: 540, y: 160 }, { x: 700, y: 160 }, { x: 540, y: 240 }, { x: 700, y: 240 },
      { x: 240, y: 390 }, { x: 360, y: 390 }, { x: 530, y: 420 },
    ],
    multiplier: 1,
    unit: 'unit',
    rawValue: 11,
    computedQuantity: 11,
    rateItemId: 'rl-22',
    unitRateAed: 130,
    totalCostAed: 1430,
    color: '#EAB308',
    createdAt: '2026-02-15T10:00:00Z',
  },
  {
    id: 'tm-08',
    sheetId: 'sheet-m101',
    projectId: 'proj-01',
    category: 'plumbing_hvac',
    tool: 'polyline',
    label: 'PPR Main Hot/Cold Water Supply Run',
    labelAr: 'تمديدات مواسير تغذية مياه PPR',
    points: [{ x: 120, y: 480 }, { x: 530, y: 480 }, { x: 530, y: 350 }, { x: 710, y: 350 }],
    multiplier: 1,
    unit: 'm',
    rawValue: 18,
    computedQuantity: 18,
    rateItemId: 'rl-24',
    unitRateAed: 70,
    totalCostAed: 1260,
    color: '#3B82F6',
    createdAt: '2026-02-15T10:15:00Z',
  },
];

interface RawFirestoreProject {
  id: string;
  code: string;
  name: string;
  nameEn?: string;
  category?: string;
  projectType?: string;
  status?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  ownerNationalId?: string;
  consultantOffice?: string;
  consultantEngineer?: string;
  consultantPhone?: string;
  consultantLicenseNo?: string;
  residentEngineer?: string;
  contractorBranch?: string;
  permitNumber?: string;
  permitDate?: string;
  permitExpiryDate?: string;
  licensingAuthority?: string;
  approvedBudget?: number;
  invoicedAmount?: number;
  paidAmount?: number;
  retentionPercentage?: number;
  actualProgress?: number;
  plannedProgress?: number;
  startDate?: string;
  expectedCompletionDate?: string;
  createdAt?: string;
  updatedAt?: string;
  phases?: Array<{
    id?: string;
    name?: string;
    nameAr?: string;
    nameEn?: string;
    plannedWeight?: number;
    weightPercentage?: number;
    completionPercentage?: number;
    progressPercentage?: number;
    status?: string;
    startDate?: string;
    targetEndDate?: string;
    endDate?: string;
  }>;
  paymentMilestones?: Array<{
    id?: string;
    title?: string;
    titleAr?: string;
    titleEn?: string;
    percentage?: number;
    amount?: number;
    amountAed?: number;
    dueDate?: string;
    status?: string;
  }>;
  documents?: Array<{
    id?: string;
    title?: string;
    fileName?: string;
    name?: string;
    category?: string;
    fileSize?: string;
    sizeBytes?: number;
    uploadDate?: string;
    uploadedAt?: string;
  }>;
  gisData: Project['gisData'];
}

function parseFileSizeToBytes(sizeText?: string): number {
  if (!sizeText) return 512000;
  const match = sizeText.match(/([\d.]+)\s*(kb|mb|gb|b)?/i);
  if (!match) return 512000;
  const val = Number(match[1]) || 1;
  const unit = (match[2] || 'kb').toLowerCase();
  if (unit === 'gb') return Math.round(val * 1024 * 1024 * 1024);
  if (unit === 'mb') return Math.round(val * 1024 * 1024);
  if (unit === 'kb') return Math.round(val * 1024);
  return Math.round(val);
}

function mapDocCategory(cat?: string): ProjectDocument['category'] {
  switch (cat) {
    case 'permit':
    case 'structural':
    case 'architectural':
    case 'mep':
    case 'contract':
    case 'gis':
      return cat;
    case 'financial':
      return 'contract';
    default:
      return 'permit';
  }
}

function mapProjectType(t?: string): ProjectType {
  switch (t) {
    case 'villa':
    case 'commercial_tower':
    case 'residential_complex':
    case 'warehouse':
    case 'infrastructure':
    case 'institutional':
      return t;
    default:
      return 'villa';
  }
}

function mapProjectStatus(s?: string): ProjectStatus {
  switch (s) {
    case 'permitting':
    case 'under_construction':
    case 'suspended':
    case 'completed':
      return s;
    default:
      return 'under_construction';
  }
}

function normalizeSharjahProject(raw: RawFirestoreProject, index: number): Project {
  const gisData: Project['gisData'] = {
    plotNumber: raw.gisData?.plotNumber || String(index + 1),
    basinNumber: raw.gisData?.basinNumber || '1',
    sectorName: raw.gisData?.sectorName || 'الشارقة',
    emirate: raw.gisData?.emirate || 'الشارقة',
    latitude: Number(raw.gisData?.latitude) || 25.3314,
    longitude: Number(raw.gisData?.longitude) || 55.5682,
    plotAreaSqFt: Number(raw.gisData?.plotAreaSqFt) || 10000,
    plotAreaSqM: Number(raw.gisData?.plotAreaSqM) || 929,
    builtUpAreaSqFt: Number(raw.gisData?.builtUpAreaSqFt) || 4500,
    zoning: raw.gisData?.zoning || 'سكني خاص (G+1)',
    setbacks: {
      front: Number(raw.gisData?.setbacks?.front ?? 3),
      rear: Number(raw.gisData?.setbacks?.rear ?? 3),
      sideLeft: Number(raw.gisData?.setbacks?.sideLeft ?? 2),
      sideRight: Number(raw.gisData?.setbacks?.sideRight ?? 2),
    },
    boundaryPoints: normalizeBoundaryPoints(raw.gisData),
  };

  const phases: ConstructionPhase[] = (raw.phases || []).map((ph, idx) => ({
    id: ph.id || `ph-${raw.id}-${idx + 1}`,
    nameAr: ph.nameAr || ph.name || `المرحلة ${idx + 1}`,
    nameEn: ph.nameEn || ph.name || `Phase ${idx + 1}`,
    weightPercentage: Number(ph.weightPercentage ?? ph.plannedWeight ?? 0),
    progressPercentage: Number(ph.progressPercentage ?? ph.completionPercentage ?? 0),
    status:
      ph.status === 'completed' || ph.status === 'in_progress' || ph.status === 'not_started'
        ? ph.status
        : 'not_started',
    startDate: ph.startDate || raw.startDate || '2025-01-01',
    endDate: ph.endDate || ph.targetEndDate || raw.expectedCompletionDate || '2026-12-31',
  }));

  const paymentMilestones: FinancialMilestone[] = (raw.paymentMilestones || []).map((pm, idx) => ({
    id: pm.id || `pm-${raw.id}-${idx + 1}`,
    titleAr: pm.titleAr || pm.title || `دفعة ${idx + 1}`,
    titleEn: pm.titleEn || pm.title || `Milestone ${idx + 1}`,
    percentage: Number(pm.percentage ?? 0),
    amountAed: Number(pm.amountAed ?? pm.amount ?? 0),
    dueDate: pm.dueDate || raw.permitDate || '2025-06-01',
    status:
      pm.status === 'paid' || pm.status === 'invoiced' || pm.status === 'pending'
        ? pm.status
        : 'pending',
  }));

  const documents: ProjectDocument[] = (raw.documents || []).map((doc, idx) => {
    const fileName = doc.name || doc.fileName || doc.title || `Document-${idx + 1}.pdf`;
    const isDwg = fileName.toLowerCase().endsWith('.dwg');
    return {
      id: doc.id || `doc-${raw.id}-${idx + 1}`,
      name: fileName,
      category: mapDocCategory(doc.category),
      mimeType: isDwg ? 'application/acad' : 'application/pdf',
      sizeBytes: doc.sizeBytes ?? parseFileSizeToBytes(doc.fileSize),
      uploadedAt: doc.uploadedAt || doc.uploadDate || raw.permitDate || '2025-01-01',
    };
  });

  const baseProject: Project = {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    nameEn: raw.nameEn || raw.name,
    category: 'المشاريع الإنشائية',
    projectType: mapProjectType(raw.projectType),
    status: mapProjectStatus(raw.status),
    ownerName: raw.ownerName || 'مالك المشروع',
    ownerPhone: raw.ownerPhone || '+971 50 000 0000',
    ownerEmail: raw.ownerEmail || 'owner@bunyan-core.ae',
    ownerNationalId: raw.ownerNationalId || '784-1985-0000000-1',
    consultantOffice: raw.consultantOffice || 'مكتب الاستشارات الهندسية',
    consultantEngineer: raw.consultantEngineer || 'م. الاستشاري المشرف',
    consultantPhone: raw.consultantPhone || '+971 6 500 0000',
    consultantLicenseNo: raw.consultantLicenseNo || 'CN-SHJ-4000',
    residentEngineer: raw.residentEngineer || 'م. المهندس المقيم',
    contractorBranch: raw.contractorBranch || 'فرع الشارقة الرئيسي',
    permitNumber: raw.permitNumber || raw.code,
    permitDate: raw.permitDate || '2025-01-01',
    permitExpiryDate: raw.permitExpiryDate || '2027-01-01',
    licensingAuthority: raw.licensingAuthority || 'بلدية مدينة الشارقة',
    approvedBudget: Number(raw.approvedBudget) || 0,
    invoicedAmount: Number(raw.invoicedAmount) || 0,
    paidAmount: Number(raw.paidAmount) || 0,
    retentionPercentage: Number(raw.retentionPercentage ?? 10),
    actualProgress: Number(raw.actualProgress ?? 0),
    plannedProgress: Number(raw.plannedProgress ?? 0),
    phases,
    paymentMilestones,
    documents,
    gisData,
    takeoffSummaryConfig: {
      overheadPercent: 10,
      profitPercent: 12,
      vatPercent: 5,
    },
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };

  const autoGisSheet = generateGisPlotTakeoffSheet(baseProject);
  const bimElements =
    raw.id === 'proj-01'
      ? generateSharjahVillaBimElements()
      : generateProjectBimElements(baseProject);

  return {
    ...baseProject,
    bimElements,
    takeoffSheets:
      raw.id === 'proj-01' ? [autoGisSheet, ...INITIAL_TAKEOFF_SHEETS] : [autoGisSheet],
    takeoffMeasurements: raw.id === 'proj-01' ? INITIAL_TAKEOFF_MEASUREMENTS : [],
  };
}

const RAW_PROJECTS = (sharjahProjectsRaw as { projects: RawFirestoreProject[] }).projects || [];

export const INITIAL_PROJECTS: Project[] = RAW_PROJECTS.map((raw, idx) =>
  normalizeSharjahProject(raw, idx)
);

export const INITIAL_TRANSACTIONS: GovernmentTransaction[] = [
  {
    id: 'tx-01',
    projectId: 'proj-01',
    authority: 'sharjah_municipality',
    transactionNumber: 'MUN-BP-2026-10842',
    serviceName: 'إصدار رخصة بناء فيلا سكنية (طابقين + ملحق)',
    serviceNameEn: 'Building Permit Issuance — 2-Floor Residential Villa',
    status: 'approved',
    submissionDate: '2026-01-04',
    lastUpdatedDate: '2026-01-12',
    reviewEngineer: 'م. عبيد الشامسي',
    notes: 'تم اعتماد المخططات المعمارية والإنشائية ومطابقتها لاشتراطات المباني الخضراء.',
    officialPortalUrl: 'https://portal.shjmun.gov.ae',
  },
  {
    id: 'tx-02',
    projectId: 'proj-01',
    authority: 'sewa',
    transactionNumber: 'SEWA-EL-2026-4491',
    serviceName: 'اعتماد الأحمال الكهربائية وتمديد كابل 160 ك.ف.أ',
    serviceNameEn: 'Electrical Load Approval & 160 kVA Cable Connection',
    status: 'in_review',
    submissionDate: '2026-04-18',
    lastUpdatedDate: '2026-05-02',
    reviewEngineer: 'م. فيصل الزرعوني',
    notes: 'جاري مراجعة مخططات التوزيع E-101 وجدول الأحمال الكهربائية.',
    officialPortalUrl: 'https://www.sewa.gov.ae',
  },
  {
    id: 'tx-03',
    projectId: 'proj-01',
    authority: 'planning_survey',
    transactionNumber: 'DTPS-AP-2026-0912',
    serviceName: 'تحديث خارطة الأرض وتثبيت الزوايا المساحية',
    serviceNameEn: 'Affection Plan Update & Plot Demarcation',
    status: 'approved',
    submissionDate: '2025-12-20',
    lastUpdatedDate: '2025-12-28',
    reviewEngineer: 'م. سيف النقبي',
    notes: 'تم تثبيت علامات الحدود في الموقع (قطعة 418-SHJ).',
    officialPortalUrl: 'https://www.sdtps.gov.ae',
  },
  {
    id: 'tx-04',
    projectId: 'proj-01',
    authority: 'civil_defense',
    transactionNumber: 'SCD-FS-2026-3108',
    serviceName: 'تفتيش نظام كشف الحريق والغاز المنزلي',
    serviceNameEn: 'Residential Smoke & LPG Detection Inspection',
    status: 'pending_inspection',
    submissionDate: '2026-06-05',
    lastUpdatedDate: '2026-06-11',
    reviewEngineer: 'الملازم م. راشد الكتبي',
    notes: 'موعد المعاينة الميدانية مجدول بعد إتمام أعمال التمديدات الأولية.',
    officialPortalUrl: 'https://www.dcd.gov.ae',
  },
];
