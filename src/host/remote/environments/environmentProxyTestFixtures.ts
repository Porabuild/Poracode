import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { vi } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import { PrincipalAdmissionController } from "../server/principalAdmission";
import { RemoteAccessServer, type RemoteAccessServerOptions } from "../RemoteAccessServer";
import { RemoteAuthStore, type AuthenticatedRemoteSession } from "../auth";
import { EnvironmentProxyGateway, type EnvironmentProxyGatewayOptions } from "./environmentProxy";
import type { EnvironmentProxyTarget, EnvironmentProxyTargetRegistry } from "./types";
import type { CleanupRegistry } from "../portForward/testFixtures";

/**
 * Test-only fixtures for the C1 parent proxy suite. Everything here builds a
 * REAL parent `RemoteAccessServer` plus real loopback upstream/child servers:
 * the proxy is exercised through its actual HTTP/WS ingress, never by calling
 * internals.
 */

export function baseOptions(
  overrides: Partial<RemoteAccessServerOptions> = {},
): RemoteAccessServerOptions {
  return {
    appVersion: "test",
    identity: { desktopId: "parent-host", label: "Parent host" },
    host: "127.0.0.1",
    port: 0,
    webSocketHeartbeatIntervalMs: 0,
    callSupervisor: vi.fn<RemoteAccessServerOptions["callSupervisor"]>(async () => "" as never),
    truncateThreadRuntime: () => {},
    ...overrides,
  };
}

export async function exchangeToken(
  server: RemoteAccessServer,
  scopes?: readonly string[],
): Promise<string> {
  const info = server.getInfo();
  if (!info) throw new Error("server not started");
  const credential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get("token");
  const response = await fetch(new URL("/oauth/token", info.httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      ...(scopes ? { scopes } : {}),
    }),
  });
  if (response.status !== 200) {
    throw new Error(`token exchange failed: ${response.status} ${await response.text()}`);
  }
  const result = (await response.json()) as { accessToken: string };
  return result.accessToken;
}

export function sessionIdOf(authStore: RemoteAuthStore, accessToken: string): string {
  return authStore.authenticateBearerToken(accessToken, []).sessionId;
}

export interface TestTargetState {
  readonly environmentId: string;
  generation: number;
  endpoint: string;
  remotePort: number;
  childDesktopId: string;
  current: boolean;
  controller: AbortController;
}

export interface TestTargetRegistry {
  readonly registry: EnvironmentProxyTargetRegistry;
  connect(
    environmentId: string,
    remotePort: number,
    options?: { readonly childDesktopId?: string; readonly endpoint?: string },
  ): TestTargetState;
  /** Aborts the current generation without removing the environment. */
  invalidate(environmentId: string): void;
  /** Marks the current generation stale (`assertCurrent` throws). */
  stale(environmentId: string): void;
  disconnect(environmentId: string): void;
  stateOf(environmentId: string): TestTargetState;
}

export function createTargetRegistry(): TestTargetRegistry {
  const states = new Map<string, TestTargetState>();
  const registry: EnvironmentProxyTargetRegistry = {
    getVerifiedTarget(environmentId: string): EnvironmentProxyTarget {
      const state = states.get(environmentId);
      if (!state) throw new Error("environment/not-connected");
      return {
        environmentId,
        generation: state.generation,
        endpoint: state.endpoint,
        remotePort: state.remotePort,
        childDesktopId: state.childDesktopId,
        invalidation: state.controller.signal,
        assertCurrent: () => {
          if (!state.current) throw new Error("environment/not-connected");
        },
      };
    },
  };
  const connect: TestTargetRegistry["connect"] = (environmentId, remotePort, options = {}) => {
    const previous = states.get(environmentId);
    previous?.controller.abort();
    const state: TestTargetState = {
      environmentId,
      generation: (previous?.generation ?? 0) + 1,
      endpoint: options.endpoint ?? `http://127.0.0.1:${remotePort}`,
      remotePort,
      childDesktopId: options.childDesktopId ?? "child-desktop",
      current: true,
      controller: new AbortController(),
    };
    states.set(environmentId, state);
    return state;
  };
  return {
    registry,
    connect,
    invalidate(environmentId) {
      states.get(environmentId)?.controller.abort();
    },
    stale(environmentId) {
      const state = states.get(environmentId);
      if (state) state.current = false;
    },
    disconnect(environmentId) {
      states.get(environmentId)?.controller.abort();
      states.delete(environmentId);
    },
    stateOf(environmentId) {
      const state = states.get(environmentId);
      if (!state) throw new Error("no target state");
      return state;
    },
  };
}

export interface UpstreamHandle {
  readonly port: number;
  readonly requestCount: () => number;
  readonly lastRequest: () => IncomingMessage | undefined;
  readonly lastHeaders: () => IncomingMessage["headers"];
  readonly lastResponse: () => ServerResponse | undefined;
}

/** A loopback upstream that records every request (headers included) and
 * answers a JSON echo by default. A `handler` overrides the whole response. */
