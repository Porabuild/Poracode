/**
 * OpenCode SDK structured session.
 *
 * One class powers two flows:
 *  - **Terminal mode** (default): the runtime calls `activate` → `openThread`
 *    to allocate a session id from the live `opencode serve` instance, then
 *    immediately disposes (`liveInputMode === "terminal"`). The TUI launches
 *    with `--session <id>` and resumes from SQLite — same observable
 *    behaviour as the previous `opencode acp` ephemeral allocation, but over
 *    HTTP+SDK so we share infrastructure with the GUI flow.
 *  - **GUI mode**: same `activate`/`openThread` but the session stays alive
 *    for the thread's lifetime. SSE subscription routes OpenCode events
 *    through `sdkCanonicalMapping` → renderer chat items. `startTurn` calls
 *    `session.promptAsync`; `interruptTurn` calls `session.abort`.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { posix, win32 } from "node:path";
import type { Event, PermissionRule } from "@opencode-ai/sdk/v2";
import type {
  AgentSlashCommand,
  ProjectLocation,
  PromptSegment,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
} from "@/shared/contracts";
import { areAgentSlashCommandsEqual } from "@/shared/contracts";
import { isOpenCodeBrowserMcpEnabled } from "@/shared/opencodeSettings";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type ThreadHistory,
  type ThreadHistoryEntry,
} from "../base";
import { chosenOptionIds } from "../questionAnswers";
import {
  buildQuestionAnswerEvents,
  type QuestionAnswerSourceQuestion,
} from "../questionAnswerEvents";
import { mapOpenCodeSlashCommands } from "./detection";
import {
  classifyOpenCodeError,
  isOpenCodeConnectionLoss,
  readOpenCodeErrorText,
} from "./opencodeErrors";
import { buildOpenCodePermissionRules } from "./permissionRules";
import { syncOpenCodeBrowserMcpConfigFile } from "./plugin/install";
import {
  acquireOpenCodeServer,
  resolveOpenCodeSessionDirectory,
  type AcquiredOpenCodeServer,
  type AcquireOpenCodeServerInput,
} from "./sdkClient";
import {
  closeOpenItems,
  createOpenCodeMapperState,
  isOpenCodeChildSession,
  mapOpenCodeEvent,
  setOpenCodeMainSessionId,
  type OpenCodeMapperState,
} from "./sdkCanonicalMapping";

interface PendingPermission {
  kind: "permission";
  requestID: string;
  sessionID: string;
}

interface PendingQuestion {
  kind: "question";
  requestID: string;
  answerKeys: OpenCodeQuestionAnswerContext["answerKeys"];
  optionValues: OpenCodeQuestionAnswerContext["optionValues"];
  sourceQuestions: QuestionAnswerSourceQuestion[];
}

type PendingRequest = PendingPermission | PendingQuestion;

export interface OpenCodeQuestionAnswerContext {
  answerKeys: string[];
  optionValues: Record<string, string>;
}

type OpenCodePromptPart =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; filename?: string; url: string };

const OCTET_STREAM_MIME = "application/octet-stream";
const FALLBACK_TEXT_FILE_MAX_BYTES = 128 * 1024;

const TEXT_FILE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "cxx",
  "diff",
  "env",
  "go",
  "graphql",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "log",
  "lua",
  "mjs",
  "patch",
  "php",
  "ps1",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svelte",
  "swift",
  "toml",
  "ts",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

function encodePosixFileUrl(path: string): string {
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}

function resolveAbsolutePath(location: ProjectLocation, segmentPath: string): string {
  if (location.kind === "wsl") {
    // Segments arrive as host (Windows) UNC paths or already-Linux paths.
    // OpenCode runs inside the distro, so we must hand it a Linux path.
    if (/^\/\//.test(segmentPath) || /^\\\\/.test(segmentPath)) {
      // UNC share like \\wsl$\Ubuntu\home\... → strip the prefix.
      const unc = segmentPath.replace(/\\/g, "/");
      const m = unc.match(/^\/\/wsl(?:\$|\.localhost)\/[^/]+(\/.*)$/i);
      if (m && m[1]) return m[1];
    }
    return posix.isAbsolute(segmentPath)
      ? segmentPath
      : posix.join(location.linuxPath, segmentPath);
  }
  if (location.kind === "windows") {
    return win32.isAbsolute(segmentPath) ? segmentPath : win32.join(location.path, segmentPath);
  }
  if (!posix.isAbsolute(segmentPath)) return posix.join(location.path, segmentPath);
  return segmentPath;
}

function fileUrlForPath(location: ProjectLocation, path: string): string {
  if (location.kind === "windows") return pathToFileURL(path).href;
  return encodePosixFileUrl(path);
}

function inferMimeFromPath(path: string): string {
  const ext = path
    .split(/[\\/.]/)
    .pop()
    ?.toLowerCase();
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
    case "pdf":
      return "application/pdf";
    case "md":
    case "markdown":
    case "json":
      return "text/plain";
    default:
      return ext && TEXT_FILE_EXTENSIONS.has(ext) ? "text/plain" : OCTET_STREAM_MIME;
  }
}

function mimeForSegment(seg: PromptSegment, absolutePath: string): string {
  const inferred = inferMimeFromPath(absolutePath);
  const mime =
    seg.kind === "attachment" && seg.mimeType && seg.mimeType !== OCTET_STREAM_MIME
      ? seg.mimeType
      : inferred;
  if (mime.startsWith("text/") || mime === "application/json") return "text/plain";
  return mime;
}

function shouldSendFilePart(mime: string): boolean {
  if (mime === OCTET_STREAM_MIME) return false;
  return (
    mime.startsWith("image/") ||
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/pdf"
  );
}

function hasFilePart(parts: OpenCodePromptPart[]): boolean {
  return parts.some((part) => part.type === "file");
}

function shouldRetryWithTextFallback(cause: unknown, parts: OpenCodePromptPart[]): boolean {
  if (!hasFilePart(parts)) return false;
  const text = readOpenCodeErrorText(cause);
  return /file part media type/.test(text) && /not supported|functionality/.test(text);
}

async function filePartToFallbackText(
  part: Extract<OpenCodePromptPart, { type: "file" }>,
): Promise<string> {
  const name = part.filename ?? part.url;
  if (!part.url.startsWith("file:")) return `Attached file could not be sent: ${name}`;

  try {
    let path: string;
    try {
      path = fileURLToPath(part.url);
    } catch {
      path = decodeURIComponent(new URL(part.url).pathname);
    }
    if (part.mime !== "text/plain") return `Attached file could not be sent: ${path}`;

    const data = await readFile(path);
    const truncated = data.byteLength > FALLBACK_TEXT_FILE_MAX_BYTES;
    const content = data.subarray(0, FALLBACK_TEXT_FILE_MAX_BYTES).toString("utf8");
    const suffix = truncated ? "\n\n[File truncated during attachment fallback.]" : "";
    return `Attached file: ${path}\n\n${content}${suffix}`;
  } catch {
    return `Attached file could not be read during fallback: ${name}`;
  }
}

async function buildTextFallbackParts(parts: OpenCodePromptPart[]): Promise<OpenCodePromptPart[]> {
  const fallback: OpenCodePromptPart[] = [];
  for (const part of parts) {
    if (part.type === "text") {
      fallback.push(part);
      continue;
    }
    fallback.push({ type: "text", text: await filePartToFallbackText(part) });
  }
  return fallback;
}

function segmentsToParts(
  prompt: string,
  segments: PromptSegment[] | undefined,
  location: ProjectLocation,
): OpenCodePromptPart[] {
  const parts: OpenCodePromptPart[] = [];

  if (segments && segments.length > 0) {
    for (const seg of segments) {
      if (seg.kind === "text") {
        if (seg.content.length > 0) parts.push({ type: "text", text: seg.content });
        continue;
      }
      const absolute = resolveAbsolutePath(location, seg.path);
      const url = fileUrlForPath(location, absolute);
      const mime = mimeForSegment(seg, absolute);
      if (!shouldSendFilePart(mime)) {
        parts.push({ type: "text", text: `@${absolute}` });
        continue;
      }
      const filename = absolute.split(/[\\/]/).pop();
      parts.push({
        type: "file",
        mime,
        ...(filename ? { filename } : {}),
        url,
      });
    }
  } else if (prompt.trim().length > 0) {
    parts.push({ type: "text", text: prompt });
  }

  return parts;
}

function parseModelSlug(
  modelSlug: string | undefined,
): { providerID: string; modelID: string } | undefined {
  if (!modelSlug) return undefined;
  const slash = modelSlug.indexOf("/");
  if (slash <= 0) return undefined;
  return {
    providerID: modelSlug.slice(0, slash),
    modelID: modelSlug.slice(slash + 1),
  };
}

function mapStatusUpdate(properties: { sessionID: string; status: { type: string } }): {
  status: ThreadStatus;
  attention: ThreadAttention;
} {
  switch (properties.status.type) {
    case "busy":
      return { status: "working", attention: "working" };
    case "idle":
      return { status: "idle", attention: "none" };
    case "retry":
      return { status: "working", attention: "working" };
    default:
      return { status: "idle", attention: "none" };
  }
}

function unwrapGlobalOpenCodeEvent(raw: unknown): Event | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const payload = (raw as { payload?: unknown }).payload;
  const event = payload && typeof payload === "object" ? payload : raw;
  const type = (event as { type?: unknown }).type;
  if (typeof type !== "string" || type === "sync") return undefined;
  return event as Event;
}

export class OpencodeSdkSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private readonly input: CreateStructuredSessionInput;
  private readonly threadId: string;
  private readonly isGui: boolean;
  private readonly sdkDirectory: string;
  private listener: StructuredSessionListener | undefined;
  private acquired: AcquiredOpenCodeServer | undefined;
  private sessionId: string | undefined;
  private sseAbort: AbortController | undefined;
  private mapperState: OpenCodeMapperState | undefined;
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private currentConfig: ThreadConfig | undefined;
  private appliedPermissionSyncKey: string | undefined;
  private sessionHasPermissionOverride = false;
  private activated = false;
  private disposed = false;
  private pendingRequests = new Map<ThreadServerRequestId, PendingRequest>();
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private browserMcpEnabled = false;
  private computerUseMcpEnabled = false;

  private constructor(input: CreateStructuredSessionInput) {
    this.input = input;
    this.threadId = input.threadId;
    this.isGui = input.presentationMode === "gui";
    this.sdkDirectory = resolveOpenCodeSessionDirectory(input.projectLocation);
    this.currentConfig = input.config;
    this.launchOptions = { suppressResumeConfigOverrides: true };
  }

  static create(input: CreateStructuredSessionInput): Promise<OpencodeSdkSession> {
    return Promise.resolve(new OpencodeSdkSession(input));
  }

  private rememberSessionId(id: string): void {
    this.sessionId = id;
    this.launchOptions = { ...this.launchOptions, resumeThreadId: id };
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    if (this.bufferedRuntimeEvents.length > 0 && listener.onRuntimeEvent) {
      const drain = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const ev of drain) listener.onRuntimeEvent(ev);
    }
    if (this.sessionId) {
      listener.onUpdate({
        status: "idle",
        attention: "none",
        sessionRef: createKnownSessionRef(this.sessionId),
        ...(this.currentSlashCommands !== undefined
          ? { slashCommands: this.currentSlashCommands }
          : {}),
      });
    } else if (this.currentSlashCommands !== undefined) {
      listener.onUpdate({
        status: "idle",
        attention: "none",
        slashCommands: this.currentSlashCommands,
      });
    }
  }

  async activate(): Promise<void> {
    if (this.activated) {
      throw new Error("OpencodeSdkSession already activated.");
    }
    if (this.disposed) {
      throw new Error("OpencodeSdkSession was disposed before activation.");
    }
    this.activated = true;

    try {
      this.browserMcpEnabled = isOpenCodeBrowserMcpEnabled(this.input.agentSettings);
      this.computerUseMcpEnabled = this.input.config.computerUse === true;
      syncOpenCodeBrowserMcpConfigFile(
        this.input.projectLocation,
        this.browserMcpEnabled,
        this.input.browserMcp,
        this.computerUseMcpEnabled,
        this.input.computerUseMcp,
      );
      // The subagents MCP is hosted, when opted in, by registering it on a
      // dedicated per-thread server via `mcp.add` (see `acquireOpenCodeServer`)
      // — never through the global config file, whose per-thread token would
      // clobber across launches and misattribute sibling threads' spawns.
      this.acquired = await acquireOpenCodeServer(this.buildAcquireInput());
    } catch (cause) {
      // Surface server-startup failures (sandbox blocks, ENOENT, port races,
      // macOS quarantine) as classified user-facing strings rather than the
      // raw thrown shape. The runtime relays these through `onError`.
      throw new Error(classifyOpenCodeError({ cause, operation: "start opencode serve" }), {
        cause,
      });
    }

    if (this.isGui) {
      this.mapperState = createOpenCodeMapperState(this.threadId);
      this.startEventStream();
    }
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    const acquired = this.requireAcquired();
    this.currentConfig = config;

    if (sessionRef?.providerSessionId) {
      // Resume existing session.
      let existing: Awaited<ReturnType<typeof acquired.client.session.get>>;
      try {
        existing = await acquired.client.session.get({
          directory: this.sdkDirectory,
          sessionID: sessionRef.providerSessionId,
        });
      } catch (cause) {
        throw new Error(classifyOpenCodeError({ cause, operation: "session.get" }), { cause });
      }
      const existingData = existing.data;
      const id = existingData?.id;
      if (!id) throw new Error("opencode session.get returned no id");
      this.rememberSessionId(id);
      this.sessionHasPermissionOverride = existingData.permission !== undefined;
      this.appliedPermissionSyncKey = undefined;
      if (this.mapperState) setOpenCodeMainSessionId(this.mapperState, id);
      await this.refreshSlashCommands();
      return id;
    }

    const permission = buildOpenCodePermissionRules(config.approvalPolicy);
    let created: Awaited<ReturnType<typeof acquired.client.session.create>>;
    try {
      created = await acquired.client.session.create({
        directory: this.sdkDirectory,
        title: `lightcode/${this.threadId.slice(0, 8)}`,
        ...(permission ? { permission } : {}),
      });
    } catch (cause) {
      if (!isOpenCodeConnectionLoss(cause)) {
        throw new Error(this.classifyOpenCodeError(cause, "session.create"), { cause });
      }
      await this.reacquireOpenCodeServer();
      const retryAcquired = this.requireAcquired();
      try {
        created = await retryAcquired.client.session.create({
          directory: this.sdkDirectory,
          title: `lightcode/${this.threadId.slice(0, 8)}`,
          ...(permission ? { permission } : {}),
        });
      } catch (retryCause) {
        throw new Error(this.classifyOpenCodeError(retryCause, "session.create"), {
          cause: retryCause,
        });
      }
    }
    const id = created.data?.id;
    if (!id) throw new Error("opencode session.create returned no id");
    this.rememberSessionId(id);
    this.sessionHasPermissionOverride = permission !== undefined;
    this.appliedPermissionSyncKey = this.permissionSyncKey(config);
    if (this.mapperState) setOpenCodeMainSessionId(this.mapperState, id);
    await this.refreshSlashCommands();
    return id;
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    const acquired = this.requireAcquired();
    const sessionID = this.requireSessionId();
    this.currentConfig = config;

    // Hand the runtime's optimistic user_message id to the mapper so the
    // SDK-side `message.updated` (role=user) reuses it instead of minting a
    // duplicate item id for the same prompt.
    if (options?.userMessageItemId && this.mapperState) {
      this.mapperState.pendingUserMessageItemIds.push(options.userMessageItemId);
    }

    const parts = segmentsToParts(prompt, segments, this.input.projectLocation);
    const model = parseModelSlug(config.model);
    // ThreadConfig.mode is `agent | plan | autopilot`; OpenCode's SDK uses
    // `agent` (e.g. "build", "plan") to switch between the two built-in
    // agents. Map "plan" → "plan"; everything else uses the session default.
    const agent = config.mode === "plan" ? "plan" : undefined;
    // ThreadConfig.effort → OpenCode's `variant` ("provider-specific
    // reasoning effort, e.g., high, max, minimal"). Empty string is treated
    // as "model default", so only forward truthy values.
    const variant = config.effort && config.effort.length > 0 ? config.effort : undefined;

    const sendParts = async (promptParts: OpenCodePromptPart[]): Promise<void> => {
      await acquired.client.session.promptAsync({
        directory: this.sdkDirectory,
        sessionID,
        ...(model ? { model } : {}),
        ...(agent ? { agent } : {}),
        ...(variant ? { variant } : {}),
        ...(promptParts.length > 0 ? { parts: promptParts } : {}),
      });
    };

    try {
      await this.syncSessionPermissions(config);
      try {
        await sendParts(parts);
      } catch (cause) {
        if (!shouldRetryWithTextFallback(cause, parts)) throw cause;
        await sendParts(await buildTextFallbackParts(parts));
      }
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "session.promptAsync" }), {
        cause,
      });
    }
  }

  async interruptTurn(): Promise<void> {
    if (!this.acquired || !this.sessionId) return;
    try {
      await this.acquired.client.session.abort({
        directory: this.sdkDirectory,
        sessionID: this.sessionId,
      });
    } catch {
      // Best-effort — server may already be torn down.
    }
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const acquired = this.requireAcquired();
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    this.pendingRequests.delete(requestId);

    if (pending.kind === "permission") {
      const reply = parsePermissionReply(response);
      try {
        await acquired.client.permission.respond({
          directory: this.sdkDirectory,
          sessionID: pending.sessionID,
          permissionID: pending.requestID,
          response: reply,
        });
      } catch {
        // Server-side may have already received another reply or aborted.
      }
      this.emitUpdateAfterRequestResolution();
      return;
    }

    if (pending.kind === "question") {
      const answers = parseOpenCodeQuestionAnswers(response, pending);
      try {
        if (answers === undefined) {
          await acquired.client.question.reject({
            directory: this.sdkDirectory,
            requestID: pending.requestID,
          });
        } else {
          await acquired.client.question.reply({
            directory: this.sdkDirectory,
            requestID: pending.requestID,
            answers,
          });
        }
      } catch {
        // Same — best-effort reply.
      }
      if (answers !== undefined) {
        this.emitRuntimeEvents(
          buildQuestionAnswerEvents({
            threadId: this.threadId,
            itemId: `opencode-question-answer-${pending.requestID}`,
            questions: pending.sourceQuestions,
            answers: openCodeResponseAnswers(response, pending),
          }),
        );
      }
      this.emitUpdateAfterRequestResolution();
    }
  }

  /**
   * Dump the OpenCode server's view of this thread's messages. Mirrors
   * t3code's `readThread`: `session.messages` returns every message in the
   * session (both roles), each with its parts (text / tool / reasoning) and
   * `info` metadata (token counts, role, time fields). Consumers can replay
   * the result through the canonical mapper, or use it for a "regenerate
   * from turn X" UI.
   */
  async readThread(): Promise<ThreadHistory> {
    const acquired = this.requireAcquired();
    const sessionID = this.requireSessionId();
    let result: Awaited<ReturnType<typeof acquired.client.session.messages>>;
    try {
      result = await acquired.client.session.messages({
        directory: this.sdkDirectory,
        sessionID,
      });
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "session.messages" }), { cause });
    }
    const messages = toThreadHistoryEntries(result.data ?? []);
    return { providerSessionId: sessionID, messages };
  }

  /**
   * Truncate the OpenCode session back to the assistant message that came
   * `numTurns` *assistant turns* before the current head. Counting only
   * assistant messages matches what the UI thinks of as a "turn" — each
   * regenerate / rollback action wipes the last N assistant replies and the
   * user prompts that followed.
   *
   * Returns the post-revert history. The current sessionId stays the same;
   * OpenCode reverts in-place rather than forking.
   */
  async rollbackThread(numTurns: number): Promise<ThreadHistory> {
    if (!Number.isInteger(numTurns) || numTurns < 1) {
      throw new Error(`rollbackThread: numTurns must be a positive integer (got ${numTurns}).`);
    }
    const acquired = this.requireAcquired();
    const sessionID = this.requireSessionId();

    let messagesResult: Awaited<ReturnType<typeof acquired.client.session.messages>>;
    try {
      messagesResult = await acquired.client.session.messages({
        directory: this.sdkDirectory,
        sessionID,
      });
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "session.messages" }), { cause });
    }
    const entries = messagesResult.data ?? [];
    const assistantMessages = entries.filter(
      (entry: { info?: { role?: unknown } }) => entry.info?.role === "assistant",
    );
    // -1 because the *current* head also counts; reverting N turns means we
    // want the assistant message N+1 from the end to become the new head.
    const targetIndex = assistantMessages.length - numTurns - 1;
    const target = targetIndex >= 0 ? assistantMessages[targetIndex] : undefined;
    const targetMessageId =
      target && typeof target.info?.id === "string" ? target.info.id : undefined;

    try {
      await acquired.client.session.revert({
        directory: this.sdkDirectory,
        sessionID,
        ...(targetMessageId ? { messageID: targetMessageId } : {}),
      });
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "session.revert" }), { cause });
    }

    // Mapper state retains items from the pre-revert turns; flush them so any
    // future emit from the new tail doesn't collide with stale ids the
    // renderer no longer cares about. The mapper's text-dedup table is the
    // most likely culprit if we skip this — `emittedText` would refuse to
    // emit identical content the server now re-sends.
    if (this.mapperState) {
      const closing = closeOpenItems(this.mapperState);
      if (this.listener?.onRuntimeEvent) {
        for (const ev of closing) this.listener.onRuntimeEvent(ev);
      } else {
        this.bufferedRuntimeEvents.push(...closing);
      }
    }

    return this.readThread();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    this.sseAbort?.abort();
    this.sseAbort = undefined;

    if (this.mapperState && this.listener?.onRuntimeEvent) {
      const closing = closeOpenItems(this.mapperState);
      for (const ev of closing) this.listener.onRuntimeEvent(ev);
    }

    if (this.acquired) {
      try {
        await this.acquired.dispose();
      } finally {
        this.acquired = undefined;
      }
    }

    this.listener?.onClose();
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private requireAcquired(): AcquiredOpenCodeServer {
    if (this.disposed || !this.acquired) {
      throw new Error("OpencodeSdkSession is not active.");
    }
    return this.acquired;
  }

  private requireSessionId(): string {
    if (!this.sessionId) {
      throw new Error("OpencodeSdkSession.openThread has not completed.");
    }
    return this.sessionId;
  }

  private permissionSyncKey(config: ThreadConfig): string {
    const permission = buildOpenCodePermissionRules(config.approvalPolicy);
    if (permission) return "full-access";
    return `supervised:${config.mode === "plan" ? "plan" : "build"}`;
  }

  private async syncSessionPermissions(config: ThreadConfig): Promise<void> {
    const syncKey = this.permissionSyncKey(config);
    if (this.appliedPermissionSyncKey === syncKey) return;

    const acquired = this.requireAcquired();
    const sessionID = this.requireSessionId();
    const fullAccessPermission = buildOpenCodePermissionRules(config.approvalPolicy);

    if (fullAccessPermission) {
      await this.updateSessionPermission(sessionID, fullAccessPermission);
      this.sessionHasPermissionOverride = true;
      this.appliedPermissionSyncKey = syncKey;
      return;
    }

    if (!this.sessionHasPermissionOverride) {
      // Fresh supervised sessions have no session-level permission override;
      // OpenCode already resolves permissions from its loaded config stack.
      this.appliedPermissionSyncKey = syncKey;
      return;
    }

    let rules: PermissionRule[];
    try {
      const result = await acquired.client.app.agents({ directory: this.sdkDirectory });
      const agents = Array.isArray(result.data) ? result.data : [];
      const agentName = config.mode === "plan" ? "plan" : "build";
      const agent = agents.find((candidate) => candidate.name === agentName);
      if (!agent) throw new Error(`OpenCode agent '${agentName}' was not found.`);
      rules = agent.permission;
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "app.agents" }), { cause });
    }

    await this.updateSessionPermission(sessionID, rules);
    this.sessionHasPermissionOverride = true;
    this.appliedPermissionSyncKey = syncKey;
  }

  private async updateSessionPermission(
    sessionID: string,
    permission: PermissionRule[],
  ): Promise<void> {
    const acquired = this.requireAcquired();
    try {
      await acquired.client.session.update({
        directory: this.sdkDirectory,
        sessionID,
        permission,
      });
    } catch (cause) {
      throw new Error(classifyOpenCodeError({ cause, operation: "session.update" }), { cause });
    }
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    this.listener?.onUpdate({
      status: "idle",
      attention: "none",
      ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
      slashCommands: commands,
    });
  }

  private async refreshSlashCommands(): Promise<void> {
    const acquired = this.requireAcquired();
    try {
      const result = await acquired.client.command.list({ directory: this.sdkDirectory });
      const commands = Array.isArray(result.data) ? mapOpenCodeSlashCommands(result.data) : [];
      this.updateSlashCommands(commands);
    } catch (error) {
      console.log(
        "[opencode] command list probe rejected, continuing: %s",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private sessionRefUpdate(): { sessionRef: SessionRef } | Record<string, never> {
    return this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {};
  }

  private pendingRequestStatus(): { status: ThreadStatus; attention: ThreadAttention } | undefined {
    let hasQuestion = false;
    for (const pending of this.pendingRequests.values()) {
      if (pending.kind === "permission") {
        return { status: "needs_approval", attention: "needs_approval" };
      }
      hasQuestion = true;
    }
    return hasQuestion ? { status: "needs_reply", attention: "needs_reply" } : undefined;
  }

  private emitPendingRequestUpdate(): void {
    const pending = this.pendingRequestStatus();
    if (!pending) return;
    this.listener?.onUpdate({ ...pending, ...this.sessionRefUpdate() });
  }

  private emitUpdateAfterRequestResolution(): void {
    const pending = this.pendingRequestStatus();
    this.listener?.onUpdate({
      ...(pending ?? { status: "working", attention: "working" }),
      ...this.sessionRefUpdate(),
    });
  }

  private startEventStream(): void {
    const acquired = this.requireAcquired();
    const ctrl = new AbortController();
    this.sseAbort = ctrl;

    void (async () => {
      try {
        const sub = await acquired.client.global.event({
          signal: ctrl.signal,
        });
        for await (const ev of sub.stream) {
          if (this.disposed) break;
          const event = unwrapGlobalOpenCodeEvent(ev);
          if (event) this.handleSseEvent(event);
        }
      } catch (err) {
        if (this.disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        this.emitRuntimeEvents([
          { type: "error", threadId: this.threadId, message: `event stream: ${message}` },
        ]);
      }
    })();
  }

  private async reacquireOpenCodeServer(): Promise<void> {
    const previous = this.acquired;
    this.sseAbort?.abort();
    this.sseAbort = undefined;
    this.acquired = undefined;
    await previous?.dispose().catch((error) => {
      console.warn("[opencode] failed to dispose previous session:", error);
    });
    this.acquired = await acquireOpenCodeServer(this.buildAcquireInput());
    if (this.isGui) this.startEventStream();
  }

  /**
   * Assemble the {@link acquireOpenCodeServer} input for this session. When the
   * thread opted into hosting the subagents MCP (`input.subagentMcp` present),
   * request a dedicated single-tenant server keyed by the thread id and hand
   * over the pre-resolved config so it can be registered via `mcp.add`. Threads
   * without it (including children spawned by the run manager, whose recursion
   * guard never sets `subagentMcp`) keep sharing the per-project pool — the
   * dedicated-server cost is strictly opt-in.
   */
  private buildAcquireInput(): AcquireOpenCodeServerInput {
    return {
      projectLocation: this.input.projectLocation,
      browserMcpEnabled: this.browserMcpEnabled,
      ...(this.input.browserMcp !== undefined ? { browserMcp: this.input.browserMcp } : {}),
      computerUseMcpEnabled: this.computerUseMcpEnabled,
      ...(this.input.computerUseMcp !== undefined
        ? { computerUseMcp: this.input.computerUseMcp }
        : {}),
      ...(this.input.subagentMcp !== undefined
        ? { subagentMcp: this.input.subagentMcp, dedicatedKey: this.threadId }
        : {}),
    };
  }

  private classifyOpenCodeError(cause: unknown, operation: string): string {
    const message = classifyOpenCodeError({
      cause,
      operation,
      serverUrl: this.acquired?.baseUrl,
    });
    const output = this.acquired?.handle.formatOutput().trim();
    return output ? `${message}\n${output}` : message;
  }

  private handleSseEvent(event: Event): void {
    const sessionID = (event.properties as { sessionID?: string } | undefined)?.sessionID;
    if (sessionID && (!this.sessionId || sessionID !== this.sessionId)) {
      // Subagents run as child sessions with `parentID === this.sessionId`.
      // We need to see `session.created` for them to start tracking, and we
      // need to see their subsequent events so the mapper can count steps
      // for the parent task tool. Everything else from unrelated sessions
      // on the same server is still dropped.
      const isChild = this.mapperState
        ? isOpenCodeChildSession(this.mapperState, sessionID)
        : false;
      const isChildBirth =
        event.type === "session.created" && event.properties.info.parentID === this.sessionId;
      if (!isChild && !isChildBirth) {
        return;
      }
      // For child-session events, route only through the mapper — skip the
      // main-session status/permission/question side-effects below.
      if (this.mapperState) {
        const canonical = mapOpenCodeEvent(event, this.mapperState);
        if (canonical.length > 0) this.emitRuntimeEvents(canonical);
      }
      return;
    }

    if (event.type === "session.status") {
      const upd = mapStatusUpdate(event.properties);
      this.listener?.onUpdate({
        ...(this.pendingRequestStatus() ?? upd),
        ...this.sessionRefUpdate(),
      });
      return;
    }

    if (event.type === "session.idle") {
      this.listener?.onUpdate({
        ...(this.pendingRequestStatus() ?? { status: "idle", attention: "none" }),
        ...this.sessionRefUpdate(),
      });
      return;
    }

    if (event.type === "permission.asked") {
      const requestId = `opencode-perm-${event.properties.id}` as ThreadServerRequestId;
      this.pendingRequests.set(requestId, {
        kind: "permission",
        requestID: event.properties.id,
        sessionID: event.properties.sessionID,
      });
      this.emitPendingRequestUpdate();
    }

    if (event.type === "permission.replied") {
      const requestId = `opencode-perm-${event.properties.requestID}` as ThreadServerRequestId;
      if (this.pendingRequests.delete(requestId)) this.emitUpdateAfterRequestResolution();
    }

    if (event.type === "question.asked") {
      const requestId = `opencode-q-${event.properties.id}` as ThreadServerRequestId;
      const questionMetadata = buildQuestionMetadata(event.properties);
      this.pendingRequests.set(requestId, {
        kind: "question",
        requestID: event.properties.id,
        answerKeys: questionMetadata.answerKeys,
        optionValues: questionMetadata.optionValues,
        sourceQuestions: questionMetadata.sourceQuestions,
      });
      this.emitPendingRequestUpdate();
    }

    if (event.type === "question.replied" || event.type === "question.rejected") {
      const requestId = `opencode-q-${event.properties.requestID}` as ThreadServerRequestId;
      if (this.pendingRequests.delete(requestId)) this.emitUpdateAfterRequestResolution();
    }

    if (event.type === "session.error") {
      const err = event.properties.error;
      const msg =
        err && typeof err === "object" && "data" in err && err.data
          ? String((err.data as { message?: string }).message ?? err.name)
          : (err?.name ?? "OpenCode session error");
      this.listener?.onError(msg);
    }

    // Translate to canonical runtime events for the chat pane.
    if (this.mapperState) {
      const canonical = mapOpenCodeEvent(event, this.mapperState);
      if (canonical.length > 0) this.emitRuntimeEvents(canonical);
    }
  }

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const ev of events) this.listener.onRuntimeEvent(ev);
  }
}

// Helpers used by resolveServerRequest. The renderer sends decisions in a
// generic shape — we accept the pieces we need and ignore the rest.

function parsePermissionReply(response: unknown): "once" | "always" | "reject" {
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    const decision = typeof obj.decision === "string" ? obj.decision : undefined;
    if (decision === "accept" || decision === "approve" || decision === "once") return "once";
    if (decision === "acceptForSession" || decision === "always") return "always";
    if (
      decision === "decline" ||
      decision === "deny" ||
      decision === "reject" ||
      decision === "cancel"
    ) {
      return "reject";
    }
    if (typeof obj.optionId === "string") {
      const id = obj.optionId.toLowerCase();
      if (id.includes("always") || id.includes("session")) return "always";
      if (id.includes("reject") || id.includes("decline") || id.includes("cancel")) return "reject";
      return "once";
    }
  }
  return "once";
}

