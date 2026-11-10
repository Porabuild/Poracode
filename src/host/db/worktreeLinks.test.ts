import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EXPERIMENT_STORE_KEY,
  EXPERIMENT_STORE_VERSION,
  type GitWorktreeInfo,
  type Project,
  type Thread,
} from "@/shared/contracts";
import { assertRemoteGitMutationExperimentSafe } from "@/host/remote/experimentOwnership";
import { closeDatabase, getSqlite, initDatabase } from "./connection";
import { dbGetThread, dbSetState, dbUpsertProject, dbUpsertThread } from "./projectsThreads";
import { nativeBindingEnv, testThread } from "./runtimeItems.testFixtures";
import { dbBeginWorktreeObservation, dbReconcileProjectWorktrees } from "./worktreeLinks";

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const worktree: GitWorktreeInfo = {
  path: "/repo/worktree",
  branch: "renamed-branch",
  commit: "abc123",
  isMain: false,
};

describe("persisted worktree links", () => {
  let dir: string;
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    mkdirSync("tmp", { recursive: true });
    dir = mkdtempSync(join("tmp", "worktree-links-"));
    initDatabase(join(dir, "state.sqlite"));
    dbUpsertProject(project, 0);
  });
  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
  });

  function seed(id: string, overrides: Partial<Thread> = {}): Thread {
    const thread = {
      ...testThread(),
      id,
      worktreePath: worktree.path,
      worktreeBranch: "saved-branch",
      ...overrides,
    };
    dbUpsertThread(thread, 42);
    return dbGetThread(id)!;
  }

  it("repairs previous-release branch links for every sibling without changing other saved fields", () => {
    const active = seed("active");
    const archived = seed("archived", { archived: true });
    const orderBefore = getSqlite().prepare("SELECT id, sort_order FROM threads ORDER BY id").all();

    expect(dbReconcileProjectWorktrees(project.id, [worktree])).toEqual(["active", "archived"]);
    expect(dbGetThread(active.id)).toEqual({ ...active, worktreeBranch: worktree.branch });
    expect(dbGetThread(archived.id)).toEqual({ ...archived, worktreeBranch: worktree.branch });
    expect(getSqlite().prepare("SELECT id, sort_order FROM threads ORDER BY id").all()).toEqual(
      orderBefore,
    );
    expect(dbReconcileProjectWorktrees(project.id, [worktree])).toEqual([]);
  });

  it("follows a registered branch to a moved worktree, then follows a branch rename there", () => {
    seed("moved", { worktreePath: "/repo/old-worktree", worktreeBranch: worktree.branch });
    expect(dbReconcileProjectWorktrees(project.id, [worktree])).toEqual(["moved"]);
    expect(dbGetThread("moved")?.worktreePath).toBe(worktree.path);
    expect(dbReconcileProjectWorktrees(project.id, [{ ...worktree, branch: "next-name" }])).toEqual(
      ["moved"],
    );
    expect(dbGetThread("moved")?.worktreeBranch).toBe("next-name");
  });

  it("preserves missing links and never redirects a link to the main worktree", () => {
    const thread = seed("missing", { worktreePath: "/repo/missing", worktreeBranch: "main" });
    expect(
      dbReconcileProjectWorktrees(project.id, [{ ...worktree, branch: "main", isMain: true }]),
    ).toEqual([]);
    expect(dbReconcileProjectWorktrees(project.id, [])).toEqual([]);
    expect(dbGetThread(thread.id)).toEqual(thread);
  });

  it("does not modify threads owned by another project", () => {
    dbUpsertProject({ ...project, id: "other" }, 1);
    const thread = seed("other-thread", { projectId: "other" });
    expect(dbReconcileProjectWorktrees(project.id, [worktree])).toEqual([]);
    expect(dbGetThread(thread.id)).toEqual(thread);
  });

  it("rejects older observations, including when a newer read fails", () => {
    seed("linked", { worktreeBranch: worktree.branch });
    const older = dbBeginWorktreeObservation(project.id);
    const newer = dbBeginWorktreeObservation(project.id);
    const moved = { ...worktree, path: "/repo/moved-wt" };
    expect(dbReconcileProjectWorktrees(project.id, [moved], newer)).toEqual(["linked"]);
    expect(dbReconcileProjectWorktrees(project.id, [worktree], older)).toBeNull();
    expect(dbGetThread("linked")?.worktreePath).toBe(moved.path);
    const pending = dbBeginWorktreeObservation(project.id);
    dbBeginWorktreeObservation(project.id);
    expect(dbReconcileProjectWorktrees(project.id, [worktree], pending)).toBeNull();
    expect(dbGetThread("linked")?.worktreePath).toBe(moved.path);
  });

  it("does not apply an observation to a reopened database", () => {
    const thread = seed("linked");
    const observation = dbBeginWorktreeObservation(project.id);
    closeDatabase();
    initDatabase(join(dir, "state.sqlite"));
    expect(dbReconcileProjectWorktrees(project.id, [worktree], observation)).toBeNull();
    expect(dbGetThread(thread.id)).toEqual(thread);
  });

  it("preserves experiment custody for both frozen and repaired worktree identities", () => {
    seed("candidate", { worktreePath: "/repo/old-wt", worktreeBranch: "candidate-old" });
    const experiment = {
      id: "experiment",
      projectId: project.id,
      title: "Compare",
      prompt: "Compare",
      baseBranch: "main",
      baseCommit: "a".repeat(40),
      candidates: [
        {
          threadId: "candidate",
          agentKind: "codex",
          worktreePath: "/repo/old-wt",
          worktreeBranch: "candidate-old",
          worktreeOwnerToken: "experiment:candidate",
          worktreeState: "owned",
        },
        {
          threadId: "other-candidate",
          agentKind: "codex",
          worktreePath: "/repo/other",
          worktreeBranch: "candidate-other",
          worktreeOwnerToken: "experiment:other",
          worktreeState: "owned",
        },
      ],
      status: "running",
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
    };
    dbSetState(
      EXPERIMENT_STORE_KEY,
      JSON.stringify({ state: { experiments: { experiment } }, version: EXPERIMENT_STORE_VERSION }),
    );
    dbReconcileProjectWorktrees(project.id, [
      { ...worktree, path: "/repo/new-wt", branch: "candidate-old" },
    ]);
    dbReconcileProjectWorktrees(project.id, [
      { ...worktree, path: "/repo/new-wt", branch: "candidate-new" },
    ]);
    for (const path of ["/repo/old-wt", "/repo/new-wt"]) {
      expect(() =>
        assertRemoteGitMutationExperimentSafe("gitRevertAll", {
          projectLocation: { kind: "posix", path },
        }),
      ).toThrow("Experiment candidates");
    }
    for (const branch of ["candidate-old", "candidate-new"]) {
      expect(() =>
        assertRemoteGitMutationExperimentSafe("gitDeleteBranch", {
          projectLocation: project.location,
          branch,
        }),
      ).toThrow("Experiment candidates");
    }
  });
});
