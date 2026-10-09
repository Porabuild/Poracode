/**
 * Lifecycle for agent-initiated ACP extension requests (JSON-RPC requests
 * outside the ACP v1 method set).
 *
 * The SDK routes such a request to the client's `extMethod` callback, but the
 * callback signature carries no request identity, no cancellation and no way
 * to decline — which historically made every extension request resolve as an
 * empty success even when nobody handled it. This module owns the missing
 * lifecycle: an explicit provider-supplied handler with per-request identity
 * and abort signal, a bounded timeout, exactly-once completion, and honest
 * errors — an unclaimed request surfaces as a real `method not found` to the
 * agent instead of a fabricated `{}`.
 *
 * Vendor wire names live in provider handlers; nothing here learns one.
 */

import { RequestError } from "@agentclientprotocol/sdk";
import { assertBoundedJson } from "@/shared/jsonBounds";
import type {
  AcpExtensionRequestContext,
  AcpExtensionRequestHandler,
  AcpExtensionRequestOutcome,
} from "../base/types";

/**
 * Default bound for a pending extension request. Generous enough for
 * autonomous handlers; a provider whose handler waits on slow human input
 * declares a larger `requestTimeoutMs` instead of leaving requests unbounded.
 */
export const ACP_EXTENSION_REQUEST_DEFAULT_TIMEOUT_MS = 30_000;

/** Handler-declared JSON-RPC error, replayed to the agent with bounded fields. */
export class AcpExtensionRequestError extends Error {
  constructor(
    /** JSON-RPC error code carried into the response. */
    readonly code: number,
    message: string,
    /** Optional bounded JSON-object error data. Non-object values are dropped. */
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AcpExtensionRequestError";
  }
}

/** What a settled request told the caller (`AcpStructuredSession`) to answer. */
export type AcpExtensionRequestResolution =
  | { readonly handled: true; readonly result: Record<string, unknown> }
  | { readonly handled: false };

export interface AcpExtensionRequestsOptions {
  threadId: string;
  /** Live ACP session id, used for per-request identity checks. */
  getSessionId: () => string | undefined;
  /** Provider-owned handler; absent means every request is unhandled here. */
  handler?: AcpExtensionRequestHandler | undefined;
  /** Pending-request bound; defaults to {@link ACP_EXTENSION_REQUEST_DEFAULT_TIMEOUT_MS}. */
  requestTimeoutMs?: number | undefined;
}

interface PendingExtensionRequest {
  readonly method: string;
  /** Session lifecycle epoch this request belongs to; `reset()` invalidates it. */
  readonly generation: number;
  readonly sessionId: string | undefined;
  readonly controller: AbortController;
  readonly resolve: (resolution: AcpExtensionRequestResolution) => void;
  readonly reject: (error: unknown) => void;
  settled: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
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

function isHandledOutcome(
  value: unknown,
): value is Extract<AcpExtensionRequestOutcome, { handled: true }> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { handled?: unknown }).handled === true &&
    "result" in value
  );
}

/**
 * Serve agent-initiated extension requests for one ACP session. Every request
 * is settled exactly once; timeout, cancellation, disposal and session
 * generation changes all discard late handler resolutions.
 */
export class AcpExtensionRequests {
  private readonly pending = new Set<PendingExtensionRequest>();
  private generation = 0;
  private disposed = false;
  private readonly timeoutMs: number;

