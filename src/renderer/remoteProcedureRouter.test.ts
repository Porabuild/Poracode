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
  const client = { callRemoteProcedure } as unknown as RemoteDesktopClient;
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
    callRemoteProcedure.mockClear();
    resetRemoteProcedureRouterForTest();
    registerRemoteProcedureHost(host);
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

  it("keeps all structurally project-scoped procedures explicitly classified", () => {
    const ownerKeys = new Set(["projectLocation", "worktreeLocation", "location", "projectId"]);
    const projectScoped = Object.entries(ipcProcedureMap)
      .filter(([, definition]) => {
        const schema = z.toJSONSchema(definition.payloadSchema, { unrepresentable: "any" }) as {
          properties?: Record<string, unknown>;
        };
        return Object.keys(schema.properties ?? {}).some((key) => ownerKeys.has(key));
      })
      .map(([name]) => name)
      .sort();
    const unclassified = projectScoped.filter(
      (name) => !(name in REMOTE_PROCEDURE_ROUTES) && !(name in NON_ROUTER_PROJECT_PROCEDURES),
    );
    expect(unclassified).toEqual([]);
  });
});
