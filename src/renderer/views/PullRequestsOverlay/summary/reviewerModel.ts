import type { PrAuthor, PrReviewState, PrReviewSummary, PrReviewer } from "@/shared/contracts";

export interface ReviewerRow {
  login: string;
  author: PrAuthor;
  /** Present while a review is still requested from them; only these can be removed. */
  requested?: PrReviewer;
  /** Their latest submitted review, when they have left one. */
  state?: PrReviewState;
}

const sameLogin = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Each person's most recent submitted review. An unsubmitted (pending) review is
 * the viewer's own draft, so it never counts as a verdict.
 */
export function latestReviewByLogin(
  reviews: readonly PrReviewSummary[],
): Map<string, PrReviewSummary> {
  const latest = new Map<string, PrReviewSummary>();
  for (const review of reviews) {
    if (review.state === "PENDING") continue;
    const key = review.author.login.toLowerCase();
    const previous = latest.get(key);
    if (!previous || (review.submittedAt ?? "") >= (previous.submittedAt ?? "")) {
      latest.set(key, review);
    }
  }
  return latest;
}

/**
 * Requested reviewers first, then everyone else who has reviewed. The author
 * never appears: they cannot review their own work.
 */
export function buildReviewerRows(input: {
  requested: readonly PrReviewer[];
  reviews: readonly PrReviewSummary[];
  authorLogin: string | undefined;
}): ReviewerRow[] {
  const latest = latestReviewByLogin(input.reviews);
  const rows: ReviewerRow[] = input.requested.map((reviewer) => {
    const state = latest.get(reviewer.login.toLowerCase())?.state;
    return {
      login: reviewer.login,
      author: {
        login: reviewer.login,
        ...(reviewer.avatarUrl ? { avatarUrl: reviewer.avatarUrl } : {}),
      },
      requested: reviewer,
      ...(state ? { state } : {}),
    };
  });
  for (const review of latest.values()) {
    const login = review.author.login;
    if (rows.some((row) => sameLogin(row.login, login))) continue;
    if (input.authorLogin && sameLogin(input.authorLogin, login)) continue;
    rows.push({ login, author: review.author, state: review.state });
  }
  return rows;
}
