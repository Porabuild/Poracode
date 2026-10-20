import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { McpServer, ProjectLocation } from "@/shared/contracts";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { isLocalhostOrigin, writeJsonResponse } from "@/shared/http";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import type { WslHostAccessResolver } from "../wsl/hostAccess";
import type { McpOAuthService } from "./McpOAuthService";
import { RelaySseEndpoint, relayRequestHeaders, relayResponseHeaders } from "./oauthRelayTransport";

interface Route {
  id: string;
  token: string;
  version: number;
  server: McpServer & {
    transport: { type: "http" | "sse"; url: string; headers: Record<string, string> };
  };
  targets: Map<string, string>;
}

/**
 * Keep shared OAuth off the process-launch path. Providers receive a stable,
 * resource-scoped local bearer; the supervisor refreshes upstream credentials
 * when MCP connects. HTTP/SSE and their protocol negotiation pass through.
 * Refreshing a token preserves pool identity; changing accounts revokes it.
 * Nothing new is persisted or deployed: the existing MCP descriptor is used.
 */
export class McpOAuthRelay {
  private readonly routes = new Map<string, Route>();
  private readonly routeKeys = new Map<string, string>();
  private readonly requests = new Set<AbortController>();
  private readonly work = new AsyncWorkTracker();
  private readonly server = createServer((req, res) => {
    if (this.stopping) {
      res.writeHead(503).end();
      return;
    }
    void this.work
      .run(() => this.handle(req, res))
      .catch(() => {
        if (res.destroyed || res.writableEnded) return;
        if (res.headersSent) res.destroy();
        else writeJsonResponse(res, 502, { error: "MCP connection failed." });
      });
  });
  private readonly connections = new HttpServerConnections(this.server);
  private starting: Promise<number> | undefined;
  private closing: Promise<void> | undefined;
  private stopping = false;

  constructor(
    private readonly oauth: Pick<
      McpOAuthService,
      | "hasAuthorization"
      | "authorizationVersion"
      | "applyAuthorization"
      | "applyAuthorizationToServer"
    >,
    private readonly hostAccess?: WslHostAccessResolver,
  ) {}

