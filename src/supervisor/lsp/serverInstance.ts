import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import type { ProjectLocation } from "@/shared/contracts";
import { createLspRootUri, type LspSessionStatus } from "@/shared/lsp";
import { terminateChildProcessTree } from "@/shared/processTree";
import { getProjectFsPath } from "@/shared/wsl";
import {
  buildAgentCommand,
  prepareAgentLocationEnvironment,
  primeProjectShellEnv,
} from "../agents/base";
import { captureSupervisorException } from "../diagnostics/sentry";
import type { LanguageServerConfig } from "./serverRegistry";
import { waitForServerCandidate } from "./serverStartup";

interface StartupAttempt {
  cancellation: AbortController;
  process: ChildProcess | null;
  connection: MessageConnection | null;
  ready: boolean;
  removeExitListener?: () => void;
}

/**
 * For native projects, resolve `node_modules/...` against the project root
 * so we pick up a locally-installed server before a global one.
 */
function resolveNativeCommand(cmd: string, projectRoot: string): string {
  if (cmd.startsWith("node_modules/")) {
    const resolved = resolve(projectRoot, cmd);
    if (process.platform !== "win32" || existsSync(resolved) || extname(resolved)) {
      return resolved;
    }
    for (const extension of [".cmd", ".exe", ".bat"]) {
      const candidate = `${resolved}${extension}`;
      if (existsSync(candidate)) return candidate;
    }
    return resolved;
  }
  return cmd;
}

/**
 * Build a POSIX-style absolute path for a `node_modules/...` command inside
 * the distro. `path.resolve` is Windows-biased on win32 hosts (it prepends
 * a drive letter), so we do a string join instead.
 */
function resolveWslCommand(cmd: string, linuxPath: string): string {
  if (cmd.startsWith("node_modules/")) {
    return `${linuxPath}/${cmd}`;
  }
  return cmd;
}

