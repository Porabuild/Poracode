import {
  baseAgentKind,
  type AiActionType,
  type ProfileAiAction,
  type ProfileBreakdownEntry,
  type ProfileCoreStats,
  type ProfileDevice,
  type ProfileInsights,
  type ProfileSkillUsage,
  type ProfileStatsRequest,
  type ProfileTotals,
} from "@/shared/contracts";
import { dbGetAllUsageEvents, getProfileDataGeneration, type UsageEventRow } from "../db";
import {
  buildHeatmap,
  dayKeyFromIndex,
  localDayIndex,
  localHour,
  statsWindowDays,
  windowStartIndex,
} from "./heatmap";
import { getProfileIdentity, recordCurrentDevice, resolveProfileDevice } from "./identity";
import {
  accountLabel,
  mcpServerLabel,
  modelKey,
  modelLabel,
  providerLabel,
  titleCase,
} from "./labels";

/**
 * Profile core stats, computed entirely from the durable `usage_events` log
 * (NOT thread-scoped tables) - so the numbers survive thread delete/archive.
 * Every fact was already captured at the canonical-event layer with its
 * provider/model/mode denormalized, so there are no joins and no per-provider
 * splits here.
 */

const MAX_SKILLS = 8;

function hourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function filterRowsByWindow(
  rows: UsageEventRow[],
  todayIndex: number,
  offset: number,
  windowDays: number | undefined,
): UsageEventRow[] {
  if (!windowDays) return rows;
  const startIndex = windowStartIndex(todayIndex, windowDays);
  return rows.filter((row) => {
    const dayIndex = localDayIndex(row.ts, offset);
    return dayIndex >= startIndex && dayIndex <= todayIndex;
  });
}

function rank(
  counts: Map<string, number>,
  labelFor: (key: string) => string,
  denominator: number,
): ProfileBreakdownEntry[] {
  const entries = [...counts.entries()].map(([key, count]) => ({
    key,
    label: labelFor(key),
    count,
    percent: denominator > 0 ? round1((count / denominator) * 100) : 0,
  }));
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

function topKey(map: Map<string, number>): string | undefined {
  let bestKey: string | undefined;
  let best = -1;
  for (const [key, count] of map) {
    if (count > best) {
      best = count;
      bestKey = key;
    }
  }
  return bestKey;
}

function computeStreaks(
  activeDayIndices: Set<number>,
  todayIndex: number,
): { current: number; longest: number } {
  if (activeDayIndices.size === 0) return { current: 0, longest: 0 };
  const sorted = [...activeDayIndices].sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1]! + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  let anchor = activeDayIndices.has(todayIndex)
    ? todayIndex
    : activeDayIndices.has(todayIndex - 1)
      ? todayIndex - 1
      : null;
  let current = 0;
  while (anchor !== null && activeDayIndices.has(anchor)) {
    current++;
    anchor--;
  }
  return { current, longest };
}

const AI_ACTION_LABELS: Record<AiActionType, string> = {
  commit: "AI commits",
  pr: "AI pull requests",
  conflict: "Conflicts resolved",
};

function computeAiActions(rows: UsageEventRow[]): ProfileAiAction[] {
  const byType = new Map<
    AiActionType,
    { count: number; providers: Map<string, number>; models: Map<string, number> }
  >();
  for (const row of rows) {
    if (!row.kind.startsWith("ai_")) continue;
    const type = row.kind.slice(3) as AiActionType;
    if (type !== "commit" && type !== "pr" && type !== "conflict") continue;
    let entry = byType.get(type);
    if (!entry) {
      entry = { count: 0, providers: new Map(), models: new Map() };
      byType.set(type, entry);
    }
    entry.count += 1;
    if (row.provider)
      entry.providers.set(row.provider, (entry.providers.get(row.provider) ?? 0) + 1);
    if (row.model) entry.models.set(row.model, (entry.models.get(row.model) ?? 0) + 1);
  }
  const out: ProfileAiAction[] = [];
  for (const type of ["commit", "pr", "conflict"] as AiActionType[]) {
    const entry = byType.get(type);
    if (!entry) continue;
    const topProvider = topKey(entry.providers);
    const topModel = topKey(entry.models);
    out.push({
      type,
      label: AI_ACTION_LABELS[type],
      count: entry.count,
      ...(topProvider ? { topProvider: providerLabel(baseAgentKind(topProvider)) } : {}),
      ...(topModel ? { topModel } : {}),
    });
  }
  return out;
}

function isGenericMcpName(name: string): boolean {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  return normalized === "mcp" || normalized === "mcptoolcall";
}

