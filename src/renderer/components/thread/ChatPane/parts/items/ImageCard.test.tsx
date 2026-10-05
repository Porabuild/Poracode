import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageCard } from "./ImageCard";
import type { ImageViewSource } from "./imageViewSource";
import { getThreadGalleryImages, openThreadGallery } from "../../../useThreadGalleryImages";
import * as imageActions from "@/renderer/utils/imageActions";
import * as bridge from "@/renderer/bridge";
import * as lightbox from "@/renderer/components/composer/ImageLightbox";

vi.mock("../../../useThreadGalleryImages", () => ({
  getThreadGalleryImages: vi.fn<typeof getThreadGalleryImages>(() => []),
  openThreadGallery: vi.fn<typeof openThreadGallery>(),
}));
vi.mock("../../chatPaneActionsContext", () => ({
  useChatPaneActions: () => ({ threadId: "thread" }),
}));

const PREVIEW = "data:image/jpeg;base64,QQ==";

function source(overrides: Partial<ImageViewSource> = {}): ImageViewSource {
  return {
    src: "https://desktop.test/api/threads/t/items/i/image",
    mime: "image/png",
    extension: "png",
    fileName: "shot.png",
    alt: "A screenshot",
    width: 800,
    height: 600,
    ...overrides,
  };
}

function renderCard(s: ImageViewSource) {
  const view = render(
    <AppProvider>
      <ImageCard source={s} />
    </AppProvider>,
  );
  const img = view.container.querySelector("img")!;
  const preview = view.container.querySelector("[aria-hidden='true'][style*='background-image']");
  return { view, img, preview };
}

describe("ImageCard", () => {
  it("uses gallery metadata even when a remote image is the only image", () => {
    const imageSource = source({ fileName: "image.png", mime: "image/*" });
    const gallery = [{ src: imageSource.src, fileName: "original.webp", mime: "image/webp" }];
    vi.mocked(getThreadGalleryImages).mockReturnValueOnce(gallery);
    const { view } = renderCard(imageSource);
    fireEvent.click(view.getByRole("button", { name: "Open image preview" }));
    expect(openThreadGallery).toHaveBeenCalledWith(gallery, imageSource.src, 0, "thread");
  });
  it("reserves the slot from intrinsic size so the timeline cannot shift on load", () => {
    // width/height ride along on the host's image reference precisely so the
    // browser can compute the box before any bytes arrive.
    const { img } = renderCard(source());
    expect(img.getAttribute("width")).toBe("800");
    expect(img.getAttribute("height")).toBe("600");
  });

  it("paints the blurred stand-in until the real image loads, then drops it", () => {
    const { view, img } = renderCard(source({ preview: PREVIEW }));
    let preview = view.container.querySelector("[aria-hidden='true'][style*='background-image']");
    expect(preview).not.toBeNull();
    expect(preview!.getAttribute("style")).toContain(PREVIEW);
    expect(preview!.className).toContain("blur-lg");
    // The image fades in over the stand-in rather than popping in.
    expect(img.className).toContain("opacity-0");
    expect(img.className).toContain("transition-opacity");

    fireEvent.load(img);
    preview = view.container.querySelector("[aria-hidden='true'][style*='background-image']");
    expect(preview).toBeNull();
    expect(img.className).toContain("opacity-100");
  });

  it("still fades in when the host supplied no stand-in", () => {
    const { img, preview } = renderCard(source());
    expect(preview).toBeNull();
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(img.className).toContain("opacity-100");
  });

  it("shows an inline data image immediately — no fade, no flash", () => {
    // Already decoded, so fading would only add perceived latency.
    const { img, preview } = renderCard(source({ src: "data:image/png;base64,QQ==" }));
    expect(preview).toBeNull();
    expect(img.className).not.toContain("transition-opacity");
    expect(img.className).not.toContain("opacity-0");
  });

  it("reveals the image even if it fails to load, so the slot never stays blank", () => {
    const { view, img } = renderCard(source({ preview: PREVIEW }));
    fireEvent.error(img);
    expect(
      view.container.querySelector("[aria-hidden='true'][style*='background-image']"),
    ).toBeNull();
    expect(img.className).toContain("opacity-100");
  });

  it("tracks load state for the current URL while preserving the image node and slot", () => {
    const { view, img } = renderCard(source({ preview: PREVIEW }));
    const card = img.closest('[data-poracode-image-card="true"]');
    const slot = img.getAttribute("style");
    fireEvent.load(img);
    expect(img).toHaveClass("opacity-100");
    view.rerender(
      <AppProvider>
        <ImageCard source={source({ src: "blob:replacement", preview: PREVIEW })} />
      </AppProvider>,
    );
    expect(view.container.querySelector("img")).toBe(img);
    expect(img.closest('[data-poracode-image-card="true"]')).toBe(card);
    expect(img.getAttribute("style")).toBe(slot);
    expect(img).toHaveAttribute("src", "blob:replacement");
    expect(img).toHaveClass("opacity-0");
    expect(view.container.querySelector("[style*='background-image']")).not.toBeNull();
    fireEvent.error(img);
    expect(img).toHaveClass("opacity-100");
    view.rerender(
      <AppProvider>
        <ImageCard source={source({ src: "data:image/png;base64,QQ==" })} />
      </AppProvider>,
    );
    expect(view.container.querySelector("img")).toBe(img);
    expect(img).not.toHaveClass("opacity-0");
    view.rerender(
      <AppProvider>
        <ImageCard source={source()} />
      </AppProvider>,
    );
    expect(img).toHaveClass("opacity-0");
  });

  it("uses current image metadata for preview, copy and download after URL replacement", async () => {
    const { view } = renderCard(source());
    const replacement = source({ src: "blob:new-owner", fileName: "new.png", mime: "image/png" });
    view.rerender(
      <AppProvider>
        <ImageCard source={replacement} />
      </AppProvider>,
    );
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const copyBytes = vi.spyOn(imageActions, "toClipboardPngBytes").mockResolvedValue(bytes);
    const fetchBytes = vi.spyOn(imageActions, "fetchImageBytes").mockResolvedValue(bytes);
    const copy = vi
      .fn<ReturnType<typeof bridge.readBridge>["copyImageToClipboard"]>()
      .mockResolvedValue(true);
    const save = vi
      .fn<ReturnType<typeof bridge.readBridge>["saveImageFile"]>()
      .mockResolvedValue(null);
    // This action-boundary fixture deliberately exposes only the two typed
    // methods under test; it performs no native clipboard or filesystem work.
    const imageBridge: Pick<
      ReturnType<typeof bridge.readBridge>,
      "copyImageToClipboard" | "saveImageFile"
    > = {
      copyImageToClipboard: copy,
      saveImageFile: save,
    };
    const read = vi
      .spyOn(bridge, "readBridge")
      .mockReturnValue(imageBridge as unknown as ReturnType<typeof bridge.readBridge>);
    const preview = vi.spyOn(lightbox, "openImageLightbox").mockImplementation(() => undefined);
    try {
      await act(async () => {
        fireEvent.click(view.getByRole("button", { name: "Open image preview" }));
        fireEvent.click(view.getByRole("button", { name: "Copy image" }));
        fireEvent.click(view.getByRole("button", { name: "Download image" }));
      });
      expect(preview).toHaveBeenCalledExactlyOnceWith(
        [
          {
            src: replacement.src,
            alt: replacement.alt,
            mime: replacement.mime,
            fileName: replacement.fileName,
          },
        ],
        0,
      );
      expect(copyBytes).toHaveBeenCalledExactlyOnceWith(replacement);
      expect(fetchBytes).toHaveBeenCalledExactlyOnceWith(replacement.src);
      expect(copy).toHaveBeenCalledExactlyOnceWith({ data: bytes });
      expect(save).toHaveBeenCalledExactlyOnceWith({ data: bytes, suggestedName: "new.png" });
    } finally {
      copyBytes.mockRestore();
      fetchBytes.mockRestore();
      read.mockRestore();
      preview.mockRestore();
    }
  });
});

