import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";
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
}

export class ChromeBridgeServer {
  private readonly token = randomBytes(24).toString("hex");
  private wss: WebSocketServer | null = null;
  private connection: ExternalChromeConnection | null = null;
  private info: ChromeBridgeInfo | null = null;
  private readonly changeListeners = new Set<() => void>();

  constructor(private readonly options: ChromeBridgeOptions) {}

  async start(): Promise<ChromeBridgeInfo> {
    if (this.info) return this.info;
    const port = await this.listenOnAvailablePort();
    this.info = { port, token: this.token };
    this.writePairingFile(this.info);
    // eslint-disable-next-line no-console
    console.log(
      `[poracode] Chrome bridge listening on ws://127.0.0.1:${port} — pairing file: ${this.options.pairingFilePath}`,
    );
    return this.info;
  }

  getInfo(): ChromeBridgeInfo | null {
    return this.info;
  }

  getConnection(): ExternalChromeConnection | null {
    return this.connection;
  }

  /** Subscribe to connect/disconnect transitions. Returns an unsubscribe. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  dispose(): void {
    this.connection?.dispose();
    this.connection = null;
    try {
      this.wss?.close();
    } catch {}
    this.wss = null;
    this.info = null;
    this.changeListeners.clear();
  }

  private notifyChange(): void {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch {}
    }
  }

  private listenOnAvailablePort(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const ports = PORT_RANGES.flatMap(({ start, count }) =>
        Array.from({ length: count }, (_, index) => start + index),
      );
      let portIndex = 0;
      const tryPort = (port: number): void => {
        const wss = new WebSocketServer({
          host: "127.0.0.1",
          port,
          maxPayload: 8 * 1024 * 1024,
          verifyClient: (info, cb) => this.verifyClient(info.origin, info.req.url, cb),
        });
        wss.once("error", (err: NodeJS.ErrnoException) => {
          wss.close();
          if (err.code === "EADDRINUSE" && portIndex < ports.length - 1) {
            portIndex += 1;
            tryPort(ports[portIndex]!);
            return;
          }
          reject(err);
        });
        wss.once("listening", () => {
          this.wss = wss;
          wss.on("connection", (socket) => this.handleConnection(socket));
          resolve(port);
        });
      };
      tryPort(ports[portIndex]!);
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
    if (this.tokenMatches(url) || isExtensionOrigin(origin)) {
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
    // The `hello` frame carries the extension version; wait for it before
    // publishing the connection so consumers see a populated status.
    const onFirst = (data: unknown): void => {
      socket.off("message", onFirst);
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
