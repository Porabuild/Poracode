import { z } from "zod";

/**
 * Provider usage contracts. The canonical usage vocabulary (UsageSnapshot etc.)
 * is owned by the standalone `@poracode/agents-usage` package and re-exported
 * here so the renderer and supervisor share one set of types without the
 * renderer importing a collector (which would drag fetch/child_process into the
 * browser bundle). Only the IPC request payload needs a runtime Zod schema; the
 * response is a plain typed result.
 */

export type {
  UsageSnapshot,
  UsageWindow,
  UsageWindowId,
  UsageStatus,
  UsageUnit,
  UsageCost,
  UsageCostPeriod,
  UsageTokens,
  UsageCredits,
  UsageMechanism,
  UsageProviderDescriptor,
} from "@poracode/agents-usage";

import type { UsageSnapshot } from "@poracode/agents-usage";

export const providerUsagePayloadSchema = z.object({
  /** Restrict collection to these provider ids; omitted = all known providers. */
  providerIds: z.array(z.string()).optional(),
  /**
   * When true, drain any in-flight refresh for the same id-set first, then start
   * a new collection. Use after credential changes (login / API key / sign-out)
   * so a concurrent background poll that started with the previous secret cannot
   * be coalesced and returned as the "fresh" result.
   */
  force: z.boolean().optional(),
});
export type ProviderUsagePayload = z.infer<typeof providerUsagePayloadSchema>;

export interface ProviderUsageResponse {
  snapshots: UsageSnapshot[];
  /** True when the snapshots came from the on-disk cache (a refresh may be in flight). */
  fromCache: boolean;
}

export const usageLoginPayloadSchema = z.object({
  /** Provider to launch the browser-overlay cookie login for (e.g. "grok"). */
  providerId: z.string(),
});
export type UsageLoginPayload = z.infer<typeof usageLoginPayloadSchema>;

export const usageApiKeyPayloadSchema = z.object({
  /** Provider whose pasted API key is being stored (e.g. "zai"). */
  providerId: z.string(),
  /** The API key the user pasted into the in-app sign-in. */
  apiKey: z.string().min(1),
});
export type UsageApiKeyPayload = z.infer<typeof usageApiKeyPayloadSchema>;

export interface UsageLoginResult {
  ok: boolean;
  /** True when the user closed the login window before completing. */
  cancelled?: boolean;
  error?: string;
}

export interface UsageLogoutResult {
  ok: boolean;
}

export const usageLoginStatePayloadSchema = z.object({});
export type UsageLoginStatePayload = z.infer<typeof usageLoginStatePayloadSchema>;

export interface UsageLoginStateResponse {
  /**
   * Per-provider: whether a login secret (cookie/token) is currently stored.
   * The persistent source of truth for "signed in", so the UI doesn't infer
   * sign-out from a failed/empty usage fetch.
   */
  stored: Record<string, boolean>;
}

export const usageLoginConfirmationActionSchema = z.enum(["use", "change", "cancel"]);
export type UsageLoginConfirmationAction = z.infer<typeof usageLoginConfirmationActionSchema>;

export interface UsageLoginConfirmationRequest {
  requestId: string;
  providerLabel: string;
}

export interface UsageLoginDeviceCode {
  providerId: string;
  providerLabel: string;
  code: string;
}

export const usageLoginConfirmationPayloadSchema = z.object({
  requestId: z.string().min(1),
  action: usageLoginConfirmationActionSchema,
});
export type UsageLoginConfirmationPayload = z.infer<typeof usageLoginConfirmationPayloadSchema>;
