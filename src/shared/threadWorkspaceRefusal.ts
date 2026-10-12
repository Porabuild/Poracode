import { msg } from "./messages";

/** Localized user outcome with a separate diagnostic cause; never a grant or retry receipt. */
export class WorkspaceLaunchUnavailableError extends Error {
  constructor(reason: string, cause?: unknown) {
    super(msg("thread.workspaceLaunchUnavailable"), { cause: cause ?? new Error(reason) });
    this.name = "WorkspaceLaunchUnavailableError";
  }
}
