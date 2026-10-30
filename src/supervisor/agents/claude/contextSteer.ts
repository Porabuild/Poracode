import type {
  HookCallbackMatcher,
  HookEvent,
  HookInput,
  HookJSONOutput,
  SDKAssistantMessage,
} from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeContextSteerHost {
  /** A turn is in flight, no Stop is pending, and the session is open. */
  canTakeContext(): boolean;
}

type Waiter = PromiseWithResolvers<void>;

/**
 * `steerContext` for the SDK session, installed only on a session launched
 * with `mayReceiveContextSteers`. Claude Code takes no mid-turn input that is
 * neither an interrupt nor a queued user message, so the text rides on a
 * programmatic `PostToolBatch` hook: its `additionalContext` reaches the model
 * with the request that follows the main agent's next tool batch, as hidden
 * meta context. Claude Code keeps that `hook_additional_context` attachment
 * off the SDK stream, so nothing is painted, and the session import reads only
 * non-meta user and assistant transcript records, so it never resurfaces as a
 * prompt.
 *
 * Handing the text to the hook does not settle the steer: Claude Code drops
 * hook context when a tool result ends the turn. The steer resolves with the
 * first main-thread assistant message of a later response in the same turn,
 * the model's reply to the request that carried it, and rejects if the turn
 * ends, is stopped or restarts, or the session closes first. That includes
 * Claude Code versions without `PostToolBatch`, whose hook never fires.
 * Another steer before the hand-over joins the pending text. Batches of
 * Claude's own sub-agents carry an `agent_id` and are skipped, so the text
 * reaches the main agent.
 */
export class ClaudeContextSteer {
  private pending: { readonly texts: string[]; readonly waiters: Waiter[] } | undefined;
  /** Texts a hook handed over, waiting for a reply from a response other than `afterResponse`. */
  private handedOver:
    | { readonly afterResponse: string | undefined; readonly waiters: Waiter[] }
    | undefined;
  /** Response id of the last main-thread assistant message, in stream order. */
  private lastResponse: string | undefined;
  /** The query's programmatic hooks, run alongside settings and plugin hooks. */
  readonly hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  constructor(private readonly host: ClaudeContextSteerHost) {
    this.hooks = {
      PostToolBatch: [
        { hooks: [async (input, _toolUseId, { signal }) => this.takeForBatch(input, signal)] },
      ],
    };
  }

  /** Queues `text` for the running turn; starts or interrupts no turn and paints nothing. */
  steer(text: string): Promise<void> {
    if (!this.host.canTakeContext()) {
      return Promise.reject(new Error("No Claude turn is running to take the context."));
    }
    const pending = (this.pending ??= { texts: [], waiters: [] });
    if (!pending.texts.includes(text)) pending.texts.push(text);
    const waiter = Promise.withResolvers<void>();
    pending.waiters.push(waiter);
    return waiter.promise;
  }

  /**
   * Every main-thread assistant message the session consumes. Blocks of the
   * response that made the batch share its id even when they are consumed
   * after the hook ran, so only another response settles the hand-over; a
   * synthetic API-error message never does.
   */
  observeAssistantMessage(message: SDKAssistantMessage): void {
    const response = message.message.id;
    const handedOver = this.handedOver;
    if (handedOver && response !== handedOver.afterResponse && !message.error) {
      this.handedOver = undefined;
      for (const waiter of handedOver.waiters) waiter.resolve();
    }
    this.lastResponse = response;
  }

  /** The turn that would take the text is over; the caller falls back. */
  cancel(reason: string): void {
    const waiters = [...(this.pending?.waiters ?? []), ...(this.handedOver?.waiters ?? [])];
    this.pending = undefined;
    this.handedOver = undefined;
    if (waiters.length === 0) return;
    const error = new Error(reason);
    for (const waiter of waiters) waiter.reject(error);
  }

  private takeForBatch(input: HookInput, signal: AbortSignal): HookJSONOutput {
    const pending = this.pending;
    if (
      !pending ||
      signal.aborted ||
      input.hook_event_name !== "PostToolBatch" ||
      input.agent_id ||
      !this.host.canTakeContext()
    ) {
      return {};
    }
    this.pending = undefined;
    const handedOver = (this.handedOver ??= { afterResponse: this.lastResponse, waiters: [] });
    handedOver.waiters.push(...pending.waiters);
    return {
      hookSpecificOutput: {
        hookEventName: "PostToolBatch",
        additionalContext: pending.texts.join("\n\n"),
      },
    };
  }
}
