import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageCard } from "./ImageCard";
import type { ImageViewSource } from "./imageViewSource";
import { getThreadGalleryImages, openThreadGallery } from "../../../useThreadGalleryImages";
import * as imageActions from "@/renderer/utils/imageActions";
import * as bridge from "@/renderer/bridge";
import * as lightbox from "@/renderer/components/composer/ImageLightbox";

const context = vi.hoisted(() => ({ threadId: "thread" }));

vi.mock("../../../useThreadGalleryImages", () => ({
  getThreadGalleryImages: vi.fn<typeof getThreadGalleryImages>(() => []),
  openThreadGallery: vi.fn<typeof openThreadGallery>(),
}));
vi.mock("../../chatPaneActionsContext", () => ({
  useChatPaneActions: () => context,
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

function renderCard(s: ImageViewSource, resolveFullSrc?: () => Promise<string>) {
  const view = render(
    <AppProvider>
      <ImageCard source={s} {...(resolveFullSrc ? { resolveFullSrc } : {})} />
    </AppProvider>,
  );
  const img = view.container.querySelector("img")!;
  const preview = view.container.querySelector("[aria-hidden='true'][style*='background-image']");
  return { view, img, preview };
}

describe("ImageCard", () => {
  it.each(["empty", "failure"])(
    "does not use card bytes for image actions after full-resolution %s",
    async (outcome) => {
      const resolveFull = vi.fn<() => Promise<string>>(() =>
        outcome === "empty" ? Promise.resolve("") : Promise.reject(new Error("offline")),
      );
      const copyBytes = vi.spyOn(imageActions, "toClipboardPngBytes");
      const fetchBytes = vi.spyOn(imageActions, "fetchImageBytes");
      const preview = vi.spyOn(lightbox, "openImageLightbox");
      const danger = vi.spyOn(toast, "danger").mockImplementation(() => "image-error");
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        const { view } = renderCard(source({ src: "blob:card-jpeg" }), resolveFull);
        await act(async () => {
          fireEvent.click(view.getByRole("button", { name: "Copy image" }));
          fireEvent.click(view.getByRole("button", { name: "Download image" }));
          fireEvent.click(view.getByRole("button", { name: "Open image preview" }));
        });
        expect(copyBytes).not.toHaveBeenCalled();
        expect(fetchBytes).not.toHaveBeenCalled();
        expect(preview).not.toHaveBeenCalled();
        expect(danger).toHaveBeenCalledTimes(3);
      } finally {
        copyBytes.mockRestore();
        fetchBytes.mockRestore();
        preview.mockRestore();
        danger.mockRestore();
        log.mockRestore();
      }
    },
  );

  it.each(["replacement", "thread change", "unmount", "newer modal", "latest click"])(
    "ignores a delayed preview after %s",
    async (change) => {
      const first = Promise.withResolvers<string>();
      const second = Promise.withResolvers<string>();
      const resolveFull = vi
        .fn<() => Promise<string>>()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const preview = vi.spyOn(lightbox, "openImageLightbox");
      try {
        const { view } = renderCard(source({ src: "blob:card" }), resolveFull);
        fireEvent.click(view.getByRole("button", { name: "Open image preview" }));
        if (change === "replacement")
          view.rerender(
            <AppProvider>
              <ImageCard source={source({ src: "blob:other" })} />
            </AppProvider>,
          );
        if (change === "unmount") view.unmount();
        if (change === "thread change") {
          context.threadId = "other-thread";
          view.rerender(
            <AppProvider>
              <ImageCard source={source({ src: "blob:card" })} resolveFullSrc={resolveFull} />
            </AppProvider>,
          );
        }
        if (change === "newer modal") {
          lightbox.openImageLightbox([{ src: "blob:other" }], 0);
          lightbox.closeImageLightbox();
        }
        if (change === "latest click")
          fireEvent.click(view.getByRole("button", { name: "Open image preview" }));
        preview.mockClear();
        await act(async () => first.resolve("blob:full-original"));
        expect(preview).not.toHaveBeenCalled();
        if (change === "latest click") {
          await act(async () => second.resolve("blob:full-current"));
        }
        expect(preview.mock.calls).toEqual(
          change === "latest click"
            ? [
                [
                  [
                    {
                      src: "blob:full-current",
                      alt: "A screenshot",
                      mime: "image/png",
                      fileName: "shot.png",
                    },
                  ],
                  0,
                ],
              ]
            : [],
        );
      } finally {
        context.threadId = "thread";
        lightbox.closeImageLightbox();
        preview.mockRestore();
      }
    },
  );

  it("copies and downloads original bytes instead of the displayed card", async () => {
    const full = source({ src: "blob:full-resolution", fileName: "original.png" });
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const copyBytes = vi.spyOn(imageActions, "toClipboardPngBytes").mockResolvedValue(bytes);
    const fetchBytes = vi.spyOn(imageActions, "fetchImageBytes").mockResolvedValue(bytes);
    const copy = vi
      .fn<ReturnType<typeof bridge.readBridge>["copyImageToClipboard"]>()
      .mockResolvedValue(true);
    const save = vi
      .fn<ReturnType<typeof bridge.readBridge>["saveImageFile"]>()
      .mockResolvedValue(null);
    const read = vi
      .spyOn(bridge, "readBridge")
      .mockReturnValue({ copyImageToClipboard: copy, saveImageFile: save } as unknown as ReturnType<
        typeof bridge.readBridge
      >);
    try {
      const { view } = renderCard({ ...full, src: "blob:display-card" }, async () => full.src);
      await act(async () => {
        fireEvent.click(view.getByRole("button", { name: "Copy image" }));
        fireEvent.click(view.getByRole("button", { name: "Download image" }));
      });
      expect(copyBytes).toHaveBeenCalledExactlyOnceWith(full);
      expect(fetchBytes).toHaveBeenCalledExactlyOnceWith(full.src);
      expect(copy).toHaveBeenCalledExactlyOnceWith({ data: bytes });
      expect(save).toHaveBeenCalledExactlyOnceWith({ data: bytes, suggestedName: full.fileName });
    } finally {
      copyBytes.mockRestore();
      fetchBytes.mockRestore();
      read.mockRestore();
    }
  });

  it("keeps pending image previews inactive until the image bytes resolve", () => {
    const preview = vi.spyOn(lightbox, "openImageLightbox").mockImplementation(() => undefined);
    vi.mocked(openThreadGallery).mockClear();
    try {
      const { view } = renderCard(source({ src: "", pending: true, preview: PREVIEW }));
      const button = view.getByRole("button", { name: "Open image preview" });
      expect(button).toBeDisabled();
      expect(view.container.querySelector("img")).toBeNull();
      expect(view.container.querySelector("[style*='background-image']")).not.toBeNull();
      fireEvent.click(button);
      expect(preview).not.toHaveBeenCalled();
      expect(openThreadGallery).not.toHaveBeenCalled();
      const resolved = source({ src: "blob:resolved" });
      view.rerender(
        <AppProvider>
          <ImageCard source={resolved} />
        </AppProvider>,
      );
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(preview).toHaveBeenCalledWith(
        [
          {
            src: resolved.src,
            alt: resolved.alt,
            mime: resolved.mime,
            fileName: resolved.fileName,
          },
        ],
        0,
      );
    } finally {
      preview.mockRestore();
    }
  });

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
    // The preview sits underneath the image; React's load handler must not
    // delay painting bytes the browser has already decoded.
    expect(img).not.toHaveClass("opacity-0");
    expect(img).not.toHaveClass("transition-opacity");

    fireEvent.load(img);
    preview = view.container.querySelector("[aria-hidden='true'][style*='background-image']");
    expect(preview).toBeNull();
    expect(img).not.toHaveClass("opacity-0");
    expect(img).not.toHaveClass("transition-opacity");
  });

  it.each(["blob:cached-image", "https://desktop.test/image"])(
    "keeps %s visible before load events, including after a thread remount",
    (src) => {
      const imageSource = source({ src });
      const { view, img, preview } = renderCard(imageSource);
      expect(preview).toBeNull();
      const paintClasses = img.className;
      expect(img).not.toHaveClass("opacity-0");
      expect(img).not.toHaveClass("transition-opacity");
      fireEvent.load(img);
      expect(img.className).toBe(paintClasses);
      view.unmount();

      // Reopening must not hide the image while its new load event is pending.
      const reopened = renderCard(imageSource);
      expect(reopened.img.className).toBe(paintClasses);
    },
  );

  it("shows an inline data image immediately — no fade, no flash", () => {
    const { img, preview } = renderCard(source({ src: "data:image/png;base64,QQ==" }));
    expect(preview).toBeNull();
    expect(img).not.toHaveClass("opacity-0");
    expect(img).not.toHaveClass("transition-opacity");
  });

  it("drops the stand-in if the image fails to load", () => {
    const { view, img } = renderCard(source({ preview: PREVIEW }));
    fireEvent.error(img);
    expect(
      view.container.querySelector("[aria-hidden='true'][style*='background-image']"),
    ).toBeNull();
    expect(img).not.toHaveClass("opacity-0");
    expect(img).not.toHaveClass("transition-opacity");
  });

  it("replaces only the image on URL changes so pending replacements cannot retain old pixels", () => {
    const { view, img } = renderCard(source({ preview: PREVIEW }));
    const card = img.closest('[data-poracode-image-card="true"]');
    const button = img.parentElement;
    const slot = img.getAttribute("style");
    fireEvent.load(img);
    const paintClasses = img.className;
    let previousImage = img;
    for (const nextSource of [
      source({ src: "blob:replacement", preview: PREVIEW }),
      source({ src: "data:image/png;base64,QQ==" }),
      source({ preview: PREVIEW }),
    ]) {
      view.rerender(
        <AppProvider>
          <ImageCard source={nextSource} />
        </AppProvider>,
      );
      const image = view.container.querySelector("img")!;
      expect(image).not.toBe(previousImage);
      expect(previousImage).not.toBeInTheDocument();
      expect(image.closest('[data-poracode-image-card="true"]')).toBe(card);
      expect(image.parentElement).toBe(button);
      expect(image).toHaveAttribute("src", nextSource.src);
      expect(image.className).toBe(paintClasses);
      fireEvent.load(previousImage);
      expect(image.getAttribute("style")).toBe(nextSource.src.startsWith("data:") ? null : slot);
      expect(view.container.querySelector("[style*='background-image']") !== null).toBe(
        Boolean(nextSource.preview),
      );
      fireEvent.load(image);
      expect(view.container.querySelector("[style*='background-image']")).toBeNull();
      expect(image.className).toBe(paintClasses);
      previousImage = image;
    }
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
