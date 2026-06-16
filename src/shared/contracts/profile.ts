import { z } from "zod";

/**
 * Profile & usage-statistics contracts.
 *
 * These power the Profile page (a Codex/Synara-style identity + usage dashboard)
 * and are deliberately shaped to survive the jump from LOCAL-only aggregation to
 * the future Lightcode Cloud, where the same stats are synced and merged across
 * a user's devices.
 *
 * Cloud-readiness rules baked into the model:
 *  - Every computed stats blob is attributed to a {@link ProfileDevice}. Locally
 *    there is exactly one device; Cloud will persist one contribution per device
 *    and merge them server-side into a `scope: "all"` view, while still allowing
 *    the user to inspect any single device (`scope: "device"`).
 *  - `scope` is carried on every result so the same renderer code renders the
 *    "this device" and "all devices" views unchanged.
 *  - All shapes are plain JSON (no `Date`), so a blob can be uploaded verbatim.
 *  - Heatmap intensity is pre-bucketed (0-4) by the producer so the renderer
 *    stays dumb and a merged Cloud blob renders identically to a local one.
 *  - `timezoneOffsetMinutes` is echoed back so the consumer knows which local
 *    calendar the day/hour buckets were computed against.
 */

// -- Scope & device ---------------------------------------------------

export const profileStatScopeSchema = z.enum(["device", "all"]);
/** "device" = this install only; "all" = merged across the user's devices (Cloud). */
export type ProfileStatScope = z.infer<typeof profileStatScopeSchema>;

export interface ProfileDevice {
  /** Stable per-install id (generated once, persisted in app_state). */
  id: string;
  /** Human label, e.g. the machine hostname. */
  label: string;
  /** `process.platform` - "darwin" | "win32" | "linux". */
  platform: string;
  /** True for the machine this app instance is running on. */
  isCurrent?: boolean;
  /** Epoch ms this device was last seen reporting stats. */
  lastActiveAt?: number;
}

export interface ProfileDevicesResponse {
  devices: ProfileDevice[];
  currentDeviceId: string;
}

// -- Editable identity (local override; Cloud account later) -----------

export const profileIdentitySchema = z.object({
  name: z.string().max(80),
  /** Handle without the leading "@". */
  handle: z.string().max(40),
  /** Avatar background color token (any CSS color; defaults to an accent). */
  avatarColor: z.string().max(64),
  /** Plan label - "Local" today; the Cloud subscription tier later. */
  plan: z.string().max(40).optional(),
});
export type ProfileIdentity = z.infer<typeof profileIdentitySchema>;

// -- Aggregate building blocks ----------------------------------------

export interface ProfileTotals {
  totalThreads: number;
  /** Completed turns - one per user prompt that ran to completion. */
  totalPrompts: number;
  /** Messages the user sent via the composer (native user_message items). */
  messagesSent: number;
  /** Goals set in structured sessions. */
  goalsSet: number;
  /** Longest single turn (first input -> idle), in ms. */
  longestTaskMs: number;
  currentStreakDays: number;
  longestStreakDays: number;
  /** Distinct local days with activity within the heatmap window. */
  activeDays: number;
}

export type ProfileHeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export interface ProfileHeatmapCell {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  count: number;
  /** Pre-bucketed 0-4 relative to the window max. */
  intensity: ProfileHeatmapIntensity;
}

export interface ProfileHeatmap {
  metric: "prompts" | "tokens";
  windowDays: number;
  /** One cell per day across the window, oldest -> newest. */
  cells: ProfileHeatmapCell[];
  /** Max single-day count in the window (for legend / tooltips). */
  max: number;
}

/** A ranked slice (provider, model, reasoning effort, ...). */
export interface ProfileBreakdownEntry {
  key: string;
  label: string;
  /** Turns (core stats) or tokens (token stats) attributed to this slice. */
  count: number;
  /** 0-100, one decimal place. */
  percent: number;
}

export interface ProfileActiveHour {
  /** 0-23 local hour. */
  hour: number;
  label: string;
  count: number;
}

export interface ProfileInsights {
  topProvider?: ProfileBreakdownEntry;
  topModel?: ProfileBreakdownEntry;
  topReasoning?: ProfileBreakdownEntry;
  /** Share of turns run with fast mode on, 0-100. */
  fastModePercent: number;
  mostActiveHour?: ProfileActiveHour;
  /** Distinct skills/subagents invoked. */
  skillsExplored: number;
  /** Total skill/subagent invocations. */
  totalSkillsUsed: number;
}

export interface ProfileSkillUsage {
  name: string;
  /** `$skill` for skills, `@agent` for subagents, raw name for plain tools/MCP. */
  displayName: string;
  kind: "skill" | "subagent" | "tool" | "mcp";
  runCount: number;
}

/** A selectable account for the per-account stats filter (account-scoped key). */
export interface ProfileAccountRef {
  /** Account-scoped agent kind, e.g. "claude" or "claude:work". */
  key: string;
  /** Display label, e.g. "Claude" or "Claude - work". */
  label: string;
}

