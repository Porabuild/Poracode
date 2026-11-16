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

export type ImageDimensionProbeResult =
  | { readonly status: "settled"; readonly dimensions: ImageDimensions | undefined }
  | { readonly status: "need_more"; readonly fallback: ImageDimensions | undefined };

const EXTENDED_HEADER_PREFIX_BYTES = 32_768;

function initialPrefixBudgetForMime(mime: string): number {
  switch (mime) {
    case "image/gif":
      return 16;
    case "image/webp":
      return 32;
    case "image/png":
      return 1_024;
    case "image/jpeg":
      return 4_096;
    default:
      return 0;
  }
}

export function readImageDimensions(
  value: string,
  classification: InlineImageClassification,
): { width: number; height: number } | undefined {
  if (classification.mime === "image/svg+xml") return readSvgDimensions(value, classification);
  const initialBudget = initialPrefixBudgetForMime(classification.mime);
  if (initialBudget === 0) return undefined;
  const startOffset = resolveBase64BodyOffset(value, classification);
  if (startOffset < 0) return undefined;
  const first = decodeBase64Prefix(value, startOffset, initialBudget);
  if (!first) return undefined;
  const probe = probeImageDimensionsFromBytes(
    first.bytes,
    classification.mime,
    first.hasMoreSource,
  );
  if (probe.status === "settled") return probe.dimensions;
  const extended = decodeBase64Prefix(value, startOffset, EXTENDED_HEADER_PREFIX_BYTES);
  if (!extended) return probe.fallback;
  return readImageDimensionsFromBytes(extended.bytes, classification.mime) ?? probe.fallback;
}

export function readImageDimensionsFromBytes(
  bytes: Uint8Array,
  mime: string,
): ImageDimensions | undefined {
  const result = probeImageDimensionsFromBytes(bytes, mime, false);
  return result.status === "settled" ? result.dimensions : result.fallback;
}

export function probeImageDimensionsFromBytes(
  bytes: Uint8Array,
  mime: string,
  isTruncatedPrefix: boolean,
): ImageDimensionProbeResult {
  switch (mime) {
    case "image/png":
      return probePngDimensions(bytes, isTruncatedPrefix);
    case "image/jpeg":
      return probeJpegDimensions(bytes, isTruncatedPrefix);
    case "image/gif":
      return { status: "settled", dimensions: readGifDimensions(bytes) };
    case "image/webp":
      return probeWebpDimensions(bytes, isTruncatedPrefix);
    default:
      return { status: "settled", dimensions: undefined };
  }
}

function resolveBase64BodyOffset(value: string, classification: InlineImageClassification): number {
  if (classification.kind === "base64") return 0;
  if (classification.kind !== "dataUrl") return -1;
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return -1;
  return value.slice(0, commaIndex).toLowerCase().includes(";base64") ? commaIndex + 1 : -1;
}

const uint8FromBase64 = (Uint8Array as unknown as { fromBase64?: (input: string) => Uint8Array })
  .fromBase64;
const nodeBuffer = (
  globalThis as unknown as {
    Buffer?: { from(input: string, encoding: "base64"): Uint8Array };
  }
).Buffer;

