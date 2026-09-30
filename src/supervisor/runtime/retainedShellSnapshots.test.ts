import { describe, expect, it } from "vitest";
import {
  buildRetainedShellSnapshot,
  isRetainedShellExpired,
  MAX_RETAINED_SHELL_SNAPSHOTS,
  pruneRetainedShellSnapshots,
  putRetainedShellSnapshot,
  RETAINED_SHELL_SNAPSHOT_TTL_MS,
  snapshotFromLiveSession,
  type RetainedShellSnapshot,
} from "./retainedShellSnapshots";
import { TranscriptBuffer } from "@/shared/transcriptBuffer";
import type { SessionRuntime, ShellSessionRuntime } from "./sessionTypes";

function makeSnapshot(
  threadId: string,
  overrides: Partial<RetainedShellSnapshot> = {},
): RetainedShellSnapshot {
  return {
    threadId,
    generation: `g-${threadId}`,
    data: "x",
    fromCursor: 0,
    toCursor: 1,
    terminalSize: null,
    retainedAt: Date.now(),
    ...overrides,
  };
}

describe("retainedShellSnapshots", () => {
  it("computes absolute cursors from retained tail length", () => {
    const transcript = new TranscriptBuffer(200_000);
    transcript.append("hello world");
    const session = {
      instanceId: "inst-1",
      outputLength: 11,
      outputTranscript: transcript,
      terminalSize: { cols: 100, rows: 40 },
    } as SessionRuntime;

    expect(snapshotFromLiveSession(session, "running")).toEqual({
      generation: "inst-1",
      fromCursor: 0,
      toCursor: 11,
      data: "hello world",
      processState: "running",
      terminalSize: { cols: 100, rows: 40 },
    });
  });

  it("evicts oldest retained shells past the bound and expires by TTL", () => {
    const store = new Map<string, RetainedShellSnapshot>();
    for (let i = 0; i < MAX_RETAINED_SHELL_SNAPSHOTS + 2; i += 1) {
      putRetainedShellSnapshot(store, makeSnapshot(`shell:${i}`));
    }
    expect(store.size).toBe(MAX_RETAINED_SHELL_SNAPSHOTS);
    expect(store.has("shell:0")).toBe(false);
    expect(store.has("shell:1")).toBe(false);

    const expired = makeSnapshot("shell:old", {
      generation: "g-old",
      data: "y",
      retainedAt: Date.now() - RETAINED_SHELL_SNAPSHOT_TTL_MS - 1,
    });
    expect(isRetainedShellExpired(expired)).toBe(true);
  });

  it("prunes expired entries via pruneRetainedShellSnapshots", () => {
    const now = 1_700_000_000_000;
    const store = new Map<string, RetainedShellSnapshot>();
    store.set("fresh", makeSnapshot("fresh", { retainedAt: now }));
    store.set(
      "stale",
      makeSnapshot("stale", { retainedAt: now - RETAINED_SHELL_SNAPSHOT_TTL_MS - 1 }),
    );
    store.set(
      "also-stale",
      makeSnapshot("also-stale", { retainedAt: now - RETAINED_SHELL_SNAPSHOT_TTL_MS * 2 }),
    );

    pruneRetainedShellSnapshots(store, now);

    expect([...store.keys()]).toEqual(["fresh"]);
    expect(store.get("fresh")?.data).toBe("x");
  });

  it("replaces an existing id without growing the store", () => {
    const store = new Map<string, RetainedShellSnapshot>();
    putRetainedShellSnapshot(
      store,
      makeSnapshot("shell:same", { generation: "g-old", data: "old", toCursor: 3 }),
    );
    putRetainedShellSnapshot(
      store,
      makeSnapshot("shell:same", { generation: "g-new", data: "new!", fromCursor: 0, toCursor: 4 }),
    );

    expect(store.size).toBe(1);
    expect(store.get("shell:same")).toMatchObject({
      generation: "g-new",
      data: "new!",
      toCursor: 4,
    });
  });

  it("refreshes LRU order so a re-put id is not the first eviction victim", () => {
    const store = new Map<string, RetainedShellSnapshot>();
    // Insert shell:0 first (oldest), then fill almost to capacity.
    putRetainedShellSnapshot(store, makeSnapshot("shell:0", { data: "first" }));
    for (let i = 1; i < MAX_RETAINED_SHELL_SNAPSHOTS; i += 1) {
      putRetainedShellSnapshot(store, makeSnapshot(`shell:${i}`));
    }
    expect(store.size).toBe(MAX_RETAINED_SHELL_SNAPSHOTS);
    expect([...store.keys()][0]).toBe("shell:0");

    // Touch shell:0 — delete+set moves it to the end of Map insertion order.
    putRetainedShellSnapshot(
      store,
      makeSnapshot("shell:0", { data: "refreshed", generation: "g-touch" }),
    );
    expect(store.get("shell:0")?.data).toBe("refreshed");
    expect([...store.keys()].at(-1)).toBe("shell:0");

    // One more insert should evict shell:1 (now oldest), not shell:0.
    putRetainedShellSnapshot(store, makeSnapshot("shell:new"));
    expect(store.has("shell:0")).toBe(true);
    expect(store.has("shell:1")).toBe(false);
    expect(store.has("shell:new")).toBe(true);
    expect(store.size).toBe(MAX_RETAINED_SHELL_SNAPSHOTS);
  });

  it("captures shell size from pty geometry when present", () => {
    const shell = {
      shellId: "shell:1",
      instanceId: "inst-shell",
      outputLength: 4,
      outputTranscript: (() => {
        const buffer = new TranscriptBuffer(200_000);
        buffer.append("done");
        return buffer;
      })(),
      pty: { cols: 80, rows: 24 },
    } as unknown as ShellSessionRuntime;

    const retained = buildRetainedShellSnapshot(shell);
    expect(retained.terminalSize).toEqual({ cols: 80, rows: 24 });
    expect(retained.generation).toBe("inst-shell");
    expect(retained.toCursor).toBe(4);
  });
});
