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

function parseZenBalance(text: string): number | undefined {
  try {
    const balance = findZenBalance(JSON.parse(text));
    if (balance !== undefined) return balance;
  } catch {
    // fall through to text parsing
  }
  const localized = text.match(
    /(?:current\s+balance|zen\s+balance|現在の残高)[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i,
  );
  const nearby =
    localized ?? text.match(/(?:balance|残高)[\s\S]{0,120}?\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!nearby?.[1]) return undefined;
  const parsed = Number(nearby[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function fetchZenBalance(host: HostPort): Promise<number | undefined> {
  const cookie = openCodeRequestCookie(await host.credentials.getSecret("opencode", "cookie"));
  if (!cookie) return undefined;
  const workspaceId = await fetchOpenCodeWorkspaceId(host.http, cookie);
  if (!workspaceId) return undefined;
  const res = await host.http.request({
    url: `https://opencode.ai/workspace/${workspaceId}`,
    headers: {
      Cookie: cookie,
      "User-Agent": OPENCODE_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 5000,
  });
  if (res.status !== 200 || looksSignedOut(res.body)) return undefined;
  return parseZenBalance(res.body);
}

/** Build the OpenCode usage snapshot from local Go usage and optional Zen balance. */
export async function scanOpenCodeUsage(nowMs: number, host?: HostPort): Promise<UsageSnapshot> {
  const hasGoAuth = hasOpenCodeGoAuth();
  const rows = (await readOpenCodeGoRows()) ?? [];
  const zenBalance = host ? await fetchZenBalance(host).catch(() => undefined) : undefined;
  const hasGo = hasGoAuth || rows.length > 0;

  if (hasGo) {
    return {
      providerId: "opencode",
      status: "ok",
      plan: "Go",
      windows: aggregateOpenCodeUsage(rows, nowMs),
      ...(zenBalance !== undefined
        ? { credits: { balance: zenBalance, currency: "USD", label: "Zen balance" } }
        : {}),
      fetchedAt: nowMs,
    };
  }

  if (zenBalance !== undefined) {
    return {
      providerId: "opencode",
      status: "ok",
      plan: "Zen",
      windows: [],
      credits: { balance: zenBalance, currency: "USD", label: "Zen balance" },
      fetchedAt: nowMs,
    };
  }

  return { providerId: "opencode", status: "auth-missing", windows: [], fetchedAt: nowMs };
}
