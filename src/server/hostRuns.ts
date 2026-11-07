import { randomUUID } from "node:crypto";
import { modelSelectionFor } from "@/shared/agentSelection";
import type { HostControlContext } from "@/backend/ownership/HostControlServer";
import {
  DEFAULT_TERMINAL_SIZE,
  emptyMcpLaunchSnapshot,
  type RemoteThreadCommand,
  type RuntimeEvent,
  type CanonicalItemType,
  type StartThreadPayload,
  type Thread,
  type PromptSegment,
} from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import type { SupervisorEvent } from "@/shared/ipc/events";
import type { SharedSettings } from "@/shared/settings";
import type { McpLaunchSnapshot } from "@/shared/contracts/mcpServer";
import {
  HOST_RUN_BUFFER_BYTES,
  HOST_RUN_CHUNK_BYTES,
  HOST_RUN_FORMAT_VERSION,
  HOST_RUN_TOOL_EVENT_FORMAT_VERSION,
  HOST_RUN_TOOL_SUMMARY_BYTES,
  hostRunCommandSchema,
  hostRunResumePreparationCommandSchema,
  type HostRunCommand,
  type HostRunResumeCommand,
  type HostRunEvent,
  type HostRunFinished,
  hostRunPreparationCommandSchema,
  hostRunFilesPreparationCommandSchema,
  hostRunFilesResumeCommandSchema,
  type HostRunFilesCommand,
  hostRunPendingRequestSchema,
  type HostRunInteractiveCommand,
} from "@/shared/contracts/hostRun";
import {
  controlThreadExecutionResultSchema,
  controlledThreadLaunchSchema,
  THREAD_EXECUTION_CONTROL_VERSION,
  THREAD_EXECUTION_RESERVATION_VERSION,
  CONTROLLED_THREAD_REQUEST_VERSION,
  controlledThreadRequestResultSchema,
} from "@/shared/contracts/threadExecution";
import { startPersistedThread } from "@/host/remote/server/threadCommands";
import { dbGetProject, dbGetThread } from "@/host/db";
import { retainThreadAttachmentDirectory } from "@/host/attachments/attachmentStorage";
import {
  beginRuntimeFence,
  flushRuntimeFence,
  releaseRuntimeFence,
} from "@/host/db/runtimePersistenceRuntime";
import { fenceRefusalError } from "@/host/db/runtimeItems";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import {
  prepareHostRunSelection,
  prepareHostRunResumeSelection,
  readHostRunTarget,
} from "./hostRunSelection";
import { redactDiagnosticLine } from "./serverDoctorIo";
import type { RemoteAccessServerOptions } from "@/host/remote/RemoteAccessServer";
import { mimeForPath } from "@/shared/promptContent";
import {
  inspectRunAttachments,
  readRunAttachments,
  type RunAttachmentSource,
} from "./hostRunAttachments";

interface Run {
  readonly id: string;
  readonly threadId: string;
  readonly input: Pick<
    Extract<HostRunCommand, { action: "run-prepare" }>,
    "projectId" | "agentKind" | "prompt"
  >;
  readonly selection: Awaited<ReturnType<typeof prepareHostRunSelection>> & { resume?: Thread };
  readonly files?: readonly RunAttachmentSource[];
  readonly published: ReturnType<typeof Promise.withResolvers<void>>;
  readonly stopped: ReturnType<typeof Promise.withResolvers<void>>;
  readonly queue: Array<{ event: HostRunEvent; bytes: number }>;
  lastRead: number;
  cursor: number;
  bytes: number;
  started: boolean;
  observing: boolean;
  reservationRequested: boolean;
  ownerGone: boolean;
  idle: boolean;
  checkRevision: number;
  turnId?: string;
  turnState?: Extract<RuntimeEvent, { type: "turn.completed" }>["state"];
  reason?: { state: HostRunFinished["state"]; error?: string };
  operationId?: string;
  start?: Promise<unknown>;
  retiring?: Promise<void>;
  cleanup?: Promise<void>;
  checking?: Promise<void>;
  result?: HostRunFinished;
  interactive?: boolean;
  toolEvents: boolean;
  readonly toolItems: Map<string, RunToolItem>;
  readonly requests: Map<
    string,
    {
      requestId: Extract<RuntimeEvent, { type: "request.opened" }>["requestId"];
      public: ReturnType<typeof hostRunPendingRequestSchema.parse>;
      responding: boolean;
      supervisorToken?: string;
    }
  >;
}

