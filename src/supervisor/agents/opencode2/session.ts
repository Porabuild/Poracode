import { openCode2SnapshotEvents, readOpenCode2Recovery } from "./recovery";
/**
 * OpenCode 2 structured session.
 *
 * One class powers two flows, mirroring OpenCode 1's SDK session:
 *  - **Terminal mode** (default): the runtime calls `activate` → `openThread`
 *    to allocate a session id from the shared `opencode2 serve`, captures it
 *    into `launchOptions.resumeThreadId`, then disposes the handle
 *    (`liveInputMode === "terminal"`). The TUI launches with `--session <id>`
 *    and resumes from the on-disk session store.
 *  - **GUI mode**: the handle stays alive for the thread's lifetime. The
 *    shared SSE stream routes V2 events through `eventMapping` → renderer
 *    chat items. `startTurn` calls `session.prompt`; a follow-up submitted
 *    while a turn is running goes native (`delivery: "steer"` — the server
 *    owns the merge, so no local interrupt/queue bookkeeping is needed).
 *
 * The server lease is taken in `create` so an unspawnable sidecar fails the
 * start with a classified message before any session exists.
 */

import type {
  PromptSegment,
  ResolvedMcpServer,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadServerRequestId,
  ThreadStatus,
} from "@/shared/contracts";
import {
  createKnownSessionRef,
  type AgentLaunchOptions,
  type CreateStructuredSessionInput,
  type StartTurnOptions,
  type StructuredSessionHandle,
  type StructuredSessionListener,
  type StructuredTurnResult,
  type ThreadHistory,
} from "../base";
import { newItemId } from "../contextUsage";
import {
  acquireOpenCode2Server,
  resolveOpenCode2SessionDirectory,
  type AcquiredOpenCode2Server,
} from "./client";
import type { OpenCode2Client, SessionInfo, V2Event } from "./clientTypes";
import { subscribeOpenCode2ServerEvents, waitForOpenCode2ServerEvents } from "./eventHub";
import {
  closeOpenCode2Items,
  createOpenCode2MapperState,
  mapOpenCode2Event,
  readOpenCode2EventSessionID,
  settleOpenCode2TurnIfActive,
  setOpenCode2SessionId,
  steerOpenCode2Turn,
  type OpenCode2MapperState,
} from "./eventMapping";
import { classifyOpenCode2Error, isOpenCode2ConnectionLoss } from "./opencode2Errors";
import { openCode2FormRequestId, openCode2PermissionRequestId } from "./requestPayloads";
import { buildOpenCode2PromptPayload } from "./promptText";
import { buildOpenCode2SessionPermissions } from "./permissions";
import { modelRefKey, parseOpenCode2ModelRef } from "./model";
import { parseFormAnswer, parsePermissionReply } from "./requestResponses";
import {
  readOpenCode2Messages,
  rollbackOpenCode2Messages,
  toThreadHistoryEntries,
} from "./history";
import { OpenCode2Subagents } from "./subagents";
import {
  mapOpenCode2Agents,
  mapOpenCode2Commands,
  mapOpenCode2Skills,
  submitOpenCode2Prompt,
  type OpenCode2Command,
} from "./commands";

/** Tolerance for server-vs-supervisor clock skew when filtering replayed events. */
const OPENCODE2_EVENT_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

interface PendingPermission {
  kind: "permission";
  requestID: string;
  sessionID: string;
}

interface PendingForm {
  kind: "form";
  formID: string;
  sessionID: string;
}

type PendingRequest = PendingPermission | PendingForm;

