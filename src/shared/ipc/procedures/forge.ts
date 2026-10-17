import * as c from "../../contracts";
import { definePayloadProcedure, omittedResultSchema } from "../core";

// Distinct names protect account selection and merge preconditions from older hosts.
export const forgeProcedures = {
  forgeGetRepository: definePayloadProcedure<
    c.ForgeGetRepositoryPayload,
    c.ForgeGetRepositoryResult,
    "supervisor"
  >(
    "forgeGetRepository",
    "supervisor",
    c.forgeGetRepositoryPayloadSchema,
    c.forgeGetRepositoryResultSchema,
  ),
  forgeEditPr: definePayloadProcedure<c.ForgeEditPrPayload, void, "supervisor">(
    "forgeEditPr",
    "supervisor",
    c.forgeEditPrPayloadSchema,
    omittedResultSchema,
  ),
  forgeCreatePr: definePayloadProcedure<c.ForgeCreatePrPayload, c.PrData, "supervisor">(
    "forgeCreatePr",
    "supervisor",
    c.forgeCreatePrPayloadSchema,
    c.ghCreatePrResultSchema,
  ),
  forgeGetPrForBranch: definePayloadProcedure<
    c.ForgeGetPrForBranchPayload,
    c.PrData | null,
    "supervisor"
  >(
    "forgeGetPrForBranch",
    "supervisor",
    c.forgeGetPrForBranchPayloadSchema,
    c.ghGetPrForBranchResultSchema,
  ),
  forgeListPrs: definePayloadProcedure<c.ForgeListPrsPayload, c.GhListPrsResult, "supervisor">(
    "forgeListPrs",
    "supervisor",
    c.forgeListPrsPayloadSchema,
    c.ghListPrsResultSchema,
  ),
  forgeListPullRequests: definePayloadProcedure<
    c.ForgeListPullRequestsPayload,
    c.GhListPullRequestsResult,
    "supervisor"
  >(
    "forgeListPullRequests",
    "supervisor",
    c.forgeListPullRequestsPayloadSchema,
    c.ghListPullRequestsResultSchema,
  ),
  forgeMergePr: definePayloadProcedure<c.ForgeMergePrPayload, void, "supervisor">(
    "forgeMergePr",
    "supervisor",
    c.forgeMergePrPayloadSchema,
    omittedResultSchema,
  ),
  forgeMergePrAtHead: definePayloadProcedure<c.ForgeMergePrAtHeadPayload, void, "supervisor">(
    "forgeMergePrAtHead",
    "supervisor",
    c.forgeMergePrAtHeadPayloadSchema,
    omittedResultSchema,
  ),
  forgeClosePr: definePayloadProcedure<c.ForgeClosePrPayload, void, "supervisor">(
    "forgeClosePr",
    "supervisor",
    c.forgeClosePrPayloadSchema,
    omittedResultSchema,
  ),
  forgeReopenPr: definePayloadProcedure<c.ForgeReopenPrPayload, void, "supervisor">(
    "forgeReopenPr",
    "supervisor",
    c.forgeReopenPrPayloadSchema,
    omittedResultSchema,
  ),
  forgeMarkPrReady: definePayloadProcedure<c.ForgeMarkPrReadyPayload, void, "supervisor">(
    "forgeMarkPrReady",
    "supervisor",
    c.forgeMarkPrReadyPayloadSchema,
    omittedResultSchema,
  ),
  forgeUpdatePrBranch: definePayloadProcedure<c.ForgeUpdatePrBranchPayload, void, "supervisor">(
    "forgeUpdatePrBranch",
    "supervisor",
    c.forgeUpdatePrBranchPayloadSchema,
    omittedResultSchema,
  ),
  forgeGetPrChecks: definePayloadProcedure<
    c.ForgeGetPrChecksPayload,
    c.GhGetPrChecksResult,
    "supervisor"
  >("forgeGetPrChecks", "supervisor", c.forgeGetPrChecksPayloadSchema, c.ghGetPrChecksResultSchema),
  forgeGetPrFiles: definePayloadProcedure<
    c.ForgeGetPrFilesPayload,
    c.GhGetPrFilesResult,
    "supervisor"
  >("forgeGetPrFiles", "supervisor", c.forgeGetPrFilesPayloadSchema, c.ghGetPrFilesResultSchema),
  forgeGetPrDiff: definePayloadProcedure<
    c.ForgeGetPrDiffPayload,
    c.GhGetPrDiffResult,
    "supervisor"
  >("forgeGetPrDiff", "supervisor", c.forgeGetPrDiffPayloadSchema, c.ghGetPrDiffResultSchema),
  forgeGetPrDetails: definePayloadProcedure<
    c.ForgeGetPrDetailsPayload,
    c.GhGetPrDetailsResult,
    "supervisor"
  >(
    "forgeGetPrDetails",
    "supervisor",
    c.forgeGetPrDetailsPayloadSchema,
    c.ghGetPrDetailsResultSchema,
  ),
  forgeGetPrReviewComments: definePayloadProcedure<
    c.ForgeGetPrDetailsPayload,
    c.GhGetPrReviewThreadsResult,
    "supervisor"
  >(
    "forgeGetPrReviewComments",
    "supervisor",
    c.forgeGetPrDetailsPayloadSchema,
    c.ghGetPrReviewThreadsResultSchema,
  ),
  forgePostPrComment: definePayloadProcedure<
    c.ForgePostPrCommentPayload,
    c.PrComment,
    "supervisor"
  >(
    "forgePostPrComment",
    "supervisor",
    c.forgePostPrCommentPayloadSchema,
    c.ghPostPrCommentResultSchema,
  ),
  forgeSubmitPrReview: definePayloadProcedure<c.ForgeSubmitPrReviewPayload, void, "supervisor">(
    "forgeSubmitPrReview",
    "supervisor",
    c.forgeSubmitPrReviewPayloadSchema,
    omittedResultSchema,
  ),
} as const;