interface RunToolItem {
  readonly itemType: CanonicalItemType;
  payload: Record<string, unknown>;
  outputBytes: number;
  lastUpdate?: string;
}

const runToolItemTypes: ReadonlySet<CanonicalItemType> = new Set([
  "command_execution",
  "file_change",
  "tool_call",
  "mcp_tool_call",
  "dynamic_tool_call",
  "web_search",
  "image_view",
  "plan",
]);

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedToolSummary(value: string) {
  const sanitized = redactDiagnosticLine(value);
  let summary = "";
  let bytes = 0;
  for (const character of sanitized) {
    const length = Buffer.byteLength(character);
    if (bytes + length > HOST_RUN_TOOL_SUMMARY_BYTES) break;
    summary += character;
    bytes += length;
  }
  return summary;
}

function summarizeToolItem(item: RunToolItem) {
  const { itemType, payload, outputBytes } = item;
  const args = recordValue(payload.args);
  const toolName =
    itemType === "command_execution"
      ? "bash"
      : itemType === "file_change"
        ? payload.changeKind === "create"
          ? "write"
          : "edit"
        : boundedToolSummary(typeof payload.name === "string" ? payload.name : itemType);
  const inputSummary =
    itemType === "command_execution"
      ? "command and working directory omitted"
      : itemType === "file_change"
        ? `${String(payload.changeKind ?? "file")} change; path omitted`
        : itemType === "tool_call" ||
            itemType === "mcp_tool_call" ||
            itemType === "dynamic_tool_call"
          ? `arguments omitted (${Object.keys(args).length} fields)`
          : itemType === "web_search"
            ? "search query omitted"
            : itemType === "image_view"
              ? "image path omitted"
              : `plan content omitted (${Array.isArray(payload.steps) ? payload.steps.length : 0} steps)`;
  const details = [
    typeof payload.status === "string" ? `status ${payload.status}` : undefined,
    typeof payload.exitCode === "number" ? `exit code ${payload.exitCode}` : undefined,
    typeof payload.durationMs === "number" ? `duration ${payload.durationMs} ms` : undefined,
    outputBytes > 0 ? `${outputBytes} output bytes` : undefined,
    toolResultSummary(payload.result),
  ].filter((value) => value !== undefined);
  return {
    toolName: boundedToolSummary(toolName),
    inputSummary: boundedToolSummary(inputSummary),
    ...(details.length ? { outputSummary: boundedToolSummary(details.join("; ")) } : {}),
  };
}

function toolResultSummary(value: unknown) {
  if (typeof value === "string") return `result text (${Buffer.byteLength(value)} bytes)`;
  if (Array.isArray(value)) return `result list (${value.length} items)`;
  if (value !== null && typeof value === "object") return "structured result";
  return undefined;
}

/** Active runs belong to a held local request; idle leases cover only unused/results metadata. */
export class HostRuns {
  private readonly jobs = new Map<string, Run>();
  private readonly retired = new Map<string, ReturnType<HostRuns["metadata"]>>();
  private preparations = 0;
  private closed = false;
  private readonly timer = setInterval(() => this.prune(), 30_000);

  constructor(
    private readonly options: {
      call: AdminSupervisorCall;
      readSettings(): SharedSettings;
      resolveMcpLaunchSnapshot?(projectId: string): McpLaunchSnapshot;
      publishCatalogChanged(): void;
      attachments?: NonNullable<RemoteAccessServerOptions["attachments"]>;
    },
  ) {
    this.timer.unref();
  }

