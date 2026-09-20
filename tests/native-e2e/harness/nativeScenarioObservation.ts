import type { WireLab } from "./wireLab.ts";
import { sortCodePoints } from "./sort.ts";

export function observedOperationIdsForLab(lab: WireLab): string[] {
  const snapshot = lab.ledger.snapshot();
  const observed = new Set<string>();
  for (const id of snapshot.observed.httpRouteIds) observed.add(`route:${id}`);
  for (const id of snapshot.observed.procedureNames) observed.add(`procedure:${id}`);
  for (const id of snapshot.observed.webSocketClientTypes) observed.add(`ws-client:${id}`);
  for (const id of snapshot.observed.webSocketServerTypes) observed.add(`ws-server:${id}`);
  for (const id of snapshot.observed.replayableEventTypes) observed.add(`replay:${id}`);
  for (const id of snapshot.observed.runtimeEventTypes) observed.add(`runtime:${id}`);
  return sortCodePoints(observed);
}

export function unionObservedOperationIds(
  hosts: readonly { readonly observedOperationIds: readonly string[] }[],
): string[] {
  const observed = new Set<string>();
  for (const host of hosts) {
    for (const operationId of host.observedOperationIds) observed.add(operationId);
  }
  return sortCodePoints(observed);
}
