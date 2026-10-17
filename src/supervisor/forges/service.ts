import { msg } from "@/shared/messages";
import type {
  ForgeAccountRef,
  ForgeCreatePrPayload,
  ForgeEditPrPayload,
  ForgeGetRepositoryPayload,
  ForgeGetPrForBranchPayload,
  ForgeListPrsPayload,
  ForgeListPullRequestsPayload,
  ForgeGetPrDetailsPayload,
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

/** Shared review entrypoint for desktop, remote/native clients, MCP and watches. */
export class ForgeReviewService {
  private wslClient: WslBridgeClient | undefined;
  private readonly runtime: ForgeRuntime;
  private readonly connections: Pick<ForgeConnections, "resolve">;
  private readonly azurePatches = new Map<string, Promise<AzurePatches>>();
  constructor(
    private readonly github: GitHubService,
    options?: { runtime?: ForgeRuntime; connections?: Pick<ForgeConnections, "resolve"> },
  ) {
    this.runtime = options?.runtime ?? new ForgeRuntime(() => this.wslClient);
    this.connections = options?.connections ?? new ForgeConnections(this.runtime);
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
