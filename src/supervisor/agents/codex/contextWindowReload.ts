import { resolveCodexContextWindowTokens } from "@/shared/agents/codexContextWindows";
import type { ThreadConfig } from "@/shared/contracts";
import type { CodexClientRequestMap } from "./protocol";

type ThreadResumeParams = CodexClientRequestMap["thread/resume"]["params"];

/** RPC surface and override builder the reload needs; supplied by the session. */
export interface CodexContextWindowReloadHost {
  request<M extends "thread/unsubscribe" | "thread/resume" | "thread/read">(
    method: M,
    params: CodexClientRequestMap[M]["params"],
  ): Promise<CodexClientRequestMap[M]["result"]>;
  /** `thread/resume` overrides (model, cwd, sandbox, `config`) for `config`. */
  buildResumeOverrides(config: ThreadConfig): Omit<ThreadResumeParams, "threadId">;
}

/**
 * Applies a composer context-window change to an already-open Codex thread.
 *
 * The window is a `config` override (`model_context_window`,
 * `model_auto_compact_token_limit`) that only `thread/start` / `thread/resume`
 * accept. A `thread/resume` of a loaded thread ignores overrides unless the
 * thread has no subscribers and is idle — then the app-server shuts it down
 * and cold-resumes it with the new overrides (verified against 0.155.1:
 * `thread/unsubscribe` + `thread/resume` changes the reported window). So a
 * changed window is applied between turns by unsubscribing and resuming.
 *
 * While the reload runs, every notification for the thread is held back: the
 * server reports `notLoaded`/`idle` status and replays token usage and goal
 * state for the resumed thread, none of which belongs in the live timeline.
 */
export class CodexContextWindowReload {
  private appliedConfig: ThreadConfig | undefined;
  private reloadingThreadId: string | undefined;

  /** Record the config a thread/start, thread/resume, or thread/fork applied. */
  recordApplied(config: ThreadConfig): void {
    this.appliedConfig = config;
  }

  needsReload(config: ThreadConfig): boolean {
    return (
      this.appliedConfig !== undefined &&
      resolveCodexContextWindowTokens(config.contextSize) !==
        resolveCodexContextWindowTokens(this.appliedConfig.contextSize)
    );
  }

  /**
   * True while reloading, for a notification of the reloading thread or one
   * without a thread (the resume itself emits a connection-wide
   * `deprecationNotice`) — the same scope the open-time resume suppresses.
   */
  holdsNotification(notificationThreadId: string | undefined): boolean {
    return (
      this.reloadingThreadId !== undefined &&
      (notificationThreadId === undefined || notificationThreadId === this.reloadingThreadId)
    );
  }

  /**
   * Reload `threadId` so `config`'s window applies to the next turn. Never
   * throws: on failure the thread is left subscribed on its previous window
   * (a failed resume retries with the last applied config) and the caller's
   * turn proceeds. Returns whether the new window was applied.
   */
  async reload(
    host: CodexContextWindowReloadHost,
    threadId: string,
    config: ThreadConfig,
  ): Promise<boolean> {
    const previousConfig = this.appliedConfig;
    this.reloadingThreadId = threadId;
    try {
      try {
        await host.request("thread/unsubscribe", { threadId });
      } catch (error) {
        console.warn("[codex] context window reload: thread/unsubscribe failed:", error);
        return false;
      }
      try {
        await host.request("thread/resume", { ...host.buildResumeOverrides(config), threadId });
        this.recordApplied(config);
        return true;
      } catch (error) {
        console.warn("[codex] context window reload: thread/resume failed:", error);
        if (previousConfig) {
          await host
            .request("thread/resume", { ...host.buildResumeOverrides(previousConfig), threadId })
            .catch((retryError: unknown) => {
              console.warn("[codex] context window reload: re-resume failed:", retryError);
            });
        }
        return false;
      } finally {
        // Barrier: the resume's trailing notifications (goal state, usage
        // replay) are written before this response on the same connection.
        await host.request("thread/read", { threadId, includeTurns: false }).catch(() => undefined);
      }
    } finally {
      this.reloadingThreadId = undefined;
    }
  }
}
