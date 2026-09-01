import type {
  AgentSlashCommand,
  PromptSegment,
  RuntimeEvent,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import {
  createKnownSessionRef,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
} from "../base";
import { readNonNegativeInteger } from "../contextUsage";
import {
  goalPayloadFromProviderState,
  startGoalItemEvents,
  updateGoalItemEvents,
  type ProviderGoalState,
} from "../goalRuntime";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { buildQuestionAnswerEvents } from "../questionAnswerEvents";
import { splitPiModelId, type PiThinkingLevel, PI_THINKING_LEVELS } from "./argv";
import { writePiMcpExtension } from "./mcpExtension";
import { PiRpcClient, type PiRpcEvent } from "./rpcClient";

const NOOP_LISTENER: StructuredSessionListener = {
  onClose() {},
  onError() {},
  onUpdate() {},
};

type PiDialogKind = "select" | "confirm" | "input" | "editor";

interface PendingDialog {
  kind: PiDialogKind;
  title: string;
  message?: string;
  options?: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function readResponseValue(response: unknown): unknown {
  const record = recordOf(response);
  if (!record) return response;
  if (record.cancelled === true || record.action === "cancel") return undefined;
  if (typeof record.optionId === "string") return record.optionId;
  if (Array.isArray(record.optionIds)) return record.optionIds[0];
  const answers = recordOf(record.answers);
  if (answers) return Object.values(answers)[0];
  return response;
}

function toolKind(name: string): "read" | "edit" | "search" | "execute" | "other" {
  if (/^(read|ls)$/i.test(name)) return "read";
  if (/^(edit|write)$/i.test(name)) return "edit";
  if (/^(grep|find|search)$/i.test(name)) return "search";
  if (/^(bash|exec|shell)$/i.test(name)) return "execute";
  return "other";
}

function toolResultText(result: unknown): string | undefined {
  const content = recordOf(result)?.content;
  if (!Array.isArray(content)) return undefined;
  const texts = content.flatMap((entry) => {
    const record = recordOf(entry);
    return record?.type === "text" && typeof record.text === "string" ? [record.text] : [];
  });
  return texts.length > 0 ? texts.join("\n") : undefined;
}

function toolResultImages(result: unknown): string[] {
  const content = recordOf(result)?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((entry) => {
    const record = recordOf(entry);
    if (
      record?.type !== "image" ||
      typeof record.data !== "string" ||
      typeof record.mimeType !== "string"
    ) {
      return [];
    }
    return [`data:${record.mimeType};base64,${record.data}`];
  });
}

const isSubAgentTool = (name: string): boolean =>
  /(?:subagent|sub-agent|delegate|spawn|task)/i.test(name);

/**
 * Structured (GUI) Pi session backed by the user's installed `pi --mode rpc`
 * CLI rather than the bundled SDK. Poracode drives the installed agent over
 * stdin/stdout JSONL, mirroring how the Claude/OpenCode adapters drive their
 * installed CLIs — no Pi SDK is bundled into the app.
 */
export class PiRpcSession implements StructuredSessionHandle {
  readonly launchOptions;
  private listener: StructuredSessionListener = NOOP_LISTENER;
  private readonly client: PiRpcClient;
  private readonly pendingDialogs = new Map<string, PendingDialog>();
  private readonly openToolItems = new Map<string, string>();
  private readonly unsubscribeEvents: () => void;
  private readonly unsubscribeExit: () => void;
  private readonly mcpExtensionPath: string | undefined;
  private dialogSequence = 0;
  private itemSequence = 0;
  private turnSequence = 0;
  private currentTurnId: string | undefined;
  private turnCompletion: Promise<void> = Promise.resolve();
  private resolveTurnCompletion: (() => void) | undefined;
  private turnWatchdog: ReturnType<typeof setTimeout> | undefined;
  private agentStarted = false;
  private assistantItemId: string | undefined;
  private reasoningItemId: string | undefined;
  /** Canonical item mirroring the installed pi-goal extension's session state. */
  private goalItemId: string | undefined;
  private goalStartedAt: number | undefined;
  private lastPiGoalStatus: ProviderGoalState["status"] | undefined;
  private piCodexGoal: ProviderGoalState | undefined;
  /** Latest visible extension status item for each Pi plugin-defined status key. */
  private readonly extensionStatusItemIds = new Map<string, string>();
  private turnErrorMessage: string | undefined;
  private currentConfig: ThreadConfig;
  /** Pi assigns its session id asynchronously; do not publish a placeholder. */
  private sessionRef: ReturnType<typeof createKnownSessionRef> | undefined;
  private disposed = false;
  private interruptRequested = false;
  /** True when the CLI was launched with `--session <id>` (resumed, not fresh). */
  private readonly launchedWithResume: boolean;
  /** usage.spent ledger scope: pi session id + epoch (bumped if the id changes). */
  private usageScopeId: string | undefined;
  private usageEpoch = 0;
  private usageScopeFresh = false;

  private constructor(
    private readonly input: CreateStructuredSessionInput,
    client: PiRpcClient,
    mcpExtensionPath?: string,
  ) {
    this.launchOptions = {
      ...(input.agentSettings ? { agentSettings: input.agentSettings } : {}),
      ...(input.mcpServers ? { mcpServers: input.mcpServers } : {}),
    };
    this.client = client;
    this.mcpExtensionPath = mcpExtensionPath;
    this.currentConfig = input.config;
    this.launchedWithResume = input.sessionRef?.providerSessionId !== undefined;
    this.unsubscribeEvents = client.onEvent((event) => this.handleEvent(event));
    this.unsubscribeExit = client.onExit(() => this.handleExit());
  }

  static async create(
    input: CreateStructuredSessionInput,
    options?: { binary?: string },
  ): Promise<PiRpcSession> {
    if (input.projectLocation.kind === "wsl") {
      throw new Error("Pi structured chat requires a native project; use Pi terminal mode in WSL.");
    }
    const cwd = input.projectLocation.path;
    const binary = options?.binary ?? resolveAgentBinaryPath(input.projectLocation, "pi") ?? "pi";
    const mcpExtensionPath =
      input.mcpServers && input.mcpServers.length > 0
        ? await writePiMcpExtension(input.mcpServers)
        : undefined;

    const args = ["--mode", "rpc", "--approve"];
    const resumeId = input.sessionRef?.providerSessionId;
    if (resumeId) args.push("--session", resumeId);
    if (input.config.model) args.push("--model", input.config.model);
    if (
      input.config.effort &&
      PI_THINKING_LEVELS.includes(input.config.effort as PiThinkingLevel)
    ) {
      args.push("--thinking", input.config.effort);
    }
    if (mcpExtensionPath) args.push("--extension", mcpExtensionPath);

    const client = PiRpcClient.spawn({ command: binary, args, cwd });
    try {
      await client.spawnReady;
      return new PiRpcSession(input, client, mcpExtensionPath);
    } catch (error) {
      await client.close();
      throw error;
    }
  }

  ownsProviderSession(providerSessionId: string): boolean {
    return providerSessionId === this.sessionRef?.providerSessionId;
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    this.emit({ type: "session.started", threadId: this.input.threadId });
    this.publishUpdate("idle", "none");
    void this.publishSlashCommands();
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    _segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    if (this.disposed) throw new Error("Pi session is closed.");
    await this.applyConfig(config);
    this.beginTurn(prompt, options?.userMessageItemId);
    this.publishUpdate("working", "none");
    const completion = this.turnCompletion;
    try {
      // Inline instructions (skill injections, provider-handoff context) ride
      // with the prompt Pi receives but stay out of the painted user_message —
      // `beginTurn` above records the user's own text (see
      // StartTurnOptions.inlineInstructions).
      const message = options?.inlineInstructions
        ? `${prompt}\n\n${options.inlineInstructions}`
        : prompt;
      const response = await this.client.request("prompt", { message, source: "rpc" });
      if (!response.success) {
        this.failTurn(response.error ?? "Pi rejected the prompt.");
        return;
      }
      // Extension commands and prompt handlers can complete without starting an
      // agent run, so no agent_settled event follows them. If no agent run
      // begins shortly after acceptance, settle the turn locally.
      this.armTurnWatchdog();
      await completion;
    } catch (error) {
      if (this.interruptRequested) {
        this.finishTurn("cancelled");
        return;
      }
      this.failTurn(errorMessage(error));
      throw error;
    }
  }

  async steerTurn(
    prompt: string,
    config: ThreadConfig,
    _segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    await this.applyConfig(config);
    if (!this.currentTurnId) return this.startTurn(prompt, config, undefined, options);
    const response = await this.client.request("steer", { message: prompt });
    if (!response.success) {
      this.emit({
        type: "warning",
        threadId: this.input.threadId,
        message: response.error ?? "Pi could not steer the current turn.",
      });
    }
  }

  async interruptTurn(): Promise<void> {
    this.interruptRequested = true;
    this.cancelDialogs();
    await this.client.request("abort").catch(() => undefined);
  }

  forceCompleteTurn(): void {
    this.finishTurn("cancelled");
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const id = String(requestId);
    const dialog = this.pendingDialogs.get(id);
    if (!dialog) return;
    this.pendingDialogs.delete(id);
    const raw = readResponseValue(response);
    for (const event of buildQuestionAnswerEvents({
      threadId: this.input.threadId,
      itemId: this.nextItemId("question-answer"),
      questions: [
        {
          keys: [id],
          header: dialog.title,
          question: dialog.message || dialog.title,
          options: (dialog.options ?? []).map((option) => ({ optionId: option, label: option })),
        },
      ],
      answers: { [id]: raw },
    })) {
      this.emit(event);
    }
    if (dialog.kind === "confirm") {
      const confirmed = raw === true || raw === "yes" || raw === "accept" || raw === "allow";
      this.client.notify({ type: "extension_ui_response", id, confirmed });
    } else if (raw === undefined) {
      this.client.notify({ type: "extension_ui_response", id, cancelled: true });
    } else {
      this.client.notify({ type: "extension_ui_response", id, value: String(raw) });
    }
    this.emit({
      type: "request.resolved",
      threadId: this.input.threadId,
      requestId: id,
      outcome: raw === undefined ? "cancelled" : "answered",
    });
    this.publishUpdate(this.currentTurnId ? "working" : "idle", "none");
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTurnWatchdog();
    this.cancelDialogs();
    this.unsubscribeEvents();
    this.unsubscribeExit();
    await this.client.close();
    if (this.mcpExtensionPath) {
      const { rmSync } = await import("node:fs");
      try {
        rmSync(this.mcpExtensionPath, { force: true });
      } catch {
        // best-effort temp cleanup
      }
    }
    this.emit({ type: "session.exited", threadId: this.input.threadId, reason: "disposed" });
    this.listener.onClose();
  }

  private async applyConfig(config: ThreadConfig): Promise<void> {
    const selected = splitPiModelId(config.model);
    if (selected) {
      const current = this.currentConfig.model;
      if (current !== config.model) {
        const response = await this.client.request("set_model", {
          provider: selected.provider,
          modelId: selected.modelId,
        });
        if (!response.success)
          throw new Error(response.error ?? `Pi model ${config.model} is unavailable.`);
      }
    }
    if (
      config.effort &&
      PI_THINKING_LEVELS.includes(config.effort as PiThinkingLevel) &&
      config.effort !== this.currentConfig.effort
    ) {
      await this.client.request("set_thinking_level", { level: config.effort });
    }
    this.currentConfig = config;
  }

  private beginTurn(prompt: string, userMessageItemId?: string): void {
    this.currentTurnId = `pi-turn-${++this.turnSequence}`;
    this.interruptRequested = false;
    this.agentStarted = false;
    this.turnErrorMessage = undefined;
    this.assistantItemId = undefined;
    this.reasoningItemId = undefined;
    this.openToolItems.clear();
    this.turnCompletion = new Promise<void>((resolve) => {
      this.resolveTurnCompletion = resolve;
    });
    this.emit({
      type: "turn.started",
      threadId: this.input.threadId,
      turnId: this.currentTurnId,
    });
    // GUI launches paint the user's message optimistically before Pi accepts
    // the prompt. Reuse that item id so the canonical stream confirms the
    // existing row instead of creating a duplicate.
    const userItemId = userMessageItemId ?? this.nextItemId("user");
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId: userItemId,
      itemType: "user_message",
      payload: { content: [{ kind: "text", text: prompt }] },
    });
    this.emit({ type: "item.completed", threadId: this.input.threadId, itemId: userItemId });
  }

  private armTurnWatchdog(): void {
    this.clearTurnWatchdog();
    this.turnWatchdog = setTimeout(() => {
      if (!this.agentStarted && this.currentTurnId) this.finishTurn("completed");
    }, 1_500);
  }

  private clearTurnWatchdog(): void {
    if (this.turnWatchdog) {
      clearTimeout(this.turnWatchdog);
      this.turnWatchdog = undefined;
    }
  }

  private handleEvent(event: PiRpcEvent): void {
    if (this.disposed) return;
    switch (event.type) {
      case "message_update":
        this.handleMessageUpdate(event);
        break;
      case "tool_execution_start":
        this.handleToolStart(event);
        break;
      case "tool_execution_update":
        this.handleToolUpdate(event);
        break;
      case "tool_execution_end":
        this.handleToolEnd(event);
        break;
      case "agent_start":
        this.agentStarted = true;
        this.clearTurnWatchdog();
        break;
      case "compaction_start":
        this.publishUpdate("working", "none");
        break;
      case "compaction_end":
        if (typeof event.errorMessage === "string" && event.errorMessage) {
          this.emit({
            type: "warning",
            threadId: this.input.threadId,
            message: event.errorMessage,
          });
        }
        break;
      case "auto_retry_start":
        if (typeof event.errorMessage === "string") {
          this.emit({
            type: "warning",
            threadId: this.input.threadId,
            message: event.errorMessage,
          });
        }
        break;
      case "auto_retry_end":
        if (event.success === false && typeof event.finalError === "string") {
          this.turnErrorMessage ??= event.finalError;
        }
        break;
      case "agent_settled":
        this.clearTurnWatchdog();
        this.finishTurn(this.interruptRequested ? "cancelled" : this.settleState());
        break;
      case "extension_ui_request":
        this.handleExtensionUiRequest(event);
        break;
      case "entry_appended":
        this.handleSessionEntry(event);
        break;
    }
  }

  private settleState(): "completed" | "failed" {
    if (this.turnErrorMessage) {
      this.emit({ type: "error", threadId: this.input.threadId, message: this.turnErrorMessage });
      return "failed";
    }
    return "completed";
  }

  private handleMessageUpdate(event: PiRpcEvent): void {
    const update = recordOf(event.assistantMessageEvent);
    if (!update) return;
    if (update.type === "text_delta" && typeof update.delta === "string") {
      const itemId = this.ensureAssistantItem();
      this.emit({
        type: "content.delta",
        threadId: this.input.threadId,
        itemId,
        stream: "assistant_text",
        delta: update.delta,
      });
    } else if (update.type === "thinking_delta" && typeof update.delta === "string") {
      const itemId = this.ensureReasoningItem();
      this.emit({
        type: "content.delta",
        threadId: this.input.threadId,
        itemId,
        stream: "reasoning_text",
        delta: update.delta,
      });
    } else if (update.type === "error") {
      const error = recordOf(update.error);
      const message =
        (typeof error?.errorMessage === "string" && error.errorMessage) ||
        (typeof error?.message === "string" && error.message) ||
        "Pi model request failed.";
      this.turnErrorMessage ??= message;
      this.emit({ type: "error", threadId: this.input.threadId, message });
    }
  }

  private handleToolStart(event: PiRpcEvent): void {
    const toolCallId = String(event.toolCallId ?? "");
    const toolName = String(event.toolName ?? "tool");
    const itemId = this.nextItemId("tool");
    this.openToolItems.set(toolCallId, itemId);
    const isMcp = toolName.startsWith("mcp__");
    const serverId = isMcp ? toolName.split("__")[1] : undefined;
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId,
      itemType: isMcp ? "mcp_tool_call" : "tool_call",
      payload: {
        name: toolName,
        title: toolName,
        kind: toolKind(toolName),
        args: event.args,
        status: "running",
        ...(serverId ? { serverId } : {}),
        ...(isSubAgentTool(toolName) ? { isSubAgent: true } : {}),
        ...(toolName.startsWith("mcp__crossagents__") ? { isCrossagent: true } : {}),
      },
    });
  }

  private handleToolUpdate(event: PiRpcEvent): void {
    const itemId = this.openToolItems.get(String(event.toolCallId ?? ""));
    if (!itemId) return;
    const toolName = String(event.toolName ?? "tool");
    this.emit({
      type: "item.updated",
      threadId: this.input.threadId,
      itemId,
      payload: {
        name: toolName,
        title: toolName,
        kind: toolKind(toolName),
        args: event.args,
        result: event.partialResult,
        status: "running",
      },
    });
  }

  private handleToolEnd(event: PiRpcEvent): void {
    const toolCallId = String(event.toolCallId ?? "");
    const itemId = this.openToolItems.get(toolCallId);
    if (!itemId) return;
    this.openToolItems.delete(toolCallId);
    const toolName = String(event.toolName ?? "tool");
    const images = toolResultImages(event.result);
    this.emit({
      type: "item.completed",
      threadId: this.input.threadId,
      itemId,
      payload: {
        name: toolName,
        title: toolName,
        kind: toolKind(toolName),
        result: toolResultText(event.result) ?? event.result,
        status: event.isError === true ? "error" : "success",
        ...(images.length > 0 ? { images } : {}),
        ...(isSubAgentTool(toolName) ? { isSubAgent: true } : {}),
        ...(toolName.startsWith("mcp__crossagents__") ? { isCrossagent: true } : {}),
      },
    });
  }

  private handleExtensionUiRequest(event: PiRpcEvent): void {
    const id = String(event.id ?? "");
    const method = String(event.method ?? "");
    if (method === "setStatus") {
      this.handleExtensionStatus(event);
      return;
    }
    if (method === "notify") {
      const message = typeof event.message === "string" ? event.message : "";
      this.emit(
        event.notifyType === "error"
          ? { type: "error", threadId: this.input.threadId, message }
          : { type: "warning", threadId: this.input.threadId, message },
      );
      return;
    }
    if (method !== "select" && method !== "confirm" && method !== "input" && method !== "editor") {
      return; // Unknown plugin widgets cannot be safely rendered by the host.
    }
    const title = typeof event.title === "string" ? event.title : method;
    const message = typeof event.message === "string" ? event.message : undefined;
    const options = Array.isArray(event.options)
      ? event.options.filter((option): option is string => typeof option === "string")
      : undefined;
    const kind: PiDialogKind = method;
    this.pendingDialogs.set(id, {
      kind,
      title,
      ...(message ? { message } : {}),
      ...(options?.length ? { options } : {}),
    });
    const dialogOptions = (kind === "confirm" ? ["yes", "no"] : options)?.map((option) => ({
      optionId: option,
      label: option,
    }));
    const formQuestion = {
      id,
      header: title,
      question: message || title,
      ...(dialogOptions?.length ? { options: dialogOptions } : {}),
    };
    this.emit({
      type: "request.opened",
      threadId: this.input.threadId,
      requestId: id,
      requestType: "tool_user_input",
      payload: {
        summary: title,
        details: { userInputForm: { questions: [formQuestion] } },
        ...(dialogOptions?.length ? { options: dialogOptions } : {}),
      },
    });
    this.publishUpdate("needs_reply", "needs_reply");
  }

  /** Preserve visible extension status without assigning plugin-specific semantics. */
  private handleExtensionStatus(event: PiRpcEvent): void {
    const key = typeof event.statusKey === "string" ? event.statusKey.trim() : "";
    const text = typeof event.statusText === "string" ? event.statusText.trim() : "";
    // pi-goal is normalized from its durable session entry, avoiding a duplicate generic row.
    if (!key || !text || key === "goal") return;
    const payload = {
      name: key,
      title: key,
      kind: "other" as const,
      result: text,
      status: "success" as const,
    };
    const existingItemId = this.extensionStatusItemIds.get(key);
    if (existingItemId) {
      this.emit({
        type: "item.updated",
        threadId: this.input.threadId,
        itemId: existingItemId,
        payload,
      });
      return;
    }
    const itemId = this.nextItemId("plugin-status");
    this.extensionStatusItemIds.set(key, itemId);
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId,
      itemType: "dynamic_tool_call",
      payload,
    });
    this.emit({ type: "item.completed", threadId: this.input.threadId, itemId });
  }

  /**
   * pi-goal writes durable state through `appendEntry` rather than a dedicated
   * RPC method. Normalize those provider-native entries at the Pi boundary so
   * the shared goal dock can remain provider-agnostic.
   */
  private handleSessionEntry(event: PiRpcEvent): void {
    const entry = recordOf(event.entry);
    if (entry?.type !== "custom" || typeof entry.customType !== "string") return;
    if (entry.customType === "goal-state") {
      this.handleNarumitwGoalEntry(entry.data);
      return;
    }
    if (entry.customType === "pi-codex-goal") {
      this.handleCodexGoalEntry(entry.data);
      return;
    }
    this.emitPluginActivity(entry.customType, entry.data);
  }

  private handleNarumitwGoalEntry(rawData: unknown): void {
    const data = recordOf(rawData);
    if (!data || !("goal" in data)) return;
    const rawGoal = data.goal;
    if (rawGoal === null) {
      this.clearGoalItem();
      return;
    }
    const goal = readNarumitwGoal(rawGoal);
    if (goal) this.upsertGoalItem(goal);
  }

  private handleCodexGoalEntry(rawData: unknown): void {
    const entry = recordOf(rawData);
    const kind = typeof entry?.kind === "string" ? entry.kind : "";
    if (kind === "set") {
      const goal = readCodexGoal(entry?.goal);
      if (!goal) return;
      this.piCodexGoal = goal;
      this.upsertGoalItem(goal);
      return;
    }
    if (kind === "usage" && this.piCodexGoal) {
      const usage = recordOf(entry?.usage);
      const status = codexGoalStatus(entry?.status);
      const updatedAt = toEpochSeconds(entry?.updatedAt);
      this.piCodexGoal = {
        ...this.piCodexGoal,
        ...(status ? { status } : {}),
        ...(typeof usage?.tokensUsed === "number" ? { tokensUsed: usage.tokensUsed } : {}),
        ...(typeof usage?.activeSeconds === "number"
          ? { timeUsedSeconds: usage.activeSeconds }
          : {}),
        ...(updatedAt !== undefined ? { updatedAt } : {}),
      };
      this.upsertGoalItem(this.piCodexGoal);
      return;
    }
    if (kind === "clear") {
      this.clearGoalItem();
      this.piCodexGoal = undefined;
    }
  }

  private upsertGoalItem(goal: ProviderGoalState): void {
    const isNewGoal = this.goalStartedAt !== undefined && goal.createdAt !== this.goalStartedAt;
    if (!this.goalItemId || isNewGoal) {
      this.goalItemId = this.nextItemId("goal");
      this.goalStartedAt = goal.createdAt;
      const payload = goalPayloadFromProviderState(
        goal,
        goal.status === "active" ? "set" : "updated",
      );
      for (const runtimeEvent of startGoalItemEvents(
        this.input.threadId,
        this.goalItemId,
        payload,
      )) {
        this.emit(runtimeEvent);
      }
    } else {
      for (const runtimeEvent of updateGoalItemEvents(
        this.input.threadId,
        this.goalItemId,
        goalPayloadFromProviderState(goal, "updated"),
      )) {
        this.emit(runtimeEvent);
      }
    }
    this.lastPiGoalStatus = goal.status;
  }

  private clearGoalItem(): void {
    // Completion is persisted before clear; retain it, but dismiss manual clears.
    if (this.goalItemId && this.lastPiGoalStatus !== "complete") {
      for (const runtimeEvent of updateGoalItemEvents(this.input.threadId, this.goalItemId, {
        action: "cleared",
      })) {
        this.emit(runtimeEvent);
      }
    }
    this.goalItemId = undefined;
    this.goalStartedAt = undefined;
    this.lastPiGoalStatus = undefined;
  }

  /** Render arbitrary Pi plugin session entries with their raw data intact. */
  private emitPluginActivity(customType: string, data: unknown): void {
    const itemId = this.nextItemId("plugin-entry");
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId,
      itemType: "dynamic_tool_call",
      payload: {
        name: customType,
        title: customType,
        kind: "other",
        result: data,
        status: "success",
      },
    });
    this.emit({ type: "item.completed", threadId: this.input.threadId, itemId });
  }

  private handleExit(): void {
    if (this.disposed) return;
    if (this.currentTurnId) this.finishTurn("cancelled");
    const stderr = this.client.stderr;
    this.emit({
      type: "session.exited",
      threadId: this.input.threadId,
      reason: "exited",
      ...(stderr ? { errorMessage: stderr.slice(-500) } : {}),
    });
    this.listener.onClose();
  }

  private ensureAssistantItem(): string {
    if (this.assistantItemId) return this.assistantItemId;
    const itemId = this.nextItemId("assistant");
    this.assistantItemId = itemId;
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId,
      itemType: "assistant_message",
      payload: { content: [] },
    });
    return itemId;
  }

  private ensureReasoningItem(): string {
    if (this.reasoningItemId) return this.reasoningItemId;
    const itemId = this.nextItemId("reasoning");
    this.reasoningItemId = itemId;
    this.emit({
      type: "item.started",
      threadId: this.input.threadId,
      itemId,
      itemType: "reasoning",
      payload: {},
    });
    return itemId;
  }

  private finishTurn(state: "completed" | "cancelled" | "failed" = "completed"): void {
    if (!this.currentTurnId) return;
    this.clearTurnWatchdog();
    this.completeOpenItems();
    this.emit({
      type: "turn.completed",
      threadId: this.input.threadId,
      turnId: this.currentTurnId,
      state,
    });
    this.currentTurnId = undefined;
    this.interruptRequested = false;
    this.publishUpdate(state === "failed" ? "error" : "idle", "none");
    this.resolveTurnCompletion?.();
    this.resolveTurnCompletion = undefined;
    void this.publishContextUsage();
    void this.publishSlashCommands();
  }

  private failTurn(message: string): void {
    this.emit({ type: "error", threadId: this.input.threadId, message });
    if (this.currentTurnId) {
      this.clearTurnWatchdog();
      this.completeOpenItems();
      this.emit({
        type: "turn.completed",
        threadId: this.input.threadId,
        turnId: this.currentTurnId,
        state: "failed",
      });
      this.currentTurnId = undefined;
    }
    this.publishUpdate("error", "none", message);
    this.resolveTurnCompletion?.();
    this.resolveTurnCompletion = undefined;
  }

  private completeOpenItems(): void {
    for (const itemId of [this.reasoningItemId, this.assistantItemId]) {
      if (itemId) this.emit({ type: "item.completed", threadId: this.input.threadId, itemId });
    }
    for (const itemId of this.openToolItems.values()) {
      this.emit({
        type: "item.completed",
        threadId: this.input.threadId,
        itemId,
        payload: { name: "tool", status: "error" },
      });
    }
    this.reasoningItemId = undefined;
    this.assistantItemId = undefined;
    this.openToolItems.clear();
  }

  private async publishContextUsage(): Promise<void> {
    const response = await this.client.request("get_session_stats").catch(() => undefined);
    const stats = recordOf(response?.data);
    const usage = recordOf(stats?.contextUsage);
    const sessionId = typeof stats?.sessionId === "string" ? stats.sessionId : "";
    if (sessionId) {
      this.sessionRef = createKnownSessionRef(sessionId);
      this.publishUsageSpent(stats, sessionId);
    }
    if (!usage) return;
    const tokens = typeof usage.tokens === "number" ? usage.tokens : null;
    const contextWindow = typeof usage.contextWindow === "number" ? usage.contextWindow : 0;
    this.emit({
      type: "context.updated",
      threadId: this.input.threadId,
      usage: {
        ...(tokens !== null ? { usedTokens: tokens } : {}),
        ...(contextWindow > 0 ? { maxTokens: contextWindow } : {}),
      },
    });
  }

  /**
   * Cumulative `usage.spent` from `get_session_stats` — `stats.tokens.total`
   * is pi's billed total for the session and keeps growing across compaction,
   * unlike `contextUsage.tokens` (context-window occupancy for the dock). The
   * ledger counts counter increases per (provider, scopeId, epoch); the epoch
   * bumps if pi ever reports a different session id (session switch/fork), and
   * `fresh` marks a session this process started new (resumed sessions get a
   * baseline-only first sample — inherited history is not new spend).
   */
  private publishUsageSpent(stats: Record<string, unknown> | undefined, sessionId: string): void {
    const totalTokens = readNonNegativeInteger(recordOf(stats?.tokens)?.total);
    if (totalTokens === undefined) return;
    if (this.usageScopeId !== sessionId) {
      const firstScope = this.usageScopeId === undefined;
      if (!firstScope) this.usageEpoch += 1;
      this.usageScopeId = sessionId;
      this.usageScopeFresh = firstScope && !this.launchedWithResume;
    }
    this.emit({
      type: "usage.spent",
      threadId: this.input.threadId,
      usage: {
        counterKind: "cumulative",
        counter: totalTokens,
        scopeId: sessionId,
        epoch: this.usageEpoch,
        ...(this.usageScopeFresh ? { fresh: true } : {}),
        sampleId: `${sessionId}:${this.usageEpoch}:${totalTokens}`,
        ...(this.currentConfig.model ? { model: this.currentConfig.model } : {}),
      },
    });
    this.usageScopeFresh = false;
  }

  private async publishSlashCommands(): Promise<void> {
    const response = await this.client.request("get_commands").catch(() => undefined);
    const list = recordOf(response?.data)?.commands;
    const commands: AgentSlashCommand[] = [];
    if (Array.isArray(list)) {
      for (const entry of list) {
        const record = recordOf(entry);
        const name = typeof record?.name === "string" ? record.name : undefined;
        if (!name) continue;
        const description =
          typeof record?.description === "string" ? record.description : undefined;
        commands.push({
          id: name,
          label: description ? `${name} — ${description}` : name,
          ...(description ? { description } : {}),
        });
      }
    }
    this.listener.onUpdate({
      status: this.currentTurnId ? "working" : "idle",
      attention: this.pendingDialogs.size > 0 ? "needs_reply" : "none",
      config: this.currentConfig,
      ...(this.sessionRef ? { sessionRef: this.sessionRef } : {}),
      slashCommands: commands,
    });
  }

  private publishUpdate(
    status: "idle" | "working" | "needs_reply" | "error",
    attention: "none" | "needs_reply",
    error?: string,
  ): void {
    this.listener.onUpdate({
      status,
      attention,
      config: this.currentConfig,
      ...(this.sessionRef ? { sessionRef: this.sessionRef } : {}),
      ...(error ? { errorMessage: error } : {}),
    });
  }

  private cancelDialogs(): void {
    for (const [requestId] of this.pendingDialogs) {
      this.client.notify({ type: "extension_ui_response", id: requestId, cancelled: true });
      this.emit({
        type: "request.resolved",
        threadId: this.input.threadId,
        requestId,
        outcome: "cancelled",
      });
    }
    this.pendingDialogs.clear();
  }

  private nextItemId(kind: string): string {
    return `pi-${kind}-${++this.itemSequence}`;
  }

  private emit(event: RuntimeEvent): void {
    this.listener.onRuntimeEvent?.(event);
  }
}

