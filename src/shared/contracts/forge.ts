import { z } from "zod";
import { projectLocationSchema } from "./common";

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
