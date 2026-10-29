import { homedir } from "node:os";
import {
  formatCodexPlanLabel,
  type UsageCredits,
  type UsageSnapshot,
  type UsageTokens,
  type UsageWindow,
} from "@poracode/agents-usage";
import { readAgentCommandOutput } from "../base";
import { resolveExecutablePathAsync } from "../base/processRuntime";
import { FX_BASE_SPAWN_ENV } from "./detection";

/**
 * Maps `fx usage --json` (schema 2) into Poracode's usage snapshot for whichever
 * backend fx is signed in to (AI Gateway, ChatGPT/Codex, or Grok).
 */
export const FX_USAGE_PROVIDER_ID = "fx";

const AUTH_MISSING_REASONS = new Set(["no_gateway_sign_in", "no_team", "refresh_needed"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function errorSnapshot(fetchedAt: number, error: string): UsageSnapshot {
  return { providerId: FX_USAGE_PROVIDER_ID, status: "error", windows: [], fetchedAt, error };
}

function nextUtcMidnight(nowMs: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function nextUtcMonthStart(nowMs: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

function aiGatewaySnapshot(
  record: Record<string, unknown>,
  nowMs: number,
  fetchedAt: number,
): UsageSnapshot {
  const windows: UsageWindow[] = [];
  let credits: UsageCredits | undefined;

  const budget = asRecord(record["budget"]);
  const limit = finiteNonNegative(budget?.["limit"]);
  const spent = finiteNonNegative(budget?.["spent"]);
  const budgetPeriod = budget?.["period"];
  if (limit !== undefined && limit > 0 && spent !== undefined) {
    if (budgetPeriod === "daily" || budgetPeriod === "weekly" || budgetPeriod === "monthly") {
      windows.push({
        id: budgetPeriod,
        label: "Budget",
        usedPercent: clampPercent((spent / limit) * 100),
        used: spent,
        limit,
        unit: "usd",
        currency: "USD",
        ...(budgetPeriod === "monthly" ? { resetsAt: nextUtcMonthStart(nowMs) } : {}),
        ...(budgetPeriod === "daily" ? { resetsAt: nextUtcMidnight(nowMs) } : {}),
      });
    } else if (budgetPeriod === "none") {
      credits = { balance: Math.max(limit - spent, 0), currency: "USD", label: "Budget left" };
    }
  }

  const totals = asRecord(record["totals"]);
  const spend = finiteNonNegative(totals?.["spend"]);
  const cost =
    spend !== undefined
      ? { currency: "USD", amount: spend, period: "cycle" as const, estimated: false }
      : undefined;

  let tokens: UsageTokens | undefined;
  if (totals) {
    const total = finiteNonNegative(totals["total_tokens"]);
    const input = finiteNonNegative(totals["input_tokens"]);
    const output = finiteNonNegative(totals["output_tokens"]);
    const cacheRead = finiteNonNegative(totals["cache_read_tokens"]);
    const cacheWrite = finiteNonNegative(totals["cache_write_tokens"]);
    if (
      total !== undefined ||
      input !== undefined ||
      output !== undefined ||
      cacheRead !== undefined ||
      cacheWrite !== undefined
    ) {
      tokens = {
        ...(total !== undefined ? { total } : {}),
        ...(input !== undefined ? { input } : {}),
        ...(output !== undefined ? { output } : {}),
        ...(cacheRead !== undefined ? { cacheRead } : {}),
        ...(cacheWrite !== undefined ? { cacheWrite } : {}),
        period: "cycle",
      };
    }
  }

  return {
    providerId: FX_USAGE_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt,
    ...(cost ? { cost } : {}),
    ...(tokens ? { tokens } : {}),
    ...(credits ? { credits } : {}),
  };
}

function chatGptSnapshot(record: Record<string, unknown>, fetchedAt: number): UsageSnapshot {
  const codex = asRecord(record["codex"]);
  const plan = formatCodexPlanLabel(
    typeof codex?.["plan"] === "string" ? (codex["plan"] as string) : undefined,
  );

  const windows: UsageWindow[] = [];
  const usedIds = new Set<string>();
  const limits = Array.isArray(codex?.["limits"]) ? (codex["limits"] as unknown[]) : [];
  for (const entry of limits) {
    const limit = asRecord(entry);
    if (!limit) continue;
    const name = typeof limit["name"] === "string" ? limit["name"] : "";
    for (const slot of ["primary", "secondary"] as const) {
      const window = asRecord(limit[slot]);
      const usedPercent = finiteNumber(window?.["used_percent"]);
      const windowSeconds = finiteNumber(window?.["window_seconds"]);
      if (usedPercent === undefined || windowSeconds === undefined) continue;

      let id: string;
      let label: string;
      if (windowSeconds === 18_000) {
        id = "session-5h";
        label = "Session (5h)";
      } else if (windowSeconds === 604_800) {
        id = "weekly";
        label = "Weekly";
      } else {
        id = `codex:${name}-${windowSeconds}`;
        label = `${name} (${Math.round(windowSeconds / 3600)}h)`;
      }
      if (usedIds.has(id)) id = `codex:${name}-${windowSeconds}`;
      usedIds.add(id);

      const resetsAt = positiveInteger(window?.["resets_at_ms"]);
      windows.push({
        id,
        label,
        usedPercent: clampPercent(usedPercent),
        ...(resetsAt !== undefined ? { resetsAt } : {}),
      });
    }
  }

  const creditInfo = asRecord(codex?.["credits"]);
  let credits: UsageCredits | undefined;
  if (creditInfo?.["unlimited"] === true) {
    credits = { balance: 0, unlimited: true };
  } else if (creditInfo?.["has_credits"] === true) {
    const balance = Number(creditInfo["balance"]);
    if (Number.isFinite(balance)) credits = { balance };
  }

  return {
    providerId: FX_USAGE_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt,
    ...(plan ? { plan } : {}),
    ...(credits ? { credits } : {}),
  };
}

function grokSnapshot(record: Record<string, unknown>, fetchedAt: number): UsageSnapshot {
  const grok = asRecord(record["grok"]);
  const settings = asRecord(grok?.["settings"]);
  const plan = typeof settings?.["plan"] === "string" ? settings["plan"] : undefined;

  const windows: UsageWindow[] = [];
  const usedPercent = finiteNumber(grok?.["used_percent"]);
  if (usedPercent !== undefined) {
    const period = grok?.["period"] === "weekly" ? "weekly" : "monthly";
    const resetsAt = positiveInteger(grok?.["resets_at_ms"]);
    windows.push({
      id: period,
      label: period === "weekly" ? "Weekly" : "Monthly",
      usedPercent: clampPercent(usedPercent),
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    });
  }

  const capCents = finiteNonNegative(grok?.["on_demand_cap_cents"]);
  const usedCents = finiteNonNegative(grok?.["on_demand_used_cents"]);
  if (capCents !== undefined && capCents > 0 && usedCents !== undefined) {
    windows.push({
      id: "extra-usage",
      label: "On-demand",
      usedPercent: clampPercent((usedCents / capCents) * 100),
      used: usedCents / 100,
      limit: capCents / 100,
      unit: "usd",
      currency: "USD",
    });
  }

  const prepaidCents = finiteNonNegative(grok?.["prepaid_cents"]);
  const credits: UsageCredits | undefined =
    prepaidCents !== undefined
      ? { balance: prepaidCents / 100, currency: "USD", label: "Prepaid" }
      : undefined;

  return {
    providerId: FX_USAGE_PROVIDER_ID,
    status: "ok",
    windows,
    fetchedAt,
    ...(plan ? { plan } : {}),
    ...(credits ? { credits } : {}),
  };
}

export function parseFxUsageJson(stdout: string, nowMs: number): UsageSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return errorSnapshot(nowMs, "fx usage returned unreadable output");
  }
  const record = asRecord(parsed);
  if (!record || record["kind"] !== "usage") {
    return errorSnapshot(nowMs, "fx usage returned unreadable output");
  }

  const fetchedAt = nonNegativeInteger(record["fetched_at_ms"]) ?? nowMs;
  const status = record["status"];
  const reason = typeof record["reason"] === "string" ? record["reason"] : undefined;

  if (status === "failed") {
    return errorSnapshot(fetchedAt, `fx usage could not refresh (${reason ?? "unknown"})`);
  }
  if (status === "unavailable") {
    return {
      providerId: FX_USAGE_PROVIDER_ID,
      status:
        reason !== undefined && AUTH_MISSING_REASONS.has(reason) ? "auth-missing" : "unsupported",
      windows: [],
      fetchedAt,
    };
  }
  if (status !== "ready" && status !== "fetching") {
    return errorSnapshot(fetchedAt, "fx usage returned unreadable output");
  }

  if (record["source"] === "chatgpt") return chatGptSnapshot(record, fetchedAt);
  if (record["source"] === "grok") return grokSnapshot(record, fetchedAt);
  if (record["source"] === "ai_gateway") return aiGatewaySnapshot(record, nowMs, fetchedAt);
  return { providerId: FX_USAGE_PROVIDER_ID, status: "ok", windows: [], fetchedAt };
}

export interface FxUsageScanDeps {
  platform: NodeJS.Platform;
  resolveBinary(): Promise<string | undefined>;
  runUsage(binary: string): Promise<{ ok: boolean; stdout: string }>;
}

const defaultFxUsageScanDeps: FxUsageScanDeps = {
  platform: process.platform,
  resolveBinary: () => resolveExecutablePathAsync("fx"),
  runUsage: (binary) =>
    readAgentCommandOutput(
      { kind: "posix", path: homedir() },
      binary,
      ["usage", "--json", "--period", "month"],
      { timeoutMs: 20_000, env: { ...FX_BASE_SPAWN_ENV, FX_NO_OPEN_BROWSER: "1" } },
    ),
};

export async function scanFxUsage(
  nowMs: number,
  deps: FxUsageScanDeps = defaultFxUsageScanDeps,
): Promise<UsageSnapshot> {
  if (deps.platform === "win32") {
    return {
      providerId: FX_USAGE_PROVIDER_ID,
      status: "unsupported",
      windows: [],
      fetchedAt: nowMs,
    };
  }
  try {
    const binary = await deps.resolveBinary();
    if (!binary) {
      return {
        providerId: FX_USAGE_PROVIDER_ID,
        status: "app-not-running",
        windows: [],
        fetchedAt: nowMs,
        error: "fx is not installed",
      };
    }
    const result = await deps.runUsage(binary);
    if (result.ok) return parseFxUsageJson(result.stdout, nowMs);
    try {
      JSON.parse(result.stdout);
      return parseFxUsageJson(result.stdout, nowMs);
    } catch {
      return errorSnapshot(nowMs, "fx usage failed");
    }
  } catch {
    return errorSnapshot(nowMs, "fx usage failed");
  }
}
