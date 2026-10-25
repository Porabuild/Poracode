/** A failed launch. `threadId` names the row that exists (and can be relaunched), if any. */
export class PrAskLaunchError extends Error {
  readonly threadId: string | undefined;
  /** The host may already have started the session; do not offer an immediate resend. */
  readonly uncertain: boolean;
  constructor(message: string, threadId: string | undefined, uncertain: boolean) {
    super(message);
    this.name = "PrAskLaunchError";
    this.threadId = threadId;
    this.uncertain = uncertain;
  }
}
