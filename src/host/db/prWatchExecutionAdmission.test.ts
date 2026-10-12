import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PrWatch } from "@/shared/contracts";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { nativeBindingEnv, sqliteAvailable } from "./runtimeItems.testFixtures";
import { dbUpsertProject } from "./projectsThreads";
import {
  dbDeletePrWatch,
  dbGetPrWatch,
  dbPatchPrWatchRuntime,
  dbUpsertPrWatch,
  type PrWatchRuntimePatch,
} from "./prWatches";
import {
  PrWatchExecutionAdmissionError,
  dbAdmitPrWatchExecution,
  dbReadPrWatchExecutionSnapshot,
} from "./prWatchExecutionAdmission";

const PROJECT_ID = "p1";
const PR_NUMBER = 42;
/** A full profile kind: one opaque agentKind route identity. */
const PROFILE_KIND = "vendor:profile";

const binding = {
  version: 1 as const,
  kind: "family-member" as const,
  owner: { agentKind: PROFILE_KIND, presentationMode: "gui" as const },
  model: "opaque-member",
  inertValues: { effort: "" },
};

const controls = {
  model: "opaque-member",
  effort: "",
  fast: false,
  thinking: false,
  contextSize: "default",
};

function watch(overrides: Partial<PrWatch> = {}): PrWatch {
  return {
    projectId: PROJECT_ID,
    prNumber: PR_NUMBER,
    headBranch: "feature/pr-watch",
    watchEnabled: true,
    autoMerge: false,
    agentKind: PROFILE_KIND,
    config: { ...controls, selectionBinding: binding },
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
    blockedReason: null,
    ...overrides,
  };
}

function rawRow(prNumber = PR_NUMBER): Record<string, unknown> {
  return getSqlite()
    .prepare("SELECT * FROM pr_watches WHERE project_id = ? AND pr_number = ?")
    .get(PROJECT_ID, prNumber) as Record<string, unknown>;
}

function setRawConfig(config: unknown, prNumber = PR_NUMBER): void {
  getSqlite()
    .prepare("UPDATE pr_watches SET config = ? WHERE project_id = ? AND pr_number = ?")
    .run(JSON.stringify(config), PROJECT_ID, prNumber);
}

/** Runs the admission and returns the refusal; fails the test when it passes. */
function refusalError(run: () => void): PrWatchExecutionAdmissionError {
  try {
    run();
  } catch (error) {
    return error as PrWatchExecutionAdmissionError;
  }
  throw new Error("Expected a PR watch execution admission refusal.");
}

