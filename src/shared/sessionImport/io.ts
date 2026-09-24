import { closeSync, fstatSync, openSync, readSync } from "node:fs";
interface FilePrefix {
  readonly text: string;
  /** Whether the file continues past what was read — worth a deeper read. */
  readonly cut: boolean;
}

/**
 * First `maxBytes` of a file, truncated back to the last complete line so a
 * caller can `JSON.parse` what it gets without meeting half an object.
 */
export function readPrefix(path: string, maxBytes: number): FilePrefix {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    if (length === 0) return { text: "", cut: false };
    const buffer = Buffer.allocUnsafe(length);
    readSync(fd, buffer, 0, length, 0);
    const text = buffer.toString("utf8");
    if (length >= size) return { text, cut: false };
    const lastNewline = text.lastIndexOf("\n");
    return { text: lastNewline >= 0 ? text.slice(0, lastNewline) : text, cut: true };
  } catch {
    return { text: "", cut: false };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // The descriptor is going away with the process anyway.
      }
    }
  }
}

function unescapeJsonString(raw: string): string | undefined {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return undefined;
  }
}

/**
 * Pull a JSON string field out of raw text with a regex rather than
 * `JSON.parse`. Used only as the fallback for a head chunk's final line when
 * that line fails to parse — either because the chunk boundary cut it in
 * half (Codex's `session_meta` carries the whole system prompt and can run
 * past any sane chunk size) or because the file itself ends mid-write. The
 * closing-quote requirement means a value cut mid-string comes back
 * `undefined` rather than a partial value either way.
 */
export function rawField(text: string, field: string): string | undefined {
  const match = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "u").exec(text);
  return match?.[1] === undefined ? undefined : unescapeJsonString(match[1]);
}

/** A line's parsed JSON, only when it's a non-null, non-array object. */
export function parseJsonRecord(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function objectField(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function readSuffix(path: string, maxBytes: number): string {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    if (length === 0) return "";
    const buffer = Buffer.allocUnsafe(length);
    readSync(fd, buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    if (length >= size) return text;
    const firstNewline = text.indexOf("\n");
    return firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
  } catch {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // The descriptor is going away with the process anyway.
      }
    }
  }
}