  async prepare(servers: McpServer[], location: ProjectLocation): Promise<McpServer[]> {
    if (this.stopping) throw new Error("MCP OAuth relay is shutting down.");
    for (const [key, id] of this.routeKeys) {
      const route = this.routes.get(id);
      if (route && this.current(route)) continue;
      this.routes.delete(id);
      this.routeKeys.delete(key);
    }
    const managed = servers.filter((server) => this.oauth.hasAuthorization(server));
    if (managed.length === 0) return servers;
    // Match the other supervisor ingresses: NAT uses the Windows gateway;
    // mirrored WSL uses loopback. If unavailable, preserve the direct path.
    const access =
      location.kind === "wsl"
        ? await this.hostAccess?.resolveHostAccess(location.distro)
        : { kind: "loopback" as const };
    if (!access) return this.oauth.applyAuthorization(servers);
    const port = await this.start();
    if (this.stopping) throw new Error("MCP OAuth relay is shutting down.");
    const host = access.kind === "gateway" ? access.ip : "127.0.0.1";
    return servers.map((server) => {
      if (server.transport.type === "stdio" || !this.oauth.hasAuthorization(server)) return server;
      const version = this.oauth.authorizationVersion(server.transport.url);
      const key = createHash("sha256")
        .update(JSON.stringify([server.transport, server.timeoutMs, version]))
        .digest("hex");
      let route = this.routes.get(this.routeKeys.get(key) ?? "");
      if (!route) {
        route = {
          id: randomUUID(),
          token: randomBytes(32).toString("hex"),
          version,
          server: {
            ...server,
            transport: { ...server.transport, headers: { ...server.transport.headers } },
          },
          targets: new Map([["mcp", server.transport.url]]),
        };
        this.routes.set(route.id, route);
        this.routeKeys.set(key, route.id);
      }
      return {
        ...server,
        transport: {
          type: server.transport.type,
          url: `http://${host.includes(":") ? `[${host}]` : host}:${port}/${route.id}/mcp`,
          headers: { Authorization: `Bearer ${route.token}` },
        },
      };
    });
  }

  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    for (const controller of this.requests) controller.abort();
    this.closing = (async () => {
      await this.starting?.catch(() => undefined);
      await this.connections.close(0);
      await this.work.drain();
      this.routes.clear();
      this.routeKeys.clear();
    })();
    return this.closing;
  }

  private start(): Promise<number> {
    this.starting ??= new Promise<number>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, process.platform === "win32" ? "0.0.0.0" : "127.0.0.1", () => {
        this.server.off("error", reject);
        const address = this.server.address();
        if (!address || typeof address === "string") {
          reject(new Error("MCP relay failed to listen."));
          return;
        }
        resolve(address.port);
      });
    });
    return this.starting;
  }

  private current(route: Route): boolean {
    return (
      !this.stopping &&
      route.version === this.oauth.authorizationVersion(route.server.transport.url)
    );
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let host: URL;
    try {
      host = new URL(`http://${req.headers.host ?? "invalid"}`);
    } catch {
      res.writeHead(403).end();
      return;
    }
    const address = this.server.address();
    if (
      (host.hostname !== "localhost" && !isIP(host.hostname.replace(/^\[|\]$/gu, ""))) ||
      !address ||
      typeof address === "string" ||
      Number(host.port) !== address.port ||
      (req.headers.origin && !isLocalhostOrigin(req.headers.origin))
    ) {
      res.writeHead(403).end();
      return;
    }
    const url = new URL(req.url ?? "/", host);
    const [, routeId, targetId] = url.pathname.split("/");
    const route = this.routes.get(routeId ?? "");
    const target = route?.targets.get(targetId ?? "");
    if (!route || !target || url.search || url.pathname !== `/${routeId}/${targetId}`) {
      res.writeHead(404).end();
      return;
    }
    const actual = Buffer.from(req.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${route.token}`);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected) ||
      !this.current(route)
    ) {
      res.writeHead(401).end();
      return;
    }
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
      res.writeHead(405, { Allow: "GET, POST, DELETE" }).end();
      return;
    }
    const controller = new AbortController();
    this.requests.add(controller);
    const abort = () => controller.abort();
    req.once("aborted", abort);
    res.once("close", abort);
    const transientTargets: string[] = [];
    try {
      const authorized = await this.oauth.applyAuthorizationToServer(route.server);
      if (
        !this.current(route) ||
        authorized.transport.type === "stdio" ||
        !authorized.transport.headers.Authorization
      ) {
        res.writeHead(401).end();
        return;
      }
      controller.signal.throwIfAborted();
      const headers = relayRequestHeaders(req.headers);
      for (const [name, value] of Object.entries(authorized.transport.headers))
        headers.set(name, value);
      const response = await fetch(target, {
        method: req.method,
        headers,
        signal: controller.signal,
        redirect: "manual",
        ...(req.method === "POST"
          ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: "half" }
          : {}),
      });
      const responseHeaders = relayResponseHeaders(response.headers);
      const rewrite = (endpoint: string, transient = false) => {
        const upstream = new URL(endpoint, target);
        if (
          upstream.origin !== new URL(route.server.transport.url).origin ||
          upstream.username ||
          upstream.password
        ) {
          throw new Error("MCP endpoint changed origin.");
        }
        const id = transient
          ? randomUUID()
          : createHash("sha256").update(upstream.href).digest("hex");
        route.targets.set(id, upstream.href);
        if (transient) transientTargets.push(id);
        return `/${route.id}/${id}`;
      };
      if (responseHeaders.location) responseHeaders.location = rewrite(responseHeaders.location);
      res.writeHead(response.status, { ...responseHeaders, "cache-control": "no-store" });
      res.flushHeaders();
      if (!response.body) {
        res.end();
        return;
      }
      const body = Readable.fromWeb(
        response.body as unknown as Parameters<typeof Readable.fromWeb>[0],
      );
      if (
        route.server.transport.type === "sse" &&
        req.method === "GET" &&
        response.ok &&
        response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        await pipeline(body, new RelaySseEndpoint((endpoint) => rewrite(endpoint, true)), res);
      } else {
        await pipeline(body, res);
      }
    } finally {
      for (const id of transientTargets) route.targets.delete(id);
      controller.abort();
      this.requests.delete(controller);
      req.off("aborted", abort);
      res.off("close", abort);
    }
  }
}
