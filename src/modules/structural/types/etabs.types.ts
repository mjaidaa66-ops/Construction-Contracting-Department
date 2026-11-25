export type EtabsConnectionState =
  | 'DISCONNECTED'
  | 'AGENT_UNAVAILABLE'
  | 'ETABS_NOT_INSTALLED'
  | 'NO_ACTIVE_INSTANCE'
  | 'CONNECTED_NO_MODEL'
  | 'UNSUPPORTED_ETABS_VERSION'
  | 'CONNECTED_MODEL_READY'
  | 'COM_CONNECTION_ERROR'
  | 'AGENT_ERROR';

export interface EtabsAgentStatus {
  agentReachable: boolean;
  agentVersion: string;
  platform: string;
  readOnlyMode: boolean;
  etabsInstalled: boolean;
  etabsV20Compatible: boolean;
  installedVersion: string;
  installPath: string;
  oapiDllPath: string;
  activeInstanceRunning: boolean;
  activeModelPath: string;
  activeModelName: string;
  modelLocked: boolean;
  connectionState: EtabsConnectionState;
  message: string;
  checkedAtUtc: string;
}

export interface EtabsStoryRaw {
  name: string;
  elevation: number;
  height: number;
  isMasterStory?: boolean;
  similarToStory?: string;
  spliceAbove?: boolean;
  spliceHeight?: number;
}

export interface EtabsGridLineRaw {
  id: string;
  coordinate: number;
  visible?: boolean;
}

export interface EtabsGridRaw {
  name: string;
  gridType?: string;
  originX?: number;
  originY?: number;
  rotationDeg?: number;
  xLines?: EtabsGridLineRaw[];
  yLines?: EtabsGridLineRaw[];
}

export interface EtabsPointRaw {
  name: string;
  x: number;
  y: number;
  z: number;
  label?: string;
  story?: string;
}

export interface EtabsFrameRaw {
  name: string;
  uniqueName?: string;
  label?: string;
  story?: string;
  pointI: string;
  pointJ: string;
  sectionName: string;
  designOrientation?: string;
  materialOverwrite?: string;
}

export interface EtabsAreaRaw {
  name: string;
  uniqueName?: string;
  label?: string;
  story?: string;
  pointNames: string[];
  sectionName: string;
  designOrientation?: string;
  isOpening?: boolean;
}

export interface EtabsMaterialRaw {
  name: string;
  materialType: string;
  modulusE: number;
  poissonU?: number;
  thermalCoeffA?: number;
  unitWeight?: number;
  fcOrFy?: number;
}

export interface EtabsSectionRaw {
  name: string;
  category: 'Frame' | 'Area';
  shapeOrType?: string;
  materialName?: string;
  depthOrThickness: number;
  width?: number;
}

export interface EtabsLoadPatternRaw {
  name: string;
  patternType: string;
  selfWeightMultiplier: number;
}

export interface EtabsLoadCaseRaw {
  name: string;
  caseType: string;
  analysisStatus?: string;
}

export interface EtabsLoadComboRaw {
  name: string;
  comboType?: string;
  items: Array<{ caseOrComboName: string; scaleFactor: number }>;
}

export interface EtabsTableStatusRaw {
  tableKey: string;
  tableName: string;
  isAvailable: boolean;
}

export interface EtabsRawExtractPayload {
  jobId?: string;
  sourceApplication: 'CSI ETABS' | 'ETABS Exported Tables';
  sourceVersion: string;
  modelFilePath: string;
  modelName: string;
  forceUnit: string;
  lengthUnit: string;
  temperatureUnit?: string;
  unitsLabel?: string;
  coordinateSystem?: string;
  modelLocked?: boolean;
  readOnlyVerified?: boolean;
  extractedAtUtc?: string;
  stories: EtabsStoryRaw[];
  grids: EtabsGridRaw[];
  points: EtabsPointRaw[];
  frames: EtabsFrameRaw[];
  areas: EtabsAreaRaw[];
  materials: EtabsMaterialRaw[];
  sections: EtabsSectionRaw[];
  loadPatterns: EtabsLoadPatternRaw[];
  loadCases: EtabsLoadCaseRaw[];
  loadCombos: EtabsLoadComboRaw[];
  availableTables?: EtabsTableStatusRaw[];
  warnings?: string[];
}
