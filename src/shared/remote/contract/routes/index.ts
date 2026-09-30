import type { RemoteHttpRouteContract } from "../types";
import { environmentManagementRoutes } from "./environments";
import { experimentsRoutes } from "./experiments";
import { opsRoutes } from "./ops";
import { sessionRoutes } from "./session";
import { threadRoutes } from "./threads";
import { workspaceRoutes } from "./workspace";

/** Manifest `httpRoutes` order is the stable inventory order. */
const MANIFEST_ROUTE_IDS = [
  "environment",
  "environment-legacy",
  "environment-list",
  "environment-create",
  "environment-get",
  "environment-update",
  "environment-delete",
  "environment-connect",
  "environment-disconnect",
  "environment-pairing",
  "environment-upgrade",
  "environment-websocket-ticket",
  "environment-trust-probe",
  "environment-trust-accept",
  "environment-adopt-legacy",
  "forward-enter",
  "token-exchange",
  "healthz",
  "metrics",
  "websocket-ticket",
  "shell-snapshot",
  "agent-statuses",
  "agent-slash-commands",
  "host-update",
  "host-update-check",
  "host-update-install",
  "host-describe",
  "provider-usage",
  "project-notes-read",
  "project-notes-write",
  "project-list",
  "catalog-membership",
  "local-image",
  "local-image-ticket",
  "runtime-image",
  "attachment-upload",
  "profile-devices",
  "profile-core-stats",
  "profile-token-stats",
  "profile-identity",
  "settings-read",
  "settings-write",
  "mcp-settings-read",
  "mcp-settings-command",
  "mcp-settings-operation",
  "schedules-read",
  "schedules-command",
  "schedule-runs-read",
  "pr-watch-read",
  "pr-watch-check",
  "pr-watch-agent-sync",
  "pr-watch-upsert",
  "pr-watch-delete",
  "browser-state",
  "browser-command",
  "ports-read",
  "port-forward",
  "port-enter",
  "port-unforward",
  "procedure-call",
  "project-command",
  "project-settings",
  "push-config",
  "push-register",
  "push-unregister",
  "thread-list",
  "thread-history-items",
  "thread-history",
  "thread-turns",
  "thread-start-existing",
  "terminal-start",
  "thread-runtime-truncate",
  "thread-checkpoint-revert",
  "thread-command",
  "thread-send",
  "thread-interrupt",
  "thread-goal",
  "thread-close",
  "thread-steer-set",
  "thread-steer-clear",
  "terminal-write",
  "terminal-resize",
  "terminal-close",
  "request-resolve",
  "thread-runtime-gap",
  "thread-runtime-gap-acknowledge",
  "experiment-state",
  "experiment-command",
] as const;

const unorderedRoutes = [
  ...sessionRoutes,
  ...environmentManagementRoutes,
  ...workspaceRoutes,
  ...threadRoutes,
  ...experimentsRoutes,
  ...opsRoutes,
];

/**
 * The closed set of HTTP route ids. The HTTP router's handler table is keyed by
 * this union, so a handler for a route that is not in the registry — or a
 * registry route without a handler — fails typecheck.
 */
export type RemoteHttpRouteId = (typeof MANIFEST_ROUTE_IDS)[number];

export const REMOTE_HTTP_ROUTES: readonly RemoteHttpRouteContract[] = MANIFEST_ROUTE_IDS.map(
  (id) => {
    const route = unorderedRoutes.find((candidate) => candidate.id === id);
    if (!route) {
      throw new Error(`Missing HTTP route contract for manifest id "${id}"`);
    }
    return route;
  },
);

if (unorderedRoutes.length !== MANIFEST_ROUTE_IDS.length) {
  const extra = unorderedRoutes
    .map((route) => route.id)
    .filter((id) => !(MANIFEST_ROUTE_IDS as readonly string[]).includes(id));
  throw new Error(`Extra HTTP route contracts: ${extra.join(", ")}`);
}
