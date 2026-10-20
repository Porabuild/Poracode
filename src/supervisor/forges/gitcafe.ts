import { msg } from "@/shared/messages";
import { randomUUID } from "node:crypto";
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
import { ForgeApi } from "./api";
import {
  assertHead,
  checksStatus,
  encodePath,
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

function author(raw: unknown): PrAuthor {
  const r = object(raw);
  return {
    login: str(r.handle) || str(r.login) || str(r.actorId),
    ...(str(r.avatarUrl) ? { avatarUrl: str(r.avatarUrl) } : {}),
  };
}
function comment(r: ApiObject): PrComment {
  return {
    id: str(r.id),
    author: author(r.author),
    body: str(r.body),
    createdAt: str(r.createdAt),
  };
}

export class GitCafeReview implements ForgeReviewAdapter {
  private readonly repo: string;
  constructor(
    readonly source: ForgeRepository,
    private readonly api: ForgeApi,
  ) {
    this.repo = `repos/${encodePath(source.repository)}`;
  }
  private path(number?: number) {
    return `${this.repo}/pulls/${number ?? ""}`;
  }
  private pr(r: ApiObject): PrData {
    const draft = r.draft === true;
    return {
      source: {
        ...this.source,
        capabilities: {
          ...this.source.capabilities,
          autoFix: this.source.capabilities.autoFix && r.isCrossFork === false,
        },
      },
      number: requiredNumber(r.number),
      title: str(r.title),
      url: `${this.source.host}/${encodePath(this.source.repository)}/pull/${num(r.number)}`,
      baseBranch: str(r.targetBranch),
      isDraft: draft,
      state:
        r.state === "merged"
          ? "merged"
          : r.state === "closed"
            ? "closed"
            : draft
              ? "draft"
              : "open",
      headSha: str(r.headOid),
      updatedAt: str(r.updatedAt),
      viewerDidAuthor: author(r.author).login === this.source.account?.login,
      mergeable: "UNKNOWN",
      mergeStateStatus: draft ? "DRAFT" : "UNKNOWN",
    };
  }
  async list(state: "open" | "all", branch?: string): Promise<PullRequestSummary[]> {
    const q = new URLSearchParams({ limit: "100", ...(state === "open" ? { state: "open" } : {}) });
    return (await this.api.list(`${this.path()}?${q}`, "items"))
      .filter((r) => !branch || r.sourceBranch === branch)
      .map((r) => ({
        pr: this.pr(r),
        headBranch: str(r.sourceBranch),
        author: author(r.author),
        additions: 0,
        deletions: 0,
        repository: this.source.repository,
        reviewRequested: rows(r.reviewers).some(
          (user) => author(user).login === this.source.account?.login,
        ),
      }));
  }
  private async status(number: number) {
    return this.api.json(`${this.path(number)}/status`);
  }
  async checks(number: number) {
    return rows(object((await this.status(number)).checks).contexts).map((c) =>
      normalizedCheck(str(c.context), str(c.state), str(c.url)),
    );
  }
  async files(number: number) {
    return (await this.api.list(`${this.path(number)}/changes?limit=100`, "items")).map((f) => ({
      path: str(f.path),
      additions: num(f.additions),
      deletions: num(f.deletions),
    }));
  }
  async diff(number: number) {
    const files = await this.files(number);
    const patches: string[] = [];
    for (const file of files) {
      const f = object(
        (
          await this.api.json(
            `${this.path(number)}/diff-file?${new URLSearchParams({ path: file.path })}`,
          )
        ).file,
      );
      if (f.tooLarge === true || f.hunksOmitted === true)
        throw new Error(msg("forge.diffUnavailable"));
      const a = JSON.stringify(`a/${str(f.oldPath) || file.path}`),
        b = JSON.stringify(`b/${file.path}`);
      if (f.binary === true) {
        patches.push(`diff --git ${a} ${b}\nBinary files ${a} and ${b} differ\n`);
        continue;
      }
      const hunks = rows(f.hunks)
        .map(
          (h) =>
            `@@ -${num(h.oldStart)},${num(h.oldLines)} +${num(h.newStart)},${num(h.newLines)} @@\n${rows(
              h.lines,
            )
              .map(
                (l) =>
                  `${str(l.origin)}${str(l.content)}${str(l.content).endsWith("\n") ? "" : "\n"}`,
              )
              .join("")}`,
        )
        .join("");
      patches.push(
        `diff --git ${a} ${b}\n--- ${f.status === "added" ? "/dev/null" : a}\n+++ ${f.status === "deleted" ? "/dev/null" : b}\n${hunks}`,
      );
    }
    return patches.join("");
  }
  private comments(number: number) {
    return this.api.list(`${this.path(number)}/comments/?limit=100`, "items");
  }
  async threads(number: number): Promise<PrReviewThread[]> {
    const groups = new Map<string, ApiObject[]>();
    for (const c of await this.comments(number)) {
      if (c.deletedAt || c.hiddenAt) continue;
      const key = str(c.threadId) || str(c.id);
      const group = groups.get(key) ?? [];
      group.push(c);
      groups.set(key, group);
    }
    return [...groups].map(([id, group]) => {
      const root = group.find((c) => c.id === id) ?? group[0]!;
      return {
        id,
        isResolved: Boolean(root.resolvedAt),
        isOutdated: false,
        ...(str(root.path) ? { path: str(root.path) } : {}),
        ...(num(root.line) ? { line: num(root.line) } : {}),
        comments: group.map(comment),
      };
    });
  }
  async details(number: number): Promise<GhGetPrDetailsResult> {
    const [r, status, commits, comments, rawReviews, files] = await Promise.all([
      this.api.json(this.path(number)),
      this.status(number),
      this.api.list(`${this.path(number)}/commits?limit=100`, "items"),
      this.comments(number),
      this.api.list(`${this.path(number)}/reviews?limit=100`, "items"),
      this.files(number),
    ]);
    const merge = object(status.merge),
      verdict = object(merge.verdict),
      permission = object(r.capabilities);
    const source = {
      ...this.source,
      capabilities: {
        ...this.source.capabilities,
        autoFix: this.source.capabilities.autoFix && r.isCrossFork === false,
        mergeMethods:
          permission.merge === false
            ? []
            : this.source.capabilities.mergeMethods.filter(
                (m) => Array.isArray(merge.strategies) && merge.strategies.includes(m),
              ),
        edit: permission.edit === true,
        reviewDecisions:
          permission.review === false ? [] : this.source.capabilities.reviewDecisions,
      },
    };
    const pr = { ...this.pr(r), source };
    const checks = rows(object(status.checks).contexts).map((c) =>
      normalizedCheck(str(c.context), str(c.state), str(c.url)),
    );
    const checkStatus = checksStatus(checks);
    if (checkStatus) pr.checksStatus = checkStatus;
    pr.mergeable =
      merge.conflicts === "conflicting"
        ? "CONFLICTING"
        : verdict.kind === "mergeable"
          ? "MERGEABLE"
          : "UNKNOWN";
    pr.mergeStateStatus = pr.isDraft
      ? "DRAFT"
      : merge.conflicts === "conflicting"
        ? "DIRTY"
        : verdict.kind === "blocked"
          ? "BLOCKED"
          : verdict.kind === "mergeable"
            ? "CLEAN"
            : "UNKNOWN";
    const reviews: PrReviewSummary[] = rawReviews.map((review) => ({
      id: str(review.id),
      author: author(review.author),
      body: str(review.body),
      submittedAt: str(review.createdAt),
      state: review.dismissedAt
        ? "DISMISSED"
        : review.verdict === "approve"
          ? "APPROVED"
          : review.verdict === "request_changes"
            ? "CHANGES_REQUESTED"
            : "COMMENTED",
    }));
    if (Array.isArray(merge.reasons) && merge.reasons.includes("changes-requested"))
      pr.reviewDecision = "CHANGES_REQUESTED";
    return {
      pr,
      details: {
        source,
        number: pr.number,
        title: pr.title,
        body: str(r.description),
        author: author(r.author),
        baseBranch: pr.baseBranch,
        headBranch: str(r.sourceBranch),
        additions: files.reduce((a, f) => a + f.additions, 0),
        deletions: files.reduce((a, f) => a + f.deletions, 0),
        changedFiles: files.length,
        createdAt: str(r.createdAt),
        mergedAt: str(r.mergedAt) || null,
        closedAt: str(r.closedAt) || null,
        commits: commits.map((c) => ({
          oid: str(c.oid),
          abbreviatedOid: str(c.oid).slice(0, 7),
          messageHeadline: str(c.summary),
          messageBody: str(c.message),
          authoredDate: new Date(num(c.time) * 1000).toISOString(),
          author: { login: str(object(c.author).name) },
        })),
        comments: comments
          .filter(
            (c) => !c.path && !c.deletedAt && !c.hiddenAt && (c.threadId === c.id || !c.threadId),
          )
          .map(comment),
        reviews,
        checks,
      },
    };
  }
  async create(input: GhCreatePrPayload) {
    const repository = await this.api.json(`${this.repo}/`);
    const r = await this.api.json(this.path(), "POST", {
      repo: requiredString(repository.id),
      source: input.branch,
      target: input.baseBranch,
      title: input.title,
      description: input.body,
      submissionKey: randomUUID(),
    });
    if (input.isDraft) {
      try {
        return this.pr(
          await this.api.json(`${this.path(requiredNumber(r.number))}/draft`, "POST", {
            expectedVersion: num(r.version),
          }),
        );
      } catch {
        throw new Error(msg("forge.draftPartial", { number: num(r.number) }));
      }
    }
    return this.pr(r);
  }
  async edit(input: ForgeEditPrPayload) {
    const r = await this.api.json(this.path(input.prNumber));
    await this.api.json(this.path(input.prNumber), "PATCH", {
      expectedVersion: num(r.version),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { description: input.body } : {}),
      ...(input.baseBranch !== undefined ? { targetBranch: input.baseBranch } : {}),
    });
  }
  async comment(number: number, body: string) {
    return comment(await this.api.json(`${this.path(number)}/comments/`, "POST", { body }));
  }
  async editComment(input: ForgeEditPrCommentPayload) {
    const path = `${this.path(input.prNumber)}/comments/${encodeURIComponent(input.commentId)}`;
    const detail = await this.api.json(`${path}/detail`);
    if (detail.body !== input.expectedBody) throw new Error(msg("forge.commentChanged"));
    const version = detail.version;
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0)
      throw new Error(msg("forge.responseInvalid"));
    await this.api.json(path, "PATCH", { body: input.body, expectedVersion: version });
  }
  async review(number: number, decision: PrReviewDecision, body: string) {
    const r = await this.api.json(this.path(number));
    await this.api.json(`${this.path(number)}/reviews`, "POST", {
      verdict: decision === "request-changes" ? "request_changes" : decision,
      body,
      commitOid: assertHead(str(r.headOid)),
      expectedVersion: num(r.version),
      requestId: randomUUID(),
    });
  }
  async merge(number: number, method: PrMergeMethod, expectedHeadSha?: string) {
    const [r, status] = await Promise.all([this.api.json(this.path(number)), this.status(number)]);
    const result = await this.api.json(`${this.path(number)}/merge`, "POST", {
      requestId: randomUUID(),
      expectedVersion: num(r.version),
      headOid: assertHead(str(r.headOid), expectedHeadSha),
      baseOid: assertHead(str(status.baseOid)),
      strategy: method,
    });
    if (result.state === "failed") throw new Error(msg("forge.mergeFailed"));
    // Accepted is queued, not merged. Callers must read the authoritative PR state.
  }
  async setState(number: number, state: "closed" | "open" | "ready") {
    const r = await this.api.json(this.path(number));
    await this.api.json(
      `${this.path(number)}/${state === "open" ? "reopen" : state === "closed" ? "close" : "ready"}`,
      "POST",
      { expectedVersion: num(r.version) },
    );
  }
  async updateBranch(): Promise<void> {
    unsupported(this.source);
  }
}
