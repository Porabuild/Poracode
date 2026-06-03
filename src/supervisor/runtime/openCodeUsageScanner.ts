import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  aggregateOpenCodeUsage,
  fetchOpenCodeWorkspaceId,
  looksSignedOut,
  openCodeRequestCookie,
  OPENCODE_USER_AGENT,
  type HostPort,
  type OpenCodeCostRow,
  type UsageSnapshot,
  type UsageWindow,
} from "@lightcode/agents-usage";
import { withReadonlyDb } from "./sqliteRead";

/**
 * OpenCode Go spend lives in the CLI's local `opencode.db` SQLite store. The
 * account dashboard may additionally expose Zen pay-as-you-go balance when the
 * user has captured an opencode.ai cookie. Read-only and fail-safe.
 *
 * The opencode.ai web-session primitives (cookie filtering, signed-out
 * detection, workspace probe) live in `@lightcode/agents-usage/openCodeWeb` so
 * the browser-login validator and this scanner share one implementation.
 */

const OPENCODE_GO_PROVIDER_ID = "opencode-go";

function openCodeDataDirs(): string[] {
  const home = homedir();
  const candidates: string[] = [];
  const xdgData = process.env.XDG_DATA_HOME?.trim();
  if (xdgData) candidates.push(join(xdgData, "opencode"));
  candidates.push(join(home, ".local", "share", "opencode"));
  if (process.platform === "darwin") {
    candidates.push(join(home, "Library", "Application Support", "opencode"));
  }
  if (process.platform === "win32") {
    for (const envVar of ["APPDATA", "LOCALAPPDATA"]) {
      const base = process.env[envVar]?.trim();
      if (base) candidates.push(join(base, "opencode"));
    }
  }
  return [...new Set(candidates)];
}

function openCodeDbPaths(): string[] {
  return openCodeDataDirs().map((dir) => join(dir, "opencode.db"));
}

function openCodeAuthPaths(): string[] {
  return openCodeDataDirs().map((dir) => join(dir, "auth.json"));
}

const OPENCODE_MESSAGE_SQL = `
  SELECT CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs,
         CAST(json_extract(data, '$.cost') AS REAL) AS cost
  FROM message
  WHERE json_valid(data)
    AND json_extract(data, '$.providerID') = 'opencode-go'
    AND json_extract(data, '$.role') = 'assistant'
    AND json_type(data, '$.cost') IN ('integer', 'real')
`;

const OPENCODE_MESSAGE_AND_PART_SQL = `
  WITH message_costs AS (
    SELECT id AS messageID,
           CAST(COALESCE(json_extract(data, '$.time.created'), time_created) AS INTEGER) AS createdMs,
           CAST(json_extract(data, '$.cost') AS REAL) AS cost
    FROM message
    WHERE json_valid(data)
      AND json_extract(data, '$.providerID') = 'opencode-go'
      AND json_extract(data, '$.role') = 'assistant'
      AND json_type(data, '$.cost') IN ('integer', 'real')
  )
  SELECT createdMs, cost
  FROM message_costs
  UNION ALL
  SELECT CAST(COALESCE(json_extract(p.data, '$.time.created'), p.time_created, m.time_created) AS INTEGER)
           AS createdMs,
         CAST(json_extract(p.data, '$.cost') AS REAL) AS cost
  FROM part p
  JOIN message m ON m.id = p.message_id
  WHERE json_valid(p.data)
    AND json_valid(m.data)
    AND json_extract(p.data, '$.type') = 'step-finish'
    AND json_type(p.data, '$.cost') IN ('integer', 'real')
    AND json_extract(m.data, '$.providerID') = 'opencode-go'
    AND json_extract(m.data, '$.role') = 'assistant'
    AND NOT EXISTS (
      SELECT 1
      FROM message_costs
      WHERE message_costs.messageID = p.message_id
    )
`;

const TABLE_EXISTS_SQL = `
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = ?
  LIMIT 1
`;

