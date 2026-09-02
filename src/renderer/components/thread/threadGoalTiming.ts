import { useEffect, useState } from "react";
import type { ThreadGoalDockState } from "./threadGoalState";

const localGoalTimingByItemId = new Map<
  string,
  { timeUsedSeconds: number; anchorSeconds: number }
>();

function normalizeTimestampSeconds(timestamp: number | undefined): number | undefined {
  if (timestamp === undefined) return undefined;
  return timestamp > 1_000_000_000_000 ? timestamp / 1000 : timestamp;
}

export function resolveGoalElapsedSeconds(
  state: ThreadGoalDockState,
  nowSeconds: number,
  localAnchorSeconds: number,
): number {
  const baseSeconds = state.timeUsedSeconds ?? 0;
  if (state.status !== "active") return Math.max(0, Math.round(baseSeconds));

  const serverUpdatedAtSeconds = normalizeTimestampSeconds(state.updatedAt);
  const anchorSeconds = serverUpdatedAtSeconds ?? localAnchorSeconds;
  const localDeltaSeconds = Math.max(0, nowSeconds - anchorSeconds);
  return Math.max(0, Math.round(baseSeconds + localDeltaSeconds));
}

/**
 * Wall-clock anchor for a goal whose provider never stamps `updatedAt`: the
 * first time we see a given `timeUsedSeconds` we remember when that was, so
 * the local timer keeps ticking between server updates without jumping.
 */
export function resolveLocalGoalAnchorSeconds(
  state: ThreadGoalDockState,
  nowSeconds: number,
): number {
  if (state.status !== "active" || state.updatedAt !== undefined) return nowSeconds;

  const timeUsedSeconds = state.timeUsedSeconds ?? 0;
  const cached = localGoalTimingByItemId.get(state.sourceItemId);
  if (cached?.timeUsedSeconds === timeUsedSeconds) {
    return cached.anchorSeconds;
  }

  const anchorSeconds = nowSeconds;
  if (localGoalTimingByItemId.size > 200) localGoalTimingByItemId.clear();
  localGoalTimingByItemId.set(state.sourceItemId, { timeUsedSeconds, anchorSeconds });
  return anchorSeconds;
}

/**
 * Live elapsed seconds for a goal dock state: ticks once a second while the
 * goal is active, freezes at the reported total otherwise. Shared by the goal
 * dock and its compact composer bubble so both show the same number.
 */
export function useGoalElapsedSeconds(state: ThreadGoalDockState): number {
  const [localAnchorSeconds, setLocalAnchorSeconds] = useState(() =>
    resolveLocalGoalAnchorSeconds(state, Date.now() / 1000),
  );
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const isActive = state.status === "active";

  useEffect(() => {
    const now = Date.now() / 1000;
    setLocalAnchorSeconds(resolveLocalGoalAnchorSeconds(state, now));
    setNowSeconds(now);
  }, [state]);

  useEffect(() => {
    if (!isActive) return;
    const interval = window.setInterval(() => setNowSeconds(Date.now() / 1000), 1000);
    return () => window.clearInterval(interval);
  }, [isActive]);

  return resolveGoalElapsedSeconds(state, nowSeconds, localAnchorSeconds);
}
