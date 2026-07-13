import { fork, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import { terminateChildProcessTree } from "@/shared/processTree";
import type {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorEvent,
  SupervisorProcedureName,
  SupervisorReply,
  SupervisorRequest,
} from "@/shared/ipc";

function isSupervisorReply(message: unknown): message is SupervisorReply {
  return typeof message === "object" && message !== null && "replyTo" in message;
}

/**
 * Backstop timeout for a single request/reply RPC. This is intentionally
 * generous — some procedures legitimately run for minutes (downloading or
 * installing agent binaries on a slow connection, large `git` operations).
 * It exists only to guarantee that a request can never hang *forever* if the
 * supervisor is alive but its handler deadlocks or never sends a reply; the
 * common connection-loss case is already handled by the `exit`/EPIPE paths.
 */
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Electron / Windows: a forked supervisor with stdio "inherit" often does
 * not surface `console.log` in the same dev terminal as the main process.
 * Pipe stdout/stderr and write through the parent's stdio so hook-debug and
 * other supervisor logs are visible next to `[db]` / main-process lines.
 */
function pipeSupervisorStreamsToParent(child: ChildProcess): void {
  const pipeTo = (stream: Readable | null | undefined, out: NodeJS.WriteStream): void => {
    if (!stream) return;
    stream.on("data", (chunk: string | Buffer) => {
      out.write(chunk);
    });
  };
  pipeTo(child.stdout, process.stdout);
  pipeTo(child.stderr, process.stderr);
}

export interface SupervisorClientOptions {
  appVersion: string;
  isDev: boolean;
  supervisorPath: string;
  /**
   * Directory containing the in-WSL helpers shipped with the app
   * (`watcher.node`, `bridge.mjs`). Forwarded to the supervisor via
   * `PORACODE_WSL_HELPERS_DIR` so the bridge server can stage assets
   * into running distros.
   */
  wslHelpersDir: string;
  /**
   * Directory containing the read-only skills shipped with the app
   * (`skill-creator`, …). Forwarded to the supervisor via
   * `PORACODE_BUNDLED_SKILLS_DIR` so the skills service can surface them.
   */
  bundledSkillsDir?: string;
  secretStorageKey: string;
  /**
   * Optional resolver invoked at every supervisor spawn, returning extra env
   * vars to merge into the child env. Used by the in-app browser MCP wiring
   * to inject `PORACODE_BROWSER_MCP_*` per-launch.
   */
  resolveExtraEnv?: () => Record<string, string>;
  assignPid?(pid: number): Promise<void>;
  reportError?(error: unknown, tags?: PoracodeDiagnosticTags): void;
  onEvent(event: SupervisorEvent): void;
  onReset(): void;
}

export class SupervisorClient {
  private child: ChildProcess | null = null;
  private baseDir: string | null = null;
  private disposed = false;
  private readonly startedGate: Promise<void>;
  private resolveStartedGate!: () => void;
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  constructor(private readonly options: SupervisorClientOptions) {
    this.startedGate = new Promise<void>((resolve) => {
      this.resolveStartedGate = resolve;
    });
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  private reset(error: Error): void {
    this.rejectPendingRequests(error);
    this.options.onReset();
  }

  start(baseDir: string): void {
    this.baseDir = baseDir;
    this.resolveStartedGate();
    this.stop(new Error("Supervisor restarting"));

    const extraEnv = this.options.resolveExtraEnv?.() ?? {};
    const child = fork(this.options.supervisorPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        PORACODE_APP_VERSION: this.options.appVersion,
        PORACODE_IS_DEV: this.options.isDev ? "1" : "0",
        PORACODE_DATA_DIR: baseDir,
        PORACODE_SECRET_STORAGE_KEY: this.options.secretStorageKey,
        PORACODE_WSL_HELPERS_DIR: this.options.wslHelpersDir,
        // Back-compat for one release; older supervisor builds still read
        // the legacy var. Safe to drop once min supported supervisor knows
        // about PORACODE_WSL_HELPERS_DIR.
        PORACODE_WSL_WATCHER_DIR: this.options.wslHelpersDir,
        ...(this.options.bundledSkillsDir
          ? { PORACODE_BUNDLED_SKILLS_DIR: this.options.bundledSkillsDir }
          : {}),
        ...extraEnv,
      },
    });

    pipeSupervisorStreamsToParent(child);

    this.child = child;
    if (typeof child.pid === "number") {
      void this.options.assignPid?.(child.pid).catch((error) => {
        console.error(
          "[poracode] failed to assign supervisor to Windows Job Object:",
          error instanceof Error ? error.message : String(error),
        );
        this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
      });
    }

    child.on("message", (message: SupervisorReply | SupervisorEvent) => {
      if (isSupervisorReply(message)) {
        const pending = this.pendingRequests.get(message.replyTo);
        if (!pending) {
          return;
        }
        this.pendingRequests.delete(message.replyTo);
        if (message.ok) {
          pending.resolve(message.data);
        } else {
          pending.reject(new Error(message.error));
        }
        return;
      }

      this.options.onEvent(message);
    });

    child.on("exit", (code) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      this.reset(new Error("Supervisor exited"));
      if (!this.disposed && code !== 0 && this.baseDir) {
        const error = new Error(`Supervisor exited with code ${code ?? "unknown"}`);
        console.error(`[poracode] ${error.message}, restarting…`);
        this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
        setTimeout(() => {
          if (!this.child && this.baseDir) {
            this.start(this.baseDir);
          }
        }, 1000);
      }
    });
  }

  stop(error: Error): void {
    const child = this.child;
    if (!child) {
      return;
    }
    this.child = null;
    this.reset(error);
    terminateChildProcessTree(child);
  }

  dispose(): void {
    this.disposed = true;
    this.resolveStartedGate();
    this.stop(new Error("Supervisor exited"));
  }

  async call<Name extends SupervisorProcedureName>(
    type: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    await this.startedGate;
    const child = this.child;
    if (!child || !child.connected) {
      return Promise.reject(new Error("Supervisor is not running."));
    }

    const id = randomUUID();
    const request: SupervisorRequest = {
      id,
      type,
      payload,
    } as SupervisorRequest;

    return new Promise<IpcProcedureResult<Name>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pendingRequests.delete(id)) {
          reject(new Error(`Supervisor request "${type}" timed out.`));
        }
      }, REQUEST_TIMEOUT_MS);
      // Avoid keeping the event loop (and the app) alive solely for this timer.
      timeout.unref?.();

      const settle = (settleFn: (value: unknown) => void, value: unknown): void => {
        clearTimeout(timeout);
        settleFn(value);
      };

      this.pendingRequests.set(id, {
        resolve: (value) => settle((v) => resolve(v as IpcProcedureResult<Name>), value),
        reject: (reason) => settle(reject as (value: unknown) => void, reason),
      });

      // On `child.send` failure the request will never get a reply, so we must
      // reject here — including the EPIPE case. The pending entry is already
      // removed from the map at that point, so the `exit` handler's
      // `rejectPendingRequests` can no longer reach it; returning silently
      // would orphan the caller's promise forever.
      const failSend = (error: unknown): void => {
        const pending = this.pendingRequests.get(id);
        if (!pending) {
          return;
        }
        this.pendingRequests.delete(id);
        pending.reject(error);
      };

      try {
        child.send(request, (error) => {
          if (error) {
            failSend(error);
          }
        });
      } catch (error) {
        failSend(error);
      }
    });
  }
}
