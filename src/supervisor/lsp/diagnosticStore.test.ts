import { describe, expect, it } from "vitest";
import {
  LspDiagnosticStore,
  boundDiagnosticSnapshot,
  sameDiagnosticProject,
} from "./diagnosticStore";
import type { HostDiagnostic } from "@/shared/lsp";

const location = { kind: "posix", path: "/repo" } as const;
const item: HostDiagnostic = {
  range: { start: { line: 0, character: 1 }, end: { line: 0, character: 3 } },
  message: "Type string is not assignable",
  severity: 1,
  source: "ts",
  code: 2322,
};
const publication = (diagnostics: unknown, version?: number, uri = "file:///repo/a.ts") => ({
  method: "textDocument/publishDiagnostics",
  params: { uri, diagnostics, ...(version !== undefined ? { version } : {}) },
});
const client = (method: string, version?: number, uri = "file:///repo/a.ts") => ({
  method: `textDocument/${method}`,
  params: { textDocument: { uri, ...(version !== undefined ? { version } : {}) } },
});

describe("current host diagnostic store", () => {
  it("retains actual LSP ranges and code, and returns detached snapshots", () => {
    const store = new LspDiagnosticStore(location, "typescript");
    const incoming = structuredClone(item);
    store.publish(publication([incoming]));
    incoming.message = "mutated server data";
    const first = store.snapshot();
    expect(first.documents).toEqual([
      { uri: "file:///repo/a.ts", languageId: "typescript", diagnostics: [item] },
    ]);
    first.documents[0]!.diagnostics[0]!.message = "mutated caller";
    expect(store.snapshot().documents[0]!.diagnostics[0]!.message).toBe(item.message);
  });
  it("replaces published issues with a legitimate empty publication", () => {
    const store = new LspDiagnosticStore(location, "typescript");
    store.publish(publication([item], 1));
    store.publish(publication([], 2));
    expect(store.snapshot()).toEqual({
      documents: [{ uri: "file:///repo/a.ts", languageId: "typescript", diagnostics: [] }],
      truncated: false,
    });
  });
  it("invalidates edited data and rejects older delayed publications", () => {
    const store = new LspDiagnosticStore(location, "typescript");
    store.observeClientMessage(client("didOpen", 1));
    store.publish(publication([item], 1));
    store.observeClientMessage(client("didChange", 2));
    expect(store.snapshot().documents).toEqual([]);
    expect(store.snapshot().truncated).toBe(true);
    store.publish(publication([item], 1));
    expect(store.snapshot().documents).toEqual([]);
    store.publish(publication([], 2));
    expect(store.snapshot().documents[0]!.diagnostics).toEqual([]);
    expect(store.snapshot().truncated).toBe(false);
  });
  it("does not let a delayed result resurrect a closed document; reopening establishes a new version", () => {
    const store = new LspDiagnosticStore(location, "typescript");
    store.publish(publication([item], 10));
    store.observeClientMessage(client("didClose"));
    store.publish(publication([item], 10));
    expect(store.snapshot().documents).toEqual([]);
    store.observeClientMessage(client("didOpen", 1));
    store.publish(publication([item], 1));
    expect(store.snapshot().documents[0]!.diagnostics).toEqual([item]);
  });
  it("does not expose other projects, prefix siblings, traversal URIs or non-file data", () => {
    const store = new LspDiagnosticStore(location, "typescript");
    for (const uri of [
      "file:///repo2/a.ts",
      "file:///other/a.ts",
      "file:///repo/%2e%2e/private/a",
      "https://example.com/a",
      "file:///repo/a.ts?secret=x",
    ])
      store.publish(publication([item], 1, uri));
    expect(store.snapshot()).toEqual({ documents: [], truncated: false });
  });
  it.each([
    { ...item, message: [] },
    { ...item, severity: "1" },
    { ...item, range: { start: { line: -1, character: 0 }, end: { line: 1, character: 0 } } },
    { ...item, range: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } } },
    { ...item, message: "x".repeat(600_000) },
  ])("clears stale issues and marks invalid or oversized replacements incomplete", (invalid) => {
    const store = new LspDiagnosticStore(location, "typescript");
    store.publish(publication([item]));
    store.publish(publication([invalid]));
    expect(store.snapshot()).toEqual({ documents: [], truncated: true });
  });
  it("bounds aggregate snapshots without truncating individual messages", () => {
    const documents = Array.from({ length: 3 }, (_, n) => ({
      uri: `file:///repo/${n}.ts`,
      languageId: "typescript",
      diagnostics: Array.from({ length: 700 }, () => structuredClone(item)),
    }));
    const snapshot = boundDiagnosticSnapshot(documents);
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.documents.reduce((n, d) => n + d.diagnostics.length, 0)).toBe(1000);
    expect(snapshot.documents[0]!.diagnostics[0]!.message).toBe(item.message);
    expect(Buffer.byteLength(JSON.stringify(snapshot))).toBeLessThan(256 * 1024);
  });
  it("fails closed when version tracking overflows instead of admitting old closed data", () => {
    const store = new LspDiagnosticStore(location, "typescript");
    for (let n = 0; n < 257; n++)
      store.observeClientMessage(client("didClose", undefined, `file:///repo/${n}.ts`));
    store.publish(publication([item], 1, "file:///repo/0.ts"));
    expect(store.snapshot()).toEqual({ documents: [], truncated: true });
    store.clear();
    store.publish(publication([item]));
    expect(store.snapshot().documents).toHaveLength(1);
  });
  it("separates execution environments and distros with identical paths", () => {
    expect(sameDiagnosticProject(location, { kind: "posix", path: "/repo/" })).toBe(true);
    const wsl = {
      kind: "wsl",
      linuxPath: "/repo",
      distro: "A",
      uncPath: "\\\\wsl.localhost\\A\\repo",
    } as const;
    expect(sameDiagnosticProject(location, wsl)).toBe(false);
    expect(sameDiagnosticProject(wsl, { ...wsl, distro: "B" })).toBe(false);
    expect(
      sameDiagnosticProject(
        { kind: "windows", path: "C:\\Repo" },
        { kind: "windows", path: "c:\\repo" },
      ),
    ).toBe(true);
  });
});
