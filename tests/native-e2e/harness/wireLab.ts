import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import {
  DEFAULT_SCOPES,
  LOOPBACK_HOST,
  MAX_JSON_BODY_BYTES,
  type RemoteScope,
} from "./constants.ts";
import { assertConfiguredProcedureSchemas, LabProcedureWorkspace } from "./contractFixtures.ts";
import {
  emitRequestForFixture,
  faultConfigForFixture,
  type CheckpointFixtureId,
  type FaultFixtureId,
  type FrameFixtureId,
} from "./controlFixtures.ts";
import { CoverageLedger } from "./coverageLedger.ts";
import { FaultEngine } from "./faultEngine.ts";
import { assertEventFixtures, validateReplayableEvent } from "./eventValidation.ts";
import { joinBasePath } from "./httpIo.ts";
import { LabAuthStore, LabHttpError, type AuthenticatedSession } from "./labAuth.ts";
import {
  buildReplayableEvent,
  buildRuntimeEvent,
  FIXTURE_TERMINAL_ID,
  FIXTURE_THREAD_ID,
} from "./labFixtures.ts";
import { bearerToken, handleLabHttp } from "./labHttpDispatch.ts";
import {
  broadcastRaw,
  broadcastServer,
  broadcastTerminalOutput,
  handleLabUpgrade,
} from "./labWsRouter.ts";
import { loadProtocolManifest, type ProtocolManifest } from "./manifest.ts";
import { appendScriptEntry, loadScriptJournal, type DurableScriptDraft } from "./durableScripts.ts";
import { assertGeneratedSchemaDefinitions } from "./generatedContract.ts";
import { LabLifecycleState } from "./lifecycleState.ts";
import { assertLoopbackHost } from "./loopback.ts";
import {
  consumePairingSecretIfPresent,
  pairingSecretExists,
  writePairingSecret,
} from "./pairingSecrets.ts";
import { ReplayRing } from "./replayRing.ts";
import { ObservationLedger } from "./observationLedger.ts";
import { LabRouteWorkspace } from "./routeFixtures.ts";
import type { LabConnection } from "./labRuntime.ts";
import type { EmitRequest, FaultConfig, PairingControlResponse, WireLabOptions } from "./types.ts";
import { assertWebSocketFixtures, parseServerMessage } from "./wsFixtures.ts";
import { createWireLabRuntime } from "./wireLabRuntime.ts";
import { publishWireEvent, type WirePublishOptions } from "./wireLabPublish.ts";

export class WireLab {
  readonly auth = new LabAuthStore();
  readonly faults = new FaultEngine();
  readonly ring: ReplayRing;
  readonly observationLedger = new ObservationLedger();
  readonly ledger: CoverageLedger;
  readonly manifest: ProtocolManifest;
  readonly workspace = new LabProcedureWorkspace();
  readonly lifecycle = new LabLifecycleState();
  readonly routes = new LabRouteWorkspace();
  readonly basePath: string;

  private readonly desktopId: string;
  private readonly hostId: "primary" | "collision-b";
  private readonly label: string;
  private readonly appVersion: string;
  private readonly secretsDir: string | undefined;
  private readonly journalPath: string | undefined;
  private lastBind: { host: string; port: number } | null = null;
  private replayingScripts = false;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private info: {
    httpBaseUrl: string;
    wsBaseUrl: string;
    host: string;
    port: number;
  } | null = null;
  private activePairing: string | null = null;
  private readonly connections = new Set<LabConnection>();
  private nextSocketOrdinal = 0;
  private nextSessionOrdinal = 0;
  private readonly sessionKeys = new Map<string, string>();

