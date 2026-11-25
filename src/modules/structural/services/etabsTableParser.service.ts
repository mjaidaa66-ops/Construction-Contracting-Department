import * as XLSX from 'xlsx';
import type {
  EtabsAreaRaw,
  EtabsFrameRaw,
  EtabsGridRaw,
  EtabsLoadCaseRaw,
  EtabsLoadComboRaw,
  EtabsLoadPatternRaw,
  EtabsMaterialRaw,
  EtabsPointRaw,
  EtabsRawExtractPayload,
  EtabsSectionRaw,
  EtabsStoryRaw,
} from '../types/etabs.types';

export interface ParsedTableFallbackResult {
  payload: EtabsRawExtractPayload;
  detectedTables: string[];
  warnings: string[];
}

function normalizeHeaderKey(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function toSafeString(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/^([=+\-@])+/, "'$1").trim();
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };

  const headers = splitLine(lines[0]).map(normalizeHeaderKey);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = cells[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function mapRowsByTableName(
  tableName: string,
  rows: Array<Record<string, unknown>>,
  target: EtabsRawExtractPayload,
  detectedTables: string[]
) {
  const normalizedName = normalizeHeaderKey(tableName);
  if (rows.length === 0) return;

  const firstKeys = Object.keys(rows[0] || {}).map(normalizeHeaderKey);
  const hasAnyKey = (...candidates: string[]) => candidates.some((c) => firstKeys.includes(c));

  const getField = (row: Record<string, unknown>, ...keys: string[]): unknown => {
    for (const [rawKey, val] of Object.entries(row)) {
      const nk = normalizeHeaderKey(rawKey);
      if (keys.includes(nk)) return val;
    }
    return undefined;
  };

  if (normalizedName.includes('story') || hasAnyKey('storyname', 'elevation')) {
    detectedTables.push(tableName || 'Story Definitions');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'name', 'story', 'storyname'));
      if (!name) continue;
      target.stories.push({
        name,
        elevation: toSafeNumber(getField(row, 'elevation', 'elev')),
        height: toSafeNumber(getField(row, 'height', 'storyheight')),
        isMasterStory:
          toSafeString(getField(row, 'ismasterstory', 'masterstory')).toLowerCase() === 'yes' ||
          getField(row, 'ismasterstory') === true,
        similarToStory: toSafeString(getField(row, 'similarto', 'similartostory')),
      } satisfies EtabsStoryRaw);
    }
    return;
  }

  if (normalizedName.includes('grid') || hasAnyKey('gridid', 'ordinate')) {
    detectedTables.push(tableName || 'Grid Definitions');
    const grouped = new Map<string, EtabsGridRaw>();
    for (const row of rows) {
      const gridSys = toSafeString(getField(row, 'gridsystem', 'name', 'gridname'), 'G1');
      const axis = toSafeString(getField(row, 'griddir', 'axis', 'direction'), 'X').toUpperCase();
      const id = toSafeString(getField(row, 'gridid', 'id', 'bubble'), 'A');
      const coord = toSafeNumber(getField(row, 'ordinate', 'coordinate', 'coord'));
      const entry = grouped.get(gridSys) || {
        name: gridSys,
        gridType: 'Cartesian',
        originX: 0,
        originY: 0,
        rotationDeg: 0,
        xLines: [],
        yLines: [],
      };
      if (axis.startsWith('Y')) {
        entry.yLines!.push({ id, coordinate: coord, visible: true });
      } else {
        entry.xLines!.push({ id, coordinate: coord, visible: true });
      }
      grouped.set(gridSys, entry);
    }
    target.grids.push(...grouped.values());
    return;
  }

  if (normalizedName.includes('material') || hasAnyKey('modulus', 'ec', 'fc', 'fy')) {
    detectedTables.push(tableName || 'Material Properties');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'material', 'name', 'matname'));
      if (!name) continue;
      target.materials.push({
        name,
        materialType: toSafeString(getField(row, 'type', 'materialtype', 'designorientation'), 'Concrete'),
        modulusE: toSafeNumber(getField(row, 'moduluse', 'e', 'ec')),
        poissonU: toSafeNumber(getField(row, 'poissonu', 'u', 'nu'), 0.2),
        unitWeight: toSafeNumber(getField(row, 'unitweight', 'weight', 'gamma'), 25),
        fcOrFy: toSafeNumber(getField(row, 'fc', 'fy', 'fcorfy', 'strength')),
      } satisfies EtabsMaterialRaw);
    }
    return;
  }

  if (normalizedName.includes('section') || hasAnyKey('t3', 't2', 'thickness')) {
    detectedTables.push(tableName || 'Section Properties');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'sectionname', 'name', 'property'));
      if (!name) continue;
      const cat = normalizedName.includes('area') || normalizedName.includes('slab') || hasAnyKey('thickness')
        ? 'Area'
        : 'Frame';
      target.sections.push({
        name,
        category: cat,
        shapeOrType: toSafeString(getField(row, 'shape', 'shapeortype', 'type'), cat === 'Frame' ? 'Rectangular' : 'Slab'),
        materialName: toSafeString(getField(row, 'material', 'materialname')),
        depthOrThickness: toSafeNumber(getField(row, 't3', 'depth', 'thickness', 'depthorthickness')),
        width: toSafeNumber(getField(row, 't2', 'width')),
      } satisfies EtabsSectionRaw);
    }
    return;
  }

  if (normalizedName.includes('joint') || normalizedName.includes('point') || hasAnyKey('x', 'y', 'z')) {
    detectedTables.push(tableName || 'Point Coordinates');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'uniquename', 'name', 'point', 'joint'));
      if (!name) continue;
      target.points.push({
        name,
        story: toSafeString(getField(row, 'story')),
        label: toSafeString(getField(row, 'label')),
        x: toSafeNumber(getField(row, 'x', 'xorcoord')),
        y: toSafeNumber(getField(row, 'y', 'yorcoord')),
        z: toSafeNumber(getField(row, 'z', 'zorcoord')),
      } satisfies EtabsPointRaw);
    }
    return;
  }

  if (normalizedName.includes('frame') || hasAnyKey('pointi', 'pointj', 'jointi', 'jointj')) {
    detectedTables.push(tableName || 'Frame Assignments');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'uniquename', 'name', 'frame'));
      if (!name) continue;
      target.frames.push({
        name,
        uniqueName: name,
        label: toSafeString(getField(row, 'label')),
        story: toSafeString(getField(row, 'story')),
        pointI: toSafeString(getField(row, 'pointi', 'jointi')),
        pointJ: toSafeString(getField(row, 'pointj', 'jointj')),
        sectionName: toSafeString(getField(row, 'sectionname', 'section', 'property')),
        designOrientation: toSafeString(getField(row, 'designorientation', 'type'), 'Beam'),
      } satisfies EtabsFrameRaw);
    }
    return;
  }

  if (normalizedName.includes('area') || normalizedName.includes('slab') || hasAnyKey('pointnames', 'points')) {
    detectedTables.push(tableName || 'Area Assignments');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'uniquename', 'name', 'area'));
      if (!name) continue;
      const rawPts = getField(row, 'pointnames', 'points', 'joints');
      const ptList = Array.isArray(rawPts)
        ? rawPts.map((p) => toSafeString(p)).filter(Boolean)
        : toSafeString(rawPts)
            .split(/[;,\s]+/)
            .map((p) => p.trim())
            .filter(Boolean);
      target.areas.push({
        name,
        uniqueName: name,
        label: toSafeString(getField(row, 'label')),
        story: toSafeString(getField(row, 'story')),
        pointNames: ptList,
        sectionName: toSafeString(getField(row, 'sectionname', 'section', 'property')),
        designOrientation: toSafeString(getField(row, 'designorientation', 'type'), 'Floor'),
      } satisfies EtabsAreaRaw);
    }
    return;
  }

  if (normalizedName.includes('pattern') || hasAnyKey('selfwtmultiplier', 'selfweightmultiplier')) {
    detectedTables.push(tableName || 'Load Patterns');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'name', 'loadpattern'));
      if (!name) continue;
      target.loadPatterns.push({
        name,
        patternType: toSafeString(getField(row, 'type', 'patterntype'), 'Dead'),
        selfWeightMultiplier: toSafeNumber(getField(row, 'selfweightmultiplier', 'selfwtmultiplier')),
      } satisfies EtabsLoadPatternRaw);
    }
    return;
  }

  if (normalizedName.includes('combo') || hasAnyKey('scalefactor', 'sf')) {
    detectedTables.push(tableName || 'Load Combinations');
    const combos = new Map<string, EtabsLoadComboRaw>();
    for (const row of rows) {
      const name = toSafeString(getField(row, 'name', 'comboname', 'loadcombination'));
      if (!name) continue;
      const combo = combos.get(name) || {
        name,
        comboType: toSafeString(getField(row, 'type', 'combotype'), 'Linear Add'),
        items: [],
      };
      const itemName = toSafeString(getField(row, 'casename', 'caseorcomboname', 'loadcase'));
      const sf = toSafeNumber(getField(row, 'scalefactor', 'sf'), 1);
      if (itemName) {
        combo.items.push({ caseOrComboName: itemName, scaleFactor: sf });
      }
      combos.set(name, combo);
    }
    target.loadCombos.push(...combos.values());
    return;
  }

  if (normalizedName.includes('case')) {
    detectedTables.push(tableName || 'Load Cases');
    for (const row of rows) {
      const name = toSafeString(getField(row, 'name', 'loadcase', 'casename'));
      if (!name) continue;
      target.loadCases.push({
        name,
        caseType: toSafeString(getField(row, 'type', 'casetype'), 'LinearStatic'),
        analysisStatus: toSafeString(getField(row, 'status', 'analysisstatus'), 'NotRun'),
      } satisfies EtabsLoadCaseRaw);
    }
  }
}

