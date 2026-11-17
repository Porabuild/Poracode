import { useEffect, useState } from "react";
import type { ForgeRepository, GitHubActionsRun, PrCheck } from "@/shared/contracts";
import { coalesceByKey } from "@/shared/coalesce";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { parseGitHubActionsRunId } from "@/renderer/utils/githubActions";
import {
  buildPrCheckHistoryKey,
  estimatePrChecksCompletion,
  isWorkflowRunRecorded,
  recordCompletedPrChecks,
  recordCompletedWorkflowRun,
  type PrChecksEtaEstimate,
} from "@/renderer/utils/prCheckEta";
import { isPrCheckActive } from "@/renderer/utils/prStatus";

const WORKFLOW_RUNS_CACHE_TTL_MS = 2 * 60_000;
const MAX_HYDRATED_RUNS_PER_LOAD = 2;

interface RunsCacheEntry {
  runs: GitHubActionsRun[];
  fetchedAt: number;
}

const runsCache = new Map<string, RunsCacheEntry>();
const runsInFlight = new Map<string, Promise<GitHubActionsRun[]>>();
const runDetailInFlight = new Map<number, Promise<void>>();
const failedRunDetailIds = new Set<number>();

function readCachedRuns(historyKey: string): GitHubActionsRun[] | undefined {
  const entry = runsCache.get(historyKey);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > WORKFLOW_RUNS_CACHE_TTL_MS) {
    runsCache.delete(historyKey);
    return undefined;
  }
  return entry.runs;
}

export function usePrChecksEta(params: {
  projectId: string;
  checks: readonly PrCheck[];
  source?: ForgeRepository | undefined;
}): {
  estimate: PrChecksEtaEstimate | null;
  now: number;
} {
  const { projectId, checks, source } = params;
  const historyKey = buildPrCheckHistoryKey(projectId, source);
  const [workflowRunsState, setWorkflowRunsState] = useState<
    { historyKey: string; runs: GitHubActionsRun[] } | undefined
  >(() => {
    const cached = readCachedRuns(historyKey);
    return cached ? { historyKey, runs: cached } : undefined;
  });
  const [historyVersion, setHistoryVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const workflowRuns =
    workflowRunsState?.historyKey === historyKey
      ? workflowRunsState.runs
      : readCachedRuns(historyKey);

  const hasActiveChecks = checks.some(isPrCheckActive);

  useEffect(() => {
    recordCompletedPrChecks(historyKey, checks);
  }, [historyKey, checks]);

  useEffect(() => {
    if (!hasActiveChecks) return;
    if (source && source.forge !== "github") return;

    const projectLocation = useAppStore
      .getState()
      .projects.find((project) => project.id === projectId)?.location;
    if (!projectLocation) return;

    const bridge = readBridge();
    if (!bridge || typeof bridge.ghListWorkflowRuns !== "function") return;

    let cancelled = false;

    const load = async () => {
      try {
        const cached = readCachedRuns(historyKey);
        const runs =
          cached ??
          (await coalesceByKey(runsInFlight, historyKey, async () => {
            const res = await bridge.ghListWorkflowRuns({ projectLocation });
            runsCache.set(historyKey, { runs: res.runs, fetchedAt: Date.now() });
            return res.runs;
          }));
        if (cancelled) return;
        setWorkflowRunsState((prev) =>
          prev?.historyKey === historyKey && prev.runs === runs ? prev : { historyKey, runs },
        );

        if (typeof bridge.ghGetWorkflowRun !== "function") return;

        // Identify active workflowIds / names so we only inspect recent completed
        // runs for workflows currently running on this PR.
        const activeRunIds = new Set<number>();
        const activeWorkflowNames = new Set<string>();
        for (const check of checks) {
          if (!isPrCheckActive(check)) continue;
          const runId = check.url ? parseGitHubActionsRunId(check.url) : null;
          if (runId) activeRunIds.add(runId);
          if (check.workflowName) activeWorkflowNames.add(check.workflowName);
        }

        const activeWorkflowIds = new Set<number>();
        for (const run of runs) {
          if (activeRunIds.has(run.id) || activeWorkflowNames.has(run.workflowName)) {
            if (run.workflowId > 0) activeWorkflowIds.add(run.workflowId);
            if (run.workflowName) activeWorkflowNames.add(run.workflowName);
          }
        }

        const candidateRuns = runs
          .filter((run) => {
            if (run.status.toLowerCase() !== "completed") return false;
            if (isWorkflowRunRecorded(run.id) || failedRunDetailIds.has(run.id)) return false;
            if (activeWorkflowIds.size === 0 && activeWorkflowNames.size === 0) return false;
            return (
              activeWorkflowIds.has(run.workflowId) || activeWorkflowNames.has(run.workflowName)
            );
          })
          .sort((a, b) => {
            const aSuccess = a.conclusion.toLowerCase() === "success" ? 0 : 1;
            const bSuccess = b.conclusion.toLowerCase() === "success" ? 0 : 1;
            if (aSuccess !== bSuccess) return aSuccess - bSuccess;
            return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
          })
          .slice(0, MAX_HYDRATED_RUNS_PER_LOAD);

        for (const candidate of candidateRuns) {
          if (cancelled) return;
          await coalesceByKey(runDetailInFlight, candidate.id, async () => {
            try {
              const detail = await bridge.ghGetWorkflowRun({
                projectLocation,
                runId: candidate.id,
              });
              if (recordCompletedWorkflowRun(historyKey, detail.run) && !cancelled) {
                setHistoryVersion((v) => v + 1);
              }
            } catch {
              // Ignore individual run-detail failures; workflow-level estimate still applies.
              failedRunDetailIds.add(candidate.id);
            }
          });
        }
      } catch {
        // Non-fatal: ETA is best-effort and degrades cleanly when GitHub is unreachable.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [hasActiveChecks, historyKey, projectId, source, checks]);

  // Read `historyVersion` so new observations trigger fresh estimation under React Compiler.
  void historyVersion;
  const estimate = hasActiveChecks
    ? estimatePrChecksCompletion({
        historyKey,
        checks,
        workflowRuns,
        now,
      })
    : null;

  const hasEstimate = estimate !== null;

  useEffect(() => {
    if (!hasActiveChecks || !hasEstimate) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [hasActiveChecks, hasEstimate]);

  return { estimate, now };
}

export function clearPrChecksEtaCachesForTests(): void {
  runsCache.clear();
  runsInFlight.clear();
  runDetailInFlight.clear();
  failedRunDetailIds.clear();
}
