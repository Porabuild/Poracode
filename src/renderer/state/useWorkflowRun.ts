import { useEffect } from "react";
import type { ProjectLocation, WorkflowRun } from "@/shared/contracts";
import { useWorkflowRunStore } from "./workflowRunStore";

export interface UseWorkflowRunResult {
  run: WorkflowRun | null;
  loading: boolean;
  error: string | null;
}

/**
 * Subscribe to the shared workflow manifest poller for `itemId`. Returns the
 * latest snapshot (cached across mounts) and ref-counts the subscription —
 * multiple components watching the same workflow trigger a single poll loop.
 *
 * Pass `null` for any input to opt out (no subscription, no fetch).
 */
export function useWorkflowRun(
  itemId: string | null,
  manifestPath: string | null,
  location: ProjectLocation | null,
  transcriptDir: string | null = null,
  includeAgentChats = false,
): UseWorkflowRunResult {
  const subscribe = useWorkflowRunStore((s) => s.subscribe);
  const entry = useWorkflowRunStore((s) => (itemId ? s.byItemId[itemId] : undefined));

  useEffect(() => {
    if (!itemId || !manifestPath || !location) return;
    const unsubscribe = subscribe(
      itemId,
      manifestPath,
      location,
      transcriptDir ?? undefined,
      includeAgentChats,
    );
    return unsubscribe;
  }, [itemId, manifestPath, location, transcriptDir, includeAgentChats, subscribe]);

  return {
    run: entry?.run ?? null,
    loading: entry?.loading ?? !!(itemId && manifestPath && location),
    error: entry?.error ?? null,
  };
}
