import { useEffect, useState } from "react";
import type { PendingSteerState } from "@/shared/contracts";

export const PENDING_STEER_VISIBILITY_DELAY_MS = 2_000;

/**
 * Brief pending steers normally drain as soon as the interrupted turn stops.
 * Keep those transient entries out of the composer layout, but reveal a steer
 * that has genuinely been waiting so the user can inspect or cancel it.
 */
export function useDelayedPendingSteer(
  pending: PendingSteerState | undefined,
): PendingSteerState | undefined {
  const [visiblePendingId, setVisiblePendingId] = useState<string | null>(() => {
    if (!pending) return null;
    return Date.now() - pending.stagedAt >= PENDING_STEER_VISIBILITY_DELAY_MS ? pending.id : null;
  });
  // Hide the new steer during render when the pending steer changes; the
  // effect below reveals it once its delay elapses. The timer path is async,
  // so no synchronous setState stays in the effect.
  const pendingKey = pending?.id ?? null;
  const [prevPendingKey, setPrevPendingKey] = useState<string | null>(pendingKey);
  if (prevPendingKey !== pendingKey) {
    setPrevPendingKey(pendingKey);
    setVisiblePendingId(null);
  }

  useEffect(() => {
    if (!pending) return;

    const remainingDelay = Math.max(
      0,
      pending.stagedAt + PENDING_STEER_VISIBILITY_DELAY_MS - Date.now(),
    );

    const pendingId = pending.id;
    const timer = window.setTimeout(() => setVisiblePendingId(pendingId), remainingDelay);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return pending && visiblePendingId === pending.id ? pending : undefined;
}
