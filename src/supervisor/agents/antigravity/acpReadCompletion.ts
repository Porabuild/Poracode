/**
 * Antigravity file-read completion.
 *
 * `agy_acp_server` opens each file read (`view_file` / `client_view_file`,
 * ACP kind `read`) with `tool_call { status: "in_progress" }` and sends the
 * `tool_call_update { status: "completed" }` only right before `end_turn`,
 * after the model has long since consumed the file (captured against
 * agy_acp_server 1.0.0). Searches complete promptly, so without this the read
 * rows alone paint as running for the whole turn.
 *
 * Two signals settle a pending read, both safe when reads run in parallel:
 *  - Poracode served the `fs/readTextFile` the tool issued for that path —
 *    exact and per call (`client_view_file`).
 *  - The model produced text or a thought — it can only continue once every
 *    pending tool result is in, so all reads are done (`view_file`, which the
 *    server reads itself and never routes through the client).
 * A further `tool_call` is deliberately not a signal: agy may announce a batch
 * before the earlier calls in it have finished.
 *
 * The server's own late terminal update then targets an id the mapper no
 * longer tracks and is dropped.
 */

import type { RuntimeEvent } from "@/shared/contracts";
import type { AcpMapperState } from "../acp/canonicalMapping/state";
import { finalizeToolCallPayload } from "../acp/canonicalMapping/toolCallPayloads";
import {
  getExtensionStore,
  type AcpExtensionToolCallInput,
  type AcpTextStreamExtension,
} from "../acp/canonicalMapping/textStreamExtension";

const EXTENSION_ID = "antigravity.readCompletion";
const READ_KIND = "read";

interface PendingRead {
  itemId: string;
  /** Normalized path the read targets, when the tool call carried one. */
  path?: string;
}

interface AntigravityReadCompletionStore {
  /** Open `read` tool calls keyed by ACP `toolCallId`, in arrival order. */
  pendingReads: Map<string, PendingRead>;
}

/** Exported for tests; the shared mapper never reads it. */
export function readAntigravityReadCompletionState(
  state: AcpMapperState,
): AntigravityReadCompletionStore {
  return store(state);
}

function store(state: AcpMapperState): AntigravityReadCompletionStore {
  return getExtensionStore<AntigravityReadCompletionStore>(state, EXTENSION_ID, () => ({
    pendingReads: new Map(),
  }));
}

export function createAntigravityReadCompletionExtension(): AcpTextStreamExtension {
  return {
    id: EXTENSION_ID,
    trackToolCall(input: AcpExtensionToolCallInput): void {
      if (input.payload.kind !== READ_KIND) return;
      const pending = store(input.state).pendingReads;
      if (input.payload.status !== "running") {
        pending.delete(input.toolCall.toolCallId);
        return;
      }
      const path = readRequestedPath(input.toolCall.rawInput, input.payload.locations);
      pending.set(input.toolCall.toolCallId, {
        itemId: input.itemId,
        ...(path ? { path } : {}),
      });
    },
    observeSessionUpdate({ state, update }): RuntimeEvent[] {
      if (!isModelOutput(update)) return [];
      const pending = store(state).pendingReads;
      if (pending.size === 0) return [];
      const events: RuntimeEvent[] = [];
      for (const toolCallId of [...pending.keys()]) {
        events.push(...completePendingRead(state, toolCallId));
      }
      return events;
    },
    handleClientFileRead({ state, path }): RuntimeEvent[] {
      const wanted = normalizePath(path);
      for (const [toolCallId, pending] of store(state).pendingReads) {
        if (pending.path === wanted) return completePendingRead(state, toolCallId);
      }
      return [];
    },
    resetForTurnEnd(state: AcpMapperState): void {
      // Whatever is still open was sealed by the shared turn-boundary close.
      store(state).pendingReads.clear();
    },
  };
}

function isModelOutput(update: { sessionUpdate: string; content?: unknown }): boolean {
  if (update.sessionUpdate === "agent_thought_chunk") return true;
  if (update.sessionUpdate !== "agent_message_chunk") return false;
  const content = update.content as { type?: string; text?: string } | undefined;
  return content?.type !== "text" || (content.text?.length ?? 0) > 0;
}

function completePendingRead(state: AcpMapperState, toolCallId: string): RuntimeEvent[] {
  store(state).pendingReads.delete(toolCallId);
  const item = state.toolCallItems.get(toolCallId);
  if (!item) return [];
  const payload = { ...finalizeToolCallPayload(state, item), status: "success" };
  item.payload = payload;
  state.toolCallItems.delete(toolCallId);
  return [{ type: "item.completed", threadId: state.threadId, itemId: item.itemId, payload }];
}

/** The file a read targets, from agy's `rawInput` spelling or the ACP location. */
function readRequestedPath(rawInput: unknown, locations: unknown): string | undefined {
  if (rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)) {
    const input = rawInput as Record<string, unknown>;
    const candidate = input.absolute_path ?? input.AbsolutePath;
    if (typeof candidate === "string" && candidate.length > 0) return normalizePath(candidate);
  }
  if (Array.isArray(locations)) {
    const first = locations[0] as { path?: unknown } | undefined;
    if (typeof first?.path === "string" && first.path.length > 0) return normalizePath(first.path);
  }
  return undefined;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
