import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type {
  GisPlotData,
  BimElement,
  TakeoffMeasurement,
  ProjectType,
  Language,
} from '../../src/types/bunyan.ts';

function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ComplianceViolation {
  ruleCode: string;
  severity: 'critical' | 'warning' | 'info';
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  affectedElementIds: string[];
  recommendedFixAr: string;
  recommendedFixEn: string;
}

export interface SharjahComplianceReport {
  overallStatus: 'COMPLIANT' | 'NEEDS_REVISION' | 'NON_COMPLIANT';
  complianceScore: number;
  calculatedMetrics: {
    plotAreaSqM: number;
    maxAllowedBuiltUpSqM: number;
    actualGroundFootprintSqM: number;
    actualTotalBuiltUpSqM: number;
    buildingCoverageRatioPercent: number;
    detectedSetbacks: {
      front: number;
      rear: number;
      sideLeft: number;
      sideRight: number;
    };
  };
  violations: ComplianceViolation[];
  summaryAr: string;
  summaryEn: string;
}

const complianceResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    overallStatus: {
      type: Type.STRING,
      enum: ['COMPLIANT', 'NEEDS_REVISION', 'NON_COMPLIANT'],
    },
    complianceScore: { type: Type.NUMBER },
    calculatedMetrics: {
      type: Type.OBJECT,
      properties: {
        plotAreaSqM: { type: Type.NUMBER },
        maxAllowedBuiltUpSqM: { type: Type.NUMBER },
        actualGroundFootprintSqM: { type: Type.NUMBER },
        actualTotalBuiltUpSqM: { type: Type.NUMBER },
        buildingCoverageRatioPercent: { type: Type.NUMBER },
        detectedSetbacks: {
          type: Type.OBJECT,
          properties: {
            front: { type: Type.NUMBER },
            rear: { type: Type.NUMBER },
            sideLeft: { type: Type.NUMBER },
            sideRight: { type: Type.NUMBER },
          },
          required: ['front', 'rear', 'sideLeft', 'sideRight'],
        },
      },
      required: [
        'plotAreaSqM',
        'maxAllowedBuiltUpSqM',
        'actualGroundFootprintSqM',
        'actualTotalBuiltUpSqM',
        'buildingCoverageRatioPercent',
        'detectedSetbacks',
      ],
    },
    violations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ruleCode: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['critical', 'warning', 'info'] },
          titleAr: { type: Type.STRING },
          titleEn: { type: Type.STRING },
          descriptionAr: { type: Type.STRING },
          descriptionEn: { type: Type.STRING },
          affectedElementIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          recommendedFixAr: { type: Type.STRING },
          recommendedFixEn: { type: Type.STRING },
        },
        required: [
          'ruleCode',
          'severity',
          'titleAr',
          'titleEn',
          'descriptionAr',
          'descriptionEn',
          'affectedElementIds',
          'recommendedFixAr',
          'recommendedFixEn',
        ],
      },
    },
    summaryAr: { type: Type.STRING },
    summaryEn: { type: Type.STRING },
  },
  required: [
    'overallStatus',
    'complianceScore',
    'calculatedMetrics',
    'violations',
    'summaryAr',
    'summaryEn',
  ],
};

export async function runSharjahMunicipalityAudit(params: {
  projectType: ProjectType;
  gisData: GisPlotData;
  bimElements: BimElement[];
  takeoffMeasurements?: TakeoffMeasurement[];
  preferredLang?: Language;
}): Promise<SharjahComplianceReport> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }

  const { projectType, gisData, bimElements, takeoffMeasurements = [], preferredLang = 'ar' } = params;

  const condensedBim = bimElements.map((el) => ({
    id: el.id,
    name: el.name,
    discipline: el.discipline,
    category: el.category,
    level: el.level,
    position: el.position,
    dimensions: el.dimensions,
    netAreaM2: el.netAreaM2,
    volumeM3: el.volumeM3,
  }));

  const systemInstruction = `
You are a Senior Architectural & Structural Permit Review Engineer at Sharjah Municipality (بلدية مدينة الشارقة) & Sharjah Department of Town Planning and Survey (دائرة التخطيط والمساحة بالشارقة).
Your task is to audit a 5D BIM model and 2D Quantity Takeoff data against official Sharjah Building Regulations & Zoning Codes.

Perform the following strict engineering checks:
1. Setbacks Verification (الارتدادات التنظيمية): Compare the bounding box and [x, y, z] positions of ground-level BimElements (walls, columns, foundations, slabs) against gisData.boundaryPoints and required gisData.setbacks (front, rear, sideLeft, sideRight). Note that BIM coordinates are centered around origin (0, y, 0) while plot boundaryPoints start from (0,0) to (plotWidth, plotDepth) — translate cleanly by centering the plot around (0,0) when evaluating encroachment, and flag any specific BimElement ids encroaching on setback zones or note exact compliance margins.
2. Built-Up Area & Coverage Ratio (نسبة البناء والمساحة الطابقية): Calculate the ground floor footprint from level === 'ground' slabs/walls and total Built-Up Area (BUA) across all levels. Compare against gisData.plotAreaSqM and gisData.builtUpAreaSqFt (convert SqFt to SqM using 1 sq ft = 0.092903 m²).
3. Structural & Height Compliance (الارتفاعات والإنشاءات): Check level elevations (Y coordinates) and structural element dimensions (column cross-sections, slab thicknesses, beam depths) against UAE/Sharjah codes for projectType (${projectType}).
4. 2D Takeoff vs 3D BIM Consistency: Compare takeoffMeasurements quantities (concrete volume, masonry area, flooring) against 3D BIM quantities and flag discrepancies exceeding 10%.

Always populate affectedElementIds with exact BimElement 'id' strings from bimModelElements whenever a finding relates to specific 3D elements. Keep summary and violation text concise and authoritative in both Arabic and English (primary context language: ${preferredLang}). Return strictly valid JSON adhering to the schema.
`;

  const promptPayload = {
    projectType,
    gisPlotRegulations: gisData,
    bimModelElements: condensedBim,
    takeoff2DSummary: takeoffMeasurements.map((m) => ({
      id: m.id,
      category: m.category,
      label: m.label,
      unit: m.unit,
      computedQuantity: m.computedQuantity,
      linkedBimElementId: m.linkedBimElementId,
    })),
  };

  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Audit the following Sharjah construction project data and return the compliance report:\n${JSON.stringify(
              promptPayload
            )}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: complianceResponseSchema,
    },
  });

  if (!response.text) {
    throw new Error('Failed to generate Sharjah Municipality audit report from Gemini.');
  }

  return JSON.parse(response.text) as SharjahComplianceReport;
}
