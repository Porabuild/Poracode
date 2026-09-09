import { createConnection, createServer, type Server, type Socket } from "node:net";
import { LOOPBACK_HOST } from "../harness/constants.ts";
import { assertLoopbackHost } from "../harness/loopback.ts";
import type { RealHostHandle } from "../harness/realHost.ts";
import {
  DirectionAccounting,
  SHAPER_BUFFER_DEFAULTS,
  ShapedDirection,
  defaultSliceBytes,
  type DirectionStats,
} from "./constrainedShaper.ts";

/**
 * Loopback-only TCP byte shaper proxy for the constrained-network experiment:
 * a transparent userspace proxy in front of the real headless host. The
 * transport approximation (one-way delay + per-byte serialization per slice,
 * bounded backpressure, loopback-only, no OS network changes) is documented on
 * `constrainedShaper.ts` — it models bandwidth and latency only, not loss,
 * congestion windows, reordering, or TCP connect latency.
 *
 * Half-close semantics: both sockets use `allowHalfOpen: true`, so a client
 * that ends its request side (FIN) does not auto-close its response side. FIN
 * is propagated by `ShapedDirection` only after its shaped queue drains, so a
 * delayed upstream response body still reaches a half-closed client in full.
 * An abrupt drop still halts both directions immediately (halt + destroy).
 *
 * Pacing scope limitation: the rate applies PER CONNECTION. Aggregate physical
 * bandwidth across several concurrent HTTP/WS connections is not modeled —
 * each connection receives the full configured rate, so a device holding N
 * concurrent connections sees N× the single-link rate in aggregate. Do not
 * read these profiles as a shared-medium bottleneck.
 *
 * Byte accounting is cumulative per direction: bytes actually written onto the
 * receiving socket — HTTP headers, WS upgrade handshakes, and WS framing
 * included, TCP/IP header overhead excluded. These wire figures pair with
 * ProfileClient's decoded-payload metrics (HTTP response bodies, WS app
 * frames) so compression on the constrained link can be quantified without
 * touching production code.
 */

export interface ShaperProfile {
  readonly name: string;
  /** Full round-trip time the profile represents; half is applied per direction. */
  readonly rttMs: number;
  /** Per-connection link rate in bits per second. */
  readonly bitsPerSecond: number;
}

export interface ShaperConfig {
  readonly label: string;
  readonly upstreamHost: string;
  readonly upstreamPort: number;
  readonly oneWayDelayMs: number;
  readonly bytesPerSecond: number;
  readonly softBufferBytes?: number;
  readonly hardBufferBytes?: number;
  readonly sliceBytes?: number;
}

export interface ProxyStats {
  readonly clientToServer: DirectionStats;
  readonly serverToClient: DirectionStats;
  readonly connectionsOpened: number;
  readonly connectionsRetired: number;
  readonly liveConnections: number;
  readonly teardownReasons: Readonly<Record<string, number>>;
  readonly accounting: string;
}

const STATS_ACCOUNTING =
  "Bidirectional actual socket bytes forwarded by the constrained proxy: HTTP " +
  "request/response headers, WS upgrade handshakes, and WS framing included; TCP/IP " +
  "header overhead excluded. Decoded-payload-only figures live in the ProfileClient " +
  "metrics (httpResponseBodyBytes, appBytesReceived); the test takes cumulative-stats " +
  "deltas around isolated operations to attribute wire bytes to them.";

interface RelayConnection {
  readonly clientToServer: ShapedDirection;
  readonly serverToClient: ShapedDirection;
  closedAtMs: number | null;
}

export class ConstrainedTcpProxy {
  private readonly relays: RelayConnection[] = [];
  private readonly teardownReasons = new Map<string, number>();
  private readonly clientToServer = new DirectionAccounting();
  private readonly serverToClient = new DirectionAccounting();
  private nextConnectionId = 1;
  private closed = false;
  private closeSettled: Promise<void> | undefined;

  private constructor(
    private readonly config: {
      readonly label: string;
      readonly oneWayDelayMs: number;
      readonly bytesPerSecond: number;
      readonly softBufferBytes: number;
      readonly hardBufferBytes: number;
      readonly sliceBytes: number;
    },
    private readonly server: Server,
    private readonly portValue: number,
  ) {}

