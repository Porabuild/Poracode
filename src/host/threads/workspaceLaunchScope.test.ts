import { WorkspaceLaunchUnavailableError } from "@/shared/threadWorkspaceRefusal";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getSqlite, initDatabase } from "../db/connection";
import { dbUpsertProject, dbUpsertThread } from "../db/projectsThreads";
import { nativeBindingEnv, testThread } from "../db/runtimeItems.testFixtures";
import {
  dbBeginThreadWorkspaceGrantOperation,
  dbReadThreadWorkspaceGrantOwner,
  dbMarkThreadWorkspaceGrantDispatched,
  dbCommitThreadWorkspaceGrants,
} from "../db/threadWorkspaceGrants";
import { readWorkspaceLaunchSelection } from "./workspaceLaunchScope";
import type { ProjectLocation, StartThreadPayload } from "@/shared/contracts";

const primary: ProjectLocation = { kind: "posix", path: "/primary" };
const extra: ProjectLocation = { kind: "posix", path: "/extra 日本" };
function payload(): StartThreadPayload {
  return {
    threadId: "thread-1",
    agentKind: "codex",
    projectLocation: primary,
    config: { model: "gpt-5" },
    prompt: "",
    presentationMode: "gui",
    initialSize: { cols: 120, rows: 40 },
  };
}
function begin(token = "op", candidate = [extra]) {
  const current = dbReadThreadWorkspaceGrantOwner("thread-1");
  dbBeginThreadWorkspaceGrantOperation({
    threadId: "thread-1",
    operationToken: token,
    expectedRevision: current.revision,
    owner: current.owner,
    candidate,
  });
}
function commit(token = "op", candidate = [extra]) {
  begin(token, candidate);
  dbMarkThreadWorkspaceGrantDispatched("thread-1", token);
  dbCommitThreadWorkspaceGrants("thread-1", token);
}
beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
  dbUpsertProject(
    { id: "project-1", name: "Project", location: primary, createdAt: "2026-01-01" },
    0,
  );
  dbUpsertThread({ ...testThread(), status: "idle" }, 0);
});
afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

describe("authoritative workspace launch selection", () => {
  it("keeps an owner-only revision on the legacy launch path until a scope is committed", () => {
    dbUpsertThread({ ...testThread(), agentKind: "other" }, 0);
    dbUpsertThread(testThread(), 0);
    const current = dbReadThreadWorkspaceGrantOwner("thread-1");
    expect(current.revision).toBeGreaterThan(0);
    expect(current.hasCommittedScope).toBe(false);
    expect(readWorkspaceLaunchSelection(payload())).toBeUndefined();
    commit("explicit-empty", []);
    expect(readWorkspaceLaunchSelection(payload())?.scope).toMatchObject({
      additionalDirectories: [],
      revision: current.revision + 1,
    });
  });
  it("leaves legacy empty launches unchanged and ignores forged client scope", () => {
    expect(
      readWorkspaceLaunchSelection({
        ...payload(),
        additionalDirectories: [extra],
        workspaceScope: { revision: 9 },
      } as StartThreadPayload),
    ).toBeUndefined();
    expect(
      readWorkspaceLaunchSelection({ ...payload(), threadId: undefined } as never),
    ).toBeUndefined();
  });
  it("reads complete ordered committed SQL grants and a real owner fingerprint", () => {
    commit();
    expect(readWorkspaceLaunchSelection(payload())).toEqual({
      owner: dbReadThreadWorkspaceGrantOwner("thread-1").owner,
      scope: { primaryLocation: primary, additionalDirectories: [extra], revision: 1 },
    });
    commit("clear", []);
    expect(readWorkspaceLaunchSelection(payload())?.scope).toMatchObject({
      additionalDirectories: [],
      revision: 2,
    });
  });
  it.each(["pending", "dispatched", "ambiguous"])(
    "refuses %s custody rather than relaunching old or candidate scope",
    (state) => {
      begin();
      if (state !== "pending") dbMarkThreadWorkspaceGrantDispatched("thread-1", "op");
      if (state === "ambiguous")
        getSqlite()
          .prepare("UPDATE thread_workspace_grant_operations SET state = 'ambiguous'")
          .run();
      expect(() => readWorkspaceLaunchSelection(payload())).toThrow(
        WorkspaceLaunchUnavailableError,
      );
    },
  );
  it.each([
    { projectLocation: { kind: "posix", path: "/other" } },
    { projectLocation: { ...primary, remoteServerId: "remote" } },
    { agentKind: "another" },
    { agentInstanceId: "instance" },
    { presentationMode: "terminal" },
    { config: { model: "gpt-5", executionEnvironment: { kind: "wsl", distro: "Other" } } },
  ])("refuses changed launch ownership %j", (changed) => {
    commit();
    expect(() =>
      readWorkspaceLaunchSelection({ ...payload(), ...changed } as StartThreadPayload),
    ).toThrow(WorkspaceLaunchUnavailableError);
  });
  it("refuses malformed persisted authorization instead of clearing it", () => {
    getSqlite()
      .prepare("UPDATE threads SET additional_directories = 'broken' WHERE id = 'thread-1'")
      .run();
    expect(() => readWorkspaceLaunchSelection(payload())).toThrow(WorkspaceLaunchUnavailableError);
  });
  it("binds the actual worktree primary, rather than the parent repository", () => {
    dbUpsertThread({ ...testThread(), worktreePath: "/primary/tree" }, 0);
    commit();
    expect(() => readWorkspaceLaunchSelection(payload())).toThrow(WorkspaceLaunchUnavailableError);
    expect(
      readWorkspaceLaunchSelection({
        ...payload(),
        projectLocation: { kind: "posix", path: "/primary/tree" },
      })?.scope.primaryLocation,
    ).toEqual({ kind: "posix", path: "/primary/tree" });
  });
});
