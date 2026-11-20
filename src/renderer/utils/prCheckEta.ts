import type { ForgeRepository, GitHubActionsRun, PrCheck } from "@/shared/contracts";
import { formatElapsed } from "@/renderer/utils/formatTime";
import { parseGitHubActionsRunId } from "@/renderer/utils/githubActions";
import {
  getPrCheckPresentation,
  isPrCheckActive,
  summarizePrChecks,
} from "@/renderer/utils/prStatus";

const STORAGE_KEY = "poracode-pr-check-durations-v1";
const SCHEMA_VERSION = 1;
const MAX_BUCKETS = 20;
const MAX_CHECKS_PER_BUCKET = 120;
const MAX_SUITES_PER_BUCKET = 20;
const MAX_SAMPLES = 8;
const MAX_RECORDED_INSTANCES = 2000;
const MAX_RECORDED_RUN_IDS = 60;
const MAX_DURATION_MS = 6 * 60 * 60 * 1000;

interface StoredBucket {
  checks: Record<string, number[]>;
  suites: Record<string, number[]>;
  updatedAt: number;
}

interface StoredPayload {
  version: number;
  buckets: Record<string, StoredBucket>;
  recordedRunIds: number[];
}

export interface PrChecksEtaEstimate {
  estimatedEndMs: number;
  remainingMs: number;
  overdue: boolean;
  sampleCount: number;
  checkAvgDurationsMs: Record<string, number>;
}

let memoryStore: StoredPayload = {
  version: SCHEMA_VERSION,
  buckets: {},
  recordedRunIds: [],
};
let storageHydrated = false;
let futureVersionDetected = false;
const observedInstances = new Set<string>();

function createEmptyBucket(now = Date.now()): StoredBucket {
  return { checks: {}, suites: {}, updatedAt: now };
}

function sanitizeSamples(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_DURATION_MS,
  );
  return valid.slice(-MAX_SAMPLES);
}

function hydrateStore(): StoredPayload {
  if (storageHydrated) return memoryStore;
  storageHydrated = true;
  if (typeof localStorage === "undefined") return memoryStore;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryStore;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return memoryStore;
    const record = parsed as Record<string, unknown>;
    if (typeof record.version === "number" && record.version > SCHEMA_VERSION) {
      futureVersionDetected = true;
      return memoryStore;
    }
    if (record.version !== SCHEMA_VERSION) return memoryStore;

    const buckets: Record<string, StoredBucket> = {};
    if (record.buckets && typeof record.buckets === "object") {
      for (const [key, rawBucket] of Object.entries(record.buckets as Record<string, unknown>)) {
        if (!rawBucket || typeof rawBucket !== "object") continue;
        const b = rawBucket as Record<string, unknown>;
        const checks: Record<string, number[]> = {};
        const suites: Record<string, number[]> = {};
        if (b.checks && typeof b.checks === "object") {
          for (const [name, samples] of Object.entries(b.checks as Record<string, unknown>)) {
            const clean = sanitizeSamples(samples);
            if (clean.length > 0) checks[name] = clean;
          }
        }
        if (b.suites && typeof b.suites === "object") {
          for (const [name, samples] of Object.entries(b.suites as Record<string, unknown>)) {
            const clean = sanitizeSamples(samples);
            if (clean.length > 0) suites[name] = clean;
          }
        }
        buckets[key] = {
          checks,
          suites,
          updatedAt:
            typeof b.updatedAt === "number" && Number.isFinite(b.updatedAt)
              ? b.updatedAt
              : Date.now(),
        };
      }
    }

    const recordedRunIds = Array.isArray(record.recordedRunIds)
      ? record.recordedRunIds
          .filter(
            (id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0,
          )
          .slice(-MAX_RECORDED_RUN_IDS)
      : [];

    memoryStore = { version: SCHEMA_VERSION, buckets, recordedRunIds };
  } catch {
    // Ignore malformed cache entries; start with clean in-memory state.
  }
  return memoryStore;
}

function persistStore(): void {
  if (futureVersionDetected || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
  } catch {
    // Ignore storage quota errors; in-memory cache remains active.
  }
}

function pruneRecordMap(map: Record<string, number[]>, maxKeys: number): void {
  const keys = Object.keys(map);
  if (keys.length <= maxKeys) return;
  for (const key of keys.slice(0, keys.length - maxKeys)) {
    delete map[key];
  }
}