export class ServerInstance {
  private process: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private restartCount = 0;
  private disposed = false;
  private failureReported = false;
  private attempt: StartupAttempt | null = null;
  private startup: Promise<void> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly sessionId: string,
    private readonly config: LanguageServerConfig,
    private readonly projectLocation: ProjectLocation,
    private readonly onMessage: (message: unknown) => void,
    private readonly onStatus: (status: LspSessionStatus, error?: string) => void,
  ) {}

  start(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.startup) return this.startup;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const attempt: StartupAttempt = {
      cancellation: new AbortController(),
      process: null,
      connection: null,
      ready: false,
    };
    this.attempt = attempt;
    // Publish the attempt before callbacks or asynchronous preparation can run.
    const startup = Promise.resolve().then(() => this.startAttempt(attempt));
    this.startup = startup;
    void startup.catch(() => {
      this.releaseAttempt(attempt);
      if (this.attempt === attempt) {
        this.attempt = null;
        this.startup = null;
      }
    });
    return startup;
  }

  private isCurrent(attempt: StartupAttempt): boolean {
    return !this.disposed && this.attempt === attempt;
  }

  private async startAttempt(attempt: StartupAttempt): Promise<void> {
    if (!this.isCurrent(attempt)) return;
    this.onStatus("starting");
    if (!this.isCurrent(attempt)) return;

    const projectRoot = getProjectFsPath(this.projectLocation);
    if (this.projectLocation.kind === "posix") {
      try {
        await primeProjectShellEnv(this.projectLocation.path);
      } catch (error) {
        if (!this.isCurrent(attempt)) return;
        throw error;
      }
      if (!this.isCurrent(attempt)) return;
    }

    for (const candidate of this.config.commands) {
      try {
        await prepareAgentLocationEnvironment(this.projectLocation);
        if (!this.isCurrent(attempt)) return;
        const command =
          this.projectLocation.kind === "wsl"
            ? resolveWslCommand(candidate.command, this.projectLocation.linuxPath)
            : resolveNativeCommand(candidate.command, projectRoot);
        const spec = buildAgentCommand(this.projectLocation, command, candidate.args);
        if (!this.isCurrent(attempt)) return;
        const proc = spawn(spec.command, spec.args, {
          ...(spec.cwd ? { cwd: spec.cwd } : {}),
          ...(spec.env ? { env: { ...process.env, ...spec.env } } : {}),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });
        attempt.process = proc;
        this.process = proc;
        if (!this.isCurrent(attempt)) {
          this.releaseProcess(attempt);
          return;
        }
        const earlyExit = await waitForServerCandidate(proc, attempt.cancellation.signal);
        if (!this.isCurrent(attempt)) return;
        if (earlyExit || proc.exitCode !== null || proc.signalCode !== null) {
          this.releaseProcess(attempt);
          continue;
        }
        break;
      } catch {
        this.releaseProcess(attempt);
        if (!this.isCurrent(attempt)) return;
      }
    }

    if (!this.isCurrent(attempt)) return;
    const proc = attempt.process;
    if (!proc?.stdout || !proc.stdin) {
      const message = `No language server found for "${this.config.languageId}". Install one of: ${this.config.commands.map((c) => c.command).join(", ")}`;
      this.onStatus("error", message);
      if (!this.isCurrent(attempt)) return;
      throw new Error(message);
    }

    const exited = (code: number | null) => this.processExited(attempt, proc, code);
    proc.once("exit", exited);
    attempt.removeExitListener = () => {
      proc.off("exit", exited);
    };

    const connection = createMessageConnection(
      new StreamMessageReader(proc.stdout),
      new StreamMessageWriter(proc.stdin),
    );
    attempt.connection = connection;
    this.connection = connection;
    if (!this.isCurrent(attempt)) {
      this.releaseConnection(attempt);
      return;
    }

    connection.onNotification((method, params) => {
      if (!this.isCurrent(attempt) || this.connection !== connection) return;
      this.onMessage({ jsonrpc: "2.0", method, params });
    });

    const rootUri = createLspRootUri(this.projectLocation);
    const rootName =
      this.projectLocation.kind === "wsl"
        ? this.projectLocation.linuxPath
        : this.projectLocation.path;

    connection.onRequest((method) => {
      if (!this.isCurrent(attempt) || this.connection !== connection) return null;
      switch (method) {
        case "workspace/configuration":
          return [];
        case "workspace/workspaceFolders":
          return [{ uri: rootUri, name: rootName }];
        default:
          return null;
      }
    });
    connection.onError(([error]) => {
      if (this.isCurrent(attempt) && this.connection === connection)
        console.error(`[LSP ${this.sessionId}] Connection error:`, error);
    });
    connection.onClose(() => {
      if (this.isCurrent(attempt) && this.connection === connection) this.connection = null;
    });
    connection.listen();

    try {
      if (!this.isCurrent(attempt)) return;
      if (this.connection !== connection || this.process !== proc)
        throw new Error("Language server failed to initialize.");
      await connection.sendRequest("initialize", {
        processId: process.pid,
        rootUri,
        capabilities: {
          textDocument: {
            synchronization: {
              dynamicRegistration: false,
              willSave: false,
              willSaveWaitUntil: false,
              didSave: true,
            },
            completion: {
              dynamicRegistration: false,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ["markdown", "plaintext"],
                deprecatedSupport: true,
                preselectSupport: true,
                labelDetailsSupport: true,
              },
              contextSupport: true,
            },
            hover: {
              dynamicRegistration: false,
              contentFormat: ["markdown", "plaintext"],
            },
            signatureHelp: {
              dynamicRegistration: false,
              signatureInformation: {
                documentationFormat: ["markdown", "plaintext"],
                parameterInformation: { labelOffsetSupport: true },
              },
            },
            definition: { dynamicRegistration: false },
            references: { dynamicRegistration: false },
            publishDiagnostics: {
              relatedInformation: true,
              tagSupport: { valueSet: [1, 2] },
            },
          },
          workspace: {
            workspaceFolders: true,
          },
        },
        workspaceFolders: [
          {
            uri: rootUri,
            name: rootName,
          },
        ],
        ...(this.config.initializationOptions
          ? { initializationOptions: this.config.initializationOptions }
          : {}),
      });

      if (!this.isCurrent(attempt)) return;
      if (this.connection !== connection || this.process !== proc)
        throw new Error("Language server failed to initialize.");
      await connection.sendNotification("initialized", {});
      if (!this.isCurrent(attempt)) return;
      if (this.connection !== connection || this.process !== proc)
        throw new Error("Language server failed to initialize.");
      attempt.ready = true;
      this.failureReported = false;
      this.onStatus("ready");
    } catch (error) {
      if (!this.isCurrent(attempt)) return;
      this.handleInitializationFailure(error);
    }
  }

  private releaseConnection(attempt: StartupAttempt): void {
    const connection = attempt.connection;
    attempt.connection = null;
    if (this.connection === connection) this.connection = null;
    try {
      connection?.dispose();
    } catch {
      /* Preserve teardown of the backing process. */
    }
  }

  private releaseProcess(attempt: StartupAttempt): void {
    attempt.removeExitListener?.();
    delete attempt.removeExitListener;
    const proc = attempt.process;
    attempt.process = null;
    if (this.process === proc) this.process = null;
    if (proc) terminateChildProcessTree(proc);
  }

  private releaseAttempt(attempt: StartupAttempt): void {
    attempt.cancellation.abort();
    this.releaseConnection(attempt);
    this.releaseProcess(attempt);
  }

  private processExited(attempt: StartupAttempt, proc: ChildProcess, code: number | null): void {
    if (!this.isCurrent(attempt) || this.process !== proc) return;
    attempt.removeExitListener?.();
    delete attempt.removeExitListener;
    attempt.process = null;
    this.process = null;
    this.releaseConnection(attempt);
    if (!attempt.ready) return;

    this.attempt = null;
    this.startup = null;
    attempt.cancellation.abort();
    if (code === 0) {
      this.onStatus("stopped");
      return;
    }
    console.warn(`[LSP ${this.sessionId}] Server exited with code ${code}`);
    this.reportFailure("Language server process exited unexpectedly.");
    if (this.disposed) return;
    if (this.restartCount >= 3) {
      this.onStatus("error", "Language server crashed too many times");
      return;
    }
    this.restartCount++;
    this.onStatus("starting");
    if (this.disposed) return;
    const delay = Math.min(1000 * 2 ** this.restartCount, 10000);
    const timer = setTimeout(() => {
      if (this.restartTimer !== timer) return;
      this.restartTimer = null;
      if (this.disposed || this.attempt) return;
      const startup = this.start();
      const restarted = this.attempt;
      void startup.catch((error: unknown) => {
        if (!this.disposed && (!this.attempt || this.attempt === restarted))
          this.onStatus("error", error instanceof Error ? error.message : String(error));
      });
    }, delay);
    this.restartTimer = timer;
  }

  /** Status alone can outlive a closed transport; callers must check the live connection. */
  isReady(): boolean {
    return !this.disposed && this.attempt?.ready === true && this.connection !== null;
  }

  /** Forward a raw JSON-RPC message from the renderer to the language server. */
  async sendMessage(message: unknown): Promise<unknown> {
    const connection = this.connection;
    if (!connection) return undefined;

    const msg = message as { method?: string; id?: number | string; params?: unknown };
    if (!msg.method) return undefined;

    if (msg.id !== undefined) {
      // It's a request — send and return the response
      try {
        const result = await connection.sendRequest(msg.method, msg.params);
        return this.disposed || this.connection !== connection ? undefined : result;
      } catch (error) {
        if (this.disposed || this.connection !== connection) return undefined;
        throw error;
      }
    }
    // It's a notification — fire and forget
    try {
      await connection.sendNotification(msg.method, msg.params);
    } catch (error) {
      if (this.disposed || this.connection !== connection) return undefined;
      throw error;
    }
    return undefined;
  }

  private reportFailure(message: string): void {
    if (this.failureReported) return;
    this.failureReported = true;
    captureSupervisorException(new Error(message), {
      "poracode.feature_area": "language-server",
      "poracode.runtime_kind": "structured",
    });
  }

  private handleInitializationFailure(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    this.onStatus("error", message);
    this.dispose(false);
    // The synchronous start request owns this failure at the supervisor IPC
    // boundary. Keep the rejection privacy-safe and do not self-capture here.
    throw new Error("Language server failed to initialize.");
  }

  dispose(emitStopped = true): void {
    if (this.disposed) return;
    this.disposed = true;
    const attempt = this.attempt;
    this.attempt = null;
    this.startup = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (attempt) this.releaseAttempt(attempt);
    if (emitStopped) {
      this.onStatus("stopped");
    }
  }
}
