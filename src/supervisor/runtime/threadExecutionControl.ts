import { randomUUID } from "node:crypto";
import { msg } from "@/shared/messages";
import type { StartThreadRuntimeInput } from "./sessionTypes";
import type { CloseThreadConfirmedResult, StartThreadResult } from "@/shared/contracts/thread";
import type { ResolveThreadServerRequestPayload, RuntimeEvent } from "@/shared/contracts";
import {
  THREAD_EXECUTION_CONTROL_VERSION,
  controlThreadExecutionPayloadSchema,
  threadExecutionReservationPayloadSchema,
  type ThreadExecutionReservationPayload,
  type ControlThreadExecutionPayload,
  type ControlThreadExecutionResult,
  controlledThreadRequestPayloadSchema,
  CONTROLLED_THREAD_REQUEST_VERSION,
  type ControlledThreadRequestPayload,
  type ControlledThreadRequestResult,
} from "@/shared/contracts/threadExecution";

interface Execution {
  readonly operationId: string;
  readonly threadId: string;
  start?: Promise<StartThreadResult>;
  admission?: Promise<void>;
  dispatched: boolean;
  cancelled: boolean;
  retirement?: Promise<ControlThreadExecutionResult>;
  readonly requests: Map<
    ResolveThreadServerRequestPayload["requestId"],
    {
      requestToken: string;
      requestType: Extract<RuntimeEvent, { type: "request.opened" }>["requestType"];
      payload: Extract<RuntimeEvent, { type: "request.opened" }>["payload"];
      responding: boolean;
    }
  >;
  readonly replies: Set<Promise<void>>;
}
interface ExecutionPorts {
  assertAvailable(threadId: string): void;
  start(payload: StartThreadRuntimeInput): Promise<StartThreadResult>;
  close(threadId: string): Promise<CloseThreadConfirmedResult>;
  respond?(payload: ResolveThreadServerRequestPayload): Promise<void>;
}

/** A reservation outlives startup and remains exclusive until confirmed retirement. */
export class ThreadExecutionControl {
  private readonly executions = new Map<string, Execution>();
  private readonly owners = new Map<string, string>();
  private readonly retired = new Map<string, ControlThreadExecutionResult>();
  private disposed = false;

  constructor(private readonly ports: ExecutionPorts) {}

  ownsThread(threadId: string): boolean {
    return this.owners.has(threadId);
  }

  assertUnowned(threadId: string): void {
    if (this.ownsThread(threadId)) throw new Error(msg("thread.execution.owned"));
  }

  async reserve(input: ThreadExecutionReservationPayload): Promise<ControlThreadExecutionResult> {
    const payload = threadExecutionReservationPayloadSchema.parse(input);
    const known = this.executions.get(payload.operationId) ?? this.retired.get(payload.operationId);
    if (known && known.threadId !== payload.threadId)
      throw new Error(
        "Thread reservation does not match the selected thread. No other thread was changed.",
      );
    if (payload.action === "cancel") {
      if (known) return this.cancel(payload.operationId);
      const result: ControlThreadExecutionResult = {
        version: THREAD_EXECUTION_CONTROL_VERSION,
        operationId: payload.operationId,
        threadId: payload.threadId,
        state: "cancelled",
        confirmed: true,
      };
      this.remember(result);
      return result;
    }
    if (known)
      throw new Error("Thread reservation was already used or cancelled. Prepare a new run.");
    if (this.disposed) throw new Error("Thread execution control is shutting down.");
    return this.prepare(payload.threadId, payload.operationId);
  }

  private prepare(threadId: string, operationId: string): ControlThreadExecutionResult {
    this.assertUnowned(threadId);
    this.ports.assertAvailable(threadId);
    if (this.executions.size >= 128)
      throw new Error(
        "Too many reserved thread executions. Cancel unused executions before preparing another.",
      );
    const execution: Execution = {
      operationId,
      threadId,
      cancelled: false,
      dispatched: false,
      requests: new Map(),
      replies: new Set(),
    };
    this.executions.set(operationId, execution);
    this.owners.set(threadId, operationId);
    return this.result(execution, "prepared");
  }

