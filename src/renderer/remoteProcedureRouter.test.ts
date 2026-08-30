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
import { projectRemoteThreadEvent } from "./state/remoteProjection";
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
    blockedReason: null,
  }));
  const upsertPrWatch = vi.fn<RemoteDesktopClient["upsertPrWatch"]>(async (input) => ({
    ...input,
    lastCommentCursor: null,
    lastReviewCommentCursor: null,
    lastReviewCursor: null,
    lastCheckKey: null,
    activeThreadId: null,
    lastError: null,
    blockedReason: null,
  }));
  const syncPrWatchAgent = vi.fn<RemoteDesktopClient["syncPrWatchAgent"]>(async () => {});
  const sendThreadInput = vi.fn<RemoteDesktopClient["sendThreadInput"]>(async () => {});
  const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {});
  const controlThreadGoal = vi.fn<RemoteDesktopClient["controlThreadGoal"]>(async () => {});
  const setPendingSteer = vi.fn<RemoteDesktopClient["setPendingSteer"]>(async () => {});
  const clearPendingSteer = vi.fn<RemoteDesktopClient["clearPendingSteer"]>(async () => {});
  const resolveRequest = vi.fn<RemoteDesktopClient["resolveRequest"]>(async () => {});
  const truncateThreadRuntimeAfter = vi.fn<RemoteDesktopClient["truncateThreadRuntimeAfter"]>(
    async () => {},
  );
  const threadRuntimeItemsPage = vi.fn<RemoteDesktopClient["threadRuntimeItemsPage"]>(async () => ({
    items: [],
    nextCursor: null,
  }));
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
    syncPrWatchAgent,
    sendThreadInput,
    interruptThread,
    controlThreadGoal,
    setPendingSteer,
    clearPendingSteer,
    resolveRequest,
    truncateThreadRuntimeAfter,
    threadRuntimeItemsPage,
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

  it("unprojects thread mention ids for the same remote host", async () => {
    registerRemoteProcedureHost({
      ...host,
      resolveThreadOwner: (threadId) => {
        if (threadId === "projected-thread") {
          return { desktopId: "d1", remoteId: "remote-thread" };
        }
        if (threadId === "projected-source") {
          return { desktopId: "d1", remoteId: "remote-source" };
        }
        return undefined;
      },
    });

    await remoteResult(
      decide("sendThreadInput", {
        threadId: "projected-thread",
        prompt: "use this context",
        config: { model: "test-model" },
        segments: [{ kind: "thread", threadId: "projected-source", title: "Source" }],
      }),
    );

    expect(sendThreadInput).toHaveBeenCalledWith({
      threadId: "remote-thread",
      prompt: "use this context",
      config: { model: "test-model" },
      segments: [{ kind: "thread", threadId: "remote-source", title: "Source" }],
    });
  });

  it("unprojects deleted same-host thread mentions from their projected id", async () => {
    await remoteResult(
      decide("sendThreadInput", {
        threadId: "projected-thread",
        prompt: "use this context",
        config: { model: "test-model" },
        segments: [
          { kind: "thread", threadId: "remote:d1:thread:deleted-source", title: "Source" },
        ],
      }),
    );

    expect(sendThreadInput).toHaveBeenCalledWith({
      threadId: "remote-thread",
      prompt: "use this context",
      config: { model: "test-model" },
      segments: [{ kind: "thread", threadId: "deleted-source", title: "Source" }],
    });
  });

  it("degrades cross-host thread mentions to text instead of an unresolvable id", async () => {
    await remoteResult(
      decide("sendThreadInput", {
        threadId: "projected-thread",
        prompt: "use this context",
        config: { model: "test-model" },
        segments: [
          { kind: "thread", threadId: "local-thread", title: "Local" },
          { kind: "thread", threadId: "remote:d2:thread:foreign", title: "Foreign" },
        ],
      }),
    );

    expect(sendThreadInput).toHaveBeenCalledWith({
      threadId: "remote-thread",
      prompt: "use this context",
      config: { model: "test-model" },
      segments: [
        { kind: "text", content: "@Local" },
        { kind: "text", content: "@Foreign" },
      ],
    });
  });

  it("projects thread mention ids in remote runtime history", async () => {
    threadRuntimeItemsPage.mockResolvedValueOnce({
      items: [
        {
          id: "user-1",
          type: "user_message",
          state: "completed",
          payload: {
            content: [{ kind: "thread", threadId: "remote-source", title: "Source" }],
          },
          streams: {},
        },
      ],
      nextCursor: null,
    });

    await expect(
      remoteResult(
        decide("dbGetThreadRuntimeItemsPage", {
          threadId: "projected-thread",
          beforePosition: 10,
          limit: 500,
        }),
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          payload: {
            content: [
              { kind: "thread", threadId: "remote:d1:thread:remote-source", title: "Source" },
            ],
          },
        }),
      ],
      nextCursor: null,
    });
    expect(threadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: "remote-thread",
      beforePosition: 10,
      limit: 500,
    });
  });

  it("projects thread mention ids in live runtime events", () => {
    expect(
      projectRemoteThreadEvent("d1", {
        type: "thread-runtime-event",
        threadId: "remote-thread",
        event: {
          type: "item.started",
          threadId: "remote-thread",
          itemId: "user-1",
          itemType: "user_message",
          payload: {
            content: [{ kind: "thread", threadId: "remote-source", title: "Source" }],
          },
        },
      }),
    ).toEqual({
      type: "thread-runtime-event",
      threadId: "remote:d1:thread:remote-thread",
      event: {
        type: "item.started",
        threadId: "remote:d1:thread:remote-thread",
        itemId: "user-1",
        itemType: "user_message",
        payload: {
          content: [
            { kind: "thread", threadId: "remote:d1:thread:remote-source", title: "Source" },
          ],
        },
      },
    });
  });

  it("keeps already-projected thread mention ids intact instead of double-wrapping", () => {
    const foreignBlock = {
      kind: "thread",
      threadId: "remote:d2:thread:foreign",
      title: "Foreign",
    };
    expect(
      projectRemoteThreadEvent("d1", {
        type: "thread-runtime-event",
        threadId: "remote-thread",
        event: {
          type: "item.started",
          threadId: "remote-thread",
          itemId: "user-1",
          itemType: "user_message",
          payload: { content: [foreignBlock] },
        },
      }),
    ).toMatchObject({
      event: { payload: { content: [foreignBlock] } },
    });
  });

  it("projects thread mention ids inside pending-steer events", () => {
    expect(
      projectRemoteThreadEvent("d1", {
        type: "thread-pending-steer",
        threadId: "remote-thread",
        pending: {
          id: "steer-1",
          prompt: "[thread mention] …",
          stagedAt: 1,
          segments: [{ kind: "thread", threadId: "remote-source", title: "Source" }],
        },
      }),
    ).toEqual({
      type: "thread-pending-steer",
      threadId: "remote:d1:thread:remote-thread",
      pending: {
        id: "steer-1",
        prompt: "[thread mention] …",
        stagedAt: 1,
        segments: [{ kind: "thread", threadId: "remote:d1:thread:remote-source", title: "Source" }],
      },
    });
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
    await remoteResult(
      decide("syncPrWatchAgent", {
        projectId: "projected-project",
        agentKind: "codex",
        config: { model: "gpt-5.6" },
      }),
    );
    expect(syncPrWatchAgent).toHaveBeenCalledWith({
      projectId: "remote-project",
      agentKind: "codex",
      config: { model: "gpt-5.6" },
    });
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
    // Unique per handoff: one thread can hand off more than once, and a fixed
    // name would let a later summary rewrite the file an earlier user message
    // still points at.
    expect(uploadAttachment).toHaveBeenNthCalledWith(2, {
      threadId: "remote-thread",
      fileName: expect.stringMatching(/^handoff-context-.+\.md$/),
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
