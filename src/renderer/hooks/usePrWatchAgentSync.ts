import { useEffect } from "react";
import { useShallow } from "zustand/shallow";
import type { PrWatchAgentSync } from "@/shared/contracts";
import { resolvePrAutomationAgent } from "@/renderer/actions/prAutomationActions";
import { readBridge } from "@/renderer/bridge";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const SYNC_RETRY_MS = 5_000;
const syncQueues = new Map<string, Promise<void>>();

/** Keep older slow requests from arriving after a project's newer resolution. */
function enqueueAgentSync(agent: PrWatchAgentSync): Promise<void> {
  const previous = syncQueues.get(agent.projectId);
  const queued = (previous?.catch(() => undefined) ?? Promise.resolve()).then(() =>
    readBridge().syncPrWatchAgent(agent),
  );
  syncQueues.set(agent.projectId, queued);
  void queued
    .finally(() => {
      if (syncQueues.get(agent.projectId) === queued) syncQueues.delete(agent.projectId);
    })
    .catch(() => undefined);
  return queued;
}

/**
 * Keep every PR watch pointed at the helper agent the app resolves *now*.
 *
 * Provider ranking and per-provider defaults live in the renderer's provider
 * plugins, so the resolution has to happen here; the PR watcher runs in the main
 * process and only stores the answer it launches fixes with. Running this at app
 * scope is the point — the resolution used to be refreshed inside the PR
 * automation popover, so a watch whose PR nobody had opened in months kept
 * launching whichever provider was configured the day the PR was created.
 */
export function usePrWatchAgentSync(enabled: boolean): void {
  const projects = useAppStore((state) => state.projects);
  const windowsAgents = useAgentStatusesStore((state) => state.agentStatuses);
  const wslAgents = useAgentStatusesStore((state) => state.wslAgentStatuses);
  // useShallow is required: this selector builds a fresh object each call and
  // zustand v5 does not memoize selector results, so without it the snapshot
  // reference changes every render and the store re-render loop never settles.
  // Gate on real hydration, not just app load: pre-hydration values come from a
  // possibly stale localStorage fallback, and a push computed from those would
  // overwrite every watch's agent with defaults.
  const settingsHydrated = useSharedSettings((state) => state.sharedSettingsHydrated);
  const settings = useSharedSettings(
    useShallow((state) => ({
      conflictResolverProvider: state.conflictResolverProvider,
      conflictResolverModel: state.conflictResolverModel,
      conflictResolverEffort: state.conflictResolverEffort,
      conflictResolverFast: state.conflictResolverFast,
      conflictResolverPresentationMode: state.conflictResolverPresentationMode,
      wslConflictResolverProvider: state.wslConflictResolverProvider,
      wslConflictResolverModel: state.wslConflictResolverModel,
      wslConflictResolverEffort: state.wslConflictResolverEffort,
      wslConflictResolverFast: state.wslConflictResolverFast,
      wslConflictResolverPresentationMode: state.wslConflictResolverPresentationMode,
    })),
  );

  const resolved =
    enabled && settingsHydrated
      ? projects.flatMap((project) => {
          const automation = resolvePrAutomationAgent(project, windowsAgents, wslAgents, settings);
          if (!automation) return [];
          return [
            { projectId: project.id, agentKind: automation.agentKind, config: automation.config },
          ];
        })
      : [];
  // The effect keys off the serialized resolution: the array itself is rebuilt
  // every render, and only a genuine change should reach the main process (an
  // unchanged sync is a no-op there, but it would still cross the IPC boundary
  // on every agent-detection tick).
  const signature = JSON.stringify(resolved);

  useEffect(() => {
    const agents = JSON.parse(signature) as typeof resolved;
    if (agents.length === 0) return;
    let cancelled = false;
    const retries = new Set<ReturnType<typeof setTimeout>>();
    const sync = async (agent: PrWatchAgentSync) => {
      try {
        await enqueueAgentSync(agent);
      } catch {
        if (cancelled) return;
        const retry = setTimeout(() => {
          retries.delete(retry);
          void sync(agent);
        }, SYNC_RETRY_MS);
        retries.add(retry);
      }
    };
    for (const agent of agents) void sync(agent);
    return () => {
      cancelled = true;
      for (const retry of retries) clearTimeout(retry);
    };
  }, [signature]);
}