  constructor(private readonly options: AcpExtensionRequestsOptions) {
    const timeoutMs = options.requestTimeoutMs ?? ACP_EXTENSION_REQUEST_DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError("ACP extension request timeout must be a positive integer.");
    }
    this.timeoutMs = timeoutMs;
  }

  /** Number of requests currently awaiting a handler resolution. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Answer one agent-initiated extension request. Resolves with the handler's
   * typed result, or `{ handled: false }` when the provider does not claim
   * the method (the caller then applies its fallback and must eventually
   * answer the agent — typically `method not found`). Rejects with a
   * `RequestError` when the request must fail: unknown session identity,
   * typed handler errors, cancellation, timeout, or disposal.
   */
  async handleRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<AcpExtensionRequestResolution> {
    if (this.disposed) {
      throw RequestError.methodNotFound(method);
    }
    this.assertRequestSessionIdentity(params);
    try {
      assertBoundedJson(params, 1024 * 1024);
    } catch {
      throw RequestError.invalidParams({ message: "Extension request exceeds JSON bounds." });
    }
    const handler = this.options.handler;
    if (!handler) {
      return { handled: false };
    }

    const controller = new AbortController();
    let resolveOutcome!: (resolution: AcpExtensionRequestResolution) => void;
    let rejectOutcome!: (error: unknown) => void;
    const pending = new Promise<AcpExtensionRequestResolution>((resolve, reject) => {
      resolveOutcome = resolve;
      rejectOutcome = reject;
    });
    const entry: PendingExtensionRequest = {
      method,
      generation: this.generation,
      sessionId: this.options.getSessionId(),
      controller,
      resolve: resolveOutcome,
      reject: rejectOutcome,
      settled: false,
      timer: undefined,
    };
    entry.timer = setTimeout(() => {
      this.settleCancelled(
        entry,
        `Extension request ${method} timed out after ${this.timeoutMs}ms`,
        { method, reason: "timeout" },
      );
    }, this.timeoutMs);
    if (typeof entry.timer.unref === "function") entry.timer.unref();
    this.pending.add(entry);

    void this.runHandler(entry, method, params, handler);
    return pending;
  }

  /**
   * Reject every pending request with a cancelled error and abort the
   * handlers' signals. Used on turn interrupt and transport loss, where the
   * answers can no longer reach a live agent.
   */
  cancelPending(reason = "Extension requests cancelled"): void {
    for (const entry of [...this.pending]) {
      this.settleCancelled(entry, reason);
    }
  }

  /**
   * Invalidate all pending requests because the session identity changed (a
   * re-open on the same connection). Late resolutions from the previous
   * generation are discarded even if their handlers never observe the abort.
   */
  reset(): void {
    this.generation += 1;
    this.cancelPending("Extension requests cancelled: session reopened");
  }

  /**
   * Stop serving requests. Pending requests are cancelled; every later
   * request — including one whose handler is still running — is refused.
   */
  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.cancelPending("Extension requests cancelled: session disposed");
  }

  private async runHandler(
    entry: PendingExtensionRequest,
    method: string,
    params: Record<string, unknown>,
    handler: AcpExtensionRequestHandler,
  ): Promise<void> {
    let outcome: AcpExtensionRequestOutcome;
    const ctx: AcpExtensionRequestContext = {
      threadId: this.options.threadId,
      sessionId: entry.sessionId,
      signal: entry.controller.signal,
    };
    try {
      outcome = await handler(method, params, ctx);
    } catch (error) {
      this.settleHandlerError(entry, error);
      return;
    }
    if (entry.settled || entry.generation !== this.generation || this.disposed) {
      // Late handler result after timeout/cancel/dispose/reset: the agent was
      // already answered exactly once, so the result is dropped.
      return;
    }
    if (entry.sessionId !== this.options.getSessionId()) {
      this.settleCancelled(entry, "Extension request session identity changed");
      return;
    }
    if (isHandledOutcome(outcome)) {
      if (!isRecordObject(outcome.result)) {
        this.settle(entry, () =>
          entry.reject(
            new RequestError(
              -32603,
              "Internal error: extension request handler returned a non-object result",
              { method },
            ),
          ),
        );
        return;
      }
      try {
        assertBoundedJson(outcome.result, 1024 * 1024);
      } catch {
        this.settleHandlerError(entry, new Error("Extension result exceeds JSON bounds."));
        return;
      }
      this.settle(entry, () => entry.resolve({ handled: true, result: outcome.result }));
      return;
    }
    if (
      typeof outcome === "object" &&
      outcome !== null &&
      (outcome as { handled?: unknown }).handled === false
    ) {
      this.settle(entry, () => entry.resolve({ handled: false }));
      return;
    }
    this.settle(entry, () =>
      entry.reject(
        new RequestError(
          -32603,
          "Internal error: extension request handler returned a malformed outcome",
          { method },
        ),
      ),
    );
  }

  private settleHandlerError(entry: PendingExtensionRequest, error: unknown): void {
    if (error instanceof AcpExtensionRequestError) {
      let data = error.data && isRecordObject(error.data) ? error.data : undefined;
      try {
        if (data) assertBoundedJson(data, 64 * 1024);
      } catch {
        data = undefined;
      }
      this.settle(entry, () => {
        entry.reject(new RequestError(error.code, boundedMessage(error), data));
      });
      return;
    }
    this.settle(entry, () => {
      entry.reject(RequestError.internalError({ message: boundedMessage(error) }));
    });
  }

  private assertRequestSessionIdentity(params: Record<string, unknown>): void {
    const requested = (params as { sessionId?: unknown } | null | undefined)?.sessionId;
    if (typeof requested !== "string") return;
    const sessionId = this.options.getSessionId();
    if (!sessionId || requested !== sessionId) {
      throw RequestError.invalidParams({ message: `Unknown ACP session: ${requested}` });
    }
  }

  private settleCancelled(
    entry: PendingExtensionRequest,
    reason: string,
    data?: Record<string, unknown>,
  ): void {
    this.settle(
      entry,
      () => {
        entry.reject(new RequestError(-32800, reason, data));
      },
      { abort: true },
    );
  }

  /**
   * Settle exactly once: flips the flag before any resolution escapes. Only
   * cancellation paths abort the handler's signal — a completed request has
   * no in-flight work to release.
   */
  private settle(
    entry: PendingExtensionRequest,
    resolve: () => void,
    options?: { abort?: boolean },
  ): void {
    if (entry.settled) return;
    entry.settled = true;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    this.pending.delete(entry);
    if (options?.abort) entry.controller.abort();
    resolve();
  }
}
