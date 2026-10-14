import type { Thread } from "@/shared/contracts";
import { peekPendingManagedRootLaunch } from "./rootCatalogStore";

/**
 * A saved draft has no host runtime yet; its pending launch owns local progress
 * and errors. Creation can publish inactive metadata before its response, so
 * catalog and history reads must preserve the same local launch state.
 */
export function carryPendingRootLaunchRuntime(existing: Thread, incoming: Thread): Thread {
  if (
    !peekPendingManagedRootLaunch(existing.id) ||
    incoming.status !== "inactive" ||
    incoming.archived ||
    incoming.sessionRef ||
    incoming.canResumeWithConfig
  ) {
    return incoming;
  }
  return {
    ...incoming,
    status: existing.status,
    attention: existing.attention,
    ...(existing.errorMessage ? { errorMessage: existing.errorMessage } : {}),
    ...(existing.activeTurnStartedAt ? { activeTurnStartedAt: existing.activeTurnStartedAt } : {}),
  };
}
