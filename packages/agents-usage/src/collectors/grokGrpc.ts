/**
 * Minimal gRPC-web (text) + protobuf reader for Grok's billing config, the path
 * codexbar uses: POST grok.com `GetGrokBuildBillingConfig` authenticated by the
 * grok.com browser session cookie. We frame an empty request, send it base64
 * (`application/grpc-web-text`, which keeps the HostPort's string body contract),
 * and parse the response protobuf "enough to recover used percent and reset".
 *
 * The protobuf has no field names on the wire, so extraction is heuristic and
 * documented; it is validated against a live capture + codexbar field-by-field.
 */

export const GROK_GRPC_ENDPOINT =
  "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokBuildBillingConfig";

/** Base64 of the empty gRPC-web frame: [flag=0x00, len=0x00000000]. */
export const GROK_GRPC_EMPTY_FRAME_B64 = "AAAAAAA=";

export interface ProtoField {
  field: number;
  type: "varint" | "i64" | "i32" | "len";
  /** varint → bigint; i64/i32 → number(double/float); len → Uint8Array. */
  value: bigint | number | Uint8Array;
}

/** Decode a protobuf message body into a flat list of top-level fields. */
export function decodeProto(buf: Uint8Array): ProtoField[] {
  const out: ProtoField[] = [];
  let i = 0;
  const readVarint = (): bigint => {
    let shift = 0n;
    let result = 0n;
    while (i < buf.length) {
      const b = buf[i++]!;
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7n;
    }
    return result;
  };
  while (i < buf.length) {
    const tag = readVarint();
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (field <= 0) break;
    if (wire === 0) {
      out.push({ field, type: "varint", value: readVarint() });
    } else if (wire === 2) {
      const len = Number(readVarint());
      if (len < 0 || i + len > buf.length) break;
      out.push({ field, type: "len", value: buf.subarray(i, i + len) });
      i += len;
    } else if (wire === 5) {
      const dv = new DataView(buf.buffer, buf.byteOffset + i, 4);
      out.push({ field, type: "i32", value: dv.getFloat32(0, true) });
      i += 4;
    } else if (wire === 1) {
      const dv = new DataView(buf.buffer, buf.byteOffset + i, 8);
      out.push({ field, type: "i64", value: dv.getFloat64(0, true) });
      i += 8;
    } else {
      break;
    }
  }
  return out;
}

/** Strip gRPC-web frames from a base64 (grpc-web-text) body; return the message frame bytes. */
export function unframeGrpcWebText(base64Body: string): Uint8Array | undefined {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(base64Body.trim(), "base64"));
  } catch {
    return undefined;
  }
  let i = 0;
  while (i + 5 <= bytes.length) {
    const flag = bytes[i]!;
    const len =
      (bytes[i + 1]! << 24) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 8) | bytes[i + 4]!;
    const start = i + 5;
    const end = start + len;
    if (end > bytes.length) break;
    // flag bit 0x80 marks the trailer frame; the data frame is flag 0x00.
    if ((flag & 0x80) === 0) return bytes.subarray(start, end);
    i = end;
  }
  return undefined;
}

export interface GrokBilling {
  used?: number;
  limit?: number;
  resetsAt?: number;
  /** Billing-period start (epoch ms); used to label the cycle. */
  periodStartMs?: number;
}

/** Debug aid for finalizing the field mapping against a live capture. */
export function debugGrokScalars(message: Uint8Array): Array<{ path: string; num: number }> {
  const out: Scalar[] = [];
  flattenScalars(message, [], out, 0);
  return out.map((s) => ({ path: s.path.join("."), num: s.num }));
}

/** Read the numeric leaf at a field-number path (e.g. [1,2,1]) or undefined. */
function readProtoNumberPath(buf: Uint8Array, path: readonly number[]): number | undefined {
  let fields = decodeProto(buf);
  for (let i = 0; i < path.length; i++) {
    const f = fields.find((x) => x.field === path[i]);
    if (!f) return undefined;
    if (i === path.length - 1) {
      if (f.type === "varint") return Number(f.value as bigint);
      if (f.type === "i64" || f.type === "i32") return f.value as number;
      return undefined;
    }
    if (f.type !== "len") return undefined;
    fields = decodeProto(f.value as Uint8Array);
  }
  return undefined;
}

/** A scalar value flattened with the path of field numbers that reached it. */
interface Scalar {
  path: number[];
  num: number;
}

/**
 * Confirmed `GetGrokBuildBillingConfig` field map (validated live against a
 * SuperGrok account showing 25% used, resets May 31):
 *   field 1 = config message
 *     1.1.1 = monthlyLimit.val   1.2.1 = used.val   1.3.1 = onDemandCap.val
 *     1.4.1 = billingPeriodStart (epoch s)   1.5.1 = billingPeriodEnd (epoch s)
 *     1.6   = history[] (repeated)
 */
const GROK_PATH = {
  limit: [1, 1, 1],
  used: [1, 2, 1],
  periodStart: [1, 4, 1],
  periodEnd: [1, 5, 1],
} as const;

function flattenScalars(buf: Uint8Array, path: number[], out: Scalar[], depth: number): void {
  if (depth > 6) return;
  for (const f of decodeProto(buf)) {
    const here = [...path, f.field];
    if (f.type === "varint") out.push({ path: here, num: Number(f.value) });
    else if (f.type === "i64" || f.type === "i32") out.push({ path: here, num: f.value as number });
    else if (f.type === "len") {
      const bytes = f.value as Uint8Array;
      // Recurse into anything that looks like a nested message; ignore strings.
      if (bytes.length > 1 && bytes.length < buf.length)
        flattenScalars(bytes, here, out, depth + 1);
    }
  }
}

/**
 * Extract used/limit credits and the reset timestamp from the decoded billing
 * message by exact field path (see `GROK_PATH`). Timestamps are epoch seconds on
 * the wire and converted to ms. `nowMs` is unused now that the mapping is exact,
 * but kept for signature stability with the collector.
 */
export function extractGrokBilling(message: Uint8Array, _nowMs: number): GrokBilling {
  const toMs = (sec: number | undefined): number | undefined =>
    sec !== undefined && sec > 0 ? sec * 1000 : undefined;
  const limit = readProtoNumberPath(message, GROK_PATH.limit);
  const used = readProtoNumberPath(message, GROK_PATH.used);
  const resetsAt = toMs(readProtoNumberPath(message, GROK_PATH.periodEnd));
  const periodStartMs = toMs(readProtoNumberPath(message, GROK_PATH.periodStart));
  return {
    ...(used !== undefined ? { used } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
    ...(periodStartMs !== undefined ? { periodStartMs } : {}),
  };
}