describe("reserved slot", () => {
  it("reserves the same box while a host-held reference has no fetched URL", () => {
    const { view } = renderCard(source({ src: "", pending: true }));
    expect(view.container.querySelector("img")).toBeNull();
    const slot = view.container.querySelector<HTMLElement>("button > span[aria-hidden='true']")!;
    expect(slot.style.aspectRatio).toBe("800 / 600");
    expect(slot.style.height).toBe("auto");
    view.rerender(
      <AppProvider>
        <ImageCard source={source({ src: "blob:ready-image" })} />
      </AppProvider>,
    );
    expect(view.container.querySelector("img")?.style.aspectRatio).toBe(slot.style.aspectRatio);
  });

  it("gives a fetched image a definite pre-load box so nothing reflows", () => {
    // Regression: width/height attributes alone leave an unloaded <img> at 0x0
    // under `w-auto`, because there is no intrinsic size for aspect-ratio to
    // resolve against — the transcript then jumps when the bytes land.
    const { img } = renderCard(source({ width: 369, height: 800 }));
    expect(img.style.aspectRatio).toBe("369 / 800");
    expect(img.style.height).toBe("auto");
    // The definite width itself (a nested `min()`/`calc()`) cannot be asserted
    // here — jsdom's CSSOM rejects the value outright, so it appears in neither
    // `style.width` nor the serialized attribute. `reserveInlineImageSlot` covers
    // the computed string directly, and the real box stability was measured in
    // Chrome against the running app.
  });

  it("leaves an inline data image on its natural sizing", () => {
    const { img } = renderCard(
      source({ src: "data:image/png;base64,QQ==", width: 10, height: 20 }),
    );
    expect(img.style.aspectRatio).toBe("");
    expect(img.getAttribute("style") ?? "").not.toContain("width:");
  });

  it("reserves nothing when the host could not read the image size", () => {
    // exactOptionalPropertyTypes: build the source without the keys at all.
    const { width: _w, height: _h, ...noSize } = source();
    const { img } = renderCard(noSize);
    expect(img.getAttribute("style") ?? "").not.toContain("width:");
  });
});
