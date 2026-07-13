import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import {
  type AgentEventEnvelope,
  agentEventEnvelopeSchema,
  MIN_PROTOCOL_VERSION,
  PROTOCOL_VERSION,
} from "@/shared/contracts";

/**
 * Receiver invoked for every accepted, version-compatible envelope. The
 * supervisor's `ThreadSessionManager` registers a single receiver that
 * resolves the routing keys to a `SessionRuntime` and applies the state
 * change. The receiver should be cheap; long-running work must be deferred.
 */
export type HookEventReceiver = (event: AgentEventEnvelope) => void;

export interface HookIngressBootInfo {
  /** Full URL plugins should POST to. Includes scheme, host, port, and path. */
  url: string;
  /** Bearer secret plugins must send as `Authorization: Bearer …`. */
  secret: string;
  /** Supervisor's max protocol version, exposed in `PORACODE_HOOK_PROTOCOL_VERSION`. */
  protocolVersion: number;
  /** TCP port the server bound to (after ephemeral fallback). */
  port: number;
}

export interface HookIngressOptions {
  /** Optional preferred port; falls back to `listen(0)` on `EADDRINUSE`. */
  preferredPort?: number;
  /** Receiver invoked once per accepted envelope. */
  onEvent: HookEventReceiver;
  /** Logger hook for diagnostics — defaults to `console.warn` for failures. */
  onError?: (message: string, error?: unknown) => void;
}

const HOOK_PATH = "/v1/agent-event";
const MAX_BODY_BYTES = 64 * 1024;

interface InternalState {
  server: Server;
  ready: Promise<HookIngressBootInfo>;
  resolveReady: (info: HookIngressBootInfo) => void;
  rejectReady: (error: Error) => void;
  info?: HookIngressBootInfo;
  closed: boolean;
  started: boolean;
}

/**
 * Single localhost HTTP ingress shared across all agent threads in a
 * supervisor process. Created during supervisor boot; `listen()` is launched
 * as a background task so the Electron window is never blocked on it.
 *
 * Plugins authenticate with a per-run bearer secret. The server only binds
 * `127.0.0.1` so it cannot be reached over the network; the secret guards
 * against drive-by spoofing from other local processes.
 */
export class HookIngress {
  private readonly state: InternalState;
  private readonly secret: string;
  private readonly preferredPort: number | undefined;

  constructor(private readonly options: HookIngressOptions) {
    this.secret = randomBytes(32).toString("hex");
    this.preferredPort = options.preferredPort;

    let resolveReady!: (info: HookIngressBootInfo) => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<HookIngressBootInfo>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    server.on("error", (error) => {
      this.options.onError?.(`hook ingress server error`, error);
    });

    // Suppress unhandled-rejection noise when the consumer disposes the
    // ingress without ever awaiting `ready` (e.g. tests). The rejection is
    // still observable via `.ready` for code that opted in.
    ready.catch(() => undefined);

    this.state = { server, ready, resolveReady, rejectReady, closed: false, started: false };
  }

  /** Promise resolved once the server has bound a port. */
  get ready(): Promise<HookIngressBootInfo> {
    return this.state.ready;
  }

  /** Synchronous accessor for the boot info — returns undefined before bind. */
  get info(): HookIngressBootInfo | undefined {
    return this.state.info;
  }

  /**
   * Synchronously expose the bearer secret. Available immediately after
   * construction (before `start()` resolves) so other components that share
   * the secret — e.g. the in-WSL hook bridge — can be configured without
   * awaiting the listener boot.
   */
  getSecret(): string {
    return this.secret;
  }

  /**
   * Synchronously expose the protocol version this ingress accepts. Used by
   * the WSL hook bridge to advertise its compatible window.
   */
  getProtocolVersion(): number {
    return PROTOCOL_VERSION;
  }

