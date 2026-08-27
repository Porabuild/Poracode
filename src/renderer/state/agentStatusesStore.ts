import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  areAgentSlashCommandsEqual,
  areAgentPresentationRuntimeFieldsEqual,
  areAgentProviderMetadataEqual,
  type AgentStatus,
  type ProjectLocation,
} from "@/shared/contracts";
import type { AgentStatusSupervisorEvent } from "@/shared/ipc";

export type AgentDiscoveryScope =
  | { kind: "native" }
  | { kind: "wsl"; distro: string }
  | { kind: "all"; wslDistros: string[] };

interface AgentStatusesStore {
  agentStatuses: AgentStatus[];
  wslAgentStatuses: AgentStatus[];
  /**
   * True once a windows-agent-statuses event (or cache) has been applied.
   * Used by UI to distinguish "detecting…" from "detected nothing".
   */
  windowsLoaded: boolean;
  /** True once a wsl-agent-statuses event (or cache) has been applied. */
  wslLoaded: boolean;
  /**
   * On first launch (no cache) we render a discovery screen that reveals
   * agent tiles as the supervisor streams `agent-detected` events. Once the
   * terminal `windows-agent-statuses` event arrives the discovery screen
   * fades out into the regular ThreadDraft. Stays false on subsequent
   * launches where the cache is loaded eagerly.
   */
  inFirstLaunchDiscovery: boolean;
  discoveryScope: AgentDiscoveryScope | undefined;
  /** Statuses streamed from `agent-detected` events during first-launch scan. */
  discoveredAgents: AgentStatus[];
  setAgentStatuses: (statuses: AgentStatus[]) => void;
  setWslAgentStatuses: (statuses: AgentStatus[]) => void;
  /**
   * Hydrate both scopes at once from an RPC cache read.  Called before the
   * main UI mounts so ThreadDraft renders with the cached agents instead of
   * the empty initial state.
   */
  hydrateFromCache: (cached: { windows: AgentStatus[]; wsl: AgentStatus[] }) => void;
  beginFirstLaunchDiscovery: (scope?: AgentDiscoveryScope) => void;
  resetDiscoveredAgents: () => void;
  pushDiscoveredAgent: (status: AgentStatus) => void;
  /**
   * Upserts a single status into the store, matched by (kind, envKind,
   * envDistro). Used by scoped refreshes after install/login so we don't
   * overwrite the rest of the list. WSL statuses land in `wslAgentStatuses`;
   * everything else lands in `agentStatuses`.
   */
  mergeAgentStatus: (status: AgentStatus) => void;
  removeAgentStatus: (kind: string) => void;
}

function capabilitiesEqual(
  a: AgentStatus["capabilities"],
  b: AgentStatus["capabilities"],
): boolean {
  if (
    JSON.stringify(a.presentationCapabilities ?? {}) !==
    JSON.stringify(b.presentationCapabilities ?? {})
  ) {
    return false;
  }
  if (a.models.length !== b.models.length) return false;
  if (a.efforts.length !== b.efforts.length) return false;
  for (let i = 0; i < a.models.length; i++) {
    if (a.models[i]!.id !== b.models[i]!.id) return false;
  }
  for (let i = 0; i < a.efforts.length; i++) {
    if (a.efforts[i] !== b.efforts[i]) return false;
  }
  if ((a.defaultEffort ?? "") !== (b.defaultEffort ?? "")) return false;
  if (JSON.stringify(a.modelEfforts) !== JSON.stringify(b.modelEfforts)) return false;
  if (JSON.stringify(a.modelDefaultEfforts ?? {}) !== JSON.stringify(b.modelDefaultEfforts ?? {})) {
    return false;
  }
  if (JSON.stringify(a.thinkingModels ?? []) !== JSON.stringify(b.thinkingModels ?? [])) {
    return false;
  }
  if (!areAgentSlashCommandsEqual(a.slashCommands, b.slashCommands)) return false;
  // Compared so a status persisted before `supportsOneShot` existed (flag
  // absent) is treated as different from a freshly-detected one (flag set) and
  // gets replaced — otherwise the one-shot AI selectors would keep hiding
  // one-shot-capable providers for the whole first post-upgrade session.
  if ((a.supportsOneShot ?? false) !== (b.supportsOneShot ?? false)) return false;
  // Codex context-window lists are user-editable. A detection that only
  // changes those fields must replace the cached status or the composer keeps
  // the previous picker after settings save / next launch.
  if (JSON.stringify(a.contextSizes ?? []) !== JSON.stringify(b.contextSizes ?? [])) return false;
  if (JSON.stringify(a.modelContextSizes ?? {}) !== JSON.stringify(b.modelContextSizes ?? {})) {
    return false;
  }
  if ((a.defaultContextSize ?? "") !== (b.defaultContextSize ?? "")) return false;
  return true;
}

