import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import {
  parseRelayVisitorPath,
  relayHostFrameSchema,
  relayPublicUrl,
  safeJsonParse,
  type RelayServerFrame,
} from "@/shared/remote/relayProtocol";

/**
 * Self-hostable relay. A Lightcode server dials `/host` and registers a server
 * id; devices reach it at `/s/<serverId>/…`. The relay forwards visitor HTTP +
 * WebSocket traffic to the registered host over a single framed control socket
 * (relayProtocol.ts). It is a dumb pipe: all auth stays end-to-end between the
 * device and the Lightcode server, and the relay only binds a serverId to the
 * secret of its first live registrant to prevent hijacking.
 *
 * The account-scoped "cloud subscription" layer (mapping users → server ids,
 * billing, hosting) sits ON TOP of this and is out of repo scope.
 */
export interface RelayServerOptions {
  readonly host?: string;
  readonly port?: number;
  /** Public base URL advertised to hosts (so they can print a pairing link). */
  readonly publicBaseUrl?: string;
  /** Per-request proxy timeout. */
  readonly requestTimeoutMs?: number;
  readonly maxBodyBytes?: number;
}

export interface RelayServerInfo {
  readonly url: string;
  readonly port: number;
}

interface RegisteredHost {
  readonly secret: string;
  readonly control: WebSocket;
}

interface PendingRequest {
  resolve(result: { status: number; headers: Record<string, string>; body: Buffer }): void;
  reject(error: Error): void;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;

export class RelayServer {
  private readonly server: Server;
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly hosts = new Map<string, RegisteredHost>();
  /** requestId → pending HTTP response. */
  private readonly pending = new Map<string, PendingRequest>();
  /** channelId → visitor WebSocket. */
  private readonly visitors = new Map<string, WebSocket>();
  private info: RelayServerInfo | null = null;

  constructor(private readonly options: RelayServerOptions = {}) {
    this.server = createServer((req, res) => void this.handleHttp(req, res));
    this.server.on("upgrade", (req, socket, head) => this.handleUpgrade(req, socket, head));
  }

