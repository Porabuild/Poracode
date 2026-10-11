import {
  CHROME_BRIDGE_HEX_256,
  CHROME_SIDEBAR_PROTOCOL_VERSION,
  chromeBridgeClientProofMessage,
  chromeBridgeServerProofMessage,
  chromeSidebarBootstrapRequestSchema,
  type ChromeSidebarHelloAck,
  isChromeExtensionOrigin,
  resolveChromeSidebarExtensionIds,
} from "@/shared/chromeSidebarProtocol";
import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import { joinRuntimeShutdown } from "@/shared/joinRuntimeShutdown";
import {
  removeChromeBridgeEntry,
  writeChromeBridgeEntry,
  writePrivateFile,
} from "./chromeNativeHost";
import { ExternalChromeConnection } from "./ExternalChromeConnection";

/**
 * Localhost WebSocket endpoint the companion Chrome extension connects back to.
 *
 * Unlike the MCP ingress (a random port handed to agents via env), this server
 * is discovered *out of band* by the extension, so it prefers a stable port and
 * writes `{ port, token }` to a private (0600) pairing file. The socket is
 * bound to 127.0.0.1, but loopback is shared by every local process and OS
 * user and a WebSocket `Origin` header is client-asserted, so the origin is
 * never proof of identity:
 *
 * - A connection is *authenticated* only by the per-launch token: either a
 *   hello `clientProof` (an HMAC of a fresh nonce and this listener's port,
 *   see `chromeSidebarProtocol.ts`) or the manual/debug `?token=` query. The
 *   installed extension obtains the token from the per-user native messaging
 *   host (see `chromeNativeHost.ts`), which Chrome only launches for pinned
 *   extension IDs, and never sends it.
 * - Chat credentials are issued only to an authenticated connection from a
 *   pinned extension origin that negotiated the sidebar protocol.
 * - Pinned extension origins without a token (older extensions, or a browser
 *   without the native host) keep the CDP relay only, and can never displace
 *   an authenticated connection.
 * - Every accepted hello is answered with a `helloAck` reporting the sidebar
 *   protocol and authentication the connection got. A proven hello gets a
 *   `serverProof` back, so the extension can tell this bridge from an
 *   impostor on another scanned port before it trusts the connection.
 *
 * A single connection is held at a time — the most recent extension wins and
 * any previous connection is dropped.
 */

const PORT_RANGES = [
  { start: 47820, count: 13 },
  { start: 32120, count: 13 },
] as const;

/** Mints per connection while one is in flight; beyond this a request is refused at once. */
const MAX_QUEUED_BOOTSTRAPS = 4;
/** Mints per bridge per minute, across connections. */
const MAX_BOOTSTRAPS_PER_MINUTE = 12;

export interface ChromeBridgeInfo {
  port: number;
  token: string;
}

export interface ChromeBridgeOptions {
  /** File to write `{ port, token }` to for extension pairing. */
  pairingFilePath: string;
  /** Override discovery ports for isolated integration fixtures. */
  ports?: readonly number[];
  /** A single-use local chat credential, issued only for an authenticated pinned extension. */
  getChatBootstrap?: () => Promise<ManagedLoopbackBootstrap | null>;
  /** Trusted extension IDs; defaults to the pinned IDs plus the development override. */
  extensionIds?: readonly string[];
  /** Private native-host directory to publish `{ port, token }` into for the extension. */
  nativeHostDir?: string;
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
  private connectionAuthenticated = false;
  private readonly extensionIds: readonly string[];
  private readonly recentMints: number[] = [];
  private nativeEntryPath: string | undefined;
  private info: ChromeBridgeInfo | null = null;
  private readonly changeListeners = new Set<() => void>();
  private starting: Promise<ChromeBridgeInfo> | undefined;
  private closing: Promise<void> | undefined;
  private stopping = false;

