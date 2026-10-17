import type {
  ForgeEditPrPayload,
  ForgeRepository,
  GhCreatePrPayload,
  GhGetPrDetailsResult,
  PrAuthor,
  PrComment,
  PrData,
  PrMergeMethod,
  PrReviewDecision,
  PrReviewSummary,
  PrReviewThread,
  PullRequestSummary,
} from "@/shared/contracts";
import { ForgeApi } from "./api";
import {
  assertHead,
  checksStatus,
  encodePath,
  normalizedCheck,
  num,
  object,
  requiredNumber,
  rows,
  str,
  type ApiObject,
  type ForgeReviewAdapter,
} from "./types";

function author(raw: unknown): PrAuthor {
  const r = object(raw);
  return { login: str(r.login), ...(str(r.avatar_url) ? { avatarUrl: str(r.avatar_url) } : {}) };
}
function comment(r: ApiObject): PrComment {
  return {
    id: String(r.id),
    author: author(r.user),
    body: str(r.body),
    createdAt: str(r.created_at),
    ...(str(r.html_url) ? { url: str(r.html_url) } : {}),
  };
}
function reviews(raw: ApiObject[]): PrReviewSummary[] {
  return raw.map((r) => ({
    id: String(r.id),
    author: author(r.user),
    body: str(r.body),
    submittedAt: str(r.submitted_at),
    url: str(r.html_url),
    state:
      r.dismissed === true
        ? "DISMISSED"
        : r.state === "APPROVED"
          ? "APPROVED"
          : r.state === "REQUEST_CHANGES"
            ? "CHANGES_REQUESTED"
            : r.state === "PENDING"
              ? "PENDING"
              : "COMMENTED",
  }));
}

