import type { ProjectLocation } from "@/shared/contracts";
import {
  createLspRootUri,
  type HostDiagnostic,
  type HostDiagnosticDocument,
  type HostDiagnosticsSnapshot,
} from "@/shared/lsp";
import { assertBoundedJson } from "@/shared/jsonBounds";

const MAX_DOCUMENTS = 256;
const MAX_RETAINED_BYTES = 512 * 1024;
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_SNAPSHOT_ITEMS = 1000;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const uint32 = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

/** URI containment includes an execution-environment boundary, not a path prefix alone. */
export function sameDiagnosticProject(a: ProjectLocation, b: ProjectLocation): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "wsl" && (b.kind !== "wsl" || a.distro !== b.distro)) return false;
  const left = createLspRootUri(a),
    right = createLspRootUri(b);
  return a.kind === "windows" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function position(value: unknown): HostDiagnostic["range"]["start"] | undefined {
  const point = record(value);
  return point && uint32(point.line) && uint32(point.character)
    ? { line: point.line, character: point.character }
    : undefined;
}

function diagnostic(value: unknown): HostDiagnostic | undefined {
  const item = record(value),
    range = record(item?.range);
  if (!item || !range || typeof item.message !== "string") return undefined;
  const start = position(range.start),
    end = position(range.end);
  if (
    !start ||
    !end ||
    end.line < start.line ||
    (end.line === start.line && end.character < start.character)
  )
    return undefined;
  if (item.severity !== undefined && ![1, 2, 3, 4].includes(item.severity as number))
    return undefined;
  if (item.source !== undefined && typeof item.source !== "string") return undefined;
  if (
    item.code !== undefined &&
    typeof item.code !== "string" &&
    !(typeof item.code === "number" && Number.isFinite(item.code))
  )
    return undefined;
  return {
    range: { start, end },
    message: item.message,
    ...(item.severity !== undefined ? { severity: item.severity as 1 | 2 | 3 | 4 } : {}),
    ...(typeof item.source === "string" ? { source: item.source } : {}),
    ...(typeof item.code === "string" || typeof item.code === "number" ? { code: item.code } : {}),
  };
}

/** Per-connection published diagnostics. Restart/disposal retires the whole store. */
export class LspDiagnosticStore {
  private readonly documents = new Map<string, HostDiagnosticDocument>();
  private readonly sizes = new Map<string, number>();
  private readonly versions = new Map<string, number>();
  private readonly closed = new Set<string>();
  private readonly pending = new Set<string>();
  private retainedBytes = 0;
  private incomplete = false;
  private trackingOverflow = false;

  constructor(
    private readonly location: ProjectLocation,
    private readonly languageId: string,
  ) {}

  private owns(uri: string): boolean {
    const root = createLspRootUri(this.location);
    const candidate = this.location.kind === "windows" ? uri.toLowerCase() : uri;
    const parent = this.location.kind === "windows" ? root.toLowerCase() : root;
    // Encoded dot-segments must not escape the root through URL normalization.
    try {
      const parsed = new URL(uri);
      if (parsed.protocol !== "file:" || parsed.search || parsed.hash) return false;
      const normalized = this.location.kind === "windows" ? parsed.href.toLowerCase() : parsed.href;
      return (
        normalized === candidate &&
        (candidate === parent || candidate.startsWith(parent.endsWith("/") ? parent : `${parent}/`))
      );
    } catch {
      return false;
    }
  }

  private forget(uri: string): void {
    this.retainedBytes -= this.sizes.get(uri) ?? 0;
    this.documents.delete(uri);
    this.sizes.delete(uri);
  }

