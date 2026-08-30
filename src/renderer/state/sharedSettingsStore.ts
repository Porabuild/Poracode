import { create } from "zustand";
import { readBridge } from "../bridge";
import {
  defaultSharedSettings,
  normalizeSidebarShortcutOrder,
  normalizeSharedSettings,
  WINDOWS_SHELL_ARGUMENTS_MAX,
  type CliPickerTarget,
  type PreventSleep,
  type ProviderModelPreference,
  type SidebarShortcutId,
  type SharedSettings,
  type SharedSettingsInput,
} from "@/shared/settings";
import type { AiContentLanguage, LocaleSetting } from "@/shared/locale";
import type {
  GitReviewMode,
  AgentInstanceConfig,
  CommitDefaultAction,
  InstalledAcpRegistryAgent,
  NewThreadMode,
  NotificationFilter,
  PrAutomationMode,
  PrCreateMode,
  PrMergeMethod,
  ProviderDraftConfig,
  TerminalPosition,
  ThemeMode,
  ThreadPresentationMode,
  ThreadRemoveAction,
  WorktreeStorageMode,
  BuiltInMcpServerId,
  McpServer,
  LoadedPlugin,
  Workspace,
} from "@/shared/contracts";
import { nextWorkspaceIconId } from "@/shared/contracts";
import {
  installPlugin as addInstalledPlugin,
  setInstalledPluginEnabled as updateInstalledPluginEnabled,
  setPluginMcpServerEnabled as updatePluginMcpServerEnabled,
  setPluginSkillEnabled as updatePluginSkillEnabled,
  uninstallPlugin as removeInstalledPlugin,
} from "@/shared/plugins/catalog";
import { incrementAgentSelectionUsage } from "@/shared/crossagentRanking";
import { isSensitiveAgentSetting } from "@/shared/agentSecrets";
import {
  effectiveProviderOrder,
  type MachineScopeMode,
  type MachineScopeModes,
} from "@/shared/machineSettings";

const STORAGE_KEY = "poracode-shared-settings";

