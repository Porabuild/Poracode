/**
 * Decodes a QR code from a user-picked photo or screenshot using the native
 * `BarcodeDetector` where the browser ships one. Returns null when the API is
 * unavailable or no QR code is found in the image.
 */
export async function decodeQrImageFile(file: File): Promise<string | null> {
  const BarcodeDetector = (
    globalThis as typeof globalThis & {
      BarcodeDetector?: new (options?: { formats?: string[] }) => {
        detect(source: ImageBitmapSource): Promise<readonly { rawValue?: string }[]>;
      };
    }
  ).BarcodeDetector;
  if (!BarcodeDetector) return null;

  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const bitmap = await createImageBitmap(file);
  try {
    const results = await detector.detect(bitmap);
    return results.find((result) => result.rawValue)?.rawValue ?? null;
  } finally {
    bitmap.close();
  }
}
