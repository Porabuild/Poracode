import { msg } from "@/shared/messages";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { poracodeBaseDirFromEnv } from "@/shared/poracodePaths";
import { splitUnifiedDiff, viewedFingerprint } from "@/shared/reviewDiff";
import type {
  ForgeAccountRef,
  ForgeCreatePrPayload,
  ForgeEditPrPayload,
  ForgeEditPrCommentPayload,
  ForgeGetPrReviewGuidePayload,
  ForgeWritePrReviewGuidePayload,
  ForgeReviewGuideContent,
  ForgeGetRepositoryPayload,
  ForgeGetPrForBranchPayload,
  ForgeListPrsPayload,
  ForgeListPullRequestsPayload,
  ForgeGetPrDetailsPayload,
  ForgeGetPrViewedFilesPayload,
  ForgeSetPrFileViewedPayload,
  ForgePrViewedFilesResult,
  ForgeGetPrFilesPayload,
  ForgeGetPrDiffPayload,
  ForgeGetPrChecksPayload,
  ForgePostPrCommentPayload,
  ForgeSubmitPrReviewPayload,
  ForgeMergePrPayload,
  ForgeMarkPrReadyPayload,
  ForgeClosePrPayload,
  ForgeReopenPrPayload,
  ForgeUpdatePrBranchPayload,
  PrData,
  ProjectLocation,
} from "@/shared/contracts";
import { GitHubService } from "../github";
import type { WslBridgeClient } from "../wsl/bridge/client";
import { AzureReview, type AzurePatches } from "./azure";
import { BitbucketReview } from "./bitbucket";
import { ForgeConnections, type ForgeConnection } from "./connection";
import { GitCafeReview } from "./gitcafe";
import { GiteaReview } from "./gitea";
import { GitHubReview } from "./github";
import { GitLabReview } from "./gitlab";
import { ForgeRuntime } from "./runtime";
import { unsupported, type ForgeReviewAdapter } from "./types";
import { ForgeViewedFilesStore } from "./viewedFiles";
import {
  ForgeReviewGuideStore,
  reviewGuideFingerprint,
  type ReviewGuideSnapshot,
} from "./reviewGuides";

