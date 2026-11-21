import { OPENCODE_PROVIDER_KIND } from "@/shared/agents/opencode";
import type {
  ProjectLocation,
  ResolvedMcpServer,
  ThreadAttention,
  ThreadConfig,
  ThreadStatus,
} from "@/shared/contracts";
import { createKnownSessionRef, type AgentArgvSpec } from "../base";
import { buildOpenCodeArgs } from "./argv";
import { cachedOpenCodeBinary } from "./binary";
import {
  acquireOpenCodeServer,
  retireOpenCodeTerminalServer,
  type AcquiredOpenCodeServer,
} from "./client";
import type { V2Event } from "./clientTypes";
import { openCodeSessionDatabaseEnv } from "./database";
import { subscribeOpenCodeServerEvents } from "./eventHub";
import { buildOpenCodeSessionPermissions } from "./permissions";

export type OpenCodeTerminalStatusListener = (change: {
  status: ThreadStatus;
  attention: ThreadAttention;
}) => void;

function subscribeTerminalSessionStatus(
  acquired: AcquiredOpenCodeServer,
  sessionId: string,
  onStatusUpdate: OpenCodeTerminalStatusListener,
): () => void {
  const pendingPermissions = new Set<string>();
  const pendingForms = new Set<string>();
  const pendingRequestStatus = ():
    | { status: ThreadStatus; attention: ThreadAttention }
    | undefined => {
    if (pendingPermissions.size > 0) {
      return { status: "needs_approval", attention: "needs_approval" };
    }
    if (pendingForms.size > 0) {
      return { status: "needs_reply", attention: "needs_reply" };
    }
    return undefined;
  };

  return subscribeOpenCodeServerEvents({
    client: acquired.client,
    subscription: {
      sessionId: () => sessionId,
      onEvent: (event: V2Event) => {
        switch (event.type) {
          case "permission.asked":
            pendingPermissions.add(event.data.id);
            onStatusUpdate({ status: "needs_approval", attention: "needs_approval" });
            return;
          case "permission.replied":
            if (pendingPermissions.delete(event.data.requestID)) {
              onStatusUpdate(pendingRequestStatus() ?? { status: "working", attention: "working" });
            }
            return;
          case "form.created":
            pendingForms.add(event.data.form.id);
            onStatusUpdate(
              pendingRequestStatus() ?? { status: "needs_reply", attention: "needs_reply" },
            );
            return;
          case "form.replied":
          case "form.cancelled":
            if (pendingForms.delete(event.data.id)) {
              onStatusUpdate(pendingRequestStatus() ?? { status: "working", attention: "working" });
            }
            return;
          case "session.execution.started":
            onStatusUpdate({ status: "working", attention: "working" });
            return;
          case "session.execution.succeeded":
          case "session.execution.failed":
          case "session.execution.interrupted":
          case "session.idle":
            if (
              event.type === "session.execution.interrupted" ||
              event.type === "session.execution.failed"
            ) {
              pendingPermissions.clear();
              pendingForms.clear();
            }
            onStatusUpdate(pendingRequestStatus() ?? { status: "idle", attention: "none" });
            return;
          case "session.status":
            onStatusUpdate(
              pendingRequestStatus() ??
                (event.data.status.type === "idle"
                  ? { status: "idle", attention: "none" }
                  : { status: "working", attention: "working" }),
            );
            return;
          default:
            return;
        }
      },
    },
  });
}

/** Keep the TUI on the supervisor's configured server, rather than the native service. */
export async function buildOpenCodeTerminalLaunch(
  location: ProjectLocation,
  config: ThreadConfig,
  prompt: string,
  sessionId: string | undefined,
  mcpServers: readonly ResolvedMcpServer[] = [],
  onStatusUpdate?: OpenCodeTerminalStatusListener,
): Promise<AgentArgvSpec> {
  const databaseEnv = openCodeSessionDatabaseEnv(location, sessionId);
  const acquired = await acquireOpenCodeServer({
    projectLocation: location,
    mcpServers,
    ...(sessionId ? { resumeSessionId: sessionId } : {}),
  });
  let unsubscribeDirectoryMcp: (() => void) | undefined;
  let unsubscribeEvents: (() => void) | undefined;
  let cleanedUp = false;
  try {
    const password = await acquired.handle.password;
    let appliedPermissionsKey: string | undefined;
    const syncTerminalPermissions = async () => {
      if (cleanedUp || !sessionId || typeof acquired.client?.session?.update !== "function") {
        return;
      }
      const enabledNames = new Set(mcpServers.map((server) => server.name));
      const deniedMcpServers = (acquired.getDirectoryMcpNames?.() ?? []).filter(
        (name) => !enabledNames.has(name),
      );
      const disabledMcpTools = mcpServers.flatMap((server) =>
        (server.disabledTools ?? []).map((tool) => ({ server: server.name, tool })),
      );
      const permissions = buildOpenCodeSessionPermissions(config.approvalPolicy, {
        deniedMcpServers,
        disabledMcpTools,
      });
      const key = JSON.stringify(permissions);
      if (key === appliedPermissionsKey) return;
      await acquired.client.session.update({ sessionID: sessionId, permissions });
      appliedPermissionsKey = key;
    };
    if (sessionId && typeof acquired.onDirectoryMcpChanged === "function") {
      unsubscribeDirectoryMcp = acquired.onDirectoryMcpChanged(() => {
        if (cleanedUp) return;
        void syncTerminalPermissions().catch((error) => {
          if (!cleanedUp) {
            console.warn(
              "[opencode] failed to refresh terminal MCP permissions after sibling change:",
              error,
            );
          }
        });
      });
    }
    if (sessionId && onStatusUpdate) {
      unsubscribeEvents = subscribeTerminalSessionStatus(acquired, sessionId, onStatusUpdate);
    }

    let retirement: Promise<void> | undefined;
    return {
      binary: cachedOpenCodeBinary(location) ?? OPENCODE_PROVIDER_KIND,
      args: ["--server", acquired.baseUrl, ...buildOpenCodeArgs(config, prompt, sessionId)],
      // The V2 TUI reads OPENCODE_PASSWORD for an explicit --server. Keep it
      // out of argv and release the lease only when the PTY's cleanup runs.
      env: { ...databaseEnv, OPENCODE_PASSWORD: password },
      preferShell: true,
      cleanup: () => {
        cleanedUp = true;
        unsubscribeDirectoryMcp?.();
        unsubscribeDirectoryMcp = undefined;
        unsubscribeEvents?.();
        unsubscribeEvents = undefined;
        return (retirement ??= retireOpenCodeTerminalServer(location, sessionId, acquired));
      },
      ...(sessionId ? { sessionRef: createKnownSessionRef(sessionId) } : {}),
    };
  } catch (error) {
    cleanedUp = true;
    unsubscribeDirectoryMcp?.();
    unsubscribeEvents?.();
    await retireOpenCodeTerminalServer(location, sessionId, acquired);
    throw error;
  }
}
