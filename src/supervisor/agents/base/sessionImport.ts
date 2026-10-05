import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";

/**
 * Provider hook for importing existing CLI conversations. A provider declares
 * `AgentAdapter.sessionImport`; the shared scanner (`src/supervisor/sessionImport`)
 * owns enumeration, byte bounds, caching and supersession, and hands each
 * transcript to the provider only through the bounded readers below.
 */
export interface SessionImportSource {
  /** Directories holding this agent's transcripts on the supervisor host. */
  readonly roots: readonly string[];
  /** Cheap filename filter applied before any read. */
  acceptFile(name: string): boolean;
  /** Summary for the import list, or `undefined` when the file is not a user conversation. */
  summarize(file: SessionImportFile): Promise<SessionImportSummary | undefined>;
  /** Provider-maintained titles keyed by provider session id, read once per scan. */
  readTitles?(): Promise<ReadonlyMap<string, string>>;
  /** Full text transcript for replay. */
  readTranscript(path: string): Promise<ImportedTranscript>;
}

export interface SessionImportFile {
  readonly path: string;
  /** Complete lines from the start of the file; stops at the scanner's byte budget. */
  headLines(): AsyncIterable<string>;
  /** Complete lines from the end of the file, within the scanner's tail budget. */
  tailLines(): Promise<readonly string[]>;
}

export interface SessionImportSummary {
  providerSessionId: string;
  cwd?: string;
  startedAt?: string;
  model?: string;
  /** First thing the user typed; the scanner compacts it. */
  preview?: string;
  title?: string;
}

export interface ImportedTranscriptMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ImportedTranscript {
  providerSessionId?: string;
  messages: ImportedTranscriptMessage[];
}

const READ_CHUNK_BYTES = 64 * 1024;

/** Lines of `path` read in chunks, never holding more than a chunk plus one line. */
export async function* readFileLines(path: string, maxBytes = Infinity): AsyncGenerator<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    const decoder = new StringDecoder("utf8");
    let remainder = "";
    let total = 0;
    while (total < maxBytes) {
      const length = Math.min(READ_CHUNK_BYTES, maxBytes - total);
      const { bytesRead } = await handle.read(buffer, 0, length, null);
      if (bytesRead === 0) {
        remainder += decoder.end();
        if (remainder.length > 0) yield remainder;
        return;
      }
      total += bytesRead;
      remainder += decoder.write(buffer.subarray(0, bytesRead));
      let newline = remainder.indexOf("\n");
      while (newline !== -1) {
        yield remainder.slice(0, newline);
        remainder = remainder.slice(newline + 1);
        newline = remainder.indexOf("\n");
      }
    }
    // Budget exhausted mid-line: the partial line is dropped, never parsed.
  } finally {
    await handle.close();
  }
}

/** Complete lines within the last `maxBytes` of `path`. */
export async function readTailLines(path: string, maxBytes: number): Promise<string[]> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    if (length === 0) return [];
    const buffer = Buffer.allocUnsafe(length);
    await handle.read(buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split(/\r?\n/u);
    return length < size ? lines.slice(1) : lines;
  } finally {
    await handle.close();
  }
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseJsonRecord(line: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return undefined;
  }
}

/** Poracode's own provider-switch preamble (`buildProviderHandoffInstruction`). */
const HANDOFF_PREAMBLE_RE = /\[provider handoff\][\s\S]*$/u;

/** Removes `<tag>…</tag>` blocks a CLI injects into user turns, plus Poracode's handoff preamble. */
export function stripInjectedContext(text: string, tags: readonly string[]): string {
  const blocks = tags.length > 0 ? new RegExp(`<(${tags.join("|")})>[\\s\\S]*?</\\1>`, "gu") : null;
  return (blocks ? text.replace(blocks, "") : text).replace(HANDOFF_PREAMBLE_RE, "").trim();
}
