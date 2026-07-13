import {
  antigravityPoolWindows,
  antigravityQuotaSummaryWindows,
  type UsageWindow,
  type UsageSnapshot,
} from "@poracode/agents-usage";
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
 * Antigravity usage from its local language server (LS-only by design).
 *
 * While `agy` (or the Antigravity IDE) is running it hosts a local language
 * server — a Connect-RPC service reachable on a loopback port. We read its
 * `RetrieveUserQuotaSummary` for the current two-group / 5h+weekly quota model,
 * and `GetUserStatus` for the plan name (and as a legacy fallback when the quota
 * summary is unavailable on older builds). When the LS is not reachable the
 * snapshot is app-not-running: there is no live session. We deliberately do NOT
 * fall back to `agy`'s Cloud Code surface — it reports a different backend's
 * quota (Gemini-only, with different reset windows and counts), so mixing it in
 * would flip the panel to inconsistent numbers as `agy` starts and stops.
 *
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
async function scanLanguageServer(
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

/** Build the Antigravity usage snapshot from its local language server. */
export async function scanAntigravityUsage(
  nowMs: number,
  wslDistros: readonly string[] = [],
): Promise<UsageSnapshot> {
  const ls = await scanLanguageServer(nowMs, wslDistros).catch(() => undefined);
  if (ls && ls.windows.length > 0) return ls;
  // No reachable LS: `agy`/the IDE isn't running. The user may well be signed
  // in, so this is "start the app", not "sign in".
  return { providerId: "antigravity", status: "app-not-running", windows: [], fetchedAt: nowMs };
}
