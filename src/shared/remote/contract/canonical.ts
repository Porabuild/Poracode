import { createHash } from "node:crypto";
import { compareUnicodeCodePoints } from "./unicodeOrder";

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort(compareUnicodeCodePoints)) {
    next[key] = sortKeys(record[key]);
  }
  return next;
}

export function canonicalize(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function sha256Prefixed(text: string): string {
  return `sha256:${sha256Hex(text)}`;
}
