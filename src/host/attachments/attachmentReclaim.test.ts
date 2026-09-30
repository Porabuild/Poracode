import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Experiment,
  ExperimentCandidate,
  ExperimentCandidateThreadCreation,
  Project,
} from "@/shared/contracts";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import {
  AttachmentReclaimService,
  RECLAIM_TRASH_DIR_NAME,
  REMOVAL_QUEUE_LIMIT,
} from "./attachmentReclaim";
import {
  getThreadAttachmentDir,
  getThreadAttachmentDirName,
  saveUploadedAttachmentFile,
} from "./attachmentStorage";
import {
  closeDatabase,
  dbApplyExperimentIntent,
  dbDeleteProject,
  dbDeleteThread,
  dbListThreadIds,
  dbUpsertProject,
  dbUpsertThread,
  initDatabase,
  onThreadsDeleted,
  type DbExperimentIntentCommand,
} from "@/host/db";
import { getSqlite } from "@/host/db/connection";
import { runThreadHousekeeping } from "@/backend/ThreadHousekeepingService";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { resetRuntimePersistenceForTests } from "@/host/db/runtimePersistenceRuntime";
import { resetProjectLifecycleGuardForTests } from "@/host/db/projectLifecycleGuard";

function testProject(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function candidate(threadId: string): ExperimentCandidate {
  return {
    threadId,
    agentKind: "claude",
    worktreeBranch: `poracode/experiment-${threadId}`,
    worktreeOwnerToken: `owner:${threadId}`,
    worktreeState: "pending",
  };
}

function experimentRecord(id: string, projectId = "p1"): Experiment {
  return {
    id,
    projectId,
    title: `Experiment ${id}`,
    prompt: `compare ${id}`,
    baseBranch: "main",
    baseCommit: "a".repeat(40),
    candidates: [candidate("c1"), candidate("c2")],
    status: "running",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function threadSpec(record: Experiment, threadId: string): ExperimentCandidateThreadCreation {
  const recordCandidate = record.candidates.find((entry) => entry.threadId === threadId)!;
  return {
    threadId,
    projectId: record.projectId,
    title: `Candidate ${threadId}`,
    agentKind: "claude",
    config: { model: "opus" },
    worktreeBranch: recordCandidate.worktreeBranch,
  };
}

function createCommand(record: Experiment): DbExperimentIntentCommand {
  return {
    kind: "create",
    experimentId: record.id,
    record,
    threads: record.candidates.map((entry) => threadSpec(record, entry.threadId)),
  };
}

function removeCommand(
  experimentId: string,
  revision: string,
  candidateDisposition: "delete" | "release",
): DbExperimentIntentCommand {
  return { kind: "remove", experimentId, revision, candidateDisposition };
}

describe.skipIf(!sqliteAvailable)("AttachmentReclaimService (real sqlite + filesystem)", () => {
  let root: string;
  let paths: ReturnType<typeof resolvePoracodePaths>;
  let previousBinding: string | undefined;
  const unsubscribers: Array<() => void> = [];
  const services: AttachmentReclaimService[] = [];

  /** Wire a service exactly like the durable-services composition does. */
  function wire(
    overrides: Partial<ConstructorParameters<typeof AttachmentReclaimService>[0]> = {},
  ): AttachmentReclaimService {
    const service = new AttachmentReclaimService({
      attachmentsDir: paths.attachmentsDir,
      listLiveThreadIds: dbListThreadIds,
      startupScanDelayMs: 10,
      ...overrides,
    });
    unsubscribers.push(onThreadsDeleted((ids) => service.notifyDeletedThreadIds(ids)));
    services.push(service);
    return service;
  }

  function trashDir(): string {
    return join(paths.attachmentsDir, RECLAIM_TRASH_DIR_NAME);
  }

  function trashEntries(): string[] {
    return existsSync(trashDir()) ? readdirSync(trashDir()) : [];
  }

  beforeEach(() => {
    previousBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    root = mkdtempSync(join(tmpdir(), "poracode-attachment-reclaim-"));
    paths = resolvePoracodePaths(root);
    initDatabase(join(root, "state.sqlite"));
    resetRuntimePersistenceForTests();
  });

  afterEach(async () => {
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe();
    await Promise.all(services.splice(0).map((service) => service.dispose()));
    resetProjectLifecycleGuardForTests();
    resetRuntimePersistenceForTests();
    closeDatabase();
    try {
      chmodSync(paths.attachmentsDir, 0o755);
    } catch {
      // Root may not exist for tests that never wrote attachments.
    }
    rmSync(root, { recursive: true, force: true });
    if (previousBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousBinding;
  });

  it("reclaims a deleted thread's directory through the committed-delete seam", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);
    const saved = saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([1, 2, 3]),
      fileName: "photo.png",
    });
    expect(existsSync(saved)).toBe(true);

    wire();
    dbDeleteThread("thread-1");

    await vi.waitFor(() => expect(existsSync(join(paths.attachmentsDir, "thread-1"))).toBe(false));
    await vi.waitFor(() => expect(trashEntries()).toEqual([]));
  });

  it("reclaims every directory of a deleted project and keeps a live neighbor", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertProject(testProject("p2"), 1);
    dbUpsertThread({ ...{ ...testThread(), projectId: "p1" }, id: "gone-1" }, 0);
    dbUpsertThread({ ...{ ...testThread(), projectId: "p1" }, id: "gone-2" }, 1);
    dbUpsertThread({ ...testThread(), id: "kept-1", projectId: "p2" }, 0);
    saveUploadedAttachmentFile(paths, {
      threadId: "gone-1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });
    saveUploadedAttachmentFile(paths, {
      threadId: "gone-2",
      data: new Uint8Array([2]),
      fileName: "b.png",
    });
    const kept = saveUploadedAttachmentFile(paths, {
      threadId: "kept-1",
      data: new Uint8Array([3]),
      fileName: "c.png",
    });

    wire();
    dbDeleteProject("p1");

    await vi.waitFor(() => expect(dbListThreadIds().sort()).toEqual(["kept-1"]));
    await vi.waitFor(() => {
      expect(existsSync(join(paths.attachmentsDir, getThreadAttachmentDirName("gone-1")))).toBe(
        false,
      );
      expect(existsSync(join(paths.attachmentsDir, getThreadAttachmentDirName("gone-2")))).toBe(
        false,
      );
    });
    expect(existsSync(kept)).toBe(true);
  });

  it("reclaims experiment-retired candidate directories", async () => {
    dbUpsertProject(testProject("p1"), 0);
    const record = experimentRecord("E1");
    const created = dbApplyExperimentIntent(createCommand(record));
    expect(created).toMatchObject({ status: "applied" });
    if (created.status !== "applied") return;
    saveUploadedAttachmentFile(paths, {
      threadId: "c1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });
    saveUploadedAttachmentFile(paths, {
      threadId: "c2",
      data: new Uint8Array([2]),
      fileName: "b.png",
    });

    wire();
    const outcome = dbApplyExperimentIntent(removeCommand("E1", created.revision, "delete"));
    expect(outcome).toMatchObject({ status: "applied", deletedThreadIds: ["c1", "c2"] });

    await vi.waitFor(() => {
      expect(existsSync(join(paths.attachmentsDir, getThreadAttachmentDirName("c1")))).toBe(false);
      expect(existsSync(join(paths.attachmentsDir, getThreadAttachmentDirName("c2")))).toBe(false);
    });
  });

  it("reclaims a housekeeping purge through the same central owner", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...{ ...testThread(), projectId: "p1" }, id: "purge-1" }, 0);
    const archivedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    getSqlite()
      .prepare("UPDATE threads SET archived = 1, archived_at = ?, done = 1 WHERE id = ?")
      .run(archivedAt, "purge-1");
    saveUploadedAttachmentFile(paths, {
      threadId: "purge-1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });

    wire();
    const report = await runThreadHousekeeping({
      getAutoArchiveDoneAfterDays: () => 0,
      now: () => new Date().toISOString(),
      runThreadMutation: (_threadId, operation) => operation(),
      closeThreadConfirmed: async () => true,
      deleteThread: dbDeleteThread,
      publishThreadsChanged: () => {},
    });
    expect(report.purgedThreadIds).toEqual(["purge-1"]);

    await vi.waitFor(() =>
      expect(existsSync(join(paths.attachmentsDir, getThreadAttachmentDirName("purge-1")))).toBe(
        false,
      ),
    );
  });

  it("keeps the directory when an outer transaction rolled the delete back", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);
    saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });

    wire();
    expect(() =>
      getSqlite().transaction(() => {
        dbDeleteThread("thread-1");
        throw new Error("outer rollback");
      })(),
    ).toThrow("outer rollback");

    // The notification fired inside the rolled-back savepoint; the reclaimer's
    // live-row recheck — not the notification — must decide.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getSqlite().prepare("SELECT id FROM threads WHERE id = ?").get("thread-1")).toBeTruthy();
    expect(existsSync(join(paths.attachmentsDir, "thread-1"))).toBe(true);
  });

  it("keeps the directory when the id is re-upserted before the drain runs", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);
    const file = saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });

    wire();
    dbDeleteThread("thread-1");
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(existsSync(file)).toBe(true);
    expect(dbListThreadIds()).toEqual(["thread-1"]);
  });

  it("keeps a surviving thread's directory on shared 12-char names and case aliases", async () => {
    dbUpsertProject(testProject("p1"), 0);
    const survivor = "aaaaaaaa1111-live-1";
    const reclaimed = "aaaaaaaa1111-dead-9";
    const caseSurvivor = "ABCDEF123456-live";
    const caseReclaimed = "abcdef123456-dead";
    dbUpsertThread({ ...testThread(), projectId: "p1", id: survivor }, 0);
    dbUpsertThread({ ...testThread(), id: caseSurvivor, projectId: "p1" }, 1);
    dbUpsertThread({ ...testThread(), projectId: "p1", id: reclaimed }, 2);
    dbUpsertThread({ ...testThread(), id: caseReclaimed, projectId: "p1" }, 3);
    const sharedDir = getThreadAttachmentDirName(survivor);
    expect(sharedDir).toBe(getThreadAttachmentDirName(reclaimed));
    const sharedFile = saveUploadedAttachmentFile(paths, {
      threadId: survivor,
      data: new Uint8Array([1]),
      fileName: "shared.png",
    });
    const caseFile = saveUploadedAttachmentFile(paths, {
      threadId: caseSurvivor,
      data: new Uint8Array([2]),
      fileName: "case.png",
    });

    const readLive = vi.fn<() => string[]>(dbListThreadIds);
    wire({ listLiveThreadIds: readLive });
    dbDeleteThread(reclaimed);
    dbDeleteThread(caseReclaimed);

    await vi.waitFor(() => expect(readLive).toHaveBeenCalled());
    expect(trashEntries()).toEqual([]);
    expect(existsSync(sharedFile)).toBe(true);
    expect(existsSync(caseFile)).toBe(true);
  });

  it("keeps staging directories for a deleted staging-id row and the backlog scan", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1", id: "draft-abc123" }, 0);
    const draftFile = saveUploadedAttachmentFile(paths, {
      threadId: "draft-abc123",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });
    const retained = ["draft-staged", "remote-projected", "handoff-context", "picker-image"];
    for (const directory of retained) {
      mkdirSync(join(paths.attachmentsDir, directory), { recursive: true });
      writeFileSync(join(paths.attachmentsDir, directory, "image.png"), "image");
    }
    mkdirSync(join(paths.attachmentsDir, "plain-orphan"), { recursive: true });

    const service = wire();
    service.start();
    dbDeleteThread("draft-abc123");

    await vi.waitFor(() =>
      expect(existsSync(join(paths.attachmentsDir, "plain-orphan"))).toBe(false),
    );
    expect(existsSync(draftFile)).toBe(true);
    for (const directory of retained) {
      expect(existsSync(join(paths.attachmentsDir, directory, "image.png"))).toBe(true);
    }
  });

  it.each([
    ["Σ-thread", "ς-thread"],
    ["SS-thread", "ß-thread"],
  ])("retains Unicode case aliases of live %s when %s is deleted", async (live, alias) => {
    const readLive = vi.fn<() => string[]>(() => [live]);
    const service = wire({ listLiveThreadIds: readLive });
    const file = saveUploadedAttachmentFile(paths, {
      threadId: alias,
      data: new Uint8Array([1]),
      fileName: "keep.txt",
    });
    service.notifyDeletedThreadIds([alias]);
    await vi.waitFor(() => expect(readLive).toHaveBeenCalled());
    expect(existsSync(file)).toBe(true);
    expect(trashEntries()).toEqual([]);
  });

  it("retains a live directory when truncation split a Unicode surrogate pair", async () => {
    const threadId = "abcdefghijk😀";
    const file = saveUploadedAttachmentFile(paths, {
      threadId,
      data: new Uint8Array([1]),
      fileName: "keep.txt",
    });
    mkdirSync(join(paths.attachmentsDir, "unrelated-orphan"));
    wire({ listLiveThreadIds: () => [threadId] }).start();
    await vi.waitFor(() =>
      expect(existsSync(join(paths.attachmentsDir, "unrelated-orphan"))).toBe(false),
    );
    expect(existsSync(file)).toBe(true);
  });

  it.each(["abc?def-123456", ".", ".."])(
    "keeps the writer's directory mapping for live thread %s during the backlog scan",
    async (threadId) => {
      const directory = getThreadAttachmentDir(paths, threadId);
      mkdirSync(directory, { recursive: true });
      const image = join(directory, "image.png");
      writeFileSync(image, "referenced image");
      mkdirSync(join(paths.attachmentsDir, "sentinel-orphan"), { recursive: true });

      const service = wire({ listLiveThreadIds: () => [threadId] });
      service.start();

      // The sentinel proves the scan actually ran; the writer-mapped directory
      // for the live id must survive it.
      await vi.waitFor(() =>
        expect(existsSync(join(paths.attachmentsDir, "sentinel-orphan"))).toBe(false),
      );
      expect(existsSync(image)).toBe(true);
    },
  );

  it("never destroys a write that recreates the namespace after detachment", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);
    saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([1]),
      fileName: "old.png",
    });

    wire();
    dbDeleteThread("thread-1");
    await vi.waitFor(() => expect(existsSync(join(paths.attachmentsDir, "thread-1"))).toBe(false));

    // An upload for the just-deleted id recreates the original directory.
    const recreated = saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([2]),
      fileName: "new.png",
    });

    // The detached trash copy finishes its async removal without touching the
    // recreated directory.
    await vi.waitFor(() => expect(trashEntries()).toEqual([]));
    expect(existsSync(recreated)).toBe(true);
  });

  it("isolates reclamation failures from the committed mutation and retries from the backlog", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);
    const file = saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });
    const reportError = vi.fn<(error: unknown) => void>();

    wire({ reportError });
    chmodSync(paths.attachmentsDir, 0o555);
    expect(() => dbDeleteThread("thread-1")).not.toThrow();
    expect(dbListThreadIds()).toEqual([]);
    await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(existsSync(file)).toBe(true);

    chmodSync(paths.attachmentsDir, 0o755);
    const retry = new AttachmentReclaimService({
      attachmentsDir: paths.attachmentsDir,
      listLiveThreadIds: dbListThreadIds,
      startupScanDelayMs: 10,
    });
    services.push(retry);
    retry.start();
    await vi.waitFor(() => expect(existsSync(file)).toBe(false));
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("joins in-flight removals on dispose, abandons queued ones, and the next startup sweeps their trash", async () => {
    dbUpsertProject(testProject("p1"), 0);
    for (const id of ["gone-1", "gone-2", "gone-3"]) {
      dbUpsertThread({ ...testThread(), projectId: "p1", id }, 0);
      saveUploadedAttachmentFile(paths, {
        threadId: id,
        data: new Uint8Array([1]),
        fileName: "a.png",
      });
    }
    const pending = new Map<string, () => void>();
    let calls = 0;
    const service = wire({
      removeDetached: (target) =>
        new Promise<void>((resolve) => {
          calls += 1;
          pending.set(target, resolve);
        }),
    });
    dbDeleteThread("gone-1");
    dbDeleteThread("gone-2");
    dbDeleteThread("gone-3");
    // All three detach (detachment never waits for removal); only two
    // removals start — bounded concurrency holds the third in the queue.
    await vi.waitFor(() => expect(trashEntries().length).toBe(3));

    let disposed = false;
    const disposal = service.dispose().then(() => {
      disposed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toBe(2);
    expect(disposed).toBe(false);

    for (const resolve of pending.values()) resolve();
    await disposal;
    expect(disposed).toBe(true);
    // The injected removal never deleted anything on disk, so all three trash
    // entries remain; the queued third one was never attempted.
    expect(trashEntries().length).toBe(3);

    const next = new AttachmentReclaimService({
      attachmentsDir: paths.attachmentsDir,
      listLiveThreadIds: dbListThreadIds,
      startupScanDelayMs: 10,
    });
    services.push(next);
    next.start();
    await vi.waitFor(() => expect(trashEntries()).toEqual([]));
  });

  it("reclaims startup backlog orphans and sweeps stale trash", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1", id: "purged-before-restart" }, 0);
    const orphan = saveUploadedAttachmentFile(paths, {
      threadId: "purged-before-restart",
      data: new Uint8Array([1]),
      fileName: "old.png",
    });
    dbDeleteThread("purged-before-restart");
    mkdirSync(join(paths.attachmentsDir, RECLAIM_TRASH_DIR_NAME, "leftover.abc"), {
      recursive: true,
    });
    writeFileSync(join(paths.attachmentsDir, RECLAIM_TRASH_DIR_NAME, "leftover.abc", "f"), "f");

    const service = wire();
    service.start();

    await vi.waitFor(() => expect(existsSync(orphan)).toBe(false));
    await vi.waitFor(() => expect(trashEntries()).toEqual([]));
  });

  it("revalidates every backlog batch against a fresh live-row read, never a stale snapshot", async () => {
    let reads = 0;
    const service = wire({
      listLiveThreadIds: () => {
        reads += 1;
        // First read: every entry looks owned. Later batch reads: nothing is.
        return reads === 1
          ? [...Array(65).keys()].map((index) => `entry-${String(index).padStart(3, "0")}`)
          : [];
      },
    });
    for (let index = 0; index < 65; index += 1) {
      mkdirSync(join(paths.attachmentsDir, `entry-${String(index).padStart(3, "0")}`), {
        recursive: true,
      });
    }

    service.start();
    // Exactly the last batch's entry saw the fresh second read and was
    // detached; the 64 first-batch entries were retained by the fresh first
    // read. A stale-snapshot scan would detach none. (The detached trash copy
    // is removed asynchronously, so the stable root count is the assertion.)
    await vi.waitFor(() =>
      expect(
        readdirSync(paths.attachmentsDir).filter((entry) => !entry.startsWith(".")).length,
      ).toBe(64),
    );
    expect(reads).toBe(2);
  });

  it("refuses an unsafe derived directory name instead of targeting the root", async () => {
    dbUpsertProject(testProject("p1"), 0);
    mkdirSync(join(paths.attachmentsDir, "kept"), { recursive: true });
    const reportError = vi.fn<(error: unknown) => void>();
    const service = wire({ reportError });

    service.notifyDeletedThreadIds([""]);

    await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1));
    // The empty name would have joined onto the root itself; the root and its
    // contents must be untouched.
    expect(readdirSync(paths.attachmentsDir).sort()).toEqual(["kept"]);
  });

  it("treats a missing attachments root as expected instead of reporting an error", async () => {
    const reportError = vi.fn<(error: unknown) => void>();
    const service = new AttachmentReclaimService({
      attachmentsDir: join(root, "does-not-exist"),
      listLiveThreadIds: () => [],
      reportError,
      startupScanDelayMs: 10,
    });
    services.push(service);
    service.start();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(reportError).not.toHaveBeenCalled();
    await service.dispose();
  });

  it("leaves unknown non-directory root entries untouched", async () => {
    mkdirSync(paths.attachmentsDir, { recursive: true });
    writeFileSync(join(paths.attachmentsDir, "stray-file"), "stray");
    writeFileSync(join(paths.attachmentsDir, "thread-1"), "file at a derived name");

    const service = wire({ listLiveThreadIds: () => [] });
    service.start();
    service.notifyDeletedThreadIds(["thread-1"]);
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(existsSync(join(paths.attachmentsDir, "stray-file"))).toBe(true);
    expect(existsSync(join(paths.attachmentsDir, "thread-1"))).toBe(true);
    expect(existsSync(trashDir())).toBe(false);
  });

  it("keeps root entries whose names are Windows trailing or normalization aliases of a live thread", async () => {
    const nfcLive = "café-live-1";
    const nfdEntry = "café-live-1";
    const service = wire({ listLiveThreadIds: () => [nfcLive, "abcdef123456"] });
    for (const entry of [nfdEntry, "abcdef123456.", "abcdef123456 "]) {
      mkdirSync(join(paths.attachmentsDir, entry), { recursive: true });
    }
    mkdirSync(join(paths.attachmentsDir, "unrelated-orphan"), { recursive: true });

    service.start();
    await vi.waitFor(() =>
      expect(existsSync(join(paths.attachmentsDir, "unrelated-orphan"))).toBe(false),
    );
    expect(existsSync(join(paths.attachmentsDir, nfdEntry))).toBe(true);
    expect(existsSync(join(paths.attachmentsDir, "abcdef123456."))).toBe(true);
    expect(existsSync(join(paths.attachmentsDir, "abcdef123456 "))).toBe(true);
  });

  it.each(["notifications", "startup"] as const)(
    "bounds the removal queue and resumes %s overflow cleanup without a server restart",
    async (source) => {
      const ids = [...Array(REMOVAL_QUEUE_LIMIT + 5).keys()].map(
        (index) => `bulk-${String(index).padStart(3, "0")}`,
      );
      for (const id of ids) {
        mkdirSync(join(paths.attachmentsDir, getThreadAttachmentDirName(id)), { recursive: true });
      }
      const reportError = vi.fn<(error: unknown) => void>();
      const release: Array<() => void> = [];
      const service = wire({
        reportError,
        removeDetached: (target) =>
          new Promise<void>((resolve) => {
            release.push(() => {
              rmSync(target, { recursive: true, force: true });
              resolve();
            });
          }),
      });

      if (source === "startup") service.start();
      else service.notifyDeletedThreadIds(ids);

      // Exactly the queue cap may be detached while the first two removals are
      // held. Excess work stays in place until capacity becomes available.
      await vi.waitFor(() => expect(trashEntries().length).toBe(REMOVAL_QUEUE_LIMIT));
      const remaining = readdirSync(paths.attachmentsDir).filter((entry) => !entry.startsWith("."));
      expect(remaining.length).toBe(5);

      // Two removals settle per round trip; give the drain loop room to pump
      // the whole queue instead of the one-second default.
      await vi.waitFor(
        () => {
          for (const releaseEntry of release.splice(0)) releaseEntry();
          expect(trashEntries()).toEqual([]);
          expect(
            readdirSync(paths.attachmentsDir).filter((entry) => !entry.startsWith(".")),
          ).toEqual([]);
        },
        { timeout: 20_000, interval: 5 },
      );
      expect(reportError).not.toHaveBeenCalled();
    },
  );

  it("resolves every dispose caller through one shared disposal that joins in-flight removals", async () => {
    dbUpsertProject(testProject("p1"), 0);
    dbUpsertThread({ ...testThread(), projectId: "p1" }, 0);
    saveUploadedAttachmentFile(paths, {
      threadId: "thread-1",
      data: new Uint8Array([1]),
      fileName: "a.png",
    });
    const pending = new Map<string, () => void>();
    const service = wire({
      removeDetached: (target) =>
        new Promise<void>((resolve) => {
          pending.set(target, resolve);
        }),
    });
    service.start();
    dbDeleteThread("thread-1");
    await vi.waitFor(() => expect(pending.size).toBe(1));

    let firstDone = false;
    let secondDone = false;
    const first = service.dispose().then(() => {
      firstDone = true;
    });
    const second = service.dispose().then(() => {
      secondDone = true;
    });
    // One shared disposal promise: a repeated caller can never hang behind a
    // resolver only the first caller holds, so both wrappers settle together.
    for (const resolve of pending.values()) resolve();
    await second;
    await Promise.resolve();
    expect(secondDone).toBe(true);
    expect(firstDone).toBe(true);
    await first;
  });

  it("cancels the scheduled startup scan synchronously on dispose", async () => {
    mkdirSync(join(paths.attachmentsDir, "orphan"), { recursive: true });
    const remove = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const service = wire({ removeDetached: remove, startupScanDelayMs: 60_000 });

    service.start();
    await service.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(remove).not.toHaveBeenCalled();
    expect(existsSync(join(paths.attachmentsDir, "orphan"))).toBe(true);
  });

  it("stops the startup scan after dispose and abandons queued removals", async () => {
    // 65 orphans -> two scan batches with a yield between them.
    for (let index = 0; index < 65; index += 1) {
      mkdirSync(join(paths.attachmentsDir, `orphan-${String(index).padStart(2, "0")}`), {
        recursive: true,
      });
    }
    const pending = new Map<string, () => void>();
    const service = wire({
      removeDetached: (target) =>
        new Promise<void>((resolve) => {
          pending.set(target, resolve);
        }),
    });
    service.start();
    await vi.waitFor(() => expect(pending.size).toBe(2));

    const disposal = service.dispose();
    let settled = false;
    void disposal.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false); // joined the hanging in-flight removals

    for (const resolve of pending.values()) resolve();
    await disposal;
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The queued remainder was abandoned and no scan batch detached after
    // dispose, so no removal ever starts beyond the two in flight.
    expect(pending.size).toBe(2);
  });

  it("keeps the trash area unreachable by the 12-character upload name cap", () => {
    expect(getThreadAttachmentDirName(RECLAIM_TRASH_DIR_NAME)).not.toBe(RECLAIM_TRASH_DIR_NAME);
  });

  it("does not reclaim through a trash directory symlink", async () => {
    const outside = join(root, "outside-attachments");
    mkdirSync(outside);
    writeFileSync(join(outside, "keep.txt"), "unrelated data");
    mkdirSync(paths.attachmentsDir, { recursive: true });
    symlinkSync(outside, trashDir(), "junction");
    mkdirSync(join(paths.attachmentsDir, "orphan"));
    const readLive = vi.fn<() => string[]>(() => []);
    const targets: string[] = [];
    const reportError = vi.fn<(error: unknown) => void>();
    wire({
      listLiveThreadIds: readLive,
      reportError,
      removeDetached: async (path) => {
        targets.push(realpathSync(path));
      },
    }).start();
    await vi.waitFor(() => expect(readLive).toHaveBeenCalled());
    expect(targets).toEqual([]);
    expect(existsSync(join(paths.attachmentsDir, "orphan"))).toBe(true);
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
    expect(reportError).toHaveBeenCalled();
  });
});