function statusesEqual(a: AgentStatus[], b: AgentStatus[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (x, i) =>
      x.kind === b[i]!.kind &&
      x.label === b[i]!.label &&
      x.installed === b[i]!.installed &&
      x.icon === b[i]!.icon &&
      x.version === b[i]!.version &&
      x.authState === b[i]!.authState &&
      x.acpSessionEstablished === b[i]!.acpSessionEstablished &&
      areAgentPresentationRuntimeFieldsEqual(x, b[i]!) &&
      x.loginCommand === b[i]!.loginCommand &&
      x.envKind === b[i]!.envKind &&
      x.envDistro === b[i]!.envDistro &&
      JSON.stringify(x.authMethods ?? []) === JSON.stringify(b[i]!.authMethods ?? []) &&
      areAgentProviderMetadataEqual(x.providerMetadata, b[i]!.providerMetadata) &&
      capabilitiesEqual(x.capabilities, b[i]!.capabilities),
  );
}

function isStatusInDiscoveryScope(
  status: AgentStatus,
  scope: AgentDiscoveryScope | undefined,
): boolean {
  if (scope?.kind === "all") {
    return status.envKind !== "wsl" || scope.wslDistros.includes(status.envDistro ?? "");
  }
  if (scope?.kind === "wsl") {
    return status.envKind === "wsl" && status.envDistro === scope.distro;
  }
  return status.envKind !== "wsl";
}

function buildStatusUpdatePatch(
  prev: AgentStatusesStore,
  incoming: AgentStatus[],
  scope: "native" | "wsl",
): Partial<AgentStatusesStore> {
  const isWsl = scope === "wsl";
  const currentList = isWsl ? prev.wslAgentStatuses : prev.agentStatuses;
  const currentLoaded = isWsl ? prev.wslLoaded : prev.windowsLoaded;
  const equal = statusesEqual(currentList, incoming);
  const endsDiscovery =
    prev.inFirstLaunchDiscovery &&
    (isWsl
      ? prev.discoveryScope?.kind === "wsl"
      : prev.discoveryScope?.kind === undefined || prev.discoveryScope.kind === "native");
  const discoveryPatch: Partial<AgentStatusesStore> = endsDiscovery
    ? { inFirstLaunchDiscovery: false, discoveryScope: undefined }
    : {};
  if (equal && currentLoaded) {
    return discoveryPatch;
  }
  const listPatch: Partial<AgentStatusesStore> = equal
    ? {}
    : isWsl
      ? { wslAgentStatuses: incoming }
      : { agentStatuses: incoming };
  const loadedPatch: Partial<AgentStatusesStore> = isWsl
    ? { wslLoaded: true }
    : { windowsLoaded: true };
  return { ...listPatch, ...loadedPatch, ...discoveryPatch };
}

