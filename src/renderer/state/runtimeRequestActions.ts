import type { RequestOutcome } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import type { OpenRuntimeRequest } from "@/renderer/state/slices/runtimeEventSlice";

/**
 * Optimistically mark a runtime request resolved in the store and return a
 * rollback that re-opens it. The composer's auto-deny and the request panel
 * both resolve through this so the paired `request.resolved` / `request.opened`
 * event shapes live in one place and can't drift apart on a failed resolve.
 */
export function applyOptimisticRequestResolution(
  threadId: string,
  request: OpenRuntimeRequest,
  outcome: RequestOutcome,
): () => void {
  useAppStore.getState().applyRuntimeEvent(threadId, {
    type: "request.resolved",
    threadId,
    requestId: request.requestId,
    outcome,
  });
  return () => {
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "request.opened",
      threadId,
      requestId: request.requestId,
      requestType: request.requestType,
      payload: request.payload,
    });
  };
}
