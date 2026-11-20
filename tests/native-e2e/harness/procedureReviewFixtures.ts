import { createHash } from "node:crypto";
import { REMOTE_PROCEDURE_RESULT_FIXTURES } from "../../../src/shared/remote/contract/goldens/procedureFixtures.ts";

const METADATA_REVIEW_TITLE = "Metadata fixture pull request";
const GUIDE_FIXTURE_PATH = "src/review.ts";
const GUIDE_FIXTURE_DIFF = [
  `diff --git a/${GUIDE_FIXTURE_PATH} b/${GUIDE_FIXTURE_PATH}`,
  `--- a/${GUIDE_FIXTURE_PATH}`,
  `+++ b/${GUIDE_FIXTURE_PATH}`,
  "@@ -1,2 +1,2 @@",
  "-const first = 0;",
  "-const second = 0;",
  "+const first = 1;",
  "+const second = 2;",
  "",
].join("\n");
const GUIDE_FIXTURE_HASH = createHash("sha256").update(GUIDE_FIXTURE_DIFF).digest("hex");
const METADATA_LABELS = [
  { name: "bug", color: "d73a4a" },
  { name: "documentation", color: "0075ca" },
];
const METADATA_REVIEWERS = [
  { id: "acme/core", login: "core", name: "Core Team", team: true },
  { id: "octocat", login: "octocat", name: "Octo Cat" },
];
const METADATA_REPOSITORY = {
  forge: "github",
  host: "https://github.com",
  repository: "acme/app",
  remote: "origin",
  account: { forge: "github", host: "https://github.com", login: "fixture" },
  capabilities: {
    mergeMethods: [],
    reviewDecisions: [],
    draft: false,
    reopen: false,
    updateBranch: false,
    rebaseBranch: false,
    edit: false,
    checks: false,
    reviewThreads: false,
    expectedHeadMerge: false,
    autoMerge: false,
    autoFix: false,
    adminMerge: false,
    labels: true,
    reviewRequests: true,
  },
};

export class LabReviewProcedureFixture {
  private createdPullRequest: Record<string, unknown> | undefined;
  private reviewMetadata: { labels: Set<string>; reviewers: Set<string> } | undefined;
  private reviewGuideVersion: number | undefined;

  reset(): void {
    this.createdPullRequest = undefined;
    this.reviewMetadata = undefined;
    this.reviewGuideVersion = undefined;
  }

  prepareMetadata(): void {
    this.reviewMetadata = { labels: new Set(["bug"]), reviewers: new Set(["acme/core"]) };
  }

  prepareGuide(): void {
    this.prepareMetadata();
    this.reviewGuideVersion = 1;
  }

  createPullRequest(body: Record<string, unknown>): unknown {
    const baseline = REMOTE_PROCEDURE_RESULT_FIXTURES.ghCreatePr;
    const pr = {
      ...baseline,
      title: body.title,
      baseBranch: body.baseBranch,
      isDraft: body.isDraft ?? false,
    };
    this.createdPullRequest = {
      pr,
      headBranch: body.branch,
      additions: 0,
      deletions: 0,
      repository: "acme/app",
      reviewRequested: false,
    };
    return pr;
  }

  listPullRequests(): unknown {
    if (this.reviewMetadata) {
      return {
        pullRequests: [
          {
            pr: {
              ...REMOTE_PROCEDURE_RESULT_FIXTURES.ghCreatePr,
              title: METADATA_REVIEW_TITLE,
              source: this.reviewGuideVersion
                ? {
                    ...METADATA_REPOSITORY,
                    capabilities: {
                      ...METADATA_REPOSITORY.capabilities,
                      reviewGuides: true,
                      reviewDecisions: ["comment"],
                    },
                  }
                : METADATA_REPOSITORY,
            },
            headBranch: "feat",
            additions: 1,
            deletions: 0,
            repository: "acme/app",
            reviewRequested: false,
          },
        ],
      };
    }
    return this.createdPullRequest
      ? { pullRequests: [this.createdPullRequest] }
      : REMOTE_PROCEDURE_RESULT_FIXTURES.ghListPullRequests;
  }

