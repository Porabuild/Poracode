import type { Thread } from "@poracode/codex-protocol";

/**
 * Legacy `thread/rollback` shapes, kept only for the `acp.ts` fallback on
 * pre-0.156 app-servers without `thread/fork`. Codex removed the method (and
 * these generated types) in 0.156.0; the shapes below are copied verbatim from
 * the 0.155.1 generated protocol so the fallback keeps compiling and stays
 * wire-compatible with the servers that still answer it.
 */
export interface ThreadRollbackParams {
  threadId: string;
  /**
   * The number of turns to drop from the end of the thread. Must be >= 1.
   *
   * This only modifies the thread's history and does not revert local file changes
   * that have been made by the agent. Clients are responsible for reverting these changes.
   */
  numTurns: number;
}

export interface ThreadRollbackResponse {
  /**
   * The updated thread after applying the rollback, with `turns` populated.
   *
   * The ThreadItems stored in each Turn are lossy since we explicitly do not
   * persist all agent interactions, such as command executions. This is the same
   * behavior as `thread/resume`.
   */
  thread: Thread;
}
