import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "@heroui/react";
import type { PrReaction } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useGitStore } from "@/renderer/state/gitStore";
import { scopedReviewClient } from "@/renderer/utils/forgeReviews";
import { usePrDetailScope } from "../detail/prDetailScope";
import type { PrReactionsView } from "../parts/PrReactions";
import {
  rollbackReaction,
  subjectReactionsOf,
  withReaction,
  withSubjectReactions,
} from "./reactionModel";

const NONE: ReadonlySet<string> = new Set();

/** A toggle the viewer asked for whose result must survive a reload that finishes meanwhile. */
interface Hold {
  reacted: boolean;
  /** The host accepted it; kept only until the load in flight at that moment ends. */
  settled: boolean;
}

/**
 * Reactions on one subject of the review: a comment when `subjectId` is given,
 * otherwise the description. Returns what the chips row and the header's add
 * button need. A toggle is applied to the store first and put back
 * if the host refuses. A reload that was already running when the toggle began can
 * finish with the host's older copy, so the toggled state is written again until
 * the toggle has settled and no load is left in flight. A chip with a toggle in
 * flight is disabled.
 */
export function useSubjectReactions(props: {
  subjectId?: string;
  reactions: readonly PrReaction[] | undefined;
}): PrReactionsView {
  const { subjectId, reactions } = props;
  const scope = usePrDetailScope();
  const supported = scope.scoped?.capabilities.reactions;
  const { scoped, cacheKey } = scope;
  const [pending, setPending] = useState<ReadonlySet<string>>(NONE);
  const holds = useRef(new Map<string, Hold>());
  const loading = useRef(scope.loading);
  useEffect(() => {
    loading.current = scope.loading;
  }, [scope.loading]);

  function stored() {
    const details = useGitStore.getState().prDetails[cacheKey];
    return details ? subjectReactionsOf(details, subjectId) : undefined;
  }

  function change(next: (list: readonly PrReaction[] | undefined) => PrReaction[]) {
    const current = useGitStore.getState().prDetails[cacheKey];
    if (!current) return;
    useGitStore.getState().setPrDetails(cacheKey, withSubjectReactions(current, subjectId, next));
  }

  function reapplyHolds() {
    for (const [content, hold] of holds.current) {
      const reacted = stored()?.some((r) => r.content === content && r.viewerReacted) ?? false;
      if (reacted !== hold.reacted) change((list) => withReaction(list, content, hold.reacted));
    }
  }

  const reapplyOnStoreChange = useEffectEvent(reapplyHolds);
  useEffect(
    () =>
      useGitStore.subscribe((state, previous) => {
        if (state.prDetails[cacheKey] !== previous.prDetails[cacheKey]) reapplyOnStoreChange();
      }),
    [cacheKey],
  );
  useEffect(() => {
    if (scope.loading) return;
    for (const [content, hold] of holds.current) if (hold.settled) holds.current.delete(content);
  }, [scope.loading]);

  function setContentPending(content: string, isPending: boolean) {
    setPending((previous) => {
      if (previous.has(content) === isPending) return previous;
      const next = new Set(previous);
      if (isPending) next.add(content);
      else next.delete(content);
      return next;
    });
  }

  async function toggle(content: string, reacted: boolean) {
    if (scope.readOnly || !scoped || !supported?.includes(content) || pending.has(content)) return;
    const before = stored();
    const optimistic = withReaction(before, content, reacted);
    setContentPending(content, true);
    holds.current.set(content, { reacted, settled: false });
    change(() => optimistic);
    try {
      await scopedReviewClient(scoped).react({
        projectLocation: scope.location,
        prNumber: scope.prNumber,
        ...(subjectId !== undefined ? { subjectId } : {}),
        content,
        reacted,
      });
      const hold = holds.current.get(content);
      if (hold) hold.settled = true;
      reapplyHolds();
      if (!loading.current) holds.current.delete(content);
    } catch (error) {
      holds.current.delete(content);
      change((current) => rollbackReaction({ current, before, optimistic, content }));
      toast.danger(friendlyError(error));
    } finally {
      setContentPending(content, false);
    }
  }

  return {
    reactions,
    supported,
    disabled: scope.readOnly,
    pending,
    onToggle: (content, reacted) => void toggle(content, reacted),
  };
}
