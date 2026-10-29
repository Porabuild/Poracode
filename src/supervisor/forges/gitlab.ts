import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
  ForgeRepository,
  ForgeReviewerRef,
  GhCreatePrPayload,
  GhGetPrDetailsResult,
  PrComment,
  PrData,
  PrMergeMethod,
  PrReviewDecision,
  PrReviewSummary,
  PrReviewThread,
  PullRequestSummary,
} from "@/shared/contracts";
import { ForgeApi, ForgeHttpError } from "./api";
import {
  gitlabAuthor as author,
  gitlabLabels,
  gitlabReactions,
  gitlabReviewers,
  gitlabTimeline,
  gitlabUnifiedDiff,
} from "./gitlabMetadata";
import {
  gitlabLabelCandidates,
  gitlabReact,
  gitlabRequestReviewers,
  gitlabReviewerCandidates,
  gitlabSetLabels,
  gitlabSubmitDraft,
  type GitLabTarget,
} from "./gitlabWrites";
import {
  assertHead,
  checksStatus,
  normalizedCheck,
  num,
  object,
  requiredNumber,
  rows,
  str,
  unsupported,
  type ApiObject,
  type ForgeReviewAdapter,
} from "./types";

const LIST_STATES = { open: "opened", all: "all", closed: "closed", merged: "merged" } as const;
const DRAFT_PREFIX = /^(?:draft:|wip:|\[draft\]|\(draft\))\s*/i;
/** Newest comments whose award emoji `details()` reads; each one costs a request. */
const COMMENT_REACTION_LIMIT = 20;
function comment(r: ApiObject): PrComment {
  return {
    id: String(r.id),
    author: author(r.author),
    body: str(r.body),
    createdAt: str(r.created_at),
  };
}
function lineCounts(diff: string): { additions: number; deletions: number } {
  let additions = 0,
    deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  return { additions, deletions };
}

export class GitLabReview implements ForgeReviewAdapter {
  private readonly project: string;
  constructor(
    readonly source: ForgeRepository,
    private readonly api: ForgeApi,
  ) {
    this.project = `projects/${encodeURIComponent(source.repository)}`;
  }
  private path(number?: number): string {
    return `${this.project}/merge_requests${number ? `/${number}` : ""}`;
  }

