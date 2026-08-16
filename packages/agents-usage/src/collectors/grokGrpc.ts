/**
 * Minimal gRPC-web + protobuf reader for Grok's credits config. The grok.com
 * endpoint is private and undocumented, so this parser intentionally extracts
 * only the stable-looking scalars we need for the usage ring.
 */

export const GROK_GRPC_ENDPOINT =
  "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";

/**
 * The same empty frame, base64-encoded for the `grpc-web-text` variant.
 *
 * grok.com's edge no longer accepts the binary `application/grpc-web+proto`
 * form of this call: it answers `grpc-status: 13` / "Missing request message."
 * for identical bytes, with or without credentials. The base64 text form of the
 * exact same frame is accepted — an unauthenticated probe reaches the handler
 * and comes back `grpc-status: 16` / "No credentials presented." — so that is
 * the form we send.
 */
export const GROK_GRPC_EMPTY_FRAME_BASE64 = "AAAAAAA=";

export interface GrokBilling {
  usedPercent: number;
  resetsAt?: number;
  /** Billing period start, when the message carries one (field 4). */
  periodStartsAt?: number;
}

export type GrokGrpcBillingResult =
  | { kind: "ok"; billing: GrokBilling }
  | { kind: "unauthenticated" }
  /**
   * `detail` is the short, non-sensitive summary shown on the usage card;
   * `debug` carries the wire dump for the host's logger, which is where a
   * protocol change should be diagnosed from.
   */
  | { kind: "invalid"; detail?: string; debug?: Record<string, unknown> };

/** A `float`/`double` field, in document order. */
interface FloatField {
  path: number[];
  value: number;
  order: number;
}

interface VarintField {
  path: number[];
  value: number;
}

interface ProtoScan {
  /** `float` (wire type 5) and `double` (wire type 1) fields share one list. */
  floatFields: FloatField[];
  varintFields: VarintField[];
}

function emptyScan(): ProtoScan {
  return { floatFields: [], varintFields: [] };
}

