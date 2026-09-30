import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent, Thread } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import { importSessionTranscript, listImportableSessions, resetImportClaims } from "./index";

// The claim map is module state: a test that leaves a claim behind would
// otherwise change what a later test in this file sees.
beforeEach(() => {
  resetImportClaims();
});

function codexHomeWith(id: string, cwd: string, prompt: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "poracode-import-home-"));
  const sessionsDir = join(dir, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  const path = join(sessionsDir, `rollout-${id}.jsonl`);
  writeFileSync(
    path,
    [
      JSON.stringify({
        type: "session_meta",
        payload: { session_id: id, cwd, timestamp: "2026-09-20T04:43:18.000Z" },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        },
      }),
    ].join("\n"),
    "utf8",
  );
  return { dir, path };
}

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "t1",
    projectId: "p1",
    title: "Imported",
    agentKind: "codex",
    config: { model: "gpt-5.5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-09-20T06:00:00.000Z",
    updatedAt: "2026-09-20T06:00:00.000Z",
    ...overrides,
  } as Thread;
}

function settingsWithHome(dir: string) {
  return {
    ...defaultSharedSettings,
    agentInstances: {
      work: { id: "work", driver: "codex", displayName: "Work", config: { homeDir: dir } },
    },
  };
}

describe("listImportableSessions", () => {
  it("marks a session that a thread already imported", () => {
    const { dir, path } = codexHomeWith("cx-1", "F:\\repo", "fix the bug");
    const imported = thread({
      id: "already",
      config: {
        model: "gpt-5.5",
        importedFrom: { provider: "codex", path, importedAt: "2026-09-20T06:00:00.000Z" },
      },
    });

    const { sessions } = listImportableSessions(
      {},
      {
        readSharedSettings: () => settingsWithHome(dir),
        getThreads: () => [imported],
        applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
        flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
      },
    );

    expect(sessions.find((session) => session.providerSessionId === "cx-1")?.importedThreadId).toBe(
      "already",
    );
  });

  it("marks a session that is already a live thread", () => {
    const { dir } = codexHomeWith("cx-live", "F:\\repo", "still running");
    const live = thread({
      id: "live",
      sessionRef: { providerSessionId: "cx-live", discoveredAt: "2026-09-20T06:00:00.000Z" },
    });

    const { sessions } = listImportableSessions(
      {},
      {
        readSharedSettings: () => settingsWithHome(dir),
        getThreads: () => [live],
        applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
        flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
      },
    );

    expect(
      sessions.find((session) => session.providerSessionId === "cx-live")?.importedThreadId,
    ).toBe("live");
  });

  it("filters by account and still reports the accounts it saw", () => {
    const { dir } = codexHomeWith("cx-1", "F:\\repo", "fix the bug");
    const deps = {
      readSharedSettings: () => settingsWithHome(dir),
      getThreads: () => [],
      applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
      flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
    };

    const mine = listImportableSessions({ agentKind: "codex:work" }, deps);
    expect(mine.sessions.map((session) => session.providerSessionId)).toEqual(["cx-1"]);

    const other = listImportableSessions({ agentKind: "codex:nobody" }, deps);
    expect(other.sessions).toEqual([]);
    // The account facet ignores the account filter, or picking one account
    // would leave the dropdown holding only that account.
    expect(other.facets.accounts).toContain("codex:work");
  });
});

