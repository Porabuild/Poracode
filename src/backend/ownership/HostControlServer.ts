import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import {
  HOST_CONTROL_MAX_REQUEST_BYTES,
  HOST_CONTROL_MAX_RESPONSE_BYTES,
  HOST_CONTROL_PROTOCOL_VERSION,
  hostControlPairingResultSchema,
  hostControlRequestSchema,
  hostControlStatusResultSchema,
  hostDescriptionSchema,
  type HostControlAdmitPayload,
  type HostControlReply,
  type HostControlRequest,
  type HostControlStatusResult,
  type HostDescription,
} from "@/shared/hostControlProtocol";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import { HttpServerConnections } from "@/shared/httpServerConnections";
import { readBoundedNodeRequestBody } from "@/shared/http";
import { joinRuntimeShutdown } from "../joinRuntimeShutdown";
import type { HostOwnerLease } from "./hostOwnerLease";
import { publishHostControlDiscovery, removeHostControlDiscovery } from "./hostControlDiscovery";
import { authenticateHostControlRequest, createHostControlResponseProof } from "./hostControlAuth";

const MAX_CONNECTIONS = 8;
const MAX_REQUESTS = 16;
const MAX_RECEIPTS = 64;
const RECEIPT_WINDOW_MS = 60_000;
const INPUT_DEADLINE_MS = 2_000;

export interface HostControlContext {
  readonly signal: AbortSignal;
  /** Check after awaits, before any operation which can mint or persist state. */
  assertActive(): void;
  /** V6 A.5: pairing grant requested by the local control client. */
  readonly pairingPreset?: "operator" | "viewer";
}

/** D4 authenticated status source: identity, state and staging admission. */
export interface HostControlStatusSource {
  readonly state: HostControlStatusResult["state"];
  readonly admission: HostControlStatusResult["admission"];
  readonly endpoint: HostControlStatusResult["endpoint"];
  readonly build: HostControlStatusResult["build"];
}

interface HostControlServerOptions {
  lease: HostOwnerLease;
  describe(): Pick<
    HostDescription,
    "state" | "remoteProtocolVersion" | "endpoint" | "capabilities"
  >;
  /**
   * D4: when composed, the owner answers the additive authenticated `status`
   * operation. A host without this source rejects `status` exactly like a
   * pre-D4 owner (HTTP 400), which the upgrader may treat as a legacy owner
   * only after it has verified the owner through `describe`.
   */
  status?(): HostControlStatusSource;
  /**
   * D4: release staging admission. The server itself compares the caller's
   * expected build with the reported identity before invoking this callback,
   * so the callback only performs the state transition.
   */
  admit?(context: HostControlContext, expected: HostControlAdmitPayload): void | Promise<void>;
  issuePairing(context: HostControlContext): string | Promise<string>;
  reportError?(error: unknown): void;
  receiptNow?(): number;
}

type Outcome =
  | { ok: true; result: Extract<HostControlReply, { ok: true }>["result"] }
  | { ok: false; error: Extract<HostControlReply, { ok: false }>["error"] };

/** The live owner exposes one closed local management surface, separate from remote OAuth. */
export class HostControlServer {
  private static readonly active = new WeakMap<HostOwnerLease, HostControlServer>();
  private readonly generation: string;
  private readonly secret = randomBytes(32).toString("base64url");
  private readonly cancellation = new AbortController();
  private readonly work = new AsyncWorkTracker();
  private readonly headerTimers = new WeakMap<Socket, ReturnType<typeof setTimeout>>();
  private readonly server = createServer({ maxHeaderSize: 4_096 }, (request, response) =>
    this.admit(request, response),
  );
  private readonly connections = new HttpServerConnections(this.server);
  private readonly receipts = new Map<
    string,
    { expiresAt: number | null; result: Promise<Outcome> }
  >();
  private starting: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private stopping = false;
  private requests = 0;
  private port: number | undefined;

  constructor(private readonly options: HostControlServerOptions) {
    options.lease.assertActive();
    if (HostControlServer.active.has(options.lease))
      throw new Error("This owner already has a local control service.");
    this.generation = options.lease.generation;
    HostControlServer.active.set(options.lease, this);
    this.server.maxConnections = MAX_CONNECTIONS;
    this.server.maxRequestsPerSocket = 1;
    this.server.on("connection", (socket) => {
      const timer = setTimeout(() => socket.destroy(), INPUT_DEADLINE_MS);
      this.headerTimers.set(socket, timer);
      socket.once("close", () => {
        clearTimeout(timer);
        this.headerTimers.delete(socket);
      });
    });
    this.server.on("upgrade", (_, socket) => socket.destroy());
    this.server.on("clientError", (_, socket) => socket.destroy());
  }