function readNarumitwGoal(value: unknown): ProviderGoalState | undefined {
  const goal = recordOf(value);
  if (!goal) return undefined;
  const objective = typeof goal.text === "string" ? goal.text.trim() : "";
  const status = narumitwGoalStatus(goal.status);
  if (!objective || !status) return undefined;
  const createdAt = toEpochSeconds(goal.startedAt);
  const updatedAt = toEpochSeconds(goal.updatedAt);
  return {
    objective,
    status,
    ...(typeof goal.id === "string" ? { providerThreadId: goal.id } : {}),
    ...(typeof goal.tokenBudget === "number" ? { tokenBudget: goal.tokenBudget } : {}),
    ...(typeof goal.tokensUsed === "number" ? { tokensUsed: goal.tokensUsed } : {}),
    ...(typeof goal.timeUsedSeconds === "number" ? { timeUsedSeconds: goal.timeUsedSeconds } : {}),
    ...(typeof goal.iteration === "number" ? { iterations: goal.iteration } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function narumitwGoalStatus(value: unknown): ProviderGoalState["status"] | undefined {
  switch (value) {
    case "active":
    case "paused":
    case "complete":
      return value;
    case "blocked":
      return "paused";
    case "usage_limited":
    case "budget_limited":
      return "budget_limited";
    default:
      return undefined;
  }
}

function readCodexGoal(value: unknown): ProviderGoalState | undefined {
  const goal = recordOf(value);
  if (!goal) return undefined;
  const objective = typeof goal.objective === "string" ? goal.objective.trim() : "";
  const status = codexGoalStatus(goal.status);
  const usage = recordOf(goal.usage);
  if (!objective || !status) return undefined;
  const createdAt = toEpochSeconds(goal.createdAt);
  const updatedAt = toEpochSeconds(goal.updatedAt);
  return {
    objective,
    status,
    ...(typeof goal.goalId === "string" ? { providerThreadId: goal.goalId } : {}),
    ...(typeof goal.tokenBudget === "number" || goal.tokenBudget === null
      ? { tokenBudget: goal.tokenBudget }
      : {}),
    ...(typeof usage?.tokensUsed === "number" ? { tokensUsed: usage.tokensUsed } : {}),
    ...(typeof usage?.activeSeconds === "number" ? { timeUsedSeconds: usage.activeSeconds } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function codexGoalStatus(value: unknown): ProviderGoalState["status"] | undefined {
  switch (value) {
    case "active":
    case "paused":
    case "complete":
      return value;
    case "budgetLimited":
      return "budget_limited";
    default:
      return undefined;
  }
}

function toEpochSeconds(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value > 1_000_000_000_000 ? value / 1_000 : value;
}