function getOrCreateBucket(historyKey: string): StoredBucket {
  const store = hydrateStore();
  let bucket = store.buckets[historyKey];
  if (!bucket) {
    const entries = Object.entries(store.buckets);
    if (entries.length >= MAX_BUCKETS) {
      entries.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      for (const [oldKey] of entries.slice(0, entries.length - MAX_BUCKETS + 1)) {
        delete store.buckets[oldKey];
      }
    }
    bucket = createEmptyBucket();
    store.buckets[historyKey] = bucket;
  }
  return bucket;
}

function pushSample(map: Record<string, number[]>, key: string, durationMs: number): boolean {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return false;
  }
  const existing = map[key] ?? [];
  const next = [...existing, Math.round(durationMs)].slice(-MAX_SAMPLES);
  map[key] = next;
  return true;
}

function trackObservation(dedupeKey: string): boolean {
  if (observedInstances.has(dedupeKey)) return false;
  if (observedInstances.size >= MAX_RECORDED_INSTANCES) {
    observedInstances.clear();
  }
  observedInstances.add(dedupeKey);
  return true;
}

function parseEpoch(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

export function buildPrCheckHistoryKey(
  projectId: string,
  source?: Pick<ForgeRepository, "forge" | "host" | "repository">,
): string {
  if (source) {
    return `forge:${source.forge}:${source.host.toLowerCase()}:${source.repository.toLowerCase()}`;
  }
  return `project:${projectId}`;
}

export function isWorkflowRunRecorded(runId: number): boolean {
  return hydrateStore().recordedRunIds.includes(runId);
}

export function recordCompletedPrChecks(historyKey: string, checks: readonly PrCheck[]): boolean {
  if (checks.length === 0) return false;
  const bucket = getOrCreateBucket(historyKey);
  const summary = summarizePrChecks(checks);
  const shouldRecordSuite = summary.active === 0 && summary.failed === 0 && summary.passed > 0;
  const suiteBounds = shouldRecordSuite
    ? new Map<string, { minStart: number; maxEnd: number }>()
    : null;
  const recordSpan = (suiteKey: string, startMs: number, endMs: number) => {
    if (!suiteBounds) return;
    const prev = suiteBounds.get(suiteKey);
    if (!prev) {
      suiteBounds.set(suiteKey, { minStart: startMs, maxEnd: endMs });
      return;
    }
    if (startMs < prev.minStart) prev.minStart = startMs;
    if (endMs > prev.maxEnd) prev.maxEnd = endMs;
  };
  let changed = false;

  for (const check of checks) {
    const status = getPrCheckPresentation(check).status;
    if (status === "skipped" || isPrCheckActive(check)) continue;
    const startMs = parseEpoch(check.startedAt);
    const endMs = parseEpoch(check.completedAt);
    if (startMs === undefined || endMs === undefined || endMs <= startMs) continue;
    recordSpan("__all__", startMs, endMs);
    if (check.workflowName) {
      recordSpan(check.workflowName, startMs, endMs);
    }
    const dedupeKey = `${historyKey}\0check\0${check.name}\0${check.startedAt}\0${check.completedAt}`;
    if (!trackObservation(dedupeKey)) continue;
    if (pushSample(bucket.checks, check.name, endMs - startMs)) {
      changed = true;
    }
  }

  if (suiteBounds) {
    for (const [suiteKey, bounds] of suiteBounds) {
      const durationMs = bounds.maxEnd - bounds.minStart;
      if (durationMs <= 0 || durationMs > MAX_DURATION_MS) continue;
      const dedupeKey = `${historyKey}\0suite\0${suiteKey}\0${bounds.minStart}\0${bounds.maxEnd}`;
      if (!trackObservation(dedupeKey)) continue;
      if (pushSample(bucket.suites, suiteKey, durationMs)) {
        changed = true;
      }
    }
  }

  if (changed) {
    bucket.updatedAt = Date.now();
    pruneRecordMap(bucket.checks, MAX_CHECKS_PER_BUCKET);
    pruneRecordMap(bucket.suites, MAX_SUITES_PER_BUCKET);
    persistStore();
  }
  return changed;
}

export function recordCompletedWorkflowRun(historyKey: string, run: GitHubActionsRun): boolean {
  if (run.status.toLowerCase() !== "completed") return false;
  const store = hydrateStore();
  if (store.recordedRunIds.includes(run.id)) return false;

  const bucket = getOrCreateBucket(historyKey);
  let changed = false;
  let minJobStart: number | undefined;
  let maxJobEnd: number | undefined;

  for (const job of run.jobs) {
    if (job.conclusion.toUpperCase() === "SKIPPED") continue;
    const startMs = parseEpoch(job.startedAt);
    const endMs = parseEpoch(job.completedAt);
    if (startMs === undefined || endMs === undefined || endMs <= startMs) continue;
    if (minJobStart === undefined || startMs < minJobStart) minJobStart = startMs;
    if (maxJobEnd === undefined || endMs > maxJobEnd) maxJobEnd = endMs;
    if (pushSample(bucket.checks, job.name, endMs - startMs)) {
      changed = true;
    }
  }

  const runStart = parseEpoch(run.startedAt);
  const runEnd = parseEpoch(run.updatedAt);
  const suiteDuration =
    minJobStart !== undefined && maxJobEnd !== undefined && maxJobEnd > minJobStart
      ? maxJobEnd - minJobStart
      : runStart !== undefined && runEnd !== undefined && runEnd > runStart
        ? runEnd - runStart
        : undefined;

  if (suiteDuration !== undefined && run.conclusion.toLowerCase() === "success") {
    const suiteKey = run.workflowName || "__all__";
    if (pushSample(bucket.suites, suiteKey, suiteDuration)) {
      changed = true;
    }
  }

  store.recordedRunIds = [...store.recordedRunIds, run.id].slice(-MAX_RECORDED_RUN_IDS);
  if (changed) {
    bucket.updatedAt = Date.now();
    pruneRecordMap(bucket.checks, MAX_CHECKS_PER_BUCKET);
    pruneRecordMap(bucket.suites, MAX_SUITES_PER_BUCKET);
  }
  persistStore();
  return changed;
}

export function trimmedAverageDurationMs(
  samples: readonly number[] | undefined,
): number | undefined {
  if (!samples || samples.length === 0) return undefined;
  const valid = samples
    .filter((value) => Number.isFinite(value) && value > 0 && value <= MAX_DURATION_MS)
    .sort((a, b) => a - b);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return Math.round(valid[0]!);
  if (valid.length === 2) return Math.round((valid[0]! + valid[1]!) / 2);

  const mid = Math.floor(valid.length / 2);
  const median = valid.length % 2 === 1 ? valid[mid]! : (valid[mid - 1]! + valid[mid]!) / 2;
  const filtered = valid.filter((value) => value >= median * 0.2 && value <= median * 2.5);
  const pool = filtered.length >= 2 ? filtered : valid;
  const sum = pool.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / pool.length);
}

