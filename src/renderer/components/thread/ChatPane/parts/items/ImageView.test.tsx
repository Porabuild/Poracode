import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageLightboxHost } from "@/renderer/components/composer";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ImageView } from "./ImageView";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function imageItem(payload: Record<string, unknown>): RuntimeChatItem {
  return {
    id: "image_1",
    type: "image_view",
    state: "completed",
    payload,
    streams: {},
  };
}

const originalClipboardItem = globalThis.ClipboardItem;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

/**
 * Install a stub `window.lightcode` bridge. ImageView delegates copy/download
 * unconditionally to the bridge; the browser-native implementations live in the
 * mobile bridge shim (src/mobile/bridge.ts), so here we assert delegation and
 * error handling against mocked bridge methods.
 */
function installBridge(overrides: Record<string, unknown> = {}) {
  const existing = (window as Window & { lightcode?: Record<string, unknown> }).lightcode ?? {};
  Object.defineProperty(window, "lightcode", {
    value: {
      ...existing,
      appVersion: "remote",
      setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      ...overrides,
    },
    configurable: true,
  });
}

describe("ImageView", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "lightcode");
    Reflect.deleteProperty(navigator, "clipboard");
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: originalClipboardItem,
      configurable: true,
    });
    Object.defineProperty(URL, "createObjectURL", {
      value: originalCreateObjectUrl,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: originalRevokeObjectUrl,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("renders an inline <img> with an overlaid action toolbar (no visible caption)", () => {
    render(
      <AppProvider>
        <ImageView
          item={imageItem({
            name: "imageGeneration",
            status: "success",
            result: PNG_BASE64,
            args: { prompt: "A red square" },
          })}
        />
      </AppProvider>,
    );

    const img = screen.getByAltText("A red square") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe(`data:image/png;base64,${PNG_BASE64}`);
    expect(img.getAttribute("width")).toBe("1");
    expect(img.getAttribute("height")).toBe("1");
    expect(img.getAttribute("loading")).toBeNull();
    // The prompt lives only on the <img> alt for a11y — it is not written as a
    // visible caption (the picture may be shared, not "generated").
    expect(screen.queryByText("A red square")).toBeNull();
    const copyButton = screen.getByRole("button", { name: "Copy image" });
    expect(copyButton).toBeTruthy();
    expect(copyButton.closest(".lightcode-image-action-toolbar")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Download image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open preview" })).toBeTruthy();
  });

  it("opens a lightbox when the image is clicked", () => {
    render(
      <AppProvider>
        <ImageView item={imageItem({ name: "imageGeneration", result: PNG_BASE64 })} />
        <ImageLightboxHost />
      </AppProvider>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open image preview" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("falls back to the tool-call row when the result is not an image", () => {
    render(
      <AppProvider>
        <ImageView
          item={imageItem({
            name: "imageGeneration",
            status: "success",
            result: "Sorry, image generation failed.",
          })}
        />
      </AppProvider>,
    );

    // No inline image card; the generic tool-call accordion is shown instead.
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/imageGeneration/i)).toBeTruthy();
  });

  it("copies images by delegating to the bridge", async () => {
    const copyImageToClipboard = vi
      .fn<(payload: { data: Uint8Array }) => Promise<boolean>>()
      .mockResolvedValue(true);
    installBridge({ copyImageToClipboard });

    render(
      <AppProvider>
        <ImageView item={imageItem({ name: "imageGeneration", result: PNG_BASE64 })} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));

    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
    expect(copyImageToClipboard.mock.calls[0]![0].data).toBeInstanceOf(Uint8Array);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("reports image copy failures", async () => {
    const toastDanger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installBridge({
      copyImageToClipboard: vi
        .fn<() => Promise<boolean>>()
        .mockRejectedValue(new Error("copy failed")),
    });

    render(
      <AppProvider>
        <ImageView item={imageItem({ name: "imageGeneration", result: PNG_BASE64 })} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));

    await waitFor(() => expect(toastDanger).toHaveBeenCalledWith("copy failed"));
  });

  it("downloads images by delegating to the bridge", async () => {
    const saveImageFile = vi
      .fn<(payload: { data: Uint8Array; suggestedName: string }) => Promise<string | null>>()
      .mockResolvedValue(null);
    installBridge({ saveImageFile });

    render(
      <AppProvider>
        <ImageView item={imageItem({ name: "imageGeneration", result: PNG_BASE64 })} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    await waitFor(() => expect(saveImageFile).toHaveBeenCalledTimes(1));
    expect(saveImageFile.mock.calls[0]![0].data).toBeInstanceOf(Uint8Array);
    expect(typeof saveImageFile.mock.calls[0]![0].suggestedName).toBe("string");
  });

  it("reports image download failures", async () => {
    const toastDanger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    installBridge({
      saveImageFile: vi
        .fn<() => Promise<string | null>>()
        .mockRejectedValue(new Error("download failed")),
    });

    render(
      <AppProvider>
        <ImageView item={imageItem({ name: "imageGeneration", result: PNG_BASE64 })} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Download image" }));

    await waitFor(() => expect(toastDanger).toHaveBeenCalledWith("download failed"));
  });
});
