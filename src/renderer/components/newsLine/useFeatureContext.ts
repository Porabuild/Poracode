import { useEffect, useState } from "react";
import type { ProfileCoreStats } from "@/shared/contracts";
import type { FeatureSignal } from "@/shared/featureDiscovery";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useFeatureUsageStore } from "@/renderer/state/featureUsageStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { FeatureContext } from "./featureCatalog";

/** Whether a profile MCP usage row belongs to the given provider-visible server name. */
function mcpRowMatches(rowName: string, serverName: string): boolean {
  const name = rowName.trim().toLowerCase();
  const server = serverName.toLowerCase();
  return (
    name === server ||
    name.startsWith(`${server}__`) ||
    name.startsWith(`${server}.`) ||
    name.startsWith(`mcp__${server}__`)
  );
}

let scheduleCount: Promise<number | null> | null = null;

/** Saved schedules, read once per app session; null when the host cannot say. */
function useScheduleCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    scheduleCount ??= Promise.resolve()
      .then(() => readBridge().getSchedules())
      .then((schedules) => schedules.length)
      .catch(() => null);
    void scheduleCount.then((value) => {
      if (active) setCount(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return count;
}

function safeIsRemoteSession(): boolean {
  try {
    return isRemoteSession();
  } catch {
    return false;
  }
}

/** Everything the discovery catalog needs to decide what is used and relevant. */
export function useFeatureContext(stats: ProfileCoreStats | null): FeatureContext {
  const signals = useFeatureUsageStore((state) => state.signals);
  const savedCrews = useSharedSettings((state) => state.crews.length);
  const mcpServers = useSharedSettings((state) => state.mcpServers.length);
  const installedPlugins = useSharedSettings(
    (state) => Object.values(state.installedPlugins).filter((plugin) => plugin?.enabled).length,
  );
  const customThemes = useSharedSettings((state) => state.customThemes.length);
  const workspaces = useSharedSettings((state) => state.workspaces.length);
  const remoteAccessEnabled = useSharedSettings((state) => state.remoteAccessEnabled);
  const remoteServers = useRemoteServersStore((state) => state.servers.length);
  const threadsWithCrew = useAppStore((state) =>
    state.threads.some((thread) => thread.config.crew),
  );
  const threadsInWorktree = useAppStore((state) =>
    state.threads.some((thread) => Boolean(thread.worktreePath)),
  );
  const threadsWithPullRequest = useAppStore((state) =>
    state.threads.some((thread) => thread.prNumber !== undefined),
  );
  const schedules = useScheduleCount();
  const readyAgents = useAgentStatusesStore(
    (state) =>
      state.agentStatuses.filter(
        (status) => status.installed && status.authState === "authenticated",
      ).length,
  );

  return {
    seen: (signal: FeatureSignal) => signal in signals,
    stats,
    usedMcp: (serverName) =>
      (stats?.mcps ?? []).some((row) => mcpRowMatches(row.name, serverName) && row.runCount > 0),
    savedCrews,
    threadsWithCrew,
    threadsInWorktree,
    threadsWithPullRequest,
    schedules,
    mcpServers,
    installedPlugins,
    customThemes,
    workspaces,
    remoteAccessEnabled,
    remoteServers,
    readyAgents,
    desktopHost: !safeIsRemoteSession(),
  };
}
