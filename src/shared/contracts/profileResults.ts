import { z } from "zod";
import { profileCostStatsSchema, usageMoneySchema } from "./costHistory";
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

export const profileHourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
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

export const profilePeriodSnapshotSchema = z.object({
  days: safeNonNegInt,
  activeDays: safeNonNegInt,
  threads: safeNonNegInt,
  prompts: safeNonNegInt,
  messages: safeNonNegInt,
  goals: safeNonNegInt,
  longestTaskMs: safeNonNegInt,
  totalTurnMs: safeNonNegInt,
  fastTurns: safeNonNegInt,
  effortTurns: safeNonNegInt,
  skillsUsed: safeNonNegInt,
  workflowRuns: safeNonNegInt,
  subagentRuns: safeNonNegInt,
  mcpToolCalls: safeNonNegInt,
  weekdayPrompts: safeNonNegInt,
  weekendPrompts: safeNonNegInt,
  providers: z.array(profileBreakdownEntrySchema),
  models: z.array(profileBreakdownEntrySchema),
  modes: z.array(profileBreakdownEntrySchema),
  efforts: z.array(profileBreakdownEntrySchema),
  hours: z.array(profileHourBucketSchema),
  skills: z.array(profileSkillUsageSchema),
  mcps: z.array(profileSkillUsageSchema),
  aiActions: z.array(profileAiActionSchema),
});

export const profileRecentActivitySchema = z.object({
  today: profilePeriodSnapshotSchema,
  yesterday: profilePeriodSnapshotSchema,
  last7d: profilePeriodSnapshotSchema,
  prev7d: profilePeriodSnapshotSchema,
  last30d: profilePeriodSnapshotSchema,
  prev30d: profilePeriodSnapshotSchema,
  windowHours: z.array(profileHourBucketSchema).optional(),
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
  recent: profileRecentActivitySchema.optional(),
});

export const profileTokenProviderSchema = z.object({
  provider: z.string(),
  label: z.string(),
  tokens: safeNonNegInt,
  percent: z.number(),
  estimatedCostUsd: z.number().optional(),
});

export const profileTokenPeriodSnapshotSchema = z.object({
  tokens: safeNonNegInt,
  estimatedUsd: z.number().finite().nonnegative(),
  observed: z.array(usageMoneySchema),
  inputTokens: safeNonNegInt,
  outputTokens: safeNonNegInt,
  cacheReadTokens: safeNonNegInt,
  cacheWriteTokens: safeNonNegInt,
  providers: z.array(profileTokenProviderSchema),
  models: z.array(profileBreakdownEntrySchema),
});

export const profileRecentTokenActivitySchema = z.object({
  today: profileTokenPeriodSnapshotSchema,
  yesterday: profileTokenPeriodSnapshotSchema,
  last7d: profileTokenPeriodSnapshotSchema,
  prev7d: profileTokenPeriodSnapshotSchema,
  last30d: profileTokenPeriodSnapshotSchema,
  prev30d: profileTokenPeriodSnapshotSchema,
});

export const profileTokenStatsSchema = z.object({
  costs: profileCostStatsSchema.optional(),
  recent: profileRecentTokenActivitySchema.optional(),
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
