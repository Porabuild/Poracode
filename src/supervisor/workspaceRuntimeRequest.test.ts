import { ZodError } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createWorkspaceRuntimeRequestHandler } from "./workspaceRuntimeRequest";
import { ipcProcedureMap } from "@/shared/ipc/procedureMap";
import {
  THREAD_WORKSPACE_RUNTIME_REQUEST,
  threadWorkspaceRuntimePayloadSchema,
  threadWorkspaceRuntimeSupportSchema,
} from "@/shared/threadWorkspaceRuntimeProtocol";
import { startThreadPayloadSchema } from "@/shared/contracts/thread";

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