  async control(
    input: ControlThreadExecutionPayload,
    workspaceScope?: StartThreadRuntimeInput["workspaceScope"],
  ): Promise<ControlThreadExecutionResult> {
    const payload = controlThreadExecutionPayloadSchema.parse(input);
    if (payload.action === "cancel") return this.cancel(payload.operationId);
    if (this.disposed) throw new Error("Thread execution control is shutting down.");
    if (payload.action === "prepare") {
      return this.prepare(payload.threadId, randomUUID());
    }
    const execution = this.executions.get(payload.operationId);
    if (!execution || execution.cancelled)
      throw new Error(
        "Thread execution is unknown or cancelled. Inspect the retained session before preparing another execution; this request did not launch a provider.",
      );
    if (execution.threadId !== payload.launch.threadId)
      throw new Error("Thread execution does not match the selected thread.");
    if (execution.start)
      throw new Error("Thread execution was already submitted; the launch was not repeated.");
    // Publish custody before invoking the start port. Even a synchronous
    // cancellation from a launch callback joins publication of its start lock.
    const admitted = Promise.withResolvers<void>();
    execution.admission = admitted.promise;
    execution.start = Promise.resolve().then(() => {
      try {
        if (execution.cancelled) throw new Error("Thread execution was cancelled before launch.");
        execution.dispatched = true;
        return this.ports.start({
          ...payload.launch,
          ...(workspaceScope ? { workspaceScope } : {}),
        });
      } finally {
        admitted.resolve();
      }
    });
    try {
      await execution.start;
    } catch (error) {
      try {
        const retirement = await this.cancel(execution.operationId);
        if (retirement.state !== "cancelled" || !retirement.confirmed)
          throw new Error("Thread runtime retirement remains unconfirmed.", { cause: error });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Thread launch failed and runtime retirement remains unconfirmed.",
          { cause: cleanupError },
        );
      }
      throw error;
    }
    return execution.cancelled
      ? this.cancel(execution.operationId)
      : this.result(execution, "started");
  }

  async dispose(): Promise<boolean> {
    this.disposed = true;
    const results = await Promise.allSettled(
      [...this.executions.keys()].map((id) => this.cancel(id)),
    );
    return results.every(
      (result) =>
        result.status === "fulfilled" &&
        result.value.state === "cancelled" &&
        result.value.confirmed,
    );
  }

  observe(event: RuntimeEvent, threadId = event.threadId): void {
    if (event.threadId !== threadId) return;
    const id = this.owners.get(threadId);
    const execution = id ? this.executions.get(id) : undefined;
    if (!execution || execution.cancelled) return;
    if (event.type === "request.opened")
      execution.requests.set(event.requestId, {
        requestToken: randomUUID(),
        requestType: event.requestType,
        payload: structuredClone(event.payload),
        responding: false,
      });
    else if (event.type === "request.resolved") execution.requests.delete(event.requestId);
  }

  async request(input: ControlledThreadRequestPayload): Promise<ControlledThreadRequestResult> {
    const payload = controlledThreadRequestPayloadSchema.parse(input);
    const execution = this.executions.get(payload.operationId);
    if (
      this.disposed ||
      !execution ||
      execution.cancelled ||
      execution.threadId !== payload.threadId ||
      !this.ports.respond
    )
      throw new Error("Controlled request custody is unavailable. No other session was changed.");
    if (payload.action === "read") {
      const pending = execution.requests.get(payload.requestId);
      return {
        version: CONTROLLED_THREAD_REQUEST_VERSION,
        operationId: execution.operationId,
        threadId: execution.threadId,
        state: "read",
        request:
          execution.dispatched && pending && !pending.responding
            ? {
                requestToken: pending.requestToken,
                requestType: pending.requestType,
                payload: structuredClone(pending.payload),
              }
            : null,
      };
    }
    if (payload.action === "respond") {
      const request = execution.requests.get(payload.requestId);
      if (
        !execution.dispatched ||
        !request ||
        request.responding ||
        request.requestToken !== payload.requestToken
      )
        throw new Error("This request is no longer pending. No answer was replayed.");
      request.responding = true;
      const pending = Promise.resolve().then(() => {
        if (execution.cancelled)
          throw new Error("The controlled run was cancelled before its answer was dispatched.");
        if (execution.requests.get(payload.requestId) !== request)
          throw new Error("This request is no longer pending. No answer was replayed.");
        return this.ports.respond!({
          threadId: execution.threadId,
          requestId: payload.requestId,
          method: "requestPermission",
          response: payload.response,
        });
      });
      execution.replies.add(pending);
      try {
        await pending;
      } finally {
        execution.replies.delete(pending);
        if (execution.requests.get(payload.requestId) === request)
          execution.requests.delete(payload.requestId);
      }
    }
    return {
      version: CONTROLLED_THREAD_REQUEST_VERSION,
      operationId: execution.operationId,
      threadId: execution.threadId,
      state: payload.action === "qualify" ? "qualified" : "responded",
    };
  }

  private result(
    execution: Execution,
    state: "prepared" | "started",
  ): ControlThreadExecutionResult {
    return {
      version: THREAD_EXECUTION_CONTROL_VERSION,
      operationId: execution.operationId,
      threadId: execution.threadId,
      state,
    };
  }

  private async cancel(operationId: string): Promise<ControlThreadExecutionResult> {
    const completed = this.retired.get(operationId);
    if (completed) return completed;
    const execution = this.executions.get(operationId);
    if (!execution) throw new Error("Unknown thread execution. No other thread was changed.");
    execution.cancelled = true;
    if (execution.retirement) return execution.retirement;
    const retirement = async (): Promise<ControlThreadExecutionResult> => {
      await execution.admission;
      const { confirmed } = execution.dispatched
        ? await this.ports.close(execution.threadId)
        : { confirmed: true };
      await Promise.allSettled([...execution.replies]);
      await execution.start?.catch(() => undefined);
      const result: ControlThreadExecutionResult = {
        version: THREAD_EXECUTION_CONTROL_VERSION,
        operationId,
        threadId: execution.threadId,
        state: "cancelled" as const,
        confirmed,
      };
      if (confirmed) {
        this.executions.delete(operationId);
        this.owners.delete(execution.threadId);
        this.remember(result);
      }
      return result;
    };
    execution.retirement = retirement();
    try {
      return await execution.retirement;
    } finally {
      delete execution.retirement;
    }
  }

  private remember(result: ControlThreadExecutionResult): void {
    this.retired.set(result.operationId, result);
    if (this.retired.size > 128) this.retired.delete(this.retired.keys().next().value!);
  }
}
