import {
  PR_TIMELINE_EVENT_KINDS,
  type PrAuthor,
  type PrComment,
  type PrCommitSummary,
  type PrDetails,
  type PrReviewSummary,
  type PrReviewThread,
  type PrTimelineEvent,
  type PrTimelineEventKind,
} from "@/shared/contracts";

/** Filter groups of the timeline; `all` keeps everything. */
export type PrTimelineFilter = "all" | "events" | "commits" | "reviews";
export type PrTimelineOrder = "oldest" | "newest";

interface EntryBase {
  /** Unique across the whole timeline (`<type>:<source id>`). */
  id: string;
  /** Source timestamp; absent or unparseable entries sort last. */
  at: string | undefined;
  /** Parsed `at`, `Number.NaN` when there is no valid date. */
  time: number;
}

/** A lifecycle event whose `kind` this client knows how to phrase. */
export type PrKnownTimelineEvent = Omit<PrTimelineEvent, "kind"> & { kind: PrTimelineEventKind };

export type PrTimelineEntry =
  | (EntryBase & { type: "event"; event: PrKnownTimelineEvent })
  | (EntryBase & { type: "commit"; commit: PrCommitSummary })
  | (EntryBase & { type: "review"; review: PrReviewSummary })
  | (EntryBase & { type: "comment"; comment: PrComment })
  | (EntryBase & { type: "thread"; thread: PrReviewThread; first: PrComment });

const KNOWN_KINDS: ReadonlySet<string> = new Set(PR_TIMELINE_EVENT_KINDS);

function isKnownEvent(event: PrTimelineEvent): event is PrKnownTimelineEvent {
  return KNOWN_KINDS.has(event.kind);
}

function parseTime(at: string | undefined): number {
  if (!at) return Number.NaN;
  return new Date(at).getTime();
}

/** Events that cannot be phrased without their payload are dropped rather than shown half-empty. */
function isPresentable(event: PrKnownTimelineEvent): boolean {
  switch (event.kind) {
    case "labeled":
    case "unlabeled":
      return event.label !== undefined;
    case "review-requested":
    case "review-request-removed":
      return event.reviewer !== undefined;
    case "system":
      return (event.text ?? "").trim().length > 0;
    default:
      return true;
  }
}

function syntheticEvent(
  kind: "opened" | "merged",
  createdAt: string,
  actor: PrAuthor | null | undefined,
): PrKnownTimelineEvent {
  return {
    id: `synthetic-${kind}`,
    kind,
    createdAt,
    ...(actor ? { actor } : {}),
  };
}

function timelineEvents(details: PrDetails): PrKnownTimelineEvent[] {
  const events = (details.timeline ?? []).filter(isKnownEvent).filter(isPresentable);
  if (details.createdAt && !events.some((event) => event.kind === "opened")) {
    events.push(syntheticEvent("opened", details.createdAt, details.author));
  }
  if (details.mergedAt && !events.some((event) => event.kind === "merged")) {
    events.push(syntheticEvent("merged", details.mergedAt, details.mergedBy));
  }
  return events;
}

/** Same rule as the conversation: an empty COMMENTED/DISMISSED review is API noise. */
function isShownReview(review: PrReviewSummary): boolean {
  if (review.state === "PENDING") return false;
  return (
    Boolean(review.body) || review.state === "APPROVED" || review.state === "CHANGES_REQUESTED"
  );
}

/**
 * Merges lifecycle events, commits, reviews, comments, and review threads into
 * one chronological list. Events with a kind this client does not know are
 * skipped so a newer host never breaks an older client. Ties keep source
 * order; entries without a valid date come last.
 */
export function buildPrTimeline(details: PrDetails | undefined): PrTimelineEntry[] {
  if (!details) return [];
  const entries: PrTimelineEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: PrTimelineEntry) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    entries.push(entry);
  };
  const base = (id: string, at: string | undefined): EntryBase => ({
    id,
    at,
    time: parseTime(at),
  });

  // Source order for ties: opened first, then events, commits, reviews, comments, threads.
  const events = timelineEvents(details);
  const opened = events.filter((event) => event.kind === "opened");
  const others = events.filter((event) => event.kind !== "opened");
  for (const event of [...opened, ...others]) {
    add({ ...base(`event:${event.id}`, event.createdAt), type: "event", event });
  }
  for (const commit of details.commits) {
    add({ ...base(`commit:${commit.oid}`, commit.authoredDate), type: "commit", commit });
  }
  for (const review of details.reviews) {
    if (!isShownReview(review)) continue;
    add({ ...base(`review:${review.id}`, review.submittedAt), type: "review", review });
  }
  for (const comment of details.comments) {
    add({ ...base(`comment:${comment.id}`, comment.createdAt), type: "comment", comment });
  }
  for (const thread of details.reviewThreads ?? []) {
    const first = thread.comments[0];
    if (!first) continue;
    add({ ...base(`thread:${thread.id}`, first.createdAt), type: "thread", thread, first });
  }

  // Array.prototype.sort is stable, so equal timestamps keep the order above.
  return entries.sort((a, b) => {
    const aValid = !Number.isNaN(a.time);
    const bValid = !Number.isNaN(b.time);
    if (aValid && bValid) return a.time - b.time;
    if (aValid) return -1;
    if (bValid) return 1;
    return 0;
  });
}

export function filterPrTimeline(
  entries: readonly PrTimelineEntry[],
  filter: PrTimelineFilter,
): PrTimelineEntry[] {
  switch (filter) {
    case "all":
      return [...entries];
    case "events":
      return entries.filter((entry) => entry.type === "event");
    case "commits":
      return entries.filter((entry) => entry.type === "commit");
    case "reviews":
      return entries.filter(
        (entry) => entry.type === "review" || entry.type === "comment" || entry.type === "thread",
      );
  }
}

/** Newest first reverses dated entries only; entries without a date stay last. */
export function orderPrTimeline(
  entries: readonly PrTimelineEntry[],
  order: PrTimelineOrder,
): PrTimelineEntry[] {
  if (order === "oldest") return [...entries];
  const dated = entries.filter((entry) => !Number.isNaN(entry.time));
  const undated = entries.filter((entry) => Number.isNaN(entry.time));
  return [...dated.reverse(), ...undated];
}
