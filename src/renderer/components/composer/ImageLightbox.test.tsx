import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ImageLightboxHost, ImageLightboxView, openAttachmentLightbox } from "./ImageLightbox";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);
const copyImageToClipboard = vi
  .fn<(payload: { data: Uint8Array }) => Promise<boolean>>()
  .mockResolvedValue(true);
const saveImageFile = vi
  .fn<(payload: { data: Uint8Array; suggestedName: string }) => Promise<string | null>>()
  .mockResolvedValue(null);
const readLocalImageFile = vi
  .fn<(payload: { url: string }) => Promise<Uint8Array>>()
  .mockResolvedValue(png);

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ copyImageToClipboard, saveImageFile, readLocalImageFile }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  copyImageToClipboard.mockResolvedValue(true);
});

function openPreview() {
  const onClose = vi.fn<() => void>();
  render(
    <ImageLightboxView
      images={[
        { src: "poracode-local:///C:/images/sample.png", alt: "sample.png" },
        { src: "data:image/png;base64,iVBORw==", alt: "Generated landscape" },
      ]}
      initialIndex={0}
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("image preview toolbar", () => {
  it("keeps a pasted attachment's original filename and format behind its blob URL", async () => {
    const webp = new Uint8Array([82, 73, 70, 70]);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>>()
        .mockResolvedValue({ ok: true, arrayBuffer: async () => webp.buffer }),
    );
    render(<ImageLightboxHost />);
    act(() =>
      openAttachmentLightbox(
        [
          {
            id: "pasted",
            path: "C:/attachments/Pasted image.webp",
            name: "Pasted image.webp",
            previewUrl: "blob:opaque-id",
            mimeType: "image/webp",
            isImage: true,
          },
        ],
        0,
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(saveImageFile).toHaveBeenCalledWith({
        data: webp,
        suggestedName: "Pasted image.webp",
      }),
    );
  });
  it("copies a local attachment without closing or changing the zoomed preview", async () => {
    const onClose = openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledWith({ data: png }));
    expect(readLocalImageFile).toHaveBeenCalledWith({
      url: "poracode-local:///C:/images/sample.png",
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector(".poracode-image-lightbox__image")).toHaveStyle({
      transform: "translate3d(0px, 0px, 0) scale(1.5)",
    });
  });

  it("saves the currently displayed generated image with the original bytes", async () => {
    const fetchMock = vi
      .fn<(src: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>>()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => png.buffer });
    vi.stubGlobal("fetch", fetchMock);
    const onClose = openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() =>
      expect(saveImageFile).toHaveBeenCalledWith({
        data: png,
        suggestedName: "generated-landscape.png",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,iVBORw==");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps gallery keyboard navigation and Escape available from the toolbar", () => {
    const onClose = openPreview();
    const copy = screen.getByRole("button", { name: "Copy image" });
    expect(copy.closest(".poracode-image-lightbox__footer")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Save image" })
        .closest(".poracode-image-lightbox__footer"),
    ).not.toBeNull();
    fireEvent.keyDown(copy, { key: "ArrowRight" });
    expect(document.querySelector(".poracode-image-lightbox__image")).toHaveAttribute(
      "alt",
      "Generated landscape",
    );
    fireEvent.keyDown(copy, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("reports clipboard rejection and read errors", async () => {
    const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    copyImageToClipboard.mockResolvedValue(false);
    openPreview();
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await waitFor(() => expect(danger).toHaveBeenCalledWith("Unable to copy image."));
    readLocalImageFile.mockRejectedValueOnce(new Error("missing file"));

    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    await waitFor(() => expect(danger).toHaveBeenCalledWith("Unable to save image."));
  });
});
