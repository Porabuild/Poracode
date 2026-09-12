import { createQrDecoder } from "./qrDecode";

/**
 * Decodes a QR code from a user-picked photo or screenshot. Returns null when no
 * QR code is found in the image.
 *
 * Shares its engines with the live scanner via `createQrDecoder`, so a browser
 * without `BarcodeDetector` — iOS Safari — decodes through jsQR here too. This
 * used to return null outright on those browsers, which silently turned the
 * photo-pairing path into a dead end on every iPhone.
 */
export async function decodeQrImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    return await createQrDecoder().decode(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
