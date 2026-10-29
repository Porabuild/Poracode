import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionImportSource } from "../agents/base/sessionImport";
import { DEFAULT_SCAN_LIMITS, SessionImportScanner } from "./scanner";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** One JSON line per file: `{ id, cwd, preview, title? }`. */
function store(files: Array<{ id: string; cwd?: string; preview: string; title?: string }>) {
  const root = mkdtempSync(join(tmpdir(), "poracode-import-scan-"));
  roots.push(root);
  mkdirSync(join(root, "nested"), { recursive: true });
  files.forEach((file, index) => {
    const path = join(root, "nested", `${file.id}.jsonl`);
    writeFileSync(path, `${JSON.stringify(file)}\n`);
    const time = new Date(Date.UTC(2026, 0, 1, 0, index));
    utimesSync(path, time, time);
  });
  const summarize = vi.fn<SessionImportSource["summarize"]>(async (file) => {
    for await (const line of file.headLines()) {
      const record = JSON.parse(line) as {
        id: string;
        cwd?: string;
        preview: string;
        title?: string;
      };
      return {
        providerSessionId: record.id,
        preview: record.preview,
        ...(record.cwd ? { cwd: record.cwd } : {}),
        ...(record.title ? { title: record.title } : {}),
      };
    }
    return undefined;
  });
  const source: SessionImportSource = {
    roots: [root],
    acceptFile: (name) => name.endsWith(".jsonl"),
    summarize,
    readTranscript: async () => ({ messages: [] }),
  };
  return { root, source, summarize };
}

