import { useRef, useState } from "react";
import type { AgentStatus } from "@/shared/contracts";
import { MAX_CONCURRENT_PROVIDER_UPDATES } from "@/shared/agents/updatePolicy";
import { hostScopedKey } from "./agentManagementHost";

export type ProviderUpdatePhase = "queued" | "updating" | "probing";
export type ActiveProviderUpdatePhase = Exclude<ProviderUpdatePhase, "queued">;

export interface ProviderUpdateTarget {
  /** Management host that runs the update; separates the same kind across machines. */
  hostKey: string;
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
  const pendingKeys = useRef(new Set<string>());
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
      next.set(hostScopedKey(target.hostKey, target.agent.kind), {
        targetVersion: target.targetVersion,
        phase,
      });
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
      const key = hostScopedKey(target.hostKey, target.agent.kind);
      pendingKeys.current.delete(key);
      setPendingUpdates((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
    }
  }

  function updateKind(target: ProviderUpdateTarget): void {
    const key = hostScopedKey(target.hostKey, target.agent.kind);
    if (bulkRunning.current || pendingKeys.current.has(key)) return;
    pendingKeys.current.add(key);
    void runPending(target);
  }

  function updateAll(candidates: readonly ProviderUpdateTarget[]): void {
    if (bulkRunning.current) return;
    const targets = candidates.filter((target) => {
      const key = hostScopedKey(target.hostKey, target.agent.kind);
      if (pendingKeys.current.has(key)) return false;
      pendingKeys.current.add(key);
      return true;
    });
    if (targets.length === 0) return;
    bulkRunning.current = true;
    setPendingUpdates((current) => {
      const next = new Map(current);
      for (const target of targets) {
        next.set(hostScopedKey(target.hostKey, target.agent.kind), {
          targetVersion: target.targetVersion,
          phase: "queued",
        });
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
