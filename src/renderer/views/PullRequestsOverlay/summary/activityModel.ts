import type { PrComment, PrDetails, PrReviewSummary, PrReviewThread } from "@/shared/contracts";

export type ActivityEntry =
  | { kind: "comment"; at: string; data: PrComment }
  | { kind: "review"; at: string; data: PrReviewSummary }
  | { kind: "thread"; at: string; data: PrReviewThread };

/** `reviews` covers review summaries and inline review threads. */
export type ActivityFilter = "all" | "comments" | "reviews";
export type ActivityOrder = "oldest" | "newest";

/**
 * Conversation comments, review summaries and review threads, oldest first.
 * Lifecycle events (labels, pushes, merges) belong to the Timeline tab.
 */
export function buildActivity(details: PrDetails | undefined): ActivityEntry[] {
  if (!details) return [];
  const entries: ActivityEntry[] = [];
  for (const comment of details.comments) {
    entries.push({ kind: "comment", at: comment.createdAt, data: comment });
  }
  for (const review of details.reviews) {
    // A review with no body that is not a verdict is an empty drive-by from the API.
    if (!review.body && review.state !== "APPROVED" && review.state !== "CHANGES_REQUESTED") {
      continue;
    }
    entries.push({ kind: "review", at: review.submittedAt ?? "", data: review });
  }
  for (const thread of details.reviewThreads ?? []) {
    entries.push({ kind: "thread", at: thread.comments[0]?.createdAt ?? "", data: thread });
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      a.entry.at < b.entry.at ? -1 : a.entry.at > b.entry.at ? 1 : a.index - b.index,
    )
    .map(({ entry }) => entry);
}

export function filterActivity(
  entries: readonly ActivityEntry[],
  filter: ActivityFilter,
  order: ActivityOrder,
): ActivityEntry[] {
  const kept =
    filter === "all"
      ? [...entries]
      : entries.filter((entry) => (filter === "comments") === (entry.kind === "comment"));
  return order === "newest" ? kept.reverse() : kept;
}