describe.skipIf(!sqliteAvailable)("prWatchExecutionAdmission (real sqlite)", () => {
  let root: string;
  const priorBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;

  beforeEach(() => {
    mkdirSync("tmp", { recursive: true });
    root = mkdtempSync(join("tmp", "pr-watch-execution-admission-"));
    if (nativeBindingEnv) {
      process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    }
    initDatabase(join(root, "state.sqlite"));
    dbUpsertProject(
      {
        id: PROJECT_ID,
        name: "Project",
        location: { kind: "posix", path: "/fixture" },
        createdAt: "2026-01-01T00:00:00Z",
      },
      0,
    );
    dbUpsertPrWatch(watch());
  });

  afterEach(() => {
    closeDatabase();
    rmSync(root, { recursive: true, force: true });
    if (priorBinding === undefined) delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = priorBinding;
  });

  describe("dbReadPrWatchExecutionSnapshot", () => {
    it("reads the raw execution identity with exact presence", () => {
      expect(dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)).toEqual({
        projectId: PROJECT_ID,
        prNumber: PR_NUMBER,
        headBranch: "feature/pr-watch",
        watchEnabled: true,
        autoMerge: false,
        agentKind: PROFILE_KIND,
        config: { ...controls, selectionBinding: binding },
      });
    });

    it("keeps absent carriers and owners absent", () => {
      setRawConfig({ model: "opaque-member" });
      const snapshot = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER);
      expect(snapshot?.config).toEqual({ model: "opaque-member" });
      expect("worktreePath" in snapshot!).toBe(false);
    });

    it("returns null for a missing row and refuses unsupported raw selection data", () => {
      expect(dbReadPrWatchExecutionSnapshot(PROJECT_ID, 7)).toBeNull();

      setRawConfig({ ...controls, selectionBinding: { ...binding, version: 200 } });
      const refusal = refusalError(() => dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER));
      expect(refusal.reason).toBe("unsupported");
      expect(refusal.message).toContain("unsupported selection data");
    });
  });

  describe("dbAdmitPrWatchExecution", () => {
    it("admits a snapshot captured from the authoritative row and refuses a missing one", () => {
      const captured = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER);
      expect(captured).not.toBeNull();
      expect(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured!)).not.toThrow();

      dbDeletePrWatch(PROJECT_ID, PR_NUMBER);
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured!)).reason,
      ).toBe("missing");
    });

    it.each([
      ["branch", (entry: PrWatch) => ({ ...entry, headBranch: "feature/renamed" })],
      ["worktree added", (entry: PrWatch) => ({ ...entry, worktreePath: "/repo/.worktrees/pr" })],
      ["watch enabled off", (entry: PrWatch) => ({ ...entry, watchEnabled: false })],
      ["auto merge on", (entry: PrWatch) => ({ ...entry, autoMerge: true })],
      ["agent kind", (entry: PrWatch) => ({ ...entry, agentKind: "vendor:other" })],
      ["model", (entry: PrWatch) => ({ ...entry, config: { ...controls, model: "other" } })],
      ["effort value", (entry: PrWatch) => ({ ...entry, config: { ...controls, effort: "high" } })],
      ["fast value", (entry: PrWatch) => ({ ...entry, config: { ...controls, fast: true } })],
      [
        "thinking value",
        (entry: PrWatch) => ({ ...entry, config: { ...controls, thinking: true } }),
      ],
      [
        "context size",
        (entry: PrWatch) => ({ ...entry, config: { ...controls, contextSize: "8k" } }),
      ],
      [
        "binding record",
        (entry: PrWatch) => ({
          ...entry,
          config: {
            ...controls,
            selectionBinding: { ...binding, inertValues: { effort: "high" } },
          },
        }),
      ],
      [
        "binding owner instance id",
        (entry: PrWatch) => ({
          ...entry,
          config: {
            ...controls,
            selectionBinding: {
              ...binding,
              owner: { ...binding.owner, agentInstanceId: "instance-2" },
            },
          },
        }),
      ],
    ] as const)("refuses a changed execution field: %s", (_label, mutate) => {
      const captured = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;
      expect(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).not.toThrow();

      dbUpsertPrWatch(mutate(watch()));
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).reason,
      ).toBe("stale");
    });

    it("refuses a binding removed from or added to the stored row", () => {
      const withBinding = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;
      const { selectionBinding: _removed, ...withoutBinding } = watch().config!;

      setRawConfig(withoutBinding);
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, withBinding)).reason,
      ).toBe("stale");

      // And the reverse: a recognized binding appears on the row only.
      const bare = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;
      setRawConfig({ ...controls, selectionBinding: binding });
      expect(refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, bare)).reason).toBe(
        "stale",
      );
    });

    it("treats carrier presence as exact, including empty and false values", () => {
      const captured = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;
      expect(captured.config).toMatchObject({ effort: "", fast: false, thinking: false });
      expect(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).not.toThrow();

      const { fast: _fast, ...withoutFast } = controls;
      setRawConfig(withoutFast);
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).reason,
      ).toBe("stale");

      const { thinking: _thinking, ...withoutThinking } = controls;
      setRawConfig(withoutThinking);
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).reason,
      ).toBe("stale");
    });

    it("never substitutes the binding owner for the stored agent kind", () => {
      const captured = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;

      // A divergent binding owner is inert evidence, not the actual route.
      const divergentOwner = watch({
        config: {
          ...controls,
          selectionBinding: {
            ...binding,
            owner: { agentKind: "other:profile", presentationMode: "gui" },
          },
        },
      });
      dbUpsertPrWatch(divergentOwner);
      expect(() =>
        dbAdmitPrWatchExecution(
          PROJECT_ID,
          PR_NUMBER,
          dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!,
        ),
      ).not.toThrow();

      // A changed stored agent kind is a change even when the owner matches.
      dbUpsertPrWatch(watch({ agentKind: "vendor" }));
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).reason,
      ).toBe("stale");
    });

    it("refuses unsupported raw selection data that appeared after capture", () => {
      const captured = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;
      setRawConfig({ ...controls, selectionBinding: { ...binding, version: 200 } });

      const refusal = refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured));
      expect(refusal.reason).toBe("unsupported");
      expect(refusal.message).toContain("unsupported selection data");
      // The persisted read keeps projecting; only the raw gate refuses.
      expect(dbGetPrWatch(PROJECT_ID, PR_NUMBER)?.config).toEqual(controls);
    });

    it("admits after runtime bookkeeping that changes no execution field", () => {
      const captured = dbReadPrWatchExecutionSnapshot(PROJECT_ID, PR_NUMBER)!;
      dbPatchPrWatchRuntime(PROJECT_ID, PR_NUMBER, {
        lastCheckKey: "issue-2",
        activeThreadId: "thread-1",
        lastError: null,
        blockedReason: null,
      });
      expect(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).not.toThrow();

      // Re-recording the checkout does change the execution identity: an
      // in-flight capture from before the patch must cancel into a recheck.
      dbPatchPrWatchRuntime(PROJECT_ID, PR_NUMBER, { worktreePath: "/repo/.worktrees/pr" });
      expect(
        refusalError(() => dbAdmitPrWatchExecution(PROJECT_ID, PR_NUMBER, captured)).reason,
      ).toBe("stale");
    });

    it("keeps the guarded full save refusing over protected raw bytes", () => {
      const raw = ` {"model":"opaque-member","selectionBinding":{"version":200}}\n`;
      getSqlite()
        .prepare("UPDATE pr_watches SET config = ? WHERE project_id = ? AND pr_number = ?")
        .run(raw, PROJECT_ID, PR_NUMBER);
      const projected = dbGetPrWatch(PROJECT_ID, PR_NUMBER)!;
      expect(() => dbUpsertPrWatch({ ...projected, lastError: "Echo" })).toThrow(
        "unsupported selection data",
      );
      expect(rawRow().config).toBe(raw);
    });
  });

  describe("dbPatchPrWatchRuntime", () => {
    it("writes only its columns and preserves protected raw config bytes exactly", () => {
      const raw = ` {"model":"opaque-member","selectionBinding":{"version":200}}\n`;
      getSqlite()
        .prepare("UPDATE pr_watches SET config = ? WHERE project_id = ? AND pr_number = ?")
        .run(raw, PROJECT_ID, PR_NUMBER);
      const before = rawRow();

      dbPatchPrWatchRuntime(PROJECT_ID, PR_NUMBER, {
        worktreePath: "/repo/.worktrees/pr",
        lastCheckKey: "issue-2",
        activeThreadId: "thread-1",
        lastError: "boom",
        blockedReason: "worktree-unavailable",
      });

      const after = rawRow();
      // The execution-defining and cursor columns are untouched, byte for byte.
      for (const column of [
        "project_id",
        "pr_number",
        "head_branch",
        "watch_enabled",
        "auto_merge",
        "agent_kind",
        "config",
        "last_comment_cursor",
        "last_review_comment_cursor",
        "last_review_cursor",
      ]) {
        expect(after[column]).toBe(before[column]);
      }
      expect(after).toMatchObject({
        worktree_path: "/repo/.worktrees/pr",
        last_check_key: "issue-2",
        active_thread_id: "thread-1",
        last_error: "boom",
        blocked_reason: "worktree-unavailable",
      });
    });

    it("is a no-op for a deleted row instead of resurrecting it", () => {
      dbDeletePrWatch(PROJECT_ID, PR_NUMBER);
      dbPatchPrWatchRuntime(PROJECT_ID, PR_NUMBER, { activeThreadId: "thread-1" });
      expect(dbGetPrWatch(PROJECT_ID, PR_NUMBER)).toBeNull();
      expect(getSqlite().prepare("SELECT COUNT(*) AS n FROM pr_watches").get()).toMatchObject({
        n: 0,
      });
    });

    it("rejects an unknown blocked reason instead of relying on the tolerant read", () => {
      const patch: PrWatchRuntimePatch = { blockedReason: "future-reason" as never };
      expect(() => dbPatchPrWatchRuntime(PROJECT_ID, PR_NUMBER, patch)).toThrow("Invalid option");
      expect(rawRow().blocked_reason).toBeNull();
    });

    it("never blocks healthy sibling rows", () => {
      setRawConfig({ ...controls, selectionBinding: { ...binding, version: 200 } });
      dbPatchPrWatchRuntime(PROJECT_ID, PR_NUMBER, { activeThreadId: "thread-1" });
      dbUpsertPrWatch(watch({ prNumber: 2, lastError: "sibling" }));
      expect(dbGetPrWatch(PROJECT_ID, 2)?.lastError).toBe("sibling");
      expect(dbGetPrWatch(PROJECT_ID, PR_NUMBER)?.activeThreadId).toBe("thread-1");
    });
  });
});
