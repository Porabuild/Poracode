import type { CanonicalItemType, ToolCallProgress } from "@/shared/contracts";

export interface CursorSdkTextItem {
  itemId: string;
  text: string;
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
  summaryItem?: CursorSdkTextItem;
  taskItem?: CursorSdkTextItem;
  nestedAssistantItems: Map<string, CursorSdkTextItem>;
  nestedThinkingItems: Map<string, CursorSdkTextItem>;
  toolItems: Map<string, CursorSdkToolItem>;
  completedToolKeys: Set<string>;
  /** Raw onDelta chunks awaiting their identical normalized stream echo. */
  pendingRawAssistantDeltas: string[];
  pendingRawThinkingDeltas: string[];
  pendingRawThinkingCompletions: number[];
  pendingRawTaskTexts: string[];
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
    terminalRunIds: new Set(),
    emittedErrors: new Set(),
    usageSequence: 0,
    pendingRawUsageFingerprints: [],
    pendingNormalizedUsageFingerprints: [],
  };
}
