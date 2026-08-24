import type { DeepScanReport, DeviceSnapshot, PlatformStatus } from "./types";

export const demoPlatform: PlatformStatus = {
  os: "Windows",
  arch: "x86_64",
  isWindows: true,
  driverHint: "Modo de demonstração: nenhuma conexão real foi realizada.",
  tools: [
    { id: "apple-driver", label: "Apple Mobile Device", available: true, detail: "Serviço detectado" },
    { id: "ideviceinfo", label: "Leitura USB", available: true, detail: "Ferramenta disponível" },
    { id: "iproxy", label: "Túnel USB", available: true, detail: "Ferramenta disponível" },
  ],
};

export const demoDevice: DeviceSnapshot = {
  connected: true,
  name: "iPhone do cliente (demonstração)",
  productType: "iPhone11,8",
  iosVersion: "18.7",
  buildVersion: "22H20",
  source: "demo",
  warnings: ["Dados de demonstração anonimizados. Nenhum aparelho foi acessado."],
  battery: {
    currentCapacity: 1770,
    rawMaximumCapacity: 2193,
    designCapacity: 2942,
    healthPercent: 74.5,
    cycleCount: 2165,
    temperatureC: 34.9,
    charging: true,
  },
};

export const demoDeepScan: DeepScanReport = {
  scannedAt: new Date().toISOString(),
  filesystemFreeBytes: 577 * 1024 * 1024,
  source: "demo",
  storage: [
    { label: "Usuário móvel", path: "/private/var/mobile", bytes: 35 * 1024 ** 3 },
    { label: "Biblioteca", path: "/private/var/mobile/Library", bytes: 21 * 1024 ** 3 },
    { label: "Caches", path: "/private/var/mobile/Library/Caches", bytes: 17 * 1024 ** 3 },
    { label: "Cache descartado", path: "/private/var/mobile/Library/Caches/com.apple.cache_delete", bytes: 16 * 1024 ** 3 },
  ],
  discardedCache: {
    status: "attention",
    path: "/private/var/mobile/Library/Caches/com.apple.cache_delete/com.apple.CacheDeleteAppContainerCaches.discardedCaches",
    bytes: 16 * 1024 ** 3,
    directoryCount: 242,
    identifiers: { "com.google.photos.mdd.downloads": 242 },
    cleanupEligible: true,
    reason: "Todos os conjuntos correspondem exclusivamente ao cache documentado do Google Fotos.",
  },
  notes: [
    "O modo profundo exige jailbreak rootless e OpenSSH ativo.",
    "O achado demonstra o caso documentado no repositório; outros aparelhos precisam de diagnóstico próprio.",
  ],
};
