import { spawn, type ChildProcess } from "node:child_process";
import type { ProjectLocation } from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import { buildAgentCommand } from "../../base";
import { resolveProbeSpawnCwd } from "../../probeCwd";
import {
  MspRpcError,
  parseMspFrame,
  parseMspInitializeResult,
  type MspInitializeResult,
  type MspRequestId,
  type MspRpcNotification,
  type MspRpcRequest,
} from "./protocol";
import { MuseMspStdioTransport, type MuseMspTransport } from "./stdioTransport";

export const MSP_DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export type MuseMspNotificationHandler = (method: string, params: Record<string, unknown>) => void;

export interface SpawnMuseServeHostOptions {
  executablePath?: string;
  extraEnv?: Record<string, string>;
  serveArgs: string[];
  label?: string;
}

/**
 * Spawn a `muse serve` session host with piped stdio, mirroring the Codex
 * app-server probe spawn (WSL login-shell routing via `buildAgentCommand`,
 * own process group off Windows). Rejects when the process fails to spawn
 * or exits immediately; callers own teardown via `terminateChildProcessTree`.
 */
export async function spawnMuseServeHost(
  location: ProjectLocation,
  options: SpawnMuseServeHostOptions,
): Promise<{ child: ChildProcess; transport: MuseMspStdioTransport; commandLabel: string }> {
  const tag = options.label ?? "[muse-serve]";
  const cmd = buildAgentCommand(
    location,
    "muse",
    options.serveArgs,
    options.executablePath,
    options.extraEnv,
  );
  const spawnCwd = resolveProbeSpawnCwd(location, cmd.cwd);
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
    throw new Error(`${tag} exited before handshake:${transport.formatOutput()}`);
  }
  return { child, transport, commandLabel: `${cmd.command} ${cmd.args.join(" ")}` };
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
 * Higher-level session/turn flows belong in the future session module, not
 * here.
 */
export class MuseMspClient {
  private nextId = 1;
  private readonly pending = new Map<MspRequestId, PendingMspRequest>();
  private readonly notificationHandlers = new Set<MuseMspNotificationHandler>();
  private disposed = false;

  constructor(
    private readonly transport: MuseMspTransport,
    private readonly defaultTimeoutMs: number = MSP_DEFAULT_REQUEST_TIMEOUT_MS,
  ) {
    transport.setListener({
      onMessage: (message) => this.handleMessage(message),
      onClose: () => this.failPending(new Error("Muse MSP server closed the connection.")),
      onError: (error) =>
        this.failPending(error instanceof Error ? error : new Error("Muse MSP transport error.")),
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
        }
      }
    }
    // Server→client requests need no client answer in v1; unknown frames are
    // ignored so additive schema growth never breaks the client.
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
