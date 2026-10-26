import { create } from "zustand";

/**
 * Line comments a reviewer has drafted but not yet submitted. In memory only:
 * closing the app drops them, which keeps a draft from outliving the head it
 * was drawn on. Each draft remembers that head; a draft for another head is
 * outdated and is never submitted.
 */
export interface ReviewDraftComment {
  id: string;
  path: string;
  /** `LEFT` is the removed (old) side, `RIGHT` the added (new) side. */
  side: "LEFT" | "RIGHT";
  line: number;
  body: string;
  /** Head commit the line numbers refer to. */
  headSha: string;
}

export type NewReviewDraftComment = Omit<ReviewDraftComment, "id">;

interface ReviewDraftState {
  /** Drafts per review (`gitStore` cache key). */
  byReview: Record<string, readonly ReviewDraftComment[]>;
  add: (cacheKey: string, draft: NewReviewDraftComment) => string;
  update: (cacheKey: string, id: string, body: string) => void;
  remove: (cacheKey: string, id: string) => void;
  /** Removes the listed drafts (the ones a submission carried). */
  removeMany: (cacheKey: string, ids: readonly string[]) => void;
  /** Removes every draft whose head differs from `headSha`. */
  removeOutdated: (cacheKey: string, headSha: string | undefined) => void;
}

export const NO_REVIEW_DRAFTS: readonly ReviewDraftComment[] = [];

let nextId = 0;

function replaceReview(
  state: ReviewDraftState,
  cacheKey: string,
  next: readonly ReviewDraftComment[],
): Pick<ReviewDraftState, "byReview"> {
  const byReview = { ...state.byReview };
  if (next.length === 0) delete byReview[cacheKey];
  else byReview[cacheKey] = next;
  return { byReview };
}

export const useReviewDraftStore = create<ReviewDraftState>((set) => ({
  byReview: {},
  add: (cacheKey, draft) => {
    nextId += 1;
    const id = `draft-${nextId}`;
    set((state) =>
      replaceReview(state, cacheKey, [...(state.byReview[cacheKey] ?? []), { ...draft, id }]),
    );
    return id;
  },
  update: (cacheKey, id, body) =>
    set((state) => {
      const current = state.byReview[cacheKey];
      if (!current?.some((draft) => draft.id === id && draft.body !== body)) return state;
      return replaceReview(
        state,
        cacheKey,
        current.map((draft) => (draft.id === id ? { ...draft, body } : draft)),
      );
    }),
  remove: (cacheKey, id) =>
    set((state) => {
      const current = state.byReview[cacheKey];
      if (!current?.some((draft) => draft.id === id)) return state;
      return replaceReview(
        state,
        cacheKey,
        current.filter((draft) => draft.id !== id),
      );
    }),
  removeMany: (cacheKey, ids) =>
    set((state) => {
      const current = state.byReview[cacheKey];
      if (!current || !current.some((draft) => ids.includes(draft.id))) return state;
      return replaceReview(
        state,
        cacheKey,
        current.filter((draft) => !ids.includes(draft.id)),
      );
    }),
  removeOutdated: (cacheKey, headSha) =>
    set((state) => {
      // Without a known head every draft would look outdated.
      if (headSha === undefined) return state;
      const current = state.byReview[cacheKey];
      if (!current?.some((draft) => draft.headSha !== headSha)) return state;
      return replaceReview(
        state,
        cacheKey,
        current.filter((draft) => draft.headSha === headSha),
      );
    }),
}));

export function useReviewDrafts(cacheKey: string): readonly ReviewDraftComment[] {
  return useReviewDraftStore((state) => state.byReview[cacheKey] ?? NO_REVIEW_DRAFTS);
}

/** Drafts a submission may carry: those drawn on the head now under review. */
export function currentDrafts(
  drafts: readonly ReviewDraftComment[],
  headSha: string | undefined,
): ReviewDraftComment[] {
  return headSha === undefined ? [] : drafts.filter((draft) => draft.headSha === headSha);
}
