export type ToolStatus = {
  id: string;
  label: string;
  available: boolean;
  detail: string;
};

export type PlatformStatus = {
  os: string;
  arch: string;
  isWindows: boolean;
  tools: ToolStatus[];
  driverHint: string;
};

export type BatteryInfo = {
  currentCapacity?: number;
  rawMaximumCapacity?: number;
  designCapacity?: number;
  healthPercent?: number;
  cycleCount?: number;
  temperatureC?: number;
  charging?: boolean;
};

export type DeviceSnapshot = {
  connected: boolean;
  name?: string;
  productType?: string;
  iosVersion?: string;
  buildVersion?: string;
  battery?: BatteryInfo;
  warnings: string[];
  source: "live" | "demo";
};

export type StorageEntry = {
  label: string;
  path: string;
  bytes: number;
};

export type CacheFinding = {
  status: "clear" | "attention" | "blocked";
  path: string;
  bytes: number;
  directoryCount: number;
  identifiers: Record<string, number>;
  cleanupEligible: boolean;
  reason: string;
};

export type DeepScanReport = {
  scannedAt: string;
  filesystemFreeBytes: number;
  storage: StorageEntry[];
  discardedCache: CacheFinding;
  notes: string[];
  source: "live" | "demo";
};

export type CleanupResult = {
  completedAt: string;
  beforeBytes: number;
  afterBytes: number;
  filesystemFreeBytes: number;
  message: string;
};

export type TechnicianReport = {
  schema: "ios-storage-forensics-report/v1";
  generatedAt: string;
  appVersion: string;
  device: Omit<DeviceSnapshot, "name">;
  deepScan?: DeepScanReport;
  cleanup?: CleanupResult;
  privacy: string;
};
