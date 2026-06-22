import {
  baseAgentKind,
  type ProfileBreakdownEntry,
  type ProfileStatsRequest,
  type ProfileTokenProvider,
  type ProfileTokenStats,
} from "@/shared/contracts";
import { dbGetAllUsageEvents, getProfileDataGeneration } from "../db";
import {
  buildHeatmap,
  dayKeyFromIndex,
  HEATMAP_WINDOW_DAYS,
  localDayIndex,
  statsWindowDays,
  windowStartIndex,
} from "./heatmap";
import { recordCurrentDevice, resolveProfileDevice } from "./identity";
import { accountLabel, modelKey, modelLabel, providerLabel } from "./labels";

/**
 * Token usage from Lightcode's own activity, read from the durable `usage_events`
 * log (kind="tokens" - per-turn deltas captured at the canonical-event layer for
 * every provider, incl. all ACP agents). No external transcript scanning, and no
 * dependency on threads (survives delete/archive). Reported both globally (folded
 * to the base provider) and per account (each profile separately).
 */

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function emptyTokenStats(
  device: ProfileTokenStats["device"],
  req: ProfileStatsRequest,
  nowMs: number,
  todayIndex: number,
): ProfileTokenStats {
  const windowDays = statsWindowDays(req.window) ?? HEATMAP_WINDOW_DAYS;
  const { heatmap } = buildHeatmap(new Map(), todayIndex, "tokens", windowDays);
  return {
    available: false,
    scope: req.scope ?? "device",
    device,
    generatedAt: nowMs,
    timezoneOffsetMinutes: req.utcOffsetMinutes,
    windowDays,
    lifetimeTokens: 0,
    peakDayTokens: 0,
    providers: [],
    accounts: [],
    models: [],
    tokenHeatmap: heatmap,
  };
}

const tokenCache = new Map<string, { generation: number; result: ProfileTokenStats }>();

export function computeProfileTokenStats(req: ProfileStatsRequest): ProfileTokenStats {
  const offset = req.utcOffsetMinutes;
  const nowMs = Date.now();
  const todayIndex = localDayIndex(nowMs, offset);

  // Reuse the last aggregation until a usage write bumps the generation, so
  // repeated opens don't re-scan the log.
  const generation = getProfileDataGeneration();
  const cacheKey = `${offset}|${todayIndex}|${req.scope ?? "device"}|${req.deviceId ?? "current"}|${req.provider ?? "all"}|${req.window ?? "all"}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.generation === generation) return cached.result;

  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (targetDeviceId !== currentDevice.id) {
    const empty = emptyTokenStats(resolveProfileDevice(targetDeviceId), req, nowMs, todayIndex);
    tokenCache.set(cacheKey, { generation, result: empty });
    return empty;
  }

  const perDay = new Map<string, number>();
  const perProvider = new Map<string, number>();
  const perAccount = new Map<string, number>();
  const perModel = new Map<string, number>();
  let lifetimeTokens = 0;
  const windowDays = statsWindowDays(req.window);
  const startDayIndex = windowDays ? windowStartIndex(todayIndex, windowDays) : undefined;

  for (const row of dbGetAllUsageEvents()) {
    if (row.kind !== "tokens" || row.value <= 0) continue;
    // Scope to the selected account (exact account-kind match) when filtering.
    if (req.provider && row.provider !== req.provider) continue;
    const dayIndex = localDayIndex(row.ts, offset);
    if (startDayIndex !== undefined && (dayIndex < startDayIndex || dayIndex > todayIndex)) {
      continue;
    }
    lifetimeTokens += row.value;
    const day = dayKeyFromIndex(dayIndex);
    perDay.set(day, (perDay.get(day) ?? 0) + row.value);
    if (row.provider) {
      const base = baseAgentKind(row.provider);
      perProvider.set(base, (perProvider.get(base) ?? 0) + row.value);
      perAccount.set(row.provider, (perAccount.get(row.provider) ?? 0) + row.value);
    }
    if (row.model) {
      const key = modelKey(row.provider, row.model);
      perModel.set(key, (perModel.get(key) ?? 0) + row.value);
    }
  }

  const { heatmap: tokenHeatmap } = buildHeatmap(perDay, todayIndex, "tokens", windowDays);

  let peakDay: string | undefined;
  let peakDayTokens = 0;
  for (const [day, tokens] of perDay) {
    if (tokens > peakDayTokens) {
      peakDayTokens = tokens;
      peakDay = day;
    }
  }

  const providers: ProfileTokenProvider[] = [...perProvider.entries()]
    .filter(([, tokens]) => tokens > 0)
    .map(([provider, tokens]) => ({
      provider,
      label: providerLabel(provider),
      tokens,
      percent: lifetimeTokens > 0 ? round1((tokens / lifetimeTokens) * 100) : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const accounts: ProfileTokenProvider[] = [...perAccount.entries()]
    .filter(([, tokens]) => tokens > 0)
    .map(([account, tokens]) => ({
      provider: account,
      label: accountLabel(account),
      tokens,
      percent: lifetimeTokens > 0 ? round1((tokens / lifetimeTokens) * 100) : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const models: ProfileBreakdownEntry[] = [...perModel.entries()]
    .map(([key, tokens]) => ({
      key,
      label: modelLabel(key),
      count: tokens,
      percent: lifetimeTokens > 0 ? round1((tokens / lifetimeTokens) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const result: ProfileTokenStats = {
    available: lifetimeTokens > 0,
    scope: req.scope ?? "device",
    device: currentDevice,
    generatedAt: nowMs,
    timezoneOffsetMinutes: offset,
    windowDays: windowDays ?? HEATMAP_WINDOW_DAYS,
    lifetimeTokens,
    peakDayTokens,
    ...(peakDay ? { peakDay } : {}),
    providers,
    accounts,
    models,
    tokenHeatmap,
  };
  tokenCache.set(cacheKey, { generation, result });
  return result;
}
