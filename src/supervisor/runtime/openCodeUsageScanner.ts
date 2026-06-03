import { aggregateOpenCodeUsage, type HostPort, type UsageSnapshot } from "@lightcode/agents-usage";
import { hasOpenCodeGoAuth, readOpenCodeGoRows } from "./openCodeGoDb";
import { fetchOpenCodeWeb, type OpenCodeWebSession } from "./openCodeWebSession";

/**
 * Builds the OpenCode usage snapshot. OpenCode spend lives in the CLI's local
 * `opencode.db` SQLite store (see `openCodeGoDb.ts`); the account dashboard
 * additionally exposes the Go (Lite) subscription windows and the Zen
 * pay-as-you-go balance when an opencode.ai cookie is captured (see
 * `openCodeWebSession.ts` / `openCodeZenBalance.ts`). Read-only and fail-safe.
 */

/** Build the OpenCode usage snapshot from Go subscription usage and optional Zen balance. */
export async function scanOpenCodeUsage(nowMs: number, host?: HostPort): Promise<UsageSnapshot> {
  const hasGoAuth = hasOpenCodeGoAuth();
  // The local SQLite read and the opencode.ai web fetch are independent, so run
  // them concurrently rather than waiting out the SQLite read first.
  const [rows, web] = await Promise.all([
    readOpenCodeGoRows().then((r) => r ?? []),
    host
      ? fetchOpenCodeWeb(host, nowMs).catch((): OpenCodeWebSession => ({ live: false }))
      : Promise.resolve<OpenCodeWebSession>({ live: false }),
  ]);
  const zenBalance = web.balance;
  const credits =
    zenBalance !== undefined
      ? { credits: { balance: zenBalance, currency: "USD", label: "Zen balance" } as const }
      : {};

  // Prefer the authoritative web view of the Go subscription (the rolling/weekly/
  // monthly quota the dashboard shows); fall back to local CLI spend aggregation
  // when the web windows aren't available but local usage exists.
  const goWindows = web.goWindows ?? (rows.length > 0 ? aggregateOpenCodeUsage(rows, nowMs) : []);
  const hasGo = (web.goWindows?.length ?? 0) > 0 || hasGoAuth || rows.length > 0;

  // Go subscription (web or local): show its windows alongside any Zen balance.
  if (hasGo) {
    return {
      providerId: "opencode",
      status: "ok",
      plan: "Go",
      windows: goWindows,
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