/** Shared review entrypoint for desktop, remote/native clients, MCP and watches. */
export class ForgeReviewService {
  private wslClient: WslBridgeClient | undefined;
  private readonly runtime: ForgeRuntime;
  private readonly connections: Pick<ForgeConnections, "resolve">;
  private readonly azurePatches = new Map<string, Promise<AzurePatches>>();
  private readonly viewedFiles: ForgeViewedFilesStore;
  private readonly guides: ForgeReviewGuideStore;
  constructor(
    private readonly github: GitHubService,
    options?: {
      runtime?: ForgeRuntime;
      connections?: Pick<ForgeConnections, "resolve">;
      viewedFiles?: ForgeViewedFilesStore;
      guides?: ForgeReviewGuideStore;
    },
  ) {
    this.runtime = options?.runtime ?? new ForgeRuntime(() => this.wslClient);
    this.connections = options?.connections ?? new ForgeConnections(this.runtime);
    this.viewedFiles =
      options?.viewedFiles ??
      new ForgeViewedFilesStore(
        join(poracodeBaseDirFromEnv() ?? join(homedir(), ".poracode"), "review-viewed-files.json"),
      );
    this.guides =
      options?.guides ??
      new ForgeReviewGuideStore(
        join(poracodeBaseDirFromEnv() ?? join(homedir(), ".poracode"), "review-guides.json"),
      );
  }
  setWslClient(client: WslBridgeClient | undefined) {
    this.wslClient = client;
  }
  private async adapter(
    location: ProjectLocation,
    account?: ForgeAccountRef,
    repository?: string,
  ): Promise<ForgeReviewAdapter | null> {
    const connection = await this.connections.resolve(location, account);
    if (!connection) return null;
    const adapter = await this.fromConnection(connection, location, account);
    if (repository && adapter.source.repository !== repository)
      throw new Error(msg("forge.repositoryChanged"));
    return adapter;
  }
  private async fromConnection(
    { source, api }: ForgeConnection,
    location: ProjectLocation,
    account?: ForgeAccountRef,
  ): Promise<ForgeReviewAdapter> {
    switch (source.forge) {
      case "github": {
        const host = new URL(source.host);
        if (host.pathname !== "/" && account) throw new Error(msg("forge.hostInvalid"));
        const resolved = await this.github.forReviewRepository(
          location,
          account ? { host: host.host, login: account.login } : undefined,
        );
        source.capabilities.autoFix =
          source.capabilities.autoFix &&
          source.host === resolved.host &&
          source.repository.toLowerCase() === resolved.repository.toLowerCase();
        source.host = resolved.host;
        source.repository = resolved.repository;
        if (resolved.account)
          source.account = { forge: "github", host: resolved.host, login: resolved.account.login };
        return new GitHubReview(source, resolved.service, location);
      }
      case "gitlab":
        return new GitLabReview(source, api!);
      case "forgejo":
      case "gitea":
        return new GiteaReview(source, api!);
      case "bitbucket":
        return new BitbucketReview(source, api!);
      case "azure-devops":
        return new AzureReview(source, api!, this.runtime, location, this.azurePatches);
      case "gitcafe":
        return new GitCafeReview(source, api!);
    }
  }
  private async required(input: ForgeGetRepositoryPayload) {
    const adapter = await this.adapter(
      input.projectLocation,
      input.forgeAccount,
      input.forgeRepository,
    );
    if (!adapter) throw new Error(msg("forge.noRemote"));
    return adapter;
  }
  async getRepository(input: ForgeGetRepositoryPayload) {
    return {
      repository:
        (await this.adapter(input.projectLocation, input.forgeAccount, input.forgeRepository))
          ?.source ?? null,
    };
  }
  async checkAvailable(location: ProjectLocation) {
    try {
      const connection = await this.connections.resolve(location);
      return {
        available:
          connection?.source.forge === "github"
            ? (await this.github.checkGhAvailable(location)).available
            : connection !== null,
      };
    } catch {
      return { available: false };
    }
  }
  async createPr(input: ForgeCreatePrPayload) {
    const adapter = await this.required(input);
    if (input.isDraft && !adapter.source.capabilities.draft) unsupported(adapter.source);
    return adapter.create(input);
  }
  async getPrForBranch(input: ForgeGetPrForBranchPayload) {
    const adapter = await this.adapter(
      input.projectLocation,
      input.forgeAccount,
      input.forgeRepository,
    );
    if (!adapter) return null;
    const list = await adapter.list("all", input.branch);
    return list.reduce<PrData | null>(
      (latest, item) => (!latest || item.pr.number > latest.number ? item.pr : latest),
      null,
    );
  }
  async listPrs(input: ForgeListPrsPayload) {
    const adapter = await this.adapter(
      input.projectLocation,
      input.forgeAccount,
      input.forgeRepository,
    );
    if (!adapter) return { prs: {} };
    const prs: Record<string, PrData> = {};
    for (const item of await adapter.list("all"))
      if (!prs[item.headBranch] || item.pr.number > prs[item.headBranch]!.number)
        prs[item.headBranch] = item.pr;
    return { prs };
  }
  async listPullRequests(input: ForgeListPullRequestsPayload) {
    const adapter = await this.adapter(
      input.projectLocation,
      input.forgeAccount,
      input.forgeRepository,
    );
    if (!adapter) return { pullRequests: [] };
    const pullRequests = await adapter.list("open");
    return {
      pullRequests,
      ...(adapter.source.account ? { viewerLogin: adapter.source.account.login } : {}),
    };
  }
  async getPrDetails(input: ForgeGetPrDetailsPayload) {
    return (await this.required(input)).details(input.prNumber);
  }
  async getPrViewedFiles(input: ForgeGetPrViewedFilesPayload): Promise<ForgePrViewedFilesResult> {
    const adapter = await this.required(input);
    const marks =
      adapter instanceof GitHubReview
        ? await adapter.viewedFiles(input.prNumber)
        : await this.viewedFiles.get(input);
    return this.viewedResult(adapter, input.prNumber, marks);
  }
  private async guideSnapshot(
    adapter: ForgeReviewAdapter,
    number: number,
  ): Promise<ReviewGuideSnapshot> {
    const before = await adapter.details(number);
    const [files, diff, threads] = await Promise.all([
      adapter.files(number),
      adapter.diff(number),
      adapter.threads(number),
    ]);
    const after = await adapter.details(number);
    if (
      !before.pr?.headSha ||
      before.pr.headSha !== after.pr?.headSha ||
      before.details.baseBranch !== after.details.baseBranch
    )
      throw new Error(msg("forge.headChanged"));
    return { headSha: before.pr.headSha, details: before.details, files, diff, threads };
  }
  async getPrReviewGuide(input: ForgeGetPrReviewGuidePayload) {
    const snapshot = await this.guideSnapshot(await this.required(input), input.prNumber);
    return {
      ...(await this.guides.get(input, reviewGuideFingerprint(snapshot))),
      diffHash: createHash("sha256").update(snapshot.diff).digest("hex"),
    };
  }
  async writePrReviewGuide(
    input: ForgeWritePrReviewGuidePayload,
    generate: (
      snapshot: ReviewGuideSnapshot,
      source: ForgeReviewAdapter["source"],
    ) => Promise<ForgeReviewGuideContent>,
  ) {
    const adapter = await this.required(input);
    const snapshot = await this.guideSnapshot(adapter, input.prNumber);
    return {
      ...(await this.guides.start(input, snapshot, input.selection?.model ?? input.agentKind, () =>
        generate(snapshot, adapter.source),
      )),
      diffHash: createHash("sha256").update(snapshot.diff).digest("hex"),
    };
  }
  async setPrFileViewed(input: ForgeSetPrFileViewedPayload): Promise<ForgePrViewedFilesResult> {
    const adapter = await this.required(input);
    const marks =
      adapter instanceof GitHubReview
        ? await adapter.setFileViewed(input.prNumber, input.path, input.fingerprint !== null)
        : await this.viewedFiles.set(input, input.path, input.fingerprint);
    return this.viewedResult(adapter, input.prNumber, marks);
  }
  private async viewedResult(
    adapter: ForgeReviewAdapter,
    number: number,
    marks: Record<string, string>,
  ): Promise<ForgePrViewedFilesResult> {
    const files = Object.entries(marks).map(([path, fingerprint]) => ({ path, fingerprint }));
    if (adapter instanceof GitHubReview) return { storage: "forge", files };
    const [current, diff] = await Promise.all([adapter.files(number), adapter.diff(number)]);
    const patches = splitUnifiedDiff(diff);
    return {
      storage: "host",
      files,
      currentFiles: current.map((file) => ({
        path: file.path,
        fingerprint: viewedFingerprint(patches.get(file.path), file),
      })),
      diffHash: createHash("sha256").update(diff).digest("hex"),
    };
  }
  async getPrFiles(input: ForgeGetPrFilesPayload) {
    return { files: await (await this.required(input)).files(input.prNumber) };
  }
  async getPrDiff(input: ForgeGetPrDiffPayload) {
    return { diff: await (await this.required(input)).diff(input.prNumber) };
  }
  async getPrChecks(input: ForgeGetPrChecksPayload) {
    const adapter = await this.required(input);
    if (adapter instanceof GitHubReview) return adapter.checksForBranch(input.branch);
    const prs = await adapter.list("all", input.branch);
    const pr = prs.toSorted((a, b) => b.pr.number - a.pr.number)[0];
    return { checks: pr ? await adapter.checks(pr.pr.number) : [] };
  }
  async getPrReviewThreads(input: ForgeGetPrDetailsPayload) {
    const threads = await (await this.required(input)).threads(input.prNumber);
    return { threads, comments: threads.flatMap((t) => t.comments) };
  }
  async postPrComment(input: ForgePostPrCommentPayload) {
    if (!input.body.trim()) throw new Error(msg("forge.bodyRequired"));
    return (await this.required(input)).comment(input.prNumber, input.body);
  }
  async editPrComment(input: ForgeEditPrCommentPayload) {
    if (!input.body.trim()) throw new Error(msg("forge.bodyRequired"));
    const adapter = await this.required(input);
    const kind = input.threadId ? "inline" : "conversation";
    if (!adapter.editComment || !adapter.source.capabilities.commentEditing?.includes(kind))
      unsupported(adapter.source);
    const comments = input.threadId
      ? (await adapter.threads(input.prNumber)).find((thread) => thread.id === input.threadId)
          ?.comments
      : (await adapter.details(input.prNumber)).details.comments;
    const comment = comments?.find((entry) => entry.id === input.commentId);
    const login = adapter.source.account?.login;
    if (!comment || !login || comment.author.login.toLowerCase() !== login.toLowerCase())
      throw new Error(msg("forge.commentNotEditable"));
    // A retry after a lost response finds its own edit already applied.
    if (comment.body === input.body) return;
    if (comment.body !== input.expectedBody) throw new Error(msg("forge.commentChanged"));
    await adapter.editComment(input);
  }
  async submitPrReview(input: ForgeSubmitPrReviewPayload) {
    const adapter = await this.required(input);
    if (!adapter.source.capabilities.reviewDecisions.includes(input.decision))
      unsupported(adapter.source);
    if (input.decision !== "approve" && !input.body.trim())
      throw new Error(msg("forge.bodyRequired"));
    await adapter.review(input.prNumber, input.decision, input.body);
  }
  async mergePr(input: ForgeMergePrPayload & { expectedHeadSha?: string }) {
    const adapter = await this.required(input);
    if (adapter instanceof GitHubReview) {
      await adapter.mergeWithAdmin(
        input.prNumber,
        input.method,
        input.admin,
        input.expectedHeadSha,
      );
      return;
    }
    if (input.admin) unsupported(adapter.source);
    if (!adapter.source.capabilities.mergeMethods.includes(input.method))
      unsupported(adapter.source);
    if (input.expectedHeadSha && !adapter.source.capabilities.expectedHeadMerge)
      unsupported(adapter.source);
    await adapter.merge(input.prNumber, input.method, input.expectedHeadSha);
  }
  async closePr(input: ForgeClosePrPayload) {
    await (await this.required(input)).setState(input.prNumber, "closed");
  }
  async reopenPr(input: ForgeReopenPrPayload) {
    const adapter = await this.required(input);
    if (!adapter.source.capabilities.reopen) unsupported(adapter.source);
    await adapter.setState(input.prNumber, "open");
  }
  async markPrReady(input: ForgeMarkPrReadyPayload) {
    const adapter = await this.required(input);
    if (!adapter.source.capabilities.draft) unsupported(adapter.source);
    await adapter.setState(input.prNumber, "ready");
  }
  async updatePrBranch(input: ForgeUpdatePrBranchPayload) {
    const adapter = await this.required(input);
    if (
      !(input.rebase
        ? adapter.source.capabilities.rebaseBranch
        : adapter.source.capabilities.updateBranch)
    )
      unsupported(adapter.source);
    await adapter.updateBranch(input.prNumber, input.rebase);
  }
  async editPr(input: ForgeEditPrPayload) {
    const adapter = await this.required(input);
    if (!adapter.source.capabilities.edit) unsupported(adapter.source);
    await adapter.edit(input);
  }
}
