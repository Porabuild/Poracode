import { describe, expect, it } from "vitest";
import { REMOTE_HTTP_ROUTES } from "./routes";

/**
 * Host-only writer-generation admission declarations (protocol 13). This pin
 * is REGISTRY-CLASSIFICATION coverage, not a complete old-writer proof: it
 * shows exactly the direct host-mutating routes declare the flag, and every
 * non-GET route that does not declare it is on the documented exemption list
 * (auth-free pairing/handshake, ticket/read-class POSTs, and the generic
 * conditional `procedure-call` dispatch). The flag is the admission authority
 * a future dispatcher reads — host enforcement, all mutation entrypoints,
 * opaque proxy behavior, WS input gating, and previous-artifact retirement are
 * unshipped requirements pending host/client admission qualification and are
 * deliberately not claimed here.
 */
const DECLARED_WRITER_ROUTES = [
  "attachment-upload",
  "browser-command",
  "environment-adopt-legacy",
  "environment-connect",
  "environment-create",
  "environment-delete",
  "environment-disconnect",
  "environment-pairing",
  "environment-trust-accept",
  "environment-trust-probe",
  "environment-update",
  "environment-upgrade",
  "experiment-command",
  "host-update-check",
  "host-update-install",
  "mcp-settings-command",
  "mcp-settings-operation",
  "port-enter",
  "port-forward",
  "port-unforward",
  "pr-watch-agent-sync",
  "pr-watch-check",
  "pr-watch-delete",
  "pr-watch-upsert",
  "profile-identity",
  "project-command",
  "project-notes-write",
  "push-register",
  "push-unregister",
  "request-resolve",
  "schedules-command",
  "settings-write",
  "terminal-close",
  "terminal-resize",
  "terminal-start",
  "terminal-write",
  "thread-checkpoint-revert",
  "thread-close",
  "thread-command",
  "thread-goal",
  "thread-interrupt",
  "thread-runtime-gap-acknowledge",
  "thread-runtime-truncate",
  "thread-send",
  "thread-start-existing",
  "thread-steer-clear",
  "thread-steer-set",
] as const;

/** Bearer non-GET routes that must stay old-client-usable: read-class POSTs. */
const READ_CLASS_POST_ROUTES = [
  "catalog-membership",
  // Media POSTs only mint, renew or release bounded, volatile read grants.
  // They do not modify project files or start processes; environment grants
  // still require both parent environment authority and child file authority.
  "environment-media-release",
  "environment-media-renew",
  "environment-media-ticket",
  "environment-websocket-ticket",
  "file-media-release",
  "file-media-renew",
  "file-media-ticket",
  "local-image-ticket",
  "profile-core-stats",
  "profile-token-stats",
  "websocket-ticket",
] as const;

describe("route writer-generation admission declarations", () => {
  it("declares exactly the 47 direct writer routes", () => {
    const declared = REMOTE_HTTP_ROUTES.filter((route) => route.requiresCurrentProtocol);
    expect(declared).toHaveLength(47);
    expect(declared.map((route) => route.id).sort()).toEqual([...DECLARED_WRITER_ROUTES]);
  });

  it("declares the flag only on bearer non-GET routes", () => {
    for (const route of REMOTE_HTTP_ROUTES) {
      if (!route.requiresCurrentProtocol) continue;
      // The compared object carries the id so a failure names the route.
      expect({ id: route.id, method: route.method, auth: route.auth }).toEqual({
        id: route.id,
        method: route.method,
        auth: "bearer",
      });
      expect(route.method === "POST" || route.method === "DELETE").toBe(true);
    }
  });

  it("keeps the generic procedure-call route conditional, not route-declared", () => {
    const procedureCall = REMOTE_HTTP_ROUTES.find((route) => route.id === "procedure-call");
    expect(procedureCall?.scopeResolution).toBe("procedure-defined");
    expect(procedureCall?.requiresCurrentProtocol).toBeUndefined();
  });

  it("keeps exactly the 12 read-class POST exemptions bearer-authenticated", () => {
    expect(READ_CLASS_POST_ROUTES).toHaveLength(12);
    for (const id of READ_CLASS_POST_ROUTES) {
      const route = REMOTE_HTTP_ROUTES.find((candidate) => candidate.id === id);
      expect({ id, method: route?.method, auth: route?.auth }).toEqual({
        id,
        method: "POST",
        auth: "bearer",
      });
      expect(route?.requiresCurrentProtocol).toBeUndefined();
    }
  });

  it("sweeps every non-GET route into the declared or documented-exempt set", () => {
    const nonGet = REMOTE_HTTP_ROUTES.filter((route) => route.method !== "GET");
    const classified = [
      ...DECLARED_WRITER_ROUTES,
      ...READ_CLASS_POST_ROUTES,
      // Auth-free credential mint (pairing-token), admitted before any bearer
      // session exists.
      "token-exchange",
      // Generic dispatch hosting both reads and writes; admission resolves per
      // procedure scope inside the handler, not per route.
      "procedure-call",
    ];
    expect(nonGet).toHaveLength(classified.length);
    for (const route of nonGet) {
      expect(classified).toContain(route.id);
    }
  });
});