interface SharedSettingsState extends SharedSettings {
  sharedSettingsHydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreset: (id: string) => void;
  setLocale: (locale: LocaleSetting) => void;
  setGitTextLanguage: (value: AiContentLanguage) => void;
  setTerminalPosition: (position: TerminalPosition) => void;
  setWindowsShellPath: (path: string) => void;
  setWindowsInternalShellPath: (path: string) => void;
  setWindowsShellArguments: (args: string) => void;
  setCommitGenConfig: (provider: string, model: string, effort: string, fast: boolean) => void;
  setTitleGenConfig: (provider: string, model: string, effort: string, fast: boolean) => void;
  setConflictResolverConfig: (
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
  ) => void;
  setExperimentJudgeConfig: (
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
  ) => void;
  setConflictResolverPresentationMode: (mode: ThreadPresentationMode) => void;
  setWslCommitGenConfig: (provider: string, model: string, effort: string, fast: boolean) => void;
  setWslTitleGenConfig: (provider: string, model: string, effort: string, fast: boolean) => void;
  setWslConflictResolverConfig: (
    provider: string,
    model: string,
    effort: string,
    fast: boolean,
  ) => void;
  setWslConflictResolverPresentationMode: (mode: ThreadPresentationMode) => void;
  setAgentSetting: (agentKind: string, key: string, value: boolean | string) => void;
  setAgentSecretSetting: (agentKind: string, key: string, value: string) => Promise<boolean>;
  setModelHidden: (agentKind: string, modelId: string, hidden: boolean) => void;
  setHiddenModels: (agentKind: string, hiddenIds: string[]) => void;
  setAgentDisabled: (agentKind: string, disabled: boolean) => void;
  setCrossagentProviderPaused: (agentKind: string, paused: boolean) => void;
  setCrossagentHiddenModels: (agentKind: string, hiddenIds: string[]) => void;
  setProviderOrder: (order: string[]) => void;
  setMachineScopeMode: (domain: keyof MachineScopeModes, mode: MachineScopeMode) => void;
  setMachineProviderOrder: (machineId: string, order: string[]) => void;
  /** Relock: adopt `machineId`'s effective order globally and clear overrides. */
  lockProviderOrderToMachine: (machineId: string) => void;
  setMachineAgentSetting: (
    machineId: string,
    agentKind: string,
    key: string,
    value: boolean | string,
  ) => void;
  setCollapseTerminalComposer: (value: boolean) => void;
  setCliPickerTarget: (value: CliPickerTarget) => void;
  setStaleThreadUnloadMinutes: (value: number) => void;
  setAutoArchiveDoneAfterDays: (value: number) => void;
  setScrollSpeed: (value: number) => void;
  setAgentTerminalFontSize: (value: number) => void;
  setGuiChatFontSize: (value: number) => void;
  setTerminalPanelFontSize: (value: number) => void;
  setPreventSleep: (value: PreventSleep) => void;
  setLaunchAtStartup: (value: boolean) => void;
  setStartMinimized: (value: boolean) => void;
  setCloseToTray: (value: boolean) => void;
  setThreadRemoveAction: (value: ThreadRemoveAction) => void;
  setAutoMarkDoneOnPrMerge: (value: boolean) => void;
  setNewThreadMode: (value: NewThreadMode) => void;
  setHomeScopeEnabled: (value: boolean) => void;
  setSidebarShortcutVisible: (id: SidebarShortcutId, visible: boolean) => void;
  setSidebarShortcutOrder: (order: SidebarShortcutId[]) => void;
  setSidebarTranslucency: (value: boolean) => void;
  setSidebarGlassTint: (appearance: "light" | "dark", value: number | null) => void;
  setAutoShowTerminalPanel: (value: boolean) => void;
  setWorktreeStorageMode: (value: WorktreeStorageMode) => void;
  setWorktreeBasePath: (value: string) => void;
  setWslWorktreeBasePath: (value: string) => void;
  setGitReviewMode: (value: GitReviewMode) => void;
  setPrCreateMode: (value: PrCreateMode) => void;
  setPrAutomationDefault: (value: PrAutomationMode) => void;
  setPrMergeMethod: (value: PrMergeMethod) => void;
  setCommitDefaultAction: (value: CommitDefaultAction) => void;
  setEditorLspEnabled: (value: boolean) => void;
  setSearchUseIgnoreFiles: (value: boolean) => void;
  setSearchExclude: (value: Record<string, boolean>) => void;
  setDisableCliHookPlugin: (value: boolean) => void;
  dismissHookInstallProposal: (key: string) => void;
  /**
   * Turn a composer MCP server on/off persistently, keyed by composer MCP id
   * (`"browser"`, `"crossagents"`, `"computer-use"`). Persisted like the other
   * setters; consumed as the standing default for every new thread.
   */
  setMcpServerEnabled: (id: string, enabled: boolean) => void;
  setMcpServers: (servers: McpServer[]) => void;
  setBuiltInMcpServerDisabled: (id: BuiltInMcpServerId, disabled: boolean) => void;
  setBuiltInMcpToolEnabled: (id: BuiltInMcpServerId, tool: string, enabled: boolean) => void;
  installPlugin: (plugin: LoadedPlugin) => void;
  uninstallPlugin: (plugin: LoadedPlugin) => void;
  setPluginEnabled: (plugin: LoadedPlugin, enabled: boolean) => void;
  setPluginSkillEnabled: (pluginName: string, folder: string, enabled: boolean) => void;
  setPluginMcpServerEnabled: (pluginName: string, serverName: string, enabled: boolean) => void;
  setBrowserSetting: <K extends keyof SharedSettings["browser"]>(
    key: K,
    value: SharedSettings["browser"][K],
  ) => void;
  setAudioSetting: <K extends keyof SharedSettings["audio"]>(
    key: K,
    value: SharedSettings["audio"][K],
  ) => void;
  setUsageSetting: <K extends keyof SharedSettings["usage"]>(
    key: K,
    value: SharedSettings["usage"][K],
  ) => void;
  setProviderConfig: (agentKind: string, config: ProviderDraftConfig) => void;
  setProviderModelPreference: (
    agentKind: string,
    modelId: string,
    preference: ProviderModelPreference,
  ) => void;
  setLastPresentationMode: (agentKind: string, mode: ThreadPresentationMode) => void;
  setLastUsedProjectDir: (runtimeKey: string, dir: string) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setNotificationSound: (value: boolean) => void;
  setNotificationFilter: (value: NotificationFilter) => void;
  setRemotePushEnabled: (value: boolean) => void;
  setRemotePushRedactContent: (value: boolean) => void;
  syncAcpRegistryInstalledAgents: (installed: InstalledAcpRegistryAgent[]) => void;
  setAgentInstance: (instance: AgentInstanceConfig) => void;
  removeAgentInstance: (instanceId: string) => void;
  setNotificationStatuses: (value: {
    done?: boolean;
    needsAttention?: boolean;
    error?: boolean;
  }) => void;
  setNotifyL2Cli: (value: boolean) => void;
  /** Append a workspace and return it, so callers can activate the new entry. */
  addWorkspace: (name: string) => Workspace;
  renameWorkspace: (workspaceId: string, name: string) => void;
  /** Remove a workspace. No-op on the last remaining one — a project must always have a home. */
  removeWorkspace: (workspaceId: string) => void;
  /** Replace the whole list in one persist write (used to seed the defaults). */
  setWorkspaces: (workspaces: Workspace[]) => void;
  toggleFavoriteModel: (
    agentKind: string,
    modelId: string,
    presentationMode: ThreadPresentationMode,
  ) => void;
  /**
   * Flip a model's favorite state independent of presentation mode: remove every
   * stored entry for `(agentKind, modelId)` if any exist, otherwise add one under
   * `fallbackMode`. Used where no presentation mode is in scope (e.g. the draft
   * screen), so a single keypress clears the favorite across every mode at once
   * and never leaves a duplicate. Returns `true` when the model is now favorited.
   */
  toggleFavoriteModelAnyMode: (
    agentKind: string,
    modelId: string,
    fallbackMode: ThreadPresentationMode,
  ) => boolean;
  setCrossagentRoutingGuide: (value: string) => void;
  pushRecentModel: (
    agentKind: string,
    modelId: string,
    presentationMode: ThreadPresentationMode,
    effort?: string,
    fast?: boolean,
  ) => void;
}

const RECENT_MODELS_LIMIT = 16;
function hasBridge(): boolean {
  return typeof window !== "undefined" && window.poracode !== undefined;
}

function loadFallbackSettings(): SharedSettings {
  if (typeof window === "undefined") {
    return { ...defaultSharedSettings };
  }

  try {
    return normalizeSharedSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return { ...defaultSharedSettings };
  }
}

/**
 * Whether the authoritative settings have been loaded from the main process.
 * Until this is true we skip writing to the settings file so that early
 * useEffect-triggered persists (e.g. setProviderConfig on mount) don't
 * clobber the file with default values before the real settings are loaded.
 */
let initialLoadDone = !hasBridge();
let pendingSharedSettingsWrite: Promise<void> | undefined;

function persistSettings(settings: SharedSettingsInput): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  if (hasBridge() && initialLoadDone) {
    const write = readBridge().setSharedSettings(settings);
    pendingSharedSettingsWrite = write;
    void write
      .catch(() => undefined)
      .then(() => {
        if (pendingSharedSettingsWrite === write) {
          pendingSharedSettingsWrite = undefined;
        }
      });
  }
}

export async function waitForPendingSharedSettings(): Promise<void> {
  await pendingSharedSettingsWrite;
}

/**
 * Awaitable counterpart to `persistSettings`'s fire-and-forget bridge write.
 * Callers that need a guarantee the settings file reflects the latest store
 * state before triggering IPC that re-reads it from disk (e.g. reloading a
 * provider's live MCP servers) should `await` this first — otherwise a fast
 * follow-up call can race the write above and observe stale settings.
 */
export async function flushSharedSettings(): Promise<void> {
  if (!hasBridge() || !initialLoadDone) {
    return;
  }
  if (pendingSharedSettingsWrite) {
    await pendingSharedSettingsWrite;
    return;
  }
  await readBridge().setSharedSettings(selectSharedSettings(useSharedSettings.getState()));
}