  async execute(
    input:
      | HostRunCommand
      | HostRunResumeCommand
      | Exclude<HostRunFilesCommand, { action: "run-directory-files-prepare" }>,
    context: HostControlContext,
  ): Promise<unknown> {
    let command: HostRunCommand | HostRunResumeCommand;
    let filePaths: readonly string[] | undefined;
    if (input.action === "run-files-prepare") {
      const { files, ...selection } = hostRunFilesPreparationCommandSchema.parse(input);
      filePaths = files;
      command = hostRunPreparationCommandSchema.parse({ ...selection, action: "run-prepare" });
    } else if (input.action === "run-resume-files-prepare") {
      const { files, ...selection } = hostRunFilesResumeCommandSchema.parse(input);
      filePaths = files;
      command = hostRunResumePreparationCommandSchema.parse({
        ...selection,
        action: "run-resume-prepare",
      });
    } else
      command =
        input.action === "run-resume-prepare"
          ? hostRunResumePreparationCommandSchema.parse(input)
          : hostRunCommandSchema.parse(input);
    if (filePaths && !this.options.attachments)
      throw new Error(
        "This owner has no CLI attachment storage. Upgrade it explicitly before retrying.",
      );
    context.assertActive();
    if (this.closed) throw new Error("CLI runs are shutting down.");
    this.prune();
    if (command.action === "run-options") {
      const { status } = await readHostRunTarget(
        command,
        context,
        this.options.call,
        this.options.readSettings,
      );
      context.assertActive();
      const choice = ({ id, label }: { id: string; label: string }) => ({ id, label });
      return {
        formatVersion: HOST_RUN_FORMAT_VERSION,
        scope: "controlled-run-options",
        projectId: command.projectId,
        agentKind: command.agentKind,
        models: status.capabilities.models.map((model) => ({
          ...choice(model),
          efforts: modelSelectionFor(status.capabilities, model.id).reasoning.values,
        })),
        approvalPolicies: status.capabilities.approvalPolicies.map(choice),
        sandboxModes: status.capabilities.sandboxModes.map(choice),
      };
    }
    if (command.action === "run-prepare" || command.action === "run-resume-prepare") {
      if (this.jobs.size + this.preparations >= 4)
        throw new Error(
          "Four CLI runs are already reserved. Cancel an unused run or finish an active run.",
        );
      this.preparations++;
      try {
        const files = filePaths
          ? await inspectRunAttachments(filePaths, context.assertActive)
          : undefined;
        const selection: Run["selection"] =
          command.action === "run-resume-prepare"
            ? await prepareHostRunResumeSelection(
                command,
                context,
                this.options.call,
                this.options.readSettings,
              )
            : await prepareHostRunSelection(
                command,
                context,
                this.options.call,
                this.options.readSettings,
              );
        context.assertActive();
        if (this.closed) throw new Error("CLI runs are shutting down.");
        const job: Run = {
          id: randomUUID(),
          threadId: selection.resume?.id ?? randomUUID(),
          input:
            command.action === "run-resume-prepare"
              ? {
                  projectId: selection.resume!.projectId,
                  agentKind: selection.resume!.agentKind,
                  prompt: command.prompt,
                }
              : command,
          selection,
          ...(files ? { files } : {}),
          published: Promise.withResolvers<void>(),
          stopped: Promise.withResolvers<void>(),
          queue: [],
          lastRead: Date.now(),
          cursor: 0,
          bytes: 0,
          started: false,
          observing: false,
          ownerGone: false,
          idle: false,
          reservationRequested: false,
          checkRevision: 0,
          toolEvents: false,
          toolItems: new Map(),
          requests: new Map(),
        };
        this.jobs.set(job.id, job);
        return this.metadata(job);
      } finally {
        this.preparations--;
      }
    }
    const job = this.jobs.get(command.runId);
    if (!job) {
      const retired = this.retired.get(command.runId);
      if (command.action === "run-cancel" && retired) return { ...retired, retired: true };
      throw new Error("Unknown or expired CLI run. No other session was changed.");
    }
    job.lastRead = Date.now();
    if (command.action === "run-read") {
      if (command.cursor !== job.cursor)
        throw new Error("CLI output cursor mismatch. Output was not replayed or discarded.");
      let bytes = 0;
      const events: HostRunEvent[] = [];
      while (job.queue.length && events.length < 128) {
        const next = job.queue[0]!;
        if (bytes + next.bytes > HOST_RUN_CHUNK_BYTES) break;
        job.queue.shift();
        job.bytes -= next.bytes;
        bytes += next.bytes;
        events.push(next.event);
      }
      job.cursor += events.length;
      return {
        ...this.metadata(job),
        cursor: command.cursor,
        nextCursor: job.cursor,
        events,
        finished: job.result !== undefined && job.queue.length === 0,
      };
    }
    if (command.action === "run-cancel") {
      this.stop(job, "cancelled", "The CLI caller cancelled this run.");
      await this.retire(job);
      await job.start?.catch(() => undefined);
      if (job.started && !job.result) {
        job.result = {
          type: "run.finished",
          state: "cancelled",
          retirementConfirmed: true,
          historyCommitted: false,
          error:
            "Runtime retirement was confirmed on retry; inspect retained history before retrying the task.",
        };
        const bytes = Buffer.byteLength(JSON.stringify(job.result));
        job.queue.push({ event: job.result, bytes });
        job.bytes += bytes;
      }
      if (!job.started || (job.result && job.queue.length === 0)) {
        this.jobs.delete(job.id);
        this.retired.set(job.id, this.metadata(job));
        if (this.retired.size > 64) this.retired.delete(this.retired.keys().next().value!);
      }
      return { ...this.metadata(job), retired: true };
    }
    if (job.started || job.reason)
      throw new Error(
        "This run was already submitted or cancelled. A provider was not launched again.",
      );
    job.started = true;
    job.start = Promise.resolve().then(() => this.start(job, context));
    return job.start;
  }

