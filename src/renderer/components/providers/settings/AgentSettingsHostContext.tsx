import { createContext, useContext, type ReactNode } from "react";
import type { Project, RefreshAgentScope } from "@/shared/contracts";
import { editPairedHostSettings, usePairedHostSettings } from "@/renderer/state/pairedHostSettings";
import { flushSharedSettings, useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  LOCAL_AGENT_MANAGEMENT_HOST,
  type AgentHostProcedureName,
  type AgentManagementHost,
} from "./agentManagementHost";
import type { IpcProcedurePayload, IpcProcedureResult } from "@/shared/ipc";

const EMPTY_AGENT_SETTINGS: Record<string, boolean | string> = Object.freeze({});
const EMPTY_HIDDEN_MODELS: Record<string, string[]> = Object.freeze({});

/**
 * Host-scoped transport, capability flags, and settings mutations for the
 * active machine's agent settings view.
 *
 * Local machine views talk to `readBridge()` and `useSharedSettings`; paired
 * remote machine views route procedures through the connection's authenticated
 * `AgentManagementHost` and read/write host preferences through
 * `pairedHostSettings` (`settings-read` / `settings-write`).
 *
 * Provider settings panels and shared settings parts read this context instead
 * of calling `readBridge()` or `useSharedSettings` directly, so every setting
 * automatically targets the selected host without per-provider remote wiring.
 */
export interface AgentSettingsHost {
  /** `"local"` or the paired connection key; stable per host. */
  readonly key: string;
  /** Paired connection key, or `undefined` for the local host. */
  readonly connectionKey: string | undefined;
  readonly isRemote: boolean;
  /** True when the addressed host can accept live procedure calls and writes. */
  readonly isOnline: boolean;
  /** Representative project on the selected machine for terminal login/install overlays. */
  readonly machineProject: Project | undefined;
  /** Multi-profile creation/editing uses main-local secret sealing; local host only. */
  readonly canManageProfiles: boolean;
  /** Keychain-backed secret settings (`setAgentSecretSetting`) are local host only. */
  readonly canEditSecrets: boolean;
  callProcedure<Name extends AgentHostProcedureName>(
    procedure: Name,
    payload: IpcProcedurePayload<Name>,
  ): Promise<IpcProcedureResult<Name>>;
  rediscoverAgents(
    wslDistros?: readonly string[],
    scope?: RefreshAgentScope,
  ): ReturnType<AgentManagementHost["rediscoverAgents"]>;
  /** Writes one `agentSettings[agentKind][key]` preference to the active host. */
  setAgentSetting(agentKind: string, key: string, value: boolean | string): void | Promise<void>;
  /**
   * Atomically persists one or more `agentSettings[agentKind]` updates on the
   * active host, rolling back local optimistic writes if persistence fails.
   */
  saveAgentSettings(
    agentKind: string,
    updates: Readonly<Record<string, boolean | string>>,
    options?: { requireSuccess?: boolean },
  ): Promise<void>;
  /** Enables or disables an agent on the active host. */
  setAgentDisabled(agentKind: string, disabled: boolean): void | Promise<void>;
  /** Updates hidden model lists on the active host in one patch. */
  setHiddenModels(updates: ReadonlyMap<string, readonly string[]>): void | Promise<void>;
}

const AgentSettingsHostContext = createContext<AgentSettingsHost | undefined>(undefined);

async function saveLocalAgentSettings(
  agentKind: string,
  updates: Readonly<Record<string, boolean | string>>,
  options?: { requireSuccess?: boolean },
): Promise<void> {
  const store = useSharedSettings.getState();
  const previous = Object.fromEntries(
    Object.keys(updates).map((key) => [key, store.agentSettings[agentKind]?.[key]]),
  );
  for (const [key, value] of Object.entries(updates)) {
    store.setAgentSetting(agentKind, key, value);
  }
  try {
    await flushSharedSettings(options);
  } catch (error) {
    // Only restore keys that still hold the values this save wrote.
    const current = useSharedSettings.getState().agentSettings[agentKind];
    for (const [key, prior] of Object.entries(previous)) {
      if (current?.[key] === updates[key]) {
        if (prior !== undefined) {
          useSharedSettings.getState().setAgentSetting(agentKind, key, prior);
        } else if (typeof updates[key] === "string") {
          useSharedSettings.getState().setAgentSetting(agentKind, key, "");
        } else {
          useSharedSettings.setState((state) => {
            const existing = state.agentSettings[agentKind];
            if (!existing || !(key in existing)) return state;
            const nextKind = { ...existing };
            delete nextKind[key];
            return { agentSettings: { ...state.agentSettings, [agentKind]: nextKind } };
          });
        }
      }
    }
    throw error;
  }
}

async function saveRemoteAgentSettings(
  connectionKey: string,
  agentKind: string,
  updates: Readonly<Record<string, boolean | string>>,
): Promise<void> {
  await editPairedHostSettings(connectionKey, (current) => ({
    agentSettings: {
      ...(current.agentSettings ?? {}),
      [agentKind]: {
        ...(current.agentSettings?.[agentKind] ?? {}),
        ...updates,
      },
    },
  }));
}