export const useAgentStatusesStore = create<AgentStatusesStore>()(
  persist(
    (set) => ({
      agentStatuses: [],
      wslAgentStatuses: [],
      windowsLoaded: false,
      wslLoaded: false,
      inFirstLaunchDiscovery: false,
      discoveryScope: undefined,
      discoveredAgents: [],
      setAgentStatuses: (incoming) =>
        set((prev) => buildStatusUpdatePatch(prev, incoming, "native")),
      setWslAgentStatuses: (incoming) =>
        set((prev) => buildStatusUpdatePatch(prev, incoming, "wsl")),
      hydrateFromCache: ({ windows, wsl }) =>
        set(() => ({
          agentStatuses: windows,
          wslAgentStatuses: wsl,
          windowsLoaded: true,
          wslLoaded: true,
          inFirstLaunchDiscovery: false,
          discoveryScope: undefined,
        })),
      beginFirstLaunchDiscovery: (scope) =>
        set((prev) => {
          const nextScope = scope ?? { kind: "native" };
          if (nextScope.kind === "native" && prev.windowsLoaded) {
            return prev;
          }
          return {
            inFirstLaunchDiscovery: true,
            discoveryScope: nextScope,
            discoveredAgents: [],
            ...(nextScope.kind === "wsl" ? { wslLoaded: false } : {}),
          };
        }),
      resetDiscoveredAgents: () =>
        set((prev) =>
          prev.discoveredAgents.length === 0 &&
          !prev.inFirstLaunchDiscovery &&
          prev.discoveryScope === undefined
            ? prev
            : { discoveredAgents: [], inFirstLaunchDiscovery: false, discoveryScope: undefined },
        ),
      pushDiscoveredAgent: (status) =>
        set((prev) => {
          if (!isStatusInDiscoveryScope(status, prev.discoveryScope)) {
            return prev;
          }
          if (
            prev.discoveredAgents.some(
              (existing) =>
                existing.kind === status.kind &&
                existing.envKind === status.envKind &&
                existing.envDistro === status.envDistro,
            )
          ) {
            return prev;
          }
          return { discoveredAgents: [...prev.discoveredAgents, status] };
        }),
      mergeAgentStatus: (status) =>
        set((prev) => {
          const matches = (entry: AgentStatus) =>
            entry.kind === status.kind &&
            entry.envKind === status.envKind &&
            entry.envDistro === status.envDistro;
          if (status.envKind === "wsl") {
            const idx = prev.wslAgentStatuses.findIndex(matches);
            const next =
              idx === -1
                ? [...prev.wslAgentStatuses, status]
                : prev.wslAgentStatuses.map((entry, i) => (i === idx ? status : entry));
            return { wslAgentStatuses: next, wslLoaded: true };
          }
          const idx = prev.agentStatuses.findIndex(matches);
          const next =
            idx === -1
              ? [...prev.agentStatuses, status]
              : prev.agentStatuses.map((entry, i) => (i === idx ? status : entry));
          return { agentStatuses: next, windowsLoaded: true };
        }),
      removeAgentStatus: (kind) =>
        set((prev) => {
          const agentStatuses = prev.agentStatuses.filter((status) => status.kind !== kind);
          const wslAgentStatuses = prev.wslAgentStatuses.filter((status) => status.kind !== kind);
          const discoveredAgents = prev.discoveredAgents.filter((status) => status.kind !== kind);
          if (
            agentStatuses.length === prev.agentStatuses.length &&
            wslAgentStatuses.length === prev.wslAgentStatuses.length &&
            discoveredAgents.length === prev.discoveredAgents.length
          ) {
            return prev;
          }
          return { agentStatuses, wslAgentStatuses, discoveredAgents };
        }),
    }),
    {
      name: "poracode-agent-statuses-v1",
      version: 16,
      // v16 mirrors supervisor STATUS_CACHE_VERSION=19 so this localStorage
      // copy does not keep Command Code's pre-live-discovery curated model
      // table (deepseek fallbacks, static `defaultEffort`) on first paint.
      migrate: (persisted) => {
        const prev = (persisted ?? {}) as Partial<AgentStatusesStore>;
        return {
          ...prev,
          agentStatuses: [],
          wslAgentStatuses: [],
          windowsLoaded: false,
          wslLoaded: false,
        } as AgentStatusesStore;
      },
      // Synchronous localStorage hydration (unlike the IndexedDB-backed app
      // store) so the last-known statuses — and their already-cached provider
      // icons — are in the store on the very first paint, before the async
      // getAgentStatuses RPC resolves. The RPC still runs on launch and
      // overwrites this with fresh results via hydrateFromCache.
      storage: createJSONStorage(() => localStorage),
      // Persist only the resolved statuses and their loaded flags. The
      // discovery fields are session-scoped (they drive the first-launch
      // discovery screen) and must reset to their initial state each launch.
      partialize: (state) => ({
        agentStatuses: state.agentStatuses,
        wslAgentStatuses: state.wslAgentStatuses,
        windowsLoaded: state.windowsLoaded,
        wslLoaded: state.wslLoaded,
      }),
    },
  ),
);

