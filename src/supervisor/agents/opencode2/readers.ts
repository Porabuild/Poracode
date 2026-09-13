import { readStringField } from "../fileChangeSummary";

/** Leaf readers for loosely-typed V2 event payloads. */

export function readOpenCode2Record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readOpenCode2String(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  return readStringField(record, ...keys);
}

export function readOpenCode2Number(
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
export function parseOpenCode2JsonRecord(text: string): Record<string, unknown> | undefined {
  if (text.trim().length === 0) return undefined;
  try {
    return readOpenCode2Record(JSON.parse(text));
  } catch {
    return undefined;
  }
}
