import { useRef, useState } from "react";
import type { AgentStatus } from "@/shared/contracts";
import { MAX_CONCURRENT_PROVIDER_UPDATES } from "@/shared/agents/updatePolicy";

export type ProviderUpdatePhase = "queued" | "updating" | "probing";
export type ActiveProviderUpdatePhase = Exclude<ProviderUpdatePhase, "queued">;

export interface ProviderUpdateTarget {
  agent: AgentStatus;
  targetVersion: string;
}

export interface PendingProviderUpdateState {
  targetVersion: string;
  phase: ProviderUpdatePhase;
}

export interface ProviderUpdateAllProgress {
  completed: number;
  total: number;
}

/** Keep install/probe jobs bounded, with synchronous admission across rapid presses. */
export function useProviderUpdateQueue(
  runUpdate: (
    target: ProviderUpdateTarget,
    onPhaseChange: (phase: ActiveProviderUpdatePhase) => void,
  ) => Promise<void>,
  onError: (error: unknown, target: ProviderUpdateTarget) => void,
) {
  const pendingKinds = useRef(new Set<string>());
  const bulkRunning = useRef(false);
  const [pendingUpdates, setPendingUpdates] = useState<
    ReadonlyMap<string, PendingProviderUpdateState>
  >(() => new Map());
  const [updateAllProgress, setUpdateAllProgress] = useState<
    ProviderUpdateAllProgress | undefined
  >();

  function setPhase(target: ProviderUpdateTarget, phase: ProviderUpdatePhase): void {
    setPendingUpdates((current) => {
      const next = new Map(current);
      next.set(target.agent.kind, { targetVersion: target.targetVersion, phase });
      return next;
    });
  }

  async function runPending(target: ProviderUpdateTarget): Promise<void> {
    setPhase(target, "updating");
    try {
      await runUpdate(target, (phase) => setPhase(target, phase));
    } catch (error) {
      onError(error, target);
    } finally {
      pendingKinds.current.delete(target.agent.kind);
      setPendingUpdates((current) => {
        const next = new Map(current);
        next.delete(target.agent.kind);
        return next;
      });
    }
  }

  function updateKind(target: ProviderUpdateTarget): void {
    if (bulkRunning.current || pendingKinds.current.has(target.agent.kind)) return;
    pendingKinds.current.add(target.agent.kind);
    void runPending(target);
  }

  function updateAll(candidates: readonly ProviderUpdateTarget[]): void {
    if (bulkRunning.current) return;
    const targets = candidates.filter((target) => {
      if (pendingKinds.current.has(target.agent.kind)) return false;
      pendingKinds.current.add(target.agent.kind);
      return true;
    });
    if (targets.length === 0) return;
    bulkRunning.current = true;
    setPendingUpdates((current) => {
      const next = new Map(current);
      for (const target of targets) {
        next.set(target.agent.kind, { targetVersion: target.targetVersion, phase: "queued" });
      }
      return next;
    });
    const total = targets.length;
    setUpdateAllProgress({ completed: 0, total });

    void (async () => {
      let nextIndex = 0;
      let completed = 0;
      async function worker(): Promise<void> {
        for (;;) {
          const target = targets[nextIndex++];
          if (!target) return;
          await runPending(target);
          setUpdateAllProgress({ completed: ++completed, total });
        }
      }
      try {
        await Promise.all(
          Array.from({ length: Math.min(MAX_CONCURRENT_PROVIDER_UPDATES, total) }, () => worker()),
        );
      } finally {
        bulkRunning.current = false;
        setUpdateAllProgress(undefined);
      }
    })();
  }

  return {
    pendingUpdates,
    isUpdatingAll: updateAllProgress !== undefined,
    updateAllProgress,
    updateKind,
    updateAll,
  };
}