export async function startUpstream(
  cleanup: CleanupRegistry,
  handler?: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<UpstreamHandle> {
  const requests: IncomingMessage[] = [];
  let lastResponse: ServerResponse | undefined;
  const server = createServer((req, res) => {
    requests.push(req);
    lastResponse = res;
    if (handler) {
      handler(req, res);
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          url: req.url,
          host: req.headers.host,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    port: (server.address() as AddressInfo).port,
    requestCount: () => requests.length,
    lastRequest: () => requests.at(-1),
    lastHeaders: () => requests.at(-1)?.headers ?? {},
    lastResponse: () => lastResponse,
  };
}

export interface WsUpstreamHandle {
  readonly port: number;
  readonly upgradePaths: () => readonly string[];
  readonly upgradeHeaders: () => readonly IncomingMessage["headers"][];
  readonly clientCount: () => number;
}

/** A loopback WS echo upstream that records the exact upgrade path and
 * headers the proxy dialed. */
export async function startWsUpstream(cleanup: CleanupRegistry): Promise<WsUpstreamHandle> {
  const paths: string[] = [];
  const headers: IncomingMessage["headers"][] = [];
  const server = createServer();
  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (socket: WebSocket) => {
    socket.on("message", (data) => socket.send(data.toString()));
  });
  wss.on("headers", (responseHeaders) => {
    responseHeaders.push("Set-Cookie: child_ws=1; Path=/");
  });
  server.on("upgrade", (req, socket, head) => {
    paths.push(req.url ?? "");
    headers.push(req.headers);
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(async () => {
    for (const client of wss.clients) client.terminate();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    port: (server.address() as AddressInfo).port,
    upgradePaths: () => paths,
    upgradeHeaders: () => headers,
    clientCount: () => wss.clients.size,
  };
}

export interface ChildHostHandle {
  readonly server: RemoteAccessServer;
  readonly info: NonNullable<ReturnType<RemoteAccessServer["getInfo"]>>;
  readonly accessToken: string;
  readonly desktopId: string;
  readonly port: number;
  readonly authStore: RemoteAuthStore;
}

export async function startChildHost(
  cleanup: CleanupRegistry,
  identity: { desktopId: string; label: string } = { desktopId: "child-desktop", label: "Child" },
): Promise<ChildHostHandle> {
  const authStore = new RemoteAuthStore();
  const server = new RemoteAccessServer(baseOptions({ identity, authStore }));
  cleanup.push(async () => {
    await server.dispose();
  });
  const info = await server.start();
  const accessToken = await exchangeToken(server);
  return {
    server,
    info,
    accessToken,
    desktopId: identity.desktopId,
    port: Number(new URL(info.httpBaseUrl).port),
    authStore,
  };
}

export interface ParentHostHandle {
  readonly server: RemoteAccessServer;
  readonly info: NonNullable<ReturnType<RemoteAccessServer["getInfo"]>>;
  readonly gateway: EnvironmentProxyGateway;
  readonly admission: PrincipalAdmissionController;
  readonly targets: TestTargetRegistry;
  readonly authStore: RemoteAuthStore;
  readonly port: number;
  readonly parentAccessToken: string;
  proxyFetch(
    environmentId: string,
    childPath: string,
    init?: RequestInit & { readonly parentToken?: string; readonly query?: string },
  ): Promise<Response>;
  authenticateParent(accessToken: string): AuthenticatedRemoteSession;
}

export async function startParentHost(
  cleanup: CleanupRegistry,
  overrides: Partial<
    Pick<
      EnvironmentProxyGatewayOptions,
      "webSocketTicketTtlMs" | "descriptorMaxBytes" | "descriptorTimeoutMs"
    >
  > & {
    /** Extra server options (principal budgets etc.) for one test host. */
    readonly serverOptions?: Partial<RemoteAccessServerOptions>;
  } = {},
): Promise<ParentHostHandle> {
  const { serverOptions, ...gatewayOverrides } = overrides;
  const authStore = new RemoteAuthStore();
  const targets = createTargetRegistry();
  let server: RemoteAccessServer;
  let admission!: PrincipalAdmissionController;
  let gateway!: EnvironmentProxyGateway;
  server = new RemoteAccessServer(
    baseOptions({
      authStore,
      ...serverOptions,
      // The production seam: the gateway shares the server's OWN principal
      // admission controller, so proxy legs consume the same per-principal
      // work/socket budgets as event sockets.
      environmentProxy: (deps) => {
        admission = deps.principalAdmission;
        gateway = new EnvironmentProxyGateway({
          targets: targets.registry,
          authority: authStore,
          principalAdmission: deps.principalAdmission,
          baseUrls: () => {
            const info = server.getInfo();
            if (!info) throw new Error("parent not started");
            return { httpBaseUrl: info.httpBaseUrl, wsBaseUrl: info.wsBaseUrl };
          },
          ...gatewayOverrides,
        });
        return gateway;
      },
    }),
  );
  cleanup.push(async () => {
    gateway.dispose();
    await server.dispose();
  });
  const info = await server.start();
  const parentAccessToken = await exchangeToken(server);
  const port = Number(new URL(info.httpBaseUrl).port);
  const httpBase = info.httpBaseUrl.replace(/\/$/, "");
  return {
    server,
    info,
    gateway,
    admission,
    targets,
    authStore,
    port,
    parentAccessToken,
    authenticateParent: (accessToken) => authStore.authenticateBearerToken(accessToken, []),
    proxyFetch: (environmentId, childPath, init = {}) => {
      const { parentToken = parentAccessToken, query, ...rest } = init;
      const suffix = query === undefined ? "" : `?${query}`;
      return fetch(`${httpBase}/api/environments/${environmentId}/proxy${childPath}${suffix}`, {
        ...rest,
        headers: {
          "x-poracode-environment-authorization": `Bearer ${parentToken}`,
          ...(rest.headers as Record<string, string> | undefined),
        },
      });
    },
  };
}
