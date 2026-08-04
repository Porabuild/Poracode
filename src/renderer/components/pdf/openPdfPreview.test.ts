import { beforeEach, describe, expect, it, vi } from "vitest";

const browserCreateTab = vi.hoisted(() =>
  vi
    .fn<(payload: { url: string; activate: boolean; reveal?: boolean }) => Promise<void>>()
    .mockResolvedValue(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ browserCreateTab }),
}));

import { openPdfPreview, resolvePdfHostPath } from "./openPdfPreview";

describe("resolvePdfHostPath", () => {
  it("joins relative paths for Windows projects", () => {
    expect(
      resolvePdfHostPath("docs/a.pdf", {
        kind: "windows",
        path: "C:\\repo",
      }),
    ).toBe("C:\\repo\\docs\\a.pdf");
  });

  it("maps WSL relative paths to UNC", () => {
    expect(
      resolvePdfHostPath("docs/a.pdf", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\repo\\docs\\a.pdf");
  });

  it("maps WSL linux absolute paths to UNC", () => {
    expect(
      resolvePdfHostPath("/home/me/repo/docs/a.pdf", {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe("\\\\wsl.localhost\\Ubuntu\\home\\me\\repo\\docs\\a.pdf");
  });

  it("leaves host UNC paths unchanged for WSL projects", () => {
    const unc = "\\\\wsl.localhost\\Ubuntu\\home\\me\\doc.pdf";
    expect(
      resolvePdfHostPath(unc, {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/repo",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\repo",
      }),
    ).toBe(unc);
  });
});

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
