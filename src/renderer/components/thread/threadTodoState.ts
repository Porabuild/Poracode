import type { PlanItemPayload } from "@/shared/contracts";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import {
  getRuntimeItemPayload,
  type RuntimeChatItem,
} from "@/renderer/state/slices/runtimeEventSlice";

export type ThreadTodoStepStatus = PlanItemPayload["steps"][number]["status"];

export interface ThreadTodoStep {
  text: string;
  status: ThreadTodoStepStatus;
}

export interface ThreadTodoDockState {
  sourceItemId: string;
  itemState: RuntimeChatItem["state"];
  steps: readonly ThreadTodoStep[];
  activeIndex: number;
  sourceKind: "steps" | "plan_text";
}

const BULLET_TASK_RE = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[(?<marker>[ xX~>])\]\s+)?(?<text>.+?)\s*$/;
const CHECKBOX_TASK_RE = /^\s*\[(?<marker>[ xX~>])\]\s+(?<text>.+?)\s*$/;

interface ThreadPlanCandidate {
  item: RuntimeChatItem;
  dockState: ThreadTodoDockState;
}

const todoDockStateCache = new Map<
  string,
  {
    itemIds: readonly string[] | undefined;
    latestPlanItem: RuntimeChatItem | undefined;
    result: ThreadTodoDockState | null;
  }
>();

export function selectThreadTodoDockState(
  state: AppStoreState,
  threadId: string,
): ThreadTodoDockState | null {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  const itemsById = state.runtimeItemsByIdByThread[threadId];
  const latestPlanItem = selectLatestThreadPlanItem(itemIds, itemsById);
  const cached = todoDockStateCache.get(threadId);
  if (cached && cached.itemIds === itemIds && cached.latestPlanItem === latestPlanItem) {
    return cached.result;
  }
  const result = getThreadTodoDockStateFromThreadItems(itemIds, itemsById);
  if (todoDockStateCache.size > 200) todoDockStateCache.clear();
  todoDockStateCache.set(threadId, { itemIds, latestPlanItem, result });
  return result;
}

export function selectThreadTodoDockItem(
  state: AppStoreState,
  threadId: string,
): RuntimeChatItem | null {
  // Reuse the dock-state cache so streaming deltas (which do not change plans)
  // do not rescan every runtime item on each Zustand subscriber pass.
  const dockState = selectThreadTodoDockState(state, threadId);
  if (!dockState) return null;
  return state.runtimeItemsByIdByThread[threadId]?.[dockState.sourceItemId] ?? null;
}

export function getThreadTodoDockStateFromThreadItems(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): ThreadTodoDockState | null {
  return selectLatestThreadTodoDockCandidate(itemIds, itemsById)?.dockState ?? null;
}

function selectLatestThreadTodoDockCandidate(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): ThreadPlanCandidate | null {
  if (!itemIds?.length) return null;
  const planCandidates = collectThreadPlanCandidates(itemIds, itemsById);
  const derivedStateCache = new Map<number, ThreadTodoDockState>();
  // Walk newest → oldest, find the most recent plan with parsable steps.
  // Keep it docked until every step is completed (or a newer plan replaces it).
  // Follow-up user messages do not retire the dock — the plan persists across turns.
  for (let index = planCandidates.length - 1; index >= 0; index -= 1) {
    const item = planCandidates[index]!;
    const dockState = deriveThreadTodoDockState(planCandidates, index, derivedStateCache);
    const allCompleted = dockState.steps.every((step) => step.status === "completed");
    return allCompleted ? null : { item: item.item, dockState };
  }
  return null;
}

function selectLatestThreadPlanItem(
  itemIds: readonly string[] | undefined,
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): RuntimeChatItem | undefined {
  if (!itemIds?.length) return undefined;
  for (let index = itemIds.length - 1; index >= 0; index -= 1) {
    const item = itemsById?.[itemIds[index]!];
    if (item?.type === "plan") return item;
  }
  return undefined;
}

export function getThreadTodoDockStateForItem(item: RuntimeChatItem): ThreadTodoDockState | null {
  if (item.type !== "plan") return null;
  const payload = getRuntimeItemPayload<PlanItemPayload>(item, "plan");
  const stepsFromPayload = normalizePayloadSteps(payload?.steps ?? []);
  if (stepsFromPayload.length > 0) {
    return {
      sourceItemId: item.id,
      itemState: item.state,
      steps: stepsFromPayload,
      activeIndex: resolveActiveIndex(stepsFromPayload),
      sourceKind: "steps",
    };
  }

  const stepsFromText = parsePlanTextSteps(item.streams.plan_text ?? "");
  if (stepsFromText.length === 0) return null;
  return {
    sourceItemId: item.id,
    itemState: item.state,
    steps: stepsFromText,
    activeIndex: resolveActiveIndex(stepsFromText),
    sourceKind: "plan_text",
  };
}

export function parsePlanTextSteps(text: string): ThreadTodoStep[] {
  if (text.trim().length === 0) return [];
  const steps: ThreadTodoStep[] = [];
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const match = BULLET_TASK_RE.exec(line) ?? CHECKBOX_TASK_RE.exec(line);
    if (!match?.groups?.text) continue;
    const taskText = normalizeTaskText(match.groups.text);
    if (taskText.length === 0) continue;
    steps.push({
      text: taskText,
      status: statusFromMarker(match.groups.marker),
    });
  }
  return steps;
}