export function parseExportedEtabsTables(input: {
  fileName: string;
  contentText?: string;
  binaryBuffer?: ArrayBuffer | Uint8Array;
  forceUnit?: string;
  lengthUnit?: string;
  sourceVersion?: string;
}): ParsedTableFallbackResult {
  const { fileName, contentText, binaryBuffer, forceUnit = 'kN', lengthUnit = 'm', sourceVersion = '20.x' } = input;
  const lowerName = fileName.toLowerCase();
  const warnings: string[] = [];
  const detectedTables: string[] = [];

  if (lowerName.endsWith('.json') && contentText) {
    const parsed = JSON.parse(contentText) as Partial<EtabsRawExtractPayload>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Exported ETABS JSON file must contain an object payload.');
    }

    const payload: EtabsRawExtractPayload = {
      sourceApplication: 'ETABS Exported Tables',
      sourceVersion: toSafeString(parsed.sourceVersion, sourceVersion),
      modelFilePath: toSafeString(parsed.modelFilePath, fileName),
      modelName: toSafeString(parsed.modelName, fileName.replace(/\.[^.]+$/, '')),
      forceUnit: toSafeString(parsed.forceUnit, forceUnit),
      lengthUnit: toSafeString(parsed.lengthUnit, lengthUnit),
      coordinateSystem: toSafeString(parsed.coordinateSystem, 'Global'),
      modelLocked: Boolean(parsed.modelLocked),
      readOnlyVerified: true,
      extractedAtUtc: parsed.extractedAtUtc || new Date().toISOString(),
      stories: Array.isArray(parsed.stories) ? parsed.stories : [],
      grids: Array.isArray(parsed.grids) ? parsed.grids : [],
      points: Array.isArray(parsed.points) ? parsed.points : [],
      frames: Array.isArray(parsed.frames) ? parsed.frames : [],
      areas: Array.isArray(parsed.areas) ? parsed.areas : [],
      materials: Array.isArray(parsed.materials) ? parsed.materials : [],
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      loadPatterns: Array.isArray(parsed.loadPatterns) ? parsed.loadPatterns : [],
      loadCases: Array.isArray(parsed.loadCases) ? parsed.loadCases : [],
      loadCombos: Array.isArray(parsed.loadCombos) ? parsed.loadCombos : [],
      availableTables: Array.isArray(parsed.availableTables) ? parsed.availableTables : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
    return {
      payload,
      detectedTables: ['ETABS JSON Export'],
      warnings,
    };
  }

  const basePayload: EtabsRawExtractPayload = {
    sourceApplication: 'ETABS Exported Tables',
    sourceVersion,
    modelFilePath: fileName,
    modelName: fileName.replace(/\.[^.]+$/, ''),
    forceUnit,
    lengthUnit,
    coordinateSystem: 'Global',
    modelLocked: false,
    readOnlyVerified: true,
    extractedAtUtc: new Date().toISOString(),
    stories: [],
    grids: [],
    points: [],
    frames: [],
    areas: [],
    materials: [],
    sections: [],
    loadPatterns: [],
    loadCases: [],
    loadCombos: [],
    availableTables: [],
    warnings,
  };

  if (lowerName.endsWith('.csv') && contentText) {
    const rows = parseCsvRows(contentText);
    if (rows.length === 0) {
      throw new Error('CSV file contains no tabular structural rows.');
    }
    mapRowsByTableName(fileName, rows, basePayload, detectedTables);
    return { payload: basePayload, detectedTables, warnings };
  }

  if ((lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) && binaryBuffer) {
    const workbook = XLSX.read(binaryBuffer, { type: 'array' });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      mapRowsByTableName(sheetName, rows, basePayload, detectedTables);
    }
    if (detectedTables.length === 0) {
      warnings.push('No recognized ETABS Database Table sheets were matched inside the workbook.');
    }
    return { payload: basePayload, detectedTables, warnings };
  }

  throw new Error('Unsupported ETABS exported table format. Supported formats: .json, .csv, .xlsx.');
}