function buildQuestionMetadata(properties: { questions?: unknown }): {
  answerKeys: string[];
  optionValues: Record<string, string>;
  sourceQuestions: QuestionAnswerSourceQuestion[];
} {
  const answerKeys: string[] = [];
  const optionValues: Record<string, string> = {};
  const sourceQuestions: QuestionAnswerSourceQuestion[] = [];
  const questions = Array.isArray(properties.questions) ? properties.questions : [];
  for (let qi = 0; qi < questions.length; qi += 1) {
    const question = questions[qi];
    if (!question || typeof question !== "object") continue;
    const questionRecord = question as Record<string, unknown>;
    const questionId = `q${qi}`;
    answerKeys.push(questionId);
    const questionText = typeof questionRecord.question === "string" ? questionRecord.question : "";
    const header =
      typeof questionRecord.header === "string" && questionRecord.header.length > 0
        ? questionRecord.header
        : questionText.length > 0
          ? questionText
          : questionId;
    const sourceOptions: Array<{ optionId: string; label: string; description?: string }> = [];
    const rawOptions = questionRecord.options;
    if (Array.isArray(rawOptions)) {
      for (let oi = 0; oi < rawOptions.length; oi += 1) {
        const option = rawOptions[oi];
        if (!option || typeof option !== "object") continue;
        const optionRecord = option as Record<string, unknown>;
        const label = optionRecord.label;
        if (typeof label !== "string") continue;
        const optionId = `q${qi}.${oi}`;
        optionValues[optionId] = label;
        sourceOptions.push({
          optionId,
          label,
          ...(typeof optionRecord.description === "string" && optionRecord.description.length > 0
            ? { description: optionRecord.description }
            : {}),
        });
      }
    }
    sourceQuestions.push({
      keys: [questionId],
      header,
      question: questionText,
      options: sourceOptions,
    });
  }
  return { answerKeys, optionValues, sourceQuestions };
}