  constructor(private readonly options: ChromeBridgeOptions) {
    this.extensionIds = options.extensionIds ?? resolveChromeSidebarExtensionIds(process.env);
    this.server.on("upgrade", (request, socket, head) => {
      if (this.stopping) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (client) =>
        this.handleConnection(client, request.headers.origin, this.tokenMatches(request.url)),
      );
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
        this.publishNativeEntry(this.info);
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
    this.connectionAuthenticated = false;
    if (this.nativeEntryPath) removeChromeBridgeEntry(this.nativeEntryPath, this.token);
    this.nativeEntryPath = undefined;
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
    // Zero-config auto-connect: pinned extension origins may open the CDP relay
    // (web pages always carry an http(s) Origin; the consent for control is
    // Chrome's own "started debugging this browser" banner). Chat credentials
    // additionally require the token, checked after the hello frame.
    if (
      !this.stopping &&
      (this.tokenMatches(url) || isChromeExtensionOrigin(origin, this.extensionIds))
    ) {
      cb(true);
    } else {
      cb(false, 401);
    }
  }

  private tokenMatches(url: string | undefined): boolean {
    if (!url) return false;
    try {
      return this.secretMatches(new URL(url, "ws://127.0.0.1").searchParams.get("token"));
    } catch {
      return false;
    }
  }

  private secretMatches(candidate: unknown): boolean {
    if (typeof candidate !== "string" || candidate.length === 0) return false;
    const expected = Buffer.from(this.token, "utf8");
    const actual = Buffer.from(candidate, "utf8");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private listenerPort(): number | null {
    const address = this.server.address();
    return address && typeof address !== "string" ? address.port : null;
  }

  private mac(message: string): Buffer {
    return createHmac("sha256", Buffer.from(this.token, "utf8")).update(message, "utf8").digest();
  }

  /** Whether `clientProof` MACs `nonce` for the port this bridge actually listens on. */
  private clientProofMatches(port: number | null, nonce: unknown, proof: unknown): boolean {
    if (
      port === null ||
      typeof nonce !== "string" ||
      typeof proof !== "string" ||
      !CHROME_BRIDGE_HEX_256.test(nonce) ||
      !CHROME_BRIDGE_HEX_256.test(proof)
    )
      return false;
    return timingSafeEqual(
      Buffer.from(proof, "hex"),
      this.mac(chromeBridgeClientProofMessage(port, nonce)),
    );
  }

  private handleConnection(
    socket: WebSocket,
    origin: string | undefined,
    urlAuthenticated: boolean,
  ): void {
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
      let sidebarVersion: unknown;
      let nonce: unknown;
      let clientProof: unknown;
      try {
        const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed.type === "hello" && typeof parsed.extensionVersion === "string") {
          hello = { extensionVersion: parsed.extensionVersion };
          sidebarVersion = parsed.sidebarBootstrapVersion;
          nonce = parsed.nonce;
          clientProof = parsed.clientProof;
        }
      } catch {}
      const port = this.listenerPort();
      const proven = this.clientProofMatches(port, nonce, clientProof);
      const authenticated = urlAuthenticated || proven;
      // An unauthenticated origin can be asserted by any local process, so it
      // may only take over from another unauthenticated relay.
      if (!authenticated && this.connection && this.connectionAuthenticated) {
        socket.close(1008, "An authenticated extension is connected.");
        return;
      }
      const sidebarNegotiated =
        sidebarVersion === CHROME_SIDEBAR_PROTOCOL_VERSION &&
        isChromeExtensionOrigin(origin, this.extensionIds) &&
        this.options.getChatBootstrap !== undefined;
      // Replace any previous connection (latest extension wins). Install the
      // new connection first so disposing the old one cannot emit a transient
      // disconnect.
      const previous = this.connection;
      const conn: ExternalChromeConnection = new ExternalChromeConnection(
        socket,
        hello,
        () => {
          if (this.connection === conn) {
            this.connection = null;
            this.connectionAuthenticated = false;
            this.notifyChange();
          }
        },
        sidebarNegotiated
          ? {
              onUnhandledMessage: this.sidebarResponder(
                socket,
                authenticated,
                () => this.connection === conn,
              ),
            }
          : {},
      );
      this.connection = conn;
      this.connectionAuthenticated = authenticated;
      // Lets the extension tell an app that predates its sidebar protocol
      // (no ack) from one whose native host is not reachable yet.
      const ack: ChromeSidebarHelloAck = {
        type: "helloAck",
        sidebarBootstrapVersion: sidebarNegotiated ? CHROME_SIDEBAR_PROTOCOL_VERSION : null,
        authenticated,
      };
      // Proof answers proof only: never a MAC oracle for an unproven nonce.
      if (proven && port !== null && typeof nonce === "string") {
        ack.serverProof = this.mac(chromeBridgeServerProofMessage(port, nonce, ack)).toString(
          "hex",
        );
      }
      socket.send(JSON.stringify(ack));
      previous?.dispose();
      this.notifyChange();
    };
    socket.on("message", onFirst);
  }

