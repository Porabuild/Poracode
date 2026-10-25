import type { Project, PullRequestSummary } from "@/shared/contracts";
import { reviewSourceIdentity } from "@/renderer/utils/forgeReviews";

export interface PullRequestEntry {
  project: Project;
  summary: PullRequestSummary;
}

export type PrListState = "open" | "closed" | "merged" | "all";
export type PrListSort = "updated" | "readiness" | "largest" | "smallest";
export type PrDraftFilter = "all" | "only" | "hide";
export type PrReviewFilter = "all" | "approved" | "changes" | "required" | "none";
export type PrChecksFilter = "all" | "passing" | "failing" | "pending";

export interface PrListFilters {
  hiddenProjectIds: ReadonlySet<string>;
  hiddenAccounts: ReadonlySet<string>;
  draft: PrDraftFilter;
  review: PrReviewFilter;
  checks: PrChecksFilter;
  labels: ReadonlySet<string>;
}

export const DEFAULT_PR_LIST_FILTERS: PrListFilters = {
  hiddenProjectIds: new Set(),
  hiddenAccounts: new Set(),
  draft: "all",
  review: "all",
  checks: "all",
  labels: new Set(),
};

/** Stable identity of a review across refreshes: host repository plus number. */
export function pullRequestKey(
  source: PullRequestSummary["pr"]["source"],
  projectId: string,
  number: number,
): string {
  return `${reviewSourceIdentity(source) ?? `project:${projectId}`}#${number}`;
}

export function pullRequestEntryKey(entry: PullRequestEntry): string {
  return pullRequestKey(entry.summary.pr.source, entry.project.id, entry.summary.pr.number);
}

/** Account a row was read with; rows from older hosts fall back to the project's viewer. */
export function pullRequestAccountKey(
  summary: PullRequestSummary,
  viewerLogin?: string,
): string | undefined {
  const account = summary.pr.source?.account;
  return account ? JSON.stringify([account.forge, account.host, account.login]) : viewerLogin;
}

export function activeFilterCount(filters: PrListFilters): number {
  return (
    (filters.hiddenProjectIds.size > 0 ? 1 : 0) +
    (filters.hiddenAccounts.size > 0 ? 1 : 0) +
    (filters.draft !== "all" ? 1 : 0) +
    (filters.review !== "all" ? 1 : 0) +
    (filters.checks !== "all" ? 1 : 0) +
    (filters.labels.size > 0 ? 1 : 0)
  );
}

export interface ParsedPrQuery {
  text: string[];
  labels: string[];
  authors: string[];
  draft?: boolean;
}

/**
 * Splits a search into free text and `label:`, `author:` and `is:draft` qualifiers.
 * Quoted values (`label:"needs review"`) keep their spaces.
 */
export function parsePrQuery(query: string): ParsedPrQuery {
  const parsed: ParsedPrQuery = { text: [], labels: [], authors: [] };
  for (const match of query.matchAll(/(\w+:)?(?:"([^"]*)"|(\S+))/g)) {
    const qualifier = match[1]?.slice(0, -1).toLocaleLowerCase();
    const value = (match[2] ?? match[3] ?? "").trim();
    if (!value) continue;
    const lower = value.toLocaleLowerCase();
    if (qualifier === "label") parsed.labels.push(lower);
    else if (qualifier === "author") parsed.authors.push(lower.replace(/^@/, ""));
    else if (qualifier === "is" && lower === "draft") parsed.draft = true;
    else parsed.text.push((match[1] ?? "") + lower);
  }
  return parsed;
}

function matchesQuery(entry: PullRequestEntry, query: ParsedPrQuery): boolean {
  const { summary, project } = entry;
  if (query.draft && !summary.pr.isDraft) return false;
  const labels = (summary.labels ?? []).map((label) => label.name.toLocaleLowerCase());
  if (query.labels.some((wanted) => !labels.includes(wanted))) return false;
  const author = summary.author?.login.toLocaleLowerCase() ?? "";
  if (query.authors.length > 0 && !query.authors.includes(author)) return false;
  if (query.text.length === 0) return true;
  const haystack = [
    summary.pr.title,
    summary.repository,
    summary.headBranch,
    summary.pr.baseBranch,
    author,
    project.name,
    `#${summary.pr.number}`,
    ...labels,
  ]
    .join("\n")
    .toLocaleLowerCase();
  return query.text.every((word) => haystack.includes(word));
}

function reviewMatches(decision: string | undefined, filter: PrReviewFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "approved":
      return decision === "APPROVED";
    case "changes":
      return decision === "CHANGES_REQUESTED";
    case "required":
      return decision === "REVIEW_REQUIRED";
    case "none":
      return !decision;
  }
}

function checksMatch(status: string | undefined, filter: PrChecksFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "passing":
      return status === "SUCCESS";
    case "failing":
      return status === "FAILURE";
    case "pending":
      return status === "PENDING";
  }
}