function openCodeResponseAnswers(
  response: unknown,
  pending: OpenCodeQuestionAnswerContext,
): Record<string, unknown> {
  if (!response || typeof response !== "object") return {};
  const obj = response as { answers?: unknown; optionId?: unknown; optionIds?: unknown };
  const answers = obj.answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    return answers as Record<string, unknown>;
  }
  const firstKey = pending.answerKeys[0];
  if (!firstKey) return {};
  if (Array.isArray(obj.optionIds)) {
    return { [firstKey]: obj.optionIds };
  }
  if (typeof obj.optionId === "string") {
    return { [firstKey]: obj.optionId };
  }
  return {};
}

export function parseOpenCodeQuestionAnswers(
  response: unknown,
  pending: OpenCodeQuestionAnswerContext,
): Array<Array<string>> | undefined {
  if (response === undefined || response === null) return undefined;
  if (Array.isArray(response)) {
    return response.map((row) => (Array.isArray(row) ? row.map(String) : [String(row)]));
  }
  if (typeof response === "object") {
    const obj = response as { answers?: unknown; optionId?: unknown; optionIds?: unknown };
    if (Array.isArray(obj.answers)) {
      return obj.answers.map((row) => (Array.isArray(row) ? row.map(String) : [String(row)]));
    }
    if (obj.answers && typeof obj.answers === "object") {
      return answerRowsForAnswerMap(obj.answers as Record<string, unknown>, pending);
    }
    if (Array.isArray(obj.optionIds)) {
      return answerRowsForOptionIds(
        obj.optionIds.filter((optionId): optionId is string => typeof optionId === "string"),
        pending.optionValues,
      );
    }
    if (typeof obj.optionId === "string") {
      return answerRowsForOptionIds([obj.optionId], pending.optionValues);
    }
  }
  return undefined;
}