function collectThreadPlanCandidates(
  itemIds: readonly string[],
  itemsById: AppStoreState["runtimeItemsByIdByThread"][string] | undefined,
): ThreadPlanCandidate[] {
  const planCandidates: ThreadPlanCandidate[] = [];
  for (const itemId of itemIds) {
    const item = itemsById?.[itemId];
    if (!item || item.type !== "plan") continue;
    const dockState = getThreadTodoDockStateForItem(item);
    if (!dockState) continue;
    planCandidates.push({ item, dockState });
  }
  return planCandidates;
}

function deriveThreadTodoDockState(
  candidates: readonly ThreadPlanCandidate[],
  index: number,
  cache: Map<number, ThreadTodoDockState>,
): ThreadTodoDockState {
  const cached = cache.get(index);
  if (cached) return cached;

  const current = candidates[index]!.dockState;
  if (index === 0) {
    cache.set(index, current);
    return current;
  }

  const previous = deriveThreadTodoDockState(candidates, index - 1, cache);
  if (!arePlansCompatible(previous.steps, current.steps)) {
    cache.set(index, current);
    return current;
  }

  const mergedSteps = carryForwardCompletedSteps(previous.steps, current.steps);
  const nextState =
    mergedSteps === current.steps
      ? current
      : {
          ...current,
          steps: mergedSteps,
          activeIndex: resolveActiveIndex(mergedSteps),
        };
  cache.set(index, nextState);
  return nextState;
}

function arePlansCompatible(
  previousSteps: readonly ThreadTodoStep[],
  nextSteps: readonly ThreadTodoStep[],
): boolean {
  if (previousSteps.length === 0 || nextSteps.length === 0) return false;
  const previousTexts = previousSteps.map((step) => step.text);
  const nextTexts = nextSteps.map((step) => step.text);
  const sharedSequenceLength = longestCommonStepSequenceLength(previousTexts, nextTexts);
  if (sharedSequenceLength === 0) return false;
  if (previousTexts.length === 1 || nextTexts.length === 1) {
    return previousTexts[0] === nextTexts[0] && sharedSequenceLength === 1;
  }
  return sharedSequenceLength >= 2;
}

function longestCommonStepSequenceLength(
  previousTexts: readonly string[],
  nextTexts: readonly string[],
): number {
  const lengths = Array.from({ length: nextTexts.length + 1 }, () =>
    Array<number>(previousTexts.length + 1).fill(0),
  );
  for (let nextIndex = 0; nextIndex < nextTexts.length; nextIndex += 1) {
    for (let previousIndex = 0; previousIndex < previousTexts.length; previousIndex += 1) {
      lengths[nextIndex + 1]![previousIndex + 1] =
        nextTexts[nextIndex] === previousTexts[previousIndex]
          ? lengths[nextIndex]![previousIndex]! + 1
          : Math.max(
              lengths[nextIndex + 1]![previousIndex]!,
              lengths[nextIndex]![previousIndex + 1]!,
            );
    }
  }
  return lengths[nextTexts.length]![previousTexts.length]!;
}

function carryForwardCompletedSteps(
  previousSteps: readonly ThreadTodoStep[],
  nextSteps: readonly ThreadTodoStep[],
): ReadonlyArray<ThreadTodoStep> {
  const completedCounts = new Map<string, number>();
  for (const step of previousSteps) {
    if (step.status !== "completed") continue;
    completedCounts.set(step.text, (completedCounts.get(step.text) ?? 0) + 1);
  }
  if (completedCounts.size === 0) return nextSteps;

  const seenCounts = new Map<string, number>();
  let changed = false;
  const mergedSteps = nextSteps.map((step) => {
    const occurrence = (seenCounts.get(step.text) ?? 0) + 1;
    seenCounts.set(step.text, occurrence);
    if (step.status === "completed") return step;
    if ((completedCounts.get(step.text) ?? 0) < occurrence) return step;
    changed = true;
    return { ...step, status: "completed" as const };
  });
  return changed ? mergedSteps : nextSteps;
}

function normalizePayloadSteps(
  steps: readonly PlanItemPayload["steps"][number][],
): ReadonlyArray<ThreadTodoStep> {
  return steps
    .map((step) => ({
      text: normalizeTaskText(step.step),
      status: step.status,
    }))
    .filter((step) => step.text.length > 0);
}

function normalizeTaskText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function statusFromMarker(marker: string | undefined): ThreadTodoStepStatus {
  if (!marker || marker === " ") return "pending";
  if (marker.toLowerCase() === "x") return "completed";
  return "in_progress";
}

function resolveActiveIndex(steps: readonly ThreadTodoStep[]): number {
  const runningIndex = steps.findIndex((step) => step.status === "in_progress");
  if (runningIndex >= 0) return runningIndex;
  const pendingIndex = steps.findIndex((step) => step.status === "pending");
  if (pendingIndex >= 0) return pendingIndex;
  return Math.max(steps.length - 1, 0);
}

export function areThreadTodoStepsEqual(
  a: ThreadTodoDockState | null,
  b: ThreadTodoDockState | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.sourceItemId !== b.sourceItemId) return false;
  if (a.activeIndex !== b.activeIndex) return false;
  if (a.steps.length !== b.steps.length) return false;
  return a.steps.every((step, i) => {
    const other = b.steps[i];
    return other && step.text === other.text && step.status === other.status;
  });
}
