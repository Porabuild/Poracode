import {
  antigravityPoolWindows,
  antigravityQuotaSummaryWindows,
  type HostPort,
  type UsageWindow,
  type UsageSnapshot,
} from "@poracode/agents-usage";
import {
  resolveAntigravityAcpCredentials,
  type AntigravityAcpCredentials,
} from "./antigravityAcpCredentials";
import { collectAntigravityCloudUsage } from "./antigravityCloudUsage";
import {
  GET_COMMAND_MODEL_CONFIGS,
  GET_USER_STATUS,
  modelsFromBody,
  planFromUserStatus,
  queryLs,
  RETRIEVE_USER_QUOTA_SUMMARY,
} from "./antigravityLanguageServer";
import { resolveAntigravityLsEndpoints } from "./antigravityProcessScan";

/**
 * Antigravity usage from its local language server, with official ACP OAuth fallback.
 *
 * While `agy` (or the Antigravity IDE) is running it hosts a local language
 * server — a Connect-RPC service reachable on a loopback port. We read its
 * `RetrieveUserQuotaSummary` for the current two-group / 5h+weekly quota model,
 * and `GetUserStatus` for the plan name (and as a legacy fallback when the quota
 * summary is unavailable on older builds).
 *
 * When no LS is reachable, the official ACP server's persisted Google OAuth
 * artifact is used to query the corresponding Cloud Code quota-summary API.
 * Discovery (process trees, loopback ports, CSRF tokens) lives in
 * `antigravityProcessScan.ts`; the RPC calls + response parsing live in
 * `antigravityLanguageServer.ts`. This file orchestrates the two.
 */

/**
 * Legacy per-model pooling: GetUserStatus carries each model's 5-hour
 * `quotaInfo.remainingFraction`, which we fold into Gemini Pro / Flash / Claude
 * pools. Used only when `RetrieveUserQuotaSummary` is unavailable.
 */
async function legacyPoolWindows(
  port: number,
  statusBody: unknown,
  csrfTokens: string[],
): Promise<UsageWindow[]> {
  let models = statusBody !== undefined ? modelsFromBody(statusBody) : [];
  if (statusBody !== undefined && models.length === 0) {
    // GetUserStatus answered but carried no quota — try the configs endpoint.
    const configs = await queryLs(port, GET_COMMAND_MODEL_CONFIGS, csrfTokens);
    if (configs !== undefined) models = modelsFromBody(configs);
  }
  return antigravityPoolWindows(models);
}

/** Probe the running language server; undefined when none is reachable. */
export async function scanAntigravityLanguageServerUsage(
  nowMs: number,
  wslDistros: readonly string[],
): Promise<UsageSnapshot | undefined> {
  const { ports, csrfTokens } = await resolveAntigravityLsEndpoints(wslDistros);
  for (const port of ports) {
    // GetUserStatus (plan + legacy fallback) and RetrieveUserQuotaSummary (the
    // preferred quota surface) are independent, so fire them concurrently. This
    // matters most when the port is stale: each queryLs can burn up to ~10s of
    // connect timeouts, so running them in series would double the wall-clock
    // spent before moving on to the next port.
    const [statusBody, summaryBody] = await Promise.all([
      queryLs(port, GET_USER_STATUS, csrfTokens),
      queryLs(port, RETRIEVE_USER_QUOTA_SUMMARY, csrfTokens),
    ]);
    let windows = summaryBody !== undefined ? antigravityQuotaSummaryWindows(summaryBody) : [];
    if (windows.length === 0) {
      windows = await legacyPoolWindows(port, statusBody, csrfTokens);
    }
    if (windows.length > 0) {
      const plan = planFromUserStatus(statusBody);
      return {
        providerId: "antigravity",
        status: "ok",
        windows,
        fetchedAt: nowMs,
        ...(plan ? { plan } : {}),
      };
    }
  }
  return undefined;
}

export interface AntigravityUsageScannerDeps {
  scanLanguageServer(
    nowMs: number,
    wslDistros: readonly string[],
  ): Promise<UsageSnapshot | undefined>;
  resolveAcpCredentials(): Promise<AntigravityAcpCredentials | undefined>;
  collectCloudUsage(
    nowMs: number,
    host: HostPort,
    credentials: AntigravityAcpCredentials,
  ): Promise<UsageSnapshot>;
}

const defaultDeps: AntigravityUsageScannerDeps = {
  scanLanguageServer: scanAntigravityLanguageServerUsage,
  resolveAcpCredentials: resolveAntigravityAcpCredentials,
  collectCloudUsage: collectAntigravityCloudUsage,
};

/** Build the Antigravity usage snapshot from the best available source. */
export async function scanAntigravityUsage(
  nowMs: number,
  wslDistros: readonly string[] = [],
  host: HostPort,
  deps: AntigravityUsageScannerDeps = defaultDeps,
): Promise<UsageSnapshot> {
  const ls = await deps.scanLanguageServer(nowMs, wslDistros).catch(() => undefined);
  if (ls && ls.windows.length > 0) return ls;
  const credentials = await deps.resolveAcpCredentials().catch(() => undefined);
  if (credentials) return deps.collectCloudUsage(nowMs, host, credentials);
  return { providerId: "antigravity", status: "app-not-running", windows: [], fetchedAt: nowMs };
}
