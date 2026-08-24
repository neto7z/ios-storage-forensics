import { invoke } from "@tauri-apps/api/core";
import { demoDeepScan, demoDevice, demoPlatform } from "./demo";
import type { CleanupResult, DeepScanReport, DeviceSnapshot, PlatformStatus } from "./types";

export const isDesktop = () => "__TAURI_INTERNALS__" in window;

export async function platformStatus(): Promise<PlatformStatus> {
  return isDesktop() ? invoke("platform_status") : demoPlatform;
}

export async function scanUsbDevice(): Promise<DeviceSnapshot> {
  return isDesktop() ? invoke("scan_usb_device") : demoDevice;
}

export async function scanDeep(password: string): Promise<DeepScanReport> {
  if (!isDesktop()) return { ...demoDeepScan, scannedAt: new Date().toISOString() };
  return invoke("scan_deep", { password });
}

export async function cleanupDiscardedCache(password: string, confirmation: string): Promise<CleanupResult> {
  if (!isDesktop()) {
    if (confirmation !== "APAGAR CACHES DESCARTADOS") throw new Error("Confirmação incorreta.");
    return {
      completedAt: new Date().toISOString(),
      beforeBytes: demoDeepScan.discardedCache.bytes,
      afterBytes: 0,
      filesystemFreeBytes: 16 * 1024 ** 3,
      message: "Simulação concluída. Nenhum arquivo real foi alterado.",
    };
  }
  return invoke("cleanup_discarded_cache", { password, confirmation });
}

export async function saveReport(reportJson: string): Promise<string> {
  return invoke("save_report", { reportJson });
}
