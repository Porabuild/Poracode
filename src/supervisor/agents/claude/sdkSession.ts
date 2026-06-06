import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import type {
  CanUseTool,
  Options as ClaudeQueryOptions,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SDKUserMessage,
  SpawnOptions,
  SpawnedProcess,
} from "@anthropic-ai/claude-agent-sdk";
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
  TurnState,
} from "@/shared/contracts";
import { areAgentSlashCommandsEqual } from "@/shared/contracts";
import { buildClaudeBrowserMcpServers } from "./mcpBrowser";
import {
  createKnownSessionRef,
  buildAgentCommand,
  getWslCommand,
  getPrimedPosixEnv,
  getProjectShellEnv,
  getWslProjectShellEnv,
  primeWslProjectShellEnv,
  quotePosixShellArg,
  resolveExecutablePathAsync,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredSessionUpdate,
  type ThreadHistory,
} from "../base";
import { captureSupervisorException } from "../../diagnostics/sentry";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { chosenOptionIds } from "../questionAnswers";
import { applyClaudeContextSuffix } from "./argv";
import { CLAUDE_DEFAULT_APPROVAL_POLICY } from "./detection";
import {
  ACCEPT_SUGGESTION_OPTION_PREFIX,
  buildClaudeQuestionAnswerEvents,
  closeClaudeOpenItems,
  createClaudeMapperState,
  emitActiveGoalTokenUpdate,
  extractResultErrorMessage,
  isApiErrorResult,
  mapClaudePermissionRequest,
  mapClaudeQuestionRequest,
  mapClaudeContextUsageResponse,
  mapClaudeSdkMessage,
  nonDiagnosticErrors,
  parseClaudeQuestions,
  readClaudeApiUsageSpendTokens,
  startClaudeTurn,
  type ClaudeMapperState,
  type ClaudeQuestion,
} from "./sdkCanonicalMapping";
import { mapClaudeSlashCommands } from "./probe";
import { AsyncPromptQueue } from "./promptQueue";

const CLAUDE_EXIT_PLAN_MODE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "ExitPlanMode",
  "exit_plan_mode",
]);

type PendingPermission = {
  kind: "permission";
  toolName: string;
  toolInput: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
  resolve: (result: PermissionResult) => void;
};

type PendingQuestion = {
  kind: "question";
  questions: ClaudeQuestion[];
  originalQuestions: unknown;
  resolve: (result: PermissionResult) => void;
};

type PendingRequest = PendingPermission | PendingQuestion;

type CompletedClaudeTurn = {
  resumeSessionAt: string | undefined;
};

type WindowsProjectLocation = Extract<ProjectLocation, { kind: "windows" }>;

function projectCwd(location: ProjectLocation): string {
  switch (location.kind) {
    case "wsl":
      return location.linuxPath;
    case "windows":
    case "posix":
      return location.path;
  }
}

function permissionModeForConfig(config: ThreadConfig): PermissionMode {
  return (
    config.mode === "plan" ? "plan" : (config.approvalPolicy ?? CLAUDE_DEFAULT_APPROVAL_POLICY)
  ) as PermissionMode;
}

function basePermissionModeForConfig(config: ThreadConfig): PermissionMode {
  return (config.approvalPolicy ?? CLAUDE_DEFAULT_APPROVAL_POLICY) as PermissionMode;
}

function buildDenyMessage(
  decisionKind: PermissionDecision["kind"],
  pending: PendingRequest,
): string {
  if (decisionKind === "cancel") return "User cancelled tool execution.";
  if (pending.kind === "permission" && CLAUDE_EXIT_PLAN_MODE_TOOL_NAMES.has(pending.toolName)) {
    return "User wants to keep planning. Stop here and wait for the user's next message; do not call ExitPlanMode again until the user explicitly approves the plan.";
  }
  return "User declined tool execution.";
}

