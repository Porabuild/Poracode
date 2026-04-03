/**
 * ACP (Agent Client Protocol) structured session.
 *
 * Uses the official @agentclientprotocol/sdk to communicate with any
 * ACP-compatible agent CLI (e.g. `gemini --acp`) over stdio.
 *
 * Implements `StructuredSessionHandle` so the supervisor runtime drives
 * its lifecycle identically to the Codex WebSocket session — no runtime
 * changes required.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type ContentBlock,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type SessionUpdate,
} from "@agentclientprotocol/sdk";
import type {
  ProjectLocation,
  PromptSegment,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
} from "../../../shared/contracts";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type CommandSpec,
  type CreateStructuredSessionInput,
  type StructuredSessionHandle,
  type StructuredSessionListener,
} from "../base";

// ── Helpers ──────────────────────────────────────────────────────

function resolveCwd(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return location.path;
    case "wsl":
      return location.linuxPath;
    case "posix":
      return location.path;
  }
}

/**
 * Convert Lightcode `PromptSegment[]` + prompt text into ACP `ContentBlock[]`.
 */
async function segmentsToContentBlocks(
  prompt: string,
  segments?: PromptSegment[],
): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];

  for (const seg of segments ?? []) {
    if (seg.kind === "attachment") {
      const isImage = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(seg.path);
      if (isImage) {
        try {
          const data = await readFile(seg.path);
          const mimeType = seg.mimeType ?? guessMimeType(seg.path);
          blocks.push({ type: "image", data: data.toString("base64"), mimeType });
        } catch {
          // Fall back to resource link if image can't be read
          blocks.push({
            type: "resource_link",
            uri: `file://${seg.path}`,
            name: basename(seg.path),
            ...(seg.mimeType ? { mimeType: seg.mimeType } : {}),
          });
        }
      } else {
        blocks.push({
          type: "resource_link",
          uri: `file://${seg.path}`,
          name: basename(seg.path),
          ...(seg.mimeType ? { mimeType: seg.mimeType } : {}),
        });
      }
    } else if (seg.kind === "file") {
      blocks.push({
        type: "resource_link",
        uri: `file://${seg.path}`,
        name: basename(seg.path),
      });
    }
  }

  if (prompt.trim().length > 0) {
    blocks.push({ type: "text", text: prompt });
  }

  return blocks;
}

function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

/**
 * Resolve the ACP mode ID from Lightcode's ThreadConfig.
 *
 * Different agents expose different mode IDs:
 *   Gemini:  "default", "autoEdit", "yolo", "plan"
 *   Generic: "code", "architect", "ask"
 *
 * We pick the best match from the agent's advertised available modes.
 */
function resolveAcpMode(config: ThreadConfig, availableModeIds: string[]): string | undefined {
  const available = new Set(availableModeIds);

  if (config.mode === "plan") {
    // Plan mode: prefer "plan", fall back to "architect"
    if (available.has("plan")) return "plan";
    if (available.has("architect")) return "architect";
    return undefined;
  }

  // Agent mode: pick based on approval policy
  if (config.approvalPolicy === "never") {
    if (available.has("yolo")) return "yolo";
  }
  if (config.approvalPolicy === "auto_edit") {
    if (available.has("autoEdit")) return "autoEdit";
  }

  // Default agent mode
  if (available.has("default")) return "default";
  if (available.has("code")) return "code";

  return undefined;
}

// ── Session ──────────────────────────────────────────────────────

