/**
 * Test-only seed spec for the B1 CAPABLE-HOST Android device journey
 * (`Android37CapableHistoryJourneyInstrumentedTest`).
 *
 * The journey needs a disposable GUI thread that already holds a retained,
 * committed canonical prefix AND genuine durable crash evidence (an armed
 * boot epoch plus a surviving thread touch), so the next production boot
 * resolves a real `suspect` / `unclean-epoch` history gap for it. Both halves
 * are produced through the same production DB APIs the host uses:
 * `dbApplyThreadRuntimeEvents` (canonical admission, which arms the epoch and
 * touches the thread before accepting) plus `dbFlushThreadRuntimeWrites`
 * (commits the accepted prefix). Nothing here is imported by production code
 * and no production emit/fault seam exists or is added.
 *
 * The thread is a GUI (`presentationMode: "gui"`) acp-generic thread whose
 * instance is the existing structured ACP stand-in
 * (`fixtures/structured-load-agent.mjs`), so the journey's live append is
 * supervisor-originated canonical content, not an injected frame.
 */

import {
  messageItemPayloadSchema,
  type MessageItemPayload,
  type RuntimeEvent,
  type Thread,
} from "@/shared/contracts";
import { acpGenericKind } from "@/shared/contracts/agentInstance";
import { buildPromptContentBlocks } from "@/shared/promptContent";

export const CAPABLE_HISTORY_SEED_ARMED_MARKER = "CAPABLE_HISTORY_SEED_ARMED";
export const CAPABLE_HISTORY_SEED_FAILED_MARKER = "CAPABLE_HISTORY_SEED_FAILED";
export const CAPABLE_HISTORY_VERIFY_MARKER = "CAPABLE_HISTORY_VERIFY";

/** Distinct, journey-owned ids; the disposable namespace holds nothing else. */
export const CAPABLE_HISTORY_IDS = {
  projectId: "project-capable-history-fixture",
  projectName: "Capable history fixture",
  threadId: "thread-capable-history-fixture",
  threadTitle: "Capable history fixture thread",
  instanceId: "capable-history-fixture-instance",
} as const;

/** Marker prefix carried by both retained prefix items. */
export const CAPABLE_HISTORY_PREFIX_MARKER = "[chj-prefix";

/**
 * Exact per-item markers the androidTest asserts as RENDERED text: the user
 * card and the assistant card must each show their own marker, so a blank
 * user card (the payload-shape defect) can no longer pass on the assistant
 * marker alone.
 */
export const CAPABLE_HISTORY_PREFIX_USER_MARKER = `${CAPABLE_HISTORY_PREFIX_MARKER}-user]`;
export const CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER = `${CAPABLE_HISTORY_PREFIX_MARKER}-assistant]`;

/** Retained prefix markers rendered by the native client after the ack. */
export const CAPABLE_HISTORY_PREFIX = {
  userItemId: "item-chj-prefix-user",
  assistantItemId: "item-chj-prefix-assistant",
  userText: `${CAPABLE_HISTORY_PREFIX_USER_MARKER} retained user message committed before the crash`,
  assistantText:
    `${CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER} retained assistant reply committed before the crash; ` +
    "the prefix must survive the acknowledgement, the live append and the reconnect",
} as const;

/** The accepted-but-uncommitted event the SIGKILL is meant to lose. */
export const CAPABLE_HISTORY_LOST_ITEM_ID = "item-chj-lost-accepted";

/** Marker prefix of the structured ACP stand-in's live append. */
export const CAPABLE_HISTORY_LIVE_MARKER = "chj";

/** Final assistant chunk of the fixture's Nth turn (`...-done` suffix, 1-based). */
export function capableHistoryTurnDoneMarker(
  turn: number,
  marker = CAPABLE_HISTORY_LIVE_MARKER,
): string {
  return `[${marker}-t${String(turn)}-done]`;
}

/** Final assistant chunk of the fixture's first turn. */
export function capableHistoryLiveDoneMarker(marker = CAPABLE_HISTORY_LIVE_MARKER): string {
  return capableHistoryTurnDoneMarker(1, marker);
}

