import { z } from "zod";
import { projectLocationSchema, threadPresentationModeSchema } from "./common";

const SKILL_NAME_PATTERN = /^(?!.*--)[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const GITHUB_REPOSITORY_SOURCE_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu;

export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}

export function isGitHubRepositorySource(source: string): boolean {
  return GITHUB_REPOSITORY_SOURCE_PATTERN.test(source);
}

export const skillScopeSchema = z.enum(["global", "project"]);
export type SkillScope = z.infer<typeof skillScopeSchema>;

export const skillAvailabilitySchema = z.enum(["shared", "poracode"]);
export type SkillAvailability = z.infer<typeof skillAvailabilitySchema>;

export const skillOriginSchema = z.enum(["managed", "external", "built-in", "plugin"]);
export type SkillOrigin = z.infer<typeof skillOriginSchema>;

export const skillImportModeSchema = z.enum(["copy", "link"]);
export type SkillImportMode = z.infer<typeof skillImportModeSchema>;

export const skillImportStateSchema = z.enum(["available", "already-imported", "conflict"]);
export type SkillImportState = z.infer<typeof skillImportStateSchema>;

export const skillInvalidReasonSchema = z.enum([
  "read-error",
  "missing-file",
  "too-large",
  "missing-frontmatter",
  "missing-name",
  "invalid-name",
  "name-mismatch",
  "missing-description",
  "description-too-long",
]);
export type SkillInvalidReason = z.infer<typeof skillInvalidReasonSchema>;

export const skillEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  folderName: z.string().min(1),
  absolutePath: z.string().min(1),
  skillFilePath: z.string().min(1),
  rootPath: z.string().min(1),
  providerId: z.string().min(1),
  providerLabel: z.string().min(1),
  providerGroupId: z.string().min(1).optional(),
  providerGroupLabel: z.string().min(1).optional(),
  providerGroupOrder: z.number().int().optional(),
  scope: skillScopeSchema,
  scopeLabel: z.string().min(1),
  availability: skillAvailabilitySchema.optional(),
  origin: skillOriginSchema,
  pluginId: z.string().min(1).optional(),
  pluginName: z.string().min(1).optional(),
  enabled: z.boolean(),
  mutable: z.boolean(),
  valid: z.boolean(),
  portable: z.boolean().optional(),
  linked: z.boolean(),
  importState: skillImportStateSchema.optional(),
  sourcePath: z.string().min(1).optional(),
  invalidReason: skillInvalidReasonSchema.optional(),
});
export type SkillEntry = z.infer<typeof skillEntrySchema>;

export const skillScanIssueSchema = z.object({
  providerId: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
});
export type SkillScanIssue = z.infer<typeof skillScanIssueSchema>;

export const skillScanResultSchema = z.object({
  skills: z.array(skillEntrySchema),
  effectiveSkillIds: z.array(z.string()),
  invocation: z.enum(["slash", "dollar", "prompt", "skill"]).nullable(),
  issues: z.array(skillScanIssueSchema),
  canLinkToGlobal: z.boolean(),
});
export type SkillScanResult = z.infer<typeof skillScanResultSchema>;

export const scanSkillsPayloadSchema = z.object({
  projectLocation: projectLocationSchema.optional(),
  wslDistro: z.string().min(1).optional(),
  agentKind: z.string().min(1).optional(),
  presentationMode: threadPresentationModeSchema.optional(),
});
export type ScanSkillsPayload = z.infer<typeof scanSkillsPayloadSchema>;

export const setSkillEnabledPayloadSchema = z.object({
  absolutePath: z.string().min(1),
  enabled: z.boolean(),
  projectLocation: projectLocationSchema.optional(),
  wslDistro: z.string().min(1).optional(),
});
export type SetSkillEnabledPayload = z.infer<typeof setSkillEnabledPayloadSchema>;

export const deleteSkillPayloadSchema = z.object({
  absolutePath: z.string().min(1),
  projectLocation: projectLocationSchema.optional(),
  wslDistro: z.string().min(1).optional(),
});
export type DeleteSkillPayload = z.infer<typeof deleteSkillPayloadSchema>;

export const importSkillPayloadSchema = z.object({
  sourcePath: z.string().min(1),
  sourceProjectLocation: projectLocationSchema.optional(),
  sourceWslDistro: z.string().min(1).optional(),
  destinationScope: skillScopeSchema,
  availability: skillAvailabilitySchema.optional(),
  mode: skillImportModeSchema,
  replace: z.boolean().default(false),
  projectLocation: projectLocationSchema.optional(),
  wslDistro: z.string().min(1).optional(),
});
export type ImportSkillPayload = z.infer<typeof importSkillPayloadSchema>;

export const importSkillsPayloadSchema = z.object({
  skills: z.array(importSkillPayloadSchema).min(1),
});
export type ImportSkillsPayload = z.infer<typeof importSkillsPayloadSchema>;

export const importSkillsResultSchema = z.object({
  imported: z.array(z.string()),
});
export type ImportSkillsResult = z.infer<typeof importSkillsResultSchema>;

export const skillMarketplaceIdSchema = z.enum(["skills-sh", "skills-directory"]);
export type SkillMarketplaceId = z.infer<typeof skillMarketplaceIdSchema>;

export const marketplaceSkillSchema = z.object({
  id: z.string().min(1),
  marketplace: skillMarketplaceIdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  source: z.string().min(1),
  skillId: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  sourceRef: z.string().min(1).optional(),
  sourcePath: z.string().min(1).optional(),
  installs: z.number().int().nonnegative().optional(),
  weeklyInstalls: z.array(z.number().int().nonnegative()).optional(),
  stars: z.number().int().nonnegative().optional(),
  votes: z.number().int().nonnegative().optional(),
  securityGrade: z.enum(["A", "B", "C", "D", "F"]).optional(),
  securityScore: z.number().min(0).max(100).optional(),
  updatedAt: z.string().min(1).optional(),
  official: z.boolean(),
  rank: z.number().int().positive(),
});
export type MarketplaceSkill = z.infer<typeof marketplaceSkillSchema>;

export const skillMarketplaceResultSchema = z.object({
  marketplace: skillMarketplaceIdSchema,
  skills: z.array(marketplaceSkillSchema),
  total: z.number().int().nonnegative(),
});
export type SkillMarketplaceResult = z.infer<typeof skillMarketplaceResultSchema>;

export const listSkillMarketplacePayloadSchema = z.object({
  marketplace: skillMarketplaceIdSchema,
  query: z.string().trim().max(200).optional(),
  sort: z.enum(["rank", "stars", "recent", "votes"]).default("rank"),
});
export type ListSkillMarketplacePayload = z.infer<typeof listSkillMarketplacePayloadSchema>;

export const installMarketplaceSkillPayloadSchema = z.object({
  marketplace: skillMarketplaceIdSchema,
  marketplaceSkillId: z.string().min(1),
  destinationScope: skillScopeSchema,
  availability: skillAvailabilitySchema.optional(),
  replace: z.boolean().default(false),
  projectLocation: projectLocationSchema.optional(),
  wslDistro: z.string().min(1).optional(),
});
export type InstallMarketplaceSkillPayload = z.infer<typeof installMarketplaceSkillPayloadSchema>;

export const installMarketplaceSkillResultSchema = z.object({
  installed: z.string().min(1),
});
export type InstallMarketplaceSkillResult = z.infer<typeof installMarketplaceSkillResultSchema>;