function cacheSettingsSnapshot(settings: SharedSettingsInput): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function providerDraftConfigEqual(
  a: ProviderDraftConfig | undefined,
  b: ProviderDraftConfig,
): boolean {
  return (
    a !== undefined &&
    a.model === b.model &&
    a.effort === b.effort &&
    a.contextSize === b.contextSize &&
    a.fast === b.fast &&
    a.thinking === b.thinking &&
    a.mode === b.mode &&
    a.approvalPolicy === b.approvalPolicy &&
    a.approvalsReviewer === b.approvalsReviewer &&
    a.sandboxMode === b.sandboxMode
  );
}

const initialSettings = loadFallbackSettings();

export const useSharedSettings = create<SharedSettingsState>()((set, get) => ({
  ...initialSettings,
  sharedSettingsHydrated: initialLoadDone,
  setThemeMode: (themeMode) => {
    set({ themeMode });
    persistSettings(selectSharedSettings(get()));
  },
  setThemePreset: (themePreset) => {
    if (get().themePreset === themePreset) return;
    set({ themePreset });
    persistSettings(selectSharedSettings(get()));
  },
  setLocale: (locale) => {
    if (get().locale === locale) return;
    set({ locale });
    persistSettings(selectSharedSettings(get()));
  },
  setGitTextLanguage: (gitTextLanguage) => {
    if (get().gitTextLanguage === gitTextLanguage) return;
    set({ gitTextLanguage });
    persistSettings(selectSharedSettings(get()));
  },
  setTerminalPosition: (terminalPosition) => {
    set({ terminalPosition });
    persistSettings(selectSharedSettings(get()));
  },
  setWindowsShellPath: (windowsShellPath) => {
    set({ windowsShellPath });
    persistSettings(selectSharedSettings(get()));
  },
  setWindowsInternalShellPath: (windowsInternalShellPath) => {
    set({ windowsInternalShellPath });
    persistSettings(selectSharedSettings(get()));
  },
  setWindowsShellArguments: (windowsShellArguments) => {
    set({ windowsShellArguments: windowsShellArguments.slice(0, WINDOWS_SHELL_ARGUMENTS_MAX) });
    persistSettings(selectSharedSettings(get()));
  },
  setCommitGenConfig: (commitGenProvider, commitGenModel, commitGenEffort, commitGenFast) => {
    set({ commitGenProvider, commitGenModel, commitGenEffort, commitGenFast });
    persistSettings(selectSharedSettings(get()));
  },
  setTitleGenConfig: (titleGenProvider, titleGenModel, titleGenEffort, titleGenFast) => {
    set({ titleGenProvider, titleGenModel, titleGenEffort, titleGenFast });
    persistSettings(selectSharedSettings(get()));
  },
  setConflictResolverConfig: (
    conflictResolverProvider,
    conflictResolverModel,
    conflictResolverEffort,
    conflictResolverFast,
  ) => {
    set({
      conflictResolverProvider,
      conflictResolverModel,
      conflictResolverEffort,
      conflictResolverFast,
    });
    persistSettings(selectSharedSettings(get()));
  },
  setExperimentJudgeConfig: (
    experimentJudgeProvider,
    experimentJudgeModel,
    experimentJudgeEffort,
    experimentJudgeFast,
  ) => {
    set({
      experimentJudgeProvider,
      experimentJudgeModel,
      experimentJudgeEffort,
      experimentJudgeFast,
    });
    persistSettings(selectSharedSettings(get()));
  },
  setConflictResolverPresentationMode: (conflictResolverPresentationMode) => {
    if (get().conflictResolverPresentationMode === conflictResolverPresentationMode) return;
    set({ conflictResolverPresentationMode });
    persistSettings(selectSharedSettings(get()));
  },
  setWslCommitGenConfig: (
    wslCommitGenProvider,
    wslCommitGenModel,
    wslCommitGenEffort,
    wslCommitGenFast,
  ) => {
    set({ wslCommitGenProvider, wslCommitGenModel, wslCommitGenEffort, wslCommitGenFast });
    persistSettings(selectSharedSettings(get()));
  },
  setWslTitleGenConfig: (
    wslTitleGenProvider,
    wslTitleGenModel,
    wslTitleGenEffort,
    wslTitleGenFast,
  ) => {
    set({ wslTitleGenProvider, wslTitleGenModel, wslTitleGenEffort, wslTitleGenFast });
    persistSettings(selectSharedSettings(get()));
  },
  setWslConflictResolverConfig: (
    wslConflictResolverProvider,
    wslConflictResolverModel,
    wslConflictResolverEffort,
    wslConflictResolverFast,
  ) => {
    set({
      wslConflictResolverProvider,
      wslConflictResolverModel,
      wslConflictResolverEffort,
      wslConflictResolverFast,
    });
    persistSettings(selectSharedSettings(get()));
  },
  setWslConflictResolverPresentationMode: (wslConflictResolverPresentationMode) => {
    if (get().wslConflictResolverPresentationMode === wslConflictResolverPresentationMode) return;
    set({ wslConflictResolverPresentationMode });
    persistSettings(selectSharedSettings(get()));
  },
  setAgentSetting: (agentKind, key, value) => {
    const current = get().agentSettings;
    const agentValues = { ...current[agentKind], [key]: value };
    set({ agentSettings: { ...current, [agentKind]: agentValues } });
    persistSettings(selectSharedSettings(get()));
  },
  setAgentSecretSetting: async (agentKind, key, value) => {
    const { storedValue } = await readBridge().setAgentSecretSetting({ agentKind, key, value });
    const current = get().agentSettings;
    const agentValues = { ...current[agentKind] };
    if (storedValue === null) delete agentValues[key];
    else agentValues[key] = storedValue;
    set({ agentSettings: { ...current, [agentKind]: agentValues } });
    cacheSettingsSnapshot(selectSharedSettings(get()));
    return storedValue !== null;
  },
  setModelHidden: (agentKind, modelId, hidden) => {
    const current = get().hiddenModels;
    const list = current[agentKind] ?? [];
    const next = hidden ? [...new Set([...list, modelId])] : list.filter((id) => id !== modelId);
    set({ hiddenModels: { ...current, [agentKind]: next } });
    persistSettings(selectSharedSettings(get()));
  },
  setHiddenModels: (agentKind, hiddenIds) => {
    const current = get().hiddenModels;
    set({ hiddenModels: { ...current, [agentKind]: hiddenIds } });
    persistSettings(selectSharedSettings(get()));
  },
  setAgentDisabled: (agentKind, disabled) => {
    const current = get().disabledAgents;
    const next = disabled
      ? [...new Set([...current, agentKind])]
      : current.filter((k) => k !== agentKind);
    set({ disabledAgents: next });
    persistSettings(selectSharedSettings(get()));
  },
  setCrossagentProviderPaused: (agentKind, paused) => {
    const current = get().crossagentPausedProviders;
    const next = paused
      ? [...new Set([...current, agentKind])]
      : current.filter((k) => k !== agentKind);
    set({ crossagentPausedProviders: next });
    persistSettings(selectSharedSettings(get()));
  },
  setCrossagentHiddenModels: (agentKind, hiddenIds) => {
    const current = get().crossagentHiddenModels;
    set({ crossagentHiddenModels: { ...current, [agentKind]: hiddenIds } });
    persistSettings(selectSharedSettings(get()));
  },
  setProviderOrder: (order) => {
    const current = get().providerOrder;
    const next = [...new Set(order.filter((kind) => typeof kind === "string" && kind.length > 0))];
    if (current.length === next.length && current.every((kind, i) => kind === next[i])) return;
    set({ providerOrder: next });
    persistSettings(selectSharedSettings(get()));
  },
  setMachineScopeMode: (domain, mode) => {
    const current = get().machineScopeModes;
    if (current[domain] === mode) return;
    set({ machineScopeModes: { ...current, [domain]: mode } });
    persistSettings(selectSharedSettings(get()));
  },
  setMachineProviderOrder: (machineId, order) => {
    const machineSettings = get().machineSettings;
    const next = [...new Set(order.filter((kind) => typeof kind === "string" && kind.length > 0))];
    // An empty order removes the override — the machine falls back to the
    // global order (mirrors the global reset semantics).
    const { providerOrder: _previousOrder, ...entry } = machineSettings[machineId] ?? {};
    set({
      machineSettings: {
        ...machineSettings,
        [machineId]: next.length > 0 ? { ...entry, providerOrder: next } : entry,
      },
    });
    persistSettings(selectSharedSettings(get()));
  },
  lockProviderOrderToMachine: (machineId) => {
    const state = get();
    const adopted = [...effectiveProviderOrder(state, machineId)];
    const machineSettings = Object.fromEntries(
      Object.entries(state.machineSettings).map(([key, entry]) => {
        const { providerOrder: _providerOrder, ...rest } = entry;
        return [key, rest];
      }),
    );
    set({
      providerOrder: adopted,
      machineScopeModes: { ...state.machineScopeModes, providerOrder: "synced" },
      machineSettings,
    });
    persistSettings(selectSharedSettings(get()));
  },
  setMachineAgentSetting: (machineId, agentKind, key, value) => {
    // Secrets are sealed per host and must never be machine-keyed.
    if (isSensitiveAgentSetting(agentKind, key)) {
      throw new Error(`Refusing to store sensitive agent setting per machine: ${key}`);
    }
    const machineSettings = get().machineSettings;
    const entry = machineSettings[machineId];
    const agentSettings = {
      ...entry?.agentSettings,
      [agentKind]: { ...entry?.agentSettings?.[agentKind], [key]: value },
    };
    set({
      machineSettings: { ...machineSettings, [machineId]: { ...entry, agentSettings } },
    });
    persistSettings(selectSharedSettings(get()));
  },
  setCollapseTerminalComposer: (collapseTerminalComposer) => {
    set({ collapseTerminalComposer });
    persistSettings(selectSharedSettings(get()));
  },
  setCliPickerTarget: (cliPickerTarget) => {
    set({ cliPickerTarget });
    persistSettings(selectSharedSettings(get()));
  },
  setStaleThreadUnloadMinutes: (staleThreadUnloadMinutes) => {
    set({ staleThreadUnloadMinutes });
    persistSettings(selectSharedSettings(get()));
  },
  setAutoArchiveDoneAfterDays: (autoArchiveDoneAfterDays) => {
    set({ autoArchiveDoneAfterDays });
    persistSettings(selectSharedSettings(get()));
  },
  setScrollSpeed: (scrollSpeed) => {
    set({ scrollSpeed });
    persistSettings(selectSharedSettings(get()));
  },
  setAgentTerminalFontSize: (agentTerminalFontSize) => {
    set({ agentTerminalFontSize });
    persistSettings(selectSharedSettings(get()));
  },
  setGuiChatFontSize: (guiChatFontSize) => {
    set({ guiChatFontSize });
    persistSettings(selectSharedSettings(get()));
  },
  setTerminalPanelFontSize: (terminalPanelFontSize) => {
    set({ terminalPanelFontSize });
    persistSettings(selectSharedSettings(get()));
  },
  setPreventSleep: (preventSleep) => {
    set({ preventSleep });
    persistSettings(selectSharedSettings(get()));
  },
  setLaunchAtStartup: (launchAtStartup) => {
    if (get().launchAtStartup === launchAtStartup) return;
    set({ launchAtStartup });
    persistSettings(selectSharedSettings(get()));
  },
  setStartMinimized: (startMinimized) => {
    if (get().startMinimized === startMinimized) return;
    set({ startMinimized });
    persistSettings(selectSharedSettings(get()));
  },
  setCloseToTray: (closeToTray) => {
    if (get().closeToTray === closeToTray) return;
    set({ closeToTray });
    persistSettings(selectSharedSettings(get()));
  },
  setThreadRemoveAction: (threadRemoveAction) => {
    set({ threadRemoveAction });
    persistSettings(selectSharedSettings(get()));
  },
  setAutoMarkDoneOnPrMerge: (autoMarkDoneOnPrMerge) => {
    if (get().autoMarkDoneOnPrMerge === autoMarkDoneOnPrMerge) return;
    set({ autoMarkDoneOnPrMerge });
    persistSettings(selectSharedSettings(get()));
  },
  setNewThreadMode: (newThreadMode) => {
    set({ newThreadMode });
    persistSettings(selectSharedSettings(get()));
  },
  setHomeScopeEnabled: (homeScopeEnabled) => {
    if (get().homeScopeEnabled === homeScopeEnabled) return;
    set({ homeScopeEnabled });
    persistSettings(selectSharedSettings(get()));
  },
  setSidebarShortcutVisible: (id, visible) => {
    const current = get().sidebarHiddenShortcuts;
    const hidden = current.includes(id);
    if (hidden === !visible) return;
    set({
      sidebarHiddenShortcuts: visible
        ? current.filter((shortcutId) => shortcutId !== id)
        : [...current, id],
    });
    persistSettings(selectSharedSettings(get()));
  },
  setSidebarShortcutOrder: (order) => {
    const next = normalizeSidebarShortcutOrder(order);
    const current = get().sidebarShortcutOrder;
    if (current.length === next.length && current.every((id, index) => id === next[index])) return;
    set({ sidebarShortcutOrder: next });
    persistSettings(selectSharedSettings(get()));
  },
  setSidebarTranslucency: (sidebarTranslucency) => {
    if (get().sidebarTranslucency === sidebarTranslucency) return;
    set({ sidebarTranslucency });
    persistSettings(selectSharedSettings(get()));
  },
  setSidebarGlassTint: (appearance, value) => {
    const current = get().sidebarGlassTint;
    if (current[appearance] === value) return;
    set({ sidebarGlassTint: { ...current, [appearance]: value } });
    persistSettings(selectSharedSettings(get()));
  },
  setAutoShowTerminalPanel: (autoShowTerminalPanel) => {
    set({ autoShowTerminalPanel });
    persistSettings(selectSharedSettings(get()));
  },
  setWorktreeStorageMode: (worktreeStorageMode) => {
    if (get().worktreeStorageMode === worktreeStorageMode) return;
    set({ worktreeStorageMode });
    persistSettings(selectSharedSettings(get()));
  },
  setWorktreeBasePath: (worktreeBasePath) => {
    if (get().worktreeBasePath === worktreeBasePath) return;
    set({ worktreeBasePath });
    persistSettings(selectSharedSettings(get()));
  },
  setWslWorktreeBasePath: (wslWorktreeBasePath) => {
    if (get().wslWorktreeBasePath === wslWorktreeBasePath) return;
    set({ wslWorktreeBasePath });
    persistSettings(selectSharedSettings(get()));
  },
  setGitReviewMode: (gitReviewMode) => {
    set({ gitReviewMode });
    persistSettings(selectSharedSettings(get()));
  },
  setPrCreateMode: (prCreateMode) => {
    if (get().prCreateMode === prCreateMode) return;
    set({ prCreateMode });
    persistSettings(selectSharedSettings(get()));
  },
  setPrAutomationDefault: (prAutomationDefault) => {
    if (get().prAutomationDefault === prAutomationDefault) return;
    set({ prAutomationDefault });
    persistSettings(selectSharedSettings(get()));
  },
  setPrMergeMethod: (prMergeMethod) => {
    if (get().prMergeMethod === prMergeMethod) return;
    set({ prMergeMethod });
    persistSettings(selectSharedSettings(get()));
  },
  setCommitDefaultAction: (commitDefaultAction) => {
    if (get().commitDefaultAction === commitDefaultAction) return;
    set({ commitDefaultAction });
    persistSettings(selectSharedSettings(get()));
  },
  setEditorLspEnabled: (editorLspEnabled) => {
    set({ editorLspEnabled });
    persistSettings(selectSharedSettings(get()));
  },
  setSearchUseIgnoreFiles: (searchUseIgnoreFiles) => {
    set({ searchUseIgnoreFiles });
    persistSettings(selectSharedSettings(get()));
  },
  setSearchExclude: (searchExclude) => {
    set({ searchExclude });
    persistSettings(selectSharedSettings(get()));
  },
  setDisableCliHookPlugin: (disableCliHookPlugin) => {
    set({ disableCliHookPlugin });
    persistSettings(selectSharedSettings(get()));
  },
  dismissHookInstallProposal: (key) => {
    const current = get().dismissedHookInstallProposals;
    if (current[key]) return;
    set({ dismissedHookInstallProposals: { ...current, [key]: true } });
    persistSettings(selectSharedSettings(get()));
  },
  setMcpServerEnabled: (id, enabled) => {
    const current = get().enabledMcpServers;
    if ((current[id] ?? false) === enabled) return;
    set({ enabledMcpServers: { ...current, [id]: enabled } });
    persistSettings(selectSharedSettings(get()));
  },
  setMcpServers: (mcpServers) => {
    set({ mcpServers });
    persistSettings(selectSharedSettings(get()));
  },
  setBuiltInMcpServerDisabled: (id, disabled) => {
    const current = get().disabledBuiltInMcpServers;
    if ((current[id] ?? false) === disabled) return;
    const next = { ...current, [id]: disabled };
    if (!disabled) delete next[id];
    set({ disabledBuiltInMcpServers: next });
    persistSettings(selectSharedSettings(get()));
  },
  setBuiltInMcpToolEnabled: (id, tool, enabled) => {
    const current = get().disabledBuiltInMcpTools;
    const disabled = new Set(current[id] ?? []);
    if (enabled) disabled.delete(tool);
    else disabled.add(tool);
    const next = { ...current, [id]: [...disabled] };
    if (disabled.size === 0) delete next[id];
    set({ disabledBuiltInMcpTools: next });
    persistSettings(selectSharedSettings(get()));
  },
  installPlugin: (plugin) => {
    const installedPlugins = addInstalledPlugin(get().installedPlugins, plugin);
    if (installedPlugins === get().installedPlugins) return;
    set({ installedPlugins });
    persistSettings(selectSharedSettings(get()));
  },
  uninstallPlugin: (plugin) => {
    const installedPlugins = removeInstalledPlugin(get().installedPlugins, plugin.name);
    if (installedPlugins === get().installedPlugins) return;
    set({ installedPlugins });
    persistSettings(selectSharedSettings(get()));
  },
  setPluginEnabled: (plugin, enabled) => {
    const installedPlugins = updateInstalledPluginEnabled(
      get().installedPlugins,
      plugin.name,
      enabled,
    );
    if (installedPlugins === get().installedPlugins) return;
    set({ installedPlugins });
    persistSettings(selectSharedSettings(get()));
  },
  setPluginSkillEnabled: (pluginName, folder, enabled) => {
    const installedPlugins = updatePluginSkillEnabled(
      get().installedPlugins,
      pluginName,
      folder,
      enabled,
    );
    if (installedPlugins === get().installedPlugins) return;
    set({ installedPlugins });
    persistSettings(selectSharedSettings(get()));
  },
  setPluginMcpServerEnabled: (pluginName, serverName, enabled) => {
    const installedPlugins = updatePluginMcpServerEnabled(
      get().installedPlugins,
      pluginName,
      serverName,
      enabled,
    );
    if (installedPlugins === get().installedPlugins) return;
    set({ installedPlugins });
    persistSettings(selectSharedSettings(get()));
  },
  setBrowserSetting: (key, value) => {
    const current = get().browser;
    if (current[key] === value) return;
    set({ browser: { ...current, [key]: value } });
    persistSettings(selectSharedSettings(get()));
  },
  setAudioSetting: (key, value) => {
    const current = get().audio;
    if (current[key] === value) return;
    set({ audio: { ...current, [key]: value } });
    persistSettings(selectSharedSettings(get()));
  },
  setUsageSetting: (key, value) => {
    const current = get().usage;
    if (current[key] === value) return;
    set({ usage: { ...current, [key]: value } });
    persistSettings(selectSharedSettings(get()));
  },
  setProviderConfig: (agentKind, config) => {
    if (!config.model.trim()) {
      return;
    }
    const current = get().providerConfigs;
    if (providerDraftConfigEqual(current[agentKind], config)) {
      return;
    }
    set({ providerConfigs: { ...current, [agentKind]: config } });
    persistSettings(selectSharedSettings(get()));
  },
  setProviderModelPreference: (agentKind, modelId, preference) => {
    if (!modelId.trim()) return;
    const current = get().providerModelPreferences;
    const currentPreference = current[agentKind]?.[modelId];
    if (
      currentPreference?.effort === preference.effort &&
      currentPreference?.fast === preference.fast
    ) {
      return;
    }
    set({
      providerModelPreferences: {
        ...current,
        [agentKind]: { ...current[agentKind], [modelId]: preference },
      },
    });
    persistSettings(selectSharedSettings(get()));
  },
  setLastPresentationMode: (agentKind, mode) => {
    const current = get().lastPresentationModeByAgent;
    if (current[agentKind] === mode) return;
    set({ lastPresentationModeByAgent: { ...current, [agentKind]: mode } });
    persistSettings(selectSharedSettings(get()));
  },
  setLastUsedProjectDir: (runtimeKey, dir) => {
    const current = get().lastUsedProjectDirs;
    if (current[runtimeKey] === dir) return;
    set({ lastUsedProjectDirs: { ...current, [runtimeKey]: dir } });
    persistSettings(selectSharedSettings(get()));
  },
  setNotificationsEnabled: (notificationsEnabled) => {
    if (get().notificationsEnabled === notificationsEnabled) return;
    set({ notificationsEnabled });
    persistSettings(selectSharedSettings(get()));
  },
  setNotificationSound: (notificationSound) => {
    if (get().notificationSound === notificationSound) return;
    set({ notificationSound });
    persistSettings(selectSharedSettings(get()));
  },
  setNotificationFilter: (notificationFilter) => {
    if (get().notificationFilter === notificationFilter) return;
    set({ notificationFilter });
    persistSettings(selectSharedSettings(get()));
  },
  setRemotePushEnabled: (remotePushEnabled) => {
    if (get().remotePushEnabled === remotePushEnabled) return;
    set({ remotePushEnabled });
    persistSettings(selectSharedSettings(get()));
  },
  setRemotePushRedactContent: (remotePushRedactContent) => {
    if (get().remotePushRedactContent === remotePushRedactContent) return;
    set({ remotePushRedactContent });
    persistSettings(selectSharedSettings(get()));
  },
  syncAcpRegistryInstalledAgents: (installed) => {
    const current = get().acpRegistryInstalledAgents;
    const currentKeys = Object.keys(current);
    if (
      currentKeys.length === installed.length &&
      installed.every((record) => {
        const existing = current[record.id];
        return (
          existing !== undefined &&
          existing.name === record.name &&
          existing.version === record.version &&
          existing.icon === record.icon &&
          existing.installedAt === record.installedAt &&
          existing.adapterKind === record.adapterKind &&
          existing.installKind === record.installKind
        );
      })
    ) {
      return;
    }
    set({
      acpRegistryInstalledAgents: Object.fromEntries(
        installed.map((record) => [record.id, record]),
      ),
    });
    cacheSettingsSnapshot(selectSharedSettings(get()));
  },
  setAgentInstance: (instance) => {
    const current = get().agentInstances;
    set({ agentInstances: { ...current, [instance.id]: instance } });
    persistSettings(selectSharedSettings(get()));
  },
  removeAgentInstance: (instanceId) => {
    const current = get().agentInstances;
    const instance = current[instanceId];
    if (!instance) return;
    const { [instanceId]: _removed, ...agentInstances } = current;
    const prefix = `${instance.driver}:${instanceId}`;
    const removeProfileKey = (values: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(values).filter(([key]) => key !== prefix));
    set({
      agentInstances,
      providerConfigs: removeProfileKey(get().providerConfigs) as SharedSettings["providerConfigs"],
      providerModelPreferences: removeProfileKey(
        get().providerModelPreferences,
      ) as SharedSettings["providerModelPreferences"],
      hiddenModels: removeProfileKey(get().hiddenModels) as SharedSettings["hiddenModels"],
      agentSettings: removeProfileKey(get().agentSettings) as SharedSettings["agentSettings"],
      lastPresentationModeByAgent: removeProfileKey(
        get().lastPresentationModeByAgent,
      ) as SharedSettings["lastPresentationModeByAgent"],
      disabledAgents: get().disabledAgents.filter((kind) => kind !== prefix),
      favoriteModels: get().favoriteModels.filter((entry) => entry.agentKind !== prefix),
      recentModels: get().recentModels.filter((entry) => entry.agentKind !== prefix),
      providerOrder: get().providerOrder.filter((kind) => kind !== prefix),
    });
    persistSettings(selectSharedSettings(get()));
  },
  setNotificationStatuses: (partial) => {
    const current = get().notificationStatuses;
    const next = { ...current, ...partial };
    if (
      current.done === next.done &&
      current.needsAttention === next.needsAttention &&
      current.error === next.error
    ) {
      return;
    }
    set({ notificationStatuses: next });
    persistSettings(selectSharedSettings(get()));
  },
  setNotifyL2Cli: (notifyL2Cli) => {
    if (get().notifyL2Cli === notifyL2Cli) return;
    set({ notifyL2Cli });
    persistSettings(selectSharedSettings(get()));
  },
  addWorkspace: (name) => {
    const current = get().workspaces;
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
      icon: nextWorkspaceIconId(current),
    };
    set({ workspaces: [...current, workspace] });
    persistSettings(selectSharedSettings(get()));
    return workspace;
  },
  renameWorkspace: (workspaceId, name) => {
    const current = get().workspaces;
    if (!current.some((w) => w.id === workspaceId && w.name !== name)) return;
    set({ workspaces: current.map((w) => (w.id === workspaceId ? { ...w, name } : w)) });
    persistSettings(selectSharedSettings(get()));
  },
  removeWorkspace: (workspaceId) => {
    const current = get().workspaces;
    // Refuse to drop the last workspace: with none left there is no valid
    // active id, and every project would render as unfiled.
    if (current.length <= 1 || !current.some((w) => w.id === workspaceId)) return;
    set({ workspaces: current.filter((w) => w.id !== workspaceId) });
    persistSettings(selectSharedSettings(get()));
  },
  setWorkspaces: (workspaces) => {
    set({ workspaces });
    persistSettings(selectSharedSettings(get()));
  },
  toggleFavoriteModel: (agentKind, modelId, presentationMode) => {
    const current = get().favoriteModels;
    const idx = current.findIndex(
      (m) =>
        m.agentKind === agentKind &&
        m.modelId === modelId &&
        m.presentationMode === presentationMode,
    );
    const next =
      idx >= 0
        ? [...current.slice(0, idx), ...current.slice(idx + 1)]
        : [...current, { agentKind, modelId, presentationMode }];
    set({ favoriteModels: next });
    persistSettings(selectSharedSettings(get()));
  },
  toggleFavoriteModelAnyMode: (agentKind, modelId, fallbackMode) => {
    const current = get().favoriteModels;
    const matches = (m: (typeof current)[number]) =>
      m.agentKind === agentKind && m.modelId === modelId;
    const isFavorite = current.some(matches);
    const next = isFavorite
      ? current.filter((m) => !matches(m))
      : [...current, { agentKind, modelId, presentationMode: fallbackMode }];
    set({ favoriteModels: next });
    persistSettings(selectSharedSettings(get()));
    return !isFavorite;
  },
  setCrossagentRoutingGuide: (crossagentRoutingGuide) => {
    if (get().crossagentRoutingGuide === crossagentRoutingGuide) return;
    set({ crossagentRoutingGuide });
    persistSettings(selectSharedSettings(get()));
  },
  pushRecentModel: (agentKind, modelId, presentationMode, effort, fast) => {
    const current = get().recentModels;
    const samePresentation = current.filter((m) => m.presentationMode === presentationMode);
    const otherPresentations = current.filter((m) => m.presentationMode !== presentationMode);
    const filtered = samePresentation.filter(
      (m) => !(m.agentKind === agentKind && m.modelId === modelId),
    );
    const nextForPresentation = [{ agentKind, modelId, presentationMode }, ...filtered].slice(
      0,
      RECENT_MODELS_LIMIT,
    );
    const next = [...nextForPresentation, ...otherPresentations].slice(0, RECENT_MODELS_LIMIT * 2);
    const agentSelectionUsage = incrementAgentSelectionUsage(get().agentSelectionUsage, [
      {
        agentKind,
        modelId,
        ...(effort ? { effort } : {}),
        fast: fast === true,
      },
    ]);
    const recentsUnchanged =
      current.length === next.length &&
      current.every(
        (m, i) =>
          m.agentKind === next[i]!.agentKind &&
          m.modelId === next[i]!.modelId &&
          m.presentationMode === next[i]!.presentationMode,
      );
    set({
      ...(recentsUnchanged ? {} : { recentModels: next }),
      agentSelectionUsage,
    });
    persistSettings(selectSharedSettings(get()));
  },
}));