  observe(event: SupervisorEvent): void {
    if (event.type === "thread-runtime-events-multi") {
      for (const batch of event.batches) for (const runtime of batch.events) this.runtime(runtime);
    } else if (event.type === "thread-runtime-events") {
      for (const runtime of event.events) this.runtime(runtime);
    } else if (event.type === "thread-runtime-event") this.runtime(event.event);
    else if (event.type === "thread-state" || event.type === "thread-exited") {
      const job = this.running(event.threadId);
      if (!job) return;
      if (event.type === "thread-exited")
        this.stop(job, "failed", "The provider exited before confirmed turn completion.");
      else if (event.status === "error" || event.status === "inactive")
        this.stop(
          job,
          "failed",
          "The provider stopped before confirmed turn completion. Inspect the retained session.",
        );
      else {
        job.idle = event.status === "idle" || event.status === "finished";
        this.checkCompletion(job);
      }
    }
  }

  enableInteraction(runId: string, threadId: string, context: HostControlContext): void {
    context.assertActive();
    const job = this.jobs.get(runId);
    if (!job || job.threadId !== threadId || job.started || job.reason || this.closed)
      throw new Error("The prepared interactive run is no longer available. No run was started.");
    job.interactive = true;
  }

  enableToolEvents(runId: string, threadId: string, context: HostControlContext): void {
    context.assertActive();
    const job = this.jobs.get(runId);
    if (!job || job.threadId !== threadId || job.started || job.reason || this.closed)
      throw new Error("The prepared CLI run is no longer available. No run was started.");
    job.toolEvents = true;
  }

  async interact(
    input: Exclude<HostRunInteractiveCommand, { action: "run-interactive-prepare" }>,
    context: HostControlContext,
  ): Promise<unknown> {
    context.assertActive();
    const job = this.jobs.get(input.runId);
    if (!job?.interactive || this.closed)
      throw new Error("Unknown interactive CLI run. No other session was changed.");
    job.lastRead = Date.now();
    if (input.action === "run-request-read") {
      const pending = job.requests.values().next().value;
      if (!job.reason && pending && !pending.supervisorToken && job.operationId) {
        const result = controlledThreadRequestResultSchema.parse(
          await this.options.call("controlledThreadRequest", {
            version: CONTROLLED_THREAD_REQUEST_VERSION,
            action: "read",
            operationId: job.operationId,
            threadId: job.threadId,
            requestId: pending.requestId,
          }),
        );
        context.assertActive();
        if (
          result.operationId !== job.operationId ||
          result.threadId !== job.threadId ||
          result.state !== "read"
        )
          throw new Error("The supervisor did not confirm this run's pending request.");
        if (
          !result.request ||
          job.reason ||
          this.closed ||
          job.requests.get(pending.public.requestToken) !== pending
        )
          return { ...this.metadata(job), request: null };
        const parsed = hostRunPendingRequestSchema.safeParse({
          ...result.request,
          requestToken: pending.public.requestToken,
        });
        if (!parsed.success || result.request.requestType === "auth_refresh") {
          this.stop(
            job,
            "blocked",
            "The current request requires review or authentication in a client. No answer was submitted.",
          );
          return { ...this.metadata(job), request: null };
        }
        // Bind once: later reads cannot retarget an already displayed answer.
        if (!pending.supervisorToken) {
          pending.supervisorToken = result.request.requestToken;
          pending.public = parsed.data;
        }
      }
      return {
        ...this.metadata(job),
        request: job.reason || !pending?.supervisorToken ? null : pending.public,
      };
    }
    const pending = job.requests.get(input.requestToken);
    if (
      job.reason ||
      !job.observing ||
      !job.operationId ||
      !pending?.supervisorToken ||
      pending.responding
    )
      throw new Error("This request is no longer pending. No answer was replayed.");
    pending.responding = true;
    const cancel = () =>
      this.stop(job, "cancelled", "The request caller disconnected before its response completed.");
    context.signal.addEventListener("abort", cancel, { once: true });
    try {
      context.assertActive();
      const result = controlledThreadRequestResultSchema.parse(
        await this.options.call("controlledThreadRequest", {
          version: CONTROLLED_THREAD_REQUEST_VERSION,
          action: "respond",
          operationId: job.operationId,
          threadId: job.threadId,
          requestId: pending.requestId,
          requestToken: pending.supervisorToken,
          response: input.response,
        }),
      );
      if (
        result.operationId !== job.operationId ||
        result.threadId !== job.threadId ||
        result.state !== "responded"
      )
        throw new Error("The supervisor did not confirm this run's request response.");
      const current = this.jobs.get(input.runId);
      if (
        current !== job ||
        (current.reason && current.reason.state !== "completed") ||
        this.closed
      )
        throw new Error(
          "The run was cancelled or finished while its response was pending. No completion was claimed.",
        );
      job.requests.delete(input.requestToken);
      this.checkCompletion(job);
      context.assertActive();
      return { ...this.metadata(job), requestToken: input.requestToken, responded: true };
    } catch (error) {
      this.stop(job, "failed", "The request response was not confirmed; it was not replayed.");
      throw error;
    } finally {
      context.signal.removeEventListener("abort", cancel);
    }
  }

