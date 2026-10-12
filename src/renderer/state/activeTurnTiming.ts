import { isThreadTurnActive, type Thread } from "@/shared/contracts";

/** Keep the local admission time when a host row confirms the same live turn. */
export function carryActiveTurnTiming(resident: Thread, incoming: Thread): Thread {
  const residentStart = Date.parse(resident.activeTurnStartedAt ?? "");
  const incomingStart = Date.parse(incoming.activeTurnStartedAt ?? "");
  if (
    !isThreadTurnActive(resident.status) ||
    !isThreadTurnActive(incoming.status) ||
    resident.agentKind !== incoming.agentKind ||
    resident.presentationMode !== incoming.presentationMode ||
    resident.lastTurnStartedAt !== incoming.lastTurnStartedAt ||
    resident.lastTurnEndedAt !== incoming.lastTurnEndedAt ||
    (resident.sessionRef !== undefined &&
      (resident.sessionRef.providerSessionId !== incoming.sessionRef?.providerSessionId ||
        resident.sessionRef.executionIdentity !== incoming.sessionRef?.executionIdentity)) ||
    resident.activeTurnStartedAt === undefined ||
    incoming.activeTurnStartedAt === undefined ||
    !Number.isFinite(residentStart) ||
    !Number.isFinite(incomingStart) ||
    residentStart >= incomingStart
  )
    return incoming;
  return { ...incoming, activeTurnStartedAt: resident.activeTurnStartedAt };
}
