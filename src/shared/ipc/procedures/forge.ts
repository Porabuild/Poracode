import * as c from "../../contracts";
import { definePayloadProcedure, omittedResultSchema } from "../core";

// Distinct names protect account selection and merge preconditions from older hosts.
export const forgeProcedures = {
  forgeGetPrReviewGuide: definePayloadProcedure<
    c.ForgeGetPrReviewGuidePayload,
    c.ForgePrReviewGuideResult,
    "supervisor"
  >(
    "forgeGetPrReviewGuide",
    "supervisor",
    c.forgeGetPrReviewGuidePayloadSchema,
    c.forgePrReviewGuideResultSchema,
  ),
  forgeWritePrReviewGuide: definePayloadProcedure<
    c.ForgeWritePrReviewGuidePayload,
    c.ForgePrReviewGuideResult,
    "supervisor"
  >(
    "forgeWritePrReviewGuide",
    "supervisor",
    c.forgeWritePrReviewGuidePayloadSchema,
    c.forgePrReviewGuideResultSchema,
  ),
  forgeEditPrComment: definePayloadProcedure<c.ForgeEditPrCommentPayload, void, "supervisor">(
    "forgeEditPrComment",
    "supervisor",
    c.forgeEditPrCommentPayloadSchema,
    omittedResultSchema,
  ),
  forgeGetPrViewedFiles: definePayloadProcedure<
    c.ForgeGetPrViewedFilesPayload,
    c.ForgePrViewedFilesResult,
    "supervisor"
  >(
    "forgeGetPrViewedFiles",
    "supervisor",
    c.forgeGetPrViewedFilesPayloadSchema,
    c.forgePrViewedFilesResultSchema,
  ),
  forgeSetPrFileViewed: definePayloadProcedure<
    c.ForgeSetPrFileViewedPayload,
    c.ForgePrViewedFilesResult,
    "supervisor"
  >(
    "forgeSetPrFileViewed",
    "supervisor",
    c.forgeSetPrFileViewedPayloadSchema,
    c.forgePrViewedFilesResultSchema,
  ),
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
  forgeListPullRequestsInState: definePayloadProcedure<
    c.ForgeListPullRequestsInStatePayload,
    c.GhListPullRequestsResult,
    "supervisor"
  >(
    "forgeListPullRequestsInState",
    "supervisor",
    c.forgeListPullRequestsInStatePayloadSchema,
    c.ghListPullRequestsResultSchema,
  ),
  forgeListPrLabelCandidates: definePayloadProcedure<
    c.ForgeListPrLabelCandidatesPayload,
    c.ForgePrLabelCandidatesResult,
    "supervisor"
  >(
    "forgeListPrLabelCandidates",
    "supervisor",
    c.forgeListPrLabelCandidatesPayloadSchema,
    c.forgePrLabelCandidatesResultSchema,
  ),
  forgeListPrReviewerCandidates: definePayloadProcedure<
    c.ForgeListPrReviewerCandidatesPayload,
    c.ForgePrReviewerCandidatesResult,
    "supervisor"
  >(
    "forgeListPrReviewerCandidates",
    "supervisor",
    c.forgeListPrReviewerCandidatesPayloadSchema,
    c.forgePrReviewerCandidatesResultSchema,
  ),
  forgeSetPrLabels: definePayloadProcedure<c.ForgeSetPrLabelsPayload, void, "supervisor">(
    "forgeSetPrLabels",
    "supervisor",
    c.forgeSetPrLabelsPayloadSchema,
    omittedResultSchema,
  ),
  forgeRequestPrReviewers: definePayloadProcedure<
    c.ForgeRequestPrReviewersPayload,
    void,
    "supervisor"
  >(
    "forgeRequestPrReviewers",
    "supervisor",
    c.forgeRequestPrReviewersPayloadSchema,
    omittedResultSchema,
  ),
  forgeConvertPrToDraft: definePayloadProcedure<c.ForgeConvertPrToDraftPayload, void, "supervisor">(
    "forgeConvertPrToDraft",
    "supervisor",
    c.forgeConvertPrToDraftPayloadSchema,
    omittedResultSchema,
  ),
  forgeGetPrCommitDiff: definePayloadProcedure<
    c.ForgeGetPrCommitDiffPayload,
    c.ForgePrCommitDiffResult,
    "supervisor"
  >(
    "forgeGetPrCommitDiff",
    "supervisor",
    c.forgeGetPrCommitDiffPayloadSchema,
    c.forgePrCommitDiffResultSchema,
  ),
  forgeSetPrReaction: definePayloadProcedure<c.ForgeSetPrReactionPayload, void, "supervisor">(
    "forgeSetPrReaction",
    "supervisor",
    c.forgeSetPrReactionPayloadSchema,
    omittedResultSchema,
  ),
  forgeSubmitPrReviewDraft: definePayloadProcedure<
    c.ForgeSubmitPrReviewDraftPayload,
    void,
    "supervisor"
  >(
    "forgeSubmitPrReviewDraft",
    "supervisor",
    c.forgeSubmitPrReviewDraftPayloadSchema,
    omittedResultSchema,
  ),
} as const;
