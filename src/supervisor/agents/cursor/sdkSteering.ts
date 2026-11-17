import type { PromptSegment, ThreadConfig } from "@/shared/contracts";
import type { StartTurnOptions } from "../base";
import type { CursorSdkUserMessage } from "./sdkPrompt";
import type { CursorSdkWorkerSteerResult } from "./sdkWorkerProtocol";

export interface CursorSdkSteerInput {
  prompt: string;
  config: ThreadConfig;
  segments?: PromptSegment[];
  options: StartTurnOptions & { userMessageItemId: string };
}

export interface CursorSdkSteerRun {
  ready: Promise<void>;
  completion: Promise<void>;
  canSteer(config: ThreadConfig): boolean;
  isCancelled(): boolean;
  steer(text: string): Promise<CursorSdkWorkerSteerResult>;
}

interface CursorSdkSteeringDriver {
  activeRun(): CursorSdkSteerRun | undefined;
  buildMessage(input: CursorSdkSteerInput): Promise<string | CursorSdkUserMessage>;
  paintMessage(input: CursorSdkSteerInput): void;
  start(input: CursorSdkSteerInput, message: string | CursorSdkUserMessage): Promise<void>;
  drained(): void;
}

/** Serializes SDK steering acknowledgements and retains rejected steers as
 * follow-up turns. Stop/disposal invalidates queued work without resending an
 * input that the SDK already accepted. Run completion remains authoritative. */
export class CursorSdkSteering {
  private controller = new AbortController();
  private preparationTail: Promise<void> = Promise.resolve();
  private tail: Promise<void> = Promise.resolve();
  private readonly pending = new Set<symbol>();

  constructor(private readonly driver: CursorSdkSteeringDriver) {}

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  enqueue(input: CursorSdkSteerInput): Promise<void> {
    const token = Symbol();
    const signal = this.controller.signal;
    const { onPromptSubmitted, ...deliveryOptions } = input.options;
    const deliveryInput = { ...input, options: deliveryOptions };
    this.pending.add(token);
    // Retain prepared inputs independently of delivery. A run may take minutes
    // to accept a steer or finish before a config/image follow-up can start.
    // That wait must not keep an already-accepted composer submission open.
    const prepared = this.preparationTail.then(async () => {
      if (signal.aborted) return;
      const message = await this.driver.buildMessage(input).catch((error: unknown) => {
        if (!signal.aborted) throw error;
      });
      if (signal.aborted) return;
      if (message === undefined) return;
      this.driver.paintMessage(input);
      onPromptSubmitted?.();
      return message;
    });
    this.preparationTail = prepared.then(
      () => {},
      () => {},
    );
    const delivery = this.tail.then(async () => {
      const message = await prepared;
      if (message !== undefined) await this.deliver(deliveryInput, message, signal);
    });
    this.tail = delivery.catch(() => {});
    // Preparation failures reject promptly even behind a long-running delivery.
    return Promise.all([prepared, delivery])
      .then(() => {})
      .finally(() => {
        if (this.pending.delete(token) && !this.hasPending) this.driver.drained();
      });
  }

  cancel(): void {
    this.controller.abort();
    this.controller = new AbortController();
    this.pending.clear();
    this.preparationTail = Promise.resolve();
    this.tail = Promise.resolve();
  }

  private async deliver(
    input: CursorSdkSteerInput,
    message: string | CursorSdkUserMessage,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return;
    let run = this.driver.activeRun();
    while (run) {
      if (!(await waitUnlessCancelled(run.ready, signal))) return;
      // run.steer() accepts text only and cannot update the model, mode, MCP,
      // or safety posture. Preserve those inputs in a normal follow-up send.
      if (!run.isCancelled() && typeof message === "string" && run.canSteer(input.config)) {
        let result: CursorSdkWorkerSteerResult;
        try {
          const acknowledgement = await waitUnlessCancelled(run.steer(message), signal);
          if (!acknowledgement) return;
          result = acknowledgement.value;
        } catch (error) {
          if (signal.aborted) return;
          throw error;
        }
        if (result === "complete_delivered" || signal.aborted) return;
      }
      if (!(await waitUnlessCancelled(run.completion, signal))) return;
      // A concurrent direct submit can claim the cancellation/finish boundary.
      // Deliver against its run instead of racing an ordinary start or losing
      // this input behind a busy rejection.
      run = this.driver.activeRun();
    }
    if (!signal.aborted) await this.driver.start(input, message);
  }
}

async function waitUnlessCancelled<Value>(
  promise: Promise<Value>,
  signal: AbortSignal,
): Promise<{ value: Value } | undefined> {
  if (signal.aborted) {
    void promise.catch(() => {});
    return undefined;
  }
  let cancel!: () => void;
  const cancellation = new Promise<undefined>((resolve) => {
    cancel = () => resolve(undefined);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    const result = await Promise.race([promise.then((value) => ({ value })), cancellation]);
    return signal.aborted ? undefined : result;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
