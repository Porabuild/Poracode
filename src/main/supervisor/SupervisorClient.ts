import { fork, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { constants as osConstants, setPriority } from "node:os";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import { stopSupervisorChild } from "./stopSupervisorChild";
import type { StartThreadPayload } from "@/shared/contracts";
import {
  IpcProcedurePayload,
  IpcProcedureResult,
  SupervisorEvent,
  SupervisorFlowControl,
  SupervisorProcedureName,
  SupervisorReply,
  SupervisorRequest,
  isSupervisorOutputShedSignal,
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
  baseDir: string;
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
   * (`skill-creator-poracode`, …). Forwarded to the supervisor via
   * `PORACODE_BUNDLED_SKILLS_DIR` so the skills service can surface them.
   */
  bundledSkillsDir?: string;
  /**
   * Directory containing the Agent Plugins packages shipped with the app.
   * Forwarded as `PORACODE_BUNDLED_PLUGINS_DIR` so the plugin registry can
   * discover them.
   */
  bundledPluginsDir?: string;
  secretStorageKey: string;
  /** Lower the supervisor and inherited agent processes below the desktop UI's priority. */
  preferUiResponsiveness?: boolean;
  /**
   * Optional resolver invoked at every supervisor spawn, returning extra env
   * vars to merge into the child env. Used by the in-app browser MCP wiring
   * to inject `PORACODE_BROWSER_MCP_*` per-launch.
   */
  resolveExtraEnv?: () => Record<string, string>;
  /** Apply main-process launch invariants before any start reaches the supervisor. */
  prepareStartThread?(payload: StartThreadPayload): StartThreadPayload;
  assignPid?(pid: number): Promise<void>;
  reportError?(error: unknown, tags?: PoracodeDiagnosticTags): void;
  onEvent(event: SupervisorEvent): void;
  /**
   * The supervisor shed queued terminal-output batches for these threads
   * under IPC backpressure. The backend must ask connected clients to
   * resynchronize those threads' terminal output from the supervisor, which
   * keeps the authoritative PTY bytes; the events themselves never persisted.
   */
  onOutputShed?(threadIds: string[]): void;
  onReset(): void;
  /**
   * Invoked after every (re)spawn of the supervisor process — including
   * crash-restarts — once requests can be sent. Used to push state the
   * supervisor cannot recover on its own (e.g. persisted orchestrator
   * child-thread rows).
   */
  onStarted?(): void;
}

/**
 * Calls which mutate one thread's provider/session state are serialized by the
 * supervisor client. Control messages that stop or answer an active session
 * deliberately bypass this queue so a long-running mutation can still be
 * interrupted. The coordinator is transport-level: desktop, headless, and
 * remote compositions all share the same ordering boundary.
 */
const THREAD_EXCLUSIVE_PROCEDURES = new Set<SupervisorProcedureName>([
  "startThread",
  "ensureThreadRunning",
  "sendThreadInput",
  "controlThreadGoal",
  "rollbackThreadConversation",
  "createRevertAnchor",
  "restoreToRevertAnchor",
  "setPendingSteer",
  "clearPendingSteer",
  "queueThreadFollowUp",
  "removeQueuedThreadFollowUp",
  "reorderQueuedThreadFollowUp",
  "editQueuedThreadFollowUp",
  "steerQueuedThreadFollowUp",
  "pauseThreadFollowUps",
  "resumeThreadFollowUps",
]);

const THREAD_CONTROL_PROCEDURES = new Set<SupervisorProcedureName>([
  "interruptThread",
  "resolveThreadServerRequest",
  "closeThread",
  "cancelExtractContext",
]);

const THREAD_CANCELLING_PROCEDURES = new Set<SupervisorProcedureName>([
  "interruptThread",
  "closeThread",
]);

function threadIdForProcedure(type: SupervisorProcedureName, payload: unknown): string | undefined {
  if (!THREAD_EXCLUSIVE_PROCEDURES.has(type) && !THREAD_CONTROL_PROCEDURES.has(type)) return;
  if (!payload || typeof payload !== "object" || !("threadId" in payload)) return;
  const threadId = (payload as { threadId?: unknown }).threadId;
  return typeof threadId === "string" && threadId.length > 0 ? threadId : undefined;
}

interface SupervisorCallOptions {
  /** Internal use while a compound operation already owns the thread lock. */
  readonly skipThreadMutation?: boolean;
}

export class SupervisorClient {
  private child: ChildProcess | null = null;
  private disposed = false;
  private stopPromise: Promise<void> | null = null;
  private restartPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private retiringChild: ChildProcess | null = null;
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private readonly threadMutationTails = new Map<string, Promise<void>>();
  private readonly threadMutationEpochs = new Map<string, number>();

  constructor(private readonly options: SupervisorClientOptions) {}

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

  /**
   * Launch the supervisor child unless one is already running. Idempotent
   * (P1-3): a duplicate boot path calling this while the supervisor is
   * healthy is a no-op, so it can never kill a working child mid-stream.
   * Use {@link restart} for explicit force-restart semantics.
   */
  start(): Promise<void> {
    if (this.disposed) throw new Error("Supervisor client is disposed.");
    if (this.restartPromise) return this.restartPromise;
    if (this.stopPromise) return this.stopPromise.then(() => this.start());
    if (!this.child) this.launch();
    return Promise.resolve();
  }

  /** Kill any running supervisor and launch a fresh child. */
  restart(): Promise<void> {
    if (this.disposed) throw new Error("Supervisor client is disposed.");
    if (this.restartPromise) return this.restartPromise;
    this.restartPromise = this.stop(new Error("Supervisor restarting"))
      .then(() => {
        if (this.disposed) throw new Error("Supervisor client is disposed.");
        this.launch();
      })
      .finally(() => {
        this.restartPromise = null;
      });
    return this.restartPromise;
  }

  private launch(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const extraEnv = this.options.resolveExtraEnv?.() ?? {};
    const child = fork(this.options.supervisorPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        PORACODE_APP_VERSION: this.options.appVersion,
        PORACODE_IS_DEV: this.options.isDev ? "1" : "0",
        PORACODE_DATA_DIR: this.options.baseDir,
        PORACODE_SECRET_STORAGE_KEY: this.options.secretStorageKey,
        PORACODE_WSL_HELPERS_DIR: this.options.wslHelpersDir,
        // Back-compat for one release; older supervisor builds still read
        // the legacy var. Safe to drop once min supported supervisor knows
        // about PORACODE_WSL_HELPERS_DIR.
        PORACODE_WSL_WATCHER_DIR: this.options.wslHelpersDir,
        ...(this.options.bundledSkillsDir
          ? { PORACODE_BUNDLED_SKILLS_DIR: this.options.bundledSkillsDir }
          : {}),
        ...(this.options.bundledPluginsDir
          ? { PORACODE_BUNDLED_PLUGINS_DIR: this.options.bundledPluginsDir }
          : {}),
        ...extraEnv,
      },
    });

    pipeSupervisorStreamsToParent(child);

    this.child = child;
    if (typeof child.pid === "number") {
      if (this.options.preferUiResponsiveness) {
        try {
          setPriority(child.pid, osConstants.priority.PRIORITY_BELOW_NORMAL);
        } catch (error) {
          console.warn(
            "[poracode] failed to lower supervisor process priority:",
            error instanceof Error ? error.message : String(error),
          );
          this.options.reportError?.(error, { "poracode.feature_area": "process-lifecycle" });
        }
      }
      void this.options.assignPid?.(child.pid).catch((error) => {
        if (this.child !== child) return;
        console.error(
          "[poracode] failed to assign supervisor to Windows Job Object:",
          error instanceof Error ? error.message : String(error),
        );
        this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
      });
    }

    child.on("message", (message: SupervisorReply | SupervisorEvent) => {
      // Retiring-child events remain valid until channel closure, while its database is
      // still open. No message from an exited/replaced generation is accepted.
      if (this.child !== child) return;
      if (isSupervisorOutputShedSignal(message)) {
        this.options.onOutputShed?.(message.threadIds);
        return;
      }
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

    child.on("close", (code) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      this.reset(new Error("Supervisor exited"));
      if (!this.disposed && this.retiringChild !== child && code !== 0) {
        const error = new Error(`Supervisor exited with code ${code ?? "unknown"}`);
        console.error(`[poracode] ${error.message}, restarting…`);
        this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (!this.disposed && !this.child) {
            void this.start().catch((restartError) =>
              this.options.reportError?.(restartError, { "poracode.feature_area": "supervisor" }),
            );
          }
        }, 1000);
      }
    });
    child.on("error", (error) => {
      if (this.child !== child) return;
      this.rejectPendingRequests(error);
      this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
    });
    this.options.onStarted?.();
  }

  stop(error: Error): Promise<void> {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.stopPromise) return this.stopPromise;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.rejectPendingRequests(error);
    this.retiringChild = child;
    this.stopPromise = stopSupervisorChild(child).then(() => {
      if (this.child === child) {
        this.child = null;
        this.reset(error);
      }
      this.retiringChild = null;
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  setOutputBackpressured(paused: boolean): void {
    if (this.disposed || this.stopPromise) return;
    const child = this.child;
    if (!child?.connected) return;
    const message: SupervisorFlowControl = {
      control: "set-output-backpressure",
      paused,
    };
    try {
      child.send(message, (error) => {
        if (this.child !== child) return;
        if (error) {
          this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
        }
      });
    } catch (error) {
      this.options.reportError?.(error, { "poracode.feature_area": "supervisor" });
    }
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    for (const threadId of this.threadMutationTails.keys()) {
      this.cancelQueuedThreadMutations(threadId);
    }
    this.disposePromise = (async () => {
      try {
        await this.stop(new Error("Supervisor exited"));
      } finally {
        await this.drainThreadMutations();
      }
    })();
    return this.disposePromise;
  }

  /** Join queued compound operations before their owning database can close. */
  private async drainThreadMutations(): Promise<void> {
    while (this.threadMutationTails.size > 0) {
      await Promise.all([...this.threadMutationTails.values()]);
    }
  }

  /** Hold the per-thread mutation lock across a multi-step backend operation. */
  runThreadMutation<Result>(threadId: string, operation: () => Promise<Result>): Promise<Result> {
    if (!threadId) throw new Error("A thread mutation requires a thread id.");
    if (this.disposed) return Promise.reject(new Error("Supervisor client is disposed."));
    const previous = this.threadMutationTails.get(threadId);
    const epoch = this.threadMutationEpochs.get(threadId) ?? 0;
    const invoke = (): Promise<Result> => {
      if ((this.threadMutationEpochs.get(threadId) ?? 0) !== epoch) {
        return Promise.reject(new Error("Thread mutation was cancelled by a control operation."));
      }
      try {
        return Promise.resolve(operation());
      } catch (error) {
        return Promise.reject(error);
      }
    };
    // Invoke the first operation synchronously so a control call in the same
    // turn cannot overtake its admission. Later operations wait for the tail.
    const current = previous ? previous.then(invoke, invoke) : invoke();
    const settled = current.then(
      () => undefined,
      () => undefined,
    );
    this.threadMutationTails.set(threadId, settled);
    void settled.then(() => {
      if (this.threadMutationTails.get(threadId) === settled) {
        this.threadMutationTails.delete(threadId);
      }
    });
    return current;
  }

  private cancelQueuedThreadMutations(threadId: string): void {
    this.threadMutationEpochs.set(threadId, (this.threadMutationEpochs.get(threadId) ?? 0) + 1);
  }

  async call<Name extends SupervisorProcedureName>(
    type: Name,
    payload: IpcProcedurePayload<Name>,
    options: SupervisorCallOptions = {},
  ): Promise<IpcProcedureResult<Name>> {
    const threadId = threadIdForProcedure(type, payload);
    if (
      !options.skipThreadMutation &&
      threadId !== undefined &&
      THREAD_CANCELLING_PROCEDURES.has(type)
    ) {
      this.cancelQueuedThreadMutations(threadId);
    }
    if (
      !options.skipThreadMutation &&
      threadId !== undefined &&
      THREAD_EXCLUSIVE_PROCEDURES.has(type)
    ) {
      return this.runThreadMutation(threadId, () =>
        this.callUncoordinated(type, payload),
      ) as Promise<IpcProcedureResult<Name>>;
    }
    return this.callUncoordinated(type, payload);
  }

  private async callUncoordinated<Name extends SupervisorProcedureName>(
    type: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>> {
    if (this.disposed) throw new Error("Supervisor client is disposed.");
    const transition = this.restartPromise ?? this.stopPromise;
    if (transition) await transition;
    if (this.disposed) throw new Error("Supervisor client is disposed.");
    if (!this.child?.connected) {
      const starting = this.start();
      if (!this.child?.connected) await starting;
    }
    const child = this.child;
    if (!child || !child.connected) {
      return Promise.reject(new Error("Supervisor is not running."));
    }

    const id = randomUUID();
    const requestPayload =
      (type === "startThread" || type === "ensureThreadRunning") && this.options.prepareStartThread
        ? this.options.prepareStartThread(payload as StartThreadPayload)
        : payload;
    const request: SupervisorRequest = {
      id,
      type,
      payload: requestPayload,
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
