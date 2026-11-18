import { useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { McpServer, Project } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type {
  RemoteMcpSettingsCommand,
  RemoteMcpSettingsOperation,
  RemoteMcpSettingsScope,
} from "@/shared/remote/contract/routeSchemas";
import { friendlyError } from "@/shared/messages";
import { Button } from "@/renderer/components/common/Button";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { currentRemoteServerGeneration } from "@/renderer/state/remoteServers/eventSocketRegistry";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { McpServersManager } from "./McpServersManager";
import { RemoteMcpOauthDialog } from "./RemoteMcpOauthDialog";
import { toast } from "@heroui/react";

interface Props {
  connectionKey: string;
  projects: readonly Project[];
  workspace?: Project;
}

export function RemoteMcpServersManager(props: Props) {
  const { connectionKey, workspace } = props;
  const [retry, setRetry] = useState(0);
  const server = useRemoteServersStore((s) =>
    s.servers.find((entry) => remoteConnectionKey(entry) === connectionKey),
  );
  const status = useRemoteServersStore((s) => s.runtime[connectionKey]?.status);
  if (!server || status !== "online") {
    return (
      <p className="text-sm text-muted" role="status">
        {status === "connecting" ? <Trans>Connecting…</Trans> : <Trans>Offline</Trans>}
      </p>
    );
  }
  const generation = currentRemoteServerGeneration(connectionKey);
  return (
    <ConnectedMcpServersManager
      key={JSON.stringify([connectionKey, generation, workspace?.id, retry])}
      {...props}
      generation={generation}
      onRetry={() => setRetry((value) => value + 1)}
    />
  );
}

type Lists = { global: McpServer[]; workspace?: McpServer[] };
type LoadState = { lists: Lists } | { error: string } | null;
type PendingSignIn = {
  scope: RemoteMcpSettingsScope;
  server: McpServer;
  flowId: string;
  authorizationUrl: string;
};

function oauthScopeKey(scope: RemoteMcpSettingsScope): string {
  return scope.kind === "global" ? "global" : `project:${scope.projectId}`;
}

function scopeOnHost(connectionKey: string, project: Project): RemoteMcpSettingsScope {
  const owner = remoteOwner(project);
  if (owner?.desktopId !== connectionKey) throw new Error("MCP project belongs to another host.");
  return { kind: "project", projectId: owner.remoteId };
}

function ConnectedMcpServersManager({
  connectionKey,
  generation,
  projects,
  workspace,
  onRetry,
}: Props & {
  generation: number;
  onRetry: () => void;
}) {
  const { t } = useLingui();
  const withClient = useRemoteServersStore((s) => s.withClient);
  const [state, setState] = useState<LoadState>(null);
  const [authenticated, setAuthenticated] = useState<Record<string, string[]>>({});
  const [pendingSignIn, setPendingSignIn] = useState<PendingSignIn>();
  const [oauthBusy, setOauthBusy] = useState(false);
  const mutations = useRef(Promise.resolve());
  const lifetime = useRef<AbortController | null>(null);
  const workspaceId = workspace ? remoteOwner(workspace)?.remoteId : undefined;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void withClient(connectionKey, async (client): Promise<Lists> => {
      const [global, project] = await Promise.all([
        client.mcpServers(),
        workspaceId ? client.projectSettings(workspaceId) : undefined,
      ]);
      return { global, ...(project ? { workspace: project.mcpServers ?? [] } : {}) };
    }).then(
      (lists) => {
        if (
          !controller.signal.aborted &&
          generation === currentRemoteServerGeneration(connectionKey)
        ) {
          setState({ lists });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ error: friendlyError(error) });
      },
    );
    return () => controller.abort();
  }, [connectionKey, generation, withClient, workspaceId]);

  function request<Result>(
    run: (client: RemoteDesktopClient) => Promise<Result>,
    signal = lifetime.current?.signal,
  ): Promise<Result> {
    const check = () => {
      if (
        !signal ||
        signal.aborted ||
        generation !== currentRemoteServerGeneration(connectionKey)
      ) {
        throw new Error(t`Connection failed.`);
      }
    };
    return withClient(connectionKey, async (client) => {
      check();
      const response = await run(client);
      check();
      return response;
    });
  }

  const resolveScope = (projectId: string | undefined): RemoteMcpSettingsScope => {
    if (projectId === undefined) return { kind: "global" };
    const project = projects.find((item) => item.id === projectId);
    if (!project) throw new Error(t`Project not found.`);
    return scopeOnHost(connectionKey, project);
  };
  const loadServers = (projectScope: RemoteMcpSettingsScope) =>
    request(async (client) =>
      projectScope.kind === "global"
        ? client.mcpServers()
        : ((await client.projectSettings(projectScope.projectId)).mcpServers ?? []),
    );
  const operate = (operation: RemoteMcpSettingsOperation) =>
    request((client) => client.operateMcpServer(operation));

  // Fetch status separately so an OAuth failure cannot hide the settings list.
  const hasGlobalOauth = !!(
    state &&
    "lists" in state &&
    state.lists.global.some((server) => server.transport.type !== "stdio")
  );
  const hasProjectOauth = !!(
    state &&
    "lists" in state &&
    state.lists.workspace?.some((server) => server.transport.type !== "stdio")
  );
  useEffect(() => {
    const controller = new AbortController();
    const read = (scope: RemoteMcpSettingsScope) => {
      void withClient(connectionKey, (client) =>
        client.operateMcpServer({ kind: "oauth-status", scope }),
      )
        .then((reply) => {
          if (
            reply.kind !== "oauth-status" ||
            controller.signal.aborted ||
            generation !== currentRemoteServerGeneration(connectionKey)
          )
            return;
          setAuthenticated((current) => ({
            ...current,
            [oauthScopeKey(scope)]: reply.authenticatedServerIds,
          }));
        })
        .catch(() => undefined);
    };
    if (hasGlobalOauth) read({ kind: "global" });
    if (hasProjectOauth && workspaceId) read({ kind: "project", projectId: workspaceId });
    return () => controller.abort();
  }, [connectionKey, generation, hasGlobalOauth, hasProjectOauth, withClient, workspaceId]);

  const reloadOauth = async (scope: RemoteMcpSettingsScope) => {
    const reply = await operate({ kind: "oauth-status", scope });
    if (reply.kind === "oauth-status") {
      setAuthenticated((current) => ({
        ...current,
        [oauthScopeKey(scope)]: reply.authenticatedServerIds,
      }));
    }
  };

  const authenticate = async (projectId: string | undefined, server: McpServer) => {
    if (oauthBusy || pendingSignIn) return false;
    setOauthBusy(true);
    try {
      const target = resolveScope(projectId);
      const reply = await operate({ kind: "oauth-begin", scope: target, serverId: server.id });
      if (reply.kind !== "oauth-begin") return false;
      const { result } = reply;
      if (result.status === "error") throw new Error(result.message);
      if (result.status === "authorized") {
        await reloadOauth(target);
        return true;
      }
      const url = URL.parse(result.authorizationUrl);
      const localHttp =
        url?.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (!url || (url.protocol !== "https:" && !localHttp) || url.username || url.password) {
        throw new Error(t`Could not sign in to ${server.name}.`);
      }
      setPendingSignIn({
        scope: target,
        server,
        flowId: result.flowId,
        authorizationUrl: url.href,
      });
      return false;
    } catch (error) {
      toast.danger(friendlyError(error));
      return false;
    } finally {
      setOauthBusy(false);
    }
  };

  const signOut = async (projectId: string | undefined, server: McpServer) => {
    if (oauthBusy || pendingSignIn) return;
    setOauthBusy(true);
    try {
      const target = resolveScope(projectId);
      await operate({ kind: "oauth-clear", scope: target, serverId: server.id });
      await reloadOauth(target);
    } catch (error) {
      toast.danger(friendlyError(error));
    } finally {
      setOauthBusy(false);
    }
  };
  const command = (intent: RemoteMcpSettingsCommand) => {
    const signal = lifetime.current?.signal;
    const next = mutations.current.then(async () => {
      if (!signal) throw new Error(t`Connection failed.`);
      const global = await request((client) => client.commandMcpServers(intent), signal);
      // Do not report a confirmed write as failed just because its follow-up read failed.
      try {
        const rows = workspaceId
          ? await loadServers({ kind: "project", projectId: workspaceId })
          : undefined;
        if (!signal.aborted) setState({ lists: { global, ...(rows ? { workspace: rows } : {}) } });
      } catch (error) {
        if (!signal.aborted) setState({ error: friendlyError(error) });
      }
    });
    mutations.current = next.catch(() => undefined);
    return next;
  };

  if (!state)
    return (
      <p className="text-sm text-muted" role="status">
        <Trans>Loading…</Trans>
      </p>
    );
  if ("error" in state) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
        <Button size="sm" variant="tertiary" onPress={onRetry}>
          <Trans>Retry</Trans>
        </Button>
      </div>
    );
  }

  const targets = projects.map((project) => {
    const projectScope = scopeOnHost(connectionKey, project);
    return {
      id: project.id,
      name: project.name,
      location: project.location,
      ...(project.icon ? { icon: project.icon } : {}),
      servers: project.id === workspace?.id ? (state.lists.workspace ?? []) : [],
      loadServers: () => loadServers(projectScope),
    };
  });
  const activeProject = targets.find((project) => project.id === workspace?.id);

  return (
    <>
      {pendingSignIn ? (
        <RemoteMcpOauthDialog
          name={pendingSignIn.server.name}
          authorizationUrl={pendingSignIn.authorizationUrl}
          onComplete={async (callbackUrl) => {
            const { scope, flowId, server } = pendingSignIn;
            const reply = await operate({
              kind: "oauth-complete",
              scope,
              flowId,
              serverId: server.id,
              callbackUrl,
            });
            if (reply.kind !== "oauth-complete")
              throw new Error(t`Could not sign in to ${server.name}.`);
            if (reply.result.status === "error") throw new Error(reply.result.message);
            await reloadOauth(scope);
          }}
          onClose={() => setPendingSignIn(undefined)}
        />
      ) : null}
      <McpServersManager
        defaultScope={activeProject ? "workspace" : "user"}
        sources={{
          user: {
            servers: state.lists.global,
            loadServers: () => loadServers({ kind: "global" }),
          },
          ...(activeProject
            ? {
                workspace: {
                  ...activeProject,
                  projectId: activeProject.id,
                  projectLocation: activeProject.location,
                  projectName: activeProject.name,
                  ...(activeProject.icon ? { projectIcon: activeProject.icon } : {}),
                },
              }
            : {}),
        }}
        importProjects={targets}
        remoteActions={{
          oauth: {
            authenticated: (projectId, serverId) =>
              authenticated[oauthScopeKey(resolveScope(projectId))]?.includes(serverId) ?? false,
            busy: () => oauthBusy || pendingSignIn !== undefined,
            authenticate,
            signOut,
          },
          upsert: async (projectId, server) =>
            command({ kind: "upsert", scope: resolveScope(projectId), server }),
          remove: async (projectId, serverId) =>
            command({ kind: "remove", scope: resolveScope(projectId), serverId }),
          move: async (from, to, serverId) =>
            command({
              kind: "move",
              source: resolveScope(from),
              destination: resolveScope(to),
              serverId,
            }),
          probe: async (projectId, serverId) => {
            const projectScope = resolveScope(projectId);
            const reply = await request((client) =>
              client.operateMcpServer({ kind: "probe", scope: projectScope, serverId }),
            );
            if (reply.kind !== "probe") throw new Error("MCP probe response mismatch.");
            return reply.result;
          },
        }}
      />
    </>
  );
}
