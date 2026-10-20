import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Disjoint consumption buckets; output includes reasoning, input excludes cache reads. */
export const usageTokenCategoriesSchema = z.object({
  input: count,
  output: count,
  cacheRead: count,
  cacheWrite: count,
  /** Portion of cacheWrite with a one-hour TTL. Absent means the TTL is unknown. */
  cacheWrite1h: count.optional(),
});
export type UsageTokenCategories = z.infer<typeof usageTokenCategoriesSchema>;

export const usageMoneySchema = z.object({
  amount: z.number().finite().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const usagePricingSchema = z.object({
  id: z.string(),
  model: z.string(),
  source: z.string().url(),
  reviewedAt: z.string(),
  effectiveFrom: z.string(),
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
  cacheWrite1h: z.number().nonnegative(),
});

/** Persisted alongside the existing token row; never recalculated with today's rates. */
export const usageCostRecordSchema = z.object({
  version: z.literal(1),
  /** Adapter-attributed model; absent when only selected thread settings are known. */
  model: z.string().optional(),
  tokens: usageTokenCategoriesSchema.optional(),
  observed: usageMoneySchema.optional(),
  estimate: z
    .object({ amount: z.number().finite().nonnegative(), pricing: usagePricingSchema })
    .optional(),
});
export type UsageCostRecord = z.infer<typeof usageCostRecordSchema>;

export const profileCostTotalsSchema = z.object({
  tokens: count,
  unpricedTokens: count,
  categorizedTokens: count,
  observedTokens: count,
  estimatedTokens: count,
  observedSamples: count,
  estimatedSamples: count,
  observed: z.array(usageMoneySchema),
  estimatedUsd: z.number().finite().nonnegative(),
  categories: usageTokenCategoriesSchema,
});
export type ProfileCostTotals = z.infer<typeof profileCostTotalsSchema>;

const costBreakdownSchema = z.object({
  key: z.string(),
  label: z.string(),
  totals: profileCostTotalsSchema,
});
export const profileCostStatsSchema = z.object({
  totals: profileCostTotalsSchema,
  days: z.array(z.object({ day: z.string(), totals: profileCostTotalsSchema })),
  providers: z.array(costBreakdownSchema),
  models: z.array(costBreakdownSchema),
  accounts: z.array(costBreakdownSchema),
  pricing: z.array(usagePricingSchema),
});
export type ProfileCostStats = z.infer<typeof profileCostStatsSchema>;