describe("importSessionTranscript", () => {
  it("points at the thread that already holds the session instead of importing it twice", () => {
    const { dir, path } = codexHomeWith("cx-dup", "F:\\repo", "hello");
    const applied: RuntimeEvent[] = [];
    const existing = thread({
      id: "already",
      config: {
        model: "gpt-5.5",
        importedFrom: { provider: "codex", path, importedAt: "2026-09-20T06:00:00.000Z" },
      },
    });

    const result = importSessionTranscript(
      { threadId: "t1", provider: "codex", path },
      {
        readSharedSettings: () => settingsWithHome(dir),
        getThreads: () => [existing, thread({ id: "t1" })],
        applyRuntimeEvents: (_threadId, events) => applied.push(...events),
        flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
      },
    );

    // Throwing here left the caller rolling back its own half-built thread
    // and showing an error naming a thread the other window may have rolled
    // back too. Naming the holder lets the caller point the user at it.
    expect(result).toEqual({ messageCount: 0, path, existingThreadId: "already" });
    expect(applied).toEqual([]);
  });

  it("names the thread this process just imported into, before the database has it", () => {
    // The renderer stamps a new thread and persists it asynchronously, so
    // `getThreads()` can still show the session free to a second window
    // importing it at the same moment. Neither thread below carries a stamp,
    // which is exactly the state that produced two duplicate threads.
    const { dir, path } = codexHomeWith("cx-race", "F:\\repo", "hello");
    const deps = {
      readSharedSettings: () => settingsWithHome(dir),
      getThreads: () => [thread({ id: "t1" }), thread({ id: "t2" })],
      applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
      flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
    };

    const first = importSessionTranscript({ threadId: "t1", provider: "codex", path }, deps);
    expect(first).toEqual({ messageCount: 2, path });

    const second = importSessionTranscript({ threadId: "t2", provider: "codex", path }, deps);
    expect(second).toEqual({ messageCount: 0, path, existingThreadId: "t1" });
  });

  it("lets a session be imported again once the thread that held it is gone", () => {
    const { dir, path } = codexHomeWith("cx-gone", "F:\\repo", "hello");
    let threads = [thread({ id: "t1" }), thread({ id: "t2" })];
    const deps = {
      readSharedSettings: () => settingsWithHome(dir),
      getThreads: () => threads,
      applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
      flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
    };

    expect(importSessionTranscript({ threadId: "t1", provider: "codex", path }, deps)).toEqual({
      messageCount: 2,
      path,
    });

    // The user deletes the imported thread and imports the session again. A
    // claim only ever stands in for a stamp that has not landed yet; held
    // past the life of its own thread it refuses the import for the life of
    // the main process, in the name of a thread the user cannot open.
    threads = [thread({ id: "t2" })];

    expect(importSessionTranscript({ threadId: "t2", provider: "codex", path }, deps)).toEqual({
      messageCount: 2,
      path,
    });
  });

  it("releases its claim when the import fails, so the session can be imported after", () => {
    const { dir, path } = codexHomeWith("cx-retry", "F:\\repo", "hello");
    const deps = {
      readSharedSettings: () => settingsWithHome(dir),
      getThreads: () => [thread({ id: "t1" }), thread({ id: "t2" })],
      applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
      flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
    };

    // The copy throws after the claim is taken: no account is configured as
    // `codex:gone`. A claim left behind would make the session unimportable
    // for the life of the main process.
    expect(() =>
      importSessionTranscript(
        { threadId: "t1", provider: "codex", path, targetAgentKind: "codex:gone" },
        deps,
      ),
    ).toThrow(/codex:gone/u);

    expect(importSessionTranscript({ threadId: "t2", provider: "codex", path }, deps)).toEqual({
      messageCount: 2,
      path,
    });
  });

  it("does not match the target thread against its own just-stamped path and session id", () => {
    // The renderer sets `config.importedFrom.path` and
    // `sessionRef.providerSessionId` on the target thread *before* calling
    // in, so by the time the duplicate check runs, the thread being imported
    // into already carries the very path and session id it is about to
    // import. Excluding it from the check is what makes this succeed.
    const { path } = codexHomeWith("cx-self", "F:\\repo", "hello");
    const applied: RuntimeEvent[] = [];
    const flushRuntimeWrites = vi.fn<(threadId: string) => void>();
    const selfStamped = thread({
      id: "t1",
      config: {
        model: "gpt-5.5",
        importedFrom: { provider: "codex", path, importedAt: "2026-09-20T06:00:00.000Z" },
      },
      sessionRef: { providerSessionId: "cx-self", discoveredAt: "2026-09-20T06:00:00.000Z" },
    });

    const result = importSessionTranscript(
      { threadId: "t1", provider: "codex", path },
      {
        readSharedSettings: () => defaultSharedSettings,
        getThreads: () => [selfStamped],
        applyRuntimeEvents: (_threadId, events) => applied.push(...events),
        flushRuntimeWrites,
      },
    );

    expect(result).toEqual({ messageCount: 2, path });
  });

  it("replays the transcript into the thread and reports the message count", () => {
    const { path } = codexHomeWith("cx-2", "F:\\repo", "hello");
    const applied: RuntimeEvent[] = [];
    const flushRuntimeWrites = vi.fn<(threadId: string) => void>();

    const result = importSessionTranscript(
      { threadId: "t1", provider: "codex", path },
      {
        readSharedSettings: () => defaultSharedSettings,
        getThreads: () => [thread()],
        applyRuntimeEvents: (_threadId, events) => applied.push(...events),
        flushRuntimeWrites,
      },
    );

    expect(result).toEqual({ messageCount: 2, path });
    expect(applied.filter((event) => event.type === "item.started")).toHaveLength(2);
    expect(flushRuntimeWrites).toHaveBeenCalledExactlyOnceWith("t1");
  });

  it("copies the transcript into the target profile home before replaying", () => {
    const { dir, path } = codexHomeWith("cx-copy", "F:\repo", "hello");
    const profileDir = mkdtempSync(join(tmpdir(), "poracode-import-profile-"));
    const applied: RuntimeEvent[] = [];

    const result = importSessionTranscript(
      { threadId: "t1", provider: "codex", path, targetAgentKind: "codex:work" },
      {
        readSharedSettings: () => ({
          ...defaultSharedSettings,
          agentInstances: {
            src: { id: "src", driver: "codex", displayName: "Source", config: { homeDir: dir } },
            work: {
              id: "work",
              driver: "codex",
              displayName: "Work",
              config: { homeDir: profileDir },
            },
          },
        }),
        getThreads: () => [thread({ agentKind: "codex:work" })],
        applyRuntimeEvents: (_threadId, events) => applied.push(...events),
        flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
      },
    );

    expect(result.path).toBe(join(profileDir, "sessions", "rollout-cx-copy.jsonl"));
    expect(result.messageCount).toBe(2);
    expect(existsSync(result.path)).toBe(true);
    // The base home keeps its file: the copy is the profile's own.
    expect(existsSync(join(dir, "sessions", "rollout-cx-copy.jsonl"))).toBe(true);
  });

  it("refuses to replay a transcript that is no longer the session that was scanned", () => {
    const { dir, path } = codexHomeWith("cx-now", "F:\\repo", "hello");
    // The renderer stamps the thread with the id the *scan* reported. If the
    // file at that path has been replaced since, replaying it would leave the
    // thread showing one conversation and resuming another.
    const stamped = thread({
      id: "t1",
      sessionRef: { providerSessionId: "cx-was", discoveredAt: "2026-09-20T06:00:00.000Z" },
    });

    expect(() =>
      importSessionTranscript(
        { threadId: "t1", provider: "codex", path },
        {
          readSharedSettings: () => settingsWithHome(dir),
          getThreads: () => [stamped],
          applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
          flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
        },
      ),
    ).toThrow(/changed on disk/iu);
  });

  it("throws for an unknown thread and for a missing file", () => {
    const { path } = codexHomeWith("cx-3", "F:\\repo", "hello");
    const deps = {
      readSharedSettings: () => defaultSharedSettings,
      getThreads: () => [] as Thread[],
      applyRuntimeEvents: vi.fn<(threadId: string, events: readonly RuntimeEvent[]) => void>(),
      flushRuntimeWrites: vi.fn<(threadId: string) => void>(),
    };
    expect(() =>
      importSessionTranscript({ threadId: "gone", provider: "codex", path }, deps),
    ).toThrow(/thread/iu);
    expect(() =>
      importSessionTranscript(
        { threadId: "t1", provider: "codex", path: join(tmpdir(), "not-there.jsonl") },
        { ...deps, getThreads: () => [thread()] },
      ),
    ).toThrow(Error);
  });
});
