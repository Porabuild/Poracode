import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { readBridge } from "./bridge";
import { registerRemoteProcedureHost, type RemoteProcedureHost } from "./remoteProcedureRouter";

function makeRemoteHost(client: Partial<RemoteDesktopClient> = {}): RemoteProcedureHost {
  return {
    resolveThreadOwner: () => undefined,
    resolveProjectOwner: () => undefined,
    withClient: async (_desktopId, invoke) => invoke(client as RemoteDesktopClient),
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
    const remote = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async (procedure, payload) => {
      expect(procedure).toBe("getGitStatus");
      expect(payload).toEqual({
        projectLocation: { kind: "posix", path: "/remote/project" },
      });
      return { remote: true };
    });
    const remoteHost = makeRemoteHost({ callRemoteProcedure: remote });
    remoteHost.withClient = async (desktopId, invoke) => {
      expect(desktopId).toBe("d1");
      return invoke({ callRemoteProcedure: remote } as unknown as RemoteDesktopClient);
    };
    registerRemoteProcedureHost(remoteHost);

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
    const remote = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => ({
      remote: true,
    }));
    registerRemoteProcedureHost(makeRemoteHost({ callRemoteProcedure: remote }));

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
      expect(remote).toHaveBeenLastCalledWith(procedure, {
        ...payload,
        projectLocation: { kind: "posix", path: "/remote/project" },
      });
    }
    expect(local).not.toHaveBeenCalled();
  });

  it("routes PR automation through the remote project owner", async () => {
    const local = vi.fn<() => Promise<unknown>>(async () => ({ local: true }));
    window.poracode = {
      getPrWatch: local,
      checkPrWatch: local,
      upsertPrWatch: local,
      deletePrWatch: local,
    } as unknown as PoracodeBridge;
    const getPrWatch = vi.fn<RemoteDesktopClient["getPrWatch"]>(async () => null);
    const checkPrWatch = vi.fn<RemoteDesktopClient["checkPrWatch"]>(async () => {});
    const upsertPrWatch = vi.fn<RemoteDesktopClient["upsertPrWatch"]>(async (input) => {
      return {
        ...input,
        lastCommentCursor: null,
        lastReviewCommentCursor: null,
        lastReviewCursor: null,
        lastCheckKey: null,
        activeThreadId: null,
        lastError: null,
        blockedReason: null,
      };
    });
    const deletePrWatch = vi.fn<RemoteDesktopClient["deletePrWatch"]>(async () => {});
    registerRemoteProcedureHost({
      ...makeRemoteHost({ getPrWatch, checkPrWatch, upsertPrWatch, deletePrWatch }),
      resolveProjectOwner: () => ({ desktopId: "d1", remoteId: "project-1" }),
    });

    await readBridge().getPrWatch({ projectId: "remote-project", prNumber: 42 });
    await readBridge().checkPrWatch({ projectId: "remote-project", prNumber: 42 });
    await readBridge().upsertPrWatch({
      projectId: "remote-project",
      prNumber: 42,
      headBranch: "feature/remote",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol" },
    });
    await readBridge().deletePrWatch({ projectId: "remote-project", prNumber: 42 });

    const remoteKey = { projectId: "project-1", prNumber: 42 };
    expect(getPrWatch).toHaveBeenCalledWith(remoteKey);
    expect(checkPrWatch).toHaveBeenCalledWith(remoteKey);
    expect(upsertPrWatch).toHaveBeenCalledWith({
      projectId: "project-1",
      prNumber: 42,
      headBranch: "feature/remote",
      watchEnabled: true,
      autoMerge: true,
      agentKind: "codex",
      config: { model: "gpt-5.6-sol" },
    });
    expect(deletePrWatch).toHaveBeenCalledWith(remoteKey);
    expect(local).not.toHaveBeenCalled();
  });

  it("routes positional project-note calls and rewrites the projected project id", async () => {
    const localGet = vi.fn<PoracodeBridge["dbGetProjectNotes"]>(async () => null);
    const localSet = vi.fn<PoracodeBridge["dbSetProjectNotes"]>(async () => undefined);
    window.poracode = {
      dbGetProjectNotes: localGet,
      dbSetProjectNotes: localSet,
    } as unknown as PoracodeBridge;
    const notes = {
      projectId: "project-1",
      doc: null,
      todos: [],
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const projectNotes = vi.fn<RemoteDesktopClient["projectNotes"]>(async () => notes);
    const setProjectNotes = vi.fn<RemoteDesktopClient["setProjectNotes"]>(async () => {});
    registerRemoteProcedureHost({
      ...makeRemoteHost({ projectNotes, setProjectNotes }),
      resolveProjectOwner: (projectId) =>
        projectId === "remote-project" ? { desktopId: "d1", remoteId: "project-1" } : undefined,
    });

    await expect(readBridge().dbGetProjectNotes("remote-project")).resolves.toEqual({
      ...notes,
      projectId: "remote-project",
    });
    await readBridge().dbSetProjectNotes({ ...notes, projectId: "remote-project" });

    expect(projectNotes).toHaveBeenCalledWith("project-1");
    expect(setProjectNotes).toHaveBeenCalledWith(notes);
    expect(localGet).not.toHaveBeenCalled();
    expect(localSet).not.toHaveBeenCalled();
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
