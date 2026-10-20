import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
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
import { ForgeApi, ForgeHttpError } from "./api";
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

const author = (raw: unknown): PrAuthor => {
  const r = object(raw);
  return {
    login: str(r.username) || str(r.name),
    ...(str(r.avatar_url) ? { avatarUrl: str(r.avatar_url) } : {}),
  };
};
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
    };
  }
  async list(state: "open" | "all", branch?: string): Promise<PullRequestSummary[]> {
    const q = new URLSearchParams({
      state: state === "open" ? "opened" : "all",
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
          ...(str(position.new_path) ? { path: str(position.new_path) } : {}),
          ...(num(position.new_line) ? { line: num(position.new_line) } : {}),
          comments: notes.map(comment),
        };
      });
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    const [r, notes, commits, files, checks, approvals] = await Promise.all([
      this.api.json(this.path(number)),
      this.api.list(`${this.path(number)}/notes?per_page=100&sort=asc`),
      this.api.list(`${this.path(number)}/commits?per_page=100`),
      this.files(number),
      this.checks(number),
      this.api.json(`${this.path(number)}/approvals`).catch((error): ApiObject => {
        if (error instanceof ForgeHttpError && error.status === 404) return {};
        throw error;
      }),
    ]);
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
        createdAt: str(r.created_at),
        mergedAt: str(r.merged_at) || null,
        closedAt: str(r.closed_at) || null,
        commits: commits.map((c) => ({
          oid: str(c.id),
          abbreviatedOid: str(c.short_id),
          messageHeadline: str(c.title),
          messageBody: str(c.message),
          authoredDate: str(c.authored_date),
          author: { login: str(c.author_name) },
          url: str(c.web_url),
        })),
        comments: notes.filter((n) => n.system !== true && !n.position).map(comment),
        reviews,
        checks,
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
  async setState(number: number, state: "closed" | "open" | "ready") {
    const r = state === "ready" ? await this.api.json(this.path(number)) : null;
    await this.api.json(
      this.path(number),
      "PUT",
      r
        ? { title: str(r.title).replace(/^(?:draft:|wip:|\[draft\]|\(draft\))\s*/i, "") }
        : { state_event: state === "open" ? "reopen" : "close" },
    );
  }
  async updateBranch(number: number, rebase: boolean) {
    if (!rebase) unsupported(this.source);
    await this.api.json(`${this.path(number)}/rebase`, "PUT");
  }
}
