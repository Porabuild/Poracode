/**
 * @poracode/agents-usage — cross-platform usage & quota collection for AI
 * coding agents. Runtime-agnostic: all I/O is injected via {@link HostPort}.
 */

export * from "./types";
export * from "./host";
export * from "./formatters";
export { createUsageCollectorRegistry } from "./registry";
export type { UsageCollector, UsageCollectorRegistry } from "./registry";
export {
  allUsageProviderDescriptors,
  builtInUsageProviderDescriptors,
  LOCAL_USAGE_PROVIDER_DESCRIPTORS,
} from "./providers";
export { DEFAULT_CLIENT_VERSIONS } from "./clientVersions";
export { priceTokens, rateForModel, PRICING_TABLE_REVIEWED } from "./pricing";
export type { ModelRate } from "./pricing";
export { aggregateClaudeCost } from "./cost";
export type { CostEstimate } from "./cost";
export { aggregateOpenCodeUsage, OPENCODE_LIMITS } from "./openCode";
export type { OpenCodeCostRow } from "./openCode";
export {
  fetchOpenCodeWorkspaceId,
  isOpenCodeSessionLive,
  looksSignedOut,
  openCodeRequestCookie,
  workspaceIdsFromText,
  OPENCODE_AUTH_COOKIE_NAMES,
  OPENCODE_USER_AGENT,
} from "./openCodeWeb";

// Per-provider collectors + their pure parsers, for direct use and testing.
export {
  collectClaude,
  parseClaudeUsage,
  formatClaudePlan,
  parseClaudeRefreshResponse,
  refreshClaudeOAuthToken,
  CLAUDE_USAGE_ENDPOINT,
  CLAUDE_OAUTH_BETA,
  CLAUDE_OAUTH_TOKEN_ENDPOINT,
  CLAUDE_OAUTH_CLIENT_ID,
} from "./collectors/claude";
export type { ClaudeRefreshedToken } from "./collectors/claude";
export {
  collectCodex,
  parseCodexUsage,
  formatCodexPlanLabel,
  CODEX_USAGE_ENDPOINT,
} from "./collectors/codex";
export { collectCopilot, parseCopilotUsage, COPILOT_USER_ENDPOINT } from "./collectors/copilot";
export { collectCursor, parseCursorUsage, CURSOR_USAGE_ENDPOINT } from "./collectors/cursor";
export {
  collectCommandCode,
  formatCommandCodePlanLabel,
  isCommandCodeSessionLive,
  parseCommandCodeUsage,
  COMMANDCODE_AUTH_SESSION_ENDPOINT,
  COMMANDCODE_BILLING_CREDITS_ENDPOINT,
  COMMANDCODE_BILLING_SUBSCRIPTIONS_ENDPOINT,
  COMMANDCODE_PROVIDER_ID,
  COMMANDCODE_USAGE_SUMMARY_ENDPOINT,
} from "./collectors/commandcode";
export {
  collectFactory,
  parseFactoryUsage,
  formatFactoryPlanLabel,
  isFactoryAccessTokenLive,
  refreshWorkOSToken,
  FACTORY_PROVIDER_ID,
  FACTORY_AUTH_ME_ENDPOINT,
  FACTORY_BILLING_LIMITS_ENDPOINT,
  FACTORY_USAGE_ENDPOINT,
} from "./collectors/factory";
export type { WorkOSRefreshResult } from "./collectors/factory";
export {
  collectGrok,
  parseGrokUsage,
  GROK_BILLING_ENDPOINT,
  GROK_SETTINGS_ENDPOINT,
} from "./collectors/grok";
export {
  collectGemini,
  parseGeminiUsage,
  GEMINI_LOAD_ENDPOINT,
  GEMINI_QUOTA_ENDPOINT,
} from "./collectors/gemini";
export {
  collectZai,
  parseZaiUsage,
  resolveZaiQuotaUrl,
  ZAI_PROVIDER_ID,
  ZAI_GLOBAL_QUOTA_ENDPOINT,
  ZAI_BIGMODEL_QUOTA_ENDPOINT,
} from "./collectors/zai";
export type { ZaiQuotaResponse } from "./collectors/zai";
export {
  antigravityPool,
  antigravityPoolWindows,
  antigravityQuotaSummaryWindows,
  antigravityWindowId,
} from "./collectors/antigravity";
export type {
  AntigravityCadence,
  AntigravityGroupKey,
  AntigravityModelQuota,
} from "./collectors/antigravity";
