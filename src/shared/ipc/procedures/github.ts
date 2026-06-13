import {
  getGitStatusPayloadSchema,
  ghClosePrPayloadSchema,
  ghCreatePrPayloadSchema,
  ghGetPrChecksPayloadSchema,
  ghGetPrDetailsPayloadSchema,
  ghGetPrDiffPayloadSchema,
  ghGetPrFilesPayloadSchema,
  ghGetPrForBranchPayloadSchema,
  ghListPrsPayloadSchema,
  ghMarkPrReadyPayloadSchema,
  ghMergePrPayloadSchema,
  ghPostPrCommentPayloadSchema,
  ghReopenPrPayloadSchema,
  ghSubmitPrReviewPayloadSchema,
  ghUpdatePrBranchPayloadSchema,
} from "../../contracts";
import type {
  GetGitStatusPayload,
  GhCheckAvailableResult,
  GhClosePrPayload,
  GhCreatePrPayload,
  GhGetPrChecksPayload,
  GhGetPrChecksResult,
  GhGetPrDetailsPayload,
  GhGetPrDetailsResult,
  GhGetPrDiffPayload,
  GhGetPrDiffResult,
  GhGetPrFilesPayload,
  GhGetPrFilesResult,
  GhGetPrForBranchPayload,
  GhListPrsPayload,
  GhListPrsResult,
  GhMarkPrReadyPayload,
  GhMergePrPayload,
  GhPostPrCommentPayload,
  GhReopenPrPayload,
  GhSubmitPrReviewPayload,
  GhUpdatePrBranchPayload,
  PrComment,
  PrData,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const githubProcedures = {
  ghCheckAvailable: definePayloadProcedure<
    GetGitStatusPayload,
    GhCheckAvailableResult,
    "supervisor"
  >("ghCheckAvailable", "supervisor", getGitStatusPayloadSchema),
  ghCreatePr: definePayloadProcedure<GhCreatePrPayload, PrData, "supervisor">(
    "ghCreatePr",
    "supervisor",
    ghCreatePrPayloadSchema,
  ),
  ghGetPrForBranch: definePayloadProcedure<GhGetPrForBranchPayload, PrData | null, "supervisor">(
    "ghGetPrForBranch",
    "supervisor",
    ghGetPrForBranchPayloadSchema,
  ),
  ghListPrs: definePayloadProcedure<GhListPrsPayload, GhListPrsResult, "supervisor">(
    "ghListPrs",
    "supervisor",
    ghListPrsPayloadSchema,
  ),
  ghMergePr: definePayloadProcedure<GhMergePrPayload, void, "supervisor">(
    "ghMergePr",
    "supervisor",
    ghMergePrPayloadSchema,
  ),
  ghClosePr: definePayloadProcedure<GhClosePrPayload, void, "supervisor">(
    "ghClosePr",
    "supervisor",
    ghClosePrPayloadSchema,
  ),
  ghReopenPr: definePayloadProcedure<GhReopenPrPayload, void, "supervisor">(
    "ghReopenPr",
    "supervisor",
    ghReopenPrPayloadSchema,
  ),
  ghMarkPrReady: definePayloadProcedure<GhMarkPrReadyPayload, void, "supervisor">(
    "ghMarkPrReady",
    "supervisor",
    ghMarkPrReadyPayloadSchema,
  ),
  ghGetPrChecks: definePayloadProcedure<GhGetPrChecksPayload, GhGetPrChecksResult, "supervisor">(
    "ghGetPrChecks",
    "supervisor",
    ghGetPrChecksPayloadSchema,
  ),
  ghGetPrFiles: definePayloadProcedure<GhGetPrFilesPayload, GhGetPrFilesResult, "supervisor">(
    "ghGetPrFiles",
    "supervisor",
    ghGetPrFilesPayloadSchema,
  ),
  ghGetPrDiff: definePayloadProcedure<GhGetPrDiffPayload, GhGetPrDiffResult, "supervisor">(
    "ghGetPrDiff",
    "supervisor",
    ghGetPrDiffPayloadSchema,
  ),
  ghSubmitPrReview: definePayloadProcedure<GhSubmitPrReviewPayload, void, "supervisor">(
    "ghSubmitPrReview",
    "supervisor",
    ghSubmitPrReviewPayloadSchema,
  ),
  ghUpdatePrBranch: definePayloadProcedure<GhUpdatePrBranchPayload, void, "supervisor">(
    "ghUpdatePrBranch",
    "supervisor",
    ghUpdatePrBranchPayloadSchema,
  ),
  ghGetPrDetails: definePayloadProcedure<GhGetPrDetailsPayload, GhGetPrDetailsResult, "supervisor">(
    "ghGetPrDetails",
    "supervisor",
    ghGetPrDetailsPayloadSchema,
  ),
  ghPostPrComment: definePayloadProcedure<GhPostPrCommentPayload, PrComment, "supervisor">(
    "ghPostPrComment",
    "supervisor",
    ghPostPrCommentPayloadSchema,
  ),
} as const;