function normalizeRows(raw: { createdMs?: unknown; cost?: unknown }[]): OpenCodeCostRow[] {
  const rows: OpenCodeCostRow[] = [];
  for (const r of raw) {
    if (typeof r.createdMs !== "number" || typeof r.cost !== "number") continue;
    if (!Number.isFinite(r.cost) || r.cost < 0) continue;
    const createdMs = r.createdMs < 1e12 ? r.createdMs * 1000 : r.createdMs;
    if (!Number.isFinite(createdMs) || createdMs <= 0) continue;
    rows.push({ createdMs, cost: r.cost });
  }
  return rows;
}

function hasOpenCodeGoAuth(): boolean {
  for (const path of openCodeAuthPaths()) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const entry = parsed[OPENCODE_GO_PROVIDER_ID];
      if (!entry || typeof entry !== "object") continue;
      const key = (entry as { key?: unknown }).key;
      if (typeof key === "string" && key.trim()) return true;
    } catch {
      // try the next auth path
    }
  }
  return false;
}

async function readOpenCodeGoRows(): Promise<OpenCodeCostRow[] | undefined> {
  for (const dbPath of openCodeDbPaths()) {
    const rows = await withReadonlyDb(dbPath, (db) => {
      const hasPartTable = db.prepare(TABLE_EXISTS_SQL).get("part") !== undefined;
      const sql = hasPartTable ? OPENCODE_MESSAGE_AND_PART_SQL : OPENCODE_MESSAGE_SQL;
      return normalizeRows(db.prepare(sql).all() as { createdMs?: unknown; cost?: unknown }[]);
    });
    if (rows !== undefined) return rows;
  }
  return undefined;
}

function doubleFromBalanceValue(value: unknown): number | undefined {
  if (typeof value === "boolean") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isExplicitBalanceKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    "zenbalance",
    "zencurrentbalance",
    "currentbalance",
    "currentbalanceusd",
    "balanceusd",
    "usdbalance",
  ].includes(normalized);
}

