import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageCard } from "./ImageCard";
import type { ImageViewSource } from "./imageViewSource";

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
});

describe("reserved slot", () => {
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