  /** SupervisorClient calls reset only after its actual process/pipe retirement join. */
  reset(): void {
    for (const job of this.jobs.values()) {
      if (!job.started || job.result) continue;
      job.ownerGone = true;
      this.stop(
        job,
        "failed",
        "The owning supervisor retired. Inspect the retained session before retrying.",
      );
    }
  }

  async dispose(): Promise<void> {
    this.closed = true;
    clearInterval(this.timer);
    const results = await Promise.allSettled(
      [...this.jobs.values()].map(async (job) => {
        if (!job.result) this.stop(job, "cancelled", "The server is shutting down.");
        await this.retire(job);
        await job.start?.catch(() => undefined);
      }),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "CLI run retirement is unconfirmed; custody was retained.",
      );
  }

  private metadata(job: Run) {
    return {
      formatVersion: job.toolEvents ? HOST_RUN_TOOL_EVENT_FORMAT_VERSION : HOST_RUN_FORMAT_VERSION,
      scope: "controlled-run" as const,
      runId: job.id,
      threadId: job.threadId,
    };
  }

  private prune(): void {
    for (const [id, job] of this.jobs)
      if ((!job.started || job.result) && Date.now() - job.lastRead >= 120_000)
        this.jobs.delete(id);
  }

  private running(threadId: string) {
    return [...this.jobs.values()].find(
      (job) => job.threadId === threadId && job.observing && !job.reason,
    );
  }