/** Applies a batch of hidden-model updates to either the local store or a paired host. */
export function updateHostHiddenModels(
  connectionKey: string | undefined,
  updates: ReadonlyMap<string, readonly string[]>,
): void | Promise<void> {
  if (connectionKey === undefined) {
    const setHidden = useSharedSettings.getState().setHiddenModels;
    for (const [key, next] of updates) {
      setHidden(key, [...next]);
    }
    return;
  }
  return editPairedHostSettings(connectionKey, (current) => {
    const next: Record<string, string[]> = { ...(current.hiddenModels ?? {}) };
    let changed = false;
    for (const [key, ids] of updates) {
      const prev = next[key] ?? [];
      if (prev.length === ids.length && prev.every((id, index) => id === ids[index])) continue;
      changed = true;
      if (ids.length === 0) delete next[key];
      else next[key] = [...ids];
    }
    return changed ? { hiddenModels: next } : undefined;
  });
}

export function createAgentSettingsHost(params: {
  host: AgentManagementHost;
  isOnline: boolean;
  machineProject?: Project;
  wslDistros: readonly string[];
}): AgentSettingsHost {
  const { host, isOnline, machineProject, wslDistros } = params;
  const connectionKey = host.connectionKey;
  const isRemote = host.isRemote && connectionKey !== undefined;
  const shared = {
    key: host.key,
    connectionKey: isRemote ? connectionKey : undefined,
    isRemote,
    isOnline,
    machineProject,
    canManageProfiles: !isRemote,
    canEditSecrets: !isRemote,
    callProcedure: <Name extends AgentHostProcedureName>(
      procedure: Name,
      payload: IpcProcedurePayload<Name>,
    ) => host.callProcedure(procedure, payload),
    rediscoverAgents: (distros = wslDistros, scope?: RefreshAgentScope) =>
      host.rediscoverAgents([...distros], scope),
    setHiddenModels: (updates: ReadonlyMap<string, readonly string[]>) =>
      updateHostHiddenModels(isRemote ? connectionKey : undefined, updates),
  };

  if (!isRemote) {
    return {
      ...shared,
      setAgentSetting: (agentKind, key, value) => {
        useSharedSettings.getState().setAgentSetting(agentKind, key, value);
      },
      saveAgentSettings: (agentKind, updates, options) =>
        saveLocalAgentSettings(agentKind, updates, options),
      setAgentDisabled: (agentKind, disabled) => {
        useSharedSettings.getState().setAgentDisabled(agentKind, disabled);
      },
    };
  }

  return {
    ...shared,
    setAgentSetting: (agentKind, key, value) =>
      saveRemoteAgentSettings(connectionKey, agentKind, { [key]: value }),
    saveAgentSettings: (agentKind, updates) =>
      saveRemoteAgentSettings(connectionKey, agentKind, updates),
    setAgentDisabled: (agentKind, disabled) =>
      editPairedHostSettings(connectionKey, (current) => {
        const list = current.disabledAgents ?? [];
        const has = list.includes(agentKind);
        if (disabled === has) return undefined;
        return {
          disabledAgents: disabled
            ? [...list, agentKind]
            : list.filter((kind) => kind !== agentKind),
        };
      }),
  };
}

const DEFAULT_LOCAL_AGENT_SETTINGS_HOST: AgentSettingsHost = createAgentSettingsHost({
  host: LOCAL_AGENT_MANAGEMENT_HOST,
  isOnline: true,
  wslDistros: [],
});

export function AgentSettingsHostProvider(props: { host: AgentSettingsHost; children: ReactNode }) {
  return (
    <AgentSettingsHostContext.Provider value={props.host}>
      {props.children}
    </AgentSettingsHostContext.Provider>
  );
}

/** Zero-subscription transport, capabilities, and mutations for the active agent settings host. */
export function useAgentSettingsHost(): AgentSettingsHost {
  const provided = useContext(AgentSettingsHostContext);
  return provided ?? DEFAULT_LOCAL_AGENT_SETTINGS_HOST;
}

/** Reactive `agentSettings[agentKind]` scoped to the active host; never leaks local values remotely. */
export function useHostAgentSettingValues(
  agentKind: string,
): Readonly<Record<string, boolean | string>> | undefined {
  const host = useContext(AgentSettingsHostContext);
  const isRemote = host?.isRemote === true;
  const local = useSharedSettings((state) =>
    isRemote ? EMPTY_AGENT_SETTINGS : state.agentSettings[agentKind],
  );
  const remote = usePairedHostSettings(isRemote ? host.connectionKey : undefined);
  return isRemote ? remote?.settings?.agentSettings?.[agentKind] : local;
}

/** Reactive `hiddenModels` scoped to the active host; never leaks local values remotely. */
export function useHostHiddenModels(): Readonly<Record<string, string[]>> {
  const host = useContext(AgentSettingsHostContext);
  const isRemote = host?.isRemote === true;
  const local = useSharedSettings((state) => (isRemote ? EMPTY_HIDDEN_MODELS : state.hiddenModels));
  const remote = usePairedHostSettings(isRemote ? host.connectionKey : undefined);
  return isRemote ? (remote?.settings?.hiddenModels ?? EMPTY_HIDDEN_MODELS) : local;
}

/** True when the active host's settings document is loaded and writable. */
export function useHostSettingsReady(): boolean {
  const host = useContext(AgentSettingsHostContext);
  const isRemote = host?.isRemote === true;
  const remote = usePairedHostSettings(isRemote ? host.connectionKey : undefined);
  if (!isRemote) return host?.isOnline ?? true;
  return host.isOnline && remote?.settings !== undefined;
}
