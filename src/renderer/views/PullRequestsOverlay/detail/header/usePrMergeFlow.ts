import { useState } from "react";
import type { PrMergeMethod } from "@/shared/contracts";
import { usePrMergeReadiness } from "@/renderer/hooks/usePrMergeReadiness";
import { usePrDetailScope } from "../prDetailScope";

export const MERGE_METHODS = ["squash", "merge", "rebase"] as const;

/**
 * Merge state shared by the desktop split button and the compact bottom-bar
 * action: which method is being confirmed, the admin bypass switch, and whether
 * merging is allowed right now. The confirmation belongs to the head the reviewer
 * saw: if the head moves while it is open, it closes instead of merging something
 * they did not look at.
 */
export function usePrMergeFlow() {
  const scope = usePrDetailScope();
  const { actions } = scope;
  const readiness = usePrMergeReadiness(scope.prKey, scope.cacheKey);
  const [pending, setPending] = useState<{
    method: PrMergeMethod;
    head: string | undefined;
  } | null>(null);
  const [bypass, setBypass] = useState(false);
  const method = pending !== null && pending.head === scope.headSha ? pending.method : null;
  const { mergeMethods, preferredMethod, isBlocked } = readiness;
  const busy = actions.prLoading || scope.readOnly;
  const disabled = busy || mergeMethods.length === 0 || (isBlocked && !bypass);
  // The bypass switch lives inside the confirmation, so a blocked-but-bypassable
  // merge must still let the user open it.
  const triggerDisabled = busy || mergeMethods.length === 0 || (isBlocked && !readiness.canBypass);
  const selected = method ?? preferredMethod;

  function dismiss() {
    setPending(null);
    setBypass(false);
  }
  return {
    readiness,
    /** The method awaiting confirmation; `null` while no confirmation is open. */
    method,
    selected,
    bypass,
    setBypass,
    disabled,
    triggerDisabled,
    merging: actions.pendingAction === "merge",
    ask: (next: PrMergeMethod) => setPending({ method: next, head: scope.headSha }),
    dismiss,
    confirm: () => {
      const admin = bypass;
      dismiss();
      void actions.handleMergePr(selected, admin);
    },
  };
}

export type PrMergeFlow = ReturnType<typeof usePrMergeFlow>;
