import { create } from "zustand";
import type { PlanLineNote } from "./planFeedback";

type PlanReviewDraft = {
  requestId: string;
  notes: PlanLineNote[];
  overall: string;
};

/**
 * Plan-review drafts keyed by thread. They live outside the request panel
 * because answering the review optimistically removes the request (unmounting
 * the panel), and a failed answer rolls it back into a fresh panel for the same
 * request. One slot per thread: a different request id reads as empty and the
 * next edit replaces it. Renderer-local and never persisted.
 */
const usePlanReviewDraftStore = create<{ byThread: Record<string, PlanReviewDraft> }>(() => ({
  byThread: {},
}));

const NO_NOTES: PlanLineNote[] = [];

export function usePlanReviewDraft(threadId: string, requestId: string) {
  const stored = usePlanReviewDraftStore((state) => state.byThread[threadId]);
  const draft = stored?.requestId === requestId ? stored : undefined;
  const update = (patch: Partial<Omit<PlanReviewDraft, "requestId">>) =>
    usePlanReviewDraftStore.setState((state) => {
      const current = state.byThread[threadId];
      const base =
        current?.requestId === requestId ? current : { requestId, notes: NO_NOTES, overall: "" };
      return { byThread: { ...state.byThread, [threadId]: { ...base, ...patch } } };
    });
  return {
    notes: draft?.notes ?? NO_NOTES,
    overall: draft?.overall ?? "",
    setNotes: (notes: PlanLineNote[]) => update({ notes }),
    setOverall: (overall: string) => update({ overall }),
  };
}

/** Drop the draft once its request is answered. A no-op for another request. */
export function clearPlanReviewDraft(threadId: string, requestId: string): void {
  usePlanReviewDraftStore.setState((state) => {
    if (state.byThread[threadId]?.requestId !== requestId) return state;
    const byThread = { ...state.byThread };
    delete byThread[threadId];
    return { byThread };
  });
}
