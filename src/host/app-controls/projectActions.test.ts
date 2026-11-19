import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db";
import { nativeBindingEnv, sqliteAvailable } from "@/host/db/runtimeItems.testFixtures";
import { ProjectActionService } from "./projectActions";
import type { SupervisorCall } from "./supervisorCaller";

const project: Project = {
  id: "project-1",
  name: "Example",
  location: { kind: "posix", path: "/fixture/project" },
  createdAt: "2026-01-01T00:00:00.000Z",
  scripts: { actions: [{ id: "tests", name: "Tests", command: "# comment\nprintf test" }] },
};
const input = {
  action: "run",
  projectId: project.id,
  actionId: "tests",
  operationKey: "fixture-run-1",
} as const;
const checkout = "/fixture/worktree";
const previousNativeBinding = process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;

describe.skipIf(!sqliteAvailable)("App Controls project actions", () => {
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    initDatabase(":memory:");
  });

  afterEach(() => {
    closeDatabase();
    if (previousNativeBinding === undefined)
      delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    else process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = previousNativeBinding;
  });

  it("waits for a prompt, uses the saved command, and retains the result once across retries", async () => {
    const started = Promise.withResolvers<string>();
    const call = vi.fn<SupervisorCall>(async (name, payload) => {
      if (name === "gitListWorktrees") {
        return {
          worktrees: [{ path: checkout, branch: "feature", isMain: false, commit: "head" }],
        } as never;
      }
      if (name === "startShell" && "shellId" in payload) started.resolve(payload.shellId);
      if (name === "readTerminalSnapshot") return { data: "fixture output", toCursor: 14 } as never;
      return undefined as never;
    });
    const service = new ProjectActionService(call, () => project);
    const request = { ...input, worktreePath: checkout };
    const first = service.execute(request);
    const terminalId = await started.promise;
    expect(call).not.toHaveBeenCalledWith("controlWorkspaceTerminal", expect.anything());
    service.observe({
      type: "thread-output",
      threadId: terminalId,
      data: "\u001b]133;B\u0007",
      outputLength: 9,
      terminalInstanceId: "fixture",
    });
    await expect(first).resolves.toMatchObject({
      terminalId,
      worktreePath: checkout,
      status: "running",
    });
    expect(call).toHaveBeenCalledWith("controlWorkspaceTerminal", {
      version: 1,
      terminalId,
      projectLocation: { kind: "posix", path: checkout },
      worktreePath: checkout,
      command: { action: "write", data: "exec bash -c 'printf test'\r" },
    });
    service.observe({ type: "thread-exited", threadId: terminalId, exitCode: 7 });
    await expect(service.execute(request)).resolves.toMatchObject({ terminalId });
    expect(call.mock.calls.filter(([name]) => name === "startShell")).toHaveLength(1);
    await expect(service.execute({ action: "read", terminalId })).resolves.toMatchObject({
      terminalId,
      status: "exited",
      exitCode: 7,
      data: "fixture output",
      outputAvailable: true,
    });
  });

  it("stops a starting action before its command can be sent", async () => {
    const admitted = Promise.withResolvers<string>();
    const spawn = Promise.withResolvers<void>();
    const call = vi.fn<SupervisorCall>((name, payload) => {
      if (name === "startShell" && "shellId" in payload) {
        admitted.resolve(payload.shellId);
        return spawn.promise as never;
      }
      return Promise.resolve({ action: "close", confirmed: true }) as never;
    });
    const service = new ProjectActionService(call, () => project);
    const running = service.execute(input);
    const terminalId = await admitted.promise;
    const stop = service.execute({ action: "stop", terminalId });
    service.observe({
      type: "thread-output",
      threadId: terminalId,
      data: "\u001b]133;B\u0007",
      outputLength: 9,
      terminalInstanceId: "fixture",
    });
    spawn.resolve();
    await expect(stop).resolves.toMatchObject({ status: "stopped" });
    await running;
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenLastCalledWith(
      "controlWorkspaceTerminal",
      expect.objectContaining({
        terminalId,
        command: { action: "close" },
        projectLocation: project.location,
      }),
    );
    await expect(service.execute({ action: "stop", terminalId: "shell:other" })).rejects.toThrow(
      "run not found",
    );
  });
});