// SDK-provided env is layered on top of the WSL login-shell env we primed,
// so these Windows-host vars must be dropped — otherwise they overwrite the
// Linux PATH (and friends) inside the distro.
const WINDOWS_HOST_ENV_KEYS = new Set([
  "path",
  "pathext",
  "systemroot",
  "windir",
  "comspec",
  "appdata",
  "localappdata",
  "userprofile",
  "homedrive",
  "homepath",
  "programdata",
  "programfiles",
  "programfiles(x86)",
  "commonprogramfiles",
  "commonprogramfiles(x86)",
]);
const POSIX_ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function filteredEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (WINDOWS_HOST_ENV_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function definedEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function buildDirectWslEnvCommandArgs(
  command: string,
  args: string[],
  env: Record<string, string>,
): string[] {
  const exports = Object.entries(env)
    .filter(([key]) => POSIX_ENV_NAME_RE.test(key))
    .map(([key, value]) => `export ${key}=${quotePosixShellArg(value)}`)
    .join("; ");
  const exec = `exec ${[command, ...args].map(quotePosixShellArg).join(" ")}`;
  return ["/bin/sh", "-c", exports ? `${exports}; ${exec}` : exec];
}

function spawnClaudeInWsl(location: ProjectLocation, options: SpawnOptions): SpawnedProcess {
  if (location.kind !== "wsl") {
    throw new Error("spawnClaudeInWsl called for a non-WSL project.");
  }
  const command = options.command || resolveAgentBinaryPath(location, "claude") || "claude";
  const cwd = options.cwd ?? location.linuxPath;
  const capturedEnv =
    getWslProjectShellEnv(location.distro, cwd) ??
    getWslProjectShellEnv(location.distro, location.linuxPath);
  const env = capturedEnv
    ? { ...capturedEnv, ...filteredEnv(options.env) }
    : filteredEnv(options.env);
  const args = [
    "-d",
    location.distro,
    "--cd",
    cwd,
    "--",
    ...buildDirectWslEnvCommandArgs(command, options.args, env),
  ];
  return spawn(getWslCommand(), args, {
    env: process.env,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  }) as unknown as SpawnedProcess;
}

function spawnClaudeNative(
  location: WindowsProjectLocation,
  options: SpawnOptions,
): SpawnedProcess {
  const command = options.command || resolveAgentBinaryPath(location, "claude") || "claude";
  const cwd = options.cwd ?? location.path;
  if (process.platform === "win32") {
    const env = definedEnv(options.env);
    const spec = buildAgentCommand(
      { ...location, path: cwd },
      command,
      options.args,
      undefined,
      env,
    );
    return spawn(spec.command, spec.args, {
      ...(spec.env ? { env: spec.env } : Object.keys(env).length > 0 ? { env } : {}),
      signal: options.signal,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: spec.cwd,
    }) as unknown as SpawnedProcess;
  }
  return spawn(command, options.args, {
    env: options.env,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    cwd,
  }) as unknown as SpawnedProcess;
}

function isImageAttachment(segment: PromptSegment): boolean {
  return (
    segment.kind === "attachment" &&
    (segment.mimeType?.startsWith("image/") === true ||
      /\.(png|jpe?g|gif|webp)$/i.test(segment.path))
  );
}

function isPdfAttachment(segment: PromptSegment): boolean {
  return (
    segment.kind === "attachment" &&
    (segment.mimeType === "application/pdf" || /\.pdf$/i.test(segment.path))
  );
}

async function buildSdkUserMessage(
  prompt: string,
  segments?: PromptSegment[],
): Promise<SDKUserMessage> {
  if (!segments || segments.length === 0) {
    return {
      type: "user",
      session_id: "",
      parent_tool_use_id: null,
      message: { role: "user", content: prompt },
    } as SDKUserMessage;
  }

  const content: Array<Record<string, unknown>> = [];
  const textParts: string[] = [];
  const flushText = () => {
    if (textParts.length > 0) {
      content.push({ type: "text", text: textParts.join("") });
      textParts.length = 0;
    }
  };
  for (const segment of segments) {
    if (segment.kind === "text") {
      textParts.push(segment.content);
      continue;
    }
    if (segment.kind === "attachment" && isImageAttachment(segment)) {
      flushText();
      const bytes = await readFile(segment.path);
      const mimeType = segment.mimeType ?? inferImageMime(segment.path);
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: bytes.toString("base64"),
        },
      });
      continue;
    }
    if (segment.kind === "attachment" && isPdfAttachment(segment)) {
      flushText();
      const bytes = await readFile(segment.path);
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: bytes.toString("base64"),
        },
      });
      continue;
    }
    textParts.push(`@${segment.path}`);
  }
  flushText();
  if (content.length === 0 && prompt.length > 0) content.push({ type: "text", text: prompt });

  return {
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content },
  } as unknown as SDKUserMessage;
}

function inferImageMime(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function responseOptionId(response: unknown): string | undefined {
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    if (typeof obj.optionId === "string") return obj.optionId;
    if (typeof obj.decision === "string") return obj.decision;
  }
  return undefined;
}

interface PermissionDecision {
  kind: "accept" | "acceptForSession" | "decline" | "cancel";
  /** Index into `pending.suggestions` when the user picked a single suggestion. */
  suggestionIndex?: number;
}

function permissionDecision(response: unknown): PermissionDecision {
  const option = responseOptionId(response);
  if (!option) return { kind: "accept" };

  if (option.startsWith(ACCEPT_SUGGESTION_OPTION_PREFIX)) {
    const idx = Number.parseInt(option.slice(ACCEPT_SUGGESTION_OPTION_PREFIX.length), 10);
    if (Number.isFinite(idx) && idx >= 0) {
      return { kind: "acceptForSession", suggestionIndex: idx };
    }
  }

  const lower = option.toLowerCase();
  if (lower.includes("session") || lower.includes("always")) return { kind: "acceptForSession" };
  if (lower.includes("decline") || lower.includes("deny") || lower.includes("reject")) {
    return { kind: "decline" };
  }
  if (lower.includes("cancel")) return { kind: "cancel" };
  return { kind: "accept" };
}

