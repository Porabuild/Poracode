import { filterEventForItemInterests, recordRuntimeEventTypes } from "./interestFilter.ts";
import type { WireLab } from "./wireLab.ts";

export interface WirePublishOptions {
  readonly socketId?: string;
  readonly sessionId?: string;
  readonly skipStore?: boolean;
  readonly sequenceGap?: number;
}

export function publishWireEvent(
  lab: WireLab,
  event: Record<string, unknown>,
  options?: WirePublishOptions,
): number {
  const type = String(event.type ?? "");
  if (type) lab.ledger.observeReplayableEvent(type, { frameType: type, source: "mock" });
  recordRuntimeEventTypes(event, (runtimeType) => {
    lab.ledger.observeRuntimeEvent(runtimeType, { frameType: runtimeType, source: "mock" });
    lab.observationLedger.recordOperation(`runtime:${runtimeType}`);
  });
  const skipStore = lab.faults.has("sequence-gap");
  if (skipStore) lab.faults.clear("sequence-gap");
  const seq = lab.ring.publish(event, {
    ...(skipStore || options?.skipStore ? { skipStore: true } : {}),
    ...(options?.sequenceGap ? { sequenceGap: options.sequenceGap } : {}),
  });
  if (lab.faults.has("sequence-regression")) {
    lab.ring.regressTo(Math.max(0, seq - 2));
    lab.faults.clear("sequence-regression");
  }
  const duplicate = lab.faults.has("duplicate-event-delivery");
  if (duplicate) lab.faults.clear("duplicate-event-delivery");
  let connections = [...lab.connectionSet];
  if (options?.socketId) {
    lab.assertSocket(options.socketId, options.sessionId);
    connections = [
      [...lab.connectionSet].find((connection) => connection.socketId === options.socketId)!,
    ];
  }
  for (const connection of connections) {
    const itemScoped = filterEventForItemInterests(event, connection.interests);
    const scoped = filterGitStateForInterests(itemScoped, connection.gitStateInterests);
    const frame = { type: "event", seq, event: scoped };
    lab.sendMessage(connection.ws, frame);
    if (duplicate) lab.sendMessage(connection.ws, frame);
  }
  return seq;
}

function filterGitStateForInterests(
  event: Record<string, unknown>,
  interests: readonly Record<string, unknown>[],
): Record<string, unknown> {
  if (event.type !== "remote-git-state" || interests.length > 0) return event;
  const patch = event.patch as Record<string, unknown>;
  return { type: "remote-git-state", patch: { revision: patch.revision } };
}
