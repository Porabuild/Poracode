import { z } from "zod";
import { agentKindSchema, projectLocationSchema } from "./common";
import { modelSelectionSchema } from "../selectionBinding.schemas";

export const forgeKindSchema = z.enum([
  "github",
  "gitlab",
  "forgejo",
  "gitea",
  "bitbucket",
  "azure-devops",
  "gitcafe",
]);
export type ForgeKind = z.infer<typeof forgeKindSchema>;

/** Public identity only. Credentials stay in the project's supervisor runtime. */
export const forgeAccountRefSchema = z.object({
  forge: forgeKindSchema,
  /** HTTPS origin, including a deployment subpath or Azure organization. */
  host: z
    .string()
    .refine((value) => {
      return (
        /^https:\/\//i.test(value) &&
        !Array.from(value).some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        ) &&
        !/[\\?#]/.test(value) &&
        !value
          .slice(value.indexOf("://") + 3)
          .split("/")[0]!
          .includes("@")
      );
    })
    .url(),
  login: z.string().min(1),
});
export type ForgeAccountRef = z.infer<typeof forgeAccountRefSchema>;

export const forgeReviewCapabilitiesSchema = z.object({
  mergeMethods: z.array(z.enum(["merge", "squash", "rebase"])),
  reviewDecisions: z.array(z.enum(["approve", "request-changes", "comment"])),
  draft: z.boolean(),
  reopen: z.boolean(),
  updateBranch: z.boolean(),
  rebaseBranch: z.boolean(),
  edit: z.boolean(),
  checks: z.boolean(),
  reviewThreads: z.boolean(),
  /** Absent on older hosts, which only support client-local viewed marks. */
  viewedFiles: z.enum(["forge", "host"]).optional(),
  commentEditing: z.array(z.enum(["conversation", "inline"])).optional(),
  reviewGuides: z.literal(true).optional(),
  /** The host atomically rejects a merge when the reviewed head has changed. */
  expectedHeadMerge: z.boolean(),
  /** Complete merge-readiness data is available for watched auto-merge. */
  autoMerge: z.boolean(),
  /** Whether an automation checkout can push to this review's source repository. */
  autoFix: z.boolean(),
  adminMerge: z.boolean(),
});
export type ForgeReviewCapabilities = z.infer<typeof forgeReviewCapabilitiesSchema>;

export const forgeRepositorySchema = z.object({
  forge: forgeKindSchema,
  host: z.string().min(1),
  /** Full namespace; GitLab subgroups and Azure project identity are preserved. */
  repository: z.string().min(1),
  remote: z.string().min(1),
  account: forgeAccountRefSchema.optional(),
  capabilities: forgeReviewCapabilitiesSchema,
});
export type ForgeRepository = z.infer<typeof forgeRepositorySchema>;

/** Persisted public authority for one review watch; never includes credentials. */
export const forgeReviewScopeSchema = z
  .object({
    version: z.literal(1),
    forge: forgeKindSchema,
    host: forgeAccountRefSchema.shape.host,
    repository: z.string().min(1),
    account: forgeAccountRefSchema,
  })
  .strict()
  .refine((value) => value.forge === value.account.forge && value.host === value.account.host);
export type ForgeReviewScope = z.infer<typeof forgeReviewScopeSchema>;

export const forgeGetRepositoryPayloadSchema = z.object({
  projectLocation: projectLocationSchema,
  forgeAccount: forgeAccountRefSchema.optional(),
  forgeRepository: z.string().min(1).optional(),
});
export type ForgeGetRepositoryPayload = z.infer<typeof forgeGetRepositoryPayloadSchema>;
export const forgeGetRepositoryResultSchema = z.object({
  repository: forgeRepositorySchema.nullable(),
});
export type ForgeGetRepositoryResult = z.infer<typeof forgeGetRepositoryResultSchema>;

