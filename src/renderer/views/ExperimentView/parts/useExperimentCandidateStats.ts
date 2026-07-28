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
  const mountedRef = useRef(false);
  const activeStatsCacheKeyRef = useRef("");
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
    activeStatsCacheKeyRef.current = statsCacheKey;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!args.projectLocation || !args.worktreePath) {
      latestRequestedRef.current += 1;
      setStats(args.worktreeState === "pending" ? "loading" : "unavailable");
      setIsRefreshing(false);
      return;
    }

    const requestId = latestRequestedRef.current + 1;
    latestRequestedRef.current = requestId;
    const cached = candidateStatsCache.get(statsCacheKey);
    if (cached) setStats(cached);
    setIsRefreshing(true);

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
            if (mountedRef.current) setRetryNonce((value) => value + 1);
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
    args.worktreeState,
    args.worktreeStatus,
    retryNonce,
    statsCacheKey,
  ]);

  return { stats, isRefreshing };
}

export function __resetExperimentCandidateStatsCacheForTest(): void {
  candidateStatsCache.clear();
}