  private runtime(event: RuntimeEvent): void {
    const job = this.running(event.threadId);
    if (!job) return;
    if (event.type === "turn.started") {
      job.idle = false;
      job.checkRevision++;
      // Structured startup paints an optimistic turn before its provider turn.
      // Completion belongs to the latest canonical turn, never that earlier paint.
      if (job.turnId !== event.turnId) delete job.turnState;
      job.turnId = event.turnId;
    } else if (event.type === "turn.completed" && event.turnId === job.turnId) {
      job.turnState = event.state;
      this.checkCompletion(job);
    } else if (
      job.toolEvents &&
      event.type === "item.started" &&
      runToolItemTypes.has(event.itemType)
    ) {
      const tool: RunToolItem = {
        itemType: event.itemType,
        payload: recordValue(event.payload),
        outputBytes: 0,
      };
      job.toolItems.set(event.itemId, tool);
      this.toolEvent(job, "tool.started", event.itemId, tool);
    } else if (job.toolEvents && event.type === "item.updated") {
      const tool = job.toolItems.get(event.itemId);
      if (tool) {
        tool.payload = { ...tool.payload, ...recordValue(event.payload) };
        this.toolEvent(job, "tool.updated", event.itemId, tool);
      }
    } else if (job.toolEvents && event.type === "item.completed") {
      const tool = job.toolItems.get(event.itemId);
      if (tool) {
        tool.payload = { ...tool.payload, ...recordValue(event.payload) };
        this.toolEvent(job, "tool.completed", event.itemId, tool);
        job.toolItems.delete(event.itemId);
      }
    } else if (event.type === "content.delta" && event.stream === "assistant_text") {
      for (let offset = 0; offset < event.delta.length;) {
        let end = Math.min(offset + 4_096, event.delta.length);
        if (end < event.delta.length && /[\uD800-\uDBFF]/u.test(event.delta[end - 1]!)) end--;
        if (
          !this.enqueue(job, {
            type: "text.delta",
            itemId: event.itemId,
            text: event.delta.slice(offset, end),
            replace: offset === 0 && event.replace === true,
          })
        )
          break;
        offset = end;
      }
      if (event.replace && event.delta === "")
        this.enqueue(job, { type: "text.delta", itemId: event.itemId, text: "", replace: true });
    } else if (
      job.toolEvents &&
      event.type === "content.delta" &&
      (event.stream === "command_output" || event.stream === "file_change_output")
    ) {
      const tool = job.toolItems.get(event.itemId);
      if (tool)
        tool.outputBytes = event.replace
          ? Buffer.byteLength(event.delta)
          : tool.outputBytes + Buffer.byteLength(event.delta);
    } else if (event.type === "request.opened") {
      job.checkRevision++;
      this.enqueue(job, {
        type: "request.required",
        requestType: event.requestType,
        summary: event.payload.summary.slice(0, 2_000),
      });
      if (!job.interactive)
        this.stop(
          job,
          "blocked",
          "The provider requires a permission or answer. This noninteractive run did not approve it; inspect the retained session in a client.",
        );
      else if (event.requestType === "auth_refresh")
        this.stop(
          job,
          "blocked",
          "Provider authentication requires the separate auth command. No task answer or credential was submitted.",
        );
      else {
        for (const [token, request] of job.requests)
          if (request.requestId === event.requestId) job.requests.delete(token);
        const parsed = hostRunPendingRequestSchema.safeParse({
          requestToken: randomUUID(),
          requestType: event.requestType,
          payload: event.payload,
        });
        if (!parsed.success || job.requests.size >= 16)
          this.stop(
            job,
            "blocked",
            "The pending requests exceed interactive CLI review limits. Inspect the retained session in a client; no answer was submitted.",
          );
        else
          job.requests.set(parsed.data.requestToken, {
            requestId: event.requestId,
            public: parsed.data,
            responding: false,
          });
      }
    } else if (event.type === "request.resolved") {
      for (const [token, pending] of job.requests)
        if (pending.requestId === event.requestId) job.requests.delete(token);
      this.checkCompletion(job);
    } else if (event.type === "error")
      this.stop(
        job,
        "failed",
        "The provider reported an error. Inspect the retained session for details.",
      );
    else if (event.type === "background_tasks.changed") this.checkCompletion(job);
  }

  private enqueue(job: Run, event: HostRunEvent): boolean {
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (
      job.bytes + bytes > HOST_RUN_BUFFER_BYTES - HOST_RUN_CHUNK_BYTES ||
      job.queue.length >= 4_095
    ) {
      this.stop(
        job,
        "failed",
        "CLI output exceeded the bounded unread buffer. The run was stopped; retained history was not discarded.",
      );
      return false;
    }
    job.queue.push({ event, bytes });
    job.bytes += bytes;
    return true;
  }

  private toolEvent(
    job: Run,
    type: "tool.started" | "tool.updated" | "tool.completed",
    itemId: string,
    tool: RunToolItem,
  ) {
    const summary = summarizeToolItem(tool);
    const fingerprint = JSON.stringify(summary);
    if (type === "tool.updated" && tool.lastUpdate === fingerprint) return;
    tool.lastUpdate = fingerprint;
    this.enqueue(job, {
      type,
      itemId,
      itemType: tool.itemType,
      ...summary,
    });
  }

  private checkCompletion(job: Run): void {
    job.checkRevision++;
    if (job.checking || job.reason || job.requests.size || !job.turnState || !job.idle) return;
    job.checking = (async () => {
      while (!job.reason && !job.requests.size && job.idle && job.turnState) {
        const revision = job.checkRevision;
        const tasks = await this.options.call("readThreadBackgroundTasks", {
          threadId: job.threadId,
        });
        if (revision !== job.checkRevision) continue;
        if (!job.reason && !job.requests.size && job.idle && tasks.length === 0)
          this.stop(
            job,
            job.turnState === "completed" ? "completed" : "failed",
            job.turnState === "completed"
              ? undefined
              : `The provider turn ended as ${job.turnState}.`,
          );
        break;
      }
    })()
      .catch(() => this.stop(job, "failed", "Background work could not be confirmed settled."))
      .finally(() => {
        delete job.checking;
      });
  }

