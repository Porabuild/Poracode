import { msg } from "@/shared/messages";
import type {
  ForgePrLabelCandidatesResult,
  ForgePrReviewerCandidatesResult,
  ForgeReviewDraftComment,
  ForgeReviewerRef,
  PrAuthor,
  PrLabel,
  PrReviewer,
  PrTimelineEvent,
} from "@/shared/contracts";
import type { ForgeApi } from "./api";
import { lifecycleEvents, num, object, requiredString, rows, str, type ApiObject } from "./types";

// Azure DevOps review metadata: labels (project tags), reviewer requests, the
// system-thread activity feed, and draft line comments.

/** The PR labels API and project tags are still preview resources in 7.1. */
const PREVIEW_VERSION = "7.1-preview.1";
const LABEL_LIMIT = 300;
const MEMBER_LIMIT = 200;
const TEAM_LIMIT = 100;
const CANDIDATE_LIMIT = 50;

export const AZURE_LIST_STATUS = {
  open: "active",
  all: "all",
  closed: "abandoned",
  merged: "completed",
} as const;

export function author(raw: unknown): PrAuthor {
  const r = object(raw);
  return {
    login: str(r.id) || str(r.uniqueName) || str(r.displayName),
    ...(str(r.imageUrl) ? { avatarUrl: str(r.imageUrl) } : {}),
  };
}

/** Azure tags have no color; an inactive tag is a deleted one still referenced by history. */
export function azureLabels(raw: unknown): PrLabel[] {
  return rows(raw)
    .filter((label) => label.active !== false && str(label.name))
    .map((label) => ({ name: str(label.name) }));
}