function selectSharedSettings(state: SharedSettingsState): SharedSettingsInput {
  return {
    themeMode: state.themeMode,
    themePreset: state.themePreset,
    locale: state.locale,
    gitTextLanguage: state.gitTextLanguage,
    terminalPosition: state.terminalPosition,
    windowsShellPath: state.windowsShellPath,
    windowsInternalShellPath: state.windowsInternalShellPath,
    windowsShellArguments: state.windowsShellArguments,
    commitGenProvider: state.commitGenProvider,
    commitGenModel: state.commitGenModel,
    commitGenEffort: state.commitGenEffort,
    commitGenFast: state.commitGenFast,
    titleGenProvider: state.titleGenProvider,
    titleGenModel: state.titleGenModel,
    titleGenEffort: state.titleGenEffort,
    titleGenFast: state.titleGenFast,
    conflictResolverProvider: state.conflictResolverProvider,
    conflictResolverModel: state.conflictResolverModel,
    conflictResolverEffort: state.conflictResolverEffort,
    conflictResolverFast: state.conflictResolverFast,
    experimentJudgeProvider: state.experimentJudgeProvider,
    experimentJudgeModel: state.experimentJudgeModel,
    experimentJudgeEffort: state.experimentJudgeEffort,
    experimentJudgeFast: state.experimentJudgeFast,
    conflictResolverPresentationMode: state.conflictResolverPresentationMode,
    wslCommitGenProvider: state.wslCommitGenProvider,
    wslCommitGenModel: state.wslCommitGenModel,
    wslCommitGenEffort: state.wslCommitGenEffort,
    wslCommitGenFast: state.wslCommitGenFast,
    wslTitleGenProvider: state.wslTitleGenProvider,
    wslTitleGenModel: state.wslTitleGenModel,
    wslTitleGenEffort: state.wslTitleGenEffort,
    wslTitleGenFast: state.wslTitleGenFast,
    wslConflictResolverProvider: state.wslConflictResolverProvider,
    wslConflictResolverModel: state.wslConflictResolverModel,
    wslConflictResolverEffort: state.wslConflictResolverEffort,
    wslConflictResolverFast: state.wslConflictResolverFast,
    wslConflictResolverPresentationMode: state.wslConflictResolverPresentationMode,
    agentSettings: state.agentSettings,
    machineScopeModes: state.machineScopeModes,
    machineSettings: state.machineSettings,
    hiddenModels: state.hiddenModels,
    disabledAgents: state.disabledAgents,
    providerOrder: state.providerOrder,
    acpRegistryInstalledAgents: state.acpRegistryInstalledAgents,
    acpRegistryAutoInstallOptOuts: state.acpRegistryAutoInstallOptOuts,
    agentInstances: state.agentInstances,
    collapseTerminalComposer: state.collapseTerminalComposer,
    cliPickerTarget: state.cliPickerTarget,
    staleThreadUnloadMinutes: state.staleThreadUnloadMinutes,
    autoArchiveDoneAfterDays: state.autoArchiveDoneAfterDays,
    scrollSpeed: state.scrollSpeed,
    agentTerminalFontSize: state.agentTerminalFontSize,
    guiChatFontSize: state.guiChatFontSize,
    terminalPanelFontSize: state.terminalPanelFontSize,
    preventSleep: state.preventSleep,
    launchAtStartup: state.launchAtStartup,
    startMinimized: state.startMinimized,
    closeToTray: state.closeToTray,
    remoteAccessEnabled: state.remoteAccessEnabled,
    remoteAccessTailscaleHttps: state.remoteAccessTailscaleHttps,
    remoteAccessAdvertisedUrl: state.remoteAccessAdvertisedUrl,
    threadRemoveAction: state.threadRemoveAction,
    autoMarkDoneOnPrMerge: state.autoMarkDoneOnPrMerge,
    newThreadMode: state.newThreadMode,
    homeScopeEnabled: state.homeScopeEnabled,
    sidebarHiddenShortcuts: state.sidebarHiddenShortcuts,
    sidebarShortcutOrder: state.sidebarShortcutOrder,
    sidebarTranslucency: state.sidebarTranslucency,
    sidebarGlassTint: state.sidebarGlassTint,
    autoShowTerminalPanel: state.autoShowTerminalPanel,
    worktreeStorageMode: state.worktreeStorageMode,
    worktreeBasePath: state.worktreeBasePath,
    wslWorktreeBasePath: state.wslWorktreeBasePath,
    gitReviewMode: state.gitReviewMode,
    prCreateMode: state.prCreateMode,
    prAutomationDefault: state.prAutomationDefault,
    prMergeMethod: state.prMergeMethod,
    commitDefaultAction: state.commitDefaultAction,
    providerConfigs: state.providerConfigs,
    providerModelPreferences: state.providerModelPreferences,
    lastPresentationModeByAgent: state.lastPresentationModeByAgent,
    lastUsedProjectDirs: state.lastUsedProjectDirs,
    editorLspEnabled: state.editorLspEnabled,
    searchUseIgnoreFiles: state.searchUseIgnoreFiles,
    searchExclude: state.searchExclude,
    disableCliHookPlugin: state.disableCliHookPlugin,
    dismissedHookInstallProposals: state.dismissedHookInstallProposals,
    enabledMcpServers: state.enabledMcpServers,
    mcpServers: state.mcpServers,
    disabledBuiltInMcpServers: state.disabledBuiltInMcpServers,
    installedPlugins: state.installedPlugins,
    disabledBuiltInMcpTools: state.disabledBuiltInMcpTools,
    notificationsEnabled: state.notificationsEnabled,
    notificationSound: state.notificationSound,
    notificationFilter: state.notificationFilter,
    notificationStatuses: state.notificationStatuses,
    notifyL2Cli: state.notifyL2Cli,
    remotePushEnabled: state.remotePushEnabled,
    remotePushRedactContent: state.remotePushRedactContent,
    workspaces: state.workspaces,
    favoriteModels: state.favoriteModels,
    recentModels: state.recentModels,
    agentSelectionUsage: state.agentSelectionUsage,
    crossagentPausedProviders: state.crossagentPausedProviders,
    crossagentHiddenModels: state.crossagentHiddenModels,
    browser: state.browser,
    audio: state.audio,
    usage: state.usage,
    crossagentRoutingGuide: state.crossagentRoutingGuide,
  };
}

