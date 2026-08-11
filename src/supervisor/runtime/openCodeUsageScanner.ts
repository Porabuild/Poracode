import { type HostPort, type UsageSnapshot } from "@poracode/agents-usage";
import { hasOpenCodeGoAuth } from "./openCodeGoDb";
import { fetchOpenCodeWeb, type OpenCodeWebSession } from "./openCodeWebSession";

/**
 * Builds the OpenCode usage snapshot.
 *
 * Go plan quota meters (rolling / weekly / monthly) come **only** from the
 * opencode.ai web session (`lite.subscription.get` / dashboard). Local
 * `opencode.db` cost aggregation is intentionally not used for those meters:
 * it is device-local, undercounts multi-client spend, and uses different
 * window boundaries than the server — so falling back to it presents
 * confidently wrong headroom (e.g. 25% local vs 100% on the console).
 *
 * Local `auth.json` is still used as a "has a Go key" signal for the plan
 * badge when the web session is missing; meters stay empty until a cookie
 * session supplies real windows. Zen balance is web-only.
 */

/** Build the OpenCode usage snapshot from Go subscription usage and optional Zen balance. */
export async function scanOpenCodeUsage(nowMs: number, host?: HostPort): Promise<UsageSnapshot> {
  const hasGoAuth = hasOpenCodeGoAuth();
  const web = host
    ? await fetchOpenCodeWeb(host, nowMs).catch((): OpenCodeWebSession => ({ live: false }))
    : ({ live: false } satisfies OpenCodeWebSession);

  const zenBalance = web.balance;
  const credits =
    zenBalance !== undefined
      ? { credits: { balance: zenBalance, currency: "USD", label: "Zen balance" } as const }
      : {};

  // Authoritative Go plan windows only — never invent them from local spend.
  const goWindows = web.goWindows ?? [];

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

  // CLI has a Go API key but no server windows (no cookie, expired session, or
  // parse miss). Report plan "Go" with empty meters so we never show undercounted
  // local % as if it were the console quota.
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
