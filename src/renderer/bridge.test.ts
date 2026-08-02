import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import { readBridge } from "./bridge";
import { registerRemoteProcedureHost, type RemoteProcedureHost } from "./remoteProcedureRouter";

function makeRemoteHost(
  gitCall: RemoteProcedureHost["gitCall"] = async () => undefined,
): RemoteProcedureHost {
  return {
    resolveThreadOwner: () => undefined,
    resolveProjectOwner: () => undefined,
    gitCall,
    loadThreadRuntimeItemsPage: async () => undefined,
    startRemoteShell: async () => {},
    closeRemoteTerminal: async () => {},
    writeThreadTerminal: async () => {},
    resizeThreadTerminal: async () => {},
  };
}

describe("remote-aware renderer bridge", () => {
  beforeEach(() => {
    registerRemoteProcedureHost(undefined);
  });

  it("routes allowlisted project procedures when a remote owner is resolved", async () => {
    const local = vi.fn<() => Promise<unknown>>(async () => ({ local: true }));
    window.poracode = {
      getGitStatus: local,
    } as unknown as PoracodeBridge;
    const remote = vi.fn<RemoteProcedureHost["gitCall"]>(async (_desktopId, procedure, payload) => {
      expect(_desktopId).toBe("d1");
      expect(procedure).toBe("getGitStatus");
      expect(payload).toEqual({
        projectLocation: { kind: "posix", path: "/remote/project" },
      });
      return { remote: true };
    });
    registerRemoteProcedureHost(makeRemoteHost(remote));

    await expect(
      readBridge().getGitStatus({
        projectLocation: {
          kind: "posix",
          path: "/remote/project",
          remoteServerId: "d1",
        },
      }),
    ).resolves.toEqual({ remote: true });
    expect(remote).toHaveBeenCalledOnce();
    expect(local).not.toHaveBeenCalled();
  });

  it("routes GitHub Actions procedures through the remote project owner", async () => {
    const local = vi.fn<() => Promise<unknown>>(async () => ({ local: true }));
    const calls = [
      ["ghListWorkflows", {}],
      ["ghListWorkflowRuns", { workflowId: 12 }],
      ["ghGetWorkflowRun", { runId: 34 }],
      ["ghGetWorkflowDefinition", { workflowId: 12, ref: "main" }],
      ["ghDispatchWorkflow", { workflowId: 12, ref: "main", inputs: { release: "true" } }],
      ["ghRerunWorkflowRun", { runId: 34, failedOnly: true }],
      ["ghCancelWorkflowRun", { runId: 34 }],
      ["ghDeleteWorkflowRun", { runId: 34 }],
    ] as const;
    window.poracode = Object.fromEntries(
      calls.map(([procedure]) => [procedure, local]),
    ) as unknown as PoracodeBridge;
    const remote = vi.fn<RemoteProcedureHost["gitCall"]>(async () => ({ remote: true }));
    registerRemoteProcedureHost(makeRemoteHost(remote));

    for (const [procedure, fields] of calls) {
      const payload = {
        projectLocation: {
          kind: "posix" as const,
          path: "/remote/project",
          remoteServerId: "d1",
        },
        ...fields,
      };
      const invoke = readBridge()[procedure] as (input: typeof payload) => Promise<unknown>;
      await expect(invoke(payload)).resolves.toEqual({ remote: true });
      expect(remote).toHaveBeenLastCalledWith("d1", procedure, {
        ...payload,
        projectLocation: { kind: "posix", path: "/remote/project" },
      });
    }
    expect(local).not.toHaveBeenCalled();
  });

  it("falls through to the local bridge when the router declines the payload", async () => {
    const local = vi.fn<() => Promise<unknown>>(async () => ({ local: true }));
    window.poracode = {
      getGitStatus: local,
    } as unknown as PoracodeBridge;
    registerRemoteProcedureHost(makeRemoteHost());

    await expect(
      readBridge().getGitStatus({
        projectLocation: { kind: "posix", path: "/local/project" },
      }),
    ).resolves.toEqual({ local: true });
    expect(local).toHaveBeenCalledOnce();
  });

  it("wraps the frozen Electron preload bridge without violating proxy invariants", async () => {
    let routedReceiver: unknown;
    let nativeReceiver: unknown;
    const source = Object.freeze({
      async getGitStatus(this: unknown) {
        routedReceiver = this;
        return { local: true };
      },
      nativeCall(this: unknown) {
        nativeReceiver = this;
      },
    });
    window.poracode = source as unknown as PoracodeBridge;

    await expect(
      readBridge().getGitStatus({
        projectLocation: { kind: "posix", path: "/local/project" },
      }),
    ).resolves.toEqual({ local: true });
    (readBridge() as unknown as { nativeCall(): void }).nativeCall();
    expect(routedReceiver).toBe(source);
    expect(nativeReceiver).toBe(source);
  });
});
