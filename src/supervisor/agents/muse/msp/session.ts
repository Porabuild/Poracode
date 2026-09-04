import type { ChildProcess } from "node:child_process";
import type {
  PromptSegment,
  RuntimeEvent,
  ThreadConfig,
  ThreadServerRequestId,
} from "@/shared/contracts";
import { terminateChildProcessTree } from "@/shared/processTree";
import {
  batchWslCommandsAsync,
  createKnownSessionRef,
  mergeSpawnEnv,
  quotePosixShellArg,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
} from "../../base";
import { resolveAgentBinaryPath } from "../../binaryResolver";
import {
  closePlanAggregator,
  createPlanAggregator,
  replaceAllPlanTasks,
  type PlanStepStatus,
} from "../../planAggregator";
import { buildQuestionAnswerEvents } from "../../questionAnswerEvents";
import { buildMuseServeArgs, toMspApprovalMode } from "./argv";
import {
  aliasMuseMspItem,
  completeOpenMuseMspItems,
  createMuseMspItemMapperState,
  mapMuseMspDelta,
  mapMuseMspGoalChanged,
  mapMuseMspItem,
  type MuseMspItem,
} from "./canonicalMapping";
import { MuseMspClient, spawnMuseServeHost } from "./client";
import {
  MSP_SCHEMA_VERSION,
  MspRpcError,
  parseMspModelListResult,
  type MspModelListResult,
} from "./protocol";
import {
  buildMuseUserInputAnswers,
  isMuseCancelResponse,
  museApprovalRequestType,
  museRequestOutcome,
  readMuseQuestions,
  resolveMuseApprovalChoiceId,
  settledMuseQuestionAnswers,
  type PendingApproval,
  type PendingRequest,
  type PendingUserInput,
} from "./requestMapping";
import { mintMspCommandId } from "./uuidv7";
import { buildMuseTurnInput } from "./turnInput";

/** Best-effort budget for the optional `model/list` provider lookup at launch. */
const MSP_PROVIDER_LOOKUP_TIMEOUT_MS = 10_000;

const NOOP_LISTENER: StructuredSessionListener = {
  onClose() {},
  onError() {},
  onUpdate() {},
};

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function turnState(value: unknown): "completed" | "failed" | "cancelled" {
  if (value === "failed") return "failed";
  if (value === "cancelled") return "cancelled";
  return "completed";
}

function approvalPolicyFromMspMode(
  mode: unknown,
  current: ThreadConfig["approvalPolicy"],
): ThreadConfig["approvalPolicy"] {
  if (mode === "promptUnmatched") return "untrusted";
  if (mode === "onRequest" || mode === "denyUnmatched") return "on-request";
  if (mode === "allowAll") {
    return current === "yolo" || current === "bypassPermissions" ? current : "never";
  }
  return current;
}

function workspaceRoot(input: CreateStructuredSessionInput): string {
  return input.projectLocation.kind === "wsl"
    ? input.projectLocation.linuxPath
    : input.projectLocation.path;
}

/** Structured Muse Code GUI session backed by the installed `muse serve` MSP host. */
export class MuseMspStructuredSession implements StructuredSessionHandle {
  readonly launchOptions;
  private listener: StructuredSessionListener = NOOP_LISTENER;
  private readonly mapper;
  private readonly planAggregator;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly pendingUserItems = new Map<string, string>();
  private readonly emittedTurnIds = new Set<string>();
  private readonly completedTurnIds = new Set<string>();
  private readonly ownedSessionIds = new Set<string>();
  private bufferedEvents: RuntimeEvent[] = [];
  private currentConfig: ThreadConfig;
  private sessionId: string | undefined;
  private activeTurnId: string | undefined;
  private pendingTurnStart: Promise<void> | undefined;
  private status: "idle" | "working" | "needs_approval" | "needs_reply" | "error" = "idle";
  private attention: "none" | "working" | "needs_approval" | "needs_reply" = "none";
  private activated = false;
  private disposed = false;
  private transportErrorReported = false;
  private transportCloseReported = false;
  private usageEpoch = 0;
  private usageScopeFresh = false;
  private constructor(
    private readonly input: CreateStructuredSessionInput,
    private readonly child: ChildProcess,
    private readonly client: MuseMspClient,
    private readonly hostCookie: string,
  ) {
    this.launchOptions = {
      suppressResumeConfigOverrides: true,
      ...(input.agentSettings ? { agentSettings: input.agentSettings } : {}),
    };
    this.currentConfig = input.config;
    this.mapper = createMuseMspItemMapperState(input.threadId);
    this.planAggregator = createPlanAggregator(input.threadId, "muse-plan");
    client.onNotification((method, params) => this.handleNotification(method, params));
    client.onError((error) => this.handleTransportError(error));
    client.onServerRequest(({ method, params }) => this.handleServerRequest(method, params));
    child.once("close", (code, signal) => this.handleTransportClose(code, signal));
    child.once("error", (error) => this.handleTransportError(error));
  }

