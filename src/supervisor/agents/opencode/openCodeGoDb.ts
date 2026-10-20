import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { OpenCodeCostRow } from "@poracode/agents-usage";
import { withReadonlyDb } from "../../runtime/sqliteRead";

/**
 * OpenCode Go spend lives in the CLI's local `opencode.db` SQLite store. This
 * module owns reading it and the CLI's credentials. Read-only and
 * fail-safe — any error degrades to "no rows" / "no auth".
 */

const OPENCODE_GO_PROVIDER_ID = "opencode-go";
const OPENCODE_PROVIDER_ID = "opencode";

export interface OpenCodeUsageCredential {
  apiKey: string;
  plan: "Go" | "Zen";
}

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
  const database = process.env.OPENCODE_DB?.trim() || "opencode.db";
  if (isAbsolute(database)) return [database];
  return openCodeDataDirs().map((dir) => join(dir, database));
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

export function normalizeRows(raw: { createdMs?: unknown; cost?: unknown }[]): OpenCodeCostRow[] {
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

/**
 * Read OpenCode 2's active Go key from its native credential table, or the
 * legacy `auth.json` when no native credential store exists. Never resurrect
 * a stale JSON key after the native account has been removed or switched.
 */
export async function readOpenCodeUsageCredential(): Promise<OpenCodeUsageCredential | undefined> {
  for (const dbPath of openCodeDbPaths()) {
    if (!existsSync(dbPath)) continue;
    const native = await withReadonlyDb<{ credential?: OpenCodeUsageCredential } | null>(
      dbPath,
      (db) => {
        if (db.prepare(TABLE_EXISTS_SQL).get("credential") === undefined) return null;
        const rows = db
          .prepare(
            `SELECT integration_id AS providerId, json_extract(value, '$.key') AS apiKey FROM credential
           WHERE integration_id IN (?, ?) AND active = 1
             AND json_valid(value) AND json_extract(value, '$.type') = 'key'
           ORDER BY CASE integration_id WHEN ? THEN 0 ELSE 1 END`,
          )
          .all(OPENCODE_GO_PROVIDER_ID, OPENCODE_PROVIDER_ID, OPENCODE_GO_PROVIDER_ID) as {
          apiKey: unknown;
          providerId: string;
        }[];
        for (const row of rows) {
          if (typeof row.apiKey === "string" && row.apiKey.trim()) {
            return {
              credential: {
                apiKey: row.apiKey.trim(),
                plan: row.providerId === OPENCODE_GO_PROVIDER_ID ? "Go" : "Zen",
              },
            };
          }
        }
        return {};
      },
    );
    if (native !== null) return native?.credential;
  }
  for (const path of openCodeAuthPaths()) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      for (const id of [OPENCODE_GO_PROVIDER_ID, OPENCODE_PROVIDER_ID]) {
        const entry = parsed[id];
        if (!entry || typeof entry !== "object") continue;
        const key = (entry as { key?: unknown }).key;
        if (typeof key === "string" && key.trim()) {
          return { apiKey: key.trim(), plan: id === OPENCODE_GO_PROVIDER_ID ? "Go" : "Zen" };
        }
      }
    } catch {
      // try the next auth path
    }
  }
  return undefined;
}

export async function readOpenCodeGoRows(): Promise<OpenCodeCostRow[] | undefined> {
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
