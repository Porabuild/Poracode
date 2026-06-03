import {
  fetchOpenCodeWorkspaceId,
  type HostPort,
  openCodeRequestCookie,
  OPENCODE_USER_AGENT,
  type UsageWindow,
} from "@lightcode/agents-usage";
import { parseZenBalance, workspacePageDiagnostics } from "./openCodeZenBalance";

/**
 * The opencode.ai web session: the live check (workspace-id probe — the same
 * gate the browser login uses), the Zen balance, and the Go (Lite) subscription
 * windows. The web-session primitives (cookie filtering, signed-out detection,
 * workspace probe) live in `@lightcode/agents-usage/openCodeWeb` so the
 * browser-login validator and this module share one implementation.
 */

export interface OpenCodeWebSession {
  /** The captured opencode.ai cookie authenticates as a live signed-in session. */
  live: boolean;
  /** Zen pay-as-you-go balance, when the dashboard exposes a parseable one. */
  balance?: number;
  /** Go (Lite) subscription windows (rolling 5h / weekly / monthly), when subscribed. */
  goWindows?: UsageWindow[];
}

async function fetchOpenCodePage(
  host: HostPort,
  cookie: string,
  url: string,
): Promise<{ status: number; body: string } | undefined> {
  try {
    const res = await host.http.request({
      url,
      headers: {
        Cookie: cookie,
        "User-Agent": OPENCODE_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 5000,
    });
    return { status: res.status, body: res.body };
  } catch {
    return undefined;
  }
}

function matchNumber(text: string, pattern: RegExp): number | undefined {
  const value = text.match(pattern)?.[1];
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const OPENCODE_GO_WINDOW_SPECS = [
  { key: "rollingUsage", id: "session-5h", label: "Rolling" },
  { key: "weeklyUsage", id: "weekly", label: "Weekly" },
  { key: "monthlyUsage", id: "monthly", label: "Monthly" },
] as const;

/**
 * Parse the Go (Lite) subscription windows from the server-rendered
 * `/workspace/{id}/go` body. opencode.ai renders `queryLiteSubscription`
 * ("lite.subscription.get") as `rollingUsage`/`weeklyUsage`/`monthlyUsage`, each
 * `{ usagePercent, resetInSec }` — see the console's `LiteUsageItem`. Returns []
 * when the account has no Lite subscription (the keys are absent), and requires
 * the two core windows so a stray match can't fabricate a partial set.
 */
export function parseOpenCodeGoWindows(text: string, nowMs: number): UsageWindow[] {
  const windows: UsageWindow[] = [];
  for (const spec of OPENCODE_GO_WINDOW_SPECS) {
    const percent = matchNumber(
      text,
      new RegExp(`${spec.key}[^}]*?usagePercent["']?\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"),
    );
    if (percent === undefined) continue;
    const resetInSec = matchNumber(
      text,
      new RegExp(`${spec.key}[^}]*?resetInSec["']?\\s*:\\s*([0-9]+)`, "i"),
    );
    windows.push({
      id: spec.id,
      label: spec.label,
      usedPercent: Math.min(100, Math.max(0, percent)),
      unit: "percent",
      ...(resetInSec !== undefined ? { resetsAt: nowMs + resetInSec * 1000 } : {}),
    });
  }
  const hasCore =
    windows.some((w) => w.id === "session-5h") && windows.some((w) => w.id === "weekly");
  return hasCore ? windows : [];
}

/**
 * Fetch the opencode.ai web session: the live check (workspace-id probe — the
 * same gate the browser login uses), the Zen balance, and the Go (Lite)
 * subscription windows. Liveness is reported the moment a workspace id resolves,
 * independently of whether a balance/windows parse — a signed-in account is
 * signed in even on a zero/unrendered balance. Balance is rendered on both the
 * home and `/go` pages, so we fetch both in parallel and prefer whichever parses.
 */
export async function fetchOpenCodeWeb(host: HostPort, nowMs: number): Promise<OpenCodeWebSession> {
  const cookie = openCodeRequestCookie(await host.credentials.getSecret("opencode", "cookie"));
  if (!cookie) return { live: false };
  const workspaceId = await fetchOpenCodeWorkspaceId(host.http, cookie);
  if (!workspaceId) return { live: false };

  const base = `https://opencode.ai/workspace/${workspaceId}`;
  const [home, go] = await Promise.all([
    fetchOpenCodePage(host, cookie, base),
    fetchOpenCodePage(host, cookie, `${base}/go`),
  ]);

  const balance =
    (home?.status === 200 ? parseZenBalance(home.body) : undefined) ??
    (go?.status === 200 ? parseZenBalance(go.body) : undefined);
  const goWindows = go?.status === 200 ? parseOpenCodeGoWindows(go.body, nowMs) : [];

  if (balance === undefined) {
    // Dev-only, value-masked: pins down where the balance lives when it fails to
    // parse (e.g. it's fetched client-side and absent from this HTML).
    const page = home ?? go;
    if (page) {
      host.log?.debug(
        "opencode zen balance unparsed",
        workspacePageDiagnostics(page.status, page.body),
      );
    }
  }

  return {
    live: true,
    ...(balance !== undefined ? { balance } : {}),
    ...(goWindows.length > 0 ? { goWindows } : {}),
  };
}