function computeSkills(rows: UsageEventRow[]): {
  skills: ProfileSkillUsage[];
  explored: number;
  total: number;
  mcps: ProfileSkillUsage[];
  workflowRuns: number;
  subagentRuns: number;
  mcpToolCalls: number;
} {
  const skillCounts = new Map<string, number>();
  const mcpCounts = new Map<string, number>();
  let total = 0;
  let workflowRuns = 0;
  let subagentRuns = 0;
  let mcpToolCalls = 0;
  for (const row of rows) {
    if (row.kind === "skill") {
      const name = row.name?.trim();
      if (!name || name.toLowerCase() === "skill") continue;
      skillCounts.set(name, (skillCounts.get(name) ?? 0) + 1);
      total++;
    } else if (row.kind === "workflow") {
      workflowRuns++;
    } else if (row.kind === "subagent") {
      // Legacy rows recorded before workflows got their own kind still arrive as
      // subagents named "workflow" - re-bucket those into the workflow count.
      if ((row.name ?? "").trim().toLowerCase() === "workflow") workflowRuns++;
      else subagentRuns++;
    } else if (row.kind === "mcp") {
      const name = row.name?.trim();
      if (!name || isGenericMcpName(name) || isGenericMcpName(mcpServerLabel(name))) continue;
      mcpToolCalls++;
      // New Codex events are unwrapped to the inner app at the provider boundary.
      // Historical rows only retained this aggregate wrapper, so do not present
      // it as if it were an MCP server alongside the real app names.
      if (name.toLowerCase() === "codex_apps") continue;
      mcpCounts.set(name, (mcpCounts.get(name) ?? 0) + 1);
    }
  }
  const topBy = (
    counts: Map<string, number>,
    kind: ProfileSkillUsage["kind"],
    display: (name: string) => string,
  ): ProfileSkillUsage[] =>
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_SKILLS)
      .map(([name, runCount]) => ({ name, displayName: display(name), kind, runCount }));

  const skills = topBy(skillCounts, "skill", (n) => n);
  const mcps = topBy(mcpCounts, "mcp", mcpServerLabel);
  return {
    skills,
    explored: skillCounts.size,
    total,
    mcps,
    workflowRuns,
    subagentRuns,
    mcpToolCalls,
  };
}

/** Distinct accounts (account-scoped provider kinds) seen across all events. */
function collectAccounts(rows: UsageEventRow[]): { key: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.provider) continue;
    counts.set(row.provider, (counts.get(row.provider) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => ({ key, label: accountLabel(key) }));
}

// -- Entry point ------------------------------------------------------

function emptyTotals(): ProfileTotals {
  return {
    totalThreads: 0,
    totalPrompts: 0,
    messagesSent: 0,
    goalsSet: 0,
    longestTaskMs: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
    activeDays: 0,
  };
}

function emptyCoreStats(
  device: ProfileDevice,
  req: ProfileStatsRequest,
  generatedAt: number,
  todayIndex: number,
): ProfileCoreStats {
  const { heatmap } = buildHeatmap(new Map(), todayIndex, "prompts", statsWindowDays(req.window));
  return {
    scope: req.scope ?? "device",
    device,
    generatedAt,
    timezoneOffsetMinutes: req.utcOffsetMinutes,
    identity: getProfileIdentity(),
    totals: emptyTotals(),
    promptHeatmap: heatmap,
    insights: {
      fastModePercent: 0,
      skillsExplored: 0,
      totalSkillsUsed: 0,
      workflowRuns: 0,
      subagentRuns: 0,
      mcpToolCalls: 0,
    },
    modes: [],
    providers: [],
    accounts: [],
    models: [],
    skills: [],
    mcps: [],
    aiActions: [],
    availableAccounts: [],
  };
}

interface CoreCacheEntry {
  generation: number;
  result: ProfileCoreStats;
}
const coreCache = new Map<string, CoreCacheEntry>();

