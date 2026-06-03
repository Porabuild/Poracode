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
import { buildAgentCommand, primeProjectShellEnv } from "../agents/base";
import type { LanguageServerConfig } from "./serverRegistry";

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

  constructor(
    readonly sessionId: string,
    private readonly config: LanguageServerConfig,
    private readonly projectLocation: ProjectLocation,
    private readonly onMessage: (message: unknown) => void,
    private readonly onStatus: (status: LspSessionStatus, error?: string) => void,
  ) {}

  async start(): Promise<void> {
    if (this.disposed) return;
    this.onStatus("starting");

    const projectRoot =
      this.projectLocation.kind === "ssh"
        ? this.projectLocation.path
        : getProjectFsPath(this.projectLocation);
    // Prime the user's interactive-shell env so node-based language servers
    // (typescript-language-server, vscode-eslint, etc.) launch with the
    // project-pinned node from fnm/asdf/mise rather than launchd's PATH.
    if (this.projectLocation.kind === "posix") {
      await primeProjectShellEnv(this.projectLocation.path);
    }
    let spawned = false;

    for (const candidate of this.config.commands) {
      try {
        const command =
          this.projectLocation.kind === "wsl"
            ? resolveWslCommand(candidate.command, this.projectLocation.linuxPath)
            : this.projectLocation.kind === "ssh"
              ? resolveWslCommand(candidate.command, this.projectLocation.path)
              : resolveNativeCommand(candidate.command, projectRoot);
        const spec = buildAgentCommand(this.projectLocation, command, candidate.args);
        const proc = spawn(spec.command, spec.args, {
          ...(spec.cwd ? { cwd: spec.cwd } : {}),
          ...(spec.env ? { env: { ...process.env, ...spec.env } } : {}),
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });

        // Wait briefly to see if the process crashes immediately
        const earlyExit = await Promise.race([
          new Promise<boolean>((res) => {
            proc.on("error", () => res(true));
            proc.on("exit", () => res(true));
          }),
          new Promise<boolean>((res) => setTimeout(() => res(false), 200)),
        ]);

        if (earlyExit) {
          terminateChildProcessTree(proc);
          continue;
        }

        this.process = proc;
        spawned = true;
        break;
      } catch {
        continue;
      }
    }

    if (!spawned || !this.process?.stdout || !this.process?.stdin) {
      const message = `No language server found for "${this.config.languageId}". Install one of: ${this.config.commands.map((c) => c.command).join(", ")}`;
      this.onStatus("error", message);
      throw new Error(message);
    }

    // Set up JSON-RPC connection over stdio
    const connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin),
    );

    // Forward all messages from server to renderer
    connection.onNotification((method, params) => {
      this.onMessage({
        jsonrpc: "2.0",
        method,
        params,
      });
    });

    const rootUri = createLspRootUri(this.projectLocation);
    const rootName =
      this.projectLocation.kind === "wsl"
        ? this.projectLocation.linuxPath
        : this.projectLocation.path;

    connection.onRequest((method) => {
      switch (method) {
        case "workspace/configuration":
          return [];
        case "workspace/workspaceFolders":
          return [{ uri: rootUri, name: rootName }];
        case "client/registerCapability":
        case "client/unregisterCapability":
        case "window/showMessageRequest":
          return null;
        default:
          return null;
      }
    });

    connection.onError(([error]) => {
      console.error(`[LSP ${this.sessionId}] Connection error:`, error);
    });

    connection.listen();
    this.connection = connection;

    // Send LSP initialize request
    try {
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

      connection.sendNotification("initialized", {});
      this.onStatus("ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.onStatus("error", message);
      this.dispose();
      throw new Error(message, { cause: error });
    }

    // Handle process exit — attempt restart
    this.process.on("exit", (code) => {
      if (this.disposed) return;
      console.warn(`[LSP ${this.sessionId}] Server exited with code ${code}`);
      this.connection = null;
      this.process = null;

      if (this.restartCount < 3) {
        this.restartCount++;
        const delay = Math.min(1000 * 2 ** this.restartCount, 10000);
        setTimeout(() => {
          if (!this.disposed) {
            void this.start().catch((error: unknown) => {
              this.onStatus("error", error instanceof Error ? error.message : String(error));
            });
          }
        }, delay);
      } else {
        this.onStatus("error", "Language server crashed too many times");
      }
    });
  }

  /** Forward a raw JSON-RPC message from the renderer to the language server. */
  async sendMessage(message: unknown): Promise<unknown> {
    if (!this.connection) return undefined;

    const msg = message as { method?: string; id?: number | string; params?: unknown };
    if (!msg.method) return undefined;

    if (msg.id !== undefined) {
      // It's a request — send and return the response
      return this.connection.sendRequest(msg.method, msg.params);
    }
    // It's a notification — fire and forget
    this.connection.sendNotification(msg.method, msg.params);
    return undefined;
  }

  dispose(): void {
    this.disposed = true;
    if (this.connection) {
      try {
        this.connection.dispose();
      } catch {
        // Ignore disposal errors while tearing down the backing process.
      }
      this.connection = null;
    }
    if (this.process) {
      terminateChildProcessTree(this.process);
      this.process = null;
    }
    this.onStatus("stopped");
  }
}
