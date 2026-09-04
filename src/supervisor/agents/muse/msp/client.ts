import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { buildAgentCommand } from "../../base";
import { resolveProbeSpawnCwd } from "../../probeCwd";
import { classifyMuseServeExit } from "./exitClassification";
import {
  MspRpcError,
  parseMspFrame,
  parseMspInitializeResult,
  type MspInitializeResult,
  type MspRequestId,
  type MspRpcErrorFrame,
  type MspRpcNotification,
  type MspRpcRequest,
  type MspRpcSuccess,
} from "./protocol";
import { MuseMspStdioTransport, type MuseMspTransport } from "./stdioTransport";

export const MSP_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export type MuseMspNotificationHandler = (method: string, params: Record<string, unknown>) => void;
export type MuseMspErrorHandler = (error: Error) => void;

/**
 * Handler for server-initiated JSON-RPC requests (`approval/request`,
 * `userInput/request`). The returned object becomes the response `result`;
 * a throw answers `internal`. Every server request expects exactly one
 * answer — hanging one stalls the host side that asked.
 */
export type MuseMspServerRequestHandler = (request: {
  id: MspRequestId;
  method: string;
  params: Record<string, unknown>;
}) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface SpawnMuseServeHostOptions {
  executablePath?: string;
  extraEnv?: Record<string, string>;
  serveArgs: string[];
  label?: string;
  isolateCwd?: boolean;
}

/**
 * Spawn a `muse serve` session host with piped stdio, mirroring the Codex
 * app-server probe spawn (WSL login-shell routing via `buildAgentCommand`,
 * own process group off Windows). Rejects when the process fails to spawn
 * or exits immediately; callers own teardown via `terminateChildProcessTree`
 * plus `hostCookie` (a WSL launch can outlive its Windows wrapper — the
 * cookie finds the surviving Linux process by environ for a bridge kill).
 */
export async function spawnMuseServeHost(
  location: ProjectLocation,
  options: SpawnMuseServeHostOptions,
): Promise<{
  child: ChildProcess;
  transport: MuseMspStdioTransport;
  commandLabel: string;
  hostCookie: string;
}> {
  const tag = options.label ?? "[muse-serve]";
  const hostCookie = randomUUID();
  const cmd = buildAgentCommand(location, "muse", options.serveArgs, options.executablePath, {
    ...options.extraEnv,
    PORACODE_MUSE_HOST_COOKIE: hostCookie,
  });
  const spawnCwd = options.isolateCwd === false ? cmd.cwd : resolveProbeSpawnCwd(location, cmd.cwd);
  const ownedProcessGroup = process.platform !== "win32";
  const child = spawn(cmd.command, cmd.args, {
    ...(spawnCwd ? { cwd: spawnCwd } : {}),
    env: { ...process.env, ...cmd.env, TERM: "xterm-256color" },
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    detached: ownedProcessGroup,
  });
  const transport = new MuseMspStdioTransport(child);

  const spawnError = await new Promise<Error | undefined>((resolve) => {
    child.once("error", (error) => resolve(error));
    setImmediate(() => resolve(undefined));
  });
  if (spawnError) {
    terminateChildProcessTree(child, { ownedProcessGroup });
    throw new Error(`${tag} failed to spawn: ${spawnError.message}`);
  }
  if (child.exitCode !== null) {
    terminateChildProcessTree(child, { ownedProcessGroup });
    const classification = classifyMuseServeExit(child.exitCode, child.signalCode ?? null);
    throw new Error(
      `${tag} exited before handshake (${classification.kind}): ${classification.detail}${transport.formatOutput()}`,
    );
  }
  return { child, transport, commandLabel: `${cmd.command} ${cmd.args.join(" ")}`, hostCookie };
}

interface PendingMspRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Minimal MSP client: `initialize`/`initialized` handshake, id-correlated
 * requests with timeouts, server→client notification fan-out. Unknown
 * methods and fields pass through untouched — the schema is additive-open,
 * so the client never validates beyond the envelope (see `parseMspFrame`).
 * Higher-level session/turn flows belong in the structured session module.
 */
export class MuseMspClient {
  private nextId = 1;
  private readonly pending = new Map<MspRequestId, PendingMspRequest>();
  private readonly notificationHandlers = new Set<MuseMspNotificationHandler>();
  private readonly errorHandlers = new Set<MuseMspErrorHandler>();
  private readonly serverRequestHandlers = new Set<MuseMspServerRequestHandler>();
  private disposed = false;

  constructor(
    private readonly transport: MuseMspTransport,
    private readonly defaultTimeoutMs: number = MSP_DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    transport.setListener({
      onMessage: (message) => this.handleMessage(message),
      onClose: () => this.failPending(new Error("Muse MSP server closed the connection.")),
      onError: (error) => {
        const normalized = error instanceof Error ? error : new Error("Muse MSP transport error.");
        this.failPending(normalized);
        for (const handler of [...this.errorHandlers]) handler(normalized);
      },
    });
  }