  getDetails(): unknown {
    return this.reviewMetadata
      ? {
          details: {
            ...REMOTE_PROCEDURE_RESULT_FIXTURES.forgeGetPrDetails.details,
            title: METADATA_REVIEW_TITLE,
            labels: METADATA_LABELS.filter((label) => this.reviewMetadata?.labels.has(label.name)),
            requestedReviewers: METADATA_REVIEWERS.filter((reviewer) =>
              this.reviewMetadata?.reviewers.has(reviewer.id),
            ),
          },
        }
      : REMOTE_PROCEDURE_RESULT_FIXTURES.forgeGetPrDetails;
  }

  getDiff(): unknown {
    return this.reviewGuideVersion
      ? { diff: GUIDE_FIXTURE_DIFF }
      : REMOTE_PROCEDURE_RESULT_FIXTURES.forgeGetPrDiff;
  }

  getGuide(): unknown {
    const version = this.reviewGuideVersion;
    if (!version) return REMOTE_PROCEDURE_RESULT_FIXTURES.forgeGetPrReviewGuide;
    const title = version === 1 ? "Fixture guide" : "Refreshed guide";
    return {
      status: "ready",
      stale: false,
      diffHash: GUIDE_FIXTURE_HASH,
      guide: {
        version: 1,
        fingerprint: `fixture-guide-${version}`,
        createdAt: "2026-08-12T00:00:00.000Z",
        model: "fixture-guide-model",
        summary: "Review the two changed declarations.",
        stops: ["first", "second"].map((position, index) => ({
          title: `${title} ${position} stop`,
          body: `Inspect the ${position} change.`,
          lookClosely: index === 1,
          files: [GUIDE_FIXTURE_PATH],
          questions: [],
          excerpts: [
            {
              path: GUIDE_FIXTURE_PATH,
              side: "RIGHT",
              startLine: index + 1,
              endLine: index + 1,
              text: `const ${position} = ${index + 1};`,
            },
          ],
        })),
      },
    };
  }

  writeGuide(): unknown {
    if (this.reviewGuideVersion) this.reviewGuideVersion++;
    return REMOTE_PROCEDURE_RESULT_FIXTURES.forgeWritePrReviewGuide;
  }

  listLabels(): unknown {
    return this.reviewMetadata
      ? { labels: METADATA_LABELS, truncated: false }
      : REMOTE_PROCEDURE_RESULT_FIXTURES.forgeListPrLabelCandidates;
  }

  listReviewers(body: Record<string, unknown>): unknown {
    if (!this.reviewMetadata) return REMOTE_PROCEDURE_RESULT_FIXTURES.forgeListPrReviewerCandidates;
    const query = String(body.query ?? "").toLowerCase();
    return {
      reviewers: METADATA_REVIEWERS.filter((reviewer) =>
        reviewer.name.toLowerCase().includes(query),
      ),
      truncated: false,
    };
  }

  setLabels(body: Record<string, unknown>): undefined {
    if (this.reviewMetadata) {
      for (const label of Array.isArray(body.add) ? (body.add as string[]) : [])
        this.reviewMetadata.labels.add(label);
      for (const label of Array.isArray(body.remove) ? (body.remove as string[]) : [])
        this.reviewMetadata.labels.delete(label);
    }
    return undefined;
  }

  requestReviewers(body: Record<string, unknown>): undefined {
    if (this.reviewMetadata) {
      for (const reviewer of Array.isArray(body.add) ? (body.add as { id: string }[]) : [])
        this.reviewMetadata.reviewers.add(reviewer.id);
      for (const reviewer of Array.isArray(body.remove) ? (body.remove as { id: string }[]) : [])
        this.reviewMetadata.reviewers.delete(reviewer.id);
    }
    return undefined;
  }
}
