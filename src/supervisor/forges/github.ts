import {
  PR_REACTION_CONTENTS,
  type ForgeEditPrPayload,
  type ForgeEditPrCommentPayload,
  type ForgeRepository,
  type ForgeReviewDraftComment,
  type ForgeReviewerRef,
  type GhCreatePrPayload,
  type PrMergeMethod,
  type PrData,
  type PrReactionContent,
  type PrReviewDecision,
  type ProjectLocation,
} from "@/shared/contracts";
import { GitHubService } from "../github";
import { unsupported, type ForgeReviewAdapter } from "./types";

export class GitHubReview implements ForgeReviewAdapter {
  constructor(
    readonly source: ForgeRepository,
    private readonly service: GitHubService,
    private readonly location: ProjectLocation,
  ) {}
  private withSource(pr: PrData): PrData {
    return {
      ...pr,
      source: {
        ...this.source,
        capabilities: {
          ...this.source.capabilities,
          autoFix: this.source.capabilities.autoFix && pr.isCrossRepository === false,
        },
      },
    };
  }
  async list(state: "open" | "all" | "closed" | "merged", branch?: string) {
    if (branch) {
      const pr = await this.service.getPrForBranch(this.location, branch);
      return pr
        ? [
            {
              pr: this.withSource(pr),
              headBranch: branch,
              additions: 0,
              deletions: 0,
              repository: this.source.repository,
              reviewRequested: false,
            },
          ]
        : [];
    }
    const result = await this.service.listPullRequests(this.location, state);
    if (result.viewerLogin)
      this.source.account = { forge: "github", host: this.source.host, login: result.viewerLogin };
    return result.pullRequests.map((r) => ({ ...r, pr: this.withSource(r.pr) }));
  }
  async details(number: number) {
    const result = await this.service.getPrDetails(this.location, number);
    return {
      ...result,
      ...(result.pr ? { pr: this.withSource(result.pr) } : {}),
      details: {
        ...result.details,
        source: result.pr
          ? this.withSource(result.pr).source!
          : { ...this.source, capabilities: { ...this.source.capabilities, autoFix: false } },
      },
    };
  }
  async files(number: number) {
    return (await this.service.getPrFiles(this.location, number)).files;
  }
  async diff(number: number) {
    return (await this.service.getPrDiff(this.location, number)).diff;
  }
  viewedFiles(number: number) {
    return this.service.getPrViewedFiles(this.location, number);
  }
  setFileViewed(number: number, path: string, viewed: boolean) {
    return this.service.setPrFileViewed(this.location, number, path, viewed);
  }
  async checks(number: number) {
    return (await this.service.getPrDetails(this.location, number, { metadata: false })).details
      .checks;
  }
  async threads(number: number) {
    return (await this.service.getPrReviewThreads(this.location, number)).threads;
  }
  async create(input: GhCreatePrPayload) {
    return this.withSource(
      await this.service.createPr(
        this.location,
        input.branch,
        input.baseBranch,
        input.title,
        input.body,
        input.isDraft,
      ),
    );
  }
  edit(input: ForgeEditPrPayload) {
    return this.service.editPr(this.location, input.prNumber, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.baseBranch !== undefined ? { baseBranch: input.baseBranch } : {}),
    });
  }
  comment(number: number, body: string) {
    return this.service.postPrComment(this.location, number, body);
  }
  editComment(input: ForgeEditPrCommentPayload) {
    return this.service.editPrComment(
      this.location,
      input.commentId,
      input.body,
      input.threadId !== undefined,
    );
  }
  review(number: number, decision: PrReviewDecision, body: string) {
    return this.service.submitPrReview(this.location, number, decision, body);
  }
  merge(number: number, method: PrMergeMethod, expectedHeadSha?: string) {
    return this.service.mergePr(this.location, number, method, false, expectedHeadSha);
  }
  setState(number: number, state: "closed" | "open" | "ready" | "draft") {
    return state === "closed"
      ? this.service.closePr(this.location, number)
      : state === "open"
        ? this.service.reopenPr(this.location, number)
        : state === "draft"
          ? this.service.markPrDraft(this.location, number)
          : this.service.markPrReady(this.location, number);
  }
  labelCandidates() {
    return this.service.prMetadata(this.location).labelCandidates();
  }
  setLabels(number: number, add: string[], remove: string[]) {
    return this.service.prMetadata(this.location).setLabels(number, add, remove);
  }
  reviewerCandidates(number: number, query?: string) {
    return this.service.prMetadata(this.location).reviewerCandidates(number, query);
  }
  requestReviewers(number: number, add: ForgeReviewerRef[], remove: ForgeReviewerRef[]) {
    const owner = this.source.repository.split("/")[0]!;
    return this.service.prMetadata(this.location).requestReviewers(number, owner, add, remove);
  }
  commitDiff(_number: number, commit: string) {
    return this.service.prMetadata(this.location).commitDiff(commit);
  }
  react(number: number, subjectId: string | undefined, content: string, reacted: boolean) {
    if (!PR_REACTION_CONTENTS.includes(content as PrReactionContent)) unsupported(this.source);
    return this.service
      .prMetadata(this.location)
      .react(number, subjectId, content as PrReactionContent, reacted);
  }
  submitDraft(
    number: number,
    input: {
      decision: PrReviewDecision;
      body: string;
      headSha: string;
      comments: ForgeReviewDraftComment[];
    },
  ) {
    return this.service.prMetadata(this.location).submitDraft(number, input);
  }
  updateBranch(number: number, rebase: boolean) {
    return this.service.updatePrBranch(this.location, number, rebase);
  }
  checksForBranch(branch: string) {
    return this.service.getPrChecks(this.location, branch);
  }
  mergeWithAdmin(number: number, method: PrMergeMethod, admin: boolean, expectedHeadSha?: string) {
    return this.service.mergePr(this.location, number, method, admin, expectedHeadSha);
  }
}
