import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  desktop: false,
  readAsset: vi.fn<(reference: unknown) => Promise<{ blob: Blob }>>(),
  preview: vi.fn<(input: { data: Uint8Array }) => Promise<void>>(),
}));
vi.mock("@/renderer/clientRuntime", () => ({ hasElectronHostBridge: () => client.desktop }));
vi.mock("@/renderer/state/composerDrafts/clientDraftDatabase", () => ({
  isClientDraftAsset: (path: string) => path.startsWith("poracode-draft-asset:"),
}));
vi.mock("@/renderer/state/composerDrafts/readDraftAsset", () => ({
  readDraftAsset: client.readAsset,
}));

const browserCreateTab = vi.hoisted(() =>
  vi
    .fn<(payload: { url: string; activate: boolean; reveal?: boolean }) => Promise<void>>()
    .mockResolvedValue(),
);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ browserCreateTab, browserPreviewClientPdf: client.preview }),
}));

import { openPdfPreview } from "./openPdfPreview";

describe("openPdfPreview", () => {
  beforeEach(() => {
    browserCreateTab.mockClear();
    client.desktop = false;
    client.readAsset.mockReset();
    client.preview.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    window.dispatchEvent(new Event("pagehide"));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it("reserves a browser preview synchronously and releases its URL when closed", async () => {
    vi.useFakeTimers();
    const read = Promise.withResolvers<{ blob: Blob }>();
    client.readAsset.mockReturnValue(read.promise);
    const popup = {
      opener: window,
      closed: false,
      location: { replace: vi.fn<(url: string) => void>() },
      close: vi.fn<() => void>(),
    };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const create = vi.fn<() => string>(() => "blob:pdf-preview");
    const revoke = vi.fn<(url: string) => void>();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = create;
        static override revokeObjectURL = revoke;
      },
    );

    openPdfPreview("poracode-draft-asset:pdf/document.pdf");
    expect(open).toHaveBeenCalledExactlyOnceWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    read.resolve({ blob: new Blob(["%PDF-preview"], { type: "application/pdf" }) });
    await vi.waitFor(() => expect(popup.location.replace).toHaveBeenCalledWith("blob:pdf-preview"));
    expect(revoke).not.toHaveBeenCalled();
    popup.closed = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:pdf-preview");
  });

  it("does not read bytes when the browser blocks the reserved preview", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    openPdfPreview("poracode-draft-asset:pdf/document.pdf");
    expect(open).toHaveBeenCalled();
    expect(client.readAsset).not.toHaveBeenCalled();
  });

  it("closes the reserved preview when reading its bytes fails", async () => {
    const popup = { opener: window, close: vi.fn<() => void>() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    client.readAsset.mockRejectedValue(new Error("file unavailable"));
    openPdfPreview("poracode-draft-asset:pdf/document.pdf");
    await vi.waitFor(() => expect(popup.close).toHaveBeenCalledOnce());
    expect(report).toHaveBeenCalledWith("[poracode] client PDF preview failed", expect.any(Error));
  });

  it("does not navigate a preview closed before its bytes arrive", async () => {
    const read = Promise.withResolvers<{ blob: Blob }>();
    client.readAsset.mockReturnValue(read.promise);
    const popup = {
      opener: window,
      closed: false,
      location: { replace: vi.fn<(url: string) => void>() },
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    openPdfPreview("poracode-draft-asset:pdf/document.pdf");
    popup.closed = true;
    read.resolve({ blob: new Blob(["%PDF-preview"]) });
    await read.promise;
    expect(popup.location.replace).not.toHaveBeenCalled();
  });

  it("passes native import provenance to recovery before creating a desktop preview", async () => {
    client.desktop = true;
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    client.readAsset.mockResolvedValue({ blob: new Blob([bytes], { type: "application/pdf" }) });
    const open = vi.spyOn(window, "open");
    const reference = {
      path: "poracode-draft-asset:pdf/document.pdf",
      name: "document.pdf",
      mimeType: "application/pdf",
      source: { path: "/native/document.pdf" },
    };
    openPdfPreview(reference);
    await vi.waitFor(() => expect(client.preview).toHaveBeenCalledExactlyOnceWith({ data: bytes }));
    expect(client.readAsset).toHaveBeenCalledExactlyOnceWith(reference);
    expect(open).not.toHaveBeenCalled();
  });
});
