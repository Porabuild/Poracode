import type {
  RuntimePayloadProjectionContext,
  RuntimePayloadProjectionSpec,
} from "@/shared/runtimePayloadProjection";
import { readCodexChangesDiffSummary } from "./fileChangeDiffSummary";

/** Stable normalized-payload format capability; independent of session/profile routing. */
export const PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY = "codex.file-change/v1";
const MAX_CHANGES_PER_SOURCE = 64;
const MAX_INSPECTED_DIFF_UNITS = 256 * 1024;
const MAX_STORED_JSON_UNITS = 512 * 1024;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

interface AddChange {
  readonly path: string;
  readonly kind: { readonly type: "add" };
  readonly diff: string;
}
function completeAddSource(
  value: unknown,
  work: { units: number },
): readonly AddChange[] | undefined {
  const source = record(value);
  if (!source || source.truncated === true || source.elided === true || source.omitted === true)
    return undefined;
  const changes = source.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES_PER_SOURCE)
    return undefined;
  for (const change of changes) {
    const row = record(change),
      kind = record(row?.kind);
    if (
      !row ||
      kind?.type !== "add" ||
      typeof row.path !== "string" ||
      row.path.length === 0 ||
      typeof row.diff !== "string" ||
      row.diff.length === 0 ||
      row.truncated === true ||
      row.elided === true ||
      row.omitted === true
    )
      return undefined;
    work.units += row.diff.length + row.path.length;
    if (work.units > MAX_INSPECTED_DIFF_UNITS || row.path.trim().length === 0) return undefined;
  }
  return changes as AddChange[];
}

export function normalizePersistedRuntimePayload(
  payload: unknown,
  context: RuntimePayloadProjectionContext,
): unknown {
  if (
    context.itemType !== "file_change" ||
    context.streamsElided ||
    !Number.isSafeInteger(context.storedJsonUnits) ||
    context.storedJsonUnits < 0 ||
    context.storedJsonUnits > MAX_STORED_JSON_UNITS
  )
    return payload;
  const value = record(payload),
    summary = record(value?.diffSummary);
  if (
    !value ||
    value.changeKind !== "create" ||
    typeof value.path !== "string" ||
    !summary ||
    !Number.isSafeInteger(summary.added) ||
    !Number.isSafeInteger(summary.removed) ||
    (summary.added as number) < 0 ||
    (summary.removed as number) < 0 ||
    value.truncated === true ||
    value.elided === true ||
    value.omitted === true
  )
    return payload;
  const work = { units: value.path.length };
  if (work.units > MAX_INSPECTED_DIFF_UNITS) return payload;
  const hasResult = Object.hasOwn(value, "result");
  const changes = completeAddSource(hasResult ? value.result : value.args, work);
  if (!changes || changes[0]!.path.trim() !== value.path.trim()) return payload;
  if (hasResult && Object.hasOwn(value, "args")) {
    const prior = completeAddSource(value.args, work);
    if (
      !prior ||
      prior.length !== changes.length ||
      prior.some(
        (change, index) =>
          change.path !== changes[index]!.path || change.diff !== changes[index]!.diff,
      )
    )
      return payload;
  }
  const computed = readCodexChangesDiffSummary(changes)!;
  if (summary.added === computed.added && summary.removed === computed.removed) return payload;
  return {
    ...value,
    diffSummary: { ...summary, added: computed.added, removed: computed.removed },
  };
}

export const runtimePayloadProjection: RuntimePayloadProjectionSpec = {
  formatOwnerKey: PERSISTED_RUNTIME_PAYLOAD_FORMAT_OWNER_KEY,
  originFormatVersion: 1,
  itemTypes: ["file_change"],
  maxStoredJsonUnits: MAX_STORED_JSON_UNITS,
  // At most256Ki complete file lines =>6 decimal digits. Existing counters are
  // present nonnegative integers; both numeric substitutions fit16wire/32decode.
  maxWireExpansionBytes: 16,
  maxDecodeExpansionBytes: 32,
  normalizePersistedRuntimePayload,
};
