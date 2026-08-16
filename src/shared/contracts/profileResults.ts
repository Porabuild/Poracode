import { z } from "zod";
import type {
  ProfileCoreStats,
  ProfileDevicesResponse,
  ProfileIdentityResponse,
  ProfileTokenStats,
} from "./profile";
import { aiActionTypeSchema, profileIdentitySchema, profileStatScopeSchema } from "./profile";
import {
  assertExactType,
  type AssertExact,
  type NormalizeExactOptionalProperties,
} from "./exactType";

const safeInt = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const safeNonNegInt = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const profileHeatmapIntensitySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

export const profileDeviceSchema = z.object({
  id: z.string(),
  label: z.string(),
  platform: z.string(),
  isCurrent: z.boolean().optional(),
  lastActiveAt: safeInt.optional(),
});

export const profileDevicesResponseSchema = z.object({
  devices: z.array(profileDeviceSchema),
  currentDeviceId: z.string(),
});

export const profileTotalsSchema = z.object({
  totalThreads: safeNonNegInt,
  totalPrompts: safeNonNegInt,
  messagesSent: safeNonNegInt,
  goalsSet: safeNonNegInt,
  longestTaskMs: safeNonNegInt,
  currentStreakDays: safeNonNegInt,
  longestStreakDays: safeNonNegInt,
  activeDays: safeNonNegInt,
});

export const profileHeatmapCellSchema = z.object({
  day: z.string(),
  count: safeNonNegInt,
  intensity: profileHeatmapIntensitySchema,
});

export const profileHeatmapSchema = z.object({
  metric: z.enum(["prompts", "tokens"]),
  windowDays: safeNonNegInt,
  cells: z.array(profileHeatmapCellSchema),
  max: safeNonNegInt,
});

export const profileBreakdownEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number(),
  percent: z.number(),
});

export const profileActiveHourSchema = z.object({
  hour: z.number().int().min(0).max(23),
  label: z.string(),
  count: safeNonNegInt,
});

export const profileInsightsSchema = z.object({
  topProvider: profileBreakdownEntrySchema.optional(),
  topModel: profileBreakdownEntrySchema.optional(),
  topReasoning: profileBreakdownEntrySchema.optional(),
  fastModePercent: z.number(),
  mostActiveHour: profileActiveHourSchema.optional(),
  skillsExplored: safeNonNegInt,
  totalSkillsUsed: safeNonNegInt,
  workflowRuns: safeNonNegInt,
  subagentRuns: safeNonNegInt,
  mcpToolCalls: safeNonNegInt,
});

export const profileSkillUsageSchema = z.object({
  name: z.string(),
  displayName: z.string(),
  kind: z.enum(["skill", "subagent", "tool", "mcp"]),
  runCount: safeNonNegInt,
});

export const profileAccountRefSchema = z.object({
  key: z.string(),
  label: z.string(),
});

export const profileAiActionSchema = z.object({
  type: aiActionTypeSchema,
  label: z.string(),
  count: safeNonNegInt,
  topProvider: z.string().optional(),
  topModel: z.string().optional(),
});

export const profileCoreStatsSchema = z.object({
  scope: profileStatScopeSchema,
  device: profileDeviceSchema,
  generatedAt: safeInt,
  timezoneOffsetMinutes: safeInt,
  identity: profileIdentitySchema,
  totals: profileTotalsSchema,
  promptHeatmap: profileHeatmapSchema,
  insights: profileInsightsSchema,
  providers: z.array(profileBreakdownEntrySchema),
  accounts: z.array(profileBreakdownEntrySchema),
  models: z.array(profileBreakdownEntrySchema),
  modes: z.array(profileBreakdownEntrySchema),
  skills: z.array(profileSkillUsageSchema),
  mcps: z.array(profileSkillUsageSchema),
  aiActions: z.array(profileAiActionSchema),
  availableAccounts: z.array(profileAccountRefSchema),
});

export const profileTokenProviderSchema = z.object({
  provider: z.string(),
  label: z.string(),
  tokens: safeNonNegInt,
  percent: z.number(),
  estimatedCostUsd: z.number().optional(),
});

export const profileTokenStatsSchema = z.object({
  available: z.boolean(),
  scope: profileStatScopeSchema,
  device: profileDeviceSchema,
  generatedAt: safeInt,
  timezoneOffsetMinutes: safeInt,
  windowDays: safeNonNegInt,
  lifetimeTokens: safeNonNegInt,
  peakDayTokens: safeNonNegInt,
  peakDay: z.string().optional(),
  providers: z.array(profileTokenProviderSchema),
  accounts: z.array(profileTokenProviderSchema),
  models: z.array(profileBreakdownEntrySchema),
  tokenHeatmap: profileHeatmapSchema,
  unavailableProviders: z.array(z.string()),
});

export const profileIdentityResponseSchema = z.object({
  identity: profileIdentitySchema,
  device: profileDeviceSchema,
});

assertExactType<
  AssertExact<
    z.output<typeof profileDevicesResponseSchema>,
    NormalizeExactOptionalProperties<ProfileDevicesResponse>
  >
>();
assertExactType<
  AssertExact<
    z.output<typeof profileCoreStatsSchema>,
    NormalizeExactOptionalProperties<ProfileCoreStats>
  >
>();
assertExactType<
  AssertExact<
    z.output<typeof profileTokenStatsSchema>,
    NormalizeExactOptionalProperties<ProfileTokenStats>
  >
>();
assertExactType<
  AssertExact<
    z.output<typeof profileIdentityResponseSchema>,
    NormalizeExactOptionalProperties<ProfileIdentityResponse>
  >
>();