export class OpenCode2Session implements StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;

  private readonly input: CreateStructuredSessionInput;
  private readonly threadId: string;
  private readonly isGui: boolean;
  private readonly directory: string;
  private readonly mapperState: OpenCode2MapperState;
  private readonly subagents: OpenCode2Subagents;
  private listener: StructuredSessionListener | undefined;
  private acquired: AcquiredOpenCode2Server | undefined;
  private sessionId: string | undefined;
  private unsubscribeEvents: (() => void) | undefined;
  private unsubscribeServerExit: (() => void) | undefined;
  private reacquirePromise: Promise<void> | undefined;
  private bufferedRuntimeEvents: RuntimeEvent[] = [];
  private currentConfig: ThreadConfig | undefined;
  /** Composite key of the model/variant last applied via `switchModel`. */
  private appliedModelKey: string | undefined;
  private appliedApprovalPolicy: string | undefined;
  private appliedAgent: string | undefined;
  private selectedAgent: string | undefined;
  private disposed = false;
  private recoveredBefore = 0;
  private slashCommands: OpenCode2Command[] = [];
  private readonly cancelledRequestIds = new Set<ThreadServerRequestId>();
  private pendingRequests = new Map<ThreadServerRequestId, PendingRequest>();
  /** Live MCP set; starts from the launch input, replaced by settings saves. */
  private mcpServers: readonly ResolvedMcpServer[] | undefined;

  private constructor(input: CreateStructuredSessionInput) {
    this.input = input;
    this.threadId = input.threadId;
    this.isGui = input.presentationMode === "gui";
    this.directory = resolveOpenCode2SessionDirectory(input.projectLocation);
    this.currentConfig = input.config;
    this.mcpServers = input.mcpServers;
    this.mapperState = createOpenCode2MapperState(input.threadId);
    this.subagents = new OpenCode2Subagents(this.mapperState);
    this.launchOptions = { suppressResumeConfigOverrides: true };
  }

  /**
   * Acquire the shared sidecar up front: a session id is only meaningful
   * while a server is around to serve it, so a failed spawn fails the start
   * before the runtime records anything.
   */
  static async create(input: CreateStructuredSessionInput): Promise<OpenCode2Session> {
    const session = new OpenCode2Session(input);
    try {
      session.acquired = await acquireOpenCode2Server(session.buildAcquireInput());
    } catch (cause) {
      throw new Error(classifyOpenCode2Error({ cause, operation: "start opencode2 serve" }), {
        cause,
      });
    }
    // The event stream is subscribed BEFORE any prompt: the V2 API has no
    // replay (live-tail only), so a prompt sent ahead of the subscription
    // would drop its whole turn from the chat.
    if (session.isGui) {
      session.startEventStream();
      session.startServerExitRecovery();
    }
    return session;
  }

  async activate(): Promise<void> {
    if (this.disposed) throw new Error("OpenCode2Session was disposed before activation.");
  }

  ownsProviderSession(providerSessionId: string): boolean {
    return providerSessionId === this.sessionId || this.subagents.owns(providerSessionId);
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
        ...(this.pendingRequestStatus() ??
          (this.mapperState.turnActive
            ? { status: "working", attention: "working" }
            : { status: "idle", attention: "none" })),
        sessionRef: createKnownSessionRef(this.sessionId),
        ...(this.isGui ? { slashCommands: this.slashCommands } : {}),
      });
    }
  }

  async openThread(config: ThreadConfig, sessionRef?: SessionRef): Promise<string> {
    const acquired = this.requireAcquired();
    this.currentConfig = config;
    const location = { directory: this.directory };
    const signal = AbortSignal.timeout(60_000);
    await acquired.client.plugin.awaitActivation({ location }, { signal });
    if (this.isGui) {
      const [commands, skills, agents] = await Promise.all([
        acquired.client.command.list({ location }, { signal }),
        acquired.client.skill.list({ location }, { signal }),
        acquired.client.agent.list({ location }, { signal }),
      ]);
      this.slashCommands = [
        ...mapOpenCode2Commands(commands.data),
        ...mapOpenCode2Skills(skills.data, this.directory),
        ...mapOpenCode2Agents(agents.data),
      ];
      this.listener?.onUpdate({
        status: "idle",
        attention: "none",
        slashCommands: this.slashCommands,
      });
    }

    const resumeSessionId =
      sessionRef?.providerSessionId ?? this.input.sessionRef?.providerSessionId;
    if (resumeSessionId) {
      let existing: SessionInfo | undefined;
      try {
        existing = await acquired.client.session.get({ sessionID: resumeSessionId });
      } catch (cause) {
        // Keep the reference and surface resume failures: silently replacing it
        // would discard the provider's conversation while keeping the GUI history.
        throw new Error(this.classifyError(cause, "session.get"), { cause });
      }
      if (!existing?.id) {
        throw new Error(
          `OpenCode 2 session ${resumeSessionId} was not found. Resume cannot start a replacement conversation.`,
        );
      }
      this.selectedAgent = existing.agent;
      this.rememberSessionId(existing.id);
      setOpenCode2SessionId(this.mapperState, existing.id);
      if (this.isGui) {
        for (const message of await readOpenCode2Messages(acquired.client, existing.id)) {
          if (message.type === "assistant" && message.time.completed !== undefined)
            this.mapperState.completedMessages.add(message.id);
        }
        await waitForOpenCode2ServerEvents(acquired.client);
        await this.reconcileStream();
      } else await this.syncConfig(acquired, existing.id, config);
      return existing.id;
    }

    const createSession = (client: OpenCode2Client) =>
      client.session.create({
        title: `poracode/${this.threadId.slice(0, 8)}`,
        location: { directory: this.directory },
        permissions: buildOpenCode2SessionPermissions(config.approvalPolicy),
      });
    let created: SessionInfo;
    try {
      created = await createSession(acquired.client);
    } catch (cause) {
      if (!isOpenCode2ConnectionLoss(cause)) {
        throw new Error(this.classifyError(cause, "session.create"), { cause });
      }
      await this.reacquireOpenCodeServer();
      try {
        created = await createSession(this.requireAcquired().client);
      } catch (retryCause) {
        throw new Error(this.classifyError(retryCause, "session.create"), { cause: retryCause });
      }
    }
    this.rememberSessionId(created.id);
    setOpenCode2SessionId(this.mapperState, created.id, { fresh: true });
    if (!this.isGui) await this.syncConfig(this.requireAcquired(), created.id, config);
    return created.id;
  }

  async startTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void | StructuredTurnResult> {
    if (this.disposed) return;
    await this.reacquirePromise;
    const acquired = this.requireAcquired();
    if (this.isGui) await waitForOpenCode2ServerEvents(acquired.client);
    const sessionID = this.requireSessionId();
    this.currentConfig = config;

    const payload = buildOpenCode2PromptPayload(
      prompt,
      segments,
      this.input.projectLocation,
      options?.inlineInstructions,
    );
    if (payload.text.trim().length === 0 && payload.files.length === 0 && !payload.skills?.length)
      return;
    if (await this.selectAgent(payload.text, config)) return { outcome: "completed-without-turn" };

    try {
      await this.syncConfig(acquired, sessionID, config);
      // Hand the runtime's optimistic user_message id to the mapper so the
      // server's `session.inbox.enqueued` echo reuses it instead of minting a
      // duplicate row for the same prompt. Registered only once admission can
      // actually happen, so a no-op turn never eats a later echo.
      if (
        options?.userMessageItemId &&
        !(
          /^\/compact\s*$/.test(payload.text) &&
          this.slashCommands.some(
            (command) => command.id === "compact" && command.nativeAction === "compact",
          )
        )
      ) {
        this.mapperState.pendingUserMessageItemIds.push(options.userMessageItemId);
      }

      this.mapperState.turnActive = true;
      await submitOpenCode2Prompt(acquired.client, sessionID, payload, this.slashCommands);
    } catch (cause) {
      this.mapperState.turnActive = false;
      if (options?.userMessageItemId) this.removePendingUserMessage(options.userMessageItemId);
      throw new Error(this.classifyError(cause, "session.prompt"), { cause });
    }
  }

  /**
   * V2 owns in-flight steering: the message is delivered onto the live
   * execution and merged server-side, so no in-flight work is preserved
   * locally and `prepareSteerInterrupt` is deliberately not implemented.
   * Idle sessions fall back to `startTurn` so turn accounting stays correct.
   */
  async steerTurn(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void | StructuredTurnResult> {
    if (this.disposed) return;
    if (!this.mapperState.turnActive) return this.startTurn(prompt, config, segments, options);
    await this.reacquirePromise;
    const acquired = this.requireAcquired();
    if (this.isGui) await waitForOpenCode2ServerEvents(acquired.client);
    const sessionID = this.requireSessionId();
    this.currentConfig = config;

    const payload = buildOpenCode2PromptPayload(
      prompt,
      segments,
      this.input.projectLocation,
      options?.inlineInstructions,
    );
    if (payload.text.trim().length === 0 && payload.files.length === 0 && !payload.skills?.length)
      return;

    if (await this.selectAgent(payload.text, config)) return { outcome: "completed-without-turn" };

    const userMessageItemId = options?.userMessageItemId ?? newItemId("user");
    // Paint the steer bubble immediately and register the id so the server's
    // inbox echo consumes it instead of opening a second row.
    this.emitRuntimeEvents(
      steerOpenCode2Turn(this.mapperState, prompt, segments, userMessageItemId),
    );
    this.mapperState.pendingUserMessageItemIds.push(userMessageItemId);

    try {
      // No model sync here: `switchModel` takes effect at a turn boundary and
      // the queued config applies when this turn settles.
      await submitOpenCode2Prompt(acquired.client, sessionID, payload, this.slashCommands, "steer");
    } catch (cause) {
      this.removePendingUserMessage(userMessageItemId);
      throw new Error(this.classifyError(cause, "session.steer"), { cause });
    }
  }

  private async selectAgent(prompt: string, config: ThreadConfig): Promise<boolean> {
    const acquired = this.requireAcquired();
    const sessionID = this.requireSessionId();
    const agentCommand = /^\/agent\/(\S+)\s*$/.exec(prompt);
    if (
      agentCommand &&
      this.slashCommands.some(
        ({ id, nativeAction }) => id === `agent/${agentCommand[1]}` && nativeAction === "agent",
      )
    ) {
      const agent = agentCommand[1]!;
      await acquired.client.session.switchAgent({ sessionID, agent });
      this.selectedAgent = agent;
      this.appliedAgent = agent;
      this.currentConfig = { ...config, mode: agent === "plan" ? "plan" : "agent" };
      this.listener?.onUpdate({
        status: this.mapperState.turnActive ? "working" : "idle",
        attention: this.mapperState.turnActive ? "working" : "none",
        config: this.currentConfig,
        ...this.sessionRefUpdate(),
      });
      return true;
    }
    return false;
  }

  private removePendingUserMessage(itemId: string): void {
    const pending = this.mapperState.pendingUserMessageItemIds;
    const index = pending.indexOf(itemId);
    if (index >= 0) pending.splice(index, 1);
  }

  async interruptTurn(): Promise<void> {
    if (!this.acquired || !this.sessionId) return;
    try {
      await this.acquired.client.session.interrupt({ sessionID: this.sessionId });
    } catch {
      // Best-effort — the server may already be torn down.
    }
  }

  forceCompleteTurn(): void {
    this.emitRuntimeEvents([...this.subagents.close(), ...closeOpenCode2Items(this.mapperState)]);
    this.cancelPendingRequests();
  }

  async resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): Promise<void> {
    const acquired = this.requireAcquired();
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;
    if (pending.kind === "permission") {
      await acquired.client.permission.reply({
        sessionID: pending.sessionID,
        requestID: pending.requestID,
        reply: parsePermissionReply(response),
      });
    } else if (
      response &&
      typeof response === "object" &&
      ["cancel", "decline"].includes(String((response as { action?: unknown }).action))
    ) {
      await acquired.client.form.cancel({ sessionID: pending.sessionID, formID: pending.formID });
    } else {
      const answer = parseFormAnswer(response);
      if (!answer) throw new Error("A form answer is required.");
      await acquired.client.form.reply({
        sessionID: pending.sessionID,
        formID: pending.formID,
        answer,
      });
    }
    // Keep a failed request available for retry; the server event owns the
    // canonical resolution and may have already removed it during the RPC.
    if (this.pendingRequests.delete(requestId)) this.emitUpdateAfterRequestResolution();
  }

  /**
   * Dump the server's view of this session's messages. User text lives at the
   * top level of the message record (unlike the inbox payload); assistant
   * messages carry their typed `content` parts. Auxiliary records
   * (agent-switched / model-switched / system / skill / shell / synthetic /
   * compaction) have no OpenCode 1 counterpart and are dropped, like OpenCode
   * 1's non user/assistant messages.
   */
  async readThread(): Promise<ThreadHistory> {
    const acquired = this.requireAcquired();
    const sessionID = this.requireSessionId();
    try {
      const messages = await readOpenCode2Messages(acquired.client, sessionID);
      return { providerSessionId: sessionID, messages: toThreadHistoryEntries(messages) };
    } catch (cause) {
      throw new Error(this.classifyError(cause, "message.list"), { cause });
    }
  }

  async rollbackThread(numTurns: number): Promise<ThreadHistory> {
    if (this.mapperState.turnActive || this.pendingRequests.size > 0)
      throw new Error("Wait for the current turn before reverting the conversation.");
    await rollbackOpenCode2Messages(
      this.requireAcquired().client,
      this.requireSessionId(),
      numTurns,
    );
    this.emitRuntimeEvents([...this.subagents.close(), ...closeOpenCode2Items(this.mapperState)]);
    return this.readThread();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    this.cancelPendingRequests();
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
    this.unsubscribeServerExit?.();
    this.unsubscribeServerExit = undefined;

    if (this.listener?.onRuntimeEvent) {
      const closing = [...this.subagents.close(), ...closeOpenCode2Items(this.mapperState)];
      for (const ev of closing) this.listener.onRuntimeEvent(ev);
    }

    if (this.acquired) {
      const acquired = this.acquired;
      this.acquired = undefined;
      // The lease is fully released here: a GUI thread closing its handle has
      // no follow-up request to keep the sidecar warm for.
      await acquired.dispose({ closeServerIfIdle: true });
    }

    this.listener?.onClose();
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private rememberSessionId(id: string): void {
    if (this.sessionId !== id) {
      this.appliedApprovalPolicy = undefined;
      this.appliedModelKey = undefined;
      this.appliedAgent = undefined;
    }
    this.sessionId = id;
    this.launchOptions = { ...this.launchOptions, resumeThreadId: id };
  }

  private requireAcquired(): AcquiredOpenCode2Server {
    if (this.disposed || !this.acquired) {
      throw new Error("OpenCode2Session is not active.");
    }
    return this.acquired;
  }

  private requireSessionId(): string {
    if (!this.sessionId) {
      throw new Error("OpenCode2Session.openThread has not completed.");
    }
    return this.sessionId;
  }

  /**
   * Apply the configured model/variant via `session.switchModel` when it
   * differs from the last applied one. V2 applies the switch at the next turn
   * boundary, so this never disturbs an in-flight turn.
   */
  private async syncConfig(
    acquired: AcquiredOpenCode2Server,
    sessionID: string,
    config: ThreadConfig,
  ): Promise<void> {
    const approvalPolicy = config.approvalPolicy ?? "default";
    if (approvalPolicy !== this.appliedApprovalPolicy) {
      await acquired.client.permission.rules({
        sessionID,
        permissions: buildOpenCode2SessionPermissions(approvalPolicy),
      });
      this.appliedApprovalPolicy = approvalPolicy;
    }
    await this.syncModel(acquired, sessionID, config);
    const agent =
      config.mode === "plan"
        ? "plan"
        : this.selectedAgent === "plan"
          ? "build"
          : (this.selectedAgent ?? "build");
    if (agent !== this.appliedAgent) {
      await acquired.client.session.switchAgent({ sessionID, agent });
      this.appliedAgent = agent;
    }
  }

  private async syncModel(
    acquired: AcquiredOpenCode2Server,
    sessionID: string,
    config: ThreadConfig,
  ): Promise<void> {
    const model = parseOpenCode2ModelRef(config.model, config.effort);
    if (!model) return;
    const key = modelRefKey(model);
    if (key === this.appliedModelKey) return;
    await acquired.client.session.switchModel({ sessionID, model });
    this.appliedModelKey = key;
  }

  private sessionRefUpdate(): { sessionRef: SessionRef } | Record<string, never> {
    return this.sessionId ? { sessionRef: createKnownSessionRef(this.sessionId) } : {};
  }

  private cancelPendingRequests(): void {
    for (const requestId of this.pendingRequests.keys()) {
      this.cancelledRequestIds.add(requestId);
      this.emitRuntimeEvents([
        {
          type: "request.resolved",
          threadId: this.threadId,
          requestId: String(requestId),
          outcome: "cancelled",
        },
      ]);
    }
    this.pendingRequests.clear();
  }

  private pendingRequestStatus(): { status: ThreadStatus; attention: ThreadAttention } | undefined {
    let hasForm = false;
    for (const pending of this.pendingRequests.values()) {
      if (pending.kind === "permission") {
        return { status: "needs_approval", attention: "needs_approval" };
      }
      hasForm = true;
    }
    return hasForm ? { status: "needs_reply", attention: "needs_reply" } : undefined;
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
    this.unsubscribeEvents = subscribeOpenCode2ServerEvents({
      client: acquired.client,
      subscription: {
        sessionId: () => this.sessionId,
        acceptsEvent: (event) => this.subagents.accepts(event),
        onEvent: (event) => {
          // Server timestamps come from the `opencode2 serve` clock, which can
          // lag the supervisor clock (notably WSL clock skew). Allow tolerance
          // so legitimate live events — including `permission.asked` — are
          // never dropped as pre-recovery replays.
          if (
            !this.disposed &&
            (!("created" in event) ||
              typeof event.created !== "number" ||
              event.created + OPENCODE2_EVENT_CLOCK_TOLERANCE_MS > this.recoveredBefore)
          )
            this.handleSseEvent(event);
        },
        onReconnect: () => this.reconcileStream(),
      },
    });
  }

  private async reconcileStream(): Promise<void> {
    if (this.disposed || !this.sessionId) return;
    const acquired = this.requireAcquired();
    const sessionIDs = [this.sessionId];
    let recoveredBefore = Date.now();
    for (const sessionID of sessionIDs) {
      const snapshot = await readOpenCode2Recovery(acquired.client, sessionID);
      if (this.disposed || acquired !== this.acquired) return;
      for (const event of openCode2SnapshotEvents(sessionID, snapshot.messages))
        this.handleSseEvent(event);
      const pending = new Set<string>();
      for (const permission of snapshot.permissions) {
        const id = openCode2PermissionRequestId(permission.id);
        pending.add(id);
        if (!this.pendingRequests.has(id))
          this.handleSseEvent({ type: "permission.asked", data: permission } as V2Event);
      }
      for (const form of snapshot.forms) {
        const id = openCode2FormRequestId(form.id);
        pending.add(id);
        if (!this.pendingRequests.has(id))
          this.handleSseEvent({ type: "form.created", data: { form } } as V2Event);
      }
      for (const [id, request] of this.pendingRequests) {
        if (request.sessionID !== sessionID || pending.has(String(id))) continue;
        this.pendingRequests.delete(id);
        this.emitRuntimeEvents([
          {
            type: "request.resolved",
            threadId: this.threadId,
            requestId: String(id),
            outcome: "cancelled",
          },
        ]);
      }
      if (sessionID === this.sessionId && snapshot.active && !this.mapperState.turnActive) {
        this.handleSseEvent({ type: "session.execution.started", data: { sessionID } } as V2Event);
      }
      if (sessionID === this.sessionId && !snapshot.active) {
        this.emitRuntimeEvents(
          settleOpenCode2TurnIfActive(
            this.mapperState,
            snapshot.outcome === "failed"
              ? "failed"
              : snapshot.outcome === "interrupted"
                ? "interrupted"
                : "completed",
          ),
        );
      }
      recoveredBefore = Math.min(recoveredBefore, snapshot.since);
      for (const childID of this.subagents.sessionIds())
        if (!sessionIDs.includes(childID)) sessionIDs.push(childID);
      if (sessionID === this.sessionId)
        this.emitUpdate({
          ...(this.pendingRequestStatus() ??
            (snapshot.active
              ? { status: "working", attention: "working" }
              : { status: "idle", attention: "none" })),
          ...this.sessionRefUpdate(),
        });
    }
    // Keep pending optimistic user-message ids across reconnects: the server's
    // `session.inbox.enqueued` echo can arrive after recovery, and clearing
    // here would mint a duplicate user row for the same prompt.
    this.recoveredBefore = recoveredBefore;
  }

  private startServerExitRecovery(): void {
    const acquired = this.requireAcquired();
    this.unsubscribeServerExit = acquired.onServerExit?.(() => {
      if (this.disposed || this.acquired !== acquired) return;
      this.emitRuntimeEvents([...this.subagents.close(), ...closeOpenCode2Items(this.mapperState)]);
      this.cancelPendingRequests();
      this.appliedApprovalPolicy = undefined;
      this.appliedModelKey = undefined;
      this.appliedAgent = undefined;
      this.emitUpdate({ status: "idle", attention: "none", ...this.sessionRefUpdate() });
      void this.reacquireOpenCodeServer().catch((cause) => {
        if (this.disposed) return;
        const message = classifyOpenCode2Error({ cause, operation: "restart opencode2 serve" });
        this.emitRuntimeEvents([{ type: "error", threadId: this.threadId, message }]);
        this.listener?.onError(message);
      });
    });
  }

  private reacquireOpenCodeServer(): Promise<void> {
    if (this.reacquirePromise) return this.reacquirePromise;
    let tracked: Promise<void>;
    tracked = this.replaceOpenCodeServer().finally(() => {
      if (this.reacquirePromise === tracked) this.reacquirePromise = undefined;
    });
    this.reacquirePromise = tracked;
    return tracked;
  }

  private async replaceOpenCodeServer(): Promise<void> {
    const previous = this.acquired;
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
    this.unsubscribeServerExit?.();
    this.unsubscribeServerExit = undefined;
    this.acquired = undefined;
    // A fresh server handle has no in-memory session state: force the next
    // turn to re-apply the permission policy, model, and agent instead of
    // skipping them as unchanged.
    this.appliedApprovalPolicy = undefined;
    this.appliedModelKey = undefined;
    this.appliedAgent = undefined;
    await previous?.dispose().catch((error) => {
      console.warn("[opencode2] failed to dispose previous session:", error);
    });
    if (this.disposed) return;

    const acquired = await acquireOpenCode2Server(this.buildAcquireInput());
    if (this.disposed) {
      await acquired.dispose({ closeServerIfIdle: true });
      return;
    }
    this.acquired = acquired;
    if (this.isGui) {
      this.startEventStream();
      this.startServerExitRecovery();
      // Fresh hubs skip onReconnect on first connect; recover before the next prompt.
      if (this.sessionId) {
        await waitForOpenCode2ServerEvents(acquired.client);
        if (this.disposed || this.acquired !== acquired) return;
        await this.reconcileStream();
      }
    }
  }

  /**
   * Assemble a provider-neutral acquisition for this session. The shared
   * server owns the directory-scoped client and MCP state.
   */
  private buildAcquireInput() {
    const { mcpServers } = this;
    return {
      projectLocation: this.input.projectLocation,
      ...(mcpServers !== undefined ? { mcpServers } : {}),
    };
  }

  /**
   * Apply a new provider-level MCP set to this directory instance (provider
   * settings "Save") without replacing the acquisition or the SSE stream.
   * No-op before `openThread` — the launch path already uses the latest set.
   */
  async updateMcpServers(mcpServers: readonly ResolvedMcpServer[]): Promise<void> {
    this.mcpServers = mcpServers;
    if (this.disposed || !this.acquired) return;
    try {
      await this.acquired.updateMcpServers(mcpServers);
    } catch (cause) {
      if (!isOpenCode2ConnectionLoss(cause)) throw cause;
      await this.reacquireOpenCodeServer();
    }
  }

  private classifyError(cause: unknown, operation: string): string {
    const message = classifyOpenCode2Error({
      cause,
      operation,
      serverUrl: this.acquired?.baseUrl,
    });
    const output = this.acquired?.handle.formatOutput().trim();
    return output ? `${message}\n${output}` : message;
  }

  private handleSseEvent(event: V2Event): void {
    const state = this.mapperState;
    const sessionID = readOpenCode2EventSessionID(event);
    if (!sessionID) return;

    const resolvedRequestId =
      event.type === "permission.replied"
        ? openCode2PermissionRequestId(event.data.requestID)
        : event.type === "form.replied" || event.type === "form.cancelled"
          ? openCode2FormRequestId(event.data.id)
          : undefined;
    if (resolvedRequestId && this.cancelledRequestIds.delete(resolvedRequestId)) return;
    if (sessionID !== state.sessionID) {
      this.emitRuntimeEvents(this.subagents.map(event));
      this.handleRequestLifecycleEvent(event);
      return;
    }

    // Canonical events first: the status handler's defensive turn settle must
    // observe the mapper's own lifecycle output, not race it.
    const canonical = mapOpenCode2Event(event, state);
    if (canonical.length > 0) this.emitRuntimeEvents(canonical);
    this.emitRuntimeEvents(this.subagents.map(event));

    this.handleRequestLifecycleEvent(event);
    this.handleThreadStatusEvent(event);
  }

  /** Track open server requests so `resolveServerRequest` can route replies. */
  private handleRequestLifecycleEvent(event: V2Event): void {
    switch (event.type) {
      case "permission.asked": {
        const requestId = openCode2PermissionRequestId(event.data.id) as ThreadServerRequestId;
        this.pendingRequests.set(requestId, {
          kind: "permission",
          requestID: event.data.id,
          sessionID: event.data.sessionID,
        });
        this.emitPendingRequestUpdate();
        return;
      }
      case "permission.replied": {
        const requestId = openCode2PermissionRequestId(
          event.data.requestID,
        ) as ThreadServerRequestId;
        if (this.pendingRequests.delete(requestId)) this.emitUpdateAfterRequestResolution();
        return;
      }
      case "form.created": {
        const form = event.data.form;
        const requestId = openCode2FormRequestId(form.id) as ThreadServerRequestId;
        this.pendingRequests.set(requestId, {
          kind: "form",
          formID: form.id,
          sessionID: form.sessionID,
        });
        this.emitPendingRequestUpdate();
        return;
      }
      case "form.replied":
      case "form.cancelled": {
        const requestId = openCode2FormRequestId(event.data.id) as ThreadServerRequestId;
        if (this.pendingRequests.delete(requestId)) this.emitUpdateAfterRequestResolution();
        return;
      }
      default:
        return;
    }
  }

  /** Thread status is session-level chrome, kept out of the mapper. */
  private handleThreadStatusEvent(event: V2Event): void {
    switch (event.type) {
      case "session.execution.started":
        this.emitUpdate({ status: "working", attention: "working" });
        return;
      case "session.execution.succeeded":
      case "session.execution.failed":
      case "session.execution.interrupted":
      case "session.idle": {
        // `session.idle` is also the safety net for a turn whose terminal
        // execution event was dropped by the beta stream.
        const settled = settleOpenCode2TurnIfActive(this.mapperState, "completed");
        if (settled.length > 0) this.emitRuntimeEvents(settled);
        if (
          event.type === "session.execution.interrupted" ||
          event.type === "session.execution.failed"
        ) {
          this.emitRuntimeEvents(this.subagents.close());
          this.cancelPendingRequests();
        }
        this.emitUpdate({
          ...(this.pendingRequestStatus() ?? { status: "idle", attention: "none" }),
          ...this.sessionRefUpdate(),
        });
        return;
      }
      case "session.status": {
        // `retry` carries `{ attempt, message, action }` detail that thread
        // updates have no clearable field for; the transcript's error rows
        // (from `session.retry.scheduled`) carry it instead.
        const next: { status: ThreadStatus; attention: ThreadAttention } =
          event.data.status.type === "idle"
            ? { status: "idle", attention: "none" }
            : { status: "working", attention: "working" };
        this.emitUpdate({ ...(this.pendingRequestStatus() ?? next), ...this.sessionRefUpdate() });
        return;
      }
      default:
        return;
    }
  }

  private emitUpdate(update: {
    status: ThreadStatus;
    attention: ThreadAttention;
    sessionRef?: SessionRef;
  }): void {
    this.listener?.onUpdate({
      status: update.status,
      attention: update.attention,
      ...(update.sessionRef ? { sessionRef: update.sessionRef } : {}),
    });
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
