import { hasElectronHostBridge } from "@/renderer/clientRuntime";
import { readBridge } from "@/renderer/bridge";
import type { RemoteCertFingerprintProbe } from "@/shared/remote/client";

/**
 * V6 A.1: Electron-only TLS leaf probe. Browsers cannot observe the
 * certificate layer, so they return null and stay on platform chain
 * validation (documented in SECURITY.md 4.2).
 */
export const electronCertFingerprintProbe: RemoteCertFingerprintProbe = async (url) => {
  if (!hasElectronHostBridge()) return null;
  return readBridge().probeTlsCertificateFingerprint({ url: url.toString() });
};
