/**
 * Intrinsic image dimensions read from an image's own header bytes.
 *
 * Lives in `shared` because two processes need it: the renderer reads dimensions
 * out of an inline base64 payload, and the host reads them while replacing that
 * payload with a reference so the timeline can still reserve layout without
 * fetching the image first.
 *
 * Every reader inspects only a short prefix — never the whole (multi-megabyte)
 * image — and returns `undefined` rather than throwing on anything unrecognized.
 */

import type { InlineImageClassification } from "./inlineImagePayload";

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export function readImageDimensions(
  value: string,
  classification: InlineImageClassification,
): { width: number; height: number } | undefined {
  if (classification.mime === "image/svg+xml") return readSvgDimensions(value, classification);
  const bytes = readBase64BytesPrefix(value, classification, 8192);
  if (!bytes) return undefined;
  switch (classification.mime) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
    case "image/gif":
      return readGifDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
    default:
      return undefined;
  }
}

function readBase64BytesPrefix(
  value: string,
  classification: InlineImageClassification,
  byteCount: number,
): Uint8Array | undefined {
  const base64 =
    classification.kind === "dataUrl"
      ? readBase64DataUrlBody(value)
      : classification.kind === "base64"
        ? value
        : null;
  if (!base64) return undefined;
  const clean = base64.replace(/\s+/g, "");
  if (clean.length === 0) return undefined;
  const chars = Math.ceil(byteCount / 3) * 4;
  const slice = clean.slice(0, chars);
  const padded = slice.padEnd(Math.ceil(slice.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

function readBase64DataUrlBody(value: string): string | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  return value.slice(0, commaIndex).toLowerCase().includes(";base64")
    ? value.slice(commaIndex + 1)
    : null;
}

function readPngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return undefined;
  }
  return readPositiveDimensions(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

function readGifDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x38
  ) {
    return undefined;
  }
  return readPositiveDimensions(readUint16LE(bytes, 6), readUint16LE(bytes, 8));
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) break;
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > bytes.length) break;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (isJpegStartOfFrame(marker)) {
      return readPositiveDimensions(
        readUint16BE(bytes, offset + 5),
        readUint16BE(bytes, offset + 3),
      );
    }
    offset += length;
  }
  return undefined;
}

function readWebpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return undefined;
  }
  const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunk === "VP8X") {
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    return readPositiveDimensions(width, height);
  }
  if (chunk === "VP8L") {
    const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
    const height = 1 + ((bytes[22]! & 0xc0) >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10);
    return readPositiveDimensions(width, height);
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = readUint16LE(bytes, 26) & 0x3fff;
    const height = readUint16LE(bytes, 28) & 0x3fff;
    return readPositiveDimensions(width, height);
  }
  return undefined;
}

function readSvgDimensions(value: string, classification: InlineImageClassification) {
  const svg =
    classification.kind === "rawSvg"
      ? value
      : classification.kind === "dataUrl"
        ? readTextDataUrlBody(value)
        : null;
  if (!svg) return undefined;
  const width = readSvgLength(svg, "width");
  const height = readSvgLength(svg, "height");
  if (width && height) return { width, height };
  const viewBox = /\bviewBox\s*=\s*["']\s*[-.\d]+\s+[-.\d]+\s+([.\d]+)\s+([.\d]+)/i.exec(svg);
  if (!viewBox) return undefined;
  return readPositiveDimensions(Number(viewBox[1]), Number(viewBox[2]));
}

function readTextDataUrlBody(value: string): string | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const body = value.slice(commaIndex + 1);
  if (value.slice(0, commaIndex).toLowerCase().includes(";base64")) {
    try {
      return atob(body);
    } catch {
      return null;
    }
  }
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}

function readSvgLength(svg: string, attr: "width" | "height") {
  const match = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([.\\d]+)`, "i").exec(svg);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function isJpegStartOfFrame(marker: number) {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

function readPositiveDimensions(width: number, height: number) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! << 8) + bytes[offset + 1]!;
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset]! + (bytes[offset + 1]! << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]! * 0x1000000 +
    ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!)
  );
}