function decodeBase64Prefix(
  value: string,
  startOffset: number,
  byteCount: number,
): { readonly bytes: Uint8Array; readonly hasMoreSource: boolean } | undefined {
  const targetChars = Math.ceil(byteCount / 3) * 4;
  const directEnd = Math.min(value.length, startOffset + targetChars);
  let hasWhitespace = false;
  for (let i = startOffset; i < directEnd; i += 1) {
    if (value.charCodeAt(i) <= 32) {
      hasWhitespace = true;
      break;
    }
  }
  let slice: string;
  let hasMoreSource: boolean;
  if (!hasWhitespace) {
    slice = value.slice(startOffset, directEnd);
    hasMoreSource = directEnd < value.length;
  } else {
    let collected = "";
    let cursor = startOffset;
    while (cursor < value.length && collected.length < targetChars) {
      const code = value.charCodeAt(cursor);
      if (code > 32) {
        let runEnd = cursor + 1;
        const maxRun = cursor + (targetChars - collected.length);
        const bound = Math.min(value.length, maxRun);
        while (runEnd < bound && value.charCodeAt(runEnd) > 32) runEnd += 1;
        collected += value.slice(cursor, runEnd);
        cursor = runEnd;
      } else {
        cursor += 1;
      }
    }
    slice = collected;
    hasMoreSource = cursor < value.length;
  }
  if (slice.length === 0) return undefined;
  const padded = slice.padEnd(Math.ceil(slice.length / 4) * 4, "=");
  try {
    if (nodeBuffer) {
      const bytes = nodeBuffer.from(padded, "base64");
      return bytes.length > 0 ? { bytes, hasMoreSource } : undefined;
    }
    if (uint8FromBase64) {
      const bytes = uint8FromBase64(padded);
      return bytes.length > 0 ? { bytes, hasMoreSource } : undefined;
    }
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out.length > 0 ? { bytes: out, hasMoreSource } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True for an animated PNG. Decoders such as libvips report APNG as a single
 * page; its animation control chunk precedes the first image-data chunk.
 */
export function isAnimatedPng(bytes: Uint8Array): boolean {
  for (let offset = 8; offset + 12 <= bytes.length; offset += 12 + readUint32BE(bytes, offset)) {
    const chunk = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (chunk === "acTL") return true;
    if (chunk === "IDAT") return false;
  }
  return false;
}

function probePngDimensions(
  bytes: Uint8Array,
  isTruncatedPrefix: boolean,
): ImageDimensionProbeResult {
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
    return { status: "settled", dimensions: undefined };
  }
  const dimensions = readPositiveDimensions(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
  if (!dimensions) return { status: "settled", dimensions: undefined };
  for (let offset = 8; offset + 8 <= bytes.length;) {
    const length = readUint32BE(bytes, offset);
    const c0 = bytes[offset + 4];
    const c1 = bytes[offset + 5];
    const c2 = bytes[offset + 6];
    const c3 = bytes[offset + 7];
    if (
      (c0 === 0x49 && c1 === 0x44 && c2 === 0x41 && c3 === 0x54) ||
      (c0 === 0x49 && c1 === 0x45 && c2 === 0x4e && c3 === 0x44)
    ) {
      return { status: "settled", dimensions };
    }
    if (c0 === 0x65 && c1 === 0x58 && c2 === 0x49 && c3 === 0x66) {
      if (isTruncatedPrefix && offset + 8 + length > bytes.length) {
        return { status: "need_more", fallback: dimensions };
      }
      const dataEnd = Math.min(bytes.length, offset + 8 + length);
      return {
        status: "settled",
        dimensions: applyExifOrientation(
          dimensions,
          readExifOrientation(bytes.subarray(offset + 8, dataEnd)),
        ),
      };
    }
    if (length > 0x7fffffff) return { status: "settled", dimensions };
    if (offset + 12 + length > bytes.length) {
      return isTruncatedPrefix
        ? { status: "need_more", fallback: dimensions }
        : { status: "settled", dimensions };
    }
    offset += 12 + length;
  }
  return isTruncatedPrefix
    ? { status: "need_more", fallback: dimensions }
    : { status: "settled", dimensions };
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

function probeJpegDimensions(
  bytes: Uint8Array,
  isTruncatedPrefix: boolean,
): ImageDimensionProbeResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { status: "settled", dimensions: undefined };
  }
  let offset = 2;
  let dimensions: { width: number; height: number } | undefined;
  let orientation: number | undefined;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    if (marker === undefined) break;
    offset += 1;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xda || marker === 0xd9) {
      return { status: "settled", dimensions: applyExifOrientation(dimensions, orientation) };
    }
    if (offset + 2 > bytes.length) break;
    const length = readUint16BE(bytes, offset);
    if (length < 2) {
      return { status: "settled", dimensions: applyExifOrientation(dimensions, orientation) };
    }
    const segmentEnd = Math.min(bytes.length, offset + length);
    if (
      marker === 0xe1 &&
      orientation === undefined &&
      segmentEnd >= offset + 8 &&
      bytes[offset + 2] === 0x45 &&
      bytes[offset + 3] === 0x78 &&
      bytes[offset + 4] === 0x69 &&
      bytes[offset + 5] === 0x66 &&
      bytes[offset + 6] === 0x00 &&
      bytes[offset + 7] === 0x00
    ) {
      orientation = readExifOrientation(bytes.subarray(offset + 2, segmentEnd));
      if (orientation === undefined && isTruncatedPrefix && offset + length > bytes.length) {
        return { status: "need_more", fallback: dimensions };
      }
    } else if (
      isJpegStartOfFrame(marker) &&
      dimensions === undefined &&
      offset + 7 <= bytes.length
    ) {
      dimensions = readPositiveDimensions(
        readUint16BE(bytes, offset + 5),
        readUint16BE(bytes, offset + 3),
      );
    }
    if (dimensions !== undefined && orientation !== undefined) {
      return { status: "settled", dimensions: applyExifOrientation(dimensions, orientation) };
    }
    if (offset + length > bytes.length) break;
    offset += length;
  }
  const resolved = applyExifOrientation(dimensions, orientation);
  return isTruncatedPrefix
    ? { status: "need_more", fallback: resolved }
    : { status: "settled", dimensions: resolved };
}

