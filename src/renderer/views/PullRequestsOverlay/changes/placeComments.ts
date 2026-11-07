import type { PrReviewThread } from "@/shared/contracts";
import type { LineComments } from "./inlineComments";
import type { ReviewDraftComment } from "./prReviewDraftStore";
import type { VisibleLines } from "./unifiedPatch";

export interface PlacedComments {
  /** Shape of the diff view's `extendData`: line number (as text) to comments. */
  extendData: {
    oldFile: Record<string, { data: LineComments }>;
    newFile: Record<string, { data: LineComments }>;
  };
  /** Comments whose line is not part of the diff being shown. */
  unplacedThreads: PrReviewThread[];
  unplacedDrafts: ReviewDraftComment[];
}

/** A thread sits on the side its host anchored it to; hosts that do not say anchor on the new side. */
export function threadSide(thread: PrReviewThread): "LEFT" | "RIGHT" {
  return thread.side === "LEFT" ? "LEFT" : "RIGHT";
}

/**
 * Decides where each thread and draft of one file is drawn. A thread sits on the
 * side of its line that the host reports (the new side when it reports none). A
 * draft sits on its own side, but only when it was drawn on the head being
 * reviewed. A comment is drawn inline only when that side's line is part of a
 * shown hunk; every other one (outdated, or hidden by the whitespace filter) is
 * listed above the diff instead.
 */
export function placeComments(
  visible: VisibleLines,
  threads: readonly PrReviewThread[],
  drafts: readonly ReviewDraftComment[],
  headSha: string | undefined,
): PlacedComments {
  const extendData: PlacedComments["extendData"] = { oldFile: {}, newFile: {} };
  const unplacedThreads: PrReviewThread[] = [];
  const unplacedDrafts: ReviewDraftComment[] = [];
  const slot = (side: "LEFT" | "RIGHT", line: number): LineComments => {
    const target = side === "LEFT" ? extendData.oldFile : extendData.newFile;
    const key = String(line);
    const existing = target[key];
    if (existing) return existing.data;
    const created: LineComments = { threads: [], drafts: [] };
    target[key] = { data: created };
    return created;
  };
  for (const thread of threads) {
    const side = threadSide(thread);
    const lines = side === "LEFT" ? visible.old : visible.new;
    if (thread.line !== undefined && lines.has(thread.line)) {
      slot(side, thread.line).threads.push(thread);
    } else {
      unplacedThreads.push(thread);
    }
  }
  for (const draft of drafts) {
    const lines = draft.side === "LEFT" ? visible.old : visible.new;
    if (draft.headSha === headSha && lines.has(draft.line)) {
      slot(draft.side, draft.line).drafts.push(draft);
    } else {
      unplacedDrafts.push(draft);
    }
  }
  return { extendData, unplacedThreads, unplacedDrafts };
}