/** `id` is the identity GUID the reviewers API adds and removes. */
function azureReviewer(raw: unknown, team = object(raw).isContainer === true): PrReviewer {
  const r = object(raw);
  const { login, avatarUrl } = author(r);
  const name = str(r.displayName) || str(r.name);
  return {
    id: str(r.id),
    login,
    ...(name ? { name } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(team ? { team: true } : {}),
  };
}

/** Reviewers who have not voted are the outstanding requests. */
export function azureRequestedReviewers(reviewers: ApiObject[]): PrReviewer[] {
  return reviewers
    .filter((reviewer) => num(reviewer.vote) === 0 && str(reviewer.id))
    .map((reviewer) => azureReviewer(reviewer));
}

// Vote and push notices restate the reviews and commits arrays.
const DUPLICATE_THREAD_TYPES = new Set(["VoteUpdate", "RefUpdate"]);
function threadType(thread: ApiObject) {
  return str(object(object(thread.properties).CodeReviewThreadType).$value);
}

/**
 * Azure has no structured event feed: lifecycle events come from the review's
 * timestamps and every other system-thread notice stays host-authored text.
 */
export function azureTimeline(r: ApiObject, threads: ApiObject[]): PrTimelineEvent[] {
  const closedAt = str(r.closedDate);
  const events = lifecycleEvents({
    createdAt: str(r.creationDate),
    author: author(r.createdBy),
    ...(r.status === "completed" && closedAt
      ? { mergedAt: closedAt, ...(r.closedBy ? { mergedBy: author(r.closedBy) } : {}) }
      : {}),
    ...(r.status === "abandoned" && closedAt ? { closedAt } : {}),
  });
  for (const thread of threads) {
    if (thread.isDeleted === true || DUPLICATE_THREAD_TYPES.has(threadType(thread))) continue;
    for (const comment of rows(thread.comments)) {
      if (comment.commentType !== "system" || comment.isDeleted === true) continue;
      const text = str(comment.content);
      const createdAt = str(comment.publishedDate) || str(thread.publishedDate);
      if (!text || !createdAt) continue;
      events.push({
        id: `system:${String(thread.id)}:${String(comment.id)}`,
        kind: "system",
        createdAt,
        text,
      });
    }
  }
  return events.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Azure line anchors are 1-based lines with a 1-based character offset. */
function threadContext(comment: ForgeReviewDraftComment) {
  const start = { line: comment.startLine ?? comment.line, offset: 1 };
  const end = { line: comment.line, offset: 1 };
  return {
    filePath: `/${comment.path.replace(/^\/+/, "")}`,
    ...(comment.side === "LEFT"
      ? { leftFileStart: start, leftFileEnd: end }
      : { rightFileStart: start, rightFileEnd: end }),
  };
}

/** Default-team members first, then project teams, filtered client-side by `query`. */
function reviewerCandidates(
  members: ApiObject[],
  teams: ApiObject[],
  query: string | undefined,
): ForgePrReviewerCandidatesResult {
  const needle = query?.toLowerCase();
  const matches = (...values: unknown[]) =>
    !needle || values.some((value) => str(value).toLowerCase().includes(needle));
  const seen = new Set<string>();
  const reviewers: PrReviewer[] = [];
  const add = (raw: ApiObject, team?: boolean) => {
    const reviewer = azureReviewer(raw, team);
    if (!reviewer.id || seen.has(reviewer.id)) return;
    seen.add(reviewer.id);
    reviewers.push(reviewer);
  };
  for (const member of members) {
    const identity = object(member.identity);
    if (matches(identity.displayName, identity.uniqueName)) add(identity);
  }
  for (const team of teams) if (matches(team.name)) add(team, true);
  return {
    reviewers: reviewers.slice(0, CANDIDATE_LIMIT),
    truncated:
      reviewers.length > CANDIDATE_LIMIT ||
      members.length >= MEMBER_LIMIT ||
      teams.length >= TEAM_LIMIT,
  };
}

/** Request plumbing the adapter lends to its metadata operations. */
export interface AzureEndpoints {
  api: ForgeApi;
  /** URL-encoded project name. */
  project: string;
  url(path: string, query?: Record<string, string>): string;
  review(number: number): string;
}

export class AzureReviewMetadata {
  constructor(private readonly at: AzureEndpoints) {}
  private labelsUrl(number: number, label?: string) {
    const suffix = label ? `/${encodeURIComponent(label)}` : "";
    return this.at.url(`${this.at.review(number)}/labels${suffix}`, {
      "api-version": PREVIEW_VERSION,
    });
  }
  /** Optional read: a failure leaves the review's labels absent. */
  async labels(number: number): Promise<PrLabel[] | undefined> {
    try {
      return azureLabels(await this.at.api.list(this.labelsUrl(number), "value"));
    } catch {
      return undefined;
    }
  }
  /** Review labels are project tags, so the project's tag list is the candidate set. */
  async labelCandidates(): Promise<ForgePrLabelCandidatesResult> {
    const tags = await this.at.api.json(
      this.at.url(`${this.at.project}/_apis/wit/tags`, { "api-version": PREVIEW_VERSION }),
    );
    const labels = azureLabels(tags.value).toSorted((a, b) => a.name.localeCompare(b.name));
    return { labels: labels.slice(0, LABEL_LIMIT), truncated: labels.length > LABEL_LIMIT };
  }
  /** Adding a name the project lacks creates that tag; removing one not on the review fails. */
  async setLabels(number: number, add: string[], remove: string[]) {
    for (const name of add) await this.at.api.json(this.labelsUrl(number), "POST", { name });
    for (const name of remove) await this.at.api.json(this.labelsUrl(number, name), "DELETE");
  }
  /** Members of the project's default team, plus the project's teams as group reviewers. */
  async reviewerCandidates(query?: string): Promise<ForgePrReviewerCandidatesResult> {
    const projects = `_apis/projects/${this.at.project}`;
    const [project, teams] = await Promise.all([
      this.at.api.json(this.at.url(projects)),
      this.at.api.json(this.at.url(`${projects}/teams`, { $top: String(TEAM_LIMIT) })),
    ]);
    const team = encodeURIComponent(requiredString(object(project.defaultTeam).id));
    const members = await this.at.api.json(
      this.at.url(`${projects}/teams/${team}/members`, { $top: String(MEMBER_LIMIT) }),
    );
    return reviewerCandidates(rows(members.value), rows(teams.value), query);
  }
  async requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    // The bulk add leaves existing votes alone, unlike a per-reviewer PUT that carries a vote.
    if (add.length)
      await this.at.api.json(
        this.at.url(`${this.at.review(number)}/reviewers`),
        "POST",
        add.map((reviewer) => ({ id: reviewer.id })),
      );
    for (const reviewer of remove)
      await this.at.api.json(
        this.at.url(`${this.at.review(number)}/reviewers/${encodeURIComponent(reviewer.id)}`),
        "DELETE",
      );
  }
  /**
   * Azure has no pending review: each line comment becomes its own thread on the
   * latest iteration, then `decide` posts the vote or summary.
   */
  async submitDraft(
    number: number,
    comments: ForgeReviewDraftComment[],
    decide: () => Promise<void>,
  ) {
    let wrote = false;
    try {
      for (const draft of comments) {
        await this.at.api.json(this.at.url(`${this.at.review(number)}/threads`), "POST", {
          comments: [{ parentCommentId: 0, content: draft.body, commentType: 1 }],
          status: 1,
          threadContext: threadContext(draft),
        });
        wrote = true;
      }
      await decide();
    } catch (error) {
      if (wrote) throw new Error(msg("forge.reviewDraftPartial"), { cause: error });
      throw error;
    }
  }
}
