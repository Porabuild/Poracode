import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ipcProcedureMap, type IpcProcedureName } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  REMOTE_NOOP_PROCEDURES,
  REMOTE_PROCEDURE_SPECS,
  type RemoteProcedureOwner,
} from "@/shared/remote/procedures";
import {
  registerRemoteProcedureHost,
  resetRemoteProcedureRouterForTest,
  routeRemoteProcedure,
  type RemoteProcedureHost,
  type RemoteRouteDecision,
} from "./remoteProcedureRouter";
import { NON_ROUTER_PROJECT_PROCEDURES, REMOTE_PROCEDURE_ROUTES } from "./remoteProcedureRoutes";

const remoteLocation = {
  kind: "posix" as const,
  path: "/remote/project",
  remoteServerId: "d1",
};

function payloadForOwner(owner: RemoteProcedureOwner, remote: boolean): Record<string, unknown> {
  const location = remote ? remoteLocation : { kind: "posix" as const, path: "/local/project" };
  if (owner === "projectLocation" || owner === "optionalProjectLocation") {
    return { projectLocation: location };
  }
  if (owner === "worktreeLocation") return { worktreeLocation: location };
  if (owner === "location") return { location };
  if (owner === "runtime") return { runtime: location };
  if (owner === "skillLocations") {
    return {
      skills: [{ projectLocation: location, sourceProjectLocation: location }],
    };
  }
  if (owner === "thread" || owner === "terminal") {
    return { threadId: remote ? "projected-thread" : "local-thread" };
  }
  if (owner === "project") {
    return { projectId: remote ? "projected-project" : "local-project" };
  }
  return {};
}

function decide(
  procedure: IpcProcedureName,
  payload: Record<string, unknown>,
): RemoteRouteDecision {
  return (
    routeRemoteProcedure as unknown as (
      name: IpcProcedureName,
      input: Record<string, unknown>,
    ) => RemoteRouteDecision
  )(procedure, payload);
}

function remoteResult(decision: RemoteRouteDecision): Promise<unknown> {
  if (decision.kind === "local") throw new Error("Expected a remote route");
  return decision.result;
}

