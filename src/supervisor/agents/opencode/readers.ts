import { readStringField } from "../fileChangeSummary";

/** Leaf readers for loosely-typed V2 event payloads. */

export function readOpenCodeRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readOpenCodeString(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  return readStringField(record, ...keys);
}

export function readOpenCodeNumber(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

/** Parse a streamed tool-input JSON text into a record; tolerant of garbage. */
export function parseOpenCodeJsonRecord(text: string): Record<string, unknown> | undefined {
  if (text.trim().length === 0) return undefined;
  try {
    return readOpenCodeRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}
