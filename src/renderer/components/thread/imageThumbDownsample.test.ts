import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coverCropRect,
  downsampleLoadedImage,
  isRasterDownsampleCandidate,
  nextDownsampleSize,
  shouldDownsample,
  thumbPixelSize,
} from "./imageThumbDownsample";

describe("coverCropRect", () => {
  it("crops the sides of a wider source to match the destination aspect", () => {
    // 1920×1080 (16:9) into 96×64 (3:2) — keep full height, clip left/right.
    expect(coverCropRect(1920, 1080, 96, 64)).toEqual({
      sx: 150,
      sy: 0,
      sw: 1620,
      sh: 1080,
    });
  });

  it("crops the top and bottom of a taller source", () => {
    expect(coverCropRect(800, 1200, 96, 64)).toEqual({
      sx: 0,
      sy: 334,
      sw: 800,
      sh: 533,
    });
  });

  it("keeps a matching aspect intact", () => {
    expect(coverCropRect(1920, 1280, 96, 64)).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1280,
    });
  });
});

describe("thumbPixelSize", () => {
  it("rounds the CSS box to device pixels", () => {
    expect(thumbPixelSize(96, 64, 2)).toEqual({ width: 192, height: 128 });
    expect(thumbPixelSize(96, 64, 1.5)).toEqual({ width: 144, height: 96 });
  });

  it("treats a missing or invalid DPR as 1×", () => {
    expect(thumbPixelSize(96, 64, 0)).toEqual({ width: 96, height: 64 });
    expect(thumbPixelSize(96, 64, Number.NaN)).toEqual({ width: 96, height: 64 });
  });
});

describe("shouldDownsample", () => {
  it("is true when the cover crop is larger than the tile", () => {
    expect(shouldDownsample(1920, 1080, 192, 128)).toBe(true);
  });

  it("is false when the source would be upsampled", () => {
    expect(shouldDownsample(32, 32, 192, 128)).toBe(false);
  });

  it("is false for empty boxes", () => {
    expect(shouldDownsample(1920, 1080, 0, 64)).toBe(false);
  });
});

describe("isRasterDownsampleCandidate", () => {
  it("skips vectors and animated GIFs", () => {
    expect(isRasterDownsampleCandidate("https://x.test/icon.svg")).toBe(false);
    expect(isRasterDownsampleCandidate("data:image/svg+xml;utf8,<svg/>")).toBe(false);
    expect(isRasterDownsampleCandidate("https://x.test/spin.gif")).toBe(false);
    expect(isRasterDownsampleCandidate("data:image/gif;base64,AAA")).toBe(false);
  });

  it("accepts ordinary rasters", () => {
    expect(isRasterDownsampleCandidate("https://x.test/shot.png")).toBe(true);
    expect(isRasterDownsampleCandidate("data:image/png;base64,AAA")).toBe(true);
    expect(isRasterDownsampleCandidate("poracode-local://local/C:/tmp/a.webp")).toBe(true);
  });
});

describe("nextDownsampleSize", () => {
  it("halves while staying at or above the destination", () => {
    expect(nextDownsampleSize(1620, 1080, 192, 128)).toEqual({ width: 810, height: 540 });
    expect(nextDownsampleSize(810, 540, 192, 128)).toEqual({ width: 405, height: 270 });
    expect(nextDownsampleSize(405, 270, 192, 128)).toEqual({ width: 203, height: 135 });
    expect(nextDownsampleSize(203, 135, 192, 128)).toEqual({ width: 192, height: 128 });
    expect(nextDownsampleSize(192, 128, 192, 128)).toBeNull();
  });
});

describe("downsampleLoadedImage", () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => "blob:thumb-1");
    URL.revokeObjectURL = vi.fn<(url: string) => void>();
  });

  afterEach(() => {
    if (originalCreateImageBitmap) {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    } else {
      Reflect.deleteProperty(globalThis, "createImageBitmap");
    }
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  function fakeBitmap(width: number, height: number): ImageBitmap {
    return { width, height, close: vi.fn<() => void>() } as unknown as ImageBitmap;
  }

  function stubCreateImageBitmap(impl?: typeof createImageBitmap) {
    const create = vi.fn<typeof createImageBitmap>(impl);
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      writable: true,
      value: create,
    });
    return create;
  }

  function loadedImage(
    overrides: {
      src?: string;
      naturalWidth?: number;
      naturalHeight?: number;
      width?: number;
      height?: number;
    } = {},
  ): HTMLImageElement {
    const img = document.createElement("img");
    Object.defineProperty(img, "src", {
      configurable: true,
      value: overrides.src ?? "https://x.test/shot.png",
    });
    Object.defineProperty(img, "currentSrc", {
      configurable: true,
      value: overrides.src ?? "https://x.test/shot.png",
    });
    Object.defineProperty(img, "naturalWidth", {
      configurable: true,
      value: overrides.naturalWidth ?? 1920,
    });
    Object.defineProperty(img, "naturalHeight", {
      configurable: true,
      value: overrides.naturalHeight ?? 1080,
    });
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      width: overrides.width ?? 96,
      height: overrides.height ?? 64,
      top: 0,
      left: 0,
      bottom: overrides.height ?? 64,
      right: overrides.width ?? 96,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    return img;
  }

  it("returns null when ImageBitmap is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "createImageBitmap");
    await expect(downsampleLoadedImage(loadedImage())).resolves.toBeNull();
  });

  it("returns null for an already-small source", async () => {
    const create = stubCreateImageBitmap();
    await expect(
      downsampleLoadedImage(loadedImage({ naturalWidth: 32, naturalHeight: 32 })),
    ).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns null for SVG sources", async () => {
    const create = stubCreateImageBitmap();
    await expect(
      downsampleLoadedImage(loadedImage({ src: "https://x.test/icon.svg" })),
    ).resolves.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("emits a blob URL for a high-res raster", async () => {
    const originalOffscreen = globalThis.OffscreenCanvas;
    Reflect.deleteProperty(globalThis, "OffscreenCanvas");
    stubCreateImageBitmap(
      async (
        _source: ImageBitmapSource,
        sxOrOptions?: number | ImageBitmapOptions,
        _sy?: number,
        sw?: number,
        sh?: number,
        options?: ImageBitmapOptions,
      ) => {
        const resize = options ?? (typeof sxOrOptions === "object" ? sxOrOptions : undefined);
        if (resize?.resizeWidth && resize.resizeHeight) {
          return fakeBitmap(resize.resizeWidth, resize.resizeHeight);
        }
        if (typeof sw === "number" && typeof sh === "number") {
          return fakeBitmap(sw, sh);
        }
        return fakeBitmap(1920, 1080);
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn<(image: CanvasImageSource, dx: number, dy: number) => void>(),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback?.(new Blob(["thumb"], { type: "image/png" }));
    });
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });

    try {
      await expect(downsampleLoadedImage(loadedImage())).resolves.toBe("blob:thumb-1");
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
    } finally {
      if (originalOffscreen) globalThis.OffscreenCanvas = originalOffscreen;
    }
  });

  it("returns null when decode or resize throws", async () => {
    stubCreateImageBitmap(async () => {
      throw new Error("tainted");
    });
    await expect(downsampleLoadedImage(loadedImage())).resolves.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
