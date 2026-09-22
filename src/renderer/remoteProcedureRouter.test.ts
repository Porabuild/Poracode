import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ipcProcedureMap, type IpcProcedureName } from "@/shared/ipc";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  isRemoteProcedure,
  REMOTE_PROCEDURE_SPECS,
  type RemoteProcedureOwner,
} from "@/shared/remote/procedures";
import { isRemoteIpcAdapterProcedure } from "@/shared/remote/ipcAdapter";
import {
  registerManagedLoopbackProcedureHost,
  registerRemoteProcedureHost,
  releaseRemoteTerminalsForServer,
  remoteTerminalOwner,
  resetRemoteProcedureRouterForTest,
  routeRemoteProcedure,
  stampRemoteOwnerOntoPayload,
  type RemoteProcedureHost,
  type RemoteRouteDecision,
} from "./remoteProcedureRouter";

/** The managed routing identity the loopback host registers itself under
 * (`hostTransport/managedIdentity.ts`); the router treats it as opaque data. */
const MANAGED_ROUTING_IDENTITY = "managed-loopback";
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
  if (owner === "parentLocation") return { parentLocation: location };
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

function decideWith(
  procedure: IpcProcedureName,
  payload: Record<string, unknown>,
  hostOverride: RemoteProcedureHost,
): RemoteRouteDecision {
  return (
    routeRemoteProcedure as unknown as (
      name: IpcProcedureName,
      input: Record<string, unknown>,
      override: RemoteProcedureHost,
    ) => RemoteRouteDecision
  )(procedure, payload, hostOverride);
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
  const writeTerminal = vi.fn<RemoteDesktopClient["writeTerminal"]>(async () => {});
  const resizeTerminal = vi.fn<RemoteDesktopClient["resizeTerminal"]>(async () => {});
  const schedules = vi.fn<RemoteDesktopClient["schedules"]>(async () => []);
  // R1: bounded thread-history adapter reads. Loosely typed so the test also
  // compiles (and fails) against a tree whose client does not carry them yet.
  const latestThreadGoalItem = vi.fn<(threadId: string) => Promise<unknown>>(async () => null);
  const threadCompletedTurns = vi.fn<(threadId: string) => Promise<unknown>>(async () => []);
  const threadContextUsage = vi.fn<(threadId: string) => Promise<unknown>>(async () => null);
  const client = {
    callRemoteProcedure,
    latestThreadGoalItem,
    threadCompletedTurns,
    threadContextUsage,
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
    writeTerminal,
    resizeTerminal,
    schedules,
  } as unknown as RemoteDesktopClient;
  const host: RemoteProcedureHost = {
    resolveThreadOwner: (threadId) =>
      threadId === "projected-thread" ? { desktopId: "d1", remoteId: "remote-thread" } : undefined,
    resolveProjectOwner: (projectId) =>
      projectId === "projected-project"
        ? { desktopId: "d1", remoteId: "remote-project" }
        : undefined,
    resolveDesktopOwner: () => ({ desktopId: "d1" }),
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

  it("serves the bounded thread-history reads through the adapter, never the supervisor passthrough (R1)", async () => {
    await remoteResult(decide("dbGetLatestThreadGoalItem", { threadId: "projected-thread" }));
    expect(latestThreadGoalItem).toHaveBeenCalledWith("remote-thread");
    await remoteResult(decide("dbGetThreadCompletedTurns", { threadId: "projected-thread" }));
    expect(threadCompletedTurns).toHaveBeenCalledWith("remote-thread");
    await remoteResult(decide("dbGetThreadContextUsage", { threadId: "projected-thread" }));
    expect(threadContextUsage).toHaveBeenCalledWith("remote-thread");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("allowlists only supervisor procedures in the generic passthrough (R1)", () => {
    const mainLocal = Object.entries(REMOTE_PROCEDURE_ROUTES)
      .filter(([, spec]) => spec.handler === "passthrough")
      .filter(([name]) => ipcProcedureMap[name as IpcProcedureName].transport !== "supervisor")
      .map(([name]) => name);
    expect(mainLocal).toEqual([]);
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

  it("projects queued follow-up mentions without changing cancellation ids", () => {
    expect(
      projectRemoteThreadEvent("d1", {
        type: "thread-follow-up-queue",
        threadId: "remote-thread",
        queue: {
          paused: true,
          items: [
            {
              id: "queue-item",
              prompt: "See source",
              stagedAt: 1,
              segments: [{ kind: "thread", threadId: "remote-source", title: "Source" }],
            },
          ],
        },
      }),
    ).toEqual({
      type: "thread-follow-up-queue",
      threadId: "remote:d1:thread:remote-thread",
      queue: {
        paused: true,
        items: [
          {
            id: "queue-item",
            prompt: "See source",
            stagedAt: 1,
            segments: [
              { kind: "thread", threadId: "remote:d1:thread:remote-source", title: "Source" },
            ],
          },
        ],
      },
    });
  });

  it("projects thread mentions in a remote queue snapshot", async () => {
    callRemoteProcedure.mockResolvedValueOnce({
      paused: false,
      items: [
        {
          id: "item",
          prompt: "See source",
          stagedAt: 1,
          segments: [{ kind: "thread", threadId: "source", title: "Source" }],
        },
      ],
    });
    await expect(
      remoteResult(decide("getThreadFollowUpQueue", { threadId: "projected-thread" })),
    ).resolves.toEqual({
      paused: false,
      items: [
        {
          id: "item",
          prompt: "See source",
          stagedAt: 1,
          segments: [{ kind: "thread", threadId: "remote:d1:thread:source", title: "Source" }],
        },
      ],
    });
    expect(callRemoteProcedure).toHaveBeenCalledWith("getThreadFollowUpQueue", {
      threadId: "remote-thread",
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

  it.each(Object.entries(REMOTE_PROCEDURE_SPECS).filter(([, spec]) => spec.owner !== "desktop"))(
    "keeps shared procedure %s local without a remote owner",
    (procedure, spec) => {
      expect(decide(procedure as IpcProcedureName, payloadForOwner(spec.owner, false))).toEqual({
        kind: "local",
      });
      expect(callRemoteProcedure).not.toHaveBeenCalled();
    },
  );

  it("routes former no-op names over the passthrough (V6 B.2)", async () => {
    const decision = decide("startThread", payloadForOwner("projectLocation", true));
    expect(decision.kind).toBe("remote");
    await remoteResult(decision);
    expect(callRemoteProcedure).toHaveBeenCalledWith("startThread", expect.any(Object));
    expect(REMOTE_PROCEDURE_ROUTES.startThread.handler).toBe("passthrough");
    expect(REMOTE_PROCEDURE_ROUTES.readTerminalSnapshot.handler).toBe("passthrough");
    // `dbGetThreadsPage` is deliberately absent: local paginated catalog
    // hydration executes over preload IPC (A2 startup fix; see the
    // local-shell classification test).
  });

  it("routes desktop-scoped adapter procedures to the attached host's desktop (V6 B.2)", async () => {
    const decision = decide("getSchedules", {});
    expect(decision.kind).toBe("remote");
    await remoteResult(decision);
    expect(schedules).toHaveBeenCalledTimes(1);
    expect(callRemoteProcedure).not.toHaveBeenCalled();
    expect(REMOTE_PROCEDURE_ROUTES.getSchedules.owner).toBe("desktop");
  });

  it("forwards desktop-scoped passthrough payloads untouched (V6 B.2)", async () => {
    const decision = decide("listSkillMarketplace", { marketplace: "official", sort: "rank" });
    expect(decision.kind).toBe("remote");
    await remoteResult(decision);
    expect(callRemoteProcedure).toHaveBeenCalledWith("listSkillMarketplace", {
      marketplace: "official",
      sort: "rank",
    });
  });

  it("keeps desktop-scoped procedures local when no desktop owner is attached", () => {
    registerRemoteProcedureHost({ ...host, resolveDesktopOwner: () => undefined });
    expect(decide("getSchedules", {}).kind).toBe("local");
    expect(decide("listSkillMarketplace", { marketplace: "official" }).kind).toBe("local");
  });

  it("classifies every IPC procedure as routable or justified local-shell (V6 B.2)", () => {
    const all = Object.keys(ipcProcedureMap);
    // No fall-through: every procedure name must be classified in exactly one
    // of the two tables. Anything outside ROUTES executes over preload IPC,
    // and anything inside ROUTES is refused there ("IPC data plane removed").
    const unclassified = all.filter(
      (name) => !(name in REMOTE_PROCEDURE_ROUTES) && !(name in NON_ROUTER_PROJECT_PROCEDURES),
    );
    expect(unclassified).toEqual([]);
    const overlapping = all.filter(
      (name) => name in REMOTE_PROCEDURE_ROUTES && name in NON_ROUTER_PROJECT_PROCEDURES,
    );
    expect(overlapping).toEqual([]);
    // A justification must say WHY the name can never leave the local shell
    // — not a bare prefix and not a legacy one-word tag.
    const unjustified = Object.entries(NON_ROUTER_PROJECT_PROCEDURES)
      .filter((entry) => {
        const reason = entry[1].replace(/^local-shell: /, "");
        return !entry[1].startsWith("local-shell: ") || reason.length < 15;
      })
      .map(([name, justification]) => `${name}: "${justification}"`);
    expect(unjustified).toEqual([]);
    // Nothing classified local-shell may be expected to work remotely: the
    // server allowlist and the adapter surface must not list it.
    const remotelyListed = Object.keys(NON_ROUTER_PROJECT_PROCEDURES).filter(
      (name) => isRemoteProcedure(name) || isRemoteIpcAdapterProcedure(name),
    );
    expect(remotelyListed).toEqual([]);
    expect(NON_ROUTER_PROJECT_PROCEDURES).toMatchObject({
      pickFolder: expect.stringMatching(/^local-shell: /),
      relaunchApp: expect.stringMatching(/^local-shell: /),
      setRemoteAccessEnabled: expect.stringMatching(/^local-shell: /),
      getSharedSettings: expect.stringMatching(/^local-shell: /),
      browserNavigate: expect.stringMatching(/^local-shell: /),
      sshConnect: expect.stringMatching(/^local-shell: /),
      dbGetProjects: expect.stringMatching(/^local-shell: /),
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

  it.each([undefined, { desktopId: "other-host" }])(
    "rejects implicit global skill locations without the matching global-scope owner (%j)",
    async (globalOwner) => {
      registerRemoteProcedureHost({ ...host, resolveDesktopOwner: () => globalOwner });
      for (const skill of [
        {
          sourcePath: "/local/global-skill",
          projectLocation: remoteLocation,
          destinationScope: "project",
          mode: "copy",
        },
        {
          sourcePath: "/remote/project-skill",
          sourceProjectLocation: remoteLocation,
          destinationScope: "global",
          mode: "copy",
        },
      ]) {
        await expect(remoteResult(decide("importSkills", { skills: [skill] }))).rejects.toThrow(
          "Can't reach the remote server",
        );
      }
      expect(callRemoteProcedure).not.toHaveBeenCalled();
    },
  );

  it("routes a global-sourced skill import whose absent sourceProjectLocation scopes to the resolved owner", async () => {
    // SkillImportModal's global-source flow omits `sourceProjectLocation`:
    // the source is the executing owner's host-global scope, not a mixed
    // local/remote import (a PRESENT local source still rejects above).
    const decision = decide("importSkills", {
      skills: [{ projectLocation: remoteLocation, sourcePath: "/remote/global-skill" }],
    });

    expect(decision.kind).toBe("remote");
    await remoteResult(decision);
    expect(callRemoteProcedure).toHaveBeenCalledWith("importSkills", {
      skills: [
        {
          projectLocation: { kind: "posix", path: "/remote/project" },
          sourcePath: "/remote/global-skill",
        },
      ],
    });
  });

  it("routes a global-destination skill import whose absent projectLocation scopes to the resolved owner", async () => {
    const decision = decide("importSkills", {
      skills: [{ sourceProjectLocation: remoteLocation, sourcePath: "/remote/project/SKILL.md" }],
    });

    expect(decision.kind).toBe("remote");
    await remoteResult(decision);
    expect(callRemoteProcedure).toHaveBeenCalledWith("importSkills", {
      skills: [
        {
          sourceProjectLocation: { kind: "posix", path: "/remote/project" },
          sourcePath: "/remote/project/SKILL.md",
        },
      ],
    });
  });

  it("scopes a fully location-less skill to the owner a sibling skill resolved", async () => {
    const decision = decide("importSkills", {
      skills: [
        { sourcePath: "/remote/global-skill" },
        { projectLocation: remoteLocation, sourcePath: "/remote/project-skill" },
      ],
    });

    expect(decision.kind).toBe("remote");
    await remoteResult(decision);
    expect(callRemoteProcedure).toHaveBeenCalledWith("importSkills", {
      skills: [
        { sourcePath: "/remote/global-skill" },
        {
          projectLocation: { kind: "posix", path: "/remote/project" },
          sourcePath: "/remote/project-skill",
        },
      ],
    });
  });

  it("rejects a skill import whose present sourceProjectLocation is not a location", async () => {
    const decision = decide("importSkills", {
      skills: [{ projectLocation: remoteLocation, sourceProjectLocation: "/not/a/location" }],
    });

    await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("rejects a skill import whose two optional locations stamp to different remote owners", async () => {
    const decision = decide("importSkills", {
      skills: [
        {
          projectLocation: remoteLocation,
          sourceProjectLocation: { kind: "posix", path: "/elsewhere", remoteServerId: "d2" },
        },
      ],
    });

    await expect(remoteResult(decision)).rejects.toThrow("Can't reach the remote server");
    expect(callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("rejects a nested skill that escapes to a different remote owner", async () => {
    const decision = decide("importSkills", {
      skills: [
        { projectLocation: remoteLocation, sourcePath: "/remote/one" },
        {
          projectLocation: { kind: "posix", path: "/other", remoteServerId: "d2" },
          sourcePath: "/two",
        },
      ],
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

  describe("managed loopback ownership routing", () => {
    const managedStartShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => {});
    const managedWriteTerminal = vi.fn<RemoteDesktopClient["writeTerminal"]>(async () => {});
    const managedResizeTerminal = vi.fn<RemoteDesktopClient["resizeTerminal"]>(async () => {});
    const managedCloseShell = vi.fn<RemoteDesktopClient["closeShell"]>(async () => {});
    const managedCallRemoteProcedure = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(
      async () => ({ imported: [] }),
    );
    const managedClient = {
      startShell: managedStartShell,
      writeTerminal: managedWriteTerminal,
      resizeTerminal: managedResizeTerminal,
      closeShell: managedCloseShell,
      callRemoteProcedure: managedCallRemoteProcedure,
    } as unknown as RemoteDesktopClient;

    const managedLocation = {
      kind: "posix" as const,
      path: "/managed/project",
      remoteServerId: MANAGED_ROUTING_IDENTITY,
    };

    function registerManaged(isCurrent: () => boolean = () => true): RemoteProcedureHost {
      const managedHost: RemoteProcedureHost = {
        resolveThreadOwner: () => undefined,
        resolveProjectOwner: () => undefined,
        resolveDesktopOwner: () => ({ desktopId: MANAGED_ROUTING_IDENTITY }),
        withClient: async (desktopId, invoke) => {
          expect(desktopId).toBe(MANAGED_ROUTING_IDENTITY);
          return invoke(managedClient);
        },
      };
      registerManagedLoopbackProcedureHost({
        desktopId: MANAGED_ROUTING_IDENTITY,
        host: managedHost,
        isCurrent,
      });
      return managedHost;
    }

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("routes a managed-owned shell start and its writes/resize/close through the live managed host", async () => {
      const managedHost = registerManaged();
      await remoteResult(
        decideWith(
          "startShell",
          { shellId: "shell-managed", projectLocation: managedLocation },
          managedHost,
        ),
      );
      expect(managedStartShell).toHaveBeenCalledWith({
        shellId: "shell-managed",
        projectLocation: { kind: "posix", path: "/managed/project" },
      });
      expect(startShell).not.toHaveBeenCalled();

      await remoteResult(decide("writeTerminal", { threadId: "shell-managed", data: "echo hi\r" }));
      await remoteResult(
        decide("resizeTerminal", { threadId: "shell-managed", cols: 120, rows: 30 }),
      );
      await remoteResult(decide("closeThread", { threadId: "shell-managed" }));

      expect(managedWriteTerminal).toHaveBeenCalledWith({
        threadId: "shell-managed",
        data: "echo hi\r",
      });
      expect(managedResizeTerminal).toHaveBeenCalledWith({
        threadId: "shell-managed",
        cols: 120,
        rows: 30,
      });
      expect(managedCloseShell).toHaveBeenCalledWith({ threadId: "shell-managed" });
      expect(writeTerminal).not.toHaveBeenCalled();
      expect(resizeTerminal).not.toHaveBeenCalled();
      expect(closeShell).not.toHaveBeenCalled();
      expect(remoteTerminalOwner("shell-managed")).toBeUndefined();
    });

    it("fails a managed-owned route truthfully when the leg is down and never reassigns it to a persisted host", async () => {
      const managedHost = registerManaged();
      await remoteResult(
        decideWith(
          "startShell",
          { shellId: "shell-managed", projectLocation: managedLocation },
          managedHost,
        ),
      );

      registerManagedLoopbackProcedureHost(null);
      await expect(
        remoteResult(decide("writeTerminal", { threadId: "shell-managed", data: "x" })),
      ).rejects.toThrow("Can't reach the remote server");
      expect(managedWriteTerminal).not.toHaveBeenCalled();
      expect(writeTerminal).not.toHaveBeenCalled();

      // A registration of a retired activation is fenced the same way.
      registerManaged(() => false);
      await expect(
        remoteResult(decide("writeTerminal", { threadId: "shell-managed", data: "y" })),
      ).rejects.toThrow("Can't reach the remote server");
      expect(managedWriteTerminal).not.toHaveBeenCalled();
      expect(writeTerminal).not.toHaveBeenCalled();
    });

    it("routes a persisted owner whose desktop id equals the managed routing identity through the persisted host", async () => {
      const collisionStartShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => {});
      const collisionWriteTerminal = vi.fn<RemoteDesktopClient["writeTerminal"]>(async () => {});
      const collisionClient = {
        startShell: collisionStartShell,
        writeTerminal: collisionWriteTerminal,
      } as unknown as RemoteDesktopClient;
      const collisionHost: RemoteProcedureHost = {
        resolveThreadOwner: () => undefined,
        resolveProjectOwner: () => undefined,
        resolveDesktopOwner: () => ({ desktopId: MANAGED_ROUTING_IDENTITY }),
        withClient: async (desktopId, invoke) => {
          expect(desktopId).toBe(MANAGED_ROUTING_IDENTITY);
          return invoke(collisionClient);
        },
      };
      registerManaged();
      registerRemoteProcedureHost(collisionHost);
      await remoteResult(
        decideWith(
          "startShell",
          { shellId: "shell-collision", projectLocation: managedLocation },
          collisionHost,
        ),
      );
      await remoteResult(decide("writeTerminal", { threadId: "shell-collision", data: "x" }));

      expect(collisionStartShell).toHaveBeenCalledWith({
        shellId: "shell-collision",
        projectLocation: { kind: "posix", path: "/managed/project" },
      });
      expect(collisionWriteTerminal).toHaveBeenCalledWith({
        threadId: "shell-collision",
        data: "x",
      });
      expect(managedWriteTerminal).not.toHaveBeenCalled();
      // The persisted owner still reports its own paired id (feed namespace).
      expect(remoteTerminalOwner("shell-collision")).toBe(MANAGED_ROUTING_IDENTITY);
    });

    it("reports paired desktop ids for persisted owners and releases them by server key", async () => {
      await remoteResult(
        decide("startShell", { shellId: "shell-remote", projectLocation: remoteLocation }),
      );
      expect(remoteTerminalOwner("shell-remote")).toBe("d1");

      releaseRemoteTerminalsForServer("owned-elsewhere");
      expect(remoteTerminalOwner("shell-remote")).toBe("d1");
      releaseRemoteTerminalsForServer("d1");
      expect(remoteTerminalOwner("shell-remote")).toBeUndefined();
    });

    it("clears managed ownership when the managed start fails", async () => {
      const managedHost = registerManaged();
      managedStartShell.mockRejectedValueOnce(new Error("start refused"));
      await expect(
        remoteResult(
          decideWith(
            "startShell",
            { shellId: "shell-failed", projectLocation: managedLocation },
            managedHost,
          ),
        ),
      ).rejects.toThrow("start refused");

      // No ownership was retained: the later write is a local resolution (the
      // transport decides the plane), never a managed-owned route.
      expect(decide("writeTerminal", { threadId: "shell-failed", data: "x" }).kind).toBe("local");
    });

    it("routes the smoke gate's global-source import through the actual stamp→route path", async () => {
      const managedHost = registerManaged();
      // Exact smoke skills-manager gate shape (SkillImportModal global-source
      // import): project destination carries a location, the global source
      // omits `sourceProjectLocation`. `routeManagedLoopbackRequest` stamps
      // the desktop's own locations before routing; the absent optional field
      // scopes to that resolved managed owner.
      const gatePayload = {
        skills: [
          {
            sourcePath: "/tmp/smoke-external/SKILL.md",
            destinationScope: "project",
            mode: "copy",
            replace: false,
            projectLocation: { kind: "posix", path: "/tmp/smoke-project" },
          },
        ],
      };
      const stamped = stampRemoteOwnerOntoPayload(gatePayload, MANAGED_ROUTING_IDENTITY);

      await remoteResult(decideWith("importSkills", stamped as typeof gatePayload, managedHost));

      expect(managedCallRemoteProcedure).toHaveBeenCalledWith("importSkills", {
        skills: [
          {
            sourcePath: "/tmp/smoke-external/SKILL.md",
            destinationScope: "project",
            mode: "copy",
            replace: false,
            projectLocation: { kind: "posix", path: "/tmp/smoke-project" },
          },
        ],
      });
      // The wire payload carries no routing stamp.
      expect(JSON.stringify(managedCallRemoteProcedure.mock.calls.at(-1)?.[1])).not.toContain(
        "remoteServerId",
      );
      expect(callRemoteProcedure).not.toHaveBeenCalled();
    });
  });
});