function answerRowsForAnswerMap(
  answers: Record<string, unknown>,
  pending: OpenCodeQuestionAnswerContext,
): Array<Array<string>> {
  const rows: Array<Array<string>> = [];
  for (let qi = 0; qi < pending.answerKeys.length; qi += 1) {
    const raw = answers[pending.answerKeys[qi]!];
    rows[qi] = chosenOptionIds(raw).map((value) => pending.optionValues[value] ?? value);
  }
  return rows;
}

function answerRowsForOptionIds(
  optionIds: readonly string[],
  optionValues: Record<string, string>,
): Array<Array<string>> {
  const rows: Array<Array<string>> = [];
  for (const optionId of optionIds) {
    const value = optionValues[optionId] ?? optionId;
    const match = /^q(\d+)\.\d+$/.exec(optionId);
    const questionIndex = match ? Number.parseInt(match[1]!, 10) : 0;
    while (rows.length <= questionIndex) rows.push([]);
    rows[questionIndex]!.push(value);
  }
  return rows;
}

/**
 * Normalise `session.messages` SDK output into the shared
 * `ThreadHistoryEntry[]` shape. We keep `parts` and `info` as opaque payloads
 * — the canonical mapper reads them through the same field names as live
 * events, so a future replay layer can feed these straight back through
 * `mapOpenCodeEvent` if it wants per-message canonical reconstruction.
 */
function toThreadHistoryEntries(raw: ReadonlyArray<unknown>): ThreadHistoryEntry[] {
  const entries: ThreadHistoryEntry[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const obj = candidate as { info?: unknown; parts?: unknown };
    const info =
      obj.info && typeof obj.info === "object" ? (obj.info as Record<string, unknown>) : undefined;
    const messageId = info && typeof info.id === "string" ? info.id : undefined;
    const role =
      info?.role === "assistant" ? "assistant" : info?.role === "user" ? "user" : undefined;
    if (!messageId || !role) continue;
    const parts = Array.isArray(obj.parts) ? obj.parts : [];
    entries.push({
      messageId,
      role,
      parts,
      info,
    });
  }
  return entries;
}