/**
 * Applies settings that changed outside this renderer's setters — a remote
 * client editing desktop settings, or (in the PWA) the paired desktop's
 * values arriving over the remote API. Updates the store and the local cache
 * WITHOUT writing back through the bridge, so external updates never echo.
 */
/**
 * Resolves once the authoritative settings have been loaded from the main
 * process (or immediately when there is no bridge). Callers making a
 * settings-dependent decision right after app launch — before hydration —
 * should await this instead of reading defaults or a stale cache.
 */
export function whenSharedSettingsHydrated(): Promise<void> {
  if (useSharedSettings.getState().sharedSettingsHydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useSharedSettings.subscribe((state) => {
      if (state.sharedSettingsHydrated) {
        unsubscribe();
        resolve();
      }
    });
  });
}

export function applyExternalSharedSettings(partial: Partial<SharedSettings>): void {
  useSharedSettings.setState((state) => ({ ...state, ...partial }));
  cacheSettingsSnapshot(selectSharedSettings(useSharedSettings.getState()));
}

if (hasBridge()) {
  void readBridge()
    .getSharedSettings()
    .then((settings) => {
      const normalized = normalizeSharedSettings(settings);
      useSharedSettings.setState((state) => ({
        ...state,
        ...normalized,
        sharedSettingsHydrated: true,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      initialLoadDone = true;
    })
    .catch(() => {
      initialLoadDone = true;
      useSharedSettings.setState({ sharedSettingsHydrated: true });
    });
}