/**
 * Fan a supervisor agent-status event into the store. Shared by every surface
 * that consumes the supervisor stream (main window, quick composer overlay) so
 * the event→action mapping lives in one place.
 *
 * `deferFirstLaunchBulk` delays the terminal bulk events by a second while the
 * first-launch discovery screen is animating, so the last streamed tiles get a
 * beat before the screen fades — only the main window's discovery UI wants it.
 */
export function applyAgentStatusSupervisorEvent(
  event: AgentStatusSupervisorEvent,
  options: { deferFirstLaunchBulk?: boolean } = {},
): void {
  const store = useAgentStatusesStore.getState();
  switch (event.type) {
    case "agent-detected":
      store.pushDiscoveredAgent(event.status);
      break;
    case "agent-status-updated":
      store.mergeAgentStatus(event.status);
      break;
    case "windows-agent-statuses": {
      console.log(`[renderer] event: windows-agent-statuses (${event.statuses.length} agents)`);
      if (
        options.deferFirstLaunchBulk &&
        store.inFirstLaunchDiscovery &&
        store.discoveryScope?.kind !== "wsl"
      ) {
        const statuses = event.statuses;
        setTimeout(() => {
          useAgentStatusesStore.getState().setAgentStatuses(statuses);
        }, 1000);
      } else {
        store.setAgentStatuses(event.statuses);
      }
      break;
    }
    case "wsl-agent-statuses": {
      console.log(`[renderer] event: wsl-agent-statuses (${event.statuses.length} agents)`);
      if (
        options.deferFirstLaunchBulk &&
        store.inFirstLaunchDiscovery &&
        store.discoveryScope?.kind === "wsl"
      ) {
        const statuses = event.statuses;
        setTimeout(() => {
          useAgentStatusesStore.getState().setWslAgentStatuses(statuses);
        }, 1000);
      } else {
        store.setWslAgentStatuses(event.statuses);
      }
      break;
    }
  }
}

/**
 * Returns true when we haven't received agent statuses yet for the given
 * project's environment.  Callers use this to distinguish "detecting…" from
 * "detected, but nothing installed" — the former shows a spinner, the latter
 * shows the install-agents prompt.
 */
export function isDetectingAgentsForLocation(
  state: { windowsLoaded: boolean; wslLoaded: boolean },
  location: ProjectLocation,
): boolean {
  return location.kind === "wsl" ? !state.wslLoaded : !state.windowsLoaded;
}

export function isDiscoveryActiveForLocation(
  state: { inFirstLaunchDiscovery: boolean; discoveryScope: AgentDiscoveryScope | undefined },
  location: ProjectLocation,
): boolean {
  if (!state.inFirstLaunchDiscovery) return false;
  if (state.discoveryScope?.kind === "all") return true;
  if (location.kind === "wsl") {
    return state.discoveryScope?.kind === "wsl" && state.discoveryScope.distro === location.distro;
  }
  return state.discoveryScope?.kind !== "wsl";
}
