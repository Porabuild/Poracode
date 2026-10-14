import { HEAD_CHARS } from "./runtimeStreamCap";
import { RUNTIME_STREAM_HEAD_BLOCK_CHARS } from "./runtimeStreamHeadSchema";

export interface RuntimeStreamHeadCounters {
  readonly head_chars: number;
  /** Escaped content only, excluding the JSON string's surrounding quotes. */
  readonly head_wire_bytes: number;
  readonly head_json_units: number;
  readonly head_has_content: 0 | 1;
  readonly head_last_unit: number;
}

/** Scalar authority; no stream text is held by a metadata record. */
export interface RuntimeStreamHeadMetadata extends RuntimeStreamHeadCounters {
  readonly head_id: number;
  readonly thread_id: string;
  readonly item_id: string;
  readonly stream_key: string;
  readonly stream_order: number;
  readonly seed_chars: number;
  readonly next_seq: number;
  readonly open_seq: number | null;
  readonly open_chars: number;
}

export const RUNTIME_STREAM_HEAD_METADATA_COLUMNS =
  "head_id, thread_id, item_id, stream_key, stream_order, seed_chars, head_chars, " +
  "next_seq, open_seq, open_chars, head_wire_bytes, head_json_units, head_has_content, head_last_unit";

/** JSON string keys preserve lone surrogate units across SQLite TEXT bindings. */
export function encodeRuntimeStreamKey(stream: string): string {
  return JSON.stringify(stream);
}

export function decodeRuntimeStreamKey(key: string): string {
  const decoded: unknown = JSON.parse(key);
  if (typeof decoded !== "string" || encodeRuntimeStreamKey(decoded) !== key) {
    throw new Error("Invalid runtime stream head key.");
  }
  return decoded;
}

/** Inherited property behavior belongs to the existing exceptional writer path. */
export function isRuntimeStreamHeadKeyEligible(stream: string): boolean {
  return !(stream in Object.prototype);
}

/** Only proven ordinary seeds enter the indexed path; other shapes stay legacy. */
export function isRuntimeStreamHeadSeed(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([key, text]) =>
      isRuntimeStreamHeadKeyEligible(key) &&
      typeof text === "string" &&
      text.length <= HEAD_CHARS + 1,
  );
}

export function runtimeStreamHeadCounters(text: string): RuntimeStreamHeadCounters {
  const quoted = JSON.stringify(text);
  return {
    head_chars: text.length,
    head_wire_bytes: Buffer.byteLength(quoted, "utf8") - 2,
    head_json_units: quoted.length - 2,
    head_has_content: text.trim().length > 0 ? 1 : 0,
    head_last_unit: text.length > 0 ? text.charCodeAt(text.length - 1) : -1,
  };
}

/** Measure only the accepted delta, repairing a pair joined across appends. */
export function appendRuntimeStreamHeadCounters(
  previous: RuntimeStreamHeadCounters,
  addition: string,
): RuntimeStreamHeadCounters {
  if (addition.length === 0) return previous;
  const incoming = runtimeStreamHeadCounters(addition);
  const first = addition.charCodeAt(0);
  const joinsPair =
    previous.head_last_unit >= 0xd800 &&
    previous.head_last_unit <= 0xdbff &&
    first >= 0xdc00 &&
    first <= 0xdfff;
  return {
    head_chars: previous.head_chars + incoming.head_chars,
    // Separately escaped halves use 12 bytes/units; the joined pair uses 4/2.
    head_wire_bytes: previous.head_wire_bytes + incoming.head_wire_bytes - (joinsPair ? 8 : 0),
    head_json_units: previous.head_json_units + incoming.head_json_units - (joinsPair ? 10 : 0),
    head_has_content: previous.head_has_content || incoming.head_has_content ? 1 : 0,
    head_last_unit: incoming.head_last_unit,
  };
}

function integerInRange(
  value: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

export function assertRuntimeStreamHeadMetadata(head: RuntimeStreamHeadMetadata): void {
  const blockChars = head.head_chars - head.seed_chars;
  const partialChars = blockChars % RUNTIME_STREAM_HEAD_BLOCK_CHARS;
  if (
    !integerInRange(head.head_id, 1) ||
    typeof head.thread_id !== "string" ||
    typeof head.item_id !== "string" ||
    typeof head.stream_key !== "string" ||
    !integerInRange(head.stream_order, 0) ||
    !integerInRange(head.head_chars, 0, HEAD_CHARS + 1) ||
    !integerInRange(head.seed_chars, 0, head.head_chars) ||
    !integerInRange(head.next_seq, 0) ||
    head.next_seq !== Math.ceil(blockChars / RUNTIME_STREAM_HEAD_BLOCK_CHARS) ||
    !integerInRange(head.open_chars, 0, RUNTIME_STREAM_HEAD_BLOCK_CHARS - 1) ||
    (head.open_seq === null
      ? head.open_chars !== 0
      : !integerInRange(head.open_seq, 0) ||
        head.open_seq !== head.next_seq - 1 ||
        head.open_chars === 0) ||
    !integerInRange(head.head_wire_bytes, 0, head.head_chars * 6) ||
    !integerInRange(head.head_json_units, 0, head.head_chars * 6) ||
    (head.head_has_content !== 0 && head.head_has_content !== 1) ||
    (head.head_chars === 0
      ? head.head_last_unit !== -1 ||
        head.head_wire_bytes !== 0 ||
        head.head_json_units !== 0 ||
        head.head_has_content !== 0
      : !integerInRange(head.head_last_unit, 0, 0xffff)) ||
    (head.head_chars >= HEAD_CHARS && head.open_seq !== null) ||
    (head.head_chars < HEAD_CHARS &&
      (partialChars > 0 ? head.open_chars !== partialChars : head.open_seq !== null))
  ) {
    throw new Error("Invalid runtime stream head metadata.");
  }
  decodeRuntimeStreamKey(head.stream_key);
}

export function assertRuntimeStreamHeadBlock(block: {
  readonly chars: number;
  readonly data: Buffer;
}): void {
  if (
    !integerInRange(block.chars, 1, RUNTIME_STREAM_HEAD_BLOCK_CHARS) ||
    !Buffer.isBuffer(block.data) ||
    block.data.length !== block.chars * 2
  ) {
    throw new Error("Invalid runtime stream head block.");
  }
}