export interface CapableHistorySeedParams {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly instanceId: string;
  readonly model: string;
  readonly userItemId: string;
  readonly assistantItemId: string;
  readonly userText: string;
  readonly assistantText: string;
  readonly lostItemId: string;
}

export function defaultCapableHistorySeedParams(
  overrides: Partial<CapableHistorySeedParams> = {},
): CapableHistorySeedParams {
  return {
    projectId: CAPABLE_HISTORY_IDS.projectId,
    projectName: CAPABLE_HISTORY_IDS.projectName,
    projectPath: "/tmp/capable-history-fixture",
    threadId: CAPABLE_HISTORY_IDS.threadId,
    threadTitle: CAPABLE_HISTORY_IDS.threadTitle,
    instanceId: CAPABLE_HISTORY_IDS.instanceId,
    model: "structured-load-model",
    userItemId: CAPABLE_HISTORY_PREFIX.userItemId,
    assistantItemId: CAPABLE_HISTORY_PREFIX.assistantItemId,
    userText: CAPABLE_HISTORY_PREFIX.userText,
    assistantText: CAPABLE_HISTORY_PREFIX.assistantText,
    lostItemId: CAPABLE_HISTORY_LOST_ITEM_ID,
    ...overrides,
  };
}

export function capableHistoryThreadRow(params: CapableHistorySeedParams): Thread {
  const now = "2026-09-21T00:00:00.000Z";
  return {
    id: params.threadId,
    projectId: params.projectId,
    title: params.threadTitle,
    agentKind: acpGenericKind(params.instanceId),
    agentInstanceId: params.instanceId,
    config: { model: params.model },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The canonical production user-message payload: the same
 * `buildPromptContentBlocks` shape the supervisor emits
 * (`emitOptimisticUserMessage` / `startClaudeTurn`), validated against the
 * shared `messageItemPayloadSchema`. The Android client renders user text from
 * `payload.content` blocks, so a `{ text }`-only payload renders an empty
 * card; this helper is the single test-side source of that shape.
 */
export function capableHistoryUserMessagePayload(text: string): MessageItemPayload {
  return messageItemPayloadSchema.parse({ content: buildPromptContentBlocks(text) });
}

/**
 * Test-side mirror of the production text projection for a persisted item:
 * streamed text first, then the canonical message `content` blocks, then the
 * legacy scalar `text` member. Accepts the raw DB columns or already-parsed
 * JSON records; used by the seed verify fork, the post-append checker and
 * focused tests. Never imported by production code.
 */
export function capableHistoryItemText(
  payload: string | Record<string, unknown> | null | undefined,
  streams: string | Record<string, unknown> | null | undefined,
): string | null {
  const streamValues = asJsonRecord(streams) ?? {};
  for (const key of ["assistant_text", "reasoning_text", "user_text", "command_output"]) {
    const value = streamValues[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  const parsed = asJsonRecord(payload);
  if (!parsed) return null;
  if (Array.isArray(parsed["content"])) {
    const blocks = parsed["content"].flatMap((block) => {
      if (block === null || typeof block !== "object") return [];
      const record = block as Record<string, unknown>;
      return record["kind"] === "text" && typeof record["text"] === "string"
        ? [record["text"]]
        : [];
    });
    const joined = blocks.filter((text) => text.length > 0).join("\n");
    if (joined.length > 0) return joined;
  }
  return typeof parsed["text"] === "string" ? parsed["text"] : null;
}

function asJsonRecord(
  value: string | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * One committed user+assistant prefix turn, expressed as the canonical events
 * the host's writer accepts (`dbApplyThreadRuntimeEvents`). The user message
 * carries the production `{ content: [{ kind: "text" }] }` payload on
 * `item.started` only, exactly like the supervisor's optimistic paint; the
 * writer retains that payload through `item.completed`, so the persisted row
 * (and every client's preferred projection) still carries the marker.
 * `content.delta` plus the assistant payload keep both the stream and payload
 * projections carrying the assistant marker.
 */
export function capableHistoryPrefixEvents(params: CapableHistorySeedParams): RuntimeEvent[] {
  return [
    {
      type: "turn.started",
      threadId: params.threadId,
      turnId: "turn-chj-prefix",
    },
    {
      type: "item.started",
      threadId: params.threadId,
      itemId: params.userItemId,
      itemType: "user_message",
      payload: capableHistoryUserMessagePayload(params.userText),
    },
    {
      type: "item.completed",
      threadId: params.threadId,
      itemId: params.userItemId,
    },
    {
      type: "item.started",
      threadId: params.threadId,
      itemId: params.assistantItemId,
      itemType: "assistant_message",
    },
    {
      type: "content.delta",
      threadId: params.threadId,
      itemId: params.assistantItemId,
      stream: "assistant_text",
      delta: params.assistantText,
    },
    {
      type: "item.completed",
      threadId: params.threadId,
      itemId: params.assistantItemId,
      payload: { text: params.assistantText },
    },
    {
      type: "turn.completed",
      threadId: params.threadId,
      turnId: "turn-chj-prefix",
      state: "completed",
    },
  ];
}

/**
 * The event accepted in the same boot immediately before the SIGKILL: it makes
 * the crash lose real accepted work, which is exactly what the surviving touch
 * marks suspect on the next boot.
 */
export function capableHistoryLostEvent(params: CapableHistorySeedParams): RuntimeEvent {
  return {
    type: "item.started",
    threadId: params.threadId,
    itemId: params.lostItemId,
    itemType: "assistant_message",
  };
}

export interface CapableHistoryVerifyResult {
  readonly threadId: string;
  readonly contaminationReason: string | null;
  readonly gapRowAbsent: boolean;
  readonly noticeAbsent: boolean;
  readonly descriptor: {
    readonly token: string;
    readonly source: string;
    readonly reason: string;
    readonly refusedEvents: number;
    readonly refusedBytes: number;
  } | null;
  readonly descriptorError: string | null;
  readonly liveThreadStatus: string | null;
  readonly items: ReadonlyArray<{
    readonly itemId: string;
    readonly position: number;
    readonly type: string;
    readonly state: string;
    readonly text: string | null;
  }>;
}

/** Every requirement the journey depends on, checked on the reopened DB. */
export function checkCapableHistoryVerifyResult(
  result: CapableHistoryVerifyResult,
  params: CapableHistorySeedParams,
): string[] {
  const problems: string[] = [];
  if (result.threadId !== params.threadId) {
    problems.push(`verify reported thread ${result.threadId}, expected ${params.threadId}`);
  }
  if (result.contaminationReason !== "unclean-epoch") {
    problems.push(`contamination is ${String(result.contaminationReason)}, expected unclean-epoch`);
  }
  if (!result.gapRowAbsent) {
    problems.push("an exact gap row exists; the crash was meant to leave touch-only evidence");
  }
  if (!result.noticeAbsent) {
    problems.push("a durable notice already exists before the device acknowledgement");
  }
  if (result.descriptorError !== null) {
    problems.push(`descriptor read failed: ${result.descriptorError}`);
  }
  if (result.descriptor === null) {
    problems.push("no suspect descriptor resolved from the surviving touch");
  } else {
    if (result.descriptor.source !== "suspect") {
      problems.push(`descriptor source is ${result.descriptor.source}, expected suspect`);
    }
    if (result.descriptor.reason !== "unclean-epoch") {
      problems.push(`descriptor reason is ${result.descriptor.reason}, expected unclean-epoch`);
    }
  }
  for (const item of result.items) {
    if (item.itemId === params.userItemId && item.text !== params.userText) {
      problems.push(`prefix user item text is ${JSON.stringify(item.text)}`);
    }
    if (item.itemId === params.assistantItemId && item.text !== params.assistantText) {
      problems.push(`prefix assistant item text is ${JSON.stringify(item.text)}`);
    }
    if (item.itemId === params.lostItemId) {
      problems.push("the accepted-but-lost event was committed before the SIGKILL");
    }
  }
  const itemIds = result.items.map((item) => item.itemId);
  for (const required of [params.userItemId, params.assistantItemId]) {
    if (!itemIds.includes(required)) problems.push(`prefix item ${required} is absent`);
  }
  return problems;
}
