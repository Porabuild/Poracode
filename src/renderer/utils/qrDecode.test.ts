import { afterEach, describe, expect, it, vi } from "vitest";
import { createQrDecoder } from "./qrDecode";

const jsQR = vi.hoisted(() => vi.fn<(...args: unknown[]) => { data: string } | null>());

vi.mock("jsqr", () => ({ default: jsQR }));

interface DetectResult {
  readonly rawValue?: string;
}

/** Installs a `BarcodeDetector` for the duration of a test. */
function stubBarcodeDetector(detect: () => Promise<readonly DetectResult[]>) {
  Object.defineProperty(globalThis, "BarcodeDetector", {
    configurable: true,
    writable: true,
    value: class {
      detect = detect;
    },
  });
}

function removeBarcodeDetector() {
  Reflect.deleteProperty(globalThis as object, "BarcodeDetector");
}

/**
 * jsdom's canvas has no 2d context, so the jsQR path needs one stubbed. Records
 * the size the frame was rasterized at so the downscale can be asserted.
 */
function stubCanvasContext() {
  const drawImage = vi.fn<(...args: unknown[]) => void>();
  const getImageData = vi.fn<
    (x: number, y: number, width: number, height: number) => Partial<ImageData>
  >((_x, _y, width, height) => ({
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    getImageData,
  } as unknown as CanvasRenderingContext2D);
  return { drawImage, getImageData };
}

const SOURCE = {} as CanvasImageSource;

describe("createQrDecoder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    jsQR.mockReset();
    removeBarcodeDetector();
  });

  it("decodes through the native detector when the browser ships one", async () => {
    stubBarcodeDetector(() => Promise.resolve([{ rawValue: "pairing-link" }]));

    await expect(createQrDecoder().decode(SOURCE, 640, 480)).resolves.toBe("pairing-link");
    expect(jsQR).not.toHaveBeenCalled();
  });

  it("reports no code when the native detector finds nothing usable", async () => {
    stubBarcodeDetector(() => Promise.resolve([{}]));

    await expect(createQrDecoder().decode(SOURCE, 640, 480)).resolves.toBeNull();
  });

  it("falls back to jsQR where there is no native detector — the iOS Safari path", async () => {
    removeBarcodeDetector();
    const context = stubCanvasContext();
    jsQR.mockReturnValue({ data: "pairing-link" });

    await expect(createQrDecoder().decode(SOURCE, 320, 240)).resolves.toBe("pairing-link");
    expect(context.drawImage).toHaveBeenCalledWith(SOURCE, 0, 0, 320, 240);
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 320, 240, {
      inversionAttempts: "dontInvert",
    });
  });

  it("reports no code when jsQR finds nothing", async () => {
    removeBarcodeDetector();
    stubCanvasContext();
    jsQR.mockReturnValue(null);

    await expect(createQrDecoder().decode(SOURCE, 320, 240)).resolves.toBeNull();
  });

  it("skips empty frames rather than rasterizing a zero-sized canvas", async () => {
    removeBarcodeDetector();
    const context = stubCanvasContext();

    await expect(createQrDecoder().decode(SOURCE, 0, 0)).resolves.toBeNull();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(jsQR).not.toHaveBeenCalled();
  });

  it("reuses one canvas across frames instead of allocating per decode", async () => {
    removeBarcodeDetector();
    stubCanvasContext();
    jsQR.mockReturnValue(null);
    const created = vi.spyOn(document, "createElement");
    const decoder = createQrDecoder();

    await decoder.decode(SOURCE, 320, 240);
    await decoder.decode(SOURCE, 320, 240);
    await decoder.decode(SOURCE, 320, 240);

    // Cast: the spy resolves to createElement's narrowest overload, so the tag
    // parameter is not plain `string` here.
    expect(created.mock.calls.filter(([tag]) => (tag as string) === "canvas")).toHaveLength(1);
  });
});