describe("remote procedure routing registry", () => {
  const callRemoteProcedure = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => ({
    remote: true,
  }));
  const projectNotes = vi.fn<RemoteDesktopClient["projectNotes"]>(async () => ({
    projectId: "remote-project",
    doc: null,
    todos: [],
    updatedAt: "2026-08-02T00:00:00.000Z",
  }));
  const getPrWatch = vi.fn<RemoteDesktopClient["getPrWatch"]>(async () => ({
    projectId: "remote-project",
    prNumber: 465,
    headBranch: "remote-branch",
    watchEnabled: false,
    autoMerge: false,
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
  }));
  const upsertPrWatch = vi.fn<RemoteDesktopClient["upsertPrWatch"]>(async (input) => ({
    ...input,
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
  }));
  const sendThreadInput = vi.fn<RemoteDesktopClient["sendThreadInput"]>(async () => {});
  const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {});
  const controlThreadGoal = vi.fn<RemoteDesktopClient["controlThreadGoal"]>(async () => {});
  const setPendingSteer = vi.fn<RemoteDesktopClient["setPendingSteer"]>(async () => {});
  const clearPendingSteer = vi.fn<RemoteDesktopClient["clearPendingSteer"]>(async () => {});
  const resolveRequest = vi.fn<RemoteDesktopClient["resolveRequest"]>(async () => {});
  const truncateThreadRuntimeAfter = vi.fn<RemoteDesktopClient["truncateThreadRuntimeAfter"]>(
    async () => {},
  );
  const uploadAttachment = vi.fn<RemoteDesktopClient["uploadAttachment"]>(
    async () => "/remote/attachment",
  );
  const startShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => {});
  const closeShell = vi.fn<RemoteDesktopClient["closeShell"]>(async () => {});
  const closeThread = vi.fn<RemoteDesktopClient["closeThread"]>(async () => {});
  const client = {
    callRemoteProcedure,
    projectNotes,
    getPrWatch,
    upsertPrWatch,
    sendThreadInput,
    interruptThread,
    controlThreadGoal,
    setPendingSteer,
    clearPendingSteer,
    resolveRequest,
    truncateThreadRuntimeAfter,
    uploadAttachment,
    startShell,
    closeShell,
    closeThread,
  } as unknown as RemoteDesktopClient;
  const host: RemoteProcedureHost = {
    resolveThreadOwner: (threadId) =>
      threadId === "projected-thread" ? { desktopId: "d1", remoteId: "remote-thread" } : undefined,
    resolveProjectOwner: (projectId) =>
      projectId === "projected-project"
        ? { desktopId: "d1", remoteId: "remote-project" }
        : undefined,
    withClient: async (desktopId, invoke) => {
      expect(desktopId).toBe("d1");
      return invoke(client);
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRemoteProcedureRouterForTest();
    registerRemoteProcedureHost(host);
  });

  it("persists remote runtime truncation on the authoritative host", async () => {
    await remoteResult(
      decide("dbTruncateThreadRuntimeAfter", {
        threadId: "projected-thread",
        itemId: "item-2",
      }),
    );

    expect(truncateThreadRuntimeAfter).toHaveBeenCalledWith({
      threadId: "remote-thread",
      itemId: "item-2",
    });
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it.each(Object.entries(REMOTE_PROCEDURE_SPECS).filter(([, spec]) => spec.owner !== "none"))(
    "routes shared procedure %s by its declared owner",
    async (procedure, spec) => {
      const decision = decide(procedure as IpcProcedureName, payloadForOwner(spec.owner, true));
      expect(decision.kind).toBe("remote");
      await remoteResult(decision);
      expect(callRemoteProcedure).toHaveBeenCalledWith(procedure, expect.any(Object));
      expect(JSON.stringify(callRemoteProcedure.mock.calls.at(-1)?.[1])).not.toContain(
        "remoteServerId",
      );
    },
  );

  it.each(Object.entries(REMOTE_PROCEDURE_SPECS))(
    "keeps shared procedure %s local without a remote owner",
    (procedure, spec) => {
      expect(decide(procedure as IpcProcedureName, payloadForOwner(spec.owner, false))).toEqual({
        kind: "local",
      });
      expect(callRemoteProcedure).not.toHaveBeenCalled();
    },
  );

  it.each(Object.entries(REMOTE_NOOP_PROCEDURES))(
    "resolves remote no-op %s without invoking the client",
    async (procedure, owner) => {
      const decision = decide(procedure as IpcProcedureName, payloadForOwner(owner, true));
      expect(decision.kind).toBe("remote");
      await remoteResult(decision);
      expect(callRemoteProcedure).not.toHaveBeenCalled();
    },
  );

  it("keeps terminal snapshot reads on the remote host", () => {
    expect(REMOTE_PROCEDURE_ROUTES).not.toHaveProperty("readTerminalScrollback");
    expect(REMOTE_PROCEDURE_ROUTES).not.toHaveProperty("readTerminalSize");
    expect(REMOTE_PROCEDURE_ROUTES).not.toHaveProperty("readTerminalSnapshot");
    expect(NON_ROUTER_PROJECT_PROCEDURES).toMatchObject({
      readTerminalScrollback: "remote-thread-snapshot-provided",
      readTerminalSize: "remote-server-internal",
      readTerminalSnapshot: "remote-server-internal",
    });
  });

  it("rejects payloads that mix owners from different remote servers", async () => {
    const decision = decide("gitMergeToSource", {
      projectLocation: remoteLocation,
      worktreeLocation: {
        kind: "posix",
        path: "/other/worktree",
        remoteServerId: "d2",
      },
    });
    expect(decision.kind).toBe("remote");
    await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("rejects actions that mix local and remote project locations", async () => {
    const decision = decide("gitMergeToSource", {
      projectLocation: remoteLocation,
      worktreeLocation: { kind: "posix", path: "/local/worktree" },
    });

    await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("never falls projected remote owners through to local when their mirror disappears", async () => {
    registerRemoteProcedureHost({
      ...host,
      resolveThreadOwner: () => undefined,
      resolveProjectOwner: () => undefined,
    });

    const decisions = [
      decide("sendThreadInput", {
        threadId: "remote:d1:thread:rt-1",
        prompt: "test",
        config: { model: "test-model" },
      }),
      decide("createFileCheckpoint", {
        threadId: "remote:d1:thread:rt-1",
        checkpointItemId: "checkpoint-1",
        projectLocation: remoteLocation,
      }),
      decide("dbGetProjectNotes", { projectId: "remote:d1:project:p1" }),
      decide("writeTerminal", { threadId: "remote:d1:thread:rt-1", data: "x" }),
    ];

    for (const decision of decisions) {
      expect(decision.kind).toBe("remote");
      await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    }
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("fails closed for projected owners when no remote host is registered", async () => {
    registerRemoteProcedureHost(undefined);

    const projected = decide("sendThreadInput", {
      threadId: "remote:d1:thread:rt-1",
      prompt: "test",
      config: { model: "test-model" },
    });
    expect(projected.kind).toBe("remote");
    await expect(remoteResult(projected)).rejects.toThrow("Can't reach the remote server");
    expect(
      decide("sendThreadInput", {
        threadId: "remote-local-looking-id",
        prompt: "test",
        config: { model: "test-model" },
      }).kind,
    ).toBe("local");
  });

  it("rejects skill imports that cross local and remote hosts", async () => {
    const decision = decide("importSkills", {
      skills: [
        {
          projectLocation: remoteLocation,
          sourceProjectLocation: { kind: "posix", path: "/local/project" },
        },
      ],
    });

    await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("rejects skill imports between the local global scope and a remote project", async () => {
    const decision = decide("importSkills", {
      skills: [{ projectLocation: remoteLocation, sourcePath: "/local/global-skill" }],
    });

    await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("projects project ids returned by remote notes and PR watch handlers", async () => {
    await expect(
      remoteResult(decide("dbGetProjectNotes", { projectId: "projected-project" })),
    ).resolves.toMatchObject({ projectId: "projected-project" });
    await expect(
      remoteResult(
        decide("upsertPrWatch", {
          projectId: "projected-project",
          prNumber: 465,
          headBranch: "remote-branch",
          watchEnabled: false,
          autoMerge: false,
        }),
      ),
    ).resolves.toMatchObject({ projectId: "projected-project" });
    await expect(
      remoteResult(decide("getPrWatch", { projectId: "projected-project", prNumber: 465 })),
    ).resolves.toMatchObject({ projectId: "projected-project" });
  });

  it("routes thread controls through one owner-aware dispatch seam", async () => {
    const threadId = "projected-thread";
    await remoteResult(
      decide("sendThreadInput", {
        threadId,
        prompt: "test",
        config: { model: "test-model" },
      }),
    );
    await remoteResult(decide("interruptThread", { threadId }));
    await remoteResult(decide("controlThreadGoal", { threadId, action: "pause" }));
    await remoteResult(
      decide("setPendingSteer", {
        threadId,
        prompt: "next",
        config: { model: "test-model" },
      }),
    );
    await remoteResult(decide("clearPendingSteer", { threadId }));
    await remoteResult(
      decide("resolveThreadServerRequest", {
        threadId,
        requestId: "request-1",
        method: "item/tool/call",
        response: { approved: true },
      }),
    );
    const image = new Uint8Array([1, 2, 3]);
    await remoteResult(decide("saveClipboardImage", { threadId, data: image, extension: "png" }));
    await remoteResult(decide("saveHandoffContext", { threadId, content: "remote context" }));

    expect(sendThreadInput).toHaveBeenCalledWith({
      threadId: "remote-thread",
      prompt: "test",
      config: { model: "test-model" },
    });
    expect(interruptThread).toHaveBeenCalledWith("remote-thread");
    expect(controlThreadGoal).toHaveBeenCalledWith({
      threadId: "remote-thread",
      action: "pause",
    });
    expect(setPendingSteer).toHaveBeenCalledWith({
      threadId: "remote-thread",
      prompt: "next",
      config: { model: "test-model" },
    });
    expect(clearPendingSteer).toHaveBeenCalledWith("remote-thread");
    expect(resolveRequest).toHaveBeenCalledWith({
      threadId: "remote-thread",
      requestId: "request-1",
      method: "item/tool/call",
      response: { approved: true },
    });
    expect(uploadAttachment).toHaveBeenNthCalledWith(1, {
      threadId: "remote-thread",
      fileName: expect.stringMatching(/^clipboard-.+\.png$/),
      data: image,
    });
    expect(uploadAttachment).toHaveBeenNthCalledWith(2, {
      threadId: "remote-thread",
      fileName: "handoff-context.md",
      data: new TextEncoder().encode("remote context"),
    });
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("distinguishes remote shell teardown from remote thread close", async () => {
    await remoteResult(
      decide("startShell", {
        shellId: "shell-1",
        projectLocation: remoteLocation,
      }),
    );
    await remoteResult(decide("closeThread", { threadId: "shell-1" }));
    await remoteResult(decide("closeThread", { threadId: "projected-thread" }));

    expect(startShell).toHaveBeenCalledWith({
      shellId: "shell-1",
      projectLocation: { kind: "posix", path: "/remote/project" },
    });
    expect(closeShell).toHaveBeenCalledWith({ threadId: "shell-1" });
    expect(closeThread).toHaveBeenCalledWith("remote-thread");
  });

  it("retries a failed remote shell close through the shell endpoint", async () => {
    closeShell.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await remoteResult(
      decide("startShell", {
        shellId: "shell-1",
        projectLocation: remoteLocation,
      }),
    );

    await expect(remoteResult(decide("closeThread", { threadId: "shell-1" }))).rejects.toThrow(
      "offline",
    );
    await expect(
      remoteResult(decide("closeThread", { threadId: "shell-1" })),
    ).resolves.toBeUndefined();

    expect(closeShell).toHaveBeenCalledTimes(2);
    expect(closeThread).not.toHaveBeenCalled();
  });

  it("keeps all structurally project-scoped procedures explicitly classified", () => {
    const ownerKeys = new Set([
      "projectLocation",
      "worktreeLocation",
      "sourceProjectLocation",
      "newLocation",
      "location",
      "parentLocation",
      "runtime",
      "projectId",
      "threadId",
      "shellId",
    ]);
    const projectScoped = Object.entries(ipcProcedureMap)
      .filter(([, definition]) => {
        const schema = z.toJSONSchema(definition.payloadSchema, { unrepresentable: "any" });
        const pending: unknown[] = [schema];
        while (pending.length > 0) {
          const current = pending.pop();
          if (!current || typeof current !== "object" || Array.isArray(current)) continue;
          const record = current as Record<string, unknown>;
          const properties = record.properties;
          if (
            properties &&
            typeof properties === "object" &&
            !Array.isArray(properties) &&
            Object.keys(properties).some((key) => ownerKeys.has(key))
          ) {
            return true;
          }
          pending.push(...Object.values(record));
        }
        return false;
      })
      .map(([name]) => name)
      .sort();
    const unclassified = projectScoped.filter(
      (name) => !(name in REMOTE_PROCEDURE_ROUTES) && !(name in NON_ROUTER_PROJECT_PROCEDURES),
    );
    expect(unclassified).toEqual([]);
  });
});