  private stop(job: Run, state: HostRunFinished["state"], error?: string): void {
    if (job.result) return;
    if (!job.reason || job.reason.state === "completed")
      job.reason = { state, ...(error ? { error } : {}) };
    job.stopped.resolve();
    job.cleanup ??= this.retire(job);
    void job.cleanup.catch(() => undefined);
  }

  private retire(job: Run): Promise<void> {
    if (!job.started) return Promise.resolve();
    if (job.retiring) return job.retiring;
    const pending = (async () => {
      await job.published.promise;
      if (job.ownerGone || !job.reservationRequested) return;
      if (!job.operationId)
        throw new Error(
          "Supervisor reservation custody is uncertain. Run doctor; no runtime retirement was claimed.",
        );
      const result = controlThreadExecutionResultSchema.parse(
        await (job.selection.resume
          ? this.options.call("reserveThreadExecution", {
              version: THREAD_EXECUTION_RESERVATION_VERSION,
              action: "cancel",
              operationId: job.operationId,
              threadId: job.threadId,
            })
          : this.options.call("controlThreadExecution", {
              version: THREAD_EXECUTION_CONTROL_VERSION,
              action: "cancel",
              operationId: job.operationId,
            })),
      );
      if (
        result.operationId !== job.operationId ||
        result.threadId !== job.threadId ||
        result.state !== "cancelled" ||
        !result.confirmed
      )
        throw new Error(
          "CLI runtime retirement was not confirmed. Its owner and history were retained.",
        );
    })();
    job.retiring = pending;
    void pending.catch(() => {
      if (job.retiring === pending) delete job.retiring;
    });
    return pending;
  }

