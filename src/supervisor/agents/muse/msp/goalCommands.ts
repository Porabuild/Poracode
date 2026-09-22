import { msg } from "@/shared/messages";
import type { MuseMspClient } from "./client";
import { isMspRpcError } from "./protocol";
import { mintMspCommandId } from "./uuidv7";
import type { MuseGoalRpcMethod } from "./localCommands";

/**
 * Run one `goal/*` session command and report the ack. `set`/`edit`/`resume`
 * may wake a goal-driving turn, whose id the host carries on the ack (live:
 * an idle wake names the fresh turn, a busy admission names the
 * admission-time active turn, `pause`/`clear` never name one) — the caller
 * adopts a fresh id the same way `turn/start` acks are adopted.
 *
 * Host rejections map to friendly errors: pre-goal hosts (1.0.x) answer
 * `methodNotFound`, verbs that need an existing goal reject `missing_goal`
 * once it is cleared, and verbs that don't apply to the goal's current status
 * (e.g. pausing a goal the host already paused) reject `invalid_goal_state`.
 */
export async function dispatchMuseGoalCommand(
  client: Pick<MuseMspClient, "request">,
  sessionId: string,
  method: MuseGoalRpcMethod,
  objective?: string,
): Promise<{ turnId?: string }> {
  const commandId = mintMspCommandId();
  let result: Record<string, unknown>;
  try {
    result = await client.request(method, {
      commandId,
      sessionId,
      ...(objective !== undefined ? { objective } : {}),
    });
  } catch (error) {
    throw toMuseGoalError(error);
  }
  const turnId = result["turnId"];
  return typeof turnId === "string" && turnId.length > 0 ? { turnId } : {};
}

function toMuseGoalError(error: unknown): Error {
  if (isMspRpcError(error)) {
    if (error.kind === "methodNotFound") {
      return new Error(msg("thread.goal.unsupported"));
    }
    if (error.kind === "commandRejected" && error.data?.["reason"] === "missing_goal") {
      return new Error(msg("thread.goal.none"));
    }
    if (error.kind === "commandRejected" && error.data?.["reason"] === "invalid_goal_state") {
      return new Error(msg("thread.goal.invalidState"));
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}
