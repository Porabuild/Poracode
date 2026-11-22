import { createContext, useContext, type ReactNode } from "react";
import { readBridge } from "@/renderer/bridge";
import { hasAnyClientBridge, readClientRuntime } from "@/renderer/clientRuntime";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type {
  BuiltInMcpServerDisabled,
  InstalledPlugins,
  LoadedPlugin,
  McpOauthWaitResult,
} from "@/shared/contracts";
import type {
  PluginAccountsPayload,
  PluginAccountsResult,
  PluginCatalogPayload,
  PluginCatalogResult,
} from "@/shared/contracts/pluginCatalog";

const EMPTY_INSTALLED_PLUGINS: InstalledPlugins = {};
const EMPTY_DISABLED_BUILT_IN_MCP_SERVERS: BuiltInMcpServerDisabled = {};

/**
 * Transport and mutation operations for one machine's plugin packages.
 * Separated from reactive settings slices so pure-transport consumers such as
 * `PluginIcon` and `usePluginOauth` subscribe to zero Zustand state.
 */
export interface PluginHostTransport {
  /** True when the packages are on another machine. */
  isRemote: boolean;
  /** False when OS helper installers belong to a machine this client cannot manage. */
  canManageLocalHelpers: boolean;
  /** True when interactive OAuth loopback callbacks can reach this host from here. */
  canStartOauth: boolean;
  /** Authoritative project path on the target host for project-scoped artwork. */
  projectFsPath?: string;
  pluginCatalog(payload: PluginCatalogPayload): Promise<PluginCatalogResult>;
  pluginAccounts(payload: PluginAccountsPayload): Promise<PluginAccountsResult>;
  waitMcpServerOauth(flowId: string): Promise<McpOauthWaitResult>;
  installPlugin(plugin: LoadedPlugin): void | Promise<void>;
  enablePlugin(plugin: LoadedPlugin): void | Promise<void>;
  uninstallPlugin(plugin: LoadedPlugin): void | Promise<void>;
  setPluginEnabled(plugin: LoadedPlugin, enabled: boolean): void | Promise<void>;
  setPluginSkillEnabled(
    plugin: LoadedPlugin,
    skillId: string,
    enabled: boolean,
  ): void | Promise<void>;
  setPluginMcpServerEnabled(
    plugin: LoadedPlugin,
    serverName: string,
    enabled: boolean,
  ): void | Promise<void>;
  /** Absent when the host's file manager cannot be opened from this client. */
  openPluginsFolder?: () => void | Promise<void>;
}

/**
 * One machine's view of plugin packages and the settings that enable them.
 *
 * The Plugins page is host-scoped: package discovery, catalog installs, and
 * service accounts all live on the addressed host. The local host reads this
 * client's bridge and shared settings; a paired host is reached through its
 * remote client and its own settings document. Components below the page read
 * this context instead of importing either store directly.
 */
export interface PluginHost extends PluginHostTransport {
  installedPlugins: InstalledPlugins;
  disabledBuiltInMcpServers: BuiltInMcpServerDisabled;
}

const PluginHostContext = createContext<PluginHost | undefined>(undefined);

export function PluginHostProvider(props: { host: PluginHost; children: ReactNode }) {
  return (
    <PluginHostContext.Provider value={props.host}>{props.children}</PluginHostContext.Provider>
  );
}

/**
 * Checks whether this client talks to its primary host over the remote wire
 * transport rather than local Electron IPC. Reads `clientRuntime` directly so
 * tests that stub only `readBridge` from `@/renderer/bridge` still work.
 */
function remoteClientTransport(): boolean {
  if (!hasAnyClientBridge()) return false;
  try {
    return readClientRuntime().transport === "remote-http-websocket";
  } catch {
    return false;
  }
}

const LOCAL_SHARED_TRANSPORT: Omit<
  PluginHostTransport,
  "canManageLocalHelpers" | "canStartOauth" | "openPluginsFolder"
> = {
  isRemote: false,
  pluginCatalog: (payload) => readBridge().pluginCatalog(payload),
  pluginAccounts: (payload) => readBridge().pluginAccounts(payload),
  waitMcpServerOauth: (flowId) => readBridge().waitMcpServerOauth({ flowId }),
  installPlugin: (plugin) => useSharedSettings.getState().installPlugin(plugin),
  enablePlugin: (plugin) => {
    const store = useSharedSettings.getState();
    store.installPlugin(plugin);
    store.setPluginEnabled(plugin, true);
  },
  uninstallPlugin: (plugin) => useSharedSettings.getState().uninstallPlugin(plugin),
  setPluginEnabled: (plugin, enabled) =>
    useSharedSettings.getState().setPluginEnabled(plugin, enabled),
  setPluginSkillEnabled: (plugin, skillId, enabled) =>
    useSharedSettings.getState().setPluginSkillEnabled(plugin, skillId, enabled),
  setPluginMcpServerEnabled: (plugin, serverName, enabled) =>
    useSharedSettings.getState().setPluginMcpServerEnabled(plugin, serverName, enabled),
};

const LOCAL_DESKTOP_TRANSPORT: PluginHostTransport = {
  ...LOCAL_SHARED_TRANSPORT,
  canManageLocalHelpers: true,
  canStartOauth: true,
  openPluginsFolder: () => readBridge().openPluginsFolder(),
};

const REMOTE_BRIDGE_TRANSPORT: PluginHostTransport = {
  ...LOCAL_SHARED_TRANSPORT,
  canManageLocalHelpers: false,
  canStartOauth: false,
};

/** Zero-subscription transport and actions for the active Plugins host. */
export function usePluginHostTransport(): PluginHostTransport {
  const remote = useContext(PluginHostContext);
  if (remote) return remote;
  return remoteClientTransport() ? REMOTE_BRIDGE_TRANSPORT : LOCAL_DESKTOP_TRANSPORT;
}

/** Installed-plugin enablement for the active Plugins host without subscribing remote views to local state. */
export function usePluginHostInstalledPlugins(): InstalledPlugins {
  const remote = useContext(PluginHostContext);
  const local = useSharedSettings((state) =>
    remote ? EMPTY_INSTALLED_PLUGINS : state.installedPlugins,
  );
  return remote ? remote.installedPlugins : local;
}

/** Built-in MCP disablement for the active Plugins host without subscribing remote views to local state. */
export function usePluginHostDisabledBuiltInMcpServers(): BuiltInMcpServerDisabled {
  const remote = useContext(PluginHostContext);
  const local = useSharedSettings((state) =>
    remote ? EMPTY_DISABLED_BUILT_IN_MCP_SERVERS : state.disabledBuiltInMcpServers,
  );
  return remote ? remote.disabledBuiltInMcpServers : local;
}
