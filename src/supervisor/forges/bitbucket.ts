import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
  ForgePrReviewerCandidatesResult,
  ForgeRepository,
  ForgeReviewDraftComment,
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
import { ForgeApi } from "./api";
import {
  author,
  boundedPages,
  inlineAnchor,
  isUser,
  outstandingReviewers,
  reviewer,
  timeline,
} from "./bitbucketMetadata";
import {
  checksStatus,
  encodePath,
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

const LIST_STATES = {
  open: ["OPEN"],
  all: ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
  closed: ["DECLINED", "SUPERSEDED"],
  merged: ["MERGED"],
} as const;
function link(raw: unknown): string {
  return str(object(object(object(raw).links).html).href);
}
function comment(r: ApiObject): PrComment {
  return {
    id: String(r.id),
    author: author(r.user),
    body: str(object(r.content).raw),
    createdAt: str(r.created_on),
    url: link(r),
  };
}

export class BitbucketReview implements ForgeReviewAdapter {
  private readonly repo: string;
  constructor(
    readonly source: ForgeRepository,
    private readonly api: ForgeApi,
  ) {
    this.repo = `repositories/${encodePath(source.repository)}`;
  }
  private path(number?: number) {
    return `${this.repo}/pullrequests${number ? `/${number}` : ""}`;
  }
  private pr(r: ApiObject): PrData {
    const state = str(r.state),
      draft = r.draft === true;
    const participants = rows(r.participants);
    const changes = participants.some((p) => p.state === "changes_requested");
    return {
      source: {
        ...this.source,
        capabilities: {
          ...this.source.capabilities,
          autoFix:
            this.source.capabilities.autoFix &&
            str(object(object(r.source).repository).full_name).toLowerCase() ===
              this.source.repository.toLowerCase(),
        },
      },
      number: requiredNumber(r.id),
      title: str(r.title),
      url: link(r),
      baseBranch: str(object(object(r.destination).branch).name),
      headSha: str(object(object(r.source).commit).hash),
      isDraft: draft,
      state:
        state === "MERGED"
          ? "merged"
          : ["DECLINED", "SUPERSEDED"].includes(state)
            ? "closed"
            : draft
              ? "draft"
              : "open",
      updatedAt: str(r.updated_on),
      viewerDidAuthor: isUser(r.author, this.source.account?.login),
      mergeable: "UNKNOWN",
      mergeStateStatus: draft ? "DRAFT" : changes ? "BLOCKED" : "UNKNOWN",
      ...(changes ? { reviewDecision: "CHANGES_REQUESTED" } : {}),
    };
  }
  async list(
    state: "open" | "all" | "closed" | "merged",
    branch?: string,
  ): Promise<PullRequestSummary[]> {
    const query = new URLSearchParams({
      pagelen: "100",
      sort: "-updated_on",
      // The list representation omits reviewers and participants unless requested.
      fields: "+values.reviewers,+values.participants",
      ...(branch ? { q: `source.branch.name=${JSON.stringify(branch)}` } : {}),
    });
    for (const value of LIST_STATES[state]) query.append("state", value);
    return (await this.api.list(`${this.path()}?${query}`, "values")).map((r) => ({
      pr: this.pr(r),
      headBranch: str(object(object(r.source).branch).name),
      author: author(r.author),
      additions: 0,
      deletions: 0,
      repository: this.source.repository,
      reviewRequested: outstandingReviewers(r).some((a) => isUser(a, this.source.account?.login)),
    }));
  }
  async checks(number: number) {
    return (await this.api.list(`${this.path(number)}/statuses?pagelen=100`, "values")).map((s) =>
      normalizedCheck(str(s.name) || str(s.key), str(s.state), str(s.url)),
    );
  }
  async files(number: number) {
    return (await this.api.list(`${this.path(number)}/diffstat?pagelen=100`, "values")).map(
      (f) => ({
        path: str(object(f.new).path) || str(object(f.old).path),
        additions: num(f.lines_added),
        deletions: num(f.lines_removed),
      }),
    );
  }
  diff(number: number) {
    return this.api.text(`${this.path(number)}/diff`);
  }
  private comments(number: number) {
    return this.api.list(`${this.path(number)}/comments?pagelen=100`, "values");
  }
  async threads(number: number): Promise<PrReviewThread[]> {
    const comments = (await this.comments(number)).filter((c) => c.deleted !== true);
    const groups = new Map<string, ApiObject[]>();
    for (const c of comments) {
      const key = String(object(c.parent).id ?? c.id);
      const group = groups.get(key) ?? [];
      group.push(c);
      groups.set(key, group);
    }
    return [...groups].map(([id, group]) => {
      const root = group.find((c) => !object(c.parent).id) ?? group[0]!;
      const inline = object(root.inline);
      return {
        id,
        isResolved: Boolean(root.resolution),
        isOutdated: false,
        ...(str(inline.path) ? { path: str(inline.path) } : {}),
        // `inline.to` is the new-side line and `inline.from` the old-side line of a removed line.
        ...(num(inline.to)
          ? { line: num(inline.to), side: "RIGHT" }
          : num(inline.from)
            ? { line: num(inline.from), side: "LEFT" }
            : {}),
        comments: group.map(comment),
      };
    });
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    const [r, comments, commits, files, checks, activity] = await Promise.all([
      this.api.json(this.path(number)),
      this.comments(number),
      this.api.list(`${this.path(number)}/commits?pagelen=100`, "values"),
      this.files(number),
      this.checks(number),
      // Optional and bounded: the newest entries hold the latest state changes.
      boundedPages(this.api, `${this.path(number)}/activity?pagelen=50`, 3).then(
        (page) => page.values,
        () => undefined,
      ),
    ]);
    const pr = this.pr(r),
      status = checksStatus(checks);
    if (status) pr.checksStatus = status;
    const reviews: PrReviewSummary[] = rows(r.participants)
      .filter((p) => p.approved === true || p.state === "changes_requested")
      .map((p) => ({
        id: author(p.user).login,
        author: author(p.user),
        state: p.state === "changes_requested" ? "CHANGES_REQUESTED" : "APPROVED",
        body: "",
        submittedAt: str(p.participated_on),
      }));
    return {
      pr,
      details: {
        source: pr.source!,
        number: pr.number,
        title: pr.title,
        body: str(r.description),
        author: author(r.author),
        baseBranch: pr.baseBranch,
        headBranch: str(object(object(r.source).branch).name),
        additions: files.reduce((a, f) => a + f.additions, 0),
        deletions: files.reduce((a, f) => a + f.deletions, 0),
        changedFiles: files.length,
        createdAt: str(r.created_on),
        commits: commits.map((c) => ({
          oid: str(c.hash),
          abbreviatedOid: str(c.hash).slice(0, 7),
          messageHeadline: str(c.message).split("\n")[0] ?? "",
          messageBody: str(c.message),
          authoredDate: str(c.date),
          author: author(object(c.author).user),
          url: link(c),
        })),
        comments: comments.filter((c) => c.deleted !== true && !c.inline && !c.parent).map(comment),
        reviews,
        checks,
        requestedReviewers: outstandingReviewers(r).flatMap((u) => reviewer(u) ?? []),
        ...(activity ? { timeline: timeline(r, activity) } : {}),
      },
    };
  }
  async create(input: GhCreatePrPayload) {
    return this.pr(
      await this.api.json(this.path(), "POST", {
        title: input.title,
        description: input.body,
        source: { branch: { name: input.branch } },
        destination: { branch: { name: input.baseBranch } },
        draft: input.isDraft,
        close_source_branch: false,
      }),
    );
  }
  async edit(input: ForgeEditPrPayload) {
    await this.api.json(this.path(input.prNumber), "PUT", {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { description: input.body } : {}),
      ...(input.baseBranch !== undefined
        ? { destination: { branch: { name: input.baseBranch } } }
        : {}),
    });
  }
  async comment(number: number, body: string) {
    return comment(
      await this.api.json(`${this.path(number)}/comments`, "POST", { content: { raw: body } }),
    );
  }
  async editComment(input: ForgeEditPrCommentPayload) {
    await this.api.json(
      `${this.path(input.prNumber)}/comments/${encodeURIComponent(input.commentId)}`,
      "PUT",
      { content: { raw: input.body } },
    );
  }
  async review(number: number, decision: PrReviewDecision, body: string) {
    if (decision === "comment") {
      await this.comment(number, body);
      return;
    }
    await this.api.json(
      `${this.path(number)}/${decision === "approve" ? "approve" : "request-changes"}`,
      "POST",
    );
    if (body.trim()) {
      try {
        await this.comment(number, body);
      } catch {
        throw new Error(msg("forge.reviewPartial"));
      }
    }
  }
  async merge(number: number, method: PrMergeMethod, expectedHeadSha?: string) {
    if (expectedHeadSha) unsupported(this.source);
    await this.api.json(`${this.path(number)}/merge`, "POST", {
      merge_strategy:
        method === "merge" ? "merge_commit" : method === "rebase" ? "rebase_merge" : "squash",
      close_source_branch: false,
    });
  }
  async setState(number: number, state: "closed" | "open" | "ready" | "draft") {
    if (state === "open") unsupported(this.source);
    if (state === "closed") await this.api.json(`${this.path(number)}/decline`, "POST", {});
    else await this.api.json(this.path(number), "PUT", { draft: state === "draft" });
  }
  async reviewerCandidates(
    number: number,
    query?: string,
  ): Promise<ForgePrReviewerCandidatesResult> {
    const workspace = this.source.repository.split("/")[0] ?? "";
    const [r, members] = await Promise.all([
      this.api.json(this.path(number)),
      boundedPages(this.api, `workspaces/${encodeURIComponent(workspace)}/members?pagelen=100`, 3),
    ]);
    // Bitbucket refuses the author as a reviewer; members have no host-side name search.
    const owner = str(object(r.author).uuid),
      needle = query?.toLowerCase();
    const matches = members.values.flatMap((m) => {
      const value = reviewer(m.user);
      if (!value || value.id === owner) return [];
      return !needle ||
        [value.login, value.name ?? ""].some((t) => t.toLowerCase().includes(needle))
        ? [value]
        : [];
    });
    return {
      reviewers: matches.slice(0, 50),
      truncated: members.truncated || matches.length > 50,
    };
  }
  /** Bitbucket replaces the whole reviewer list, so the current one is read first. */
  async requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    if ([...add, ...remove].some((ref) => ref.team)) unsupported(this.source);
    const r = await this.api.json(this.path(number));
    const ids = new Set(rows(r.reviewers).map((u) => str(u.uuid)));
    for (const ref of add) ids.add(ref.id);
    for (const ref of remove) ids.delete(ref.id);
    ids.delete("");
    await this.api.json(this.path(number), "PUT", {
      title: str(r.title),
      reviewers: [...ids].map((uuid) => ({ uuid })),
    });
  }
  /** A single-commit spec diffs that commit against its first parent. */
  commitDiff(number: number, commit: string) {
    return this.api.text(`${this.repo}/diff/${encodeURIComponent(commit)}`);
  }
  /**
   * Not atomic: each line comment, then the decision, then the summary are separate
   * writes. Bitbucket comments cannot pin `headSha`; the service already checked it.
   */
  async submitDraft(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ) {
    let wrote = false;
    const post = async (path: string, body?: unknown) => {
      await this.api.json(`${this.path(number)}/${path}`, "POST", body);
      wrote = true;
    };
    try {
      for (const c of input.comments)
        await post("comments", { content: { raw: c.body }, inline: inlineAnchor(c) });
      if (input.decision !== "comment")
        await post(input.decision === "approve" ? "approve" : "request-changes");
      if (input.body.trim()) await post("comments", { content: { raw: input.body } });
    } catch (error) {
      if (wrote) throw new Error(msg("forge.reviewDraftPartial"), { cause: error });
      throw error;
    }
  }
  async updateBranch(): Promise<void> {
    unsupported(this.source);
  }
}