  private pr(r: ApiObject): PrData {
    const draft = r.draft === true || r.work_in_progress === true;
    const status = str(r.detailed_merge_status);
    const conflict = r.has_conflicts === true || status === "conflict";
    const state = str(r.state);
    const pipeline = object(r.head_pipeline);
    const checks = str(pipeline.status)
      ? checksStatus([normalizedCheck("Pipeline", str(pipeline.status))])
      : undefined;
    return {
      source: {
        ...this.source,
        capabilities: {
          ...this.source.capabilities,
          autoFix:
            this.source.capabilities.autoFix &&
            num(r.source_project_id) > 0 &&
            r.source_project_id === r.target_project_id,
        },
      },
      number: requiredNumber(r.iid),
      title: str(r.title),
      url: str(r.web_url),
      state:
        state === "merged" ? "merged" : state === "closed" ? "closed" : draft ? "draft" : "open",
      isDraft: draft,
      baseBranch: str(r.target_branch),
      ...(str(r.sha) ? { headSha: str(r.sha) } : {}),
      updatedAt: str(r.updated_at),
      viewerDidAuthor: author(r.author).login === this.source.account?.login,
      mergeable: conflict
        ? "CONFLICTING"
        : status === "mergeable" || status === "can_be_merged"
          ? "MERGEABLE"
          : "UNKNOWN",
      mergeStateStatus: conflict
        ? "DIRTY"
        : draft
          ? "DRAFT"
          : status === "mergeable" || status === "can_be_merged"
            ? "CLEAN"
            : status === "need_rebase"
              ? "BEHIND"
              : ["checking", "unchecked", "preparing", "approvals_syncing", ""].includes(status)
                ? "UNKNOWN"
                : "BLOCKED",
      ...(status === "not_approved"
        ? { reviewDecision: "REVIEW_REQUIRED" }
        : status === "requested_changes"
          ? { reviewDecision: "CHANGES_REQUESTED" }
          : {}),
      ...(checks ? { checksStatus: checks } : {}),
    };
  }
  private summary(r: ApiObject): PullRequestSummary {
    return {
      pr: this.pr(r),
      headBranch: str(r.source_branch),
      author: author(r.author),
      additions: 0,
      deletions: 0,
      repository: this.source.repository,
      reviewRequested: rows(r.reviewers).some(
        (user) => str(user.username) === this.source.account?.login,
      ),
      ...(Array.isArray(r.labels) ? { labels: gitlabLabels(r.labels) } : {}),
    };
  }
  async list(
    state: "open" | "all" | "closed" | "merged",
    branch?: string,
  ): Promise<PullRequestSummary[]> {
    // GitLab's "closed" state already excludes merged requests.
    const q = new URLSearchParams({
      state: LIST_STATES[state],
      with_labels_details: "true",
      per_page: "100",
      order_by: "updated_at",
      sort: "desc",
      ...(branch ? { source_branch: branch } : {}),
    });
    return (await this.api.list(`${this.path()}?${q}`)).map((r) => this.summary(r));
  }
  async checks(number: number) {
    const r = await this.api.json(this.path(number));
    const pipeline = object(r.head_pipeline);
    if (!num(pipeline.id)) return [];
    const jobs = await this.api.list(
      `${num(pipeline.project_id) ? `projects/${num(pipeline.project_id)}` : this.project}/pipelines/${num(pipeline.id)}/jobs?per_page=100&include_retried=false`,
    );
    return [
      normalizedCheck("Pipeline", str(pipeline.status), str(pipeline.web_url)),
      ...jobs.map((job) => ({
        ...normalizedCheck(
          str(job.name),
          job.allow_failure === true && ["manual", "failed", "canceled"].includes(str(job.status))
            ? "skipped"
            : str(job.status),
          str(job.web_url),
        ),
        ...(str(job.started_at) ? { startedAt: str(job.started_at) } : {}),
        ...(str(job.finished_at) ? { completedAt: str(job.finished_at) } : {}),
      })),
    ];
  }
  async files(number: number) {
    const diffs = await this.api.list(`${this.path(number)}/diffs?per_page=100`);
    if (diffs.some((r) => r.too_large === true || r.collapsed === true))
      throw new Error(msg("forge.diffUnavailable"));
    return diffs.map((r) => ({
      path: str(r.new_path) || str(r.old_path),
      ...lineCounts(str(r.diff)),
    }));
  }
  diff(number: number) {
    return this.api.text(`${this.path(number)}/raw_diffs`);
  }
  async threads(number: number): Promise<PrReviewThread[]> {
    const discussions = await this.api.list(`${this.path(number)}/discussions?per_page=100`);
    return discussions
      .filter((d) => d.individual_note !== true)
      .map((d) => {
        const notes = rows(d.notes).filter((n) => n.system !== true);
        const first = notes[0] ?? {};
        const position = object(first.position);
        return {
          id: str(d.id),
          isResolved:
            notes.some((n) => n.resolvable === true) &&
            notes.filter((n) => n.resolvable === true).every((n) => n.resolved === true),
          isOutdated: first.position !== null && Boolean(first.position) && !position.head_sha,
          ...(str(position.new_path) || str(position.old_path)
            ? { path: str(position.new_path) || str(position.old_path) }
            : {}),
          // A removed line has only `old_line`; a context line has both and is drawn on the new side.
          ...(num(position.new_line)
            ? { line: num(position.new_line), side: "RIGHT" }
            : num(position.old_line)
              ? { line: num(position.old_line), side: "LEFT" }
              : {}),
          comments: notes.map(comment),
        };
      });
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    // Label details, events, and award emoji are optional: a failed read leaves the field absent.
    const optional = <T>(read: Promise<T>) => read.catch(() => undefined);
    const [r, notes, commits, files, checks, approvals, labeled, stateEvents, labelEvents, awards] =
      await Promise.all([
        this.api.json(this.path(number)),
        this.api.list(`${this.path(number)}/notes?per_page=100&sort=asc`),
        this.api.list(`${this.path(number)}/commits?per_page=100`),
        this.files(number),
        this.checks(number),
        this.api.json(`${this.path(number)}/approvals`).catch((error): ApiObject => {
          if (error instanceof ForgeHttpError && error.status === 404) return {};
          throw error;
        }),
        // The single-request endpoint returns label names only; the list endpoint adds details.
        optional(this.api.value(`${this.path()}?iids[]=${number}&with_labels_details=true`)),
        optional(this.api.list(`${this.path(number)}/resource_state_events?per_page=100`)),
        optional(this.api.list(`${this.path(number)}/resource_label_events?per_page=100`)),
        optional(this.api.list(`${this.path(number)}/award_emoji?per_page=100`)),
      ]);
    const viewer = this.source.account?.login;
    const comments = notes.filter((n) => n.system !== true && !n.position).map(comment);
    const commentAwards = await Promise.all(
      comments.map((c, index) =>
        index < comments.length - COMMENT_REACTION_LIMIT
          ? Promise.resolve(undefined)
          : optional(
              this.api.list(
                `${this.path(number)}/notes/${encodeURIComponent(c.id)}/award_emoji?per_page=100`,
              ),
            ),
      ),
    );
    for (const [index, c] of comments.entries()) {
      const awarded = commentAwards[index];
      if (awarded) c.reactions = gitlabReactions(awarded, viewer);
    }
    const labelDetails = rows(labeled).find((m) => m.iid === number);
    const reviews: PrReviewSummary[] = rows(approvals.approved_by).map((a) => {
      const user = object(a.user);
      return {
        id: `approval:${String(user.id)}`,
        author: author(user),
        state: "APPROVED",
        body: "",
      };
    });
    const pr = this.pr(r);
    const checkStatus = checksStatus(checks);
    if (checkStatus) pr.checksStatus = checkStatus;
    if (num(approvals.approvals_left) > 0) {
      pr.reviewDecision = "REVIEW_REQUIRED";
      pr.mergeStateStatus = "BLOCKED";
    }
    const createdAt = str(r.created_at),
      mergedAt = str(r.merged_at) || null,
      closedAt = str(r.closed_at) || null;
    return {
      pr,
      details: {
        source: pr.source!,
        number: pr.number,
        title: pr.title,
        body: str(r.description),
        author: author(r.author),
        baseBranch: pr.baseBranch,
        headBranch: str(r.source_branch),
        additions: files.reduce((a, f) => a + f.additions, 0),
        deletions: files.reduce((a, f) => a + f.deletions, 0),
        changedFiles: files.length,
        createdAt,
        mergedAt,
        closedAt,
        commits: commits.map((c) => ({
          oid: str(c.id),
          abbreviatedOid: str(c.short_id),
          messageHeadline: str(c.title),
          messageBody: str(c.message),
          authoredDate: str(c.authored_date),
          author: { login: str(c.author_name) },
          url: str(c.web_url),
        })),
        comments,
        reviews,
        checks,
        labels: gitlabLabels(labelDetails ? labelDetails.labels : r.labels),
        // GitLab keeps reviewers listed after they review; all listed reviewers stay requested.
        requestedReviewers: gitlabReviewers(r.reviewers),
        ...(stateEvents && labelEvents
          ? {
              timeline: gitlabTimeline({
                createdAt,
                author: author(r.author),
                mergedAt,
                mergedBy: str(object(r.merge_user ?? r.merged_by).username)
                  ? author(r.merge_user ?? r.merged_by)
                  : null,
                closedAt,
                stateEvents,
                labelEvents,
                notes,
              }),
            }
          : {}),
        ...(awards ? { reactions: gitlabReactions(awards, viewer) } : {}),
      },
    };
  }
  async create(input: GhCreatePrPayload) {
    const r = await this.api.json(this.path(), "POST", {
      source_branch: input.branch,
      target_branch: input.baseBranch,
      title: input.isDraft && !/^draft:/i.test(input.title) ? `Draft: ${input.title}` : input.title,
      description: input.body,
    });
    return this.pr(r);
  }
  async edit(input: ForgeEditPrPayload) {
    await this.api.json(this.path(input.prNumber), "PUT", {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { description: input.body } : {}),
      ...(input.baseBranch !== undefined ? { target_branch: input.baseBranch } : {}),
    });
  }
  async comment(number: number, body: string) {
    return comment(await this.api.json(`${this.path(number)}/notes`, "POST", { body }));
  }
  async editComment(input: ForgeEditPrCommentPayload) {
    await this.api.json(
      `${this.path(input.prNumber)}/notes/${encodeURIComponent(input.commentId)}`,
      "PUT",
      { body: input.body },
    );
  }
  async review(number: number, decision: PrReviewDecision, body: string) {
    if (decision === "request-changes") unsupported(this.source);
    if (decision === "comment") {
      await this.comment(number, body);
      return;
    }
    const r = await this.api.json(this.path(number));
    await this.api.json(`${this.path(number)}/approve`, "POST", { sha: assertHead(str(r.sha)) });
    if (body.trim()) {
      try {
        await this.comment(number, body);
      } catch {
        throw new Error(msg("forge.reviewPartial"));
      }
    }
  }
  async merge(number: number, method: PrMergeMethod, expectedHeadSha?: string) {
    if (method === "rebase") unsupported(this.source);
    const r = await this.api.json(this.path(number));
    await this.api.json(`${this.path(number)}/merge`, "PUT", {
      sha: assertHead(str(r.sha), expectedHeadSha),
      squash: method === "squash",
      should_remove_source_branch: false,
    });
  }
  async setState(number: number, state: "closed" | "open" | "ready" | "draft") {
    if (state === "closed" || state === "open") {
      await this.api.json(this.path(number), "PUT", {
        state_event: state === "open" ? "reopen" : "close",
      });
      return;
    }
    // GitLab's draft status is the title prefix.
    const r = await this.api.json(this.path(number));
    const title = str(r.title);
    if (state === "ready") {
      await this.api.json(this.path(number), "PUT", { title: title.replace(DRAFT_PREFIX, "") });
      return;
    }
    if (r.draft === true || r.work_in_progress === true || DRAFT_PREFIX.test(title)) return;
    await this.api.json(this.path(number), "PUT", { title: `Draft: ${title}` });
  }
  async updateBranch(number: number, rebase: boolean) {
    if (!rebase) unsupported(this.source);
    await this.api.json(`${this.path(number)}/rebase`, "PUT");
  }
  private target(number?: number): GitLabTarget {
    return { api: this.api, source: this.source, project: this.project, review: this.path(number) };
  }
  labelCandidates() {
    return gitlabLabelCandidates(this.target());
  }
  setLabels(number: number, add: string[], remove: string[]) {
    return gitlabSetLabels(this.target(number), add, remove);
  }
  reviewerCandidates(number: number, query?: string) {
    return gitlabReviewerCandidates(this.target(number), query);
  }
  requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    return gitlabRequestReviewers(this.target(number), add, remove);
  }
  async commitDiff(number: number, commit: string) {
    const files = await this.api.list(
      `${this.project}/repository/commits/${encodeURIComponent(commit)}/diff?per_page=100`,
    );
    if (files.some((r) => r.too_large === true || r.collapsed === true))
      throw new Error(msg("forge.diffUnavailable"));
    return gitlabUnifiedDiff(files);
  }
  react(number: number, subjectId: string | undefined, content: string, reacted: boolean) {
    return gitlabReact(this.target(number), subjectId, content, reacted);
  }
  submitDraft(number: number, input: Parameters<typeof gitlabSubmitDraft>[1]) {
    return gitlabSubmitDraft(this.target(number), input);
  }
}
