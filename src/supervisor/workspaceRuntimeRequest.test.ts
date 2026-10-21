import { ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRuntimeRequestHandler } from "./workspaceRuntimeRequest";
import { ipcProcedureMap } from "@/shared/ipc/procedureMap";
import {
  THREAD_WORKSPACE_RUNTIME_REQUEST,
  threadWorkspaceRuntimePayloadSchema,
  threadWorkspaceRuntimeSupportSchema,
  CONTROLLED_WORKSPACE_RUNTIME_REQUEST,
  controlledWorkspaceRuntimePayloadSchema,
} from "@/shared/threadWorkspaceRuntimeProtocol";
import { startThreadPayloadSchema } from "@/shared/contracts/thread";
import { ThreadExecutionControl } from "./runtime/threadExecutionControl";

const launch = {
  threadId: "thread",
  agentKind: "neutral",
  projectLocation: { kind: "posix" as const, path: "/primary" },
  config: { model: "model" },
  prompt: "",
  initialSize: { cols: 120, rows: 40 },
  presentationMode: "gui" as const,
};
const scope = {
  primaryLocation: launch.projectLocation,
  additionalDirectories: [{ kind: "posix" as const, path: "/extra" }],
  revision: 4,
};
function fixture() {
  const startThread = vi.fn<() => Promise<{ threadId: string }>>(async () => ({
    threadId: "thread",
  }));
  const ensureThreadRunning = vi.fn<() => Promise<{ threadId: string }>>(async () => ({
    threadId: "thread",
  }));
  return {
    startThread,
    ensureThreadRunning,
    handle: createWorkspaceRuntimeRequestHandler({ startThread, ensureThreadRunning }),
  };
}

