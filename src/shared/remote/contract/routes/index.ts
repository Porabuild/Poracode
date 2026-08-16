import type { RemoteHttpRouteContract } from "../types";
import { sessionRoutes } from "./session";
import { threadRoutes } from "./threads";
import { workspaceRoutes } from "./workspace";

/** Manifest `httpRoutes` order is the stable inventory order. */
const MANIFEST_ROUTE_IDS = [
  "environment",
  "environment-legacy",
  "forward-enter",
  "token-exchange",
  "websocket-ticket",
  "shell-snapshot",
  "agent-statuses",
  "host-update",
  "host-update-check",
  "host-update-install",
  "provider-usage",
  "project-notes-read",
  "project-notes-write",
  "local-image",
  "runtime-image",
  "attachment-upload",
  "profile-devices",
  "profile-core-stats",
  "profile-token-stats",
  "profile-identity",
  "settings-read",
  "settings-write",
  "schedules-read",
  "schedules-command",
  "pr-watch-read",
  "pr-watch-check",
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
  "thread-history-items",
  "thread-history",
  "thread-start-existing",
  "terminal-start",
  "thread-runtime-truncate",
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
] as const;

const unorderedRoutes = [...sessionRoutes, ...workspaceRoutes, ...threadRoutes];

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
