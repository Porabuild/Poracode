import { describe, expect, it, vi } from "vitest";

const { hasElectronHostBridge, probeTlsCertificateFingerprint } = vi.hoisted(() => ({
  hasElectronHostBridge: vi.fn<() => boolean>(() => false),
  probeTlsCertificateFingerprint: vi.fn<(input: { url: string }) => Promise<string | null>>(),
}));

vi.mock("@/renderer/clientRuntime", () => ({
  hasElectronHostBridge: () => hasElectronHostBridge(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ probeTlsCertificateFingerprint }),
}));

import { electronCertFingerprintProbe } from "./certFingerprintProbe";

describe("electronCertFingerprintProbe", () => {
  it("returns null when no Electron host bridge is present", async () => {
    hasElectronHostBridge.mockReturnValue(false);
    await expect(
      electronCertFingerprintProbe(new URL("https://host.example/")),
    ).resolves.toBeNull();
    expect(probeTlsCertificateFingerprint).not.toHaveBeenCalled();
  });

  it("asks main to observe the leaf fingerprint when Electron is present", async () => {
    hasElectronHostBridge.mockReturnValue(true);
    probeTlsCertificateFingerprint.mockResolvedValue("a".repeat(64));
    await expect(
      electronCertFingerprintProbe(new URL("https://192.168.1.20:49152/")),
    ).resolves.toBe("a".repeat(64));
    expect(probeTlsCertificateFingerprint).toHaveBeenCalledWith({
      url: "https://192.168.1.20:49152/",
    });
  });
});