  start(): Promise<void> {
    if (this.stopping) return Promise.reject(new Error("Host control is stopping."));
    if (this.starting) return this.starting;
    const barrier = Promise.withResolvers<void>();
    this.starting = barrier.promise;
    this.server.once("error", barrier.reject);
    try {
      this.options.lease.assertActive(this.generation);
      this.server.listen(0, "127.0.0.1", () => {
        try {
          this.assertActive();
          const address = this.server.address();
          if (!address || typeof address === "string")
            throw new Error("Host control listen failed.");
          this.port = address.port;
          publishHostControlDiscovery(this.options.lease, this.port, this.secret);
          barrier.resolve();
        } catch (error) {
          barrier.reject(error);
        }
      });
    } catch (error) {
      barrier.reject(error);
    }
    return this.starting;
  }

  dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopping = true;
    this.cancellation.abort();
    const barrier = Promise.withResolvers<void>();
    this.closing = barrier.promise;
    void Promise.resolve(this.starting)
      .catch(() => undefined)
      .then(() => joinRuntimeShutdown([() => this.connections.close(250), () => this.work.drain()]))
      .then(() => {
        this.removeDiscoveryAfterJoin();
        this.receipts.clear();
        HostControlServer.active.delete(this.options.lease);
      })
      .then(barrier.resolve, barrier.reject);
    return this.closing;
  }

  private removeDiscoveryAfterJoin(): void {
    try {
      removeHostControlDiscovery(this.options.lease);
    } catch {
      // Listener and admitted work have already joined. A leftover private
      // record cannot authenticate another peer and stops matching discovery
      // after the caller releases this generation. File cleanup must not turn
      // confirmed quiescence into an indefinitely retained ownership lease.
      try {
        this.options.reportError?.(
          new Error("Closed host control discovery could not be removed."),
        );
      } catch {
        // A diagnostic sink failure does not undo the completed runtime join.
      }
    }
  }

  private assertActive(): void {
    if (this.stopping) throw new Error("Host control is stopping.");
    this.options.lease.assertActive(this.generation);
  }

  private admit(request: IncomingMessage, response: ServerResponse): void {
    clearTimeout(this.headerTimers.get(request.socket));
    this.headerTimers.delete(request.socket);
    if (this.stopping || this.requests >= MAX_REQUESTS) {
      response.writeHead(503, { connection: "close" });
      response.end();
      return;
    }
    this.requests++;
    void this.work
      .run(() => this.handle(request, response))
      .catch(() => response.destroy())
      .finally(() => {
        this.requests--;
      });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const peer = request.socket.remoteAddress;
    const authority = `127.0.0.1:${this.port}`;
    if (
      (peer !== "127.0.0.1" && peer !== "::ffff:127.0.0.1") ||
      request.method !== "POST" ||
      request.url !== "/control" ||
      request.headers.host !== authority ||
      request.headers.origin !== undefined ||
      request.headers["content-type"] !== "application/json" ||
      request.headers["content-encoding"] !== undefined
    ) {
      response.writeHead(403, { connection: "close" });
      response.end();
      return;
    }
    const cancelled = new AbortController();
    const signal = AbortSignal.any([this.cancellation.signal, cancelled.signal]);
    const context: HostControlContext = {
      signal,
      assertActive: () => {
        this.assertActive();
        signal.throwIfAborted();
      },
    };
    const clientClosed = () => {
      if (!response.writableEnded) cancelled.abort();
    };
    response.once("close", clientClosed);
    const timer = setTimeout(() => request.destroy(), INPUT_DEADLINE_MS);
    try {
      const declared = request.headers["content-length"];
      if (
        declared !== undefined &&
        (!/^\d+$/u.test(declared) || Number(declared) > HOST_CONTROL_MAX_REQUEST_BYTES)
      )
        throw new Error("Host control request too large.");
      const body = await readBoundedNodeRequestBody(
        request,
        HOST_CONTROL_MAX_REQUEST_BYTES,
        () => new Error("Host control request too large."),
      );
      clearTimeout(timer);
      context.assertActive();
      const proof = {
        authorization: request.headers.authorization,
        method: request.method,
        path: request.url,
        authority,
        body,
      };
      if (!authenticateHostControlRequest(this.secret, proof)) {
        response.writeHead(401, { connection: "close" });
        response.end();
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        response.writeHead(400, { connection: "close" });
        response.end();
        return;
      }
      const parsed = hostControlRequestSchema.safeParse(payload);
      if (!parsed.success) {
        response.writeHead(400, { connection: "close" });
        response.end();
        return;
      }
      const input = parsed.data;
      // A host that predates an additive operation answers exactly like a
      // pre-D4 owner (authenticated request, then HTTP 400): the caller may
      // only conclude "operation unsupported" after a verified describe.
      if (input.operation === "status" && !this.options.status) {
        response.writeHead(400, { connection: "close" });
        response.end();
        return;
      }
      if (input.operation === "admit" && !this.options.admit) {
        response.writeHead(400, { connection: "close" });
        response.end();
        return;
      }
      const outcome: Outcome =
        input.ownerGeneration !== this.generation
          ? { ok: false, error: { code: "generation-mismatch" } }
          : await this.dispatch(input, context);
      context.assertActive();
      const reply: HostControlReply = {
        version: HOST_CONTROL_PROTOCOL_VERSION,
        requestId: input.requestId,
        ownerGeneration: this.generation,
        ...outcome,
      };
      const bytes = Buffer.from(JSON.stringify(reply));
      if (bytes.length > HOST_CONTROL_MAX_RESPONSE_BYTES)
        throw new Error("Host control response too large.");
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        connection: "close",
        "x-poracode-control-proof": createHostControlResponseProof(
          this.secret,
          proof.authorization,
          200,
          bytes,
        ),
      });
      response.end(bytes);
    } finally {
      clearTimeout(timer);
      response.off("close", clientClosed);
    }
  }

  private statusResult(): HostControlStatusResult {
    const source = this.options.status;
    if (!source) throw new Error("Host control status is not composed.");
    const current = source();
    return hostControlStatusResultSchema.parse({
      profileNamespace: this.options.lease.paths.profileNamespace,
      dataRoot: this.options.lease.paths.dataRoot,
      mode: this.options.lease.kind,
      state: current.state,
      admission: current.admission,
      endpoint: current.endpoint,
      build: current.build,
    });
  }

  private async dispatch(input: HostControlRequest, context: HostControlContext): Promise<Outcome> {
    const now = this.options.receiptNow?.() ?? Date.now();
    for (const [id, receipt] of this.receipts)
      if (receipt.expiresAt !== null && receipt.expiresAt <= now) this.receipts.delete(id);
    const existing = this.receipts.get(input.requestId);
    if (input.operation === "describe") {
      if (existing) return { ok: false, error: { code: "invalid-request" } };
      return {
        ok: true,
        result: hostDescriptionSchema.parse({
          ...this.options.describe(),
          profileNamespace: this.options.lease.paths.profileNamespace,
          dataRoot: this.options.lease.paths.dataRoot,
          mode: this.options.lease.kind,
          operations: ["describe", "issue-pairing"],
        }),
      };
    }
    // Read-only identity probe: available in every state, including while
    // staging admission is held and before the remote listener binds.
    if (input.operation === "status") {
      if (existing) return { ok: false, error: { code: "invalid-request" } };
      return { ok: true, result: this.statusResult() };
    }
    if (existing) return existing.result;
    if (this.receipts.size >= MAX_RECEIPTS) return { ok: false, error: { code: "capacity" } };
    if (input.operation === "admit") {
      const source = this.options.status?.();
      const admit = this.options.admit;
      if (!source || !admit) return { ok: false, error: { code: "not-staging" } };
      // The expected identity is compared before any state transition: a
      // caller that names a different build can never release admission.
      if (
        source.build.version !== input.payload.expectedVersion ||
        source.build.entrypointSha256 !== input.payload.expectedEntrypointSha256
      )
        return { ok: false, error: { code: "identity-mismatch" } };
      // A retried admit after a lost reply is idempotent once admission is open.
      if (source.admission === "open") return { ok: true, result: this.statusResult() };
      return this.recordMutation(input, context, async () => {
        await admit(context, input.payload);
        return { ok: true, result: this.statusResult() };
      });
    }
    if (this.options.describe().state !== "ready")
      return { ok: false, error: { code: "not-ready" } };
    return this.recordMutation(input, context, async () => {
      const pairingUrl = await this.options.issuePairing({
        ...context,
        ...(input.payload.preset ? { pairingPreset: input.payload.preset } : {}),
      });
      this.assertActive();
      return { ok: true, result: hostControlPairingResultSchema.parse({ pairingUrl }) };
    });
  }

  /** Run one admitted mutation behind the deduplicating receipt window. */
  private recordMutation(
    input: HostControlRequest,
    context: HostControlContext,
    operation: () => Promise<Outcome>,
  ): Promise<Outcome> {
    const barrier = Promise.withResolvers<Outcome>();
    const receipt = { expiresAt: null as number | null, result: barrier.promise };
    this.receipts.set(input.requestId, receipt);
    void this.work
      .run(async (): Promise<Outcome> => {
        context.assertActive();
        return operation();
      })
      .catch((): Outcome => ({
        ok: false,
        error: { code: this.stopping ? "stopping" : "unavailable" },
      }))
      .then((outcome) => {
        receipt.expiresAt = (this.options.receiptNow?.() ?? Date.now()) + RECEIPT_WINDOW_MS;
        barrier.resolve(outcome);
      });
    return barrier.promise;
  }
}