export const forgeEditPrPayloadSchema = forgeGetRepositoryPayloadSchema
  .extend({
    prNumber: z.number().int().positive(),
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    baseBranch: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined || value.body !== undefined || value.baseBranch !== undefined,
  );
export type ForgeEditPrPayload = z.infer<typeof forgeEditPrPayloadSchema>;

export const forgeScopedPrPayloadSchema = forgeGetRepositoryPayloadSchema.extend({
  forgeAccount: forgeAccountRefSchema,
  forgeRepository: z.string().min(1),
  prNumber: z.number().int().positive(),
});
export const forgeGetPrViewedFilesPayloadSchema = forgeScopedPrPayloadSchema;
export type ForgeGetPrViewedFilesPayload = z.infer<typeof forgeGetPrViewedFilesPayloadSchema>;

export const forgeSetPrFileViewedPayloadSchema = forgeGetPrViewedFilesPayloadSchema.extend({
  path: z.string().min(1).max(4096),
  fingerprint: z.string().min(1).max(256).nullable(),
});
export type ForgeSetPrFileViewedPayload = z.infer<typeof forgeSetPrFileViewedPayloadSchema>;

export const forgePrViewedFilesResultSchema = z.object({
  storage: z.enum(["forge", "host"]),
  files: z.array(z.object({ path: z.string(), fingerprint: z.string() })),
  /** Host-computed fingerprints let native clients compare marks without forking the diff parser. */
  currentFiles: z.array(z.object({ path: z.string(), fingerprint: z.string() })).optional(),
  /** SHA-256 of the exact diff those fingerprints describe; clients bind it to their displayed diff. */
  diffHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type ForgePrViewedFilesResult = z.infer<typeof forgePrViewedFilesResultSchema>;

export const forgeEditPrCommentPayloadSchema = forgeScopedPrPayloadSchema.extend({
  commentId: z.string().min(1).max(256),
  threadId: z.string().min(1).max(256).optional(),
  body: z.string().min(1),
  expectedBody: z.string(),
});
export type ForgeEditPrCommentPayload = z.infer<typeof forgeEditPrCommentPayloadSchema>;

export const forgeReviewGuideContentSchema = z.object({
  summary: z.string().min(1).max(16000),
  stops: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        body: z.string().min(1).max(16000),
        lookClosely: z.boolean(),
        files: z.array(z.string().min(1)).min(1),
        excerpts: z
          .array(
            z.object({
              path: z.string().min(1),
              side: z.enum(["LEFT", "RIGHT"]),
              startLine: z.number().int().positive(),
              endLine: z.number().int().positive(),
              text: z.string().min(1).max(32000),
            }),
          )
          .max(30),
        questions: z.array(z.string().min(1).max(1000)).max(5),
      }),
    )
    .min(1)
    .max(500),
});
export type ForgeReviewGuideContent = z.infer<typeof forgeReviewGuideContentSchema>;

export const forgeReviewGuideSchema = forgeReviewGuideContentSchema.extend({
  version: z.literal(1),
  fingerprint: z.string().min(1),
  createdAt: z.string(),
  model: z.string(),
});
export type ForgeReviewGuide = z.infer<typeof forgeReviewGuideSchema>;
export const forgeGetPrReviewGuidePayloadSchema = forgeScopedPrPayloadSchema;
export type ForgeGetPrReviewGuidePayload = z.infer<typeof forgeGetPrReviewGuidePayloadSchema>;
export const forgeWritePrReviewGuidePayloadSchema = forgeScopedPrPayloadSchema.extend({
  agentKind: agentKindSchema,
  selection: modelSelectionSchema.optional(),
  instructions: z.string().max(16000).optional(),
  language: z.string().min(1).optional(),
});
export type ForgeWritePrReviewGuidePayload = z.infer<typeof forgeWritePrReviewGuidePayloadSchema>;
export const forgePrReviewGuideResultSchema = z.object({
  status: z.enum(["empty", "generating", "ready", "failed"]),
  guide: forgeReviewGuideSchema.nullable(),
  stale: z.boolean(),
  /** Current host diff, allowing native clients to hide excerpts after a racing push. */
  diffHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type ForgePrReviewGuideResult = z.infer<typeof forgePrReviewGuideResultSchema>;
