import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeBrowserMetadataCacheForTest,
  createBrowserMetadataCache,
  legacyStoragePayloadFingerprint,
  __resetBrowserMetadataCacheForTest,
  type BrowserMetadataCache,
} from "./browserMetadataCache";
import {
  __setBrowserMetadataCacheTimeoutForTest,
  readRawBrowserMetadataRecordForTest,
  writeBrowserMetadataRecord,
  writeRawBrowserMetadataRecordForTest,
} from "./browserMetadataCacheRecords";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";

const APP_STORE = "poracode-app-v2";

/**
 * Gates on the durable write and delete so tests can hold a commit or a
 * removal in flight while they queue, supersede, or write behind it.
 */
const commitGate = vi.hoisted(() => ({
  hold: false,
  started: 0,
  release: undefined as (() => void) | undefined,
}));

const removeGate = vi.hoisted(() => ({
  hold: false,
  started: 0,
  release: undefined as (() => void) | undefined,
}));

vi.mock("./browserMetadataCacheRecords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./browserMetadataCacheRecords")>();
  return {
    ...actual,
    writeBrowserMetadataRecord: async (
      input: Parameters<typeof actual.writeBrowserMetadataRecord>[0],
    ) => {
      if (commitGate.hold) {
        commitGate.started += 1;
        await new Promise<void>((resolve) => {
          commitGate.release = resolve;
        });
      }
      return actual.writeBrowserMetadataRecord(input);
    },
    deleteBrowserMetadataRecord: async (key: string) => {
      if (removeGate.hold) {
        removeGate.started += 1;
        await new Promise<void>((resolve) => {
          removeGate.release = resolve;
        });
      }
      return actual.deleteBrowserMetadataRecord(key);
    },
  };
});

function snapshot(threadId: string): {
  state: {
    projects: Array<{ id: string }>;
    threads: Array<{ id: string }>;
    view: { kind: "thread"; panes: string[] };
    groupLayouts: Record<string, unknown>;
  };
  version: number;
} {
  return {
    state: {
      projects: [{ id: "project-1" }],
      threads: [{ id: threadId }],
      view: { kind: "thread", panes: [threadId] },
      groupLayouts: {},
    },
    version: 5,
  };
}

function seedRecord(value: unknown, revision = 0): Promise<unknown> {
  return writeBrowserMetadataRecord({
    key: APP_STORE,
    value,
    bytes: 128,
    expectedRevision: revision,
  });
}

/**
 * A legacy key that cannot be deleted (storage unavailable or over quota):
 * the explicit removal must still resolve and drop the durable record, and the
 * surviving bytes are re-migrated by the next session (no tombstone framework).
 * Returns what a reopened session hydrates, so the caller can assert it.
 */
async function failedLegacyRemovalReloadValue(error: DOMException): Promise<unknown> {
  const removeSpy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw error;
  });
  const legacy = JSON.stringify(snapshot("legacy"));
  localStorage.setItem(APP_STORE, legacy);

  await createBrowserMetadataCache().remove(APP_STORE);
  expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  expect(localStorage.getItem(APP_STORE)).toBe(legacy);

  removeSpy.mockRestore();
  closeBrowserMetadataCacheForTest();
  return createBrowserMetadataCache().read(APP_STORE);
}