  private async start(job: Run, context: HostControlContext) {
    let releaseAttachments: (() => void) | undefined;
    const cancel = () =>
      this.stop(job, "cancelled", "The CLI caller disconnected or cancelled this run.");
    context.signal.addEventListener("abort", cancel, { once: true });
    const admit = () => {
      context.assertActive();
      if (job.reason || this.closed) throw new Error("CLI run was cancelled before launch.");
      job.selection.assertSelection();
    };
    try {
      try {
        admit();
        if (job.selection.resume) job.operationId = randomUUID();
        job.reservationRequested = true;
        const reserved = controlThreadExecutionResultSchema.parse(
          await (job.selection.resume
            ? this.options.call("reserveThreadExecution", {
                version: THREAD_EXECUTION_RESERVATION_VERSION,
                action: "prepare",
                operationId: job.operationId!,
                threadId: job.threadId,
              })
            : this.options.call("controlThreadExecution", {
                version: THREAD_EXECUTION_CONTROL_VERSION,
                action: "prepare",
                threadId: job.threadId,
              })),
        );
        if (
          reserved.state !== "prepared" ||
          reserved.threadId !== job.threadId ||
          (job.operationId !== undefined && reserved.operationId !== job.operationId)
        )
          throw new Error(
            "Supervisor returned a different run reservation. No launch was submitted.",
          );
        job.operationId = reserved.operationId;
      } finally {
        job.published.resolve();
      }
      admit();
      admit();
      if (job.interactive) {
        const qualified = controlledThreadRequestResultSchema.parse(
          await this.options.call("controlledThreadRequest", {
            version: CONTROLLED_THREAD_REQUEST_VERSION,
            action: "qualify",
            operationId: job.operationId!,
            threadId: job.threadId,
          }),
        );
        if (
          qualified.operationId !== job.operationId ||
          qualified.threadId !== job.threadId ||
          qualified.state !== "qualified"
        )
          throw new Error(
            "The supervisor did not qualify interactive request custody. No provider was launched.",
          );
        admit();
      }
      let attached: PromptSegment[] | undefined;
      if (job.files) {
        releaseAttachments = retainThreadAttachmentDirectory(job.threadId);
        const uploads = await readRunAttachments(job.files, admit);
        admit();
        attached = [{ kind: "text", content: job.input.prompt }];
        for (const upload of uploads) {
          admit();
          const path = await this.options.attachments!.save({ threadId: job.threadId, ...upload });
          const mimeType = mimeForPath(path);
          attached.push({ kind: "attachment", path, ...(mimeType ? { mimeType } : {}) });
        }
      }
      const dispatch = async (payload: StartThreadPayload) => {
        admit();
        const launch = controlledThreadLaunchSchema.parse(payload);
        if (launch.threadId !== job.threadId)
          throw new Error(
            "Persisted launch selected a different thread. No provider was launched.",
          );
        this.options.publishCatalogChanged();
        job.observing = true;
        const result = controlThreadExecutionResultSchema.parse(
          await this.options.call(
            "controlThreadExecution",
            {
              version: THREAD_EXECUTION_CONTROL_VERSION,
              action: "start",
              operationId: job.operationId!,
              launch,
            },
            { assertLaunchCurrent: admit },
          ),
        );
        if (
          result.operationId !== job.operationId ||
          result.threadId !== job.threadId ||
          !(
            result.state === "started" ||
            (result.state === "cancelled" && result.confirmed && job.reason)
          )
        )
          throw new Error("CLI launch did not confirm the selected run.");
        return { threadId: job.threadId };
      };
      if (job.selection.resume) {
        const saved = job.selection.resume;
        const project = dbGetProject(saved.projectId);
        if (!project)
          throw new Error("The saved session's project was removed. No provider was launched.");
        await dispatch({
          threadId: saved.id,
          projectLocation: saved.worktreePath
            ? buildWorktreeLocation(project.location, saved.worktreePath)
            : project.location,
          agentKind: saved.agentKind,
          ...(saved.agentInstanceId ? { agentInstanceId: saved.agentInstanceId } : {}),
          config: job.selection.config,
          prompt: job.input.prompt,
          ...(attached ? { segments: attached } : {}),
          initialSize: DEFAULT_TERMINAL_SIZE,
          sessionRef: saved.sessionRef!,
          presentationMode: "gui",
          ...(this.options.resolveMcpLaunchSnapshot?.(saved.projectId) ?? emptyMcpLaunchSnapshot()),
        });
      } else {
        const command: Extract<RemoteThreadCommand, { kind: "start" }> = {
          kind: "start",
          projectId: job.input.projectId,
          threadId: job.threadId,
          agentKind: job.input.agentKind,
          ...(job.selection.instanceId ? { agentInstanceId: job.selection.instanceId } : {}),
          config: job.selection.config,
          prompt: job.input.prompt,
          ...(attached ? { segments: attached } : {}),
          title: job.input.prompt.replace(/\s+/gu, " ").slice(0, 80) || "CLI run",
          presentationMode: "gui",
        };
        // The attachment hold spans asynchronous copies through the row commit.
        await startPersistedThread(
          {
            ...(this.options.resolveMcpLaunchSnapshot
              ? { resolveMcpLaunchSnapshot: this.options.resolveMcpLaunchSnapshot }
              : {}),
            callSupervisor: this.options.call,
          },
          command,
          admit,
          dispatch,
        );
      }
      releaseAttachments?.();
      releaseAttachments = undefined;
      await job.stopped.promise;
    } catch (error) {
      this.stop(
        job,
        "failed",
        redactDiagnosticLine(error instanceof Error ? error.message : "CLI launch failed.").slice(
          0,
          2_000,
        ),
      );
    }
    releaseAttachments?.();
    // Keep the abort listener through retirement and persistence, so a late
    // cancellation cannot become an authenticated completion acknowledgement.
    try {
      await (job.cleanup ?? this.retire(job));
      await job.checking;
      let historyCommitted = false;
      if (dbGetThread(job.threadId)) {
        const fence = beginRuntimeFence(job.threadId);
        try {
          const outcome = await flushRuntimeFence(fence);
          if (outcome.kind !== "committed") throw fenceRefusalError(job.threadId, outcome);
          historyCommitted = true;
        } finally {
          releaseRuntimeFence(fence);
        }
      }
      const reason = job.reason ?? {
        state: "failed" as const,
        error: "CLI run ended without a completion event.",
      };
      job.result = {
        type: "run.finished",
        ...reason,
        historyCommitted,
        retirementConfirmed: true,
      };
      if (job.result.state === "completed" && !historyCommitted)
        job.result = {
          ...job.result,
          state: "failed",
          error: "Persisted run history was not confirmed.",
        };
      job.queue.push({ event: job.result, bytes: Buffer.byteLength(JSON.stringify(job.result)) });
      job.bytes += job.queue.at(-1)!.bytes;
    } finally {
      context.signal.removeEventListener("abort", cancel);
    }
    return { ...this.metadata(job), result: job.result! };
  }
}
