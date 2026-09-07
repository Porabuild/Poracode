import { useEffect, useRef, useState } from "react";
import type {
  ExperimentCandidate,
  GetExperimentCandidateStatsResult,
  GitStatusResult,
  ProjectLocation,
} from "@/shared/contracts";
import { buildWorktreeLocation } from "@/shared/worktree";
import { readBridge } from "@/renderer/bridge";

export type CandidateStatsState = GetExperimentCandidateStatsResult | "loading" | "unavailable";

const ACTIVE_RETRY_DELAY_MS = 500;
const candidateStatsCache = new Map<string, GetExperimentCandidateStatsResult | "unavailable">();

/**
 * Content fingerprint for the working-tree status. The stats depend on the
 * files' contents, so a status change must refetch — but the status object
 * identity churns on every poll even when nothing changed. Folding this key
 * into the request key makes the refetch trigger explicit instead of an
 * unused effect dependency.
 */
function buildWorktreeStatusFingerprint(status: GitStatusResult | undefined): string {
  if (!status) return "none";
  const serialize = (entries: GitStatusResult["staged"]) =>
    entries
      .map((entry) => `${entry.path}|${entry.status}|${entry.insertions}|${entry.deletions}`)
      .join("\n");
  return [
    status.branch,
    status.totalInsertions,
    status.totalDeletions,
    serialize(status.staged),
    serialize(status.unstaged),
  ].join("\n---\n");
}

export function useExperimentCandidateStats(args: {
  projectLocation: ProjectLocation | undefined;
  worktreePath: string | undefined;
  baseCommit: string;
  worktreeState: ExperimentCandidate["worktreeState"];
  worktreeStatus: GitStatusResult | undefined;
  isActive: boolean;
}): { stats: CandidateStatsState; isRefreshing: boolean } {
  const statsCacheKey = args.worktreePath ? `${args.worktreePath}\0${args.baseCommit}` : "";
  const [stats, setStats] = useState<CandidateStatsState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // Every input that must restart the request, folded into one key so the
  // fetch effect consumes them instead of listing trigger-only dependencies.
  const requestKey = `${statsCacheKey}\0${args.worktreeState}\0${retryNonce}\0${buildWorktreeStatusFingerprint(args.worktreeStatus)}`;
  // Reset-on-request-change during render (official "adjust state during
  // render" pattern): mirrors what the fetch effect used to do synchronously
  // on entry. Starts as null so the mount pass applies it too — the old
  // effect ran on mount and set the same values.
  const [prevRequestKey, setPrevRequestKey] = useState<string | null>(null);
  if (prevRequestKey !== requestKey) {
    setPrevRequestKey(requestKey);
    if (!args.projectLocation || !args.worktreePath) {
      setStats(args.worktreeState === "pending" ? "loading" : "unavailable");
      setIsRefreshing(false);
    } else {
      const cached = candidateStatsCache.get(statsCacheKey);
      if (cached) setStats(cached);
      setIsRefreshing(true);
    }
  }
  const mountedRef = useRef(false);
  const activeStatsCacheKeyRef = useRef("");
  const activeRequestKeyRef = useRef(requestKey);
  const latestRequestedRef = useRef(0);
  const latestAppliedRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // The request key drives re-execution (see the dep list); responses are
    // guarded by the cache key on purpose: two overlapping requests for the
    // same worktree/commit intentionally resolve last-arrival-wins, so a
    // completed (stale) response still paints while the fresher refresh is
    // pending. Only a path/commit change drops responses outright.
    activeRequestKeyRef.current = requestKey;
    activeStatsCacheKeyRef.current = statsCacheKey;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!args.projectLocation || !args.worktreePath) {
      latestRequestedRef.current += 1;
      return;
    }

    const requestId = latestRequestedRef.current + 1;
    latestRequestedRef.current = requestId;
    const capturedKey = requestKey;

    void readBridge()
      .getExperimentCandidateStats({
        projectLocation: buildWorktreeLocation(args.projectLocation, args.worktreePath),
        baseRef: args.baseCommit,
      })
      .then((nextStats) => {
        if (
          !mountedRef.current ||
          activeStatsCacheKeyRef.current !== statsCacheKey ||
          requestId < latestAppliedRef.current
        ) {
          return;
        }
        latestAppliedRef.current = requestId;
        candidateStatsCache.set(statsCacheKey, nextStats);
        setStats(nextStats);
        if (requestId === latestRequestedRef.current) setIsRefreshing(false);
      })
      .catch(() => {
        if (
          !mountedRef.current ||
          activeStatsCacheKeyRef.current !== statsCacheKey ||
          requestId !== latestRequestedRef.current
        ) {
          return;
        }
        if (args.isActive) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            // A newer request already superseded this retry.
            if (mountedRef.current && activeRequestKeyRef.current === capturedKey) {
              setRetryNonce((value) => value + 1);
            }
          }, ACTIVE_RETRY_DELAY_MS);
          return;
        }
        candidateStatsCache.set(statsCacheKey, "unavailable");
        setStats("unavailable");
        setIsRefreshing(false);
      });
  }, [
    args.baseCommit,
    args.isActive,
    args.projectLocation,
    args.worktreePath,
    requestKey,
    statsCacheKey,
  ]);

  return { stats, isRefreshing };
}

export function __resetExperimentCandidateStatsCacheForTest(): void {
  candidateStatsCache.clear();
}
