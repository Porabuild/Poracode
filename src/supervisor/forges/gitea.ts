import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
  ForgePrLabelCandidatesResult,
  ForgePrReviewerCandidatesResult,
  ForgeRepository,
  ForgeReviewDraftComment,
  ForgeReviewerRef,
  GhCreatePrPayload,
  GhGetPrDetailsResult,
  PrComment,
  PrData,
  PrMergeMethod,
  PrReaction,
  PrReviewDecision,
  PrReviewSummary,
  PrReviewThread,
  PullRequestSummary,
} from "@/shared/contracts";
import { ForgeApi } from "./api";
import {
  author,
  draftComment,
  label,
  labels,
  reactions,
  isDraft,
  READY_TITLE,
  repoLabels,
  REQUEST_ROW,
  requestedReviewers,
  reviewer,
  reviewerBody,
  reviewEvent,
  teamReviewer,
  timeline,
  WIP_TITLE,
} from "./giteaMetadata";
import {
  assertHead,
  checksStatus,
  encodePath,
  lifecycleEvents,
  normalizedCheck,
  num,
  object,
  requiredNumber,
  rows,
  str,
  type ApiObject,
  type ForgeReviewAdapter,
} from "./types";

const REVIEWER_CANDIDATES = 50;
/**
 * The host has no reaction summary on comments, so each comment costs one read.
 * Only the newest comments get reactions; older ones leave the field absent.
 */
