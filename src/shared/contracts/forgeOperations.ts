import { z } from "zod";
import { forgeAccountRefSchema } from "./forge";
import {
  ghCreatePrPayloadSchema,
  ghGetPrForBranchPayloadSchema,
  ghListPrsPayloadSchema,
  ghListPullRequestsPayloadSchema,
  ghMergePrPayloadSchema,
  ghMergePrAtHeadPayloadSchema,
  ghClosePrPayloadSchema,
  ghReopenPrPayloadSchema,
  ghMarkPrReadyPayloadSchema,
  ghUpdatePrBranchPayloadSchema,
  ghGetPrChecksPayloadSchema,
  ghGetPrFilesPayloadSchema,
  ghGetPrDiffPayloadSchema,
  ghGetPrDetailsPayloadSchema,
  ghPostPrCommentPayloadSchema,
  ghSubmitPrReviewPayloadSchema,
} from "./github";

// Account-scoped calls use distinct procedure names. A pre-forge supervisor
// must reject them instead of stripping the account and acting as another user.
const account = {
  forgeAccount: forgeAccountRefSchema.optional(),
  forgeRepository: z.string().min(1).optional(),
};
export const forgeCreatePrPayloadSchema = ghCreatePrPayloadSchema.extend(account);
export const forgeGetPrForBranchPayloadSchema = ghGetPrForBranchPayloadSchema.extend(account);
export const forgeListPrsPayloadSchema = ghListPrsPayloadSchema.extend(account);
export const forgeListPullRequestsPayloadSchema = ghListPullRequestsPayloadSchema.extend(account);
export const forgeMergePrPayloadSchema = ghMergePrPayloadSchema.extend(account);
export const forgeMergePrAtHeadPayloadSchema = ghMergePrAtHeadPayloadSchema.extend(account);
export const forgeClosePrPayloadSchema = ghClosePrPayloadSchema.extend(account);
export const forgeReopenPrPayloadSchema = ghReopenPrPayloadSchema.extend(account);
export const forgeMarkPrReadyPayloadSchema = ghMarkPrReadyPayloadSchema.extend(account);
export const forgeUpdatePrBranchPayloadSchema = ghUpdatePrBranchPayloadSchema.extend(account);
export const forgeGetPrChecksPayloadSchema = ghGetPrChecksPayloadSchema.extend(account);
export const forgeGetPrFilesPayloadSchema = ghGetPrFilesPayloadSchema.extend(account);
export const forgeGetPrDiffPayloadSchema = ghGetPrDiffPayloadSchema.extend(account);
export const forgeGetPrDetailsPayloadSchema = ghGetPrDetailsPayloadSchema.extend(account);
export const forgePostPrCommentPayloadSchema = ghPostPrCommentPayloadSchema.extend(account);
export const forgeSubmitPrReviewPayloadSchema = ghSubmitPrReviewPayloadSchema.extend(account);
export type ForgeCreatePrPayload = z.infer<typeof forgeCreatePrPayloadSchema>;
export type ForgeGetPrForBranchPayload = z.infer<typeof forgeGetPrForBranchPayloadSchema>;
export type ForgeListPrsPayload = z.infer<typeof forgeListPrsPayloadSchema>;
export type ForgeListPullRequestsPayload = z.infer<typeof forgeListPullRequestsPayloadSchema>;
export type ForgeMergePrPayload = z.infer<typeof forgeMergePrPayloadSchema>;
export type ForgeMergePrAtHeadPayload = z.infer<typeof forgeMergePrAtHeadPayloadSchema>;
export type ForgeClosePrPayload = z.infer<typeof forgeClosePrPayloadSchema>;
export type ForgeReopenPrPayload = z.infer<typeof forgeReopenPrPayloadSchema>;
export type ForgeMarkPrReadyPayload = z.infer<typeof forgeMarkPrReadyPayloadSchema>;
export type ForgeUpdatePrBranchPayload = z.infer<typeof forgeUpdatePrBranchPayloadSchema>;
export type ForgeGetPrChecksPayload = z.infer<typeof forgeGetPrChecksPayloadSchema>;
export type ForgeGetPrFilesPayload = z.infer<typeof forgeGetPrFilesPayloadSchema>;
export type ForgeGetPrDiffPayload = z.infer<typeof forgeGetPrDiffPayloadSchema>;
export type ForgeGetPrDetailsPayload = z.infer<typeof forgeGetPrDetailsPayloadSchema>;
export type ForgePostPrCommentPayload = z.infer<typeof forgePostPrCommentPayloadSchema>;
export type ForgeSubmitPrReviewPayload = z.infer<typeof forgeSubmitPrReviewPayloadSchema>;