/**
 * Lower ranks sort first: reviews that can merge now, then those waiting on
 * checks or reviews, then blocked ones, with drafts and finished reviews last.
 */
export function mergeReadinessRank(summary: PullRequestSummary): number {
  const { pr } = summary;
  if (pr.state === "merged" || pr.state === "closed") return 6;
  if (pr.isDraft) return 5;
  if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY") return 4;
  if (pr.checksStatus === "FAILURE" || pr.reviewDecision === "CHANGES_REQUESTED") return 3;
  if (
    pr.mergeStateStatus === "CLEAN" ||
    (pr.reviewDecision === "APPROVED" && pr.checksStatus === "SUCCESS")
  )
    return 0;
  if (pr.checksStatus === "PENDING") return 1;
  return 2;
}

function compareEntries(sort: PrListSort) {
  return (left: PullRequestEntry, right: PullRequestEntry): number => {
    const a = left.summary;
    const b = right.summary;
    const size = (summary: PullRequestSummary) => summary.additions + summary.deletions;
    const primary =
      sort === "readiness"
        ? mergeReadinessRank(a) - mergeReadinessRank(b)
        : sort === "largest"
          ? size(b) - size(a)
          : sort === "smallest"
            ? size(a) - size(b)
            : 0;
    if (primary !== 0) return primary;
    const updated = b.pr.updatedAt.localeCompare(a.pr.updatedAt);
    if (updated !== 0) return updated;
    const repository = a.repository.localeCompare(b.repository);
    if (repository !== 0) return repository;
    return b.pr.number - a.pr.number;
  };
}

export interface PrListGroups {
  authored: PullRequestEntry[];
  reviewing: PullRequestEntry[];
  others: PullRequestEntry[];
}

export function filterAndSortEntries(
  entries: readonly PullRequestEntry[],
  options: {
    query: string;
    filters: PrListFilters;
    sort: PrListSort;
    accountKey: (entry: PullRequestEntry) => string | undefined;
  },
): PullRequestEntry[] {
  const query = parsePrQuery(options.query);
  const { filters } = options;
  return entries
    .filter((entry) => {
      const { summary } = entry;
      if (filters.hiddenProjectIds.has(entry.project.id)) return false;
      if (filters.hiddenAccounts.has(options.accountKey(entry) ?? "")) return false;
      if (filters.draft === "only" && !summary.pr.isDraft) return false;
      if (filters.draft === "hide" && summary.pr.isDraft) return false;
      if (!reviewMatches(summary.pr.reviewDecision, filters.review)) return false;
      if (!checksMatch(summary.pr.checksStatus, filters.checks)) return false;
      if (
        filters.labels.size > 0 &&
        !(summary.labels ?? []).some((label) => filters.labels.has(label.name))
      )
        return false;
      return matchesQuery(entry, query);
    })
    .toSorted(compareEntries(options.sort));
}

/** Rows the viewer authored, rows awaiting the viewer's review, and everything else. */
export function groupEntries(entries: readonly PullRequestEntry[]): PrListGroups {
  const groups: PrListGroups = { authored: [], reviewing: [], others: [] };
  for (const entry of entries) {
    if (entry.summary.pr.viewerDidAuthor === true) groups.authored.push(entry);
    else if (entry.summary.reviewRequested) groups.reviewing.push(entry);
    else groups.others.push(entry);
  }
  return groups;
}

/** Labels across the loaded rows, most used first, for the label filter. */
export function labelUsage(
  entries: readonly PullRequestEntry[],
): { name: string; color?: string; count: number }[] {
  const usage = new Map<string, { name: string; color?: string; count: number }>();
  for (const entry of entries)
    for (const label of entry.summary.labels ?? []) {
      const current = usage.get(label.name);
      if (current) current.count += 1;
      else
        usage.set(label.name, {
          name: label.name,
          ...(label.color ? { color: label.color } : {}),
          count: 1,
        });
    }
  return [...usage.values()].toSorted(
    (left, right) => right.count - left.count || left.name.localeCompare(right.name),
  );
}

function normalizedUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`.toLocaleLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Resolves a pasted review link or `#123` against the loaded rows. Links are
 * matched by their canonical review URL, so no host-specific URL shapes are needed.
 */
export function findReferencedEntry(
  query: string,
  entries: readonly PullRequestEntry[],
): PullRequestEntry | "ambiguous" | undefined {
  const trimmed = query.trim();
  const number = /^#(\d+)$/.exec(trimmed)?.[1];
  if (number) {
    const matches = entries.filter((entry) => entry.summary.pr.number === Number(number));
    return matches.length === 1 ? matches[0] : matches.length > 1 ? "ambiguous" : undefined;
  }
  const url = normalizedUrl(trimmed);
  if (!url) return undefined;
  return entries.find((entry) => normalizedUrl(entry.summary.pr.url) === url);
}