  observeClientMessage(message: unknown): void {
    const wire = record(message),
      params = record(wire?.params),
      document = record(params?.textDocument);
    if (typeof document?.uri !== "string" || !this.owns(document.uri)) return;
    const uri = document.uri;
    if (wire?.method === "textDocument/didClose") {
      this.forget(uri);
      this.versions.delete(uri);
      this.pending.delete(uri);
      this.closed.add(uri);
    } else if (
      wire?.method === "textDocument/didOpen" ||
      wire?.method === "textDocument/didChange"
    ) {
      this.forget(uri);
      this.closed.delete(uri);
      this.pending.add(uri);
      if (typeof document.version === "number" && Number.isInteger(document.version))
        this.versions.set(uri, document.version);
      else this.versions.delete(uri);
    }
    // Bookkeeping itself must remain bounded even with a long-lived editor.
    if (
      this.closed.size > MAX_DOCUMENTS ||
      this.versions.size > MAX_DOCUMENTS ||
      this.pending.size > MAX_DOCUMENTS
    ) {
      this.clear();
      this.trackingOverflow = true;
      this.incomplete = true;
    }
  }

  publish(message: unknown): void {
    const wire = record(message);
    if (this.trackingOverflow || wire?.method !== "textDocument/publishDiagnostics") return;
    const params = record(wire.params);
    const uri = typeof params?.uri === "string" ? params.uri : undefined;
    if (!uri || !this.owns(uri) || this.closed.has(uri)) return;
    const knownVersion = this.versions.get(uri);
    if (
      typeof params?.version === "number" &&
      knownVersion !== undefined &&
      params.version < knownVersion
    )
      return;
    this.forget(uri);
    try {
      assertBoundedJson(params, MAX_RETAINED_BYTES);
    } catch {
      this.incomplete = true;
      return;
    }
    if (
      params?.version !== undefined &&
      !(typeof params.version === "number" && Number.isInteger(params.version))
    ) {
      this.incomplete = true;
      return;
    }
    if (!Array.isArray(params?.diagnostics)) {
      this.incomplete = true;
      return;
    }
    const diagnostics: HostDiagnostic[] = [];
    for (const value of params.diagnostics) {
      const parsed = diagnostic(value);
      if (!parsed) {
        this.incomplete = true;
        return;
      }
      diagnostics.push(parsed);
    }
    const next = { uri, languageId: this.languageId, diagnostics };
    const size = bytes(next);
    if (this.documents.size >= MAX_DOCUMENTS || this.retainedBytes + size > MAX_RETAINED_BYTES) {
      this.incomplete = true;
      return;
    }
    this.documents.set(uri, next);
    this.sizes.set(uri, size);
    this.retainedBytes += size;
    this.pending.delete(uri);
    if (typeof params.version === "number" && Number.isInteger(params.version))
      this.versions.set(uri, params.version);
  }

  snapshot(): HostDiagnosticsSnapshot {
    return boundDiagnosticSnapshot(
      this.documents.values(),
      this.incomplete || this.pending.size > 0,
    );
  }

  clear(): void {
    this.documents.clear();
    this.sizes.clear();
    this.versions.clear();
    this.closed.clear();
    this.pending.clear();
    this.retainedBytes = 0;
    this.incomplete = false;
    this.trackingOverflow = false;
  }
}

/** Bound the aggregate across language servers as well as each individual store. */
export function boundDiagnosticSnapshot(
  input: Iterable<HostDiagnosticDocument>,
  initiallyTruncated = false,
): HostDiagnosticsSnapshot {
  const documents: HostDiagnosticDocument[] = [];
  let usedBytes = 64,
    count = 0,
    truncated = initiallyTruncated;
  for (const document of input) {
    const overhead = bytes({ ...document, diagnostics: [] }) + 1;
    if (usedBytes + overhead > MAX_SNAPSHOT_BYTES || documents.length >= MAX_DOCUMENTS) {
      truncated = true;
      continue;
    }
    usedBytes += overhead;
    const diagnostics: HostDiagnostic[] = [];
    for (const item of document.diagnostics) {
      const size = bytes(item) + 1;
      if (usedBytes + size > MAX_SNAPSHOT_BYTES || count >= MAX_SNAPSHOT_ITEMS) {
        truncated = true;
        continue;
      }
      diagnostics.push(structuredClone(item));
      usedBytes += size;
      count += 1;
    }
    documents.push({ uri: document.uri, languageId: document.languageId, diagnostics });
  }
  return { documents, truncated };
}
