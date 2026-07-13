import { z } from "zod";

/**
 * Canonical usage vocabulary shared by every collector and consumed unchanged
 * by Poracode's IPC layer + UI. Provider-native payloads are normalized into
 * these shapes at the collector boundary so shared code never sees a vendor
 * field name.
 */

export const knownUsageWindowIdSchema = z.enum([
  "session-5h",
  "weekly",
  "weekly-opus",
  "weekly-sonnet",
  "weekly-fable",
  "monthly",
  // Pay-as-you-go overage (e.g. Claude `extra_usage`): a spend amount, not a
  // rate-limit window. Carries `used`/`limit` in `currency`.
  "extra-usage",
  // Cursor plan-usage breakdown (Auto+Composer / usage-based API).
  "cursor-auto",
  "cursor-api",
]);
export type KnownUsageWindowId = z.infer<typeof knownUsageWindowIdSchema>;

/**
 * A usage window id. Most providers use a fixed vocabulary, but some report a
 * dynamic, namespaced set: Gemini Code Assist reports one daily bucket per model
 * (`gemini:<modelId>`), Codex has model-specific limits (`codex:<limitId>`),
 * Antigravity folds models into broad quota pools (`antigravity:<pool>`), and
 * Factory/Droid carries an extra "core" token-rate-limit pool plus a legacy
 * "premium" cycle pool (`factory:<pool>`). These ids flow through without a
 * schema change.
 */
export const usageWindowIdSchema = z.union([
  knownUsageWindowIdSchema,
  z.string().regex(/^gemini:.+/, "expected gemini:<modelId>"),
  z.string().regex(/^codex:.+/, "expected codex:<limitId>"),
  z.string().regex(/^antigravity:.+/, "expected antigravity:<pool>"),
  z.string().regex(/^factory:.+/, "expected factory:<pool>"),
]);
export type UsageWindowId =
  | KnownUsageWindowId
  | `gemini:${string}`
  | `codex:${string}`
  | `antigravity:${string}`
  | `factory:${string}`;

export const usageUnitSchema = z.enum(["percent", "tokens", "requests", "credits", "usd"]);
export type UsageUnit = z.infer<typeof usageUnitSchema>;

/** A single rate-limit / quota window the provider reports (5h, weekly, ...). */
export const usageWindowSchema = z.object({
  id: usageWindowIdSchema,
  label: z.string(),
  /** Always normalized to 0-100, regardless of whether the vendor reports 0-1. */
  usedPercent: z.number().min(0).max(100),
  /** Epoch milliseconds at which the window resets, when the provider reports it. */
  resetsAt: z.number().int().nonnegative().optional(),
  used: z.number().nonnegative().optional(),
  limit: z.number().nonnegative().optional(),
  unit: usageUnitSchema.optional(),
  /** ISO 4217 currency for `used`/`limit` when `unit` is "usd". */
  currency: z.string().optional(),
});
export type UsageWindow = z.infer<typeof usageWindowSchema>;

export const usageCostPeriodSchema = z.enum(["today", "7d", "30d", "cycle"]);
export type UsageCostPeriod = z.infer<typeof usageCostPeriodSchema>;

/**
 * Spend over a window. `estimated: true` means it was reconstructed from local
 * logs at public API rates and is meaningless for subscription/OAuth users —
 * it must be labeled as such in the UI and is opt-in.
 */
export const usageCostSchema = z.object({
  currency: z.string(),
  amount: z.number().nonnegative(),
  period: usageCostPeriodSchema,
  estimated: z.boolean(),
});
export type UsageCost = z.infer<typeof usageCostSchema>;

export const usageTokensSchema = z.object({
  total: z.number().nonnegative().optional(),
  input: z.number().nonnegative().optional(),
  output: z.number().nonnegative().optional(),
  cacheRead: z.number().nonnegative().optional(),
  cacheWrite: z.number().nonnegative().optional(),
  period: usageCostPeriodSchema.optional(),
});
export type UsageTokens = z.infer<typeof usageTokensSchema>;

export const usageCreditsSchema = z.object({
  balance: z.number(),
  currency: z.string().optional(),
  label: z.string().optional(),
  unlimited: z.boolean().optional(),
});
export type UsageCredits = z.infer<typeof usageCreditsSchema>;

/**
 * Collection outcome. `ok` carries windows; the rest explain absence so the UI
 * can distinguish "not signed in" from "rate-limited" from "this provider has
 * no usage API".
 */
export const usageStatusSchema = z.enum([
  "ok",
  "auth-missing",
  // The provider's app/CLI must be running for usage to be readable (e.g.
  // Antigravity reads a local language server only live). Distinct from
  // auth-missing: the user may be signed in, the app just isn't running.
  "app-not-running",
  "rate-limited",
  "quota-hit",
  "unsupported",
  "error",
]);
export type UsageStatus = z.infer<typeof usageStatusSchema>;

export const usageSnapshotSchema = z.object({
  providerId: z.string(),
  status: usageStatusSchema,
  plan: z.string().optional(),
  authenticatedAs: z.string().optional(),
  windows: z.array(usageWindowSchema),
  cost: usageCostSchema.optional(),
  tokens: usageTokensSchema.optional(),
  credits: usageCreditsSchema.optional(),
  /** Epoch milliseconds when this snapshot was produced. */
  fetchedAt: z.number().int().nonnegative(),
  /**
   * Epoch milliseconds before which a rate-limited provider must not be
   * re-polled — derived from a 429's `Retry-After` (or a default cooldown).
   * Lets the poller honor the server's backoff instead of re-hitting a throttled
   * endpoint every cycle, and lets the UI show a real "retry in …" countdown.
   */
  rateLimitedUntil: z.number().int().nonnegative().optional(),
  /** Short, non-sensitive diagnostic for non-ok statuses. Never contains secrets. */
  error: z.string().optional(),
});
export type UsageSnapshot = z.infer<typeof usageSnapshotSchema>;

export const usageMechanismSchema = z.enum([
  "oauth-endpoint",
  "cli-jsonrpc",
  "cookie",
  "api-key",
  "local-log",
]);
export type UsageMechanism = z.infer<typeof usageMechanismSchema>;

/** Static description of how a provider's usage is obtained. */
export interface UsageProviderDescriptor {
  id: string;
  label: string;
  mechanism: UsageMechanism;
  /** True when a token/cookie may need to be captured via a login flow. */
  needsLogin: boolean;
  windowIds: UsageWindowId[];
}
