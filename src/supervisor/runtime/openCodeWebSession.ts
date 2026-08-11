import {
  fetchOpenCodeSubscriptionText,
  fetchOpenCodeWorkspaceId,
  type HostPort,
  openCodeRequestCookie,
  OPENCODE_USER_AGENT,
  type UsageWindow,
} from "@poracode/agents-usage";
import { parseZenBalance, workspacePageDiagnostics } from "./openCodeZenBalance";

/**
 * The opencode.ai web session: the live check (workspace-id probe — the same
 * gate the browser login uses), the Zen balance, and the Go (Lite) subscription
 * windows. The web-session primitives (cookie filtering, signed-out detection,
 * workspace probe) live in `@poracode/agents-usage/openCodeWeb` so the
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

/**
 * Match a numeric field inside a Go window object. Handles both plain
 * `rollingUsage:{usagePercent:42}` and SolidStart seroval hydration
 * `rollingUsage:$R[28]={status:"ok",resetInSec:1,usagePercent:42}`.
 * Falls back to a looser "key then field before next closing brace" scan for
 * older SSR shapes.
 */
function matchWindowNumber(text: string, key: string, field: string): number | undefined {
  const objectRe = new RegExp(`${key}\\s*:\\s*(?:\\$R\\[[^\\]]+\\]\\s*=\\s*)?\\{([^}]*)\\}`, "i");
  const objectBody = text.match(objectRe)?.[1];
  const fieldRe = new RegExp(`${field}["']?\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i");
  const fromObject = objectBody?.match(fieldRe)?.[1];
  const raw =
    fromObject ??
    text.match(new RegExp(`${key}[^}]*?${field}["']?\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"))?.[1];
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const OPENCODE_GO_WINDOW_SPECS = [
  { key: "rollingUsage", id: "session-5h", label: "Rolling" },
  { key: "weeklyUsage", id: "weekly", label: "Weekly" },
  { key: "monthlyUsage", id: "monthly", label: "Monthly" },
] as const;

/**
 * Parse the Go (Lite) subscription windows from a `lite.subscription.get`
 * payload (server-function response or SSR/hydration embedded in the
 * `/workspace/{id}/go` page). Keys are `rollingUsage`/`weeklyUsage`/`monthlyUsage`,
 * each `{ usagePercent, resetInSec }` — including SolidStart seroval
 * `key:$R[n]={...}` forms. Returns [] when the account has no Lite subscription
 * (the keys are absent), and requires the two core windows so a stray match
 * can't fabricate a partial set.
 */
export function parseOpenCodeGoWindows(text: string, nowMs: number): UsageWindow[] {
  const windows: UsageWindow[] = [];
  for (const spec of OPENCODE_GO_WINDOW_SPECS) {
    const percent = matchWindowNumber(text, spec.key, "usagePercent");
    if (percent === undefined) continue;
    const resetInSec = matchWindowNumber(text, spec.key, "resetInSec");
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
  // Subscription server-fn is the authoritative Go window source; HTML pages are
  // still needed for Zen balance (and as a fallback when the server-fn shape
  // drifts). Run all three in parallel.
  const [home, go, subscriptionBody] = await Promise.all([
    fetchOpenCodePage(host, cookie, base),
    fetchOpenCodePage(host, cookie, `${base}/go`),
    fetchOpenCodeSubscriptionText(host.http, cookie, workspaceId).catch(() => undefined),
  ]);

  const balance =
    (home?.status === 200 ? parseZenBalance(home.body) : undefined) ??
    (go?.status === 200 ? parseZenBalance(go.body) : undefined);
  const goWindowsFromSub =
    subscriptionBody !== undefined ? parseOpenCodeGoWindows(subscriptionBody, nowMs) : [];
  const goWindowsFromPage = go?.status === 200 ? parseOpenCodeGoWindows(go.body, nowMs) : [];
  const goWindows = goWindowsFromSub.length > 0 ? goWindowsFromSub : goWindowsFromPage;

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