function workflowRunAverageDurationMs(
  runs: readonly GitHubActionsRun[],
  workflowId: number | undefined,
  workflowName: string | undefined,
  preferredEvent: string | undefined,
): { avgMs: number; count: number } | undefined {
  const completed = runs.filter((run) => {
    if (run.status.toLowerCase() !== "completed") return false;
    if (workflowId && run.workflowId === workflowId) return true;
    if (workflowName && run.workflowName === workflowName) return true;
    return false;
  });
  if (completed.length === 0) return undefined;

  const successful = completed.filter((run) => run.conclusion.toLowerCase() === "success");
  const outcomePool = successful.length >= 2 ? successful : completed;
  const eventPool =
    preferredEvent && outcomePool.filter((run) => run.event === preferredEvent).length >= 2
      ? outcomePool.filter((run) => run.event === preferredEvent)
      : outcomePool;

  const durations: number[] = [];
  for (const run of eventPool.slice(0, 12)) {
    const startMs = parseEpoch(run.startedAt);
    const endMs = parseEpoch(run.updatedAt);
    if (
      startMs !== undefined &&
      endMs !== undefined &&
      endMs > startMs &&
      endMs - startMs <= MAX_DURATION_MS
    ) {
      durations.push(endMs - startMs);
    }
  }
  const avgMs = trimmedAverageDurationMs(durations);
  if (avgMs === undefined) return undefined;
  return { avgMs, count: durations.length };
}

