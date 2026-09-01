import type { PromptSegment, RuntimeEvent } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  goalPayloadFromProviderState,
  parseGoalSlashCommand,
  startGoalItemEvents,
  updateGoalItemEvents,
} from "../../goalRuntime";
import type { ClaudeMapperState } from "../sdkCanonicalMappingState";
import { clearActiveGoal, resetActiveGoalTokenAccounting } from "./goal";
import { newItemId } from "./helpers";
import { isLiveSubAgentScopedTool } from "./toolItems";

export function startClaudeTurn(
  state: ClaudeMapperState,
  turnId: string,
  prompt: string,
  segments: PromptSegment[] | undefined,
  userMessageItemId?: string,
): RuntimeEvent[] {
  state.currentTurnId = turnId;
  state.assistantTextItems.clear();
  state.reasoningItems.clear();
  state.toolItemsByIndex.clear();
  // Background subagents keep running across user turns: their live parent
  // tool_call (and forwarded children) must survive this reset so the later
  // `task_notification` can still find and close them — a blanket clear would
  // strand the parent pill on "running" forever. `toolItemsByIndex` is
  // per-message scratch (cleared on every message_start), so clearing it fully
  // is safe.
  for (const [id, tool] of [...state.toolItemsById]) {
    if (isLiveSubAgentScopedTool(state, tool)) continue;
    state.toolItemsById.delete(id);
  }
  delete state.currentAssistantMessageId;
  delete state.currentCompactionItemId;
  // A new turn means the goal's work continues — a legacy complete-on-drain
  // scheduled by the previous turn end no longer applies.
  delete state.pendingGoalCompletionOnTaskDrain;
  state.streamedAssistantMessageIds.clear();

  const userItemId = userMessageItemId ?? newItemId("user");
  const events: RuntimeEvent[] = [
    { type: "turn.started", threadId: state.threadId, turnId },
    {
      type: "item.started",
      threadId: state.threadId,
      itemId: userItemId,
      itemType: "user_message",
      payload: { content: buildPromptContentBlocks(prompt, segments) },
    },
    { type: "item.completed", threadId: state.threadId, itemId: userItemId },
  ];
  // Bare `/goal` parses to the "viewed" action: a status query. The CLI prints
  // the status and any active goal STAYS active (docs: /goal with no argument
  // "shows current status"), so it must not touch the dock or tracking — an
  // objective-less goal item would only blank the dock (goal items render
  // nowhere else).
  const goalPayload = parseGoalSlashCommand(prompt);
  if (goalPayload && goalPayload.action !== "viewed") {
    const goalItemId = `goal-${turnId}`;
    events.push(...startGoalItemEvents(state.threadId, goalItemId, goalPayload));
    if (goalPayload.action === "set" && goalPayload.objective) {
      state.activeGoalItemId = goalItemId;
      state.activeGoalObjective = goalPayload.objective;
      state.activeGoalStartedAtMs = Date.now();
      delete state.activeGoalIterations;
      delete state.activeGoalLastReason;
      resetActiveGoalTokenAccounting(state);
    } else {
      clearActiveGoal(state);
    }
  } else if (!goalPayload && isClearPrompt(prompt) && state.activeGoalItemId) {
    const payload = goalPayloadFromProviderState(
      state.activeGoalObjective ? { objective: state.activeGoalObjective } : {},
      "cleared",
    );
    events.push(...updateGoalItemEvents(state.threadId, state.activeGoalItemId, payload));
    clearActiveGoal(state);
  }
  if (isManualCompactPrompt(prompt)) {
    const compactItemId = `compact-${turnId}`;
    state.currentCompactionItemId = compactItemId;
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: compactItemId,
      itemType: "tool_call",
      payload: {
        name: "ContextCompaction",
        status: "running",
        args: { trigger: "manual" },
      },
    });
  }
  return events;
}

function isManualCompactPrompt(prompt: string): boolean {
  return /^\/compact(?:\s|$)/.test(prompt.trimStart());
}

function isClearPrompt(prompt: string): boolean {
  return /^\/clear(?:\s|$)/.test(prompt.trimStart());
}