describe("browser metadata cache", () => {
  beforeEach(async () => {
    localStorage.clear();
    await __resetBrowserMetadataCacheForTest();
    __setBrowserMetadataCacheTimeoutForTest(null);
    commitGate.hold = false;
    commitGate.started = 0;
    commitGate.release = undefined;
    removeGate.hold = false;
    removeGate.started = 0;
    removeGate.release = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __setBrowserMetadataCacheTimeoutForTest(null);
  });

  it("coalesces a synchronous write burst into one commit of the latest snapshot", async () => {
    const cache = createBrowserMetadataCache();
    const writes = Array.from({ length: 50 }, (_, index) =>
      cache.write(APP_STORE, snapshot(`thread-${index}`)),
    );

    await Promise.all(writes);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.revision).toBe(1);
    expect(record?.value).toEqual(snapshot("thread-49"));
  });

  it("keeps at most one pending snapshot behind an in-flight commit", async () => {
    const cache = createBrowserMetadataCache();
    const first = cache.write(APP_STORE, snapshot("first"));
    await Promise.resolve();
    const second = cache.write(APP_STORE, snapshot("second"));
    const third = cache.write(APP_STORE, snapshot("third"));

    await Promise.all([first, second, third]);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.revision).toBe(2);
    expect(record?.value).toEqual(snapshot("third"));
  });

  it("skips a repeated identical snapshot reference instead of committing again", async () => {
    const cache = createBrowserMetadataCache();
    const value = snapshot("stable");

    await cache.write(APP_STORE, value);
    await cache.write(APP_STORE, value);

    expect((await readRawBrowserMetadataRecordForTest(APP_STORE))?.revision).toBe(1);
  });

  it("orders a removal after an in-flight commit and never resurrects the older snapshot", async () => {
    const cache = createBrowserMetadataCache();
    const first = cache.write(APP_STORE, snapshot("first"));
    await Promise.resolve();
    const removal = cache.remove(APP_STORE);
    const later = cache.write(APP_STORE, snapshot("later"));

    await Promise.all([first, removal, later]);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.value).toEqual(snapshot("later"));
    // The delete reset the revision; no pre-removal revision survived it.
    expect(record?.revision).toBe(1);

    closeBrowserMetadataCacheForTest();
    const reopened = createBrowserMetadataCache();
    await expect(reopened.read(APP_STORE)).resolves.toEqual(snapshot("later"));
  });

  it("drops a queued snapshot when a removal arrives before it commits", async () => {
    const cache = createBrowserMetadataCache();
    const droppedWrite = cache.write(APP_STORE, snapshot("dropped"));
    const removal = cache.remove(APP_STORE);

    await Promise.all([droppedWrite, removal]);

    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();

    await cache.write(APP_STORE, snapshot("after-removal"));
    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.value).toEqual(snapshot("after-removal"));
    expect(record?.revision).toBe(1);
  });

  it("settles a superseded queued snapshot while the commit ahead of it is stalled", async () => {
    commitGate.hold = true;
    const cache = createBrowserMetadataCache();
    const first = cache.write(APP_STORE, snapshot("first"));
    await vi.waitFor(() => expect(commitGate.started).toBe(1));

    const superseded = cache.write(APP_STORE, snapshot("superseded"));
    const replacement = cache.write(APP_STORE, snapshot("replacement"));
    // The superseded waiter resolves without the stalled commit finishing.
    await superseded;

    commitGate.hold = false;
    commitGate.release?.();
    await Promise.all([first, replacement]);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.value).toEqual(snapshot("replacement"));
    expect(record?.revision).toBe(2);
  });

  it("settles a dropped queued write and collapses consecutive removals during a stalled commit", async () => {
    commitGate.hold = true;
    const cache = createBrowserMetadataCache();
    const first = cache.write(APP_STORE, snapshot("first"));
    await vi.waitFor(() => expect(commitGate.started).toBe(1));

    const dropped = cache.write(APP_STORE, snapshot("dropped"));
    const firstRemoval = cache.remove(APP_STORE);
    const secondRemoval = cache.remove(APP_STORE);
    await dropped;
    await firstRemoval;

    commitGate.hold = false;
    commitGate.release?.();
    await Promise.all([first, secondRemoval]);

    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  });

  it("recreates the record when the same snapshot reference is written after a removal superseded an in-flight commit", async () => {
    commitGate.hold = true;
    const cache = createBrowserMetadataCache();
    const value = snapshot("inflight");
    const write = cache.write(APP_STORE, value);
    await vi.waitFor(() => expect(commitGate.started).toBe(1));

    const removal = cache.remove(APP_STORE);
    commitGate.hold = false;
    commitGate.release?.();
    await Promise.all([write, removal]);
    // The in-flight commit was durably written and then deleted; it must not
    // have reinstalled the removed record's committed identity.
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();

    await cache.write(APP_STORE, value);
    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.value).toEqual(value);
    expect(record?.revision).toBe(1);
  });

  it("commits an identical write issued while a removal is still committing", async () => {
    commitGate.hold = true;
    const cache = createBrowserMetadataCache();
    const value = snapshot("inflight");
    const write = cache.write(APP_STORE, value);
    await vi.waitFor(() => expect(commitGate.started).toBe(1));

    removeGate.hold = true;
    const removal = cache.remove(APP_STORE);
    commitGate.hold = false;
    commitGate.release?.();
    await write;
    await vi.waitFor(() => expect(removeGate.started).toBe(1));

    // The same state reference arrives while the removal transaction is open:
    // it must queue behind the removal, not dedupe against the removed write.
    const rewrite = cache.write(APP_STORE, value);
    removeGate.hold = false;
    removeGate.release?.();
    await Promise.all([removal, rewrite]);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.value).toEqual(value);
    expect(record?.revision).toBe(1);
  });

  it("hydrates the committed snapshot after a reopen", async () => {
    const cache = createBrowserMetadataCache();
    await cache.write(APP_STORE, snapshot("committed"));

    closeBrowserMetadataCacheForTest();
    const reopened = createBrowserMetadataCache();
    await expect(reopened.read(APP_STORE)).resolves.toEqual(snapshot("committed"));
  });

  it("migrates a legacy localStorage payload once and removes it only after the commit", async () => {
    const legacy = JSON.stringify(snapshot("legacy"));
    localStorage.setItem(APP_STORE, legacy);
    const cache = createBrowserMetadataCache();

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("legacy"));
    expect(localStorage.getItem(APP_STORE)).toBeNull();
    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.migratedFrom).toBe(APP_STORE);
    expect(record?.migratedFingerprint).toBe(legacyStoragePayloadFingerprint(legacy));
    expect(record?.revision).toBe(1);

    const reopened = createBrowserMetadataCache();
    await expect(reopened.read(APP_STORE)).resolves.toEqual(snapshot("legacy"));
    // A committed record is not migrated a second time.
    expect((await readRawBrowserMetadataRecordForTest(APP_STORE))?.revision).toBe(1);
  });

  it("keeps a legacy payload that was rewritten while the migration was in flight", async () => {
    const migrated = JSON.stringify(snapshot("migrated"));
    const rewritten = JSON.stringify(snapshot("rewritten"));
    const cache = createBrowserMetadataCache({
      parseLegacy: async (raw) => {
        // An older app/tab writes a newer payload before the commit runs.
        localStorage.setItem(APP_STORE, rewritten);
        return JSON.parse(raw) as unknown;
      },
    });
    localStorage.setItem(APP_STORE, migrated);

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("migrated"));
    expect(localStorage.getItem(APP_STORE)).toBe(rewritten);
    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.migratedFingerprint).toBe(legacyStoragePayloadFingerprint(migrated));
  });

  it("finishes an interrupted migration removal on the next read", async () => {
    const legacy = JSON.stringify(snapshot("legacy"));
    await writeBrowserMetadataRecord({
      key: APP_STORE,
      value: snapshot("committed-before-crash"),
      bytes: 128,
      expectedRevision: 0,
      migratedFrom: APP_STORE,
      migratedFingerprint: legacyStoragePayloadFingerprint(legacy),
    });
    localStorage.setItem(APP_STORE, legacy);
    const cache = createBrowserMetadataCache();

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("committed-before-crash"));
    expect(localStorage.getItem(APP_STORE)).toBeNull();
  });

  it("keeps a rewritten legacy payload when the committed marker names the old bytes", async () => {
    const migrated = JSON.stringify(snapshot("migrated"));
    const rewritten = JSON.stringify(snapshot("rewritten"));
    await writeBrowserMetadataRecord({
      key: APP_STORE,
      value: snapshot("committed-before-crash"),
      bytes: 128,
      expectedRevision: 0,
      migratedFrom: APP_STORE,
      migratedFingerprint: legacyStoragePayloadFingerprint(migrated),
    });
    localStorage.setItem(APP_STORE, rewritten);
    const cache = createBrowserMetadataCache();

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("committed-before-crash"));
    expect(localStorage.getItem(APP_STORE)).toBe(rewritten);
  });

  it("retains an interrupted migration payload and retries it after a failed commit", async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const legacy = JSON.stringify(snapshot("draft"));
    localStorage.setItem(APP_STORE, legacy);
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError });

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("draft"));
    expect(localStorage.getItem(APP_STORE)).toBe(legacy);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
    putSpy.mockRestore();

    // The next session retries the one-time migration and completes it.
    const retried = createBrowserMetadataCache();
    await expect(retried.read(APP_STORE)).resolves.toEqual(snapshot("draft"));
    expect(localStorage.getItem(APP_STORE)).toBeNull();
  });

  it("preserves unparsable and unknown-format legacy payloads instead of overwriting them", async () => {
    const cache = createBrowserMetadataCache();

    localStorage.setItem(APP_STORE, "{not json");
    await expect(cache.read(APP_STORE)).resolves.toBeNull();
    expect(localStorage.getItem(APP_STORE)).toBe("{not json");
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();

    const futureShape = JSON.stringify({ format: 7, snapshot: { opaque: true } });
    localStorage.setItem(APP_STORE, futureShape);
    await expect(cache.read(APP_STORE)).resolves.toBeNull();
    expect(localStorage.getItem(APP_STORE)).toBe(futureShape);
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  });

  it("degrades to memory when IndexedDB is unavailable and keeps legacy drafts readable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const legacy = JSON.stringify(snapshot("draft"));
    localStorage.setItem(APP_STORE, legacy);
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError });

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("draft"));
    await cache.write(APP_STORE, snapshot("fresh"));
    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("fresh"));
    // Without IndexedDB the legacy payload is the only durable copy: keep it.
    expect(localStorage.getItem(APP_STORE)).toBe(legacy);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("clears the legacy payload on explicit removal so a later session cannot re-migrate it", async () => {
    const legacy = JSON.stringify(snapshot("legacy"));
    localStorage.setItem(APP_STORE, legacy);
    const cache = createBrowserMetadataCache();

    await cache.remove(APP_STORE);

    expect(localStorage.getItem(APP_STORE)).toBeNull();
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();

    closeBrowserMetadataCacheForTest();
    const reopened = createBrowserMetadataCache();
    await expect(reopened.read(APP_STORE)).resolves.toBeNull();
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  });

  it("clears the legacy payload on explicit removal while IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const legacy = JSON.stringify(snapshot("draft"));
    localStorage.setItem(APP_STORE, legacy);
    const cache = createBrowserMetadataCache();

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("draft"));
    await cache.remove(APP_STORE);
    expect(localStorage.getItem(APP_STORE)).toBeNull();

    vi.unstubAllGlobals();
    closeBrowserMetadataCacheForTest();
    const reopened = createBrowserMetadataCache();
    await expect(reopened.read(APP_STORE)).resolves.toBeNull();
  });

  it("preserves unparsable and unknown-format legacy payloads across an explicit removal", async () => {
    const cache = createBrowserMetadataCache();

    localStorage.setItem(APP_STORE, "{not json");
    await cache.remove(APP_STORE);
    expect(localStorage.getItem(APP_STORE)).toBe("{not json");

    const futureShape = JSON.stringify({ format: 7, snapshot: { opaque: true } });
    localStorage.setItem(APP_STORE, futureShape);
    await cache.remove(APP_STORE);
    expect(localStorage.getItem(APP_STORE)).toBe(futureShape);
  });

  it("preserves a legacy payload rewritten while an explicit removal parsed it", async () => {
    const migrated = JSON.stringify(snapshot("migrated"));
    const rewritten = JSON.stringify(snapshot("rewritten"));
    const cache = createBrowserMetadataCache({
      parseLegacy: async (raw) => {
        // An older app/tab writes newer bytes while the removal's parse runs.
        localStorage.setItem(APP_STORE, rewritten);
        return JSON.parse(raw) as unknown;
      },
    });
    localStorage.setItem(APP_STORE, migrated);

    await cache.remove(APP_STORE);

    expect(localStorage.getItem(APP_STORE)).toBe(rewritten);
  });

  it("keeps a concurrent read from re-migrating bytes an explicit removal is clearing", async () => {
    const legacy = JSON.stringify(snapshot("legacy"));
    localStorage.setItem(APP_STORE, legacy);
    let parseStarted: (() => void) | undefined;
    let releaseParse: (() => void) | undefined;
    const parseStartedPromise = new Promise<void>((resolve) => {
      parseStarted = resolve;
    });
    const cache = createBrowserMetadataCache({
      parseLegacy: async (raw) => {
        parseStarted?.();
        await new Promise<void>((resolve) => {
          releaseParse = resolve;
        });
        return JSON.parse(raw) as unknown;
      },
    });

    const removal = cache.remove(APP_STORE);
    await parseStartedPromise;
    // The drain holds the name busy across the cleanup, so a read issued while
    // the parse is in flight cannot fall through and re-migrate the bytes.
    await expect(cache.read(APP_STORE)).resolves.toBeNull();

    releaseParse?.();
    await removal;
    expect(localStorage.getItem(APP_STORE)).toBeNull();
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  });

  it("preserves newer legacy bytes when an explicit removal follows an interrupted migration", async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const migrated = JSON.stringify(snapshot("migrated"));
    const rewritten = JSON.stringify(snapshot("rewritten"));
    localStorage.setItem(APP_STORE, migrated);
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError });

    // The failed commit leaves the migrated bytes in place and marks them.
    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("migrated"));
    expect(localStorage.getItem(APP_STORE)).toBe(migrated);
    putSpy.mockRestore();

    // An older tab rewrites newer bytes before the explicit removal.
    localStorage.setItem(APP_STORE, rewritten);
    await cache.remove(APP_STORE);

    expect(localStorage.getItem(APP_STORE)).toBe(rewritten);
  });

  it("resolves an explicit removal when legacy storage removal is unavailable", async () => {
    await expect(
      failedLegacyRemovalReloadValue(new DOMException("access denied", "SecurityError")),
    ).resolves.toEqual(snapshot("legacy"));
  });

  it("resolves an explicit removal when legacy storage removal hits quota", async () => {
    await expect(
      failedLegacyRemovalReloadValue(new DOMException("quota", "QuotaExceededError")),
    ).resolves.toEqual(snapshot("legacy"));
  });

  it("reports a quota write failure once and keeps serving memory", async () => {
    const putSpy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError });

    await cache.write(APP_STORE, snapshot("a"));
    await cache.write(APP_STORE, snapshot("b"));

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("b"));
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
    putSpy.mockRestore();
  });

  it("preserves an unknown future-format record and serves the session from memory", async () => {
    await writeRawBrowserMetadataRecordForTest({
      key: APP_STORE,
      formatVersion: 2,
      revision: 7,
      updatedAt: 1,
      bytes: 8,
      value: { future: true },
    });
    const cache = createBrowserMetadataCache();

    await expect(cache.read(APP_STORE)).resolves.toBeNull();
    await cache.write(APP_STORE, snapshot("fresh"));

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.formatVersion).toBe(2);
    expect(record?.revision).toBe(7);
    expect(record?.value).toEqual({ future: true });
    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("fresh"));
  });

  it("preserves a future-format record across a removal", async () => {
    await writeRawBrowserMetadataRecordForTest({
      key: APP_STORE,
      formatVersion: 2,
      revision: 7,
      updatedAt: 1,
      bytes: 8,
      value: { future: true },
    });
    const cache = createBrowserMetadataCache();

    await cache.read(APP_STORE);
    await cache.remove(APP_STORE);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.formatVersion).toBe(2);
    expect(record?.value).toEqual({ future: true });
    await expect(cache.read(APP_STORE)).resolves.toBeNull();
  });

  it("preserves a future-format record when a write arrives before any read", async () => {
    const otherStore = "poracode-thread-todo-dock-v1";
    await writeRawBrowserMetadataRecordForTest({
      key: otherStore,
      formatVersion: 3,
      revision: 4,
      updatedAt: 1,
      bytes: 8,
      value: { future: true },
    });
    const cache = createBrowserMetadataCache();

    await cache.write(otherStore, { state: { collapsed: true }, version: 1 });

    const record = await readRawBrowserMetadataRecordForTest(otherStore);
    expect(record?.formatVersion).toBe(3);
    expect(record?.value).toEqual({ future: true });
  });

  it("does not cache values that are not Zustand persist payloads", async () => {
    const cache = createBrowserMetadataCache();

    await cache.write(APP_STORE, { notAPersistPayload: true });

    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
    // Memory still serves the session's own write.
    await expect(cache.read(APP_STORE)).resolves.toEqual({ notAPersistPayload: true });
  });

  it("bounds a snapshot over the record cap and preserves the active view and pinned panes", async () => {
    const threads = Array.from({ length: 40 }, (_, index) => ({
      id: `thread-${index}`,
      filler: "x".repeat(200),
    }));
    const oversized = {
      state: {
        projects: [{ id: "project-1" }],
        threads,
        view: { kind: "thread" as const, panes: ["thread-38"] },
        groupLayouts: { group: 1 },
      },
      version: 5,
    };
    const cache = createBrowserMetadataCache({ maxRecordBytes: 2048 });

    await cache.write(APP_STORE, oversized);

    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.truncated).toBe(true);
    expect(record?.droppedThreadCount).toBeGreaterThan(0);
    const stored = record?.value as typeof oversized;
    expect(stored.state.view).toEqual({ kind: "thread", panes: ["thread-38"] });
    expect(stored.state.projects).toEqual([{ id: "project-1" }]);
    expect(stored.state.groupLayouts).toEqual({ group: 1 });
    expect(stored.state.threads.some((thread) => thread.id === "thread-38")).toBe(true);
    expect(stored.state.threads.length).toBeLessThan(threads.length);

    closeBrowserMetadataCacheForTest();
    const reopened = createBrowserMetadataCache();
    await expect(reopened.read(APP_STORE)).resolves.toEqual(stored);
  });

  it("keeps composer drafts loadable when an oversized snapshot is truncated", async () => {
    const { composerDraftStorage } = await import("./composerDraftStorage");
    const drafts = composerDraftStorage();
    expect(drafts).toBeDefined();
    const draft = {
      segments: [{ kind: "text" as const, content: "unsent draft" }],
      attachments: [],
    };
    drafts!.save("project", "project-1", draft);
    drafts!.flush();

    const threads = Array.from({ length: 40 }, (_, index) => ({
      id: `thread-${index}`,
      filler: "x".repeat(200),
    }));
    const oversized = {
      state: {
        projects: [{ id: "project-1" }],
        threads,
        view: { kind: "thread" as const, panes: ["thread-38"] },
        groupLayouts: {},
      },
      version: 5,
    };
    const cache = createBrowserMetadataCache({ maxRecordBytes: 2048 });

    await cache.write(APP_STORE, oversized);

    expect((await readRawBrowserMetadataRecordForTest(APP_STORE))?.truncated).toBe(true);
    // Drafts live in localStorage, outside the cached snapshot, so truncation
    // cannot drop them.
    expect(drafts!.load("project")["project-1"]?.segments[0]).toEqual({
      kind: "text",
      content: "unsent draft",
    });
    drafts!.remove("project", "project-1");
  });

  it("keeps a non-projectable oversized snapshot in memory and reports once", async () => {
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError, maxRecordBytes: 256 });
    const oversized = {
      state: {
        projects: [],
        view: { kind: "home" as const },
        groupLayouts: {},
        blob: "x".repeat(4096),
      },
      version: 5,
    };

    await cache.write(APP_STORE, oversized);

    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
    await expect(cache.read(APP_STORE)).resolves.toEqual(oversized);
    await cache.write(APP_STORE, { ...oversized, version: 6 });
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("bounds the aggregate cache across store names, not just per record", async () => {
    const otherStore = "poracode-thread-todo-dock-v1";
    const smallA = { state: { id: "a", filler: "a".repeat(50) }, version: 1 };
    const smallB = { state: { id: "b", filler: "b".repeat(50) }, version: 1 };
    const large = { state: { id: "c", filler: "c".repeat(4096) }, version: 1 };
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({
      reportError,
      maxRecordBytes: 64 * 1024,
      maxTotalBytes: estimateCacheValueBytes(smallA) + estimateCacheValueBytes(smallB) + 16,
    });

    await cache.write(otherStore, smallA);
    await cache.write("poracode-thread-background-tasks-dock-v1", smallB);
    await cache.write(APP_STORE, large);

    expect(await readRawBrowserMetadataRecordForTest(otherStore)).toBeDefined();
    expect(
      await readRawBrowserMetadataRecordForTest("poracode-thread-background-tasks-dock-v1"),
    ).toBeDefined();
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
    await expect(cache.read(APP_STORE)).resolves.toEqual(large);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("orders revisions across independent writers", async () => {
    const tabA = createBrowserMetadataCache();
    const tabB = createBrowserMetadataCache();

    await tabA.write(APP_STORE, snapshot("a"));
    await tabB.read(APP_STORE);
    await tabB.write(APP_STORE, snapshot("b"));
    expect((await readRawBrowserMetadataRecordForTest(APP_STORE))?.revision).toBe(2);

    // A later session observes the committed revision and commits on top of it.
    const tabC = createBrowserMetadataCache();
    await tabC.read(APP_STORE);
    await tabC.write(APP_STORE, snapshot("c"));
    const record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.revision).toBe(3);
    expect(record?.value).toEqual(snapshot("c"));
  });

  it("rejects a delayed snapshot after another writer commits a newer revision", async () => {
    await seedRecord(snapshot("r1"));
    const tabA = createBrowserMetadataCache();
    const tabB = createBrowserMetadataCache();
    await expect(tabA.read(APP_STORE)).resolves.toEqual(snapshot("r1"));
    await tabB.read(APP_STORE);

    await tabB.write(APP_STORE, snapshot("newer"));
    // Tab A's write is based on r1; it must not overwrite the newer commit.
    await tabA.write(APP_STORE, snapshot("stale"));

    let record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.revision).toBe(2);
    expect(record?.value).toEqual(snapshot("newer"));
    // The session keeps its own newer state and can commit on top afterwards.
    await expect(tabA.read(APP_STORE)).resolves.toEqual(snapshot("stale"));
    await tabA.write(APP_STORE, snapshot("after"));
    record = await readRawBrowserMetadataRecordForTest(APP_STORE);
    expect(record?.revision).toBe(3);
    expect(record?.value).toEqual(snapshot("after"));
  });

  it("keeps the newer in-memory snapshot when a disk read was already in flight", async () => {
    await seedRecord(snapshot("disk"));
    const cache = createBrowserMetadataCache();

    const pendingRead = cache.read(APP_STORE);
    const write = cache.write(APP_STORE, snapshot("memory"));
    await write;

    // The delayed disk read must not replace the session's newer snapshot.
    await expect(pendingRead).resolves.toEqual(snapshot("memory"));
    // The unobserved write was compare-and-set rejected, so the older disk
    // value is still the durable one...
    expect((await readRawBrowserMetadataRecordForTest(APP_STORE))?.value).toEqual(snapshot("disk"));
    // ...and the next write commits the session's newer snapshot.
    await cache.write(APP_STORE, snapshot("after"));
    expect((await readRawBrowserMetadataRecordForTest(APP_STORE))?.value).toEqual(
      snapshot("after"),
    );
  });

  it("does not resurrect a removed record through a delayed disk read", async () => {
    await seedRecord(snapshot("disk"));
    const cache = createBrowserMetadataCache();

    const pendingRead = cache.read(APP_STORE);
    const removal = cache.remove(APP_STORE);
    await removal;

    await expect(pendingRead).resolves.toBeNull();
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  });

  it("fails fast when opening the cache is blocked by another connection", async () => {
    const close = vi.fn<() => void>();
    const request = {
      result: { close } as unknown as IDBDatabase,
    } as unknown as IDBOpenDBRequest & { onblocked?: (event: Event) => void };
    const openSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => request);
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError });

    const write = cache.write(APP_STORE, snapshot("blocked"));
    await vi.waitFor(() => expect(typeof request.onblocked).toBe("function"));
    request.onblocked?.(new Event("blocked"));
    await write;

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    // A success that arrives after the caller degraded is released, not adopted.
    (request as unknown as { onsuccess?: () => void }).onsuccess?.();
    expect(close).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  it("degrades instead of hanging when IndexedDB never answers, releasing a late connection", async () => {
    __setBrowserMetadataCacheTimeoutForTest(10);
    const close = vi.fn<() => void>();
    const request = {
      result: { close } as unknown as IDBDatabase,
    } as unknown as IDBOpenDBRequest;
    const openSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => request);
    const reportError = vi.fn<(operation: string, error: unknown) => void>();
    const cache = createBrowserMetadataCache({ reportError });

    await cache.write(APP_STORE, snapshot("late"));
    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("late"));
    expect(reportError).toHaveBeenCalledTimes(1);

    (request as unknown as { onsuccess?: () => void }).onsuccess?.();
    expect(close).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  it("reads its own queued snapshot while a commit is still in flight", async () => {
    const cache = createBrowserMetadataCache();
    const pending = cache.write(APP_STORE, snapshot("pending"));
    await Promise.resolve();

    await expect(cache.read(APP_STORE)).resolves.toEqual(snapshot("pending"));
    await pending;
  });

  it("keeps the memory map free of removed values after a removal", async () => {
    const cache: BrowserMetadataCache = createBrowserMetadataCache();
    await cache.write(APP_STORE, snapshot("old"));
    await cache.remove(APP_STORE);

    await expect(cache.read(APP_STORE)).resolves.toBeNull();
    expect(await readRawBrowserMetadataRecordForTest(APP_STORE)).toBeUndefined();
  });
});