function findZenBalance(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const balance = findZenBalance(item);
      if (balance !== undefined) return balance;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, item] of Object.entries(value)) {
    if (isExplicitBalanceKey(key)) {
      const balance = doubleFromBalanceValue(item);
      if (balance !== undefined) return balance;
    }
    const nested = findZenBalance(item);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/** Matches `"<key>": <number>` style pairs (the keys are word-ish, values numeric). */
const KEYED_NUMBER_RE =
  /["']?([A-Za-z][A-Za-z0-9_]{2,40})["']?\s*:\s*"?\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)"?/g;

/**
 * Find the balance when it is carried as a keyed number in serialized data
 * embedded in the page (e.g. SolidStart hydration), where there is no "$" prefix
 * and a human "balance" label may be nowhere near it — so neither the whole-body
 * `JSON.parse` (the HTML isn't valid JSON) nor the label-proximity patterns
 * catch it. Restricted to the same explicit balance keys as {@link findZenBalance}
 * (e.g. `currentBalanceUsd`), so a bare `balance` that might be cents is ignored.
 */
function balanceFromEmbeddedKeys(text: string): number | undefined {
  for (const [, key, value] of text.matchAll(KEYED_NUMBER_RE)) {
    if (key && value && isExplicitBalanceKey(key)) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

/** 1e8 raw units per USD in opencode.ai's billing store (see the console's `formatBalance`). */
const OPENCODE_BALANCE_UNITS_PER_USD = 100_000_000;
/** Sibling keys that confirm a bare `balance:` match is the opencode.ai billing object. */
const BILLING_SIBLING_RE = /reloadAmount|monthlyUsage|monthlyLimit|customerID|paymentMethod/i;

/**
 * opencode.ai server-renders its `billing.get` query into the page (SolidStart
 * SSR), where the balance is the raw `balance` field in 1e8 units — $1 =
 * 100,000,000, with no "$" — per the console's `formatBalance`. Match that exact
 * field (a lookbehind rejects `currentBalance`/`balanceUsd`; a nearby billing
 * sibling key guards against an unrelated `balance`) and convert to dollars.
 */
function balanceFromBillingPayload(text: string): number | undefined {
  for (const match of text.matchAll(/(?<![A-Za-z])balance["']?\s*:\s*([0-9]{4,})/gi)) {
    const raw = match[1];
    const at = match.index ?? 0;
    if (!raw) continue;
    const window = text.slice(Math.max(0, at - 200), at + 200);
    if (!BILLING_SIBLING_RE.test(window)) continue;
    const usd = Number(raw) / OPENCODE_BALANCE_UNITS_PER_USD;
    if (Number.isFinite(usd) && usd >= 0 && usd < 1_000_000) {
      return Math.round(usd * 100) / 100;
    }
  }
  return undefined;
}

export function parseZenBalance(text: string): number | undefined {
  try {
    const balance = findZenBalance(JSON.parse(text));
    if (balance !== undefined) return balance;
  } catch {
    // Not a pure-JSON body (e.g. an HTML dashboard); fall through.
  }
  const billing = balanceFromBillingPayload(text);
  if (billing !== undefined) return billing;
  const embedded = balanceFromEmbeddedKeys(text);
  if (embedded !== undefined) return embedded;
  const localized = text.match(
    /(?:current\s+balance|zen\s+balance|現在の残高)[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
  );
  const nearby =
    localized ?? text.match(/(?:balance|残高)[\s\S]{0,120}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!nearby?.[1]) return undefined;
  const parsed = Number(nearby[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * A short, value-masked excerpt around the first `balance:` in the body, so the
 * dev log reveals the serialization *shape* (key names, formatting) without
 * writing the actual balance or any account ids: every digit run becomes
 * `<Nd>` and every long id-like token becomes `<id>`.
 */
function balanceStructureExcerpt(body: string): string | undefined {
  const match = /(?<![A-Za-z])balance["']?\s*:/i.exec(body);
  if (!match) return undefined;
  return body
    .slice(Math.max(0, match.index - 60), match.index + 120)
    .replace(/[0-9]+/g, (digits) => `<${digits.length}d>`)
    .replace(/[A-Za-z0-9_]{16,}/g, "<id>");
}

/**
 * Non-sensitive shape of the workspace page, for the dev file logger only, to
 * diagnose why a balance fails to parse without writing account data: HTTP
 * status, body length, the signed-out heuristic, `$`/`balance` token counts, the
 * explicit balance key names present, and a value-masked excerpt. Never includes
 * the balance itself or any id.
 */
function workspacePageDiagnostics(
  status: number,
  signedOut: boolean,
  body: string,
): Record<string, unknown> {
  const keys = new Set<string>();
  for (const [, key] of body.matchAll(KEYED_NUMBER_RE)) {
    if (key && isExplicitBalanceKey(key)) keys.add(key);
  }
  return {
    status,
    signedOut,
    length: body.length,
    dollarCount: (body.match(/\$/g) ?? []).length,
    balanceTokenCount: (body.match(/balance/gi) ?? []).length,
    balanceKeysPresent: [...keys],
    embeddedBalanceMatched: balanceFromEmbeddedKeys(body) !== undefined,
    billingPayloadMatched: balanceFromBillingPayload(body) !== undefined,
    balanceContext: balanceStructureExcerpt(body),
  };
}

interface OpenCodeWebSession {
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
async function fetchOpenCodeWeb(host: HostPort, nowMs: number): Promise<OpenCodeWebSession> {
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
        workspacePageDiagnostics(page.status, looksSignedOut(page.body), page.body),
      );
    }
  }

  return {
    live: true,
    ...(balance !== undefined ? { balance } : {}),
    ...(goWindows.length > 0 ? { goWindows } : {}),
  };
}

/** Build the OpenCode usage snapshot from Go subscription usage and optional Zen balance. */
export async function scanOpenCodeUsage(nowMs: number, host?: HostPort): Promise<UsageSnapshot> {
  const hasGoAuth = hasOpenCodeGoAuth();
  const rows = (await readOpenCodeGoRows()) ?? [];
  const web: OpenCodeWebSession = host
    ? await fetchOpenCodeWeb(host, nowMs).catch(() => ({ live: false }))
    : { live: false };
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
