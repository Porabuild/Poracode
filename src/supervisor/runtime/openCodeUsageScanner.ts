import { fetchOpenCodeGoApiUsage, type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import { hasOpenCodeGoAuth, readOpenCodeGoApiKey } from "./openCodeGoDb";
import { fetchOpenCodeWeb, type OpenCodeWebSession } from "./openCodeWebSession";

/**
 * Builds the OpenCode usage snapshot.
 *
 * Go plan quota meters (rolling / weekly / monthly) come from the direct
 * `GET https://opencode.ai/zen/go/v1/usage` endpoint authenticated with the
 * Go API key from the CLI's `auth.json` — no cookie or web login needed. When
 * the key is absent or the API fails, the opencode.ai web session
 * (`lite.subscription.get` / dashboard) is the compatibility fallback.
 * Local `opencode.db` cost aggregation is intentionally not used for those
 * meters: it is device-local, undercounts multi-client spend, and uses
 * different window boundaries than the server — so falling back to it presents
 * confidently wrong headroom (e.g. 25% local vs 100% on the console).
 *
 * Local `auth.json` is still used as a "has a Go key" signal for the plan
 * badge when neither endpoint supplies real windows; meters stay empty rather
 * than show undercounted local spend. Zen balance is web-only.
 */

/** Build the OpenCode usage snapshot from Go subscription usage and optional Zen balance. */
export async function scanOpenCodeUsage(nowMs: number, host?: HostPort): Promise<UsageSnapshot> {
  const apiKey = readOpenCodeGoApiKey();
  // The API-key fetch and the web session are independent — run both together.
  // The web session is still needed for the Zen balance even when the API
  // supplies the Go windows.
  const [apiWindows, web] = await Promise.all([
    apiKey && host
      ? fetchOpenCodeGoApiUsage(host.http, apiKey).catch(() => undefined)
      : Promise.resolve(undefined),
    host
      ? fetchOpenCodeWeb(host, nowMs).catch((): OpenCodeWebSession => ({ live: false }))
      : Promise.resolve<OpenCodeWebSession>({ live: false }),
  ]);
  const hasGoAuth = hasOpenCodeGoAuth();

  const zenBalance = web.balance;
  const credits =
    zenBalance !== undefined
      ? { credits: { balance: zenBalance, currency: "USD", label: "Zen balance" } as const }
      : {};

  // Authoritative Go plan windows: direct API first, web session as fallback.
  // Never invent them from local spend.
  const goWindows = apiWindows ?? web.goWindows ?? [];

  if (goWindows.length > 0) {
    return {
      providerId: "opencode",
      status: "ok",
      plan: "Go",
      windows: goWindows,
      ...credits,
      fetchedAt: nowMs,
    };
  }

  // CLI has a Go API key but no server windows (endpoint unreachable, expired
  // key with no cookie fallback, or parse miss). Report plan "Go" with empty
  // meters so we never show undercounted local % as if it were the console quota.
  if (hasGoAuth) {
    return {
      providerId: "opencode",
      status: "ok",
      plan: "Go",
      windows: [],
      ...credits,
      fetchedAt: nowMs,
    };
  }

  // Signed in to opencode.ai (live web session) without a Go subscription. Report
  // "ok" so the UI reflects the captured session even when no Zen balance is
  // exposed — the browser login validated this very cookie via the same probe,
  // so reverting to "auth-missing" here would wrongly drop the session the
  // moment the user pressed "Use session".
  if (web.live) {
    return {
      providerId: "opencode",
      status: "ok",
      plan: "Zen",
      windows: [],
      ...credits,
      fetchedAt: nowMs,
    };
  }

  return { providerId: "opencode", status: "auth-missing", windows: [], fetchedAt: nowMs };
}