const COMMENT_REACTIONS = 20;
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
  return raw
    .filter((r) => r.state !== REQUEST_ROW)
    .map((r) => ({
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
    const draft = isDraft(r);
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
  async list(
    state: "open" | "all" | "closed" | "merged",
    branch?: string,
  ): Promise<PullRequestSummary[]> {
    // The host filters open/closed/all; merged and closed-unmerged both live under "closed".
    const filter = state === "merged" ? "closed" : state;
    const list = await this.api.list(`${this.path()}?state=${filter}&sort=recentupdate&limit=100`);
    const rowsOut = list
      .filter((r) => !branch || str(object(r.head).ref) === branch)
      .filter((r) =>
        state === "merged" ? r.merged === true : state === "closed" ? r.merged !== true : true,
      );
    const viewer = this.source.account?.login;
    // The host keeps listing a reviewer under `requested_reviewers` after they review, so the
    // viewer's own review rows decide; only rows that name them are read (usually a handful).
    const requested = new Map<unknown, boolean>();
    if (viewer && state !== "merged" && state !== "closed") {
      await Promise.all(
        rowsOut
          .filter((r) => rows(r.requested_reviewers).some((user) => str(user.login) === viewer))
          .map(async (r) => {
            // A failed read keeps the host's own answer rather than failing the whole list.
            const reviewRows = await this.api
              .list(`${this.path(num(r.number))}/reviews?limit=100`)
              .catch((): ApiObject[] => []);
            const stillRequested = requestedReviewers(r, reviewRows).some(
              (user) => user.login === viewer,
            );
            requested.set(r, stillRequested);
          }),
      );
    }
    return rowsOut.map((r) => ({
      pr: this.pr(r),
      headBranch: str(object(r.head).ref),
      author: author(r.user),
      additions: num(r.additions),
      deletions: num(r.deletions),
      repository: this.source.repository,
      reviewRequested: requested.get(r) ?? false,
      ...(Array.isArray(r.labels) ? { labels: labels(r.labels) } : {}),
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
      // `position` is the new-side line and `original_position` the old-side line of the anchor;
      // an anchor that only has the old-side line sits on the LEFT of the diff.
      isOutdated: !num(c.position) && !num(c.original_position),
      path: str(c.path),
      ...(num(c.position)
        ? { line: num(c.position), side: "RIGHT" }
        : num(c.original_position)
          ? { line: num(c.original_position), side: "LEFT" }
          : {}),
      comments: [comment(c)],
    }));
  }
  /** Reactions by comment id for the newest comments; a failed read leaves that comment out. */
  private async commentReactions(comments: ApiObject[]): Promise<Map<string, PrReaction[]>> {
    const viewer = this.source.account?.login;
    const read = await Promise.all(
      comments.slice(-COMMENT_REACTIONS).map(async (c) => {
        const id = String(c.id);
        try {
          const raw = await this.api.list(
            `${this.repo}/issues/comments/${encodeURIComponent(id)}/reactions`,
          );
          return [[id, reactions(raw, viewer)] as const];
        } catch {
          return [];
        }
      }),
    );
    return new Map(read.flat());
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    const commentRead = this.api.list(`${this.repo}/issues/${number}/comments?limit=100`);
    const [r, comments, commits, rawReviews, checks, events, rawReactions, commentReactions] =
      await Promise.all([
        this.api.json(this.path(number)),
        commentRead,
        this.api.list(`${this.path(number)}/commits?limit=100`),
        this.api.list(`${this.path(number)}/reviews?limit=100`),
        this.checks(number),
        // Optional reads: a failure leaves the matching field absent.
        this.api.list(`${this.repo}/issues/${number}/timeline?limit=100`).catch(() => undefined),
        this.api.list(`${this.repo}/issues/${number}/reactions?limit=100`).catch(() => undefined),
        commentRead
          .then((c) => this.commentReactions(c))
          .catch(() => new Map<string, PrReaction[]>()),
      ]);
    const pr = this.pr(r);
    const status = checksStatus(checks);
    if (status) pr.checksStatus = status;
    const latest = new Map<string, ApiObject>();
    for (const review of rawReviews.toSorted((a, b) =>
      str(a.submitted_at).localeCompare(str(b.submitted_at)),
    ))
      if (review.dismissed !== true && review.stale !== true && review.state !== REQUEST_ROW)
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
        comments: comments.map((c) => {
          const value = comment(c);
          const found = commentReactions.get(value.id);
          return found ? { ...value, reactions: found } : value;
        }),
        reviews: reviews(rawReviews),
        checks,
        labels: labels(r.labels),
        requestedReviewers: requestedReviewers(r, rawReviews),
        // The feed has no opening row; merge and close rows come from the feed itself.
        ...(events
          ? {
              timeline: timeline(
                events,
                lifecycleEvents({ createdAt: str(r.created_at), author: author(r.user) }).filter(
                  (event) => event.kind === "opened",
                ),
              ),
            }
          : {}),
        ...(rawReactions ? { reactions: reactions(rawReactions, this.source.account?.login) } : {}),
      },
    };
  }
  async create(input: GhCreatePrPayload) {
    return this.pr(
      await this.api.json(this.path(), "POST", {
        head: input.branch,
        base: input.baseBranch,
        title: input.isDraft && !WIP_TITLE.test(input.title) ? `WIP: ${input.title}` : input.title,
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
  async editComment(input: ForgeEditPrCommentPayload) {
    await this.api.json(
      `${this.repo}/issues/comments/${encodeURIComponent(input.commentId)}`,
      "PATCH",
      { body: input.body },
    );
  }
  async review(number: number, decision: PrReviewDecision, body: string) {
    const r = await this.api.json(this.path(number));
    await this.api.json(`${this.path(number)}/reviews`, "POST", {
      event: reviewEvent(decision),
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
  async setState(number: number, state: "closed" | "open" | "ready" | "draft") {
    if (state === "closed" || state === "open") {
      await this.api.json(this.path(number), "PATCH", { state });
      return;
    }
    // Drafts are a work-in-progress title prefix on these hosts.
    const r = await this.api.json(this.path(number));
    const title = str(r.title);
    // Already in the requested state: a second prefix, or a stripped title, would be wrong.
    if (isDraft(r) === (state === "draft")) return;
    await this.api.json(this.path(number), "PATCH", {
      title: state === "ready" ? title.replace(READY_TITLE, "") : `WIP: ${title}`,
    });
  }
  async updateBranch(number: number, rebase: boolean) {
    await this.api.json(`${this.path(number)}/update?style=${rebase ? "rebase" : "merge"}`, "POST");
  }
  async labelCandidates(): Promise<ForgePrLabelCandidatesResult> {
    const { raw, truncated } = await repoLabels(this.api, this.repo);
    return { labels: raw.flatMap((r) => label(r) ?? []), truncated };
  }
  async setLabels(number: number, add: string[], remove: string[]) {
    // The host addresses labels by id. The review's own labels also cover organization labels.
    const ids = new Map<string, number>();
    const learn = (list: ApiObject[]) => {
      for (const r of list) if (str(r.name) && num(r.id)) ids.set(str(r.name), num(r.id));
    };
    learn(rows((await this.api.json(this.path(number))).labels));
    if ([...add, ...remove].some((name) => !ids.has(name)))
      learn((await repoLabels(this.api, this.repo)).raw);
    const id = (name: string) => {
      const value = ids.get(name);
      if (!value) throw new Error(msg("forge.labelUnknown"));
      return value;
    };
    // Every name resolves before the first write.
    const added = add.map(id),
      removed = remove.map(id);
    if (added.length)
      await this.api.json(`${this.repo}/issues/${number}/labels`, "POST", { labels: added });
    for (const labelId of removed)
      await this.api.json(`${this.repo}/issues/${number}/labels/${labelId}`, "DELETE");
  }
  async reviewerCandidates(
    number: number,
    query?: string,
  ): Promise<ForgePrReviewerCandidatesResult> {
    const [r, users, teams] = await Promise.all([
      this.api.json(this.path(number)),
      this.api.list(`${this.repo}/reviewers`),
      // Only organization repositories have teams; other repositories answer with an error.
      this.api.list(`${this.repo}/teams`).catch(() => []),
    ]);
    // The host refuses a review request to the pull request's own author.
    const poster = author(r.user).login;
    const needle = query?.toLowerCase();
    const matches = [
      ...users.flatMap((u) => reviewer(u) ?? []),
      ...teams.flatMap((t) => teamReviewer(t) ?? []),
    ].filter(
      (candidate) =>
        (candidate.team || candidate.login !== poster) &&
        (!needle ||
          candidate.login.toLowerCase().includes(needle) ||
          Boolean(candidate.name?.toLowerCase().includes(needle))),
    );
    return {
      reviewers: matches.slice(0, REVIEWER_CANDIDATES),
      truncated: matches.length > REVIEWER_CANDIDATES,
    };
  }
  async requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    const path = `${this.path(number)}/requested_reviewers`;
    if (add.length) await this.api.json(path, "POST", reviewerBody(add));
    if (remove.length) await this.api.json(path, "DELETE", reviewerBody(remove));
  }
  commitDiff(_number: number, commit: string) {
    return this.api.text(`${this.repo}/git/commits/${encodeURIComponent(commit)}.diff`);
  }
  async react(number: number, subjectId: string | undefined, content: string, reacted: boolean) {
    // Removal deletes only the viewer's own reaction of this name, so no id lookup is needed.
    await this.api.json(
      subjectId === undefined
        ? `${this.repo}/issues/${number}/reactions`
        : `${this.repo}/issues/comments/${encodeURIComponent(subjectId)}/reactions`,
      reacted ? "POST" : "DELETE",
      { content },
    );
  }
  async submitDraft(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ) {
    // The host folds an unfinished review's comments into the next submitted one, which would
    // publish line comments the user never saw in this draft.
    const viewer = this.source.account?.login;
    const own = await this.api.list(`${this.path(number)}/reviews?limit=100`);
    if (
      own.some(
        (r) =>
          r.state === "PENDING" &&
          num(r.comments_count) > 0 &&
          (!viewer || str(object(r.user).login) === viewer),
      )
    )
      throw new Error(msg("forge.reviewDraftExists"));
    // One request creates every line comment and submits the review pinned to `commit_id`.
    await this.api.json(`${this.path(number)}/reviews`, "POST", {
      commit_id: input.headSha,
      event: reviewEvent(input.decision),
      body: input.body,
      comments: input.comments.map(draftComment),
    });
  }
}