/** Forgejo and Gitea share these documented API-v1 review operations. */
export class GiteaReview implements ForgeReviewAdapter {
  private readonly repo: string;
  constructor(
    readonly source: ForgeRepository,
    private readonly api: ForgeApi,
  ) {
    this.repo = `repos/${encodePath(source.repository)}`;
  }
  private path(number?: number) {
    return `${this.repo}/pulls${number ? `/${number}` : ""}`;
  }
  private pr(r: ApiObject): PrData {
    const draft = r.draft === true || /^(?:\[wip\]|wip:|draft:)/i.test(str(r.title));
    return {
      source: {
        ...this.source,
        capabilities: {
          ...this.source.capabilities,
          autoFix:
            this.source.capabilities.autoFix &&
            str(object(object(r.head).repo).full_name).toLowerCase() ===
              this.source.repository.toLowerCase(),
        },
      },
      number: requiredNumber(r.number),
      title: str(r.title),
      url: str(r.html_url),
      baseBranch: str(object(r.base).ref),
      updatedAt: str(r.updated_at),
      isDraft: draft,
      state:
        r.merged === true ? "merged" : r.state === "closed" ? "closed" : draft ? "draft" : "open",
      headSha: str(object(r.head).sha),
      viewerDidAuthor: author(r.user).login === this.source.account?.login,
      mergeable:
        r.mergeable === true ? "MERGEABLE" : r.mergeable === false ? "CONFLICTING" : "UNKNOWN",
      // Conflict information alone does not prove required approvals/checks passed.
      mergeStateStatus: draft ? "DRAFT" : r.mergeable === false ? "DIRTY" : "UNKNOWN",
    };
  }
  async list(state: "open" | "all", branch?: string): Promise<PullRequestSummary[]> {
    const list = await this.api.list(`${this.path()}?state=${state}&sort=recentupdate&limit=100`);
    return list
      .filter((r) => !branch || str(object(r.head).ref) === branch)
      .map((r) => ({
        pr: this.pr(r),
        headBranch: str(object(r.head).ref),
        author: author(r.user),
        additions: num(r.additions),
        deletions: num(r.deletions),
        repository: this.source.repository,
        reviewRequested: rows(r.requested_reviewers).some(
          (user) => str(user.login) === this.source.account?.login,
        ),
      }));
  }
  async checks(number: number) {
    const r = await this.api.json(this.path(number));
    const sha = assertHead(str(object(r.head).sha));
    const statuses = await this.api.list(
      `${this.repo}/statuses/${encodeURIComponent(sha)}?limit=100`,
    );
    const seen = new Set<string>();
    return statuses
      .toSorted((a, b) => num(b.id) - num(a.id))
      .filter((s) => {
        const name = str(s.context);
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map((s) => normalizedCheck(str(s.context), str(s.status), str(s.target_url)));
  }
  async files(number: number) {
    return (await this.api.list(`${this.path(number)}/files?limit=100`)).map((f) => ({
      path: str(f.filename),
      additions: num(f.additions),
      deletions: num(f.deletions),
    }));
  }
  diff(number: number) {
    return this.api.text(`${this.path(number)}.diff`);
  }
  async threads(number: number): Promise<PrReviewThread[]> {
    const raw = await this.api.list(`${this.path(number)}/reviews?limit=100`);
    const groups = await Promise.all(
      raw
        .filter((r) => num(r.comments_count) > 0)
        .map((r) => this.api.list(`${this.path(number)}/reviews/${num(r.id)}/comments?limit=100`)),
    );
    return groups.flat().map((c) => ({
      id: String(c.id),
      isResolved: Boolean(object(c.resolver).id),
      isOutdated: num(c.position) === 0,
      path: str(c.path),
      ...(num(c.position) ? { line: num(c.position) } : {}),
      comments: [comment(c)],
    }));
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    const [r, comments, commits, rawReviews, checks] = await Promise.all([
      this.api.json(this.path(number)),
      this.api.list(`${this.repo}/issues/${number}/comments?limit=100`),
      this.api.list(`${this.path(number)}/commits?limit=100`),
      this.api.list(`${this.path(number)}/reviews?limit=100`),
      this.checks(number),
    ]);
    const pr = this.pr(r);
    const status = checksStatus(checks);
    if (status) pr.checksStatus = status;
    const latest = new Map<string, ApiObject>();
    for (const review of rawReviews.toSorted((a, b) =>
      str(a.submitted_at).localeCompare(str(b.submitted_at)),
    ))
      if (review.dismissed !== true && review.stale !== true)
        latest.set(author(review.user).login, review);
    if ([...latest.values()].some((review) => review.state === "REQUEST_CHANGES")) {
      pr.reviewDecision = "CHANGES_REQUESTED";
      pr.mergeStateStatus = "BLOCKED";
    }
    return {
      pr,
      details: {
        source: pr.source!,
        number: pr.number,
        title: pr.title,
        body: str(r.body),
        author: author(r.user),
        baseBranch: pr.baseBranch,
        headBranch: str(object(r.head).ref),
        additions: num(r.additions),
        deletions: num(r.deletions),
        changedFiles: num(r.changed_files),
        createdAt: str(r.created_at),
        mergedAt: str(r.merged_at) || null,
        closedAt: str(r.closed_at) || null,
        commits: commits.map((c) => {
          const commit = object(c.commit);
          const message = str(commit.message);
          return {
            oid: str(c.sha),
            abbreviatedOid: str(c.sha).slice(0, 7),
            messageHeadline: message.split("\n")[0] ?? "",
            messageBody: message,
            authoredDate: str(object(commit.author).date),
            author: author(c.author),
            url: str(c.html_url),
          };
        }),
        comments: comments.map(comment),
        reviews: reviews(rawReviews),
        checks,
      },
    };
  }
  async create(input: GhCreatePrPayload) {
    return this.pr(
      await this.api.json(this.path(), "POST", {
        head: input.branch,
        base: input.baseBranch,
        title:
          input.isDraft && !/^(?:wip:|draft:)/i.test(input.title)
            ? `WIP: ${input.title}`
            : input.title,
        body: input.body,
      }),
    );
  }
  async edit(input: ForgeEditPrPayload) {
    await this.api.json(this.path(input.prNumber), "PATCH", {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.baseBranch !== undefined ? { base: input.baseBranch } : {}),
    });
  }
  async comment(number: number, body: string) {
    return comment(await this.api.json(`${this.repo}/issues/${number}/comments`, "POST", { body }));
  }
  async review(number: number, decision: PrReviewDecision, body: string) {
    const r = await this.api.json(this.path(number));
    await this.api.json(`${this.path(number)}/reviews`, "POST", {
      event:
        decision === "approve"
          ? "APPROVED"
          : decision === "request-changes"
            ? "REQUEST_CHANGES"
            : "COMMENT",
      body,
      commit_id: assertHead(str(object(r.head).sha)),
    });
  }
  async merge(number: number, method: PrMergeMethod, expectedHeadSha?: string) {
    const r = await this.api.json(this.path(number));
    await this.api.json(`${this.path(number)}/merge`, "POST", {
      do: method,
      head_commit_id: assertHead(str(object(r.head).sha), expectedHeadSha),
      force_merge: false,
      delete_branch_after_merge: false,
    });
  }
  async setState(number: number, state: "closed" | "open" | "ready") {
    const r = state === "ready" ? await this.api.json(this.path(number)) : null;
    await this.api.json(
      this.path(number),
      "PATCH",
      r ? { title: str(r.title).replace(/^(?:\[wip\]|wip:|draft:)\s*/i, "") } : { state },
    );
  }
  async updateBranch(number: number, rebase: boolean) {
    await this.api.json(`${this.path(number)}/update?style=${rebase ? "rebase" : "merge"}`, "POST");
  }
}
