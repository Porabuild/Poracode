import type { CanonicalItemType, ToolCallProgress } from "@/shared/contracts";

export interface CursorSdkTextItem {
  itemId: string;
  text: string;
}

/**
 * The shared context-compaction row (selected by the `ContextCompaction` tool
 * name in the renderer). `text` keeps the latest summary so a completed row
 * can carry it as `result`.
 */
export interface CursorSdkCompactionItem {
  itemId: string;
  trigger: "manual" | "auto";
  text: string;
  warnedFailed: boolean;
  warnedFallback: boolean;
}

export interface CursorSdkToolItem {
  key: string;
  callId: string;
  itemId: string;
  itemType: CanonicalItemType;
  name: string;
  classificationName: string;
  args: unknown;
  status: "running" | "success" | "error";
  result?: unknown;
  /**
   * Cursor's per-message `truncated.result` marker: that message's streamed
   * `result` was cut down for transport, so its bytes are a partial value
   * rather than the real one. Assigned from every update, never latched, so
   * the message that settles the call decides whether the final result paints.
   */
  resultTruncated?: boolean;
  progress?: ToolCallProgress;
  lastPayloadFingerprint?: string;
  outputText: string;
}

export interface CursorSdkMapperState {
  threadId: string;
  currentTurnId?: string;
  currentRunId?: string;
  agentId?: string;
  model?: string;
  sessionStarted: boolean;
  optimisticUserItemId?: string;
  userEchoSeen: boolean;
  assistantOutputSeen: boolean;
  assistantItem?: CursorSdkTextItem;
  thinkingItem?: CursorSdkTextItem;
  compactionItem?: CursorSdkCompactionItem;
  taskItem?: CursorSdkTextItem;
  /** "summarize" turns paint compaction rows manually and their run result. */
  turnKind: "message" | "summarize";
  nestedAssistantItems: Map<string, CursorSdkTextItem>;
  nestedThinkingItems: Map<string, CursorSdkTextItem>;
  toolItems: Map<string, CursorSdkToolItem>;
  completedToolKeys: Set<string>;
  /** Raw onDelta chunks awaiting their identical normalized stream echo. */
  pendingRawAssistantDeltas: string[];
  pendingRawThinkingDeltas: string[];
  pendingRawThinkingCompletions: number[];
  pendingRawTaskTexts: string[];
  /**
   * Summary lifecycle statuses seen on `onDelta`, awaiting their identical
   * 1.2.0 normalized `summary` message echo (FIFO, same reconciliation model
   * as the text queues).
   */
  pendingRawSummaryStatuses: Array<"running" | "completed" | "error">;
  terminalRunIds: Set<string>;
  emittedErrors: Set<string>;
  usageSequence: number;
  pendingRawUsageFingerprints: string[];
  pendingNormalizedUsageFingerprints: string[];
}

export function createCursorSdkMapperState(threadId: string): CursorSdkMapperState {
  return {
    threadId,
    sessionStarted: false,
    turnKind: "message",
    userEchoSeen: false,
    assistantOutputSeen: false,
    nestedAssistantItems: new Map(),
    nestedThinkingItems: new Map(),
    toolItems: new Map(),
    completedToolKeys: new Set(),
    pendingRawAssistantDeltas: [],
    pendingRawThinkingDeltas: [],
    pendingRawThinkingCompletions: [],
    pendingRawTaskTexts: [],
    pendingRawSummaryStatuses: [],
    terminalRunIds: new Set(),
    emittedErrors: new Set(),
    usageSequence: 0,
    pendingRawUsageFingerprints: [],
    pendingNormalizedUsageFingerprints: [],
  };
}