  static async create(input: CreateStructuredSessionInput): Promise<MuseMspStructuredSession> {
    const executablePath = resolveAgentBinaryPath(input.projectLocation, "muse");
    const extraEnv = mergeSpawnEnv(input.baseSpawnEnv, input.env);
    const hosted = await spawnMuseServeHost(input.projectLocation, {
      ...(executablePath ? { executablePath } : {}),
      serveArgs: buildMuseServeArgs(input.config.approvalPolicy),
      ...(extraEnv ? { extraEnv } : {}),
      label: "[muse-msp]",
      isolateCwd: false,
    });
    return new MuseMspStructuredSession(
      input,
      hosted.child,
      new MuseMspClient(hosted.transport),
      hosted.hostCookie,
    );
  }

  ownsProviderSession(providerSessionId: string): boolean {
    return this.ownedSessionIds.has(providerSessionId);
  }

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
    if (listener.onRuntimeEvent && this.bufferedEvents.length > 0) {
      const events = this.bufferedEvents;
      this.bufferedEvents = [];
      for (const event of events) listener.onRuntimeEvent(event);
    }
    this.publishUpdate();
  }

  async activate(): Promise<void> {
    if (this.disposed) throw new Error("Muse MSP session was disposed before activation.");
    const result = await this.client.initialize("poracode", "1.0.0");
    if (result.schema.version !== MSP_SCHEMA_VERSION) {
      throw new Error(
        `Muse MSP schema version ${result.schema.version} is incompatible with supported version ${MSP_SCHEMA_VERSION}.`,
      );
    }
    this.activated = true;
  }

  async openThread(config: ThreadConfig, sessionRef = this.input.sessionRef): Promise<string> {
    if (!this.activated) throw new Error("Muse MSP session is not initialized.");
    this.currentConfig = config;
    const resumeId = sessionRef?.providerSessionId;
    const result = resumeId
      ? await this.client.request("session/resume", {
          commandId: mintMspCommandId(),
          sessionId: resumeId,
          excludeItems: true,
        })
      : await this.client.request("session/start", {
          commandId: mintMspCommandId(),
          workspaceRoot: workspaceRoot(this.input),
          modelId: config.model,
          ...(await this.resolveModelProviderId(config.model)),
          approvalMode: toMspApprovalMode(config.approvalPolicy),
        });
    const session = recordOf(result["session"]);
    const sessionId = stringValue(session?.["sessionId"]);
    if (!sessionId) throw new Error("Muse MSP did not return a session id.");
    this.sessionId = sessionId;
    this.ownedSessionIds.add(sessionId);
    this.usageScopeFresh = !resumeId;
    this.activeTurnId = stringValue(session?.["activeTurnId"]);
    if (resumeId) {
      const approvalMode = recordOf(session?.["approvalMode"]);
      this.currentConfig = {
        ...config,
        model: stringValue(session?.["modelId"]) ?? config.model,
        approvalPolicy: approvalPolicyFromMspMode(approvalMode?.["mode"], config.approvalPolicy),
      };
      await this.applyConfig(config);
    }
    this.refreshWorkingState();
    this.emit({ type: "session.started", threadId: this.input.threadId });
    if (session && "goal" in session && session["goal"]) {
      this.emitMany(mapMuseMspGoalChanged(this.mapper, { goal: session["goal"] }));
    }
    if (session && "todoList" in session && session["todoList"]) {
      this.applyTodoListChanged({ todoList: session["todoList"] });
    }
    if (this.activeTurnId) this.emitTurnStarted(this.activeTurnId);
    this.publishUpdate();
    return sessionId;
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    const start = this.startTurnRequest(prompt, config, segments, options);
    this.pendingTurnStart = start;
    try {
      await start;
    } finally {
      if (this.pendingTurnStart === start) this.pendingTurnStart = undefined;
    }
  }

  private async startTurnRequest(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    const sessionId = this.requireSessionId();
    await this.applyConfig(config);
    const commandId = mintMspCommandId();
    this.pendingUserItems.set(commandId, options?.userMessageItemId ?? `user-${commandId}`);
    this.status = "working";
    this.attention = "working";
    this.publishUpdate();
    try {
      const result = await this.client.request("turn/start", {
        commandId,
        sessionId,
        input: await buildMuseTurnInput(prompt, options?.inlineInstructions),
        displayText: prompt,
        ...(config.effort ? { reasoningEffort: config.effort } : {}),
      });
      const turnId = stringValue(result["turnId"]) ?? commandId;
      if (result["disposition"] === "started" && !this.completedTurnIds.has(turnId)) {
        this.activeTurnId = turnId;
        this.emitTurnStarted(turnId);
      }
    } catch (error) {
      this.pendingUserItems.delete(commandId);
      this.failTurn(commandId, errorMessage(error));
      throw error;
    }
  }

  async steerTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void> {
    for (;;) {
      if (!this.activeTurnId && this.pendingTurnStart) await this.pendingTurnStart;
      if (!this.activeTurnId) return this.startTurn(prompt, config, segments, options);
      const expectedTurnId = this.activeTurnId;
      await this.applyConfig(config);
      const commandId = mintMspCommandId();
      this.pendingUserItems.set(commandId, options?.userMessageItemId ?? `user-${commandId}`);
      try {
        await this.client.request("turn/steer", {
          commandId,
          sessionId: this.requireSessionId(),
          expectedTurnId,
          input: await buildMuseTurnInput(prompt, options?.inlineInstructions),
          ...(config.effort ? { reasoningEffort: config.effort } : {}),
        });
        return;
      } catch (error) {
        this.pendingUserItems.delete(commandId);
        if (error instanceof MspRpcError && error.kind === "commandRejected") {
          if (this.activeTurnId && this.activeTurnId !== expectedTurnId) {
            continue;
          }
          if (this.activeTurnId === expectedTurnId) this.activeTurnId = undefined;
          await this.startTurn(prompt, config, segments, options);
          return;
        }
        throw error;
      }
    }
  }

  async interruptTurn(): Promise<void> {
    if (!this.sessionId || this.disposed || !this.activeTurnId) return;
    await this.client.request("turn/interrupt", {
      commandId: mintMspCommandId(),
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      retract: false,
    });
  }

  forceCompleteTurn(): void {
    if (!this.activeTurnId) return;
    this.completeTurn(this.activeTurnId, "cancelled");
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const id = String(requestId);
    const pending = this.pendingRequests.get(id);
    if (!pending) throw new Error(`Muse MSP request ${id} is no longer pending.`);
    if (pending.kind === "approval") {
      await this.resolveApproval(pending, response);
      return;
    }
    await this.resolveUserInput(pending, response);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.emitMany(closePlanAggregator(this.planAggregator));
    for (const requestId of this.pendingRequests.keys()) {
      this.emit({
        type: "request.resolved",
        threadId: this.input.threadId,
        requestId,
        outcome: "cancelled",
      });
    }
    this.pendingRequests.clear();
    if (this.activeTurnId) this.completeTurn(this.activeTurnId, "cancelled");
    this.client.dispose();
    terminateChildProcessTree(this.child, { ownedProcessGroup: process.platform !== "win32" });
    this.killSurvivingWslHost();
    this.emit({ type: "session.exited", threadId: this.input.threadId, reason: "disposed" });
    this.listener.onClose();
  }

  /**
   * Terminating the Windows-side `wsl.exe` wrapper cannot be relied on to
   * signal the Linux-side `muse serve` it launched — a surviving host keeps
   * its sessions locked (`session/resume` then fails `sessionInUse` forever)
   * and leaks CPU. The host carries a unique cookie in its environ; sweep
   * /proc for it and kill what matches. Best-effort: the bridge may be gone
   * (app teardown) or the process may already be dead.
   */
  private killSurvivingWslHost(): void {
    const location = this.input.projectLocation;
    if (location.kind !== "wsl") return;
    void batchWslCommandsAsync(location.distro, [
      `pids=$(grep -ls ${quotePosixShellArg(this.hostCookie)} /proc/[0-9]*/environ 2>/dev/null | tr -dc '0-9\\n '); [ -n "$pids" ] && kill -9 $pids 2>/dev/null; true`,
    ]).catch(() => {});
  }

  private requireSessionId(): string {
    if (this.disposed) throw new Error("Muse MSP session is closed.");
    if (!this.sessionId) throw new Error("Muse MSP session is not open.");
    return this.sessionId;
  }

  /**
   * The model catalog's provider route for the requested model. The CLI always
   * routes through this table, but `session/start` without `providerId` falls
   * back to the server default — a different route whose retained-history
   * policy rejects media ("retained media history is unsupported"), so as soon
   * as the agent reads an attached image the whole turn fails. Best-effort:
   * when the catalog is unavailable, omit the field and keep the server
   * default. Short timeout — this lookup is optional and must not stall the
   * launch when the host is wedged.
   */
  private async resolveModelProviderId(modelId: string): Promise<Record<string, string>> {
    try {
      const catalog = parseMspModelListResult(
        await this.client.request("model/list", {}, MSP_PROVIDER_LOOKUP_TIMEOUT_MS),
      );
      const providerId = this.catalogProviderId(catalog, modelId);
      return providerId ? { providerId } : {};
    } catch {
      return {};
    }
  }

  /** Catalog route for a model: its own entry's provider, else the catalog default. */
  private catalogProviderId(catalog: MspModelListResult, modelId: string): string {
    return (
      catalog.models.find((model) => model.modelId === modelId)?.providerId || catalog.providerId
    );
  }

  private async applyConfig(config: ThreadConfig): Promise<void> {
    const sessionId = this.requireSessionId();
    if (config.model !== this.currentConfig.model) {
      const catalog = parseMspModelListResult(
        await this.client.request("model/list", { sessionId }),
      );
      const providerId = this.catalogProviderId(catalog, config.model);
      await this.client.request("session/setModel", {
        commandId: mintMspCommandId(),
        sessionId,
        model: {
          modelId: config.model,
          ...(providerId ? { providerId } : {}),
          ...(catalog.profileId ? { profileId: catalog.profileId } : {}),
        },
      });
    }
    if (config.approvalPolicy !== this.currentConfig.approvalPolicy) {
      await this.client.request("session/setApprovalMode", {
        commandId: mintMspCommandId(),
        sessionId,
        mode: toMspApprovalMode(config.approvalPolicy),
      });
    }
    this.currentConfig = config;
    this.publishUpdate();
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    if (this.disposed || (this.sessionId && params["sessionId"] !== this.sessionId)) return;
    switch (method) {
      case "turn/started": {
        const turnId = stringValue(params["turnId"]);
        if (!turnId) return;
        this.activeTurnId = turnId;
        this.status = "working";
        this.attention = "working";
        this.emitTurnStarted(turnId);
        this.publishUpdate();
        return;
      }
      case "turn/completed": {
        const turnId = stringValue(params["turnId"]);
        if (!turnId) return;
        const state = turnState(params["terminal"]);
        if (state === "failed") {
          const error = recordOf(params["error"]);
          const message = stringValue(error?.["message"]) ?? stringValue(params["reason"]);
          if (message) this.emit({ type: "error", threadId: this.input.threadId, message });
        }
        this.completeTurn(turnId, state);
        return;
      }
      case "item/started":
      case "item/updated":
      case "item/completed": {
        const item = recordOf(params["item"]);
        if (!item) return;
        const childSessionId = stringValue(item["childSessionId"]);
        if (childSessionId) this.ownedSessionIds.add(childSessionId);
        const providerItemId = stringValue(item["itemId"]);
        const commandId = stringValue(item["commandId"]);
        const optimisticId = commandId ? this.pendingUserItems.get(commandId) : undefined;
        if (providerItemId && optimisticId) {
          aliasMuseMspItem(this.mapper, providerItemId, optimisticId);
          this.pendingUserItems.delete(commandId!);
        }
        this.emitMany(
          mapMuseMspItem(
            this.mapper,
            item as MuseMspItem,
            method === "item/started"
              ? "started"
              : method === "item/updated"
                ? "updated"
                : "completed",
          ),
        );
        return;
      }
      case "item/delta":
        this.emitMany(mapMuseMspDelta(this.mapper, params));
        return;
      case "approval/requested":
      case "approval/updated":
        this.openApproval(params);
        return;
      case "approval/resolved":
        this.resolveRequestFromNotification(stringValue(params["approvalId"]), params["decision"]);
        return;
      case "userInput/requested":
        this.openUserInput(params);
        return;
      case "userInput/settled":
        this.resolveRequestFromNotification(
          stringValue(params["userInputId"]),
          params["outcome"],
          params,
        );
        return;
      case "session/contextUsage": {
        const usedTokens = numberValue(params["usedTokens"]);
        const maxTokens = numberValue(params["windowTokens"]);
        if (usedTokens === undefined && maxTokens === undefined) return;
        this.emit({
          type: "context.updated",
          threadId: this.input.threadId,
          usage: {
            ...(usedTokens !== undefined ? { usedTokens } : {}),
            ...(maxTokens !== undefined && maxTokens > 0 ? { maxTokens } : {}),
          },
        });
        return;
      }
      case "session/tokenUsage":
        this.handleUsage(params);
        return;
      case "session/modelChanged": {
        const model = recordOf(params["model"]);
        const modelId = stringValue(model?.["modelId"]) ?? stringValue(params["modelId"]);
        if (modelId) this.currentConfig = { ...this.currentConfig, model: modelId };
        this.publishUpdate();
        return;
      }
      case "session/approvalModeChanged":
        this.currentConfig = {
          ...this.currentConfig,
          approvalPolicy: approvalPolicyFromMspMode(
            params["mode"],
            this.currentConfig.approvalPolicy,
          ),
        };
        this.publishUpdate();
        return;
      case "session/goalChanged":
        this.emitMany(mapMuseMspGoalChanged(this.mapper, params));
        return;
      case "session/todoListChanged": {
        this.applyTodoListChanged(params);
        return;
      }
    }
  }

  private applyTodoListChanged(params: Record<string, unknown>): void {
    const rawItems = params["items"] ?? (recordOf(params["todoList"])?.["items"] as unknown);
    const items = Array.isArray(rawItems) ? rawItems : [];
    const tasks = items.map((raw, index) => {
      const item = recordOf(raw);
      let text =
        stringValue(item?.["activeForm"]) ?? stringValue(item?.["text"]) ?? `Task ${index + 1}`;
      const statusRaw = stringValue(item?.["status"]);
      // The plan dock has no cancelled state — a cancelled todo is done-not-done,
      // so it lands on "completed" with the cancellation kept in the label.
      const cancelled = statusRaw === "cancelled";
      if (cancelled) text = `${text} (cancelled)`;
      const status: PlanStepStatus = cancelled
        ? "completed"
        : statusRaw === "inProgress" || statusRaw === "in_progress"
          ? "in_progress"
          : statusRaw === "completed"
            ? "completed"
            : "pending";
      return { key: `task-${index}`, description: text, status };
    });
    this.emitMany(replaceAllPlanTasks(this.planAggregator, tasks));
  }

  private handleServerRequest(
    method: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    if (method === "approval/request") {
      if (!this.pendingRequests.has(stringValue(params["approvalId"]) ?? "")) {
        this.openApproval(params);
      }
      return {};
    }
    if (method === "userInput/request") {
      if (!this.pendingRequests.has(stringValue(params["userInputId"]) ?? "")) {
        this.openUserInput(params);
      }
      return {};
    }
    throw new Error(`Unsupported Muse MSP server request: ${method}`);
  }

  private emitTurnStarted(turnId: string): void {
    if (this.emittedTurnIds.has(turnId)) return;
    this.emittedTurnIds.add(turnId);
    this.emit({ type: "turn.started", threadId: this.input.threadId, turnId });
  }

  private completeTurn(turnId: string, state: "completed" | "failed" | "cancelled"): void {
    if (this.completedTurnIds.has(turnId)) return;
    this.completedTurnIds.add(turnId);
    this.emitTurnStarted(turnId);
    this.emitMany(completeOpenMuseMspItems(this.mapper));
    this.emit({ type: "turn.completed", threadId: this.input.threadId, turnId, state });
    if (this.activeTurnId === turnId) this.activeTurnId = undefined;
    this.status = state === "failed" ? "error" : "idle";
    this.attention = "none";
    this.publishUpdate();
  }

  private failTurn(turnId: string, message: string): void {
    this.emit({ type: "error", threadId: this.input.threadId, message });
    this.completeTurn(turnId, "failed");
  }

  private openApproval(params: Record<string, unknown>): void {
    const approvalId = stringValue(params["approvalId"]);
    const requirementId = recordOf(params["currentRequirementId"]);
    const choices = Array.isArray(params["availableChoices"])
      ? params["availableChoices"].flatMap((choice) =>
          recordOf(choice) ? [recordOf(choice)!] : [],
        )
      : [];
    if (!approvalId || !requirementId || choices.length === 0) return;
    this.pendingRequests.set(approvalId, { kind: "approval", approvalId, requirementId, choices });
    const subject = recordOf(params["subject"]);
    const toolName =
      stringValue(params["toolName"]) ?? stringValue(subject?.["toolName"]) ?? "Tool";
    this.emit({
      type: "request.opened",
      threadId: this.input.threadId,
      requestId: approvalId,
      requestType: museApprovalRequestType(subject),
      payload: {
        summary: stringValue(subject?.["command"]) ?? stringValue(subject?.["path"]) ?? toolName,
        details: {
          toolName,
          displayName: toolName,
          input: subject ?? params["rawArgs"],
          toolUseID: stringValue(params["toolCallId"]),
        },
        options: choices.flatMap((choice) => {
          const id = stringValue(choice["choiceId"]);
          const label = stringValue(choice["label"]);
          return id && label ? [{ optionId: id, label }] : [];
        }),
      },
    });
    this.resumeWorkingState();
  }

  private openUserInput(params: Record<string, unknown>): void {
    const userInputId = stringValue(params["userInputId"]);
    const questions = readMuseQuestions(params);
    if (!userInputId || questions.length === 0) return;
    this.pendingRequests.set(userInputId, { kind: "userInput", userInputId, questions });
    this.emit({
      type: "request.opened",
      threadId: this.input.threadId,
      requestId: userInputId,
      requestType: "tool_user_input",
      payload: {
        summary: questions[0]!.question,
        details: {
          userInputForm: {
            questions: questions.map((question) => ({
              id: question.id,
              header: question.header,
              question: question.question,
              multiSelect: question.multiSelect,
              options: question.options,
            })),
          },
        },
      },
    });
    this.resumeWorkingState();
  }

  private async resolveApproval(pending: PendingApproval, response: unknown): Promise<void> {
    const choiceId = resolveMuseApprovalChoiceId(pending, response);
    if (!choiceId) throw new Error("Muse MSP approval supplied no usable choice.");
    await this.client.request("approval/decide", {
      commandId: mintMspCommandId(),
      sessionId: this.requireSessionId(),
      approvalId: pending.approvalId,
      requirementId: pending.requirementId,
      choiceId,
    });
  }

  private async resolveUserInput(pending: PendingUserInput, response: unknown): Promise<void> {
    if (isMuseCancelResponse(response)) {
      await this.client.request("userInput/cancel", {
        commandId: mintMspCommandId(),
        sessionId: this.requireSessionId(),
        userInputId: pending.userInputId,
        reason: "User cancelled the request.",
      });
      return;
    }
    const answers = buildMuseUserInputAnswers(response, pending.questions);
    await this.client.request("userInput/answer", {
      commandId: mintMspCommandId(),
      sessionId: this.requireSessionId(),
      userInputId: pending.userInputId,
      answers,
    });
  }

  private resolveRequestFromNotification(
    requestId: string | undefined,
    outcome: unknown,
    params?: Record<string, unknown>,
  ): void {
    if (!requestId) return;
    const pending = this.pendingRequests.get(requestId);
    if (!pending || !this.pendingRequests.delete(requestId)) return;
    this.emit({
      type: "request.resolved",
      threadId: this.input.threadId,
      requestId,
      outcome: museRequestOutcome(outcome),
    });
    if (pending.kind === "userInput" && outcome === "answered") {
      this.emitMany(
        buildQuestionAnswerEvents({
          threadId: this.input.threadId,
          itemId: `muse-question-${mintMspCommandId()}`,
          questions: pending.questions.map((question) => ({
            keys: [question.id, question.question],
            header: question.header,
            question: question.question,
            options: question.options,
          })),
          answers: settledMuseQuestionAnswers(params?.["answers"]),
        }),
      );
    }
    this.resumeWorkingState();
  }

  private refreshWorkingState(): void {
    const requests = [...this.pendingRequests.values()];
    if (requests.some((request) => request.kind === "userInput")) {
      this.status = "needs_reply";
      this.attention = "needs_reply";
    } else if (requests.some((request) => request.kind === "approval")) {
      this.status = "needs_approval";
      this.attention = "needs_approval";
    } else {
      this.status = this.activeTurnId ? "working" : "idle";
      this.attention = this.activeTurnId ? "working" : "none";
    }
  }

  private resumeWorkingState(): void {
    this.refreshWorkingState();
    this.publishUpdate();
  }

  private handleUsage(params: Record<string, unknown>): void {
    const cumulative = recordOf(params["cumulative"]);
    const counter = numberValue(cumulative?.["totalTokens"]);
    if (!this.sessionId || counter === undefined) return;
    this.emit({
      type: "usage.spent",
      threadId: this.input.threadId,
      usage: {
        counterKind: "cumulative",
        counter,
        scopeId: this.sessionId,
        epoch: this.usageEpoch,
        ...(this.usageScopeFresh ? { fresh: true } : {}),
        sampleId: `${this.sessionId}:${this.usageEpoch}:${counter}`,
        ...(stringValue(params["turnId"]) ? { turnId: stringValue(params["turnId"]) } : {}),
        ...(stringValue(params["modelId"]) ? { model: stringValue(params["modelId"]) } : {}),
      },
    });
    this.usageScopeFresh = false;
  }

  private publishUpdate(): void {
    this.listener.onUpdate({
      status: this.status,
      attention: this.attention,
      config: this.currentConfig,
      ...(this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {}),
    });
  }

  private emitMany(events: readonly RuntimeEvent[]): void {
    for (const event of events) this.emit(event);
  }

  private emit(event: RuntimeEvent): void {
    if (!this.listener.onRuntimeEvent) {
      this.bufferedEvents.push(event);
      return;
    }
    this.listener.onRuntimeEvent(event);
  }

  private handleTransportError(error: Error): void {
    if (this.disposed || this.transportErrorReported) return;
    this.transportErrorReported = true;
    this.listener.onError(error.message);
  }

  private handleTransportClose(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.disposed || this.transportCloseReported) return;
    this.transportCloseReported = true;
    if (this.activeTurnId) this.completeTurn(this.activeTurnId, "failed");
    const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    this.emit({ type: "session.exited", threadId: this.input.threadId, reason: "exited" });
    this.listener.onError(`Muse MSP server exited unexpectedly (${detail}).`);
    this.listener.onClose();
  }
}
