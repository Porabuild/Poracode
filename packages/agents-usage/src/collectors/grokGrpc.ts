/**
 * Minimal gRPC-web + protobuf reader for Grok's credits config. The grok.com
 * endpoint is private and undocumented, so this parser intentionally extracts
 * only the stable-looking scalars we need for the usage ring.
 */

export const GROK_GRPC_ENDPOINT =
  "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";

/** Empty unary gRPC-web frame: [flag=0x00, len=0x00000000]. */
export const GROK_GRPC_EMPTY_FRAME_BYTES = new Uint8Array([0, 0, 0, 0, 0]);

export interface GrokBilling {
  usedPercent: number;
  resetsAt?: number;
}

export type GrokGrpcBillingResult =
  | { kind: "ok"; billing: GrokBilling }
  | { kind: "unauthenticated" }
  | { kind: "invalid" };

interface Fixed32Field {
  path: number[];
  value: number;
  order: number;
}

interface VarintField {
  path: number[];
  value: number;
}

interface ProtoScan {
  fixed32Fields: Fixed32Field[];
  varintFields: VarintField[];
}

function emptyScan(): ProtoScan {
  return { fixed32Fields: [], varintFields: [] };
}

function mergeScan(target: ProtoScan, source: ProtoScan): void {
  target.fixed32Fields.push(...source.fixed32Fields);
  target.varintFields.push(...source.varintFields);
}

function readVarint(bytes: Uint8Array, cursor: { index: number }): bigint | undefined {
  let shift = 0n;
  let value = 0n;
  while (cursor.index < bytes.length && shift < 64n) {
    const byte = bytes[cursor.index++]!;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7n;
  }
  return undefined;
}

function scanProtobuf(
  bytes: Uint8Array,
  depth: number,
  path: number[] = [],
  order = 0,
): { scan: ProtoScan; order: number } {
  const scan = emptyScan();
  const cursor = { index: 0 };
  let nextOrder = order;

  while (cursor.index < bytes.length) {
    const fieldStart = cursor.index;
    const key = readVarint(bytes, cursor);
    if (key === undefined || key === 0n) {
      cursor.index = fieldStart + 1;
      continue;
    }

    const fieldNumber = Number(key >> 3n);
    const wireType = Number(key & 0x07n);
    const fieldPath = [...path, fieldNumber];

    if (wireType === 0) {
      const value = readVarint(bytes, cursor);
      if (value === undefined) {
        cursor.index = fieldStart + 1;
        continue;
      }
      scan.varintFields.push({ path: fieldPath, value: Number(value) });
      continue;
    }

    if (wireType === 1) {
      if (cursor.index + 8 > bytes.length) break;
      cursor.index += 8;
      continue;
    }

    if (wireType === 2) {
      const length = readVarint(bytes, cursor);
      if (length === undefined || length > BigInt(bytes.length - cursor.index)) {
        cursor.index = fieldStart + 1;
        continue;
      }
      const start = cursor.index;
      const end = start + Number(length);
      if (depth < 4) {
        const nested = scanProtobuf(bytes.subarray(start, end), depth + 1, fieldPath, nextOrder);
        mergeScan(scan, nested.scan);
        nextOrder = nested.order;
      }
      cursor.index = end;
      continue;
    }

    if (wireType === 5) {
      if (cursor.index + 4 > bytes.length) break;
      const view = new DataView(bytes.buffer, bytes.byteOffset + cursor.index, 4);
      scan.fixed32Fields.push({
        path: fieldPath,
        value: view.getFloat32(0, true),
        order: nextOrder,
      });
      nextOrder += 1;
      cursor.index += 4;
      continue;
    }

    cursor.index = fieldStart + 1;
  }

  return { scan, order: nextOrder };
}

/** Walk the 5-byte-prefixed gRPC-web frames, yielding each frame's flags + payload. */
function* iterateGrpcWebFrames(
  bytes: Uint8Array,
): Generator<{ flags: number; payload: Uint8Array }> {
  let index = 0;
  while (index + 5 <= bytes.length) {
    const flags = bytes[index]!;
    const length =
      (bytes[index + 1]! << 24) |
      (bytes[index + 2]! << 16) |
      (bytes[index + 3]! << 8) |
      bytes[index + 4]!;
    const start = index + 5;
    const end = start + length;
    if (length < 0 || end > bytes.length) break;
    yield { flags, payload: bytes.subarray(start, end) };
    index = end;
  }
}

