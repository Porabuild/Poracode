import { msg } from "@/shared/messages";
import type {
  ForgeEditPrPayload,
  ForgeRepository,
  ForgeReviewDraftComment,
  ForgeReviewerRef,
  GhCreatePrPayload,
  GhGetPrDetailsResult,
  PrComment,
  PrData,
  PrFile,
  PrMergeMethod,
  PrReviewDecision,
  PrReviewSummary,
  PrReviewThread,
  ProjectLocation,
  PullRequestSummary,
} from "@/shared/contracts";
import { ForgeApi } from "./api";
import { ForgeRuntime } from "./runtime";
import {
  AZURE_LIST_STATUS,
  AzureReviewMetadata,
  author,
  azureLabels,
  azureRequestedReviewers,
  azureTimeline,
} from "./azureMetadata";
import {
  assertHead,
  checksStatus,
  normalizedCheck,
  num,
  object,
  requiredNumber,
  requiredString,
  rows,
  str,
  unsupported,
  type ApiObject,
  type ForgeReviewAdapter,
} from "./types";

function comment(r: ApiObject, thread: string): PrComment {
  return {
    id: `${thread}:${String(r.id)}`,
    author: author(r.author),
    body: str(r.content),
    createdAt: str(r.publishedDate),
  };
}
const branch = (value: unknown) => str(value).replace(/^refs\/heads\//, "");

export type AzurePatches = { files: PrFile[]; diff: string };

export class AzureReview implements ForgeReviewAdapter {
  private readonly project: string;
  private readonly repo: string;
  private readonly metadata: AzureReviewMetadata;
  constructor(
    readonly source: ForgeRepository,
    private readonly api: ForgeApi,
    private readonly runtime: ForgeRuntime,
    private readonly location: ProjectLocation,
    private readonly pendingPatches = new Map<string, Promise<AzurePatches>>(),
  ) {
    const [project, repo] = source.repository.split("/");
    if (!project || !repo) throw new Error(msg("forge.responseInvalid"));
    this.project = encodeURIComponent(project);
    this.repo = `${this.project}/_apis/git/repositories/${encodeURIComponent(repo)}`;
    this.metadata = new AzureReviewMetadata({
      api,
      project: this.project,
      url: (path, query) => this.url(path, query),
      review: (number) => this.path(number),
    });
  }
  private path(number?: number) {
    return `${this.repo}/pullRequests${number ? `/${number}` : ""}`;
  }
  private url(path: string, query: Record<string, string> = {}) {
    return `${path}?${new URLSearchParams({ "api-version": "7.1", ...query })}`;
  }
  private pr(r: ApiObject): PrData {
    const draft = r.isDraft === true;
    return {
      source: {
        ...this.source,
        capabilities: {
          ...this.source.capabilities,
          autoFix: this.source.capabilities.autoFix && r.forkSource == null,
        },
      },
      number: requiredNumber(r.pullRequestId),
      title: str(r.title),
      url: `${this.source.host}/${this.project}/_git/${encodeURIComponent(this.source.repository.split("/")[1]!)}/pullrequest/${num(r.pullRequestId)}`,
      baseBranch: branch(r.targetRefName),
      headSha: str(object(r.lastMergeSourceCommit).commitId),
      isDraft: draft,
      state:
        r.status === "completed"
          ? "merged"
          : r.status === "abandoned"
            ? "closed"
            : draft
              ? "draft"
              : "open",
      updatedAt: str(r.closedDate) || str(r.creationDate),
      viewerDidAuthor: author(r.createdBy).login === this.source.account?.login,
      mergeable:
        r.mergeStatus === "conflicts"
          ? "CONFLICTING"
          : r.mergeStatus === "succeeded"
            ? "MERGEABLE"
            : "UNKNOWN",
      mergeStateStatus: draft ? "DRAFT" : r.mergeStatus === "conflicts" ? "DIRTY" : "UNKNOWN",
    };
  }
  async list(
    state: "open" | "all" | "closed" | "merged",
    head?: string,
  ): Promise<PullRequestSummary[]> {
    const items: ApiObject[] = [];
    for (let skip = 0; skip < 10000; skip += 100) {
      const page = rows(
        (
          await this.api.json(
            this.url(this.path(), {
              "searchCriteria.status": AZURE_LIST_STATUS[state],
              $top: "100",
              $skip: String(skip),
              ...(head ? { "searchCriteria.sourceRefName": `refs/heads/${head}` } : {}),
            }),
          )
        ).value,
      );
      items.push(...page);
      if (page.length < 100) break;
      if (skip === 9900) throw new Error(msg("forge.pagination"));
    }
    // Labels only when the list carries them; no per-review label reads.
    return items.map((r) => ({
      pr: this.pr(r),
      ...(Array.isArray(r.labels) ? { labels: azureLabels(r.labels) } : {}),
      headBranch: branch(r.sourceRefName),
      author: author(r.createdBy),
      additions: 0,
      deletions: 0,
      repository: this.source.repository,
      reviewRequested: rows(r.reviewers).some(
        (user) => author(user).login === this.source.account?.login && num(user.vote) === 0,
      ),
    }));
  }
  private async policies(number: number, r: ApiObject) {
    const projectId = requiredString(object(object(r.repository).project).id);
    return this.api.list(
      this.url(`${this.project}/_apis/policy/evaluations`, {
        "api-version": "7.1-preview.1",
        artifactId: `vstfs:///CodeReview/CodeReviewId/${projectId}/${number}`,
      }),
      "value",
    );
  }
  async checks(number: number) {
    const r = await this.api.json(this.url(this.path(number)));
    const [statuses, policies] = await Promise.all([
      this.api.list(this.url(`${this.path(number)}/statuses`), "value"),
      this.policies(number, r),
    ]);
    const latest = new Map<string, ApiObject>();
    for (const status of statuses.toSorted((a, b) => num(a.id) - num(b.id)))
      latest.set(
        `${str(object(status.context).genre)}/${str(object(status.context).name)}`,
        status,
      );
    return [
      ...[...latest].map(([name, s]) => normalizedCheck(name, str(s.state), str(s.targetUrl))),
      ...policies
        .filter(
          (p) =>
            object(p.configuration).isEnabled !== false &&
            object(p.configuration).isBlocking === true,
        )
        .map((p) =>
          normalizedCheck(
            str(object(object(p.configuration).type).displayName) || "Policy",
            str(p.status),
          ),
        ),
    ];
  }
  private rawThreads(number: number) {
    return this.api.list(this.url(`${this.path(number)}/threads`), "value");
  }
  async threads(number: number): Promise<PrReviewThread[]> {
    return this.reviewThreads(await this.rawThreads(number));
  }
  private reviewThreads(raw: ApiObject[]): PrReviewThread[] {
    return raw
      .filter((t) => t.isDeleted !== true)
      .map((t) => {
        const context = object(t.threadContext);
        return {
          id: String(t.id),
          isResolved: ["fixed", "wontFix", "closed", "byDesign"].includes(str(t.status)),
          isOutdated: false,
          ...(str(context.filePath) ? { path: str(context.filePath).replace(/^\//, "") } : {}),
          // A thread on a removed line has only `leftFileStart`; the new side wins when both exist.
          ...(num(object(context.rightFileStart).line)
            ? { line: num(object(context.rightFileStart).line), side: "RIGHT" }
            : num(object(context.leftFileStart).line)
              ? { line: num(object(context.leftFileStart).line), side: "LEFT" }
              : {}),
          comments: rows(t.comments)
            .filter((c) => c.isDeleted !== true && c.commentType !== "system")
            .map((c) => comment(c, String(t.id))),
        };
      });
  }
  private async patches(number: number): Promise<AzurePatches> {
    const r = await this.api.json(this.url(this.path(number)));
    return this.sharedPatches(
      assertHead(str(object(r.lastMergeTargetCommit).commitId)),
      assertHead(str(object(r.lastMergeSourceCommit).commitId)),
    );
  }
  /** Concurrent reads of the same base/head range share one computation. */
  private async sharedPatches(base: string, head: string): Promise<AzurePatches> {
    const key = JSON.stringify([
      this.location,
      this.source.host,
      this.source.repository,
      this.source.account,
      base,
      head,
    ]);
    const existing = this.pendingPatches.get(key);
    if (existing) return existing;
    const pending = this.computePatches(base, head);
    this.pendingPatches.set(key, pending);
    try {
      return await pending;
    } finally {
      this.pendingPatches.delete(key);
    }
  }
  private async computePatches(base: string, head: string): Promise<AzurePatches> {
    const changes: ApiObject[] = [];
    let common = base;
    for (let skip = 0; skip < 10000; skip += 1000) {
      const page = await this.api.json(
        this.url(`${this.repo}/diffs/commits`, {
          baseVersion: base,
          baseVersionType: "commit",
          targetVersion: head,
          targetVersionType: "commit",
          diffCommonCommit: "true",
          $top: "1000",
          $skip: String(skip),
        }),
      );
      common = requiredString(page.commonCommit);
      const batch = rows(page.changes);
      changes.push(...batch);
      if (page.allChangesIncluded === true || batch.length < 1000) break;
      if (skip === 9000) throw new Error(msg("forge.diffUnavailable"));
    }
    const files: PrFile[] = [];
    const patches: string[] = [];
    for (const change of changes) {
      const item = object(change.item);
      if (item.isFolder === true || item.gitObjectType === "tree") continue;
      const path = requiredString(item.path).replace(/^\//, "");
      const kind = str(change.changeType).toLowerCase();
      const content = async (file: string, sha: string) => {
        const contentItem = await this.api.json(
          this.url(`${this.repo}/items`, {
            path: file,
            "versionDescriptor.version": sha,
            "versionDescriptor.versionType": "commit",
            $format: "json",
            includeContent: "true",
          }),
        );
        if (typeof contentItem.content !== "string") throw new Error(msg("forge.diffUnavailable"));
        return contentItem.content;
      };
      const [before, after] = await Promise.all([
        kind.includes("add") ? null : content(str(change.originalPath) || `/${path}`, common),
        kind.includes("delete") ? null : content(`/${path}`, head),
      ]);
      const patch = await this.runtime.patch(
        this.location,
        path,
        before,
        after,
        str(change.originalPath).replace(/^\//, "") || path,
      );
      let additions = 0,
        deletions = 0;
      for (const line of patch.split("\n")) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
      files.push({ path, additions, deletions });
      patches.push(patch);
    }
    return { files, diff: patches.join("") };
  }
  async files(number: number) {
    return (await this.patches(number)).files;
  }
  async diff(number: number) {
    return (await this.patches(number)).diff;
  }
  /** The commit against its first parent, which is also their merge base. */
  async commitDiff(number: number, commit: string) {
    const raw = await this.api.json(this.url(`${this.repo}/commits/${encodeURIComponent(commit)}`));
    const parent = Array.isArray(raw.parents) ? str(raw.parents[0]) : "";
    if (!parent) throw new Error(msg("forge.diffUnavailable"));
    return (await this.sharedPatches(parent, commit)).diff;
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    const [r, rawThreads, commits, checks, files, labels] = await Promise.all([
      this.api.json(this.url(this.path(number))),
      this.rawThreads(number),
      this.api.list(this.url(`${this.path(number)}/commits`), "value"),
      this.checks(number),
      this.files(number),
      this.metadata.labels(number),
    ]);
    const threads = this.reviewThreads(rawThreads);
    const pr = this.pr(r),
      status = checksStatus(checks);
    if (status) pr.checksStatus = status;
    const reviewers = rows(r.reviewers);
    const changes = reviewers.some((v) => num(v.vote) < 0),
      required = reviewers.some((v) => v.isRequired === true && num(v.vote) < 5);
    if (changes || required) {
      pr.reviewDecision = changes ? "CHANGES_REQUESTED" : "REVIEW_REQUIRED";
      pr.mergeStateStatus = "BLOCKED";
    } else if (pr.mergeable === "MERGEABLE")
      pr.mergeStateStatus =
        status === "FAILURE" ? "BLOCKED" : status === "PENDING" ? "BLOCKED" : "CLEAN";
    const reviews: PrReviewSummary[] = reviewers
      .filter((v) => num(v.vote) !== 0)
      .map((v) => ({
        id: str(v.id),
        author: author(v),
        state: num(v.vote) >= 5 ? "APPROVED" : "CHANGES_REQUESTED",
        body: "",
      }));
    return {
      pr,
      details: {
        source: pr.source!,
        number: pr.number,
        title: pr.title,
        body: str(r.description),
        author: author(r.createdBy),
        baseBranch: pr.baseBranch,
        headBranch: branch(r.sourceRefName),
        createdAt: str(r.creationDate),
        additions: files.reduce((a, f) => a + f.additions, 0),
        deletions: files.reduce((a, f) => a + f.deletions, 0),
        changedFiles: files.length,
        commits: commits.map((c) => ({
          oid: str(c.commitId),
          abbreviatedOid: str(c.commitId).slice(0, 7),
          messageHeadline: str(c.comment).split("\n")[0] ?? "",
          messageBody: str(c.comment),
          authoredDate: str(object(c.author).date),
          author: { login: str(object(c.author).name) },
        })),
        comments: threads.filter((t) => !t.path).flatMap((t) => t.comments),
        reviews,
        checks,
        ...(labels ? { labels } : {}),
        requestedReviewers: azureRequestedReviewers(reviewers),
        timeline: azureTimeline(r, rawThreads),
      },
    };
  }
  async create(input: GhCreatePrPayload) {
    return this.pr(
      await this.api.json(this.url(this.path()), "POST", {
        sourceRefName: `refs/heads/${input.branch}`,
        targetRefName: `refs/heads/${input.baseBranch}`,
        title: input.title,
        description: input.body,
        isDraft: input.isDraft,
      }),
    );
  }
  async edit(input: ForgeEditPrPayload) {
    await this.api.json(this.url(this.path(input.prNumber)), "PATCH", {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { description: input.body } : {}),
      ...(input.baseBranch !== undefined
        ? { targetRefName: `refs/heads/${input.baseBranch}` }
        : {}),
    });
  }
  async comment(number: number, body: string) {
    const r = await this.api.json(this.url(`${this.path(number)}/threads`), "POST", {
      comments: [{ parentCommentId: 0, content: body, commentType: 1 }],
      status: 1,
    });
    const first = rows(r.comments)[0];
    if (!first) throw new Error(msg("forge.responseInvalid"));
    return comment(first, String(r.id));
  }
  async review(number: number, decision: PrReviewDecision, body: string) {
    if (decision === "comment") {
      await this.comment(number, body);
      return;
    }
    const identity = object(
      (await this.api.json("_apis/connectionData?api-version=7.1-preview.1")).authenticatedUser,
    );
    const id = requiredString(identity.id);
    await this.api.json(
      this.url(`${this.path(number)}/reviewers/${encodeURIComponent(id)}`),
      "PUT",
      { id, vote: decision === "approve" ? 10 : -10 },
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
    const r = await this.api.json(this.url(this.path(number)));
    await this.api.json(this.url(this.path(number)), "PATCH", {
      status: "completed",
      lastMergeSourceCommit: {
        commitId: assertHead(str(object(r.lastMergeSourceCommit).commitId), expectedHeadSha),
      },
      completionOptions: {
        mergeStrategy:
          method === "merge" ? "noFastForward" : method === "rebase" ? "rebase" : "squash",
        deleteSourceBranch: false,
        bypassPolicy: false,
      },
    });
  }
  async setState(number: number, state: "closed" | "open" | "ready" | "draft") {
    await this.api.json(
      this.url(this.path(number)),
      "PATCH",
      state === "ready" || state === "draft"
        ? { isDraft: state === "draft" }
        : { status: state === "open" ? "active" : "abandoned" },
    );
  }
  labelCandidates() {
    return this.metadata.labelCandidates();
  }
  setLabels(number: number, add: string[], remove: string[]) {
    return this.metadata.setLabels(number, add, remove);
  }
  reviewerCandidates(number: number, query?: string) {
    return this.metadata.reviewerCandidates(query);
  }
  requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    return this.metadata.requestReviewers(number, add, remove);
  }
  /** Threads land on the latest iteration, whose head the service matched to `headSha`. */
  submitDraft(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ) {
    return this.metadata.submitDraft(number, input.comments, async () => {
      if (input.decision !== "comment") await this.review(number, input.decision, input.body);
      else if (input.body.trim()) await this.comment(number, input.body);
    });
  }
  async updateBranch(): Promise<void> {
    unsupported(this.source);
  }
}