function mergeScan(target: ProtoScan, source: ProtoScan): void {
  target.floatFields.push(...source.floatFields);
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
  // One view per message rather than one per numeric field.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);

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
      // A percent field declared `double` rather than `float` lands here, so read
      // it instead of skipping the eight bytes. Non-percent fixed64s (timestamps,
      // ids) decode to absurd doubles and are dropped by the 0..100 filter below.
      scan.floatFields.push({
        path: fieldPath,
        value: view.getFloat64(cursor.index, true),
        order: nextOrder,
      });
      nextOrder += 1;
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
      scan.floatFields.push({
        path: fieldPath,
        value: view.getFloat32(cursor.index, true),
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

/** Lower-case header names once; `grpc-*` values are percent-decoded in place. */
function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.trim().toLowerCase();
    const trimmed = value.trim();
    fields[normalized] = normalized.startsWith("grpc-")
      ? decodeURIComponent(trimmed)
      : trimmed.toLowerCase();
  }
  return fields;
}

function grpcStatusResult(fields: Record<string, string>): GrokGrpcBillingResult | undefined {
  const rawStatus = fields["grpc-status"];
  if (rawStatus === undefined) return undefined;
  const status = Number.parseInt(rawStatus, 10);
  if (!Number.isFinite(status) || status === 0) return undefined;
  if (status === 16) return { kind: "unauthenticated" };
  const message = fields["grpc-message"]?.slice(0, 120).trim();
  return { kind: "invalid", detail: `grpc ${status}${message ? `: ${message}` : ""}` };
}

function pathEquals(path: readonly number[], expected: readonly number[]): boolean {
  return path.length === expected.length && path.every((value, index) => value === expected[index]);
}

function extractCreditsBilling(frames: Uint8Array[], nowMs: number): GrokBilling | undefined {
  if (frames.length === 0) return undefined;

  const scan = emptyScan();
  for (const frame of frames) {
    mergeScan(scan, scanProtobuf(frame, 0).scan);
  }

  const usedPercent = scan.floatFields
    .filter((field) => {
      const last = field.path[field.path.length - 1];
      return last === 1 && Number.isFinite(field.value) && field.value >= 0 && field.value <= 100;
    })
    .sort((a, b) =>
      a.path.length === b.path.length ? a.order - b.order : a.path.length - b.path.length,
    )
    .at(0)?.value;

  const nowSec = nowMs / 1000;
  const stamps = scan.varintFields.filter(
    (field) => field.value >= 1_700_000_000 && field.value <= 2_100_000_000,
  );
  const earliest = (fields: VarintField[]): number | undefined =>
    fields.reduce<number | undefined>(
      (best, field) => (best === undefined || field.value < best ? field.value : best),
      undefined,
    );

  const future = stamps.filter((field) => field.value > nowSec);
  const reset =
    earliest(future.filter((field) => pathEquals(field.path, [1, 5, 1]))) ?? earliest(future);

  // Billing period start (field 4 of the config), which unlike the reset is in
  // the past. Used to label the cycle rather than infer it from the reset alone.
  const periodStart = stamps
    .filter((field) => field.value <= nowSec && pathEquals(field.path, [1, 4, 1]))
    .reduce<number | undefined>(
      (best, field) => (best === undefined || field.value > best ? field.value : best),
      undefined,
    );

  // proto3 omits zero-valued scalars, so a config with no percent field at all is
  // reporting 0% — a freshly reset billing period looks exactly like this. Only
  // trust that reading when the message carried a period, and when no percent
  // field was present to be misread.
  const noPercentField = scan.floatFields.length === 0;
  const hasPeriod = reset !== undefined || periodStart !== undefined;
  const percent = usedPercent ?? (noPercentField && hasPeriod ? 0 : undefined);
  if (percent === undefined) return undefined;

  return {
    usedPercent: percent,
    ...(reset !== undefined ? { resetsAt: reset * 1000 } : {}),
    ...(periodStart !== undefined ? { periodStartsAt: periodStart * 1000 } : {}),
  };
}

/** Upper bound on the hex dump handed to the host logger. */
const GROK_HEX_DUMP_LIMIT_BYTES = 256;

/**
 * Decode a `grpc-web-text` body (base64-encoded frames) into raw frame bytes.
 *
 * Proxies differ on how they encode the stream: Connect base64s it as a whole,
 * while Envoy-style intermediaries base64 each frame separately, leaving interior
 * `=` padding. A single `Buffer.from(body, "base64")` truncates at that padding
 * and drops every frame after the first, so decode segment by segment.
 */
function decodeGrpcWebText(body: string | undefined): Uint8Array | undefined {
  const cleaned = body?.replace(/\s+/gu, "");
  if (!cleaned || !/^[A-Za-z0-9+/=]+$/u.test(cleaned)) return undefined;
  const segments = cleaned.match(/[A-Za-z0-9+/]+={0,2}/gu);
  if (!segments?.length) return undefined;
  const bytes = new Uint8Array(
    Buffer.concat(segments.map((segment) => Buffer.from(segment, "base64"))),
  );
  return bytes.length >= 5 ? bytes : undefined;
}

/**
 * Classify an unparseable body: a short shape summary for the usage card, plus
 * an optional wire dump for the host logger. The summary reports shape only —
 * size, content-type, and which family the payload looks like — never content.
 */
function describeUnparseableBody(input: {
  raw: Uint8Array;
  body?: string;
  contentType: string;
  decoded?: Uint8Array;
}): { detail: string; debug?: Record<string, unknown> } {
  const suffix = input.contentType ? `, ${input.contentType}` : "";
  if (input.raw.length === 0) return { detail: `empty body${suffix}` };

  const size = `(${input.raw.length}B${suffix})`;
  const head = (input.body ?? "").trimStart().slice(0, 1);
  if (head === "<") return { detail: `html body (bot challenge?) ${size}` };
  if (head === "{" || head === "[") return { detail: `json body ${size}` };

  const shape = input.decoded
    ? "base64 frames without usage fields"
    : /^[A-Za-z0-9+/=\s]+$/u.test(input.body ?? "")
      ? "undecodable base64 body"
      : "unparseable frames";

  // A protobuf shape change is undiagnosable without the bytes, so hand a bounded
  // hex dump to the logger. This endpoint returns billing scalars only — no
  // credentials — and text bodies (which could hold account details) never reach
  // here, having returned above.
  const frames = input.decoded ?? input.raw;
  const detail = `${shape} ${size}`;
  return frames.length > GROK_HEX_DUMP_LIMIT_BYTES
    ? { detail }
    : {
        detail,
        debug: {
          bytes: frames.length,
          contentType: input.contentType,
          hex: Buffer.from(frames).toString("hex"),
        },
      };
}

export function parseGrokGrpcBillingResponse(input: {
  headers: Record<string, string>;
  body?: string;
  bodyBytes?: Uint8Array;
  nowMs: number;
}): GrokGrpcBillingResult {
  const headers = lowercaseHeaders(input.headers);
  const headerStatus = grpcStatusResult(headers);
  if (headerStatus) return headerStatus;

  // A `grpc-web-text` request may be answered in either form, so try both
  // encodings — content-type only decides which one to try first. Trailer status
  // is consulted after both, so a misread of the wrong encoding cannot mask a
  // parseable payload in the right one.
  const raw = input.bodyBytes ?? Buffer.from(input.body ?? "", "binary");
  const decoded = decodeGrpcWebText(input.body);
  const contentType = headers["content-type"] ?? "";
  const prefersText = contentType.includes("grpc-web-text");
  const candidates = (prefersText ? [decoded, raw] : [raw, decoded]).filter(
    (bytes): bytes is Uint8Array => bytes !== undefined && bytes.length > 0,
  );

  let trailerStatus: GrokGrpcBillingResult | undefined;
  for (const bytes of candidates) {
    const billing = extractCreditsBilling(grpcWebDataFrames(bytes), input.nowMs);
    if (billing) return { kind: "ok", billing };
    trailerStatus ??= grpcStatusResult(grpcWebTrailerFields(bytes));
  }
  return (
    trailerStatus ?? {
      kind: "invalid",
      ...describeUnparseableBody({
        raw,
        contentType,
        ...(decoded !== undefined ? { decoded } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
      }),
    }
  );
}