  static async start(config: ShaperConfig): Promise<ConstrainedTcpProxy> {
    const upstreamHost = assertLoopbackHost(config.upstreamHost, "constrained proxy upstream");
    if (!Number.isInteger(config.upstreamPort) || config.upstreamPort <= 0) {
      throw new Error(`${config.label}: upstream port must be a positive integer.`);
    }
    if (config.oneWayDelayMs < 0 || config.bytesPerSecond <= 0) {
      throw new Error(`${config.label}: shaper delay/rate must be non-negative/positive.`);
    }
    const softBufferBytes = config.softBufferBytes ?? SHAPER_BUFFER_DEFAULTS.softBytes;
    const hardBufferBytes = config.hardBufferBytes ?? SHAPER_BUFFER_DEFAULTS.hardBytes;
    if (softBufferBytes >= hardBufferBytes) {
      throw new Error(`${config.label}: soft buffer cap must stay below the hard cap.`);
    }
    const shaped = {
      label: config.label,
      oneWayDelayMs: config.oneWayDelayMs,
      bytesPerSecond: config.bytesPerSecond,
      softBufferBytes,
      hardBufferBytes,
      sliceBytes: config.sliceBytes ?? defaultSliceBytes(config.bytesPerSecond),
    };

    let proxy: ConstrainedTcpProxy | undefined;
    const server = createServer({ allowHalfOpen: true }, (clientSocket) => {
      proxy?.accept(clientSocket, upstreamHost, config.upstreamPort);
    });
    const portValue = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, LOOPBACK_HOST, () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error(`${config.label}: failed to allocate loopback proxy port.`));
          return;
        }
        resolve(address.port);
      });
    });
    proxy = new ConstrainedTcpProxy(shaped, server, portValue);
    return proxy;
  }

  private accept(clientSocket: Socket, upstreamHost: string, upstreamPort: number): void {
    if (this.closed) {
      clientSocket.destroy();
      return;
    }
    this.nextConnectionId += 1;
    // allowHalfOpen on both ends: a client that FINs its request side keeps
    // receiving the (still paced) response until the shaped queue drains and
    // the FIN is forwarded — no premature response-side close, no EPIPE.
    const upstream = createConnection({
      host: upstreamHost,
      port: upstreamPort,
      allowHalfOpen: true,
    });
    // The directions only need the relay from their callbacks onward, and
    // nothing is attached until the relay exists — late binding is safe.
    const relayRef: { value: RelayConnection | null } = { value: null };
    const onFatal = (reason: string) => {
      if (relayRef.value) this.teardownRelay(relayRef.value, reason);
    };
    const onProgress = () => {
      if (relayRef.value) this.retireIfDone(relayRef.value);
    };
    const relay: RelayConnection = {
      closedAtMs: null,
      clientToServer: new ShapedDirection(
        this.config,
        this.clientToServer,
        clientSocket,
        upstream,
        onFatal,
        onProgress,
      ),
      serverToClient: new ShapedDirection(
        this.config,
        this.serverToClient,
        upstream,
        clientSocket,
        onFatal,
        onProgress,
      ),
    };
    relayRef.value = relay;
    this.relays.push(relay);
    relay.clientToServer.attach("clientToServer");
    relay.serverToClient.attach("serverToClient");
    for (const [socket, side] of [
      [clientSocket, "client"] as const,
      [upstream, "server"] as const,
    ]) {
      socket.on("error", (error: NodeJS.ErrnoException) => {
        onFatal(`error-${side}:${error.code ?? "unknown"}`);
      });
      socket.on("close", () => {
        const direction = side === "client" ? relay.clientToServer : relay.serverToClient;
        direction.sourceClosed = true;
        if (direction.sourceEndedGracefully) {
          onProgress();
        } else {
          onFatal(`reset-by-${side}`);
        }
      });
    }
  }

  /** A side ended or closed: once both sockets are done, retire the relay. */
  private retireIfDone(relay: RelayConnection): void {
    if (relay.closedAtMs !== null) return;
    if (!relay.clientToServer.sourceClosed || !relay.serverToClient.sourceClosed) return;
    relay.closedAtMs = Date.now();
    this.countTeardown("socket-close");
  }

  private teardownRelay(relay: RelayConnection, reason: string): void {
    if (relay.closedAtMs !== null) return;
    relay.closedAtMs = Date.now();
    relay.clientToServer.halt();
    relay.serverToClient.halt();
    relay.clientToServer.destroySockets();
    relay.serverToClient.destroySockets();
    this.countTeardown(reason);
  }

  private countTeardown(reason: string): void {
    this.teardownReasons.set(reason, (this.teardownReasons.get(reason) ?? 0) + 1);
  }

  get port(): number {
    return this.portValue;
  }

  get httpBaseUrl(): string {
    return `http://${LOOPBACK_HOST}:${String(this.portValue)}/`;
  }

  get wsBaseUrl(): string {
    return `ws://${LOOPBACK_HOST}:${String(this.portValue)}/`;
  }

  get label(): string {
    return this.config.label;
  }

  get liveConnectionCount(): number {
    return this.relays.filter((relay) => relay.closedAtMs === null).length;
  }

  /** Same handle shape as the real host, with the data plane pointed at this
   * proxy. Pairing/restart/stop still delegate to the real handle (device
   * provisioning is not part of the impaired data plane). */
  wrapHandle(handle: RealHostHandle): RealHostHandle {
    return {
      mode: handle.mode,
      get pid() {
        return handle.pid;
      },
      get baseDir() {
        return handle.baseDir;
      },
      httpBaseUrl: this.httpBaseUrl,
      wsBaseUrl: this.wsBaseUrl,
      hostPort: this.portValue,
      get entrypoint() {
        return handle.entrypoint;
      },
      get blockers() {
        return handle.blockers;
      },
      pair: () => handle.pair(),
      restart: () => handle.restart(),
      stop: () => handle.stop(),
    };
  }

  /** Cumulative per-direction stats; the test snapshots `stats()` before/after
   * an isolated operation to attribute wire bytes to it. */
  stats(): ProxyStats {
    return {
      clientToServer: this.clientToServer.stats(),
      serverToClient: this.serverToClient.stats(),
      connectionsOpened: this.nextConnectionId - 1,
      connectionsRetired: this.relays.filter((relay) => relay.closedAtMs !== null).length,
      liveConnections: this.liveConnectionCount,
      teardownReasons: Object.fromEntries(this.teardownReasons),
      accounting: STATS_ACCOUNTING,
    };
  }

  /** Destroys every live relayed connection immediately (bounded teardown);
   * the listener keeps accepting new connections. Returns the relay count. */
  teardownRelays(reason: string): number {
    const live = this.relays.filter((relay) => relay.closedAtMs === null);
    for (const relay of live) this.teardownRelay(relay, reason);
    return live.length;
  }

  /** Stops listening, destroys all live relays, clears pending schedules. */
  close(): Promise<void> {
    if (this.closeSettled) return this.closeSettled;
    this.closed = true;
    this.teardownRelays("proxy-close");
    this.closeSettled = new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
    return this.closeSettled;
  }
}
