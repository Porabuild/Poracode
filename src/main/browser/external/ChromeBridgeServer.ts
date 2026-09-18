import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";
import { ExternalChromeConnection } from "./ExternalChromeConnection";

/**
 * Localhost WebSocket endpoint the companion Chrome extension connects back to.
 *
 * Unlike the MCP ingress (a random port handed to agents via env), this server
 * is discovered *out of band* by the extension, so it prefers a stable port and
 * writes `{ port, token }` to a pairing file for manual pairing. Browser
 * extension origins may auto-connect; non-extension clients must supply the
 * per-launch bearer token in the `?token=` query. The socket is bound to
 * 127.0.0.1 so only local processes can reach it.
 *
 * A single connection is held at a time — the most recent extension wins and
 * any previous connection is dropped.
 */

const PORT_RANGES = [
  { start: 47820, count: 13 },
  { start: 32120, count: 13 },
] as const;

/** Browser extensions connect with a `chrome-extension://` / `moz-extension://`
 *  Origin. Web pages always send an http(s) Origin, which we reject. */
function isExtensionOrigin(origin: string | undefined): boolean {
  return (
    typeof origin === "string" &&
    (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://"))
  );
}

export interface ChromeBridgeInfo {
  port: number;
  token: string;
}

export interface ChromeBridgeOptions {
  /** File to write `{ port, token }` to for extension pairing. */
  pairingFilePath: string;
  /** Override discovery ports for isolated integration fixtures. */
  ports?: readonly number[];
}

export class ChromeBridgeServer {
  private readonly token = randomBytes(24).toString("hex");
  private readonly server = createServer((_, response) => {
    response.writeHead(404, { connection: "close" });
    response.end();
  });
  private readonly connections = new HttpServerConnections(this.server);
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024 * 1024,
    verifyClient: (info, cb) => this.verifyClient(info.origin, info.req.url, cb),
  });
  private connection: ExternalChromeConnection | null = null;
  private info: ChromeBridgeInfo | null = null;
  private readonly changeListeners = new Set<() => void>();
  private starting: Promise<ChromeBridgeInfo> | undefined;
  private closing: Promise<void> | undefined;
  private stopping = false;

  constructor(private readonly options: ChromeBridgeOptions) {
    this.server.on("upgrade", (request, socket, head) => {
      if (this.stopping) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (client) => this.handleConnection(client));
    });
  }

  start(): Promise<ChromeBridgeInfo> {
    if (this.stopping) return Promise.reject(new Error("Chrome bridge is stopping."));
    if (this.starting) return this.starting;
    const barrier = Promise.withResolvers<ChromeBridgeInfo>();
    this.starting = barrier.promise;
    void this.listenOnAvailablePort()
      .then((port) => {
        if (this.stopping) throw new Error("Chrome bridge is stopping.");
        this.info = { port, token: this.token };
        this.writePairingFile(this.info);
        // eslint-disable-next-line no-console
        console.log(
          `[poracode] Chrome bridge listening on ws://127.0.0.1:${port} — pairing file: ${this.options.pairingFilePath}`,
        );
        return this.info;
      })
      .then(barrier.resolve, (error: unknown) => {
        if (!this.stopping) this.starting = undefined;
        barrier.reject(error);
      });
    return barrier.promise;
  }

  getInfo(): ChromeBridgeInfo | null {
    return this.stopping ? null : this.info;
  }

  getConnection(): ExternalChromeConnection | null {
    return this.connection;
  }

  /** Subscribe to connect/disconnect transitions. Returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    const barrier = Promise.withResolvers<void>();
    this.closing = barrier.promise;
    this.connection?.dispose();
    this.connection = null;
    for (const client of this.wss.clients) client.close();
    void Promise.resolve(this.starting)
      .catch(() => undefined)
      .then(async () => {
        const websocketClose = new Promise<void>((resolve, reject) => {
          this.wss.close((error) => (error ? reject(error) : resolve()));
        });
        await joinRuntimeShutdown(
          [() => websocketClose, () => this.connections.close(250)],
          "Chrome bridge shutdown is unconfirmed.",
        );
        this.info = null;
        this.changeListeners.clear();
      })
      .then(barrier.resolve, barrier.reject);
    return barrier.promise;
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch {}
    }
  }

  private async listenOnAvailablePort(): Promise<number> {
    const ports =
      this.options.ports ??
      PORT_RANGES.flatMap(({ start, count }) =>
        Array.from({ length: count }, (_, index) => start + index),
      );
    for (const [index, port] of ports.entries()) {
      if (this.stopping) throw new Error("Chrome bridge is stopping.");
      try {
        return await this.listen(port);
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "EADDRINUSE" ||
          index === ports.length - 1
        )
          throw error;
      }
    }
    throw new Error("No Chrome bridge discovery ports are configured.");
  }

  private listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.server.off("error", failed);
        this.server.off("listening", listening);
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const listening = () => {
        cleanup();
        const address = this.server.address();
        if (!address || typeof address === "string")
          reject(new Error("Chrome bridge address is unavailable."));
        else resolve(address.port);
      };
      this.server.once("error", failed);
      this.server.once("listening", listening);
      try {
        this.server.listen(port, "127.0.0.1");
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  }

  private verifyClient(
    origin: string | undefined,
    url: string | undefined,
    cb: (ok: boolean, code?: number) => void,
  ): void {
    // Zero-config auto-connect: trust browser-extension origins on loopback. A
    // web page opening ws://127.0.0.1 always carries its http(s) Origin, so the
    // scheme check keeps malicious pages out; the actual consent for control is
    // Chrome's own "started debugging this browser" banner. The token path stays
    // available for hardened setups.
    if (!this.stopping && (this.tokenMatches(url) || isExtensionOrigin(origin))) {
      cb(true);
    } else {
      cb(false, 401);
    }
  }

  private tokenMatches(url: string | undefined): boolean {
    if (!url) return false;
    try {
      const token = new URL(url, "ws://127.0.0.1").searchParams.get("token");
      return token === this.token && token.length > 0;
    } catch {
      return false;
    }
  }

  private handleConnection(socket: WebSocket): void {
    if (this.stopping) {
      socket.terminate();
      return;
    }
    // The `hello` frame carries the extension version; wait for it before
    // publishing the connection so consumers see a populated status.
    const onFirst = (data: unknown): void => {
      socket.off("message", onFirst);
      if (this.stopping) {
        socket.terminate();
        return;
      }
      let hello: { extensionVersion?: string } = {};
      try {
        const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed.type === "hello" && typeof parsed.extensionVersion === "string") {
          hello = { extensionVersion: parsed.extensionVersion };
        }
      } catch {}
      // Replace any previous connection (latest extension wins). Install the
      // new connection first so disposing the old one cannot emit a transient
      // disconnect.
      const previous = this.connection;
      const conn = new ExternalChromeConnection(socket, hello, () => {
        if (this.connection === conn) {
          this.connection = null;
          this.notifyChange();
        }
      });
      this.connection = conn;
      previous?.dispose();
      this.notifyChange();
    };
    socket.on("message", onFirst);
  }

  private writePairingFile(info: ChromeBridgeInfo): void {
    try {
      writeFileSync(
        this.options.pairingFilePath,
        `${JSON.stringify({ port: info.port, token: info.token }, null, 2)}\n`,
        "utf8",
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poracode] failed to write Chrome bridge pairing file:", err);
    }
  }
}
