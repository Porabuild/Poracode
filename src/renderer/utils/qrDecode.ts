/**
 * One QR decode path for every surface that reads a pairing code — the live
 * camera scanner and the photo picker alike.
 *
 * Two engines sit behind the same call. `BarcodeDetector` is the fast path
 * (Android Chrome, desktop Chromium): it decodes off the main thread and takes
 * a video element or bitmap directly. iOS Safari ships no such API, so there we
 * rasterize the frame ourselves and decode it with jsQR. Without that fallback
 * QR pairing is simply impossible on iPhone, which is the platform most likely
 * to be scanning in the first place.
 *
 * jsQR is imported lazily so the browsers that never need it don't pay for it
 * in the initial bundle.
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<readonly { readonly rawValue?: string }[]>;
}

type BarcodeDetectorCtor = new (options?: {
  readonly formats?: readonly string[];
}) => BarcodeDetectorLike;

function nativeDetector(): BarcodeDetectorLike | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ["qr_code"] });
  } catch {
    // Present but refusing the qr_code format — treat as absent.
    return null;
  }
}

export interface QrDecoder {
  /**
   * Reads one frame. Returns the decoded text, or null when this frame holds no
   * QR code — callers scanning video are expected to simply try the next frame.
   */
  decode(source: CanvasImageSource, width: number, height: number): Promise<string | null>;
}

/**
 * Creates a decoder bound to one engine for its whole lifetime. Instantiate it
 * once per scanning session rather than per frame: constructing a
 * `BarcodeDetector` is not free, and the lazy jsQR import resolves once.
 */
export function createQrDecoder(): QrDecoder {
  const detector = nativeDetector();
  // Reused across frames — allocating a canvas per frame at 60fps churns memory.
  let canvas: HTMLCanvasElement | null = null;
  let jsQrModule: Promise<typeof import("jsqr")> | null = null;

  if (detector) {
    return {
      async decode(source) {
        const results = await detector.detect(source);
        return results.find((result) => result.rawValue)?.rawValue ?? null;
      },
    };
  }

  return {
    async decode(source, width, height) {
      if (width <= 0 || height <= 0) return null;
      canvas ??= document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(source, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      jsQrModule ??= import("jsqr");
      const { default: jsQR } = await jsQrModule;
      // `dontInvert` keeps per-frame cost predictable; the desktop renders dark
      // modules on light, which is the orientation jsQR reads without inverting.
      return jsQR(image.data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
    },
  };
}
