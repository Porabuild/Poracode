import { logAdapterDebug } from "../diagnostics";
import type { RouterContext } from "./context";

/**
 * Subagent subscriptions: the host buffers a subagent's child events until its
 * task item completes unless a client subscribes. We subscribe while a running
 * subagent's virtual session is open, unsubscribe on completion and on adapter
 * shutdown; failures are debug-log noise only.
 */
export function createSubagents(ctx: RouterContext) {
  const subagentKey = (rawThreadId: string, taskItemId: string) => `${rawThreadId}${taskItemId}`;
  const subscribeSubagent = (rawThreadId: string, taskItemId: string) => {
    const key = subagentKey(rawThreadId, taskItemId);
    if (ctx.subagentSubscriptions.has(key)) return;
    ctx.subagentSubscriptions.add(key);
    void ctx.input.client
      .callRemoteProcedure("subagentSubscribe", {
        threadId: rawThreadId,
        parentItemId: taskItemId,
      })
      .catch(async (error) => {
        ctx.subagentSubscriptions.delete(key);
        if (ctx.debug)
          await logAdapterDebug(ctx.input.bootstrap.home, {
            source: "subagent.subscribe",
            error: error instanceof Error ? error.message : String(error),
          });
      });
  };
  const unsubscribeSubagent = (rawThreadId: string, taskItemId: string) => {
    const key = subagentKey(rawThreadId, taskItemId);
    if (!ctx.subagentSubscriptions.delete(key)) return;
    void ctx.input.client
      .callRemoteProcedure("subagentUnsubscribe", {
        threadId: rawThreadId,
        parentItemId: taskItemId,
      })
      .catch(async (error) => {
        if (ctx.debug)
          await logAdapterDebug(ctx.input.bootstrap.home, {
            source: "subagent.unsubscribe",
            error: error instanceof Error ? error.message : String(error),
          });
      });
  };
  const disposeSubagentSubscriptions = () => {
    for (const key of [...ctx.subagentSubscriptions]) {
      const [rawThreadId, taskItemId] = key.split("");
      if (rawThreadId && taskItemId) unsubscribeSubagent(rawThreadId, taskItemId);
    }
  };
  return {
    subagentKey,
    subscribeSubagent,
    unsubscribeSubagent,
    disposeSubagentSubscriptions,
  };
}
