// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error -- Exercise the pinned editor's internal WebKit clipboard service.
import { BrowserClipboardService } from "monaco-editor/platform/clipboard/browser/clipboardService.js";

vi.mock("monaco-editor/base/browser/browser.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isSafari: true,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Monaco WebKit clipboard", () => {
  it("cancels an unread clipboard payload and still completes the next copy", async () => {
    class ClipboardPayload {
      constructor(readonly data: Record<string, Promise<string>>) {}
    }

    let latestText: Promise<string> | undefined;
    const write = vi
      .fn<(items: ClipboardPayload[]) => Promise<void>>()
      .mockRejectedValueOnce(new DOMException("Clipboard access denied", "NotAllowedError"))
      .mockImplementation(async ([item]) => {
        latestText = item?.data["text/plain"];
        await latestText;
      });

    vi.stubGlobal("ClipboardItem", ClipboardPayload);
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } });
    const container = document.createElement("div");
    const connectContainer = () => ({ dispose() {} });
    const service = new BrowserClipboardService(
      { mainContainer: container, onDidAddContainer: connectContainer },
      { trace() {}, error() {} },
    );

    try {
      container.click();
      container.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
      await service.writeText("file contents");
      expect(write).toHaveBeenCalledTimes(2);
      await expect(latestText).resolves.toBe("file contents");
    } finally {
      service.dispose();
      if (previousClipboard) Object.defineProperty(navigator, "clipboard", previousClipboard);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