  /**
   * Begin listening as a background task. Returns synchronously so the
   * supervisor boot path is non-blocking; await `ready` only when a thread
   * spawn actually needs the URL.
   */
  start(): void {
    if (this.state.started) return;
    this.state.started = true;
    const tryListen = (port: number, allowFallback: boolean): void => {
      const onListenError = (error: NodeJS.ErrnoException): void => {
        this.state.server.removeListener("listening", onListening);
        if (allowFallback && error.code === "EADDRINUSE") {
          this.options.onError?.(
            `hook ingress port ${port} in use; falling back to ephemeral port`,
          );
          tryListen(0, false);
          return;
        }
        this.state.rejectReady(error);
      };
      const onListening = (): void => {
        this.state.server.removeListener("error", onListenError);
        const address = this.state.server.address();
        if (!address || typeof address === "string") {
          const error = new Error(`hook ingress: unexpected listen address ${String(address)}`);
          this.state.rejectReady(error);
          return;
        }
        const info: HookIngressBootInfo = {
          url: `http://127.0.0.1:${address.port}${HOOK_PATH}`,
          secret: this.secret,
          protocolVersion: PROTOCOL_VERSION,
          port: address.port,
        };
        this.state.info = info;
        this.state.resolveReady(info);
      };
      this.state.server.once("error", onListenError);
      this.state.server.once("listening", onListening);
      this.state.server.listen(port, "127.0.0.1");
    };
    tryListen(this.preferredPort ?? 0, this.preferredPort !== undefined);
  }

  /** Stop listening and reject the ready promise if it was still pending. */
  async dispose(): Promise<void> {
    if (this.state.closed) return;
    this.state.closed = true;
    if (this.state.started && !this.state.info) {
      this.state.rejectReady(new Error("hook ingress disposed before listen completed"));
    }
    await new Promise<void>((resolve) => {
      if (!this.state.started) {
        // Server was created but never asked to listen — close() still works
        // but the callback fires synchronously, so this is just defensive.
        this.state.server.close(() => resolve());
        resolve();
        return;
      }
      this.state.server.close(() => resolve());
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      this.respond(res, 405, { error: "method_not_allowed" });
      return;
    }
    const url = req.url ?? "";
    if (!url.startsWith(HOOK_PATH)) {
      this.respond(res, 404, { error: "not_found" });
      return;
    }

    const auth = req.headers["authorization"];
    if (typeof auth !== "string" || auth !== `Bearer ${this.secret}`) {
      this.respond(res, 401, { error: "unauthorized" });
      return;
    }

    let body: string;
    try {
      body = await this.readBody(req);
    } catch (error) {
      // 413 must be sent BEFORE we tear down the connection, otherwise the
      // client (e.g. plugin forwarder) sees `ECONNRESET` instead of a real
      // HTTP error and retries forever.
      this.respond(res, 413, { error: "payload_too_large" });
      this.options.onError?.(
        "hook ingress: rejected oversized payload",
        error instanceof Error ? error.message : error,
      );
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      this.respond(res, 400, { error: "invalid_json" });
      return;
    }

    // Cheap version pre-check to surface a friendlier 426 before zod runs.
    const rawProtocol = (json as { protocolVersion?: unknown }).protocolVersion;
    if (typeof rawProtocol === "number" && rawProtocol < MIN_PROTOCOL_VERSION) {
      this.respond(res, 426, {
        error: "upgrade_required",
        supportedProtocol: PROTOCOL_VERSION,
        minProtocol: MIN_PROTOCOL_VERSION,
      });
      return;
    }

    const parsed = agentEventEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      this.respond(res, 400, {
        error: "invalid_envelope",
        issues: parsed.error.issues.slice(0, 5).map((issue) => issue.message),
      });
      return;
    }

    const envelope = parsed.data;
    if (envelope.protocolVersion > PROTOCOL_VERSION) {
      // Plugin is newer than supervisor — accept fields we know, but signal
      // the envelope was downgraded so the client can gate its own behaviour.
      this.respond(res, 200, { ok: true, downgraded: true, supportedProtocol: PROTOCOL_VERSION });
    } else {
      this.respond(res, 202, { ok: true });
    }

    try {
      this.options.onEvent(envelope);
    } catch (error) {
      this.options.onError?.("hook ingress: receiver threw", error);
    }
  }

  private respond(res: ServerResponse, status: number, body: object): void {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let total = 0;
      let oversized = false;
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (oversized) return;
        if (total > MAX_BODY_BYTES) {
          // Stop accumulating but keep draining the socket so the client
          // sends `end` and we can write a clean 413 back. Destroying mid-
          // stream would surface as `ECONNRESET` to the plugin instead.
          oversized = true;
          chunks.length = 0;
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (oversized) {
          reject(new Error(`payload exceeds ${MAX_BODY_BYTES} bytes`));
          return;
        }
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
      req.on("error", reject);
    });
  }
}