  /** `initialize` + the mandatory bare `initialized` notification. */
  async initialize(clientName: string, clientVersion: string): Promise<MspInitializeResult> {
    const result = await this.request("initialize", {
      clientInfo: { name: clientName, version: clientVersion },
    });
    this.notify("initialized");
    return parseMspInitializeResult(result);
  }

  request(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    if (this.disposed) {
      return Promise.reject(new Error("Muse MSP client is disposed."));
    }
    const id = this.nextId++;
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Muse MSP request timed out: ${method}`));
      }, timeoutMs ?? this.defaultTimeoutMs);
      if (typeof timeout.unref === "function") timeout.unref();
      this.pending.set(id, { resolve, reject, timeout });
      try {
        const frame: MspRpcRequest = {
          jsonrpc: "2.0",
          id,
          method,
          ...(params ? { params } : {}),
        };
        this.transport.write(frame);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("Muse MSP write failed."));
      }
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    const frame: MspRpcNotification = { jsonrpc: "2.0", method, ...(params ? { params } : {}) };
    this.transport.write(frame);
  }

  onNotification(handler: MuseMspNotificationHandler): () => void {
    this.notificationHandlers.add(handler);
    return () => {
      this.notificationHandlers.delete(handler);
    };
  }

  onError(handler: MuseMspErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  /**
   * Answer server-initiated requests. The first registered handler owns the
   * answer; with no handler the client answers `methodNotFound` so the host
   * never hangs awaiting a reply. Handlers run off the read path — keep them
   * non-blocking (the stdio server never severs a wedged pipe for us).
   */
  onServerRequest(handler: MuseMspServerRequestHandler): () => void {
    this.serverRequestHandlers.add(handler);
    return () => {
      this.serverRequestHandlers.delete(handler);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failPending(new Error("Muse MSP client is disposed."));
    this.transport.dispose();
  }

  private handleMessage(message: unknown): void {
    const frame = parseMspFrame(message);
    if (frame.kind === "response") {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      this.pending.delete(frame.id);
      clearTimeout(pending.timeout);
      if (frame.error) {
        pending.reject(
          new MspRpcError(frame.error.message, {
            code: frame.error.code,
            ...(typeof frame.error.data?.["kind"] === "string"
              ? { kind: frame.error.data["kind"] }
              : {}),
            requestId: frame.id,
            ...(frame.error.data ? { data: { ...frame.error.data } } : {}),
            ...(frame.error.retryable !== undefined ? { retryable: frame.error.retryable } : {}),
          }),
        );
      } else {
        pending.resolve(frame.result ?? {});
      }
      return;
    }
    if (frame.kind === "notification") {
      for (const handler of [...this.notificationHandlers]) {
        try {
          handler(frame.method, frame.params);
        } catch {
          // One bad subscriber must not break fan-out to the rest.
          // Handlers must stay non-blocking: the stdio server never severs a
          // wedged pipe for us, so slow work belongs off the read path.
        }
      }
      return;
    }
    if (frame.kind === "request") {
      this.answerServerRequest(frame.id, frame.method, frame.params);
      return;
    }
    // Unknown frames are ignored so additive schema growth never breaks the client.
  }

  private answerServerRequest(
    id: MspRequestId,
    method: string,
    params: Record<string, unknown>,
  ): void {
    const [handler] = [...this.serverRequestHandlers];
    const respond = (
      payload: { result: Record<string, unknown> } | { error: { code: number; message: string } },
    ): void => {
      try {
        if ("result" in payload) {
          const response: MspRpcSuccess = { jsonrpc: "2.0", id, result: payload.result };
          this.transport.write(response);
        } else {
          const response: MspRpcErrorFrame = { jsonrpc: "2.0", id, error: payload.error };
          this.transport.write(response);
        }
      } catch {
        // Transport gone: the host will observe EOF; nothing left to answer with.
      }
    };
    if (!handler) {
      respond({ error: { code: -32601, message: `Unknown method: ${method}` } });
      return;
    }
    void Promise.resolve()
      .then(() => handler({ id, method, params }))
      .then(
        (result) => respond({ result }),
        (error: unknown) => {
          console.warn(`[muse] MSP server-request handler failed for ${method}:`, error);
          respond({ error: { code: -32603, message: `Handler failed for ${method}` } });
        },
      );
  }

  private failPending(error: Error): void {
    if (this.pending.size === 0) return;
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const { reject, timeout } of pending) {
      clearTimeout(timeout);
      reject(error);
    }
  }
}