export const aiActionTypeSchema = z.enum(["commit", "pr", "conflict"]);
export type AiActionType = z.infer<typeof aiActionTypeSchema>;

/** AI-performed git actions (commits, PRs, conflict resolutions). */
export interface ProfileAiAction {
  type: AiActionType;
  label: string;
  count: number;
  /** Provider/model that performed the most of this action (display labels). */
  topProvider?: string;
  topModel?: string;
}

/** A single durable usage event captured at the canonical-event layer. */
export const usageEventInputSchema = z.object({
  ts: z.number(),
  kind: z.string().min(1),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  mode: z.string().nullable().optional(),
  fast: z.boolean().optional(),
  effort: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  value: z.number().optional(),
});
export type UsageEventInputPayload = z.infer<typeof usageEventInputSchema>;

export const appendUsageEventsSchema = z.object({
  events: z.array(usageEventInputSchema),
});
export type AppendUsageEventsPayload = z.infer<typeof appendUsageEventsSchema>;

// -- Core stats (fast: from the local SQLite store) -------------------

export interface ProfileCoreStats {
  scope: ProfileStatScope;
  device: ProfileDevice;
  /** Epoch ms when this blob was produced. */
  generatedAt: number;
  timezoneOffsetMinutes: number;
  identity: ProfileIdentity;
  totals: ProfileTotals;
  promptHeatmap: ProfileHeatmap;
  insights: ProfileInsights;
  /** Turn-weighted provider mix, folded to the base provider (global). */
  providers: ProfileBreakdownEntry[];
  /** Turn-weighted per-account mix (each profile of a provider separately). */
  accounts: ProfileBreakdownEntry[];
  /** Turn-weighted model mix (label includes provider). */
  models: ProfileBreakdownEntry[];
  /** Threads started by presentation mode (chat vs CLI). */
  modes: ProfileBreakdownEntry[];
  /** Top skills by run count (`$skill`). */
  skills: ProfileSkillUsage[];
  /** Top subagents by run count (`@agent`). */
  subagents: ProfileSkillUsage[];
  /** Top MCP servers by tool-call count. */
  mcps: ProfileSkillUsage[];
  /** AI-performed git actions (commits / PRs / conflict resolutions). */
  aiActions: ProfileAiAction[];
  /**
   * Distinct accounts seen in the (unfiltered) usage log, for the per-account
   * filter. Always the full set regardless of the active `provider` filter, so
   * the picker stays stable while a single account is selected.
   */
  availableAccounts: ProfileAccountRef[];
}

// -- Token stats (durable local usage log) ----------------------------

export interface ProfileTokenProvider {
  provider: string;
  label: string;
  tokens: number;
  /** 0-100 share of total recorded tokens. */
  percent: number;
  /** Estimated USD at public list rates (subscription users are NOT billed this). */
  estimatedCostUsd?: number;
}

export interface ProfileTokenStats {
  /** False when no durable token events have been recorded on this device yet. */
  available: boolean;
  scope: ProfileStatScope;
  device: ProfileDevice;
  generatedAt: number;
  timezoneOffsetMinutes: number;
  windowDays: number;
  /** Total retained tokens (bounded by the local usage-event retention window). */
  lifetimeTokens: number;
  peakDayTokens: number;
  peakDay?: string;
  /** Per-provider token totals, folded to the base provider (global). */
  providers: ProfileTokenProvider[];
  /** Per-account token totals (each profile of a provider separately). */
  accounts: ProfileTokenProvider[];
  /** Token-weighted model mix. */
  models: ProfileBreakdownEntry[];
  tokenHeatmap: ProfileHeatmap;
}

// -- IPC payloads -----------------------------------------------------

export const profileStatsRequestSchema = z.object({
  /** `-new Date().getTimezoneOffset()` from the renderer, for local bucketing. */
  utcOffsetMinutes: z.number(),
  scope: profileStatScopeSchema.optional(),
  /**
   * When `scope: "device"`, which device to report. Defaults to the current
   * device. A non-current id has no local data (Cloud will serve it) and yields
   * an empty-but-valid blob today.
   */
  deviceId: z.string().optional(),
  /**
   * Account-scoped provider filter. When set, every stat (heatmap, totals,
   * breakdowns, plugins, ...) is scoped to events whose recorded account kind
   * matches exactly, e.g. "claude" or "claude:work". Omit for all accounts.
   */
  provider: z.string().optional(),
});
export type ProfileStatsRequest = z.infer<typeof profileStatsRequestSchema>;

export interface ProfileIdentityResponse {
  identity: ProfileIdentity;
  device: ProfileDevice;
}

// -- Share-card image capture -----------------------------------------

/** Viewport rect (CSS px) of the share card element to screenshot. */
export const shareImageRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type ShareImageRect = z.infer<typeof shareImageRectSchema>;
