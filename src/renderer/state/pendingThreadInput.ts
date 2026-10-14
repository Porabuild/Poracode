import type { RuntimeEvent, Thread } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { reuseRemoteRows } from "./remoteServers/rowReuse";
import { carryPendingRootLaunchRuntime } from "./managedRootCatalog/rootLaunchRuntime";

// Admission is renderer-local and never persisted or sent over the wire. Old
// host rows remain valid; they simply cannot settle a prompt still being sent.
interface PendingInput {
  userMessageItemId?: string;
  canonicalMessageSeen?: boolean;
}
const pendingInputs = new Map<string, Set<PendingInput>>();

export function retainPendingThreadInput(threadId: string): () => void {
  const token: PendingInput = {};
  const inputs = pendingInputs.get(threadId) ?? new Set<PendingInput>();
  inputs.add(token);
  pendingInputs.set(threadId, inputs);
  return () => {
    if (pendingInputs.get(threadId) !== inputs) return;
    inputs.delete(token);
    if (inputs.size === 0) pendingInputs.delete(threadId);
  };
}

export function notePendingThreadInputMessage(threadId: string, userMessageItemId: string): void {
  for (const input of pendingInputs.get(threadId) ?? []) {
    input.userMessageItemId ??= userMessageItemId;
  }
}

/** Host frames, including replay, can prove receipt of this exact input. */
export function notePendingThreadInputCanonicalEvents(
  threadId: string,
  events: readonly RuntimeEvent[],
): void {
  const inputs = pendingInputs.get(threadId);
  if (!inputs) return;
  for (const event of events) {
    if (event.type !== "item.started" || event.itemType !== "user_message") continue;
    for (const input of inputs) {
      if (input.userMessageItemId === event.itemId) input.canonicalMessageSeen = true;
    }
  }
}

/** Live admission/completion takes over from the optimistic working state. */
export function confirmPendingThreadInput(threadId: string): void {
  pendingInputs.delete(threadId);
}

/** Keep a submit working across pre-admission catalog/history refreshes. */
export function carryPendingThreadInput(
  resident: Thread | undefined,
  incoming: Thread,
  history?: Pick<RemoteThreadSnapshot, "runtimeItems" | "completedTurns" | "runtimeStateCurrent">,
): Thread {
  if (
    !resident ||
    resident.id !== incoming.id ||
    resident.agentKind !== incoming.agentKind ||
    resident.presentationMode !== incoming.presentationMode ||
    resident.remoteServerId !== incoming.remoteServerId
  ) {
    return incoming;
  }
  if (resident.presentationMode !== "gui") return incoming;
  if (!pendingInputs.has(resident.id) || resident.status !== "working") {
    const prepared = history?.runtimeStateCurrent
      ? incoming
      : carryPendingRootLaunchRuntime(resident, incoming);
    return prepared === incoming ? incoming : reuseRemoteRows([resident], [prepared])[0]!;
  }
  if (history && (history.runtimeStateCurrent || history.completedTurns.length > 0)) {
    const positions = new Map(history.runtimeItems.map((item, index) => [item.id, index]));
    const inputs = pendingInputs.get(resident.id)!;
    for (const input of inputs) {
      const position = input.userMessageItemId ? positions.get(input.userMessageItemId) : undefined;
      const confirmedRuntime =
        history.runtimeStateCurrent && (position !== undefined || input.canonicalMessageSeen);
      if (position === undefined && !confirmedRuntime) continue;
      // This exact prompt plus a live runtime level proves host admission.
      // Legacy snapshots instead need a completed anchor after the prompt.
      // Neither proof compares host and renderer clocks.
      if (
        confirmedRuntime ||
        history.completedTurns.some(
          (turn) =>
            position !== undefined &&
            turn.anchorItemId !== null &&
            (positions.get(turn.anchorItemId) ?? -1) >= position,
        )
      )
        inputs.delete(input);
    }
    if (inputs.size === 0) {
      pendingInputs.delete(resident.id);
      return incoming;
    }
  }
  if (
    incoming.status === "working" ||
    incoming.status === "needs_approval" ||
    incoming.status === "needs_reply" ||
    incoming.status === "error" ||
    incoming.archived
  ) {
    confirmPendingThreadInput(resident.id);
    return incoming;
  }
  if (
    incoming.status !== "idle" &&
    incoming.status !== "finished" &&
    incoming.status !== "inactive" &&
    incoming.status !== "launching"
  ) {
    return incoming;
  }
  const carried: Thread = {
    ...incoming,
    status: resident.status,
    attention: resident.attention,
    activeTurnStartedAt: resident.activeTurnStartedAt,
    lastTurnStartedAt: resident.lastTurnStartedAt,
    lastTurnEndedAt: resident.lastTurnEndedAt,
  };
  return reuseRemoteRows([resident], [carried])[0]!;
}