  /**
   * Answers `sidebarBootstrap` requests one at a time. Concurrent requests
   * queue rather than share a credential (each pairing URL is single-use);
   * an unauthenticated connection, or a request past the queue or the
   * per-minute cap, gets an immediate `null`, never silence.
   */
  private sidebarResponder(
    socket: WebSocket,
    authenticated: boolean,
    isCurrent: () => boolean,
  ): (message: Record<string, unknown>) => void {
    const queue: string[] = [];
    let draining = false;
    const reply = (requestId: string, bootstrap: ManagedLoopbackBootstrap | null): void => {
      if (socket.readyState !== socket.OPEN) return;
      socket.send(
        JSON.stringify({
          type: "sidebarBootstrapResult",
          version: CHROME_SIDEBAR_PROTOCOL_VERSION,
          requestId,
          bootstrap,
        }),
      );
    };
    const drain = async (): Promise<void> => {
      draining = true;
      while (queue.length > 0) {
        const requestId = queue.shift()!;
        const bootstrap =
          !this.stopping && isCurrent() && this.takeMintSlot()
            ? await this.options.getChatBootstrap!().catch(() => null)
            : null;
        // A replaced or closing connection gets nothing; its socket is closing.
        if (this.stopping || !isCurrent()) {
          queue.length = 0;
          break;
        }
        reply(requestId, bootstrap);
      }
      draining = false;
    };
    return (message) => {
      const request = chromeSidebarBootstrapRequestSchema.safeParse(message);
      if (!request.success || this.stopping || !isCurrent()) return;
      if (!authenticated || queue.length >= MAX_QUEUED_BOOTSTRAPS) {
        reply(request.data.requestId, null);
        return;
      }
      queue.push(request.data.requestId);
      if (!draining) void drain();
    };
  }

  private takeMintSlot(): boolean {
    const now = Date.now();
    while (this.recentMints.length > 0 && now - this.recentMints[0]! >= 60_000) {
      this.recentMints.shift();
    }
    if (this.recentMints.length >= MAX_BOOTSTRAPS_PER_MINUTE) return false;
    this.recentMints.push(now);
    return true;
  }

  private publishNativeEntry(info: ChromeBridgeInfo): void {
    if (!this.options.nativeHostDir) return;
    try {
      this.nativeEntryPath = writeChromeBridgeEntry(
        this.options.nativeHostDir,
        this.options.pairingFilePath,
        info,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poracode] failed to publish Chrome bridge for the native host:", err);
    }
  }

  private writePairingFile(info: ChromeBridgeInfo): void {
    try {
      writePrivateFile(
        this.options.pairingFilePath,
        `${JSON.stringify({ port: info.port, token: info.token }, null, 2)}\n`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[poracode] failed to write Chrome bridge pairing file:", err);
    }
  }
}