describe("SessionImportScanner", () => {
  it("matches the query against preview text, not just title and folder", async () => {
    const { source } = store([
      { id: "a", cwd: "/repo/alpha", preview: "Find the violet lantern" },
      { id: "b", cwd: "/repo/violet-tools", preview: "unrelated" },
      { id: "c", cwd: "/repo/gamma", preview: "nothing here", title: "Violet title" },
      { id: "d", cwd: "/repo/delta", preview: "no match" },
    ]);
    const scanner = new SessionImportScanner(() => [{ agentKind: "agent", source }]);

    const { sessions } = await scanner.list({ query: "violet" });

    expect(sessions.map((session) => session.providerSessionId).toSorted()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("re-reads only transcripts whose mtime or size changed", async () => {
    const { root, source, summarize } = store([
      { id: "a", preview: "one" },
      { id: "b", preview: "two" },
    ]);
    const scanner = new SessionImportScanner(() => [{ agentKind: "agent", source }]);
    await scanner.list({});
    await scanner.list({ query: "two" });
    expect(summarize).toHaveBeenCalledTimes(2);

    writeFileSync(
      join(root, "nested", "a.jsonl"),
      `${JSON.stringify({ id: "a", preview: "edited" })}\n`,
    );
    const { sessions } = await scanner.list({ query: "edited" });

    expect(summarize).toHaveBeenCalledTimes(3);
    expect(sessions.map((session) => session.providerSessionId)).toEqual(["a"]);
  });

  it("supersedes an in-flight scan when a newer request arrives", async () => {
    const { source } = store([{ id: "a", preview: "one" }]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: SessionImportSource = {
      ...source,
      summarize: async (file) => {
        await gate;
        return source.summarize(file);
      },
    };
    const scanner = new SessionImportScanner(() => [{ agentKind: "agent", source: slow }]);

    const first = scanner.list({ query: "first" });
    const second = scanner.list({});
    release();

    await expect(first).resolves.toMatchObject({ superseded: true, sessions: [] });
    await expect(second).resolves.toMatchObject({ sessions: [{ providerSessionId: "a" }] });
  });

  it("bounds the files enumerated and the bytes read per scan", async () => {
    const { source, summarize } = store(
      Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, preview: `p${index}` })),
    );
    const capped = new SessionImportScanner(() => [{ agentKind: "agent", source }], {
      ...DEFAULT_SCAN_LIMITS,
      maxFiles: 4,
    });
    expect(await capped.list({})).toMatchObject({ truncated: true });
    expect(summarize).toHaveBeenCalledTimes(4);

    summarize.mockClear();
    const budgeted = new SessionImportScanner(() => [{ agentKind: "agent", source }], {
      ...DEFAULT_SCAN_LIMITS,
      scanBytes: 1,
      concurrency: 1,
    });
    const result = await budgeted.list({});
    expect(result.truncated).toBe(true);
    expect(summarize).toHaveBeenCalledTimes(1);
    // The newest transcript is read first, so it survives the budget.
    expect(result.sessions.map((session) => session.providerSessionId)).toEqual(["s5"]);
  });

  it("reports facets under the other active filter and flags missing folders", async () => {
    const existing = mkdtempSync(join(tmpdir(), "poracode-import-cwd-"));
    roots.push(existing);
    const { source } = store([
      { id: "a", cwd: existing, preview: "one" },
      { id: "b", cwd: "/definitely/missing/folder", preview: "two" },
    ]);
    const other = store([{ id: "c", cwd: existing, preview: "three" }]).source;
    const scanner = new SessionImportScanner(() => [
      { agentKind: "agent", source },
      { agentKind: "agent:work", source: other },
    ]);

    const result = await scanner.list({ agentKind: "agent" });

    expect(result.facets).toEqual({
      agentKinds: ["agent", "agent:work"],
      folders: ["/definitely/missing/folder", existing].toSorted((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ),
    });
    expect(
      Object.fromEntries(
        result.sessions.map((session) => [session.providerSessionId, session.cwdExists]),
      ),
    ).toEqual({ a: true, b: false });
  });

  it.each([
    { pageSize: 1, expected: ["newer5", "older1"] },
    { pageSize: 4, expected: ["newer5", "newer4", "newer3", "newer2", "older1", "older0"] },
    {
      pageSize: 6,
      expected: ["newer5", "newer4", "newer3", "newer2", "newer1", "newer0", "older1", "older0"],
    },
    {
      pageSize: 10,
      expected: ["newer5", "newer4", "newer3", "newer2", "newer1", "newer0", "older1", "older0"],
    },
  ])(
    "returns up to $pageSize sessions per provider, newest first",
    async ({ pageSize, expected }) => {
      const busy = store(
        Array.from({ length: 6 }, (_, index) => ({ id: `newer${index}`, preview: "recent work" })),
      );
      const quiet = store([
        { id: "older0", preview: "internship strategy" },
        { id: "older1", preview: "interview prep" },
      ]);
      for (let index = 0; index < 6; index++) {
        const time = new Date(Date.UTC(2026, 9, 19, 0, index));
        utimesSync(join(busy.root, "nested", `newer${index}.jsonl`), time, time);
      }
      const scanner = new SessionImportScanner(
        () => [
          { agentKind: "quiet", source: quiet.source },
          { agentKind: "busy", source: busy.source },
        ],
        { ...DEFAULT_SCAN_LIMITS, pageSize },
      );

      const result = await scanner.list({});

      expect(result.sessions.map((session) => session.providerSessionId)).toEqual(expected);
      expect(result.truncated).toBe(pageSize < 6);
      const filtered = await scanner.list({ agentKind: "busy" });
      expect(filtered.sessions.map((session) => session.providerSessionId)).toEqual(
        ["newer5", "newer4", "newer3", "newer2", "newer1", "newer0"].slice(0, pageSize),
      );
    },
  );

  it.each(["files", "bytes"])(
    "reserves the %s budget for the selected provider before unrelated stores",
    async (budget) => {
      const unrelated = store([{ id: "newer", preview: "unrelated" }]);
      const selected = store([{ id: "older", preview: "internship strategy" }]);
      const newer = new Date("2026-10-19T00:00:00.000Z");
      utimesSync(join(unrelated.root, "nested", "newer.jsonl"), newer, newer);
      const scanner = new SessionImportScanner(
        () => [
          { agentKind: "other", source: unrelated.source },
          { agentKind: "selected", source: selected.source },
        ],
        {
          ...DEFAULT_SCAN_LIMITS,
          concurrency: 1,
          ...(budget === "files" ? { maxFiles: 1 } : { scanBytes: 1 }),
        },
      );

      const result = await scanner.list({ agentKind: "selected", query: "internship" });

      expect(result.sessions.map((session) => session.providerSessionId)).toEqual(["older"]);
      expect(result.truncated).toBe(true);
      expect(unrelated.summarize).not.toHaveBeenCalled();
    },
  );
});