export function computeProfileCoreStats(req: ProfileStatsRequest): ProfileCoreStats {
  const offset = req.utcOffsetMinutes;
  const generatedAt = Date.now();
  const todayIndex = localDayIndex(generatedAt, offset);

  const generation = getProfileDataGeneration();
  const cacheKey = `${offset}|${todayIndex}|${req.scope ?? "device"}|${req.deviceId ?? "current"}|${req.provider ?? "all"}|${req.window ?? "all"}`;
  const cached = coreCache.get(cacheKey);
  if (cached && cached.generation === generation) return cached.result;

  const currentDevice = recordCurrentDevice();
  const targetDeviceId =
    req.scope === "all" ? currentDevice.id : (req.deviceId ?? currentDevice.id);
  if (targetDeviceId !== currentDevice.id) {
    const empty = emptyCoreStats(
      resolveProfileDevice(targetDeviceId),
      req,
      generatedAt,
      todayIndex,
    );
    coreCache.set(cacheKey, { generation, result: empty });
    return empty;
  }

  const allRows = dbGetAllUsageEvents();
  // The account picker lists every account ever seen, independent of the active
  // filter, so selecting one account doesn't collapse the picker to itself.
  const availableAccounts = collectAccounts(allRows);
  // Scope every downstream aggregation to the selected account (whole page).
  const providerRows = req.provider ? allRows.filter((r) => r.provider === req.provider) : allRows;
  const windowDays = statsWindowDays(req.window);
  const rows = filterRowsByWindow(providerRows, todayIndex, offset, windowDays);

  // -- thread starts -> totals + mode breakdown --
  const modeCounts = new Map<string, number>();
  let totalThreads = 0;
  for (const row of rows) {
    if (row.kind !== "thread_started") continue;
    totalThreads++;
    const mode = row.mode === "chat" ? "chat" : "cli";
    modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
  }
  const modes = rank(modeCounts, (m) => (m === "chat" ? "Chat" : "CLI"), totalThreads);

  // -- turns -> activity, streaks, breakdowns, longest task --
  const countsByDay = new Map<string, number>();
  const activeDayIndices = new Set<number>();
  const hourCounts = new Map<number, number>();
  const providerCounts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  const modelCounts = new Map<string, number>();
  const effortCounts = new Map<string, number>();
  let totalTurns = 0;
  let longestTaskMs = 0;
  let fastTurns = 0;
  let effortTurns = 0;
  let messagesSent = 0;
  let goalsSet = 0;

  for (const row of rows) {
    if (row.kind === "message") {
      messagesSent++;
      continue;
    }
    if (row.kind === "goal") {
      goalsSet++;
      continue;
    }
    if (row.kind !== "turn") continue;
    totalTurns++;
    if (row.value > longestTaskMs) longestTaskMs = row.value;
    const dayIndex = localDayIndex(row.ts, offset);
    const day = dayKeyFromIndex(dayIndex);
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
    activeDayIndices.add(dayIndex);
    const hour = localHour(row.ts, offset);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    if (row.provider) {
      const base = baseAgentKind(row.provider);
      providerCounts.set(base, (providerCounts.get(base) ?? 0) + 1);
      accountCounts.set(row.provider, (accountCounts.get(row.provider) ?? 0) + 1);
    }
    if (row.model) {
      const key = modelKey(row.provider, row.model);
      modelCounts.set(key, (modelCounts.get(key) ?? 0) + 1);
    }
    if (row.fast) fastTurns++;
    if (row.effort) {
      effortTurns++;
      effortCounts.set(row.effort, (effortCounts.get(row.effort) ?? 0) + 1);
    }
  }

  const { heatmap: promptHeatmap, activeDays } = buildHeatmap(
    countsByDay,
    todayIndex,
    "prompts",
    windowDays,
  );
  const { current: currentStreakDays, longest: longestStreakDays } = computeStreaks(
    activeDayIndices,
    todayIndex,
  );

  const providers = rank(providerCounts, providerLabel, totalTurns);
  const accounts = rank(accountCounts, accountLabel, totalTurns);
  const models = rank(modelCounts, modelLabel, totalTurns);
  const reasoning = rank(effortCounts, (e) => titleCase(e), effortTurns);

  let mostActiveHour: ProfileInsights["mostActiveHour"];
  let bestHourCount = 0;
  for (const [hour, count] of hourCounts) {
    if (count > bestHourCount) {
      bestHourCount = count;
      mostActiveHour = { hour, label: hourLabel(hour), count };
    }
  }

  const {
    skills,
    explored,
    total: totalSkillsUsed,
    mcps,
    workflowRuns,
    subagentRuns,
    mcpToolCalls,
  } = computeSkills(rows);

  const totals: ProfileTotals = {
    totalThreads,
    totalPrompts: totalTurns,
    messagesSent,
    goalsSet,
    longestTaskMs,
    currentStreakDays,
    longestStreakDays,
    activeDays,
  };

  const insights: ProfileInsights = {
    ...(providers[0] ? { topProvider: providers[0] } : {}),
    ...(models[0] ? { topModel: models[0] } : {}),
    ...(reasoning[0] ? { topReasoning: reasoning[0] } : {}),
    fastModePercent: totalTurns > 0 ? round1((fastTurns / totalTurns) * 100) : 0,
    ...(mostActiveHour ? { mostActiveHour } : {}),
    skillsExplored: explored,
    totalSkillsUsed,
    workflowRuns,
    subagentRuns,
    mcpToolCalls,
  };

  const result: ProfileCoreStats = {
    scope: req.scope ?? "device",
    device: currentDevice,
    generatedAt,
    timezoneOffsetMinutes: offset,
    identity: getProfileIdentity(),
    totals,
    promptHeatmap,
    insights,
    providers,
    accounts,
    models,
    modes,
    skills,
    mcps,
    aiActions: computeAiActions(rows),
    availableAccounts,
  };
  coreCache.set(cacheKey, { generation, result });
  return result;
}