  constructor(
    private readonly options: WireLabOptions = {},
    ledger?: CoverageLedger,
  ) {
    this.manifest = loadProtocolManifest();
    this.ledger = ledger ?? new CoverageLedger(() => this.manifest);
    this.ring = new ReplayRing(options.replayLimit);
    this.basePath = normalizeLabBasePath(options.basePath);
    this.desktopId = options.desktopId ?? "native-e2e-lab";
    this.hostId = options.hostId ?? "primary";
    this.label = options.label ?? "Native E2E Wire Lab";
    this.appVersion = options.appVersion ?? "native-e2e";
    this.secretsDir = options.secretsDir;
    this.journalPath = options.journalPath;
    assertConfiguredProcedureSchemas();
    assertGeneratedSchemaDefinitions();
    assertWebSocketFixtures();
    assertEventFixtures();
  }

  get httpBaseUrl(): string {
    return this.requireInfo().httpBaseUrl;
  }

  get wsBaseUrl(): string {
    return this.requireInfo().wsBaseUrl;
  }

  get port(): number {
    return this.requireInfo().port;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  get connectionIds(): readonly string[] {
    return [...this.connections].map((connection) => connection.socketId);
  }

  get connectionIdentities(): readonly { readonly socketId: string; readonly sessionId: string }[] {
    return [...this.connections].map(({ socketId, sessionId }) => ({ socketId, sessionId }));
  }

  get wireHostId(): "primary" | "collision-b" {
    return this.hostId;
  }

  get wireDesktopId(): string {
    return this.desktopId;
  }

  get wireLabel(): string {
    return this.label;
  }

  get wireAppVersion(): string {
    return this.appVersion;
  }

  get connectionSet(): Set<LabConnection> {
    return this.connections;
  }

  allocateConnectionIdentity(authSessionId: string): {
    readonly socketId: string;
    readonly sessionId: string;
  } {
    let sessionId = this.sessionKeys.get(authSessionId);
    if (!sessionId) {
      sessionId = `session-${String(++this.nextSessionOrdinal)}`;
      this.sessionKeys.set(authSessionId, sessionId);
    }
    return { socketId: `socket-${String(++this.nextSocketOrdinal)}`, sessionId };
  }

  async start(): Promise<{ httpBaseUrl: string; wsBaseUrl: string; port: number }> {
    if (this.info) return this.info;
    const host = assertLoopbackHost(this.options.host ?? LOOPBACK_HOST, "wire lab");
    const port = this.lastBind?.port ?? this.options.port ?? 0;
    if (port === 0 && this.options.allowEphemeralPort !== true) {
      throw new Error(
        "Wire lab CLI bindings must set an explicit port; ephemeral ports are test-only",
      );
    }
    const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_JSON_BODY_BYTES });
    const server = createServer((req, res) => {
      void handleLabHttp(this.runtime(), req, res);
    });
    server.on("upgrade", (req, socket, head) => {
      void handleLabUpgrade(this.runtime(), wss, req, socket, head);
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(port, host, () => {
        server.off("error", onError);
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    const origin = `http://${host}:${address.port}`;
    const wsOrigin = `ws://${host}:${address.port}`;
    this.server = server;
    this.wss = wss;
    this.info = {
      host,
      port: address.port,
      httpBaseUrl: `${origin}${this.basePath || ""}/`.replace(/([^:]\/)\/+/g, "$1"),
      wsBaseUrl: `${wsOrigin}${this.basePath || ""}/`.replace(/([^:]\/)\/+/g, "$1"),
    };
    this.lastBind = { host, port: address.port };
    this.issuePairingCredential();
    return this.info;
  }

  async restart(): Promise<{ httpBaseUrl: string; wsBaseUrl: string; port: number }> {
    if (!this.lastBind && !this.info) {
      throw new Error("Wire lab cannot restart before the first listen.");
    }
    await this.stop();
    this.auth.reset();
    this.faults.reset();
    this.ring.reset();
    this.ledger.reset();
    this.workspace.reset();
    this.lifecycle.reset();
    this.routes.reset();
    this.observationLedger.reset();
    this.connections.clear();
    this.activePairing = null;
    const started = await this.start();
    this.replayDurableScripts();
    return started;
  }

  async stop(): Promise<void> {
    for (const connection of this.connections) {
      connection.ws.close(1001, "wire lab stopping");
    }
    this.connections.clear();
    await new Promise<void>((resolve) => {
      this.wss?.close(() => resolve());
      if (!this.wss) resolve();
    });
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = null;
    this.wss = null;
    this.info = null;
    this.observationLedger.dispose();
  }

  reset(): void {
    for (const connection of this.connections) {
      connection.ws.close(1001, "wire lab reset");
    }
    this.connections.clear();
    this.auth.reset();
    this.faults.reset();
    this.ring.reset();
    this.ledger.reset();
    this.workspace.reset();
    this.lifecycle.reset();
    this.routes.reset();
    this.observationLedger.reset();
    this.activePairing = null;
    if (this.info) this.issuePairingCredential();
  }

  issuePairingUrl(): PairingControlResponse {
    const issued = this.issuePairingCredential();
    const url = new URL("/", this.httpBaseUrl);
    url.hash = new URLSearchParams([["token", issued.credential]]).toString();
    return { pairingUrl: url.toString(), expiresAt: issued.expiresAt };
  }

  issuePairingCredential(scopes: readonly RemoteScope[] = DEFAULT_SCOPES) {
    if (this.activePairing) this.auth.revokePairingCredential(this.activePairing);
    const issued = this.auth.issuePairingCredential({ scopes: [...scopes] });
    this.activePairing = issued.credential;
    if (this.secretsDir) {
      writePairingSecret(this.secretsDir, {
        credential: issued.credential,
        expiresAt: issued.expiresAt,
      });
    }
    return issued;
  }

  pairingSecretOutstanding(): boolean {
    return this.secretsDir ? pairingSecretExists(this.secretsDir) : this.auth.pairingOutstanding;
  }

  consumePairingSecretFile(): void {
    this.activePairing = null;
    if (this.secretsDir) consumePairingSecretIfPresent(this.secretsDir);
  }

  setFault(config: FaultConfig): void {
    this.faults.set(config);
  }

  clearFault(kind?: FaultConfig["kind"]): void {
    this.faults.clear(kind);
  }

  activateFaultFixture(id: FaultFixtureId, options?: { readonly persist?: boolean }): void {
    const persist = options?.persist !== false;
    const config = faultConfigForFixture(id);
    if (config.kind === "clear") {
      this.faults.clear();
      if (persist) this.persistScript({ kind: "clear" });
      return;
    }
    this.faults.set(config);
    if (persist) this.persistScript({ kind: "fault", id });
  }

  emitFrameFixture(id: FrameFixtureId): void {
    if (id === "duplicate-event-thread-state") {
      this.faults.set({ kind: "duplicate-event-delivery" });
    }
    this.emit(emitRequestForFixture(id));
  }

  applyCheckpoint(id: CheckpointFixtureId, options?: { readonly persist?: boolean }): void {
    if (options?.persist !== false) this.persistScript({ kind: "checkpoint", id });
    if (id === "seed-replay-two-events") {
      this.publishEvent(buildReplayableEvent("thread-state"));
      this.publishEvent(buildReplayableEvent("thread-state"));
      return;
    }
    if (id === "seed-pairing") {
      this.issuePairingCredential();
      return;
    }
    if (id === "expire-pairing") {
      this.auth.expireAllPairing();
      this.activePairing = null;
      if (this.secretsDir) consumePairingSecretIfPresent(this.secretsDir);
      return;
    }
    this.auth.expireAllTickets();
  }

  emit(request: EmitRequest): void {
    switch (request.kind) {
      case "event": {
        const type = request.eventType ?? String(request.event?.type ?? "thread-state");
        const event = request.event ?? buildReplayableEvent(type, request.threadId);
        this.publishEvent(event);
        return;
      }
      case "runtime": {
        const threadId = request.threadId ?? FIXTURE_THREAD_ID;
        const runtime = request.runtimeEvent ?? buildRuntimeEvent("content.delta", threadId);
        this.publishEvent({
          type: "thread-runtime-event",
          threadId,
          event: runtime,
        });
        return;
      }
      case "terminal-output": {
        broadcastTerminalOutput(
          this.runtime(),
          request.terminalId ?? FIXTURE_TERMINAL_ID,
          request.data ?? "",
        );
        return;
      }
      case "resync-required": {
        broadcastServer(this.runtime(), {
          type: "resync-required",
          seq: this.ring.seq,
          reason: request.reason ?? "Injected resync.",
        });
        return;
      }
      case "malformed": {
        broadcastRaw(this.runtime(), "{not-json");
        this.ledger.observeWebSocketServer("malformed");
        return;
      }
      case "unknown": {
        broadcastRaw(this.runtime(), JSON.stringify({ type: "lab-unknown-envelope", payload: {} }));
        this.ledger.observeWebSocketServer("lab-unknown-envelope");
      }
    }
  }

  publishEvent(event: Record<string, unknown>, options?: WirePublishOptions): number {
    validateReplayableEvent(event);
    return publishWireEvent(this, event, options);
  }

  private persistScript(entry: DurableScriptDraft): void {
    if (this.replayingScripts || !this.journalPath) return;
    appendScriptEntry(this.journalPath, entry);
  }

  private replayDurableScripts(): void {
    if (!this.journalPath) return;
    this.replayingScripts = true;
    try {
      for (const entry of loadScriptJournal(this.journalPath).entries) {
        if (entry.kind === "clear") {
          this.faults.clear();
          continue;
        }
        if (entry.kind === "fault") {
          this.activateFaultFixture(entry.id, { persist: false });
          continue;
        }
        this.applyCheckpoint(entry.id, { persist: false });
      }
    } finally {
      this.replayingScripts = false;
    }
  }

  private requireInfo() {
    if (!this.info) throw new Error("Wire lab is not listening.");
    return this.info;
  }

  sendMessage(ws: WebSocket, message: Record<string, unknown>): void {
    this.send(ws, message);
  }

  private send(ws: WebSocket, message: Record<string, unknown>): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const validated = parseServerMessage(message);
    const type = String(validated.type ?? "");
    if (type) {
      this.ledger.observeWebSocketServer(type, { frameType: type, source: "mock" });
      this.observationLedger.recordOperation(`ws-server:${type}`);
    }
    ws.send(JSON.stringify(validated));
  }

  assertSocket(socketId: string, sessionId?: string): void {
    this.requireConnection(socketId, sessionId);
  }

  sendToSocket(socketId: string, message: Record<string, unknown>, sessionId?: string): void {
    const connection = this.requireConnection(socketId, sessionId);
    this.send(connection.ws, message);
  }

  private requireConnection(socketId: string, sessionId?: string): LabConnection {
    const connection = [...this.connections].find((candidate) => candidate.socketId === socketId);
    if (!connection || (sessionId !== undefined && connection.sessionId !== sessionId)) {
      throw new LabHttpError("parity_socket_not_found", "Target WebSocket is not active.", 409);
    }
    return connection;
  }

  private runtime() {
    return createWireLabRuntime(this);
  }

  requireRouteAuth(
    req: IncomingMessage,
    url: URL,
    auth: string,
    scopes: readonly string[],
  ): AuthenticatedSession | null {
    if (auth === "public" || auth === "pairing-token") return null;
    if (auth === "forward-enter-token") {
      throw new LabHttpError("invalid_forward_token", "Invalid forward-enter token.", 401);
    }
    const token = bearerToken(req, url, auth === "bearer-or-query");
    return this.auth.authenticateBearer(token, scopes as readonly RemoteScope[]);
  }
}

function normalizeLabBasePath(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLead = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLead.replace(/\/+$/, "");
}

export function pairingTokenFromUrl(pairingUrl: string): string {
  const url = new URL(pairingUrl);
  const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
  if (!token) throw new Error("Pairing URL is missing a token fragment.");
  return token;
}

export { joinBasePath };