export class AcpStructuredSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private readonly child: ChildProcess;
  private readonly connection: ClientSideConnection;
  private readonly cwd: string;
  private readonly stderrChunks: string[] = [];
  private listener: StructuredSessionListener | undefined;
  private sessionId: string | undefined;
  private isDisposed = false;

  private constructor(child: ChildProcess, connection: ClientSideConnection, cwd: string) {
    this.child = child;
    this.connection = connection;
    this.cwd = cwd;
    this.launchOptions = {};
  }

  /**
   * Spawn the ACP agent process and create a session handle.
   *
   * The `command` should launch the CLI in ACP mode (e.g. `gemini --acp`).
   * The SDK communicates over stdin/stdout using newline-delimited JSON.
   */
  static create(command: CommandSpec, projectLocation: ProjectLocation): AcpStructuredSession {
    const cwd = resolveCwd(projectLocation);

    const child = spawn(command.command, command.args, {
      cwd: command.cwd ?? cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, TERM: "xterm-256color" },
      shell: false,
      windowsHide: true,
    });

    // Collect stderr for error diagnostics
    const stderrChunks: string[] = [];
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      console.log("[acp stderr]", text.trimEnd());
      stderrChunks.push(text);
      if (stderrChunks.length > 20) stderrChunks.shift();
    });

    // Wrap Node.js streams into Web Streams for the ACP SDK.
    // The Node.js → Web Stream adapters produce compatible types but
    // tsgo's strict generics require explicit casts.
    const toAgent = Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>;
    const fromAgent = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(toAgent, fromAgent);

    let session: AcpStructuredSession;

    const connection = new ClientSideConnection(
      (_agent): Client => ({
        requestPermission(params: RequestPermissionRequest) {
          return session.handlePermissionRequest(params);
        },
        sessionUpdate(params: SessionNotification) {
          session.handleSessionUpdate(params);
          return Promise.resolve();
        },
        async readTextFile(params) {
          try {
            const { readFile: readFileAsync } = await import("node:fs/promises");
            const content = await readFileAsync(params.path, "utf8");
            return { content };
          } catch {
            throw new Error(`File not found: ${params.path}`);
          }
        },
        async writeTextFile(params) {
          const { writeFile: fsWriteFile } = await import("node:fs/promises");
          await fsWriteFile(params.path, params.content, "utf8");
          return {};
        },
      }),
      stream,
    );

    session = new AcpStructuredSession(child, connection, cwd);
    session.stderrChunks.push(...stderrChunks);

    // Handle connection close
    void connection.closed.then(() => {
      if (!session.isDisposed) {
        session.listener?.onClose();
      }
    });

    child.once("exit", (code) => {
      console.log(`[acp] process exited with code ${code}`);
      if (!session.isDisposed) {
        session.listener?.onClose();
      }
    });

    return session;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;

    // Re-emit current state for late listeners
    if (this.sessionId) {
      listener.onUpdate({
        status: "idle",
        attention: "none",
        sessionRef: createKnownSessionRef(this.sessionId),
      });
    }
  }

  /**
   * Phase 1: Initialize the ACP protocol handshake.
   */
  async activate(): Promise<void> {
    if (this.isDisposed) {
      throw new Error("ACP session was disposed before activation.");
    }

    console.log("[acp] sending initialize...");
    const initResult = await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "lightcode", version: "0.1.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });
    console.log(
      "[acp] initialized — protocol v%d, agent: %s",
      initResult.protocolVersion,
      initResult.agentInfo?.name ?? "unknown",
    );

    // Handle authentication if required
    const authMethods = initResult.authMethods;
    if (authMethods && authMethods.length > 0) {
      const firstMethod = authMethods[0]!;
      const methodId = "id" in firstMethod ? (firstMethod as { id: string }).id : undefined;
      if (methodId) {
        console.log("[acp] authenticating with method:", methodId);
        await this.connection.authenticate({ methodId });
        console.log("[acp] authenticated");
      }
    }
  }

  /**
   * Phase 2: Create or resume an ACP session.
   *
   * The agent's response includes its available modes and models.
   * We store them to map Lightcode's `ThreadConfig` to the correct
   * ACP mode/model IDs (which vary per agent).
   */
  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    let availableModeIds: string[] = [];

    if (sessionRef) {
      console.log("[acp] loading session:", sessionRef.providerSessionId);
      const result = await this.connection.loadSession({
        sessionId: sessionRef.providerSessionId,
        cwd: this.cwd,
        mcpServers: [],
      });
      this.sessionId = sessionRef.providerSessionId;
      availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
    } else {
      console.log("[acp] creating new session in", this.cwd);
      const result = await this.connection.newSession({
        cwd: this.cwd,
        mcpServers: [],
      });
      this.sessionId = result.sessionId;
      availableModeIds = result.modes?.availableModes?.map((m) => m.id) ?? [];
      console.log("[acp] session created:", this.sessionId, "modes:", availableModeIds);
    }

    // Apply session mode. Agents use different mode IDs:
    //   Gemini: "default", "autoEdit", "yolo", "plan"
    //   Generic ACP: "code", "architect", "ask"
    // We try to find the best match from the agent's available modes.
    if (this.sessionId) {
      const modeId = resolveAcpMode(config, availableModeIds);
      if (modeId) {
        try {
          await this.connection.setSessionMode({ sessionId: this.sessionId, modeId });
          console.log("[acp] mode set to:", modeId);
        } catch {
          // Agent may reject the mode change — that's fine
        }
      }
    }

    // Set model via unstable setSessionModel if the agent supports it
    if (config.model && this.sessionId) {
      try {
        await this.connection.unstable_setSessionModel({
          sessionId: this.sessionId,
          modelId: config.model,
        });
        console.log("[acp] model set to:", config.model);
      } catch {
        // Agent may not support setSessionModel — that's fine
      }
    }

    this.launchOptions = { resumeThreadId: this.sessionId };
    return this.sessionId!;
  }

  /**
   * Phase 3: Send a prompt to the agent.
   *
   * `prompt()` is async and resolves when the turn completes (the agent
   * returns a `stopReason`). During the turn, `session/update` notifications
   * flow through `handleSessionUpdate` which emits status updates.
   */
  async startTurn(prompt: string, config: ThreadConfig, segments?: PromptSegment[]): Promise<void> {
    if (!this.sessionId) {
      throw new Error("ACP session not opened yet.");
    }

    const contentBlocks = await segmentsToContentBlocks(prompt, segments);

    // Signal working state immediately
    this.listener?.onUpdate({ status: "working", attention: "working" });

    try {
      const result = await this.connection.prompt({
        sessionId: this.sessionId,
        prompt: contentBlocks,
      });

      // Map stopReason to Lightcode status
      const { status, attention } = this.mapStopReason(result.stopReason);
      this.listener?.onUpdate({ status, attention });
    } catch (error) {
      if (this.isDisposed) return;
      const message = error instanceof Error ? error.message : String(error);
      this.listener?.onUpdate({ status: "error", attention: "error", errorMessage: message });
    }
  }

  /**
   * Respond to a permission request from the agent.
   */
  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    // The permission response is stored and resolved by the pending promise
    // in handlePermissionRequest. The runtime calls this with the user's
    // chosen option.
    const resolver = this.pendingPermissionResolvers.get(requestId);
    if (resolver) {
      this.pendingPermissionResolvers.delete(requestId);
      resolver(response);
    }
  }

  async dispose(): Promise<void> {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Reject pending permission requests
    for (const [, resolver] of this.pendingPermissionResolvers) {
      resolver({ outcome: { outcome: "cancelled" } });
    }
    this.pendingPermissionResolvers.clear();

    // Don't send cancel — the ACP process may not be generating,
    // and the connection may already be closing. Just kill the process.

    if (!this.child.killed) {
      this.child.kill();
    }
  }

  // ── Resume artifacts ──────────────────────────────────────────

  /**
   * Wait for the session file to appear on disk.
   *
   * Called by the runtime AFTER `startTurn` fires the initial prompt.
   * Gemini's ACP mode persists the session to disk during prompt processing.
   * The TUI needs this file to exist before `--resume <id>` will work.
   *
   * Polls `~/.gemini/tmp/<project>/chats/` for a file containing the session UUID.
   */
  async ensureResumeArtifacts(): Promise<void> {
    if (!this.sessionId) return;

    const projectName = basename(this.cwd);
    const chatsDir = join(homedir(), ".gemini", "tmp", projectName, "chats");
    const uuid8 = this.sessionId.split("-")[0] ?? this.sessionId.slice(0, 8);

    console.log("[acp] waiting for session file (uuid prefix: %s)...", uuid8);

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(chatsDir);
        const match = files.find((f) => f.includes(uuid8) && f.endsWith(".json"));
        if (match) {
          console.log("[acp] session file found:", join(chatsDir, match));
          return;
        }
      } catch {
        // Directory may not exist yet
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    console.log("[acp] session file not found after timeout, proceeding anyway");
  }

  // ── Internal handlers ────────────────────────────────────────

  private readonly pendingPermissionResolvers = new Map<
    ThreadServerRequestId,
    (response: unknown) => void
  >();

  private permissionRequestSeq = 0;

  /**
   * Handle `requestPermission` calls from the agent.
   *
   * Maps ACP permission requests to Lightcode's `ThreadServerRequest` system.
   * The agent blocks until we respond — we create a pending promise and emit
   * the request to the UI via the listener.
   */
  private handlePermissionRequest(
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    return new Promise<RequestPermissionResponse>((resolve) => {
      const requestId = `acp-perm-${this.permissionRequestSeq++}`;

      this.pendingPermissionResolvers.set(requestId, (response: unknown) => {
        const resp = response as { optionId?: string } | undefined;
        if (resp?.optionId) {
          resolve({ outcome: { outcome: "selected", optionId: resp.optionId } });
        } else {
          resolve({ outcome: { outcome: "cancelled" } });
        }
      });

      // Emit as a server request so ThreadServerRequestPanel renders it
      this.listener?.onServerRequest({
        requestId,
        method: "requestPermission",
        params: {
          toolCall: params.toolCall,
          options: params.options,
        },
      });

      // Also signal that the thread needs approval
      this.listener?.onUpdate({ status: "needs_approval", attention: "needs_approval" });
    });
  }

  /**
   * Handle `session/update` notifications from the agent.
   *
   * These are the real-time updates the agent sends while processing
   * a turn: text chunks, tool calls, plan updates, etc.
   */
  private handleSessionUpdate(params: SessionNotification): void {
    const update: SessionUpdate = params.update;

    switch (update.sessionUpdate) {
      case "agent_message_chunk":
      case "agent_thought_chunk":
      case "user_message_chunk":
        // Agent is producing output — stay in "working" state
        break;

      case "tool_call":
        // Agent started a tool call — working state
        this.listener?.onUpdate({ status: "working", attention: "working" });
        break;

      case "tool_call_update":
        // Tool call status changed — still working
        break;

      case "plan":
        // Agent shared its plan — working state
        break;

      case "current_mode_update":
        // Agent switched modes — could map to config sync
        break;

      case "config_option_update":
        // Config changed on the agent side
        break;

      case "session_info_update": {
        // Session metadata (title) updated — emit with sessionRef
        const infoUpdate = update as { title?: string };
        if (infoUpdate.title && this.sessionId) {
          this.listener?.onUpdate({
            status: "working",
            attention: "working",
            sessionRef: createKnownSessionRef(this.sessionId),
          });
        }
        break;
      }

      default:
        break;
    }
  }

  private mapStopReason(stopReason: string): { status: ThreadStatus; attention: ThreadAttention } {
    switch (stopReason) {
      case "end_turn":
      case "cancelled":
        return { status: "idle", attention: "none" };
      case "max_tokens":
      case "max_turn_requests":
      case "refusal":
        return { status: "error", attention: "error" };
      default:
        return { status: "idle", attention: "none" };
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────

/**
 * Create an ACP structured session for the given adapter command.
 *
 * Agent adapters call this from their `createStructuredSession()` method,
 * passing the ACP-mode command (e.g. `gemini --acp`).
 */
export function createAcpStructuredSession(
  acpCommand: CommandSpec,
  input: CreateStructuredSessionInput,
): AcpStructuredSession {
  return AcpStructuredSession.create(acpCommand, input.projectLocation);
}