function rawQuestionAnswers(response: unknown, pending: PendingQuestion): Record<string, unknown> {
  if (response && typeof response === "object") {
    const obj = response as Record<string, unknown>;
    if (obj.answers && typeof obj.answers === "object") {
      return obj.answers as Record<string, unknown>;
    }
  }
  const option = responseOptionId(response);
  const first = pending.questions[0];
  return first && option ? { [first.question]: option } : {};
}

function isQuestionCancelResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const action = (response as Record<string, unknown>).action;
  return action === "cancel" || action === "decline";
}

function normalizeQuestionAnswersForSdk(
  answers: Record<string, unknown>,
  pending: PendingQuestion,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const question of pending.questions) {
    const raw = answers[question.question] ?? answers[question.header];
    const value = normalizeQuestionAnswerValue(question, raw);
    if (value !== undefined) normalized[question.question] = value;
  }
  return normalized;
}

function normalizeQuestionAnswerValue(question: ClaudeQuestion, raw: unknown): string | undefined {
  const chosen = chosenOptionIds(raw);
  if (chosen.length === 0) return undefined;
  return chosen.map((id) => labelForOption(question, id)).join(", ");
}

function labelForOption(question: ClaudeQuestion, optionId: string): string {
  const match = question.options.find((opt) => opt.optionId === optionId);
  return match?.label ?? optionId;
}