  async start(): Promise<RelayServerInfo> {
    if (this.info) return this.info;
    const host = this.options.host ?? "0.0.0.0";
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.options.port ?? 0, host);
    });
    const address = this.server.address() as AddressInfo;
    const base =
      this.options.publicBaseUrl?.replace(/\/+$/, "") ?? `http://127.0.0.1:${address.port}`;
    this.info = { url: base, port: address.port };
    return this.info;
  }

  dispose(): void {
    for (const visitor of this.visitors.values()) visitor.terminate();
    this.visitors.clear();
    for (const host of this.hosts.values()) host.control.close();
    this.hosts.clear();
    for (const pending of this.pending.values()) pending.reject(new Error("Relay shutting down."));
    this.pending.clear();
    this.wss.close();
    this.server.close();
    this.info = null;
  }

  /** Visitor-facing base URL for a server id (what a device points its client at). */
  publicUrlFor(serverId: string): string {
    const base = this.options.publicBaseUrl ?? this.info?.url ?? "http://127.0.0.1";
    return relayPublicUrl(base, serverId);
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    const route = parseRelayVisitorPath(url.pathname);
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const host = this.hosts.get(route.serverId);
    if (!host) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("server offline");
      return;
    }
    let body: Buffer;
    try {
      body = await this.readBody(req);
    } catch {
      res.writeHead(413, { "content-type": "text/plain" });
      res.end("request too large");
      return;
    }
    const id = randomUUID();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers[key] = value;
      else if (Array.isArray(value)) headers[key] = value.join(", ");
    }
    const path = `${route.path}${url.search}`;
    try {
      const result = await new Promise<{
        status: number;
        headers: Record<string, string>;
        body: Buffer;
      }>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.pending.delete(id)) reject(new Error("Relay request timed out."));
        }, this.options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
        this.pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject,
        });
        this.sendToHost(host, {
          t: "req",
          id,
          method: req.method ?? "GET",
          path,
          headers,
          ...(body.length > 0 ? { body: body.toString("base64") } : {}),
        });
      });
      // Strip hop-by-hop headers the relay shouldn't echo verbatim.
      const { "content-length": _cl, "transfer-encoding": _te, ...rest } = result.headers;
      res.writeHead(result.status, rest);
      res.end(result.body);
    } catch (error) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : "relay error");
    }
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (url.pathname === "/host") {
      this.wss.handleUpgrade(req, socket, head, (ws) => this.handleHostControl(ws));
      return;
    }
    const route = parseRelayVisitorPath(url.pathname);
    if (route && this.hosts.has(route.serverId)) {
      const host = this.hosts.get(route.serverId)!;
      this.wss.handleUpgrade(req, socket, head, (ws) =>
        this.handleVisitorWs(ws, host, `${route.path}${url.search}`),
      );
      return;
    }
    socket.destroy();
  }

  private handleHostControl(control: WebSocket): void {
    let serverId: string | null = null;
    control.on("message", (data) => {
      const parsed = relayHostFrameSchema.safeParse(safeJsonParse(String(data)));
      if (!parsed.success) return;
      const frame = parsed.data;
      if (frame.t === "register") {
        const existing = this.hosts.get(frame.serverId);
        if (existing && existing.control !== control && existing.secret !== frame.secret) {
          control.close(1008, "serverId already registered");
          return;
        }
        // Replace any prior live registration for this id (reconnect).
        if (existing && existing.control !== control) existing.control.close();
        serverId = frame.serverId;
        this.hosts.set(frame.serverId, { secret: frame.secret, control });
        this.sendFrame(control, {
          t: "registered",
          serverId: frame.serverId,
          publicUrl: this.publicUrlFor(frame.serverId),
        });
        return;
      }
      if (frame.t === "res") {
        const pending = this.pending.get(frame.id);
        if (pending && this.pending.delete(frame.id)) {
          pending.resolve({
            status: frame.status,
            headers: frame.headers,
            body: Buffer.from(frame.body, "base64"),
          });
        }
        return;
      }
      if (frame.t === "req-error") {
        const pending = this.pending.get(frame.id);
        if (pending && this.pending.delete(frame.id)) pending.reject(new Error(frame.message));
        return;
      }
      if (frame.t === "ws-data") {
        const visitor = this.visitors.get(frame.id);
        if (visitor && visitor.readyState === visitor.OPEN) visitor.send(frame.data);
        return;
      }
      if (frame.t === "ws-close") {
        const visitor = this.visitors.get(frame.id);
        if (visitor && this.visitors.delete(frame.id)) visitor.close();
        return;
      }
    });
    control.on("close", () => {
      if (serverId && this.hosts.get(serverId)?.control === control) {
        this.hosts.delete(serverId);
      }
    });
  }

  private handleVisitorWs(visitor: WebSocket, host: RegisteredHost, path: string): void {
    const id = randomUUID();
    this.visitors.set(id, visitor);
    this.sendToHost(host, { t: "ws-open", id, path });
    visitor.on("message", (data) =>
      this.sendToHost(host, { t: "ws-data", id, data: String(data) }),
    );
    visitor.on("close", () => {
      if (this.visitors.delete(id)) this.sendToHost(host, { t: "ws-close", id });
    });
    visitor.on("error", () => {
      if (this.visitors.delete(id)) {
        this.sendToHost(host, { t: "ws-close", id });
        visitor.terminate();
      }
    });
  }

  private sendToHost(host: RegisteredHost, frame: RelayServerFrame): void {
    this.sendFrame(host.control, frame);
  }

  private sendFrame(control: WebSocket, frame: RelayServerFrame): void {
    if (control.readyState === control.OPEN) control.send(JSON.stringify(frame));
  }

  private async readBody(req: IncomingMessage): Promise<Buffer> {
    const max = this.options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > max) throw new Error("body too large");
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }
}
