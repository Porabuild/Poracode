/**
 * Best-effort reader for the Cursor SDK's local checkpoint store.
 *
 * The public `@cursor/sdk` API only reports billed per-turn token usage. The
 * context-window occupancy the Cursor app shows (used/max plus the
 * system-prompt/tools/rules/skills/MCP/subagents/conversation breakdown) lives
 * in the SDK's private local store: `~/.cursor/projects/<ref>/sdk-agent-store/
 * <md5(ref)>/` with one SQLite DB per agent holding protobuf checkpoint blobs
 * (`agent.v1.ConversationState.token_details`, observed in SDK 1.0.2x).
 *
 * This reader mirrors that layout read-only. Every step is guarded — a
 * missing directory, a locked WAL database, or a reshaped protobuf degrades to
 * `undefined`; the session continues with public spend events and leaves
 * context occupancy unavailable.
 */

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { withReadonlyDb } from "../../runtime/sqliteRead";

export interface CursorSdkContextCategory {
  id: string;
  label: string;
  tokens: number;
}

export interface CursorSdkContextUsage {
  usedTokens: number;
  maxTokens?: number | undefined;
  categories: CursorSdkContextCategory[];
}

export interface CursorSdkContextUsageInput {
  cwd: string;
  agentId: string;
  stateRoot?: string | undefined;
  homeDir?: string | undefined;
}

export function cursorSdkStateRoot(cwd: string, homeDir: string = homedir()): string {
  // Mirrors the SDK's default store location for a workspace ref (raw cwd).
  const sanitized = cwd
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const digest = createHash("md5").update(cwd).digest("hex");
  return join(homeDir, ".cursor", "projects", sanitized, "sdk-agent-store", digest);
}

export async function readCursorSdkContextUsage(
  input: CursorSdkContextUsageInput,
): Promise<CursorSdkContextUsage | undefined> {
  const stateRoot = input.stateRoot ?? cursorSdkStateRoot(input.cwd, input.homeDir);
  const blobId = await withReadonlyDb(join(stateRoot, "index.db"), (db) => {
    const row = db
      .prepare("SELECT latest_checkpoint_ref_json FROM agents WHERE agent_id = ?")
      .get(input.agentId) as { latest_checkpoint_ref_json?: string | null } | undefined;
    if (!row?.latest_checkpoint_ref_json) return undefined;
    const parsed = JSON.parse(row.latest_checkpoint_ref_json) as { blobId?: string };
    return parsed.blobId;
  }).catch(() => undefined);
  if (!blobId) return undefined;

  const agentDir = `agent-${createHash("sha256").update(input.agentId).digest("hex")}`;
  const blob = await withReadonlyDb(join(stateRoot, "agents", agentDir, "store.db"), (db) => {
    const row = db.prepare("SELECT data FROM blobs WHERE id = ?").get(blobId) as
      | { data?: Uint8Array | null }
      | undefined;
    return row?.data ? new Uint8Array(row.data) : undefined;
  }).catch(() => undefined);
  if (!blob) return undefined;

  try {
    return decodeConversationStateContextUsage(blob);
  } catch {
    return undefined;
  }
}

function decodeConversationStateContextUsage(blob: Uint8Array): CursorSdkContextUsage | undefined {
  for (const field of protoFields(blob)) {
    // ConversationState.token_details
    if (field.fieldNo !== 5 || !field.bytes) continue;
    return decodeTokenDetails(field.bytes);
  }
  return undefined;
}

function decodeTokenDetails(bytes: Uint8Array): CursorSdkContextUsage | undefined {
  let usedTokens: number | undefined;
  let maxTokens: number | undefined;
  const categories: CursorSdkContextCategory[] = [];
  for (const field of protoFields(bytes)) {
    if (field.fieldNo === 1 && field.value !== undefined) usedTokens = field.value;
    else if (field.fieldNo === 2 && field.value !== undefined) maxTokens = field.value;
    else if (field.fieldNo === 3 && field.bytes) {
      for (const category of protoFields(field.bytes)) {
        if (category.fieldNo === 3 && category.bytes) {
          const decoded = decodeCategory(category.bytes);
          if (decoded && decoded.tokens > 0) categories.push(decoded);
        }
      }
    }
  }
  if (usedTokens === undefined || usedTokens <= 0) return undefined;
  return {
    usedTokens,
    ...(maxTokens !== undefined && maxTokens > 0 ? { maxTokens } : {}),
    categories,
  };
}

function decodeCategory(bytes: Uint8Array): CursorSdkContextCategory | undefined {
  let id = "";
  let label = "";
  let tokens = 0;
  for (const field of protoFields(bytes)) {
    if (field.fieldNo === 1 && field.bytes) id = utf8(field.bytes);
    else if (field.fieldNo === 2 && field.bytes) label = utf8(field.bytes);
    else if (field.fieldNo === 3 && field.value !== undefined) tokens = field.value;
  }
  if (!id && !label) return undefined;
  return { id: id || label, label: label || id, tokens };
}

interface ProtoField {
  fieldNo: number;
  value?: number | undefined;
  bytes?: Uint8Array | undefined;
}

/** Lenient protobuf walker: varint (wire 0) and length-delimited (wire 2) only. */
function protoFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const [key, afterKey] = readVarint(bytes, offset);
    offset = afterKey;
    const fieldNo = Number(key >> 3n);
    const wireType = Number(key & 7n);
    if (wireType === 0) {
      const [value, afterValue] = readVarint(bytes, offset);
      offset = afterValue;
      fields.push({ fieldNo, value: Number(value) });
    } else if (wireType === 2) {
      const [length, afterLength] = readVarint(bytes, offset);
      offset = afterLength;
      const size = Number(length);
      if (offset + size > bytes.length) throw new Error("Truncated protobuf field.");
      fields.push({ fieldNo, bytes: bytes.subarray(offset, offset + size) });
      offset += size;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}.`);
    }
  }
  return fields;
}

function readVarint(bytes: Uint8Array, offset: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let index = offset;
  for (;;) {
    const byte = bytes[index];
    if (byte === undefined) throw new Error("Truncated varint.");
    index += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 63n) throw new Error("Varint overflow.");
  }
  return [result, index];
}

function utf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}