export class ClaudeSdkSession implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions = { suppressResumeConfigOverrides: true };

  private readonly input: CreateStructuredSessionInput;
  private listener: StructuredSessionListener | undefined;
  private mapperState: ClaudeMapperState;
  private promptQueue = new AsyncPromptQueue();
  private queryRuntime: Query | undefined;
  private queryReady: Promise<Query> | undefined;
  private streamStarted = false;
  private disposed = false;
  private sessionId: string | undefined;
  private openedResumeSessionId: string | undefined;
  private currentConfig: ThreadConfig;
  private appliedModel: string | undefined;
  private appliedPermissionMode: PermissionMode | undefined;
  private appliedUltracode = false;
  private appliedFast = false;
  private currentStatus: ThreadStatus = "idle";
  private currentAttention: ThreadAttention = "none";
  private currentSlashCommands: AgentSlashCommand[] | undefined;
  private pendingRequests = new Map<ThreadServerRequestId, PendingRequest>();
  private completedTurns: CompletedClaudeTurn[] = [];
  private currentTurnAssistantUuid: string | undefined;
  private currentTurnInFlight = false;
  // openThread() fires `startQuery` as a fire-and-forget IIFE and returns
  // synchronously, but the runtime calls `setListener` only afterwards from
  // `spawnThread`. Anything emitted in that window — early SDK system/stream
  // messages, or the catch-block error from a failed spawn/import — would be
  // dropped by `?.` chaining. Buffer here and drain on attach.
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private pendingError: string | undefined;
  // Set when `interruptTurn()` runs; cleared when the next `result` arrives.
  // Lets us classify the post-interrupt result as interrupted even when
  // claude.exe emits subtype "error_during_execution" without "abort"/"interrupt"
  // in the errors array — otherwise the supervisor's drain-on-idle hook would
  // miss the steer and the staged prompt would never flush.
  private interruptInFlight = false;
  private goalTrackingTimer: ReturnType<typeof setInterval> | undefined;

  private constructor(input: CreateStructuredSessionInput) {
    this.input = input;
    this.currentConfig = input.config;
    this.mapperState = createClaudeMapperState(input.threadId);
  }

  static create(input: CreateStructuredSessionInput): Promise<ClaudeSdkSession> {
    return Promise.resolve(new ClaudeSdkSession(input));
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    if (this.bufferedRuntimeEvents.length > 0 && listener.onRuntimeEvent) {
      const drain = this.bufferedRuntimeEvents;
      this.bufferedRuntimeEvents = [];
      for (const ev of drain) listener.onRuntimeEvent(ev);
    }
    if (this.currentSlashCommands !== undefined) {
      listener.onUpdate({
        status: this.currentStatus,
        attention: this.currentAttention,
        slashCommands: this.currentSlashCommands,
        ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
      });
    }
    if (this.pendingError !== undefined) {
      const message = this.pendingError;
      this.pendingError = undefined;
      listener.onError(message);
    }
  }

  private emitUpdate(update: StructuredSessionUpdate): void {
    this.currentStatus = update.status;
    this.currentAttention = update.attention;
    this.listener?.onUpdate({
      ...update,
      ...(this.currentSlashCommands !== undefined && update.slashCommands === undefined
        ? { slashCommands: this.currentSlashCommands }
        : {}),
    });
  }

  private updateSlashCommands(commands: AgentSlashCommand[]): void {
    if (areAgentSlashCommandsEqual(this.currentSlashCommands, commands)) {
      return;
    }
    this.currentSlashCommands = commands;
    this.listener?.onUpdate({
      status: this.currentStatus,
      attention: this.currentAttention,
      slashCommands: commands,
      ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
    });
  }

  private async refreshSlashCommands(runtime: Query): Promise<void> {
    try {
      const init = await runtime.initializationResult();
      const commands = mapClaudeSlashCommands(init.commands);
      if (commands.length > 0) {
        this.updateSlashCommands(commands);
        return;
      }
    } catch {
      // Fall back to the narrower command-list control request below.
    }

    try {
      const supported = await runtime.supportedCommands();
      const commands = mapClaudeSlashCommands(supported);
      if (commands.length > 0) {
        this.updateSlashCommands(commands);
      }
    } catch {
      // Install-time/default capabilities still provide the static fallback.
    }
  }

  async activate(): Promise<void> {
    if (this.disposed) throw new Error("ClaudeSdkSession was disposed before activation.");
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    this.currentConfig = config;
    this.sessionId = sessionRef?.providerSessionId ?? randomUUID();
    this.openedResumeSessionId = sessionRef?.providerSessionId;
    this.startQuery(sessionRef?.providerSessionId);
    await this.requireQuery();
    return this.sessionId ?? "";
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (this.disposed) return;
    this.currentConfig = config;
    const turnId = `turn-${randomUUID()}`;
    this.currentTurnAssistantUuid = undefined;
    this.currentTurnInFlight = true;
    this.emitRuntimeEvents(
      startClaudeTurn(this.mapperState, turnId, prompt, segments, options?.userMessageItemId),
    );
    this.emitUpdate({ status: "working", attention: "working" });
    this.startGoalTracking();

    const query = await this.requireQuery();
    const model = applyClaudeContextSuffix(config.model, config.contextSize);
    if (model !== this.appliedModel) {
      try {
        await query.setModel(model);
        this.appliedModel = model;
      } catch {
        // Older SDK transports can reject live model updates; the launch model still applies.
      }
    }
    const permissionMode = permissionModeForConfig(config);
    if (permissionMode !== this.appliedPermissionMode || config.mode === "plan") {
      try {
        await query.setPermissionMode(permissionMode);
        this.appliedPermissionMode = permissionMode;
      } catch {
        // Same best-effort rule as model updates.
      }
    }

    await this.syncUltracodeFlag(query);
    await this.syncFastMode(query);

    const message = await buildSdkUserMessage(prompt, segments);
    this.promptQueue.push(message);
  }

  /**
   * `ultracode` is not a model-level effort: it's a Claude Code session flag
   * that sends `xhigh` to the model and enables dynamic-workflow orchestration.
   * It lives in the flag-settings layer (CLI: `--settings '{"ultracode":true}'`;
   * SDK: applyFlagSettings). Cast through `unknown` because the SDK type
   * definitions for `Settings` (v0.3.142) don't yet declare `ultracode`, but
   * the underlying CLI (2.1.154+) recognizes the key.
   */
  private async syncUltracodeFlag(runtime: Query): Promise<void> {
    const wantUltracode = this.currentConfig.effort === "ultracode";
    if (wantUltracode === this.appliedUltracode) return;
    try {
      await runtime.applyFlagSettings({
        ultracode: wantUltracode ? true : null,
      } as unknown as Parameters<Query["applyFlagSettings"]>[0]);
      this.appliedUltracode = wantUltracode;
    } catch {
      // Older CLIs ignore the unknown flag; effort still degrades to xhigh.
    }
  }

  /**
   * Fast mode is a session flag (`fastMode`), not a model-level setting. Apply
   * it through the flag-settings layer when the user enabled the Fast toggle.
   * When the account can't use fast mode the toggle is gated off upstream, so
   * `config.fast` is never true here in that case.
   */
  private async syncFastMode(runtime: Query): Promise<void> {
    const wantFast = this.currentConfig.fast === true;
    if (wantFast === this.appliedFast) return;
    try {
      await runtime.applyFlagSettings({ fastMode: wantFast ? true : null });
      this.appliedFast = wantFast;
    } catch {
      // Older CLIs ignore the flag; fast mode simply stays off.
    }
  }

  async rollbackThread(numTurns: number): Promise<ThreadHistory> {
    if (!Number.isInteger(numTurns) || numTurns <= 0) {
      throw new Error(`rollbackThread: numTurns must be a positive integer (got ${numTurns}).`);
    }
    if (this.currentStatus === "working" || this.currentAttention === "working") {
      throw new Error("Claude SDK rollback is unavailable while a turn is running.");
    }
    if (this.pendingRequests.size > 0) {
      throw new Error("Claude SDK rollback is unavailable while a request is pending.");
    }
    if (!this.sessionId) {
      throw new Error("Claude SDK rollback requires an open session.");
    }
    if (numTurns > this.completedTurns.length) {
      throw new Error("Claude SDK rollback only supports turns completed in this runtime.");
    }

    const nextTurns = this.completedTurns.slice(0, this.completedTurns.length - numTurns);
    const resumeSessionAt = nextTurns.at(-1)?.resumeSessionAt;
    if (!resumeSessionAt) {
      throw new Error("Claude SDK rollback requires an assistant resume point.");
    }

    this.completedTurns = nextTurns;
    this.currentTurnAssistantUuid = undefined;
    this.currentTurnInFlight = false;
    this.openedResumeSessionId = this.sessionId;
    this.promptQueue.close();
    this.queryRuntime?.close();
    this.promptQueue = new AsyncPromptQueue();
    this.queryRuntime = undefined;
    this.queryReady = undefined;
    this.streamStarted = false;
    this.appliedModel = undefined;
    this.appliedPermissionMode = undefined;
    this.appliedUltracode = false;
    this.appliedFast = false;
    this.startQuery(this.sessionId, resumeSessionAt);
    await this.requireQuery();

    return { providerSessionId: this.sessionId, messages: [] };
  }

  async interruptTurn(): Promise<void> {
    this.interruptInFlight = true;
    try {
      await this.queryRuntime?.interrupt();
    } catch {
      // Best-effort; stream/result handling will settle state if the SDK already stopped.
    }
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    this.pendingRequests.delete(requestId);

    if (pending.kind === "question") {
      if (isQuestionCancelResponse(response)) {
        pending.resolve({ behavior: "deny", message: "User cancelled tool execution." });
        this.emitRuntimeEvents([
          {
            type: "request.resolved",
            threadId: this.input.threadId,
            requestId: String(requestId),
            outcome: "cancelled",
          },
        ]);
        this.emitUpdate({ status: "working", attention: "working" });
        return;
      }
      const rawAnswers = rawQuestionAnswers(response, pending);
      const answers = normalizeQuestionAnswersForSdk(rawAnswers, pending);
      pending.resolve({
        behavior: "allow",
        updatedInput: {
          questions: pending.originalQuestions,
          answers,
        },
      });
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.input.threadId,
          requestId: String(requestId),
          outcome: "answered",
        },
        ...buildClaudeQuestionAnswerEvents({
          threadId: this.input.threadId,
          itemId: `question-answer-${randomUUID()}`,
          questions: pending.questions,
          answers: rawAnswers,
        }),
      ]);
      this.emitUpdate({ status: "working", attention: "working" });
      return;
    }

    const decision = permissionDecision(response);
    if (decision.kind === "accept" || decision.kind === "acceptForSession") {
      const pickedSuggestion =
        decision.suggestionIndex !== undefined
          ? pending.suggestions?.[decision.suggestionIndex]
          : undefined;
      const updatedPermissions: PermissionUpdate[] | undefined =
        decision.kind === "acceptForSession" && pending.suggestions
          ? pickedSuggestion
            ? [pickedSuggestion]
            : pending.suggestions
          : undefined;
      pending.resolve({
        behavior: "allow",
        updatedInput: pending.toolInput,
        ...(updatedPermissions ? { updatedPermissions } : {}),
      });
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.input.threadId,
          requestId: String(requestId),
          outcome: "accepted",
        },
      ]);
      this.emitUpdate({ status: "working", attention: "working" });
      return;
    }

    pending.resolve({
      behavior: "deny",
      message: buildDenyMessage(decision.kind, pending),
    });
    this.emitRuntimeEvents([
      {
        type: "request.resolved",
        threadId: this.input.threadId,
        requestId: String(requestId),
        outcome: "declined",
      },
    ]);
    this.emitUpdate({ status: "working", attention: "working" });
  }

  private startGoalTracking(): void {
    this.stopGoalTracking();
    if (!this.mapperState.activeGoalItemId) return;
    this.goalTrackingTimer = setInterval(() => {
      if (this.disposed || !this.mapperState.activeGoalItemId) {
        this.stopGoalTracking();
        return;
      }
      void this.refreshContextUsage();
    }, 15_000);
  }

  private stopGoalTracking(): void {
    if (this.goalTrackingTimer !== undefined) {
      clearInterval(this.goalTrackingTimer);
      this.goalTrackingTimer = undefined;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopGoalTracking();
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.kind === "permission") {
        pending.resolve({ behavior: "deny", message: "Session closed." });
      } else {
        pending.resolve({ behavior: "deny", message: "Session closed." });
      }
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.input.threadId,
          requestId: String(requestId),
          outcome: "cancelled",
        },
      ]);
    }
    this.pendingRequests.clear();
    this.emitRuntimeEvents(closeClaudeOpenItems(this.mapperState, { closePlan: true }));
    this.promptQueue.close();
    try {
      this.queryRuntime?.close();
    } catch {
      // ignore
    }
    this.listener?.onClose();
  }

  private requireQuery(): Promise<Query> {
    if (!this.queryReady) throw new Error("ClaudeSdkSession.openThread has not completed.");
    return this.queryReady;
  }

  private startQuery(resumeSessionId: string | undefined, resumeSessionAt?: string): void {
    if (this.streamStarted) return;
    this.streamStarted = true;

    this.queryReady = (async () => {
      const wslPrime =
        this.input.projectLocation.kind === "wsl"
          ? primeWslProjectShellEnv(
              this.input.projectLocation.distro,
              this.input.projectLocation.linuxPath,
            )
          : undefined;
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      if (wslPrime) {
        await wslPrime;
      }
      const permissionMode = basePermissionModeForConfig(this.currentConfig);
      const model = applyClaudeContextSuffix(
        this.currentConfig.model,
        this.currentConfig.contextSize,
      );
      // POSIX: the SDK spawns the `claude` CLI internally, so its env is what
      // determines PATH for the child. Prefer the project-scoped shell env
      // captured by `primeProjectShellEnv` (fnm / asdf / mise / volta cd-hooks
      // applied at the project root) over Electron's `process.env`, which on
      // macOS-from-Finder is launchd's skeleton PATH and pins the CLI to
      // homebrew node regardless of `.nvmrc`. Falls back to the homedir-scoped
      // primed env, then to bare `process.env`.
      const posixCwd = projectCwd(this.input.projectLocation);
      const posixEnv =
        this.input.projectLocation.kind === "posix"
          ? (getProjectShellEnv(posixCwd) ??
            getPrimedPosixEnv() ??
            (process.env as Record<string, string>))
          : undefined;
      const env =
        this.input.projectLocation.kind === "wsl"
          ? { CLAUDE_AGENT_SDK_CLIENT_APP: "lightcode", BROWSER: "/bin/true" }
          : { ...(posixEnv ?? process.env), CLAUDE_AGENT_SDK_CLIENT_APP: "lightcode" };
      // Posix builds ship without the SDK's bundled `claude` SEA binary
      // (electron-builder strips `@anthropic-ai/claude-agent-sdk-*` from the
      // asar). The SDK falls back to that binary when `pathToClaudeCodeExecutable`
      // is missing, so unresolved on posix is a hard error — surface it
      // explicitly instead of letting the SDK throw its "Native CLI binary
      // for darwin-arm64 not found" message.
      let claudeExecutablePath: string | undefined;
      switch (this.input.projectLocation.kind) {
        case "posix": {
          claudeExecutablePath =
            resolveAgentBinaryPath(this.input.projectLocation, "claude") ??
            (await resolveExecutablePathAsync("claude"));
          if (!claudeExecutablePath) {
            throw new Error(
              "Claude Code CLI not found on PATH. Install Claude Code (`npm i -g @anthropic-ai/claude-code` or via Homebrew) and restart Lightcode.",
            );
          }
          break;
        }
        case "windows": {
          claudeExecutablePath = resolveAgentBinaryPath(this.input.projectLocation, "claude");
          break;
        }
        case "wsl":
          // WSL spawns through wsl.exe (see spawnClaudeInWsl), but the SDK
          // still resolves `pathToClaudeCodeExecutable` eagerly — if unset,
          // it tries to load its bundled win32-x64 SEA binary and throws
          // "Native CLI binary for win32-x64 not found" even though our
          // custom `spawnClaudeCodeProcess` will override the actual spawn.
          // Pass the in-distro path as a placeholder; fall back to `claude`
          // so the SDK's truthy check passes when detection hasn't primed
          // the binary cache yet.
          claudeExecutablePath =
            resolveAgentBinaryPath(this.input.projectLocation, "claude") ?? "claude";
          break;
        default: {
          const _exhaustive: never = this.input.projectLocation;
          void _exhaustive;
        }
      }
      const browserMcpServers = buildClaudeBrowserMcpServers(
        this.input.projectLocation,
        this.currentConfig.browserMcp === true,
        this.input.browserMcp,
      );
      let spawnClaudeCodeProcess: ((spawnOptions: SpawnOptions) => SpawnedProcess) | undefined;
      switch (this.input.projectLocation.kind) {
        case "wsl": {
          const location = this.input.projectLocation;
          spawnClaudeCodeProcess = (spawnOptions) => spawnClaudeInWsl(location, spawnOptions);
          break;
        }
        case "windows": {
          const location = this.input.projectLocation;
          spawnClaudeCodeProcess = (spawnOptions) => spawnClaudeNative(location, spawnOptions);
          break;
        }
      }
      const options: ClaudeQueryOptions = {
        cwd: projectCwd(this.input.projectLocation),
        model,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project", "local"],
        permissionMode,
        ...(permissionMode === "bypassPermissions"
          ? { allowDangerouslySkipPermissions: true }
          : {}),
        ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        ...(resumeSessionAt ? { resumeSessionAt } : {}),
        ...(!resumeSessionId && this.sessionId ? { sessionId: this.sessionId } : {}),
        includePartialMessages: true,
        forwardSubagentText: true,
        canUseTool: this.canUseTool,
        env,
        ...(this.currentConfig.effort
          ? {
              // `ultracode` is not a model-level effort value — the CLI rejects
              // it on `--effort`. It maps to `xhigh` reasoning + dynamic
              // workflows, where the workflows toggle is sent below via
              // applyFlagSettings after the query starts.
              effort: (this.currentConfig.effort === "ultracode"
                ? "xhigh"
                : this.currentConfig.effort) as NonNullable<ClaudeQueryOptions["effort"]>,
            }
          : {}),
        ...(claudeExecutablePath ? { pathToClaudeCodeExecutable: claudeExecutablePath } : {}),
        ...(browserMcpServers
          ? ({ mcpServers: browserMcpServers } as Partial<ClaudeQueryOptions>)
          : {}),
        ...(spawnClaudeCodeProcess ? { spawnClaudeCodeProcess } : {}),
      };

      this.queryRuntime = query({ prompt: this.promptQueue, options });
      this.appliedModel = model;
      this.appliedPermissionMode = permissionMode;
      void this.refreshSlashCommands(this.queryRuntime);
      void this.syncUltracodeFlag(this.queryRuntime);
      void this.syncFastMode(this.queryRuntime);
      return this.queryRuntime;
    })();

    void this.queryReady
      .then(async (runtime) => {
        try {
          for await (const message of runtime) {
            if (this.disposed) break;
            this.handleSdkMessage(message);
          }
        } catch (error) {
          if (!this.disposed) {
            captureSupervisorException(error, {
              "lightcode.feature_area": "provider-sdk",
              "lightcode.provider": "claude",
            });
            const message = error instanceof Error ? error.message : String(error);
            this.reportError(message);
            this.emitRuntimeEvents([{ type: "error", threadId: this.input.threadId, message }]);
          }
        }
      })
      .catch((error) => {
        if (this.disposed) return;
        captureSupervisorException(error, {
          "lightcode.feature_area": "provider-sdk",
          "lightcode.provider": "claude",
        });
        const message = error instanceof Error ? error.message : String(error);
        this.reportError(message);
        this.emitRuntimeEvents([{ type: "error", threadId: this.input.threadId, message }]);
      });
  }

  private readonly canUseTool: CanUseTool = async (toolName, toolInput, callbackOptions) => {
    if (this.disposed) return { behavior: "deny", message: "Session closed." };
    if (toolName === "AskUserQuestion") {
      const requestId = `claude-question-${randomUUID()}` as ThreadServerRequestId;
      const questions = parseClaudeQuestions(toolInput);
      return await new Promise<PermissionResult>((resolve) => {
        this.pendingRequests.set(requestId, {
          kind: "question",
          questions,
          originalQuestions: toolInput.questions,
          resolve,
        });
        callbackOptions.signal.addEventListener(
          "abort",
          () => {
            if (!this.pendingRequests.delete(requestId)) return;
            resolve({ behavior: "deny", message: "User cancelled tool execution." });
          },
          { once: true },
        );
        this.emitRuntimeEvents([
          mapClaudeQuestionRequest({
            threadId: this.input.threadId,
            requestId: String(requestId),
            questions,
          }),
        ]);
        this.emitUpdate({ status: "needs_reply", attention: "needs_reply" });
      });
    }

    const requestId = `claude-perm-${randomUUID()}` as ThreadServerRequestId;
    return await new Promise<PermissionResult>((resolve) => {
      this.pendingRequests.set(requestId, {
        kind: "permission",
        toolName,
        toolInput,
        ...(callbackOptions.suggestions ? { suggestions: [...callbackOptions.suggestions] } : {}),
        resolve,
      });
      callbackOptions.signal.addEventListener(
        "abort",
        () => {
          if (!this.pendingRequests.delete(requestId)) return;
          resolve({ behavior: "deny", message: "User cancelled tool execution." });
        },
        { once: true },
      );
      this.emitRuntimeEvents([
        mapClaudePermissionRequest({
          threadId: this.input.threadId,
          requestId: String(requestId),
          toolName,
          toolInput,
          ...(callbackOptions.title ? { title: callbackOptions.title } : {}),
          ...(callbackOptions.description ? { description: callbackOptions.description } : {}),
          ...(callbackOptions.displayName ? { displayName: callbackOptions.displayName } : {}),
          ...(callbackOptions.blockedPath ? { blockedPath: callbackOptions.blockedPath } : {}),
          ...(callbackOptions.decisionReason
            ? { decisionReason: callbackOptions.decisionReason }
            : {}),
          ...(callbackOptions.toolUseID ? { toolUseID: callbackOptions.toolUseID } : {}),
          ...(callbackOptions.suggestions ? { suggestions: callbackOptions.suggestions } : {}),
        }),
      ]);
      this.emitUpdate({ status: "needs_approval", attention: "needs_approval" });
    });
  };

  private handleSdkMessage(message: SDKMessage): void {
    const sessionId =
      "session_id" in message && typeof message.session_id === "string"
        ? message.session_id
        : undefined;
    if (sessionId && sessionId !== this.sessionId && this.shouldAdoptSessionId(message)) {
      this.sessionId = sessionId;
      this.emitUpdate({
        status: this.currentStatus,
        attention: this.currentAttention,
        sessionRef: createKnownSessionRef(sessionId),
      });
    }

    if (message.type === "system" && message.subtype === "session_state_changed") {
      const mapped = mapSessionState(message.state);
      this.emitUpdate(mapped);
    }

    if (message.type === "assistant") {
      this.currentTurnAssistantUuid = message.uuid;
    }

    let wasInterrupted = false;
    let resultState: TurnState | undefined;
    if (message.type === "result") {
      wasInterrupted =
        this.interruptInFlight || (message.subtype !== "success" && isInterruptedResult(message));
      if (wasInterrupted) resultState = "interrupted";
    }
    const events = mapClaudeSdkMessage(
      message,
      this.mapperState,
      resultState ? { resultState } : undefined,
    );
    this.emitRuntimeEvents(events);
    if (message.type === "result") {
      void this.refreshContextUsage();
      this.interruptInFlight = false;
      const remaining = nonDiagnosticErrors(message);
      // claude.exe surfaces upstream API failures (e.g. 401 auth, 429 rate
      // limit) as subtype "success" with `is_error: true` / `api_error_status`
      // set — the failure text lives in `result`, not `errors[]`.
      const apiErrored = isApiErrorResult(message);
      // An interrupt always wins. A steered/aborted turn comes back as
      // `error_during_execution` with `is_error: true` and only
      // `[ede_diagnostic]` lines — that would otherwise trip both the API-error
      // and non-success checks below and surface a spurious "Claude turn
      // failed." every time the user steers. Genuine API failures (401/429)
      // arrive with `wasInterrupted` false, so they still surface. The
      // diagnostic-only case is itself treated as an interrupt via
      // `isInterruptedResult`, covering external (in-CLI) Esc interrupts where
      // `interruptInFlight` is false.
      const failed =
        !wasInterrupted && (apiErrored || (message.subtype !== "success" && remaining.length > 0));
      const errorMessage = failed
        ? (extractResultErrorMessage(message) ?? "Claude turn failed.")
        : undefined;
      if (this.currentTurnInFlight && !failed && !wasInterrupted) {
        this.completedTurns.push({ resumeSessionAt: this.currentTurnAssistantUuid });
      }
      this.currentTurnAssistantUuid = undefined;
      this.currentTurnInFlight = false;
      if (!wasInterrupted) this.stopGoalTracking();
      this.emitUpdate({
        status: failed ? "error" : "idle",
        attention: failed ? "error" : "none",
        ...(errorMessage ? { errorMessage } : {}),
        ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
      });
    }
  }

  private shouldAdoptSessionId(message: SDKMessage): boolean {
    if (this.openedResumeSessionId) {
      return false;
    }
    if (message.type !== "system") {
      return true;
    }
    return (
      message.subtype !== "hook_started" &&
      message.subtype !== "hook_progress" &&
      message.subtype !== "hook_response"
    );
  }

  private async refreshContextUsage(): Promise<void> {
    try {
      const runtime = this.queryRuntime;
      if (!runtime) return;
      const usage = await runtime.getContextUsage();
      if (this.disposed) return;
      const event = mapClaudeContextUsageResponse(this.input.threadId, usage);
      if (event) this.emitRuntimeEvents([event]);
      if (this.mapperState.activeGoalItemId) {
        const spendTokens = readClaudeApiUsageSpendTokens(usage.apiUsage);
        const goalUpdate =
          spendTokens !== undefined
            ? emitActiveGoalTokenUpdate(this.mapperState, spendTokens)
            : undefined;
        if (goalUpdate) this.emitRuntimeEvents([goalUpdate]);
      }
    } catch {
      // Older transports can reject this control call. In that case, keep the
      // existing context and goal-spend state until a result message arrives.
    }
  }

  private emitRuntimeEvents(events: RuntimeEvent[]): void {
    if (events.length === 0) return;
    if (!this.listener?.onRuntimeEvent) {
      this.bufferedRuntimeEvents.push(...events);
      return;
    }
    for (const event of events) this.listener.onRuntimeEvent(event);
  }

  private reportError(message: string): void {
    if (this.listener) {
      this.listener.onError(message);
      return;
    }
    // Surface in supervisor stderr so silent listener-not-yet-attached
    // failures still leave a trail; the message is also queued for replay
    // when `setListener` runs.
    console.error(`[claude-sdk-session] ${this.input.threadId} pre-listener error: ${message}`);
    this.pendingError = message;
  }
}

function isInterruptedResult(message: Extract<SDKMessage, { type: "result" }>): boolean {
  const filtered = nonDiagnosticErrors(message);
  // claude.exe emits an `error_during_execution` result whose only error is
  // an `[ede_diagnostic]` line when a turn was interrupted before producing
  // assistant content. Treat that as an interrupt — the SDK itself filters
  // those lines out as informational.
  if (filtered.length === 0) return true;
  const joined = filtered.join(" ").toLowerCase();
  return joined.includes("abort") || joined.includes("interrupt");
}

function mapSessionState(messageState: string): {
  status: ThreadStatus;
  attention: ThreadAttention;
} {
  switch (messageState) {
    case "running":
      return { status: "working", attention: "working" };
    case "requires_action":
      return { status: "needs_approval", attention: "needs_approval" };
    case "idle":
    default:
      return { status: "idle", attention: "none" };
  }
}