function grpcWebDataFrames(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  // Bit 0x80 marks a trailer frame; the data frames are everything else.
  for (const { flags, payload } of iterateGrpcWebFrames(bytes)) {
    if ((flags & 0x80) === 0) frames.push(payload);
  }
  return frames;
}

function grpcWebTrailerFields(bytes: Uint8Array): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const { flags, payload } of iterateGrpcWebFrames(bytes)) {
    if ((flags & 0x80) === 0) continue;
    const text = Buffer.from(payload).toString("utf8");
    for (const line of text.split(/\r?\n/u)) {
      if (!line) continue;
      const separator = line.indexOf(":");
      if (separator === -1) continue;
      const key = line.slice(0, separator).trim().toLowerCase();
      const rawValue = line.slice(separator + 1).trim();
      fields[key] = decodeURIComponent(rawValue);
    }
  }
  return fields;
}

function normalizeGrpcHeaderFields(headers: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.trim().toLowerCase();
    if (!normalized.startsWith("grpc-")) continue;
    fields[normalized] = decodeURIComponent(value.trim());
  }
  return fields;
}

function grpcStatusResult(fields: Record<string, string>): GrokGrpcBillingResult | undefined {
  const rawStatus = fields["grpc-status"];
  if (rawStatus === undefined) return undefined;
  const status = Number.parseInt(rawStatus, 10);
  if (!Number.isFinite(status) || status === 0) return undefined;
  return status === 16 ? { kind: "unauthenticated" } : { kind: "invalid" };
}

function pathEquals(path: readonly number[], expected: readonly number[]): boolean {
  return path.length === expected.length && path.every((value, index) => value === expected[index]);
}

function pathStartsWith(path: readonly number[], prefix: readonly number[]): boolean {
  return prefix.every((value, index) => path[index] === value);
}

function extractCreditsBilling(frames: Uint8Array[], nowMs: number): GrokBilling | undefined {
  if (frames.length === 0) return undefined;

  const scan = emptyScan();
  for (const frame of frames) {
    mergeScan(scan, scanProtobuf(frame, 0).scan);
  }

  const usedPercent = scan.fixed32Fields
    .filter((field) => {
      const last = field.path[field.path.length - 1];
      return last === 1 && Number.isFinite(field.value) && field.value >= 0 && field.value <= 100;
    })
    .sort((a, b) =>
      a.path.length === b.path.length ? a.order - b.order : a.path.length - b.path.length,
    )
    .at(0)?.value;

  const nowSec = nowMs / 1000;
  const resetCandidates = scan.varintFields
    .filter((field) => field.value >= 1_700_000_000 && field.value <= 2_100_000_000)
    .filter((field) => field.value > nowSec);
  const reset =
    resetCandidates
      .filter((field) => pathEquals(field.path, [1, 5, 1]))
      .map((field) => field.value)
      .sort((a, b) => a - b)[0] ??
    resetCandidates.map((field) => field.value).sort((a, b) => a - b)[0];

  const noUsageYet =
    usedPercent === undefined &&
    scan.fixed32Fields.length === 0 &&
    reset !== undefined &&
    scan.varintFields.some((field) => pathStartsWith(field.path, [1, 6]));
  const percent = usedPercent ?? (noUsageYet ? 0 : undefined);
  if (percent === undefined) return undefined;

  return {
    usedPercent: percent,
    ...(reset !== undefined ? { resetsAt: reset * 1000 } : {}),
  };
}

export function parseGrokGrpcBillingResponse(input: {
  headers: Record<string, string>;
  body?: string;
  bodyBytes?: Uint8Array;
  nowMs: number;
}): GrokGrpcBillingResult {
  const headerStatus = grpcStatusResult(normalizeGrpcHeaderFields(input.headers));
  if (headerStatus) return headerStatus;

  const bytes = input.bodyBytes ?? Buffer.from(input.body ?? "", "binary");
  const trailerStatus = grpcStatusResult(grpcWebTrailerFields(bytes));
  if (trailerStatus) return trailerStatus;

  const billing = extractCreditsBilling(grpcWebDataFrames(bytes), input.nowMs);
  return billing ? { kind: "ok", billing } : { kind: "invalid" };
}
