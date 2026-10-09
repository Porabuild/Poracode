import { beforeEach, describe, expect, it, vi } from "vitest";

const browserCreateTab = vi.hoisted(() =>
  vi
    .fn<(payload: { url: string; activate: boolean; reveal?: boolean }) => Promise<void>>()
    .mockResolvedValue(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ browserCreateTab }),
}));

import { openPdfPreview } from "./openPdfPreview";

describe("openPdfPreview", () => {
  beforeEach(() => {
    browserCreateTab.mockClear();
  });

  it("creates a browser tab with reveal so presentation matches link opens", () => {
    openPdfPreview("C:\\Users\\me\\Biometric Reuse.pdf");

    expect(browserCreateTab).toHaveBeenCalledWith({
      url: "file:///C:/Users/me/Biometric%20Reuse.pdf",
      activate: true,
      reveal: true,
    });
  });

  it("resolves project-relative paths before opening", () => {
    openPdfPreview("docs/a.pdf", { kind: "windows", path: "C:\\repo" });

    expect(browserCreateTab).toHaveBeenCalledWith({
      url: "file:///C:/repo/docs/a.pdf",
      activate: true,
      reveal: true,
    });
  });
});