export function estimatePrChecksCompletion(params: {
  historyKey: string;
  checks: readonly PrCheck[];
  workflowRuns?: readonly GitHubActionsRun[] | undefined;
  now?: number;
}): PrChecksEtaEstimate | null {
  const { historyKey, checks, workflowRuns = [], now = Date.now() } = params;
  const activeChecks = checks.filter(isPrCheckActive);
  if (activeChecks.length === 0) return null;

  const bucket = hydrateStore().buckets[historyKey];
  const checkAvgDurationsMs: Record<string, number> = {};
  const runningCheckEnds: number[] = [];
  let checkSampleCount = 0;
  let allActiveHaveRunningEstimate = true;

  for (const check of activeChecks) {
    const samples = bucket?.checks[check.name];
    const avgMs = trimmedAverageDurationMs(samples);
    if (avgMs !== undefined) {
      checkAvgDurationsMs[check.name] = avgMs;
      checkSampleCount = Math.max(checkSampleCount, samples?.length ?? 0);
    }
    const startMs = parseEpoch(check.startedAt);
    if (startMs !== undefined && avgMs !== undefined) {
      runningCheckEnds.push(startMs + avgMs);
    } else {
      allActiveHaveRunningEstimate = false;
    }
  }

  const runsById = new Map<number, GitHubActionsRun>();
  for (const run of workflowRuns) {
    runsById.set(run.id, run);
  }

  // Group active checks by workflow run (or workflowName / fallback suite) to estimate
  // pending/queued checks that do not have individual start timestamps yet.
  interface WorkflowGroup {
    runId: number | undefined;
    workflowName: string | undefined;
  }
  const groups = new Map<string, WorkflowGroup>();
  for (const check of activeChecks) {
    const runId = check.url ? (parseGitHubActionsRunId(check.url) ?? undefined) : undefined;
    const workflowName = check.workflowName || undefined;
    const key = runId ? `run:${runId}` : workflowName ? `wf:${workflowName}` : "__all__";
    if (!groups.has(key)) {
      groups.set(key, { runId, workflowName });
    }
  }

  const workflowEnds: number[] = [];
  let workflowSampleCount = 0;

  for (const group of groups.values()) {
    const activeRun =
      group.runId !== undefined
        ? runsById.get(group.runId)
        : group.workflowName
          ? workflowRuns.find(
              (run) =>
                run.workflowName === group.workflowName && run.status.toLowerCase() !== "completed",
            )
          : undefined;

    let groupStartMs = parseEpoch(activeRun?.startedAt) ?? parseEpoch(activeRun?.createdAt);
    if (groupStartMs === undefined) {
      for (const check of checks) {
        if (getPrCheckPresentation(check).status === "skipped") continue;
        const checkRunId = check.url ? parseGitHubActionsRunId(check.url) : null;
        const matchesGroup =
          (group.runId !== undefined && checkRunId === group.runId) ||
          (group.runId === undefined &&
            group.workflowName !== undefined &&
            check.workflowName === group.workflowName) ||
          (group.runId === undefined && group.workflowName === undefined);
        if (!matchesGroup) continue;
        const startMs = parseEpoch(check.startedAt);
        if (startMs !== undefined && (groupStartMs === undefined || startMs < groupStartMs)) {
          groupStartMs = startMs;
        }
      }
    }
    if (groupStartMs === undefined) continue;

    const wfName = activeRun?.workflowName || group.workflowName;
    const runStats = workflowRunAverageDurationMs(
      workflowRuns,
      activeRun?.workflowId,
      wfName,
      activeRun?.event,
    );
    if (runStats) {
      workflowEnds.push(groupStartMs + runStats.avgMs);
      workflowSampleCount = Math.max(workflowSampleCount, runStats.count);
      continue;
    }

    const suiteSamples = (wfName ? bucket?.suites[wfName] : undefined) ?? bucket?.suites.__all__;
    const localSuiteAvg = trimmedAverageDurationMs(suiteSamples);
    if (localSuiteAvg !== undefined) {
      workflowEnds.push(groupStartMs + localSuiteAvg);
      workflowSampleCount = Math.max(workflowSampleCount, suiteSamples?.length ?? 0);
    }
  }

  let estimatedEndMs: number | undefined;
  if (allActiveHaveRunningEstimate && runningCheckEnds.length > 0) {
    estimatedEndMs = Math.max(...runningCheckEnds);
  } else if (workflowEnds.length > 0 || runningCheckEnds.length > 0) {
    estimatedEndMs = Math.max(...workflowEnds, ...runningCheckEnds);
  }

  if (estimatedEndMs === undefined) return null;

  return {
    estimatedEndMs,
    remainingMs: Math.max(0, estimatedEndMs - now),
    overdue: estimatedEndMs <= now,
    sampleCount: Math.max(checkSampleCount, workflowSampleCount),
    checkAvgDurationsMs,
  };
}

export function formatEstimatedRemaining(ms: number): string {
  if (ms < 1000) return "<1s";
  return formatElapsed(Math.ceil(ms / 1000));
}

export function formatEstimatedClockTime(epochMs: number, locale?: string): string {
  return new Date(epochMs).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function clearPrCheckDurationHistoryForTests(): void {
  memoryStore = { version: SCHEMA_VERSION, buckets: {}, recordedRunIds: [] };
  storageHydrated = false;
  futureVersionDetected = false;
  observedInstances.clear();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