describe("host-only workspace runtime request", () => {
  it("dispatches v2 scope only through its exact controlled operation", async () => {
    const f = fixture();
    const controlThreadExecution = vi.fn<
      NonNullable<
        Parameters<typeof createWorkspaceRuntimeRequestHandler>[0]["controlThreadExecution"]
      >
    >(async (input) => {
      if (input.action !== "start") throw new Error("Expected a controlled start.");
      return {
        version: 1,
        state: "started",
        operationId: input.operationId,
        threadId: input.launch.threadId,
      };
    });
    const handle = createWorkspaceRuntimeRequestHandler({ ...f, controlThreadExecution });
    const peer = (await handle(
      { action: "support", version: 2 },
      CONTROLLED_WORKSPACE_RUNTIME_REQUEST,
    )) as { incarnation: string };
    const payload = {
      version: 2,
      action: "launch",
      incarnation: peer.incarnation,
      operationId: peer.incarnation,
      launch,
      scope,
    };
    await handle(payload, CONTROLLED_WORKSPACE_RUNTIME_REQUEST);
    expect(controlThreadExecution).toHaveBeenCalledExactlyOnceWith(
      {
        version: 1,
        action: "start",
        operationId: peer.incarnation,
        launch: startThreadPayloadSchema.parse(launch),
      },
      scope,
    );
    expect(f.startThread).not.toHaveBeenCalled();
    expect(f.ensureThreadRunning).not.toHaveBeenCalled();
    expect(
      controlledWorkspaceRuntimePayloadSchema.safeParse({ ...payload, version: 3 }).success,
    ).toBe(false);
    expect(threadWorkspaceRuntimePayloadSchema.safeParse(payload).success).toBe(false);
    await expect(handle(payload)).rejects.toThrow(ZodError);
    await expect(
      f.handle({ action: "support", version: 2 }, CONTROLLED_WORKSPACE_RUNTIME_REQUEST),
    ).rejects.toThrow("not supported");
    const other = createWorkspaceRuntimeRequestHandler({ ...f, controlThreadExecution });
    await expect(other(payload, CONTROLLED_WORKSPACE_RUNTIME_REQUEST)).rejects.toThrow(
      "different supervisor incarnation",
    );
    expect(controlThreadExecution).toHaveBeenCalledOnce();
  });

  it("does not revive a cancelled operation through scoped launch or touch its successor", async () => {
    const f = fixture();
    const start = vi.fn<() => Promise<{ threadId: string }>>(async () => ({
      threadId: launch.threadId,
    }));
    const close = vi.fn<() => Promise<{ confirmed: boolean }>>(async () => ({ confirmed: true }));
    const controller = new ThreadExecutionControl({ assertAvailable() {}, start, close });
    const prepared = await controller.control({
      version: 1,
      action: "prepare",
      threadId: launch.threadId,
    });
    const handle = createWorkspaceRuntimeRequestHandler({
      ...f,
      controlThreadExecution: (payload, workspaceScope) =>
        controller.control(payload, workspaceScope),
    });
    const peer = (await handle(
      { action: "support", version: 2 },
      CONTROLLED_WORKSPACE_RUNTIME_REQUEST,
    )) as { incarnation: string };
    await controller.control({ version: 1, action: "cancel", operationId: prepared.operationId });
    const successor = await controller.control({
      version: 1,
      action: "prepare",
      threadId: launch.threadId,
    });
    const payload = {
      version: 2,
      action: "launch",
      incarnation: peer.incarnation,
      operationId: prepared.operationId,
      launch,
      scope,
    };
    await expect(handle(payload, CONTROLLED_WORKSPACE_RUNTIME_REQUEST)).rejects.toThrow(
      "unknown or cancelled",
    );
    expect(start).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await handle(
      { ...payload, operationId: successor.operationId },
      CONTROLLED_WORKSPACE_RUNTIME_REQUEST,
    );
    expect(start).toHaveBeenCalledExactlyOnceWith({
      ...startThreadPayloadSchema.parse(launch),
      workspaceScope: scope,
    });
    await controller.control({ version: 1, action: "cancel", operationId: prepared.operationId });
    expect(controller.ownsThread(launch.threadId)).toBe(true);
    expect(close).not.toHaveBeenCalled();
    expect(await controller.dispose()).toBe(true);
  });
  it.each(["startThread", "ensureThreadRunning"] as const)(
    "carries complete committed scope to %s",
    async (procedure) => {
      const f = fixture();
      const support = threadWorkspaceRuntimeSupportSchema.parse(
        await f.handle({ action: "support", version: 1 }),
      );
      await expect(
        f.handle({
          action: "launch",
          version: 1,
          incarnation: support.incarnation,
          procedure,
          launch,
          scope,
        }),
      ).resolves.toEqual({ threadId: "thread" });
      expect(f[procedure]).toHaveBeenCalledExactlyOnceWith({
        ...startThreadPayloadSchema.parse(launch),
        workspaceScope: scope,
      });
    },
  );
  it("rejects a predecessor incarnation before any runtime call", async () => {
    const a = fixture(),
      b = fixture();
    const support = threadWorkspaceRuntimeSupportSchema.parse(
      await a.handle({ action: "support", version: 1 }),
    );
    await expect(
      b.handle({
        action: "launch",
        version: 1,
        incarnation: support.incarnation,
        procedure: "startThread",
        launch,
        scope,
      }),
    ).rejects.toThrow(/different supervisor/);
    expect(b.startThread).not.toHaveBeenCalled();
  });
  it.each([
    { action: "support", version: 0 },
    { action: "support", version: 2 },
    { action: "support", version: 1, scope },
    { action: "set", version: 1 },
  ])("refuses incompatible/unknown private requests", async (payload) => {
    const f = fixture();
    await expect(f.handle(payload)).rejects.toThrow(ZodError);
    expect(f.startThread).not.toHaveBeenCalled();
    expect(f.ensureThreadRunning).not.toHaveBeenCalled();
  });
  it("keeps this request outside public procedures and launch authorization fields", () => {
    expect(Object.keys(ipcProcedureMap)).not.toContain(THREAD_WORKSPACE_RUNTIME_REQUEST);
    expect(Object.keys(ipcProcedureMap)).not.toContain(CONTROLLED_WORKSPACE_RUNTIME_REQUEST);
    expect(Object.keys(startThreadPayloadSchema.shape)).not.toContain("workspaceScope");
    const parsed = threadWorkspaceRuntimePayloadSchema.parse({
      action: "launch",
      version: 1,
      incarnation: "b36805a3-1c39-49af-af5c-3fe205ad45ef",
      procedure: "startThread",
      launch: { ...launch, workspaceScope: { ...scope, additionalDirectories: [] } },
      scope,
    });
    expect(parsed.action === "launch" && parsed.launch).not.toHaveProperty("workspaceScope");
  });
});
