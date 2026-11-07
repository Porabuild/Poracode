import { z } from "zod";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/**
 * Per-thread token consumption split by crew member. `member` is "lead" (the
 * thread's own provider), "role:<id>" (a crew role's helper runs) or "helper"
 * (helper runs without a role). Category counts can sum to less than `total`
 * when a provider reported no breakdown for some calls; `total` is authoritative.
 */
export const threadTokenUsageMemberSchema = z.object({
  member: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1).optional(),
  tokens: z.object({
    input: count,
    output: count,
    cacheRead: count,
    cacheWrite: count,
  }),
  total: count,
  /** List-price estimate (USD) for the `pricedTotal` tokens that had a known rate. */
  costUsd: z.number().finite().nonnegative(),
  pricedTotal: count,
});
export type ThreadTokenUsageMember = z.infer<typeof threadTokenUsageMemberSchema>;

export const threadTokenUsageSchema = z.object({
  version: z.literal(1),
  members: z.array(threadTokenUsageMemberSchema),
});
export type ThreadTokenUsage = z.infer<typeof threadTokenUsageSchema>;
