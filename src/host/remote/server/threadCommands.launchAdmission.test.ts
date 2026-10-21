import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { dbGetProject, dbGetThread, dbUpsertProject } from "@/host/db/projectsThreads";
import {
  captureProjectExecutionScope,
  hasSameProjectExecutionScope,
} from "@/host/threads/projectExecutionScope";
import {
  emptyMcpLaunchSnapshot,
  type Project,
  type ProjectLocation,
  type RemoteThreadCommand,
} from "@/shared/contracts";
import type { RemoteAccessServerOptions } from "../remoteAccessServerTypes";
import { startPersistedThread } from "./threadCommands";

let directory: string, owner: HostOwnerController, project: Project;
beforeEach(async () => {
  mkdirSync("tmp", { recursive: true });
  directory = mkdtempSync(resolve("tmp/host-launch-admission-"));
  owner = HostOwnerController.acquire(join(directory, "profile"), "headless");
  const runtime = await owner.initialize({ mode: "headless" });
  initDatabase(runtime.paths.dbPath);
  project = {
    id: "project",
    name: "Owned fixture",
    location: { kind: "posix", path: directory },
    createdAt: "2026-10-21T00:00:00Z",
  };
  dbUpsertProject(project, 0);
});
afterEach(async () => {
  closeDatabase();
  await owner.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const call = vi.fn<RemoteAccessServerOptions["callSupervisor"]>(
    async () => ({ threadId: "thread" }) as never,
  );
  const controller = new AbortController();
  const admit = () => controller.signal.throwIfAborted();
  const command: Extract<RemoteThreadCommand, { kind: "start" }> = {
    kind: "start",
    threadId: "thread",
    projectId: "project",
    agentKind: "fixture:work",
    agentInstanceId: "work",
    config: {
      model: "fixture-model",
      effort: "",
      fast: false,
      thinking: false,
      approvalPolicy: "ask",
      sandboxMode: "read-only",
      computerUse: false,
      crossagentMcp: false,
    },
    prompt: "Summarize the repository",
    title: "Owned fixture",
    presentationMode: "gui",
    initialSize: { cols: 96, rows: 42 },
  };
  return { call, command, controller, admit };
}
describe("host-owned launch admission with real persisted history", () => {
  it.each([
    { kind: "windows", path: "C:\\owned\\project" },
    {
      kind: "wsl",
      distro: "Selected Distro",
      linuxPath: "/home/fixture/project",
      uncPath: "\\\\wsl.localhost\\Selected Distro\\home\\fixture\\project",
    },
  ] satisfies ProjectLocation[])(
    "preserves the exact $kind target, profile and configured permission policy",
    async (location) => {
      dbUpsertProject({ ...project, location }, 0);
      const f = fixture();
      await startPersistedThread({ callSupervisor: f.call }, f.command, f.admit);
      expect(dbGetThread("thread")).toMatchObject({
        id: "thread",
        agentKind: "fixture:work",
        agentInstanceId: "work",
        config: f.command.config,
        presentationMode: "gui",
      });
      expect(f.call).toHaveBeenCalledExactlyOnceWith(
        "startThread",
        expect.objectContaining({
          threadId: "thread",
          agentKind: "fixture:work",
          agentInstanceId: "work",
          projectLocation: location,
          config: f.command.config,
          initialSize: { cols: 96, rows: 42 },
        }),
      );
    },
  );

  it("refuses a cancelled admission before a row or provider call exists", async () => {
    const f = fixture();
    f.controller.abort(new Error("Launch cancelled"));
    await expect(
      startPersistedThread({ callSupervisor: f.call }, f.command, f.admit),
    ).rejects.toThrow("Launch cancelled");
    expect(dbGetThread("thread")).toBeNull();
    expect(f.call).not.toHaveBeenCalled();
  });

  it("rechecks cancellation after an asynchronous title lookup before writing history", async () => {
    const f = fixture(),
      entered = Promise.withResolvers<void>(),
      released = Promise.withResolvers<void>();
    f.call.mockImplementation(async () => {
      entered.resolve();
      await released.promise;
      return { windows: [], wsl: [], fromCache: false } as never;
    });
    const command = { ...f.command };
    delete command.title;
    const start = startPersistedThread(
      { callSupervisor: f.call },
      { ...command, prompt: "/goal inspect" },
      f.admit,
    ).catch((error: unknown) => error);
    await entered.promise;
    f.controller.abort(new Error("Launch cancelled"));
    released.resolve();
    expect(await start).toMatchObject({ message: "Launch cancelled" });
    expect(dbGetThread("thread")).toBeNull();
    expect(f.call.mock.calls.map(([name]) => name)).toEqual(["getAgentStatuses"]);
  });

  it("permits the caller to refuse a relocated same-id project after the lookup", async () => {
    const f = fixture(),
      captured = captureProjectExecutionScope(project);
    const entered = Promise.withResolvers<void>(),
      released = Promise.withResolvers<void>();
    f.call.mockImplementation(async () => {
      entered.resolve();
      await released.promise;
      return { windows: [], wsl: [], fromCache: false } as never;
    });
    const admit = () => {
      const current = dbGetProject(project.id);
      if (!current || !hasSameProjectExecutionScope(current, captured))
        throw new Error("Project scope changed");
    };
    const command = { ...f.command };
    delete command.title;
    const start = startPersistedThread(
      { callSupervisor: f.call },
      { ...command, prompt: "/goal inspect" },
      admit,
    ).catch((error: unknown) => error);
    await entered.promise;
    dbUpsertProject({ ...project, location: { kind: "posix", path: "/different-project" } }, 0);
    released.resolve();
    expect(await start).toMatchObject({ message: "Project scope changed" });
    expect(dbGetThread("thread")).toBeNull();
    expect(f.call.mock.calls.map(([name]) => name)).toEqual(["getAgentStatuses"]);
  });

  it("retains the committed row when cancellation wins during MCP resolution and prevents spawn", async () => {
    const f = fixture();
    await expect(
      startPersistedThread(
        {
          callSupervisor: f.call,
          resolveMcpLaunchSnapshot: () => {
            f.controller.abort(new Error("Launch cancelled"));
            return emptyMcpLaunchSnapshot();
          },
        },
        f.command,
        f.admit,
      ),
    ).rejects.toThrow("Launch cancelled");
    expect(dbGetThread("thread")).toMatchObject({ id: "thread", config: f.command.config });
    expect(f.call).not.toHaveBeenCalled();
  });

  it("keeps history after a lost supervisor reply and never retries a potentially dispatched launch", async () => {
    const f = fixture();
    f.call.mockRejectedValue(new Error("Reply lost after dispatch"));
    await expect(
      startPersistedThread({ callSupervisor: f.call }, f.command, f.admit),
    ).rejects.toThrow("Reply lost after dispatch");
    expect(dbGetThread("thread")).toMatchObject({
      id: "thread",
      config: f.command.config,
      status: "launching",
    });
    expect(f.call).toHaveBeenCalledTimes(1);
  });
});
