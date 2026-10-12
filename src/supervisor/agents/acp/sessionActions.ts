/**
 * Neutral registry for provider-declared outbound session actions.
 *
 * Providers describe what they can do to a live ACP session as capability
 * descriptors — a stable neutral id plus a provider-owned payload validator
 * and invocation callback (typically one vendor extension RPC inside the
 * callback). The shared side addresses actions strictly by id with a
 * validated payload, so host code can never tunnel a raw wire method and
 * arbitrary parameters to the agent. Every failure is a typed error; an
 * action never fails as a silent success.
 */

import type {
  AcpSessionActionContext,
  AcpSessionActionDescriptor,
  AcpSessionActionInfo,
} from "../base/types";
import { assertBoundedJson } from "@/shared/jsonBounds";

export type AcpSessionActionFailure =
  | "unknown_action"
  | "invalid_payload"
  | "unavailable"
  | "failed";

/** Typed, bounded failure of a session action invocation. */
export class AcpSessionActionError extends Error {
  constructor(
    readonly reason: AcpSessionActionFailure,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AcpSessionActionError";
  }
}

export interface AcpSessionActionRegistryOptions {
  threadId: string;
  /** Live ACP session id, reported to invocations for identity checks. */
  getSessionId: () => string | undefined;
  actions: readonly AcpSessionActionDescriptor[];
  actionTimeoutMs?: number;
}

const MESSAGE_MAX_CHARS = 300;

function boundedMessage(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const trimmed = raw.trim();
  return trimmed.length > MESSAGE_MAX_CHARS ? `${trimmed.slice(0, MESSAGE_MAX_CHARS)}…` : trimmed;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultValidatePayload(payload: unknown): Record<string, unknown> {
  if (!isRecordObject(payload)) {
    throw new Error("Session action payload must be an object.");
  }
  return payload;
}

/**
 * Owns the declared session actions of one ACP session. Registration
 * validates the descriptors eagerly (duplicate or empty ids are programming
 * errors); invocation validates payloads per descriptor and normalizes every
 * failure into {@link AcpSessionActionError}.
 */
export class AcpSessionActionRegistry {
  private readonly byId = new Map<string, AcpSessionActionDescriptor>();
  private abortController = new AbortController();
  private disposed = false;
  private readonly timeoutMs: number;

  constructor(private readonly options: AcpSessionActionRegistryOptions) {
    this.timeoutMs = options.actionTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RangeError("Session action timeout must be a positive integer.");
    }
    for (const action of options.actions) {
      if (typeof action?.id !== "string" || action.id.length === 0) {
        throw new RangeError("A session action descriptor requires a non-empty id.");
      }
      if (this.byId.has(action.id)) {
        throw new RangeError(`Duplicate session action id: ${action.id}`);
      }
      if (typeof action.invoke !== "function") {
        throw new RangeError(`Session action ${action.id} requires an invoke callback.`);
      }
      this.byId.set(action.id, action);
    }
  }

  /** Metadata-only projection — descriptors and callbacks never leak here. */
  listActions(): readonly AcpSessionActionInfo[] {
    return [...this.byId.keys()].map((id) => ({ id }));
  }

  /**
   * Invoke one declared action by neutral id. The payload is validated by the
   * descriptor (or the default object-shape check) before the provider's
   * callback runs; results must be JSON objects.
   */
  async invoke(actionId: string, payload: unknown): Promise<Record<string, unknown>> {
    if (this.disposed) {
      throw new AcpSessionActionError("unavailable", "Session actions are no longer available.", {
        actionId,
      });
    }
    const action = this.byId.get(actionId);
    if (!action) {
      throw new AcpSessionActionError("unknown_action", `Unknown session action: ${actionId}`, {
        actionId,
      });
    }
    let normalized: Record<string, unknown>;
    try {
      assertBoundedJson(payload, 64 * 1024);
      normalized = (action.validatePayload ?? defaultValidatePayload)(payload);
      assertBoundedJson(normalized, 64 * 1024);
    } catch (error) {
      throw new AcpSessionActionError("invalid_payload", boundedMessage(error), { actionId });
    }
    if (!isRecordObject(normalized)) {
      throw new AcpSessionActionError(
        "invalid_payload",
        "Session action payload validator must return an object.",
        { actionId },
      );
    }
    let result: Record<string, unknown>;
    const lifecycle = this.abortController.signal;
    const controller = new AbortController();
    const ctx: AcpSessionActionContext = {
      threadId: this.options.threadId,
      sessionId: this.options.getSessionId(),
      signal: controller.signal,
    };
    try {
      result = await new Promise<Record<string, unknown>>((resolve, reject) => {
        let settled = false;
        const finish = (complete: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          lifecycle.removeEventListener("abort", cancel);
          complete();
        };
        const cancel = () =>
          finish(() => {
            controller.abort();
            reject(
              new AcpSessionActionError("unavailable", "Session action cancelled.", { actionId }),
            );
          });
        const timer = setTimeout(
          () =>
            finish(() => {
              controller.abort();
              reject(
                new AcpSessionActionError("unavailable", "Session action timed out.", { actionId }),
              );
            }),
          this.timeoutMs,
        );
        timer.unref();
        lifecycle.addEventListener("abort", cancel, { once: true });
        Promise.resolve()
          .then(() => {
            if (settled) return undefined;
            return action.invoke(normalized, ctx);
          })
          .then(
            (value) =>
              finish(() => {
                if (
                  this.disposed ||
                  lifecycle.aborted ||
                  this.options.getSessionId() !== ctx.sessionId
                ) {
                  controller.abort();
                  reject(
                    new AcpSessionActionError("unavailable", "Session action identity changed.", {
                      actionId,
                    }),
                  );
                } else if (isRecordObject(value)) resolve(value);
                else
                  reject(
                    new AcpSessionActionError(
                      "failed",
                      "Session action returned a non-object result.",
                      { actionId },
                    ),
                  );
              }),
            (error: unknown) => finish(() => reject(error)),
          );
      });
    } catch (error) {
      if (error instanceof AcpSessionActionError) throw error;
      throw new AcpSessionActionError("failed", boundedMessage(error), { actionId });
    }
    if (!isRecordObject(result)) {
      throw new AcpSessionActionError("failed", "Session action returned a non-object result.", {
        actionId,
      });
    }
    try {
      assertBoundedJson(result, 512 * 1024);
    } catch (error) {
      throw new AcpSessionActionError("failed", boundedMessage(error), { actionId });
    }
    return result;
  }

  /**
   * Abort in-flight invocations (session identity changed) while keeping the
   * registry usable for the next generation.
   */
  abortPending(): void {
    if (this.disposed) return;
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  /** Abort in-flight invocations and refuse all further ones. */
  dispose(): void {
    this.disposed = true;
    this.abortController.abort();
  }
}