function probeWebpDimensions(
  bytes: Uint8Array,
  isTruncatedPrefix: boolean,
): ImageDimensionProbeResult {
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
    return { status: "settled", dimensions: undefined };
  }
  const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunk === "VP8X") {
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    const dimensions = readPositiveDimensions(width, height);
    if (!dimensions || (bytes[20]! & 0x08) === 0) {
      return { status: "settled", dimensions };
    }
    const vp8xSize = readUint32LE(bytes, 16);
    let offset = 20 + vp8xSize + (vp8xSize & 1);
    while (offset + 8 <= bytes.length) {
      const subSize = readUint32LE(bytes, offset + 4);
      if (
        bytes[offset] === 0x45 &&
        bytes[offset + 1] === 0x58 &&
        bytes[offset + 2] === 0x49 &&
        bytes[offset + 3] === 0x46
      ) {
        if (isTruncatedPrefix && offset + 8 + subSize > bytes.length) {
          return { status: "need_more", fallback: dimensions };
        }
        const dataEnd = Math.min(bytes.length, offset + 8 + subSize);
        return {
          status: "settled",
          dimensions: applyExifOrientation(
            dimensions,
            readExifOrientation(bytes.subarray(offset + 8, dataEnd)),
          ),
        };
      }
      if (subSize > 0x7fffffff) return { status: "settled", dimensions };
      const padded = subSize + (subSize & 1);
      if (offset + 8 + padded > bytes.length) {
        return isTruncatedPrefix
          ? { status: "need_more", fallback: dimensions }
          : { status: "settled", dimensions };
      }
      offset += 8 + padded;
    }
    return isTruncatedPrefix
      ? { status: "need_more", fallback: dimensions }
      : { status: "settled", dimensions };
  }
  if (chunk === "VP8L") {
    const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
    const height = 1 + ((bytes[22]! & 0xc0) >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10);
    return { status: "settled", dimensions: readPositiveDimensions(width, height) };
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = readUint16LE(bytes, 26) & 0x3fff;
    const height = readUint16LE(bytes, 28) & 0x3fff;
    return { status: "settled", dimensions: readPositiveDimensions(width, height) };
  }
  return { status: "settled", dimensions: undefined };
}

function readExifOrientation(bytes: Uint8Array): number | undefined {
  const hasExifHeader =
    bytes.length >= 6 &&
    bytes[0] === 0x45 &&
    bytes[1] === 0x78 &&
    bytes[2] === 0x69 &&
    bytes[3] === 0x66 &&
    bytes[4] === 0x00 &&
    bytes[5] === 0x00;
  const tiff = hasExifHeader ? bytes.subarray(6) : bytes;
  if (tiff.length < 8) return undefined;
  let littleEndian: boolean;
  if (tiff[0] === 0x49 && tiff[1] === 0x49) littleEndian = true;
  else if (tiff[0] === 0x4d && tiff[1] === 0x4d) littleEndian = false;
  else return undefined;
  if (readTiffUint16(tiff, 2, littleEndian) !== 0x002a) return undefined;
  const ifdOffset = readTiffUint32(tiff, 4, littleEndian);
  if (ifdOffset < 8 || ifdOffset + 2 > tiff.length) return undefined;
  const entryCount = readTiffUint16(tiff, ifdOffset, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > tiff.length) break;
    if (readTiffUint16(tiff, entryOffset, littleEndian) !== 0x0112) continue;
    const type = readTiffUint16(tiff, entryOffset + 2, littleEndian);
    const count = readTiffUint32(tiff, entryOffset + 4, littleEndian);
    if (count !== 1) return undefined;
    const value =
      type === 3
        ? readTiffUint16(tiff, entryOffset + 8, littleEndian)
        : type === 4
          ? readTiffUint32(tiff, entryOffset + 8, littleEndian)
          : 0;
    return value >= 1 && value <= 8 ? value : undefined;
  }
  return undefined;
}

function applyExifOrientation(
  dimensions: { width: number; height: number } | undefined,
  orientation: number | undefined,
) {
  if (!dimensions) return undefined;
  return orientation !== undefined && orientation >= 5 && orientation <= 8
    ? { width: dimensions.height, height: dimensions.width }
    : dimensions;
}

function readTiffUint16(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset);
}

function readTiffUint32(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset);
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

function readUint32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]! +
    (bytes[offset + 1]! << 8) +
    (bytes[offset + 2]! << 16) +
    bytes[offset + 3]! * 0x1000000
  );
}
