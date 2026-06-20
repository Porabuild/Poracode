import { create } from "zustand";
import { readBridge } from "../bridge";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type CliPickerTarget,
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
  PrCreateMode,
  ProviderDraftConfig,
  TerminalPosition,
  ThemeMode,
  ThreadPresentationMode,
  ThreadRemoveAction,
  WorktreeStorageMode,
} from "@/shared/contracts";

const STORAGE_KEY = "lightcode-shared-settings";

interface SharedSettingsState extends SharedSettings {
  sharedSettingsHydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePreset: (id: string) => void;
  setLocale: (locale: LocaleSetting) => void;
  setGitTextLanguage: (value: AiContentLanguage) => void;
  setTerminalPosition: (position: TerminalPosition) => void;
  setCommitGenConfig: (provider: string, model: string, effort: string) => void;
  setTitleGenConfig: (provider: string, model: string, effort: string) => void;
  setConflictResolverConfig: (provider: string, model: string, effort: string) => void;
  setConflictResolverPresentationMode: (mode: ThreadPresentationMode) => void;
  setWslCommitGenConfig: (provider: string, model: string, effort: string) => void;
  setWslTitleGenConfig: (provider: string, model: string, effort: string) => void;
  setWslConflictResolverConfig: (provider: string, model: string, effort: string) => void;
  setWslConflictResolverPresentationMode: (mode: ThreadPresentationMode) => void;
  setAgentSetting: (agentKind: string, key: string, value: boolean | string) => void;
  setModelHidden: (agentKind: string, modelId: string, hidden: boolean) => void;
  setHiddenModels: (agentKind: string, hiddenIds: string[]) => void;
  setAgentDisabled: (agentKind: string, disabled: boolean) => void;
  setProviderOrder: (order: string[]) => void;
  setCollapseTerminalComposer: (value: boolean) => void;
  setCliPickerTarget: (value: CliPickerTarget) => void;
  setStaleThreadUnloadMinutes: (value: number) => void;
  setAutoArchiveDoneAfterDays: (value: number) => void;
  setScrollSpeed: (value: number) => void;
  setAgentTerminalFontSize: (value: number) => void;
  setGuiChatFontSize: (value: number) => void;
  setTerminalPanelFontSize: (value: number) => void;
  setPreventSleepWhileWorking: (value: boolean) => void;
  setCloseToTray: (value: boolean) => void;
  setThreadRemoveAction: (value: ThreadRemoveAction) => void;
  setNewThreadMode: (value: NewThreadMode) => void;
  setHomeScopeEnabled: (value: boolean) => void;
  setSidebarTranslucency: (value: boolean) => void;
  setSidebarGlassTint: (appearance: "light" | "dark", value: number | null) => void;
  setAutoShowTerminalPanel: (value: boolean) => void;
  setWorktreeStorageMode: (value: WorktreeStorageMode) => void;
  setWorktreeBasePath: (value: string) => void;
  setWslWorktreeBasePath: (value: string) => void;
  setGitReviewMode: (value: GitReviewMode) => void;
  setPrCreateMode: (value: PrCreateMode) => void;
  setCommitDefaultAction: (value: CommitDefaultAction) => void;
  setEditorLspEnabled: (value: boolean) => void;
  setSearchUseIgnoreFiles: (value: boolean) => void;
  setSearchExclude: (value: Record<string, boolean>) => void;
  setDisableCliHookPlugin: (value: boolean) => void;
  dismissHookInstallProposal: (key: string) => void;
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
  setLastPresentationMode: (agentKind: string, mode: ThreadPresentationMode) => void;
  setLastUsedProjectDir: (runtimeKey: string, dir: string) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setNotificationSound: (value: boolean) => void;
  setNotificationFilter: (value: NotificationFilter) => void;
  syncAcpRegistryInstalledAgents: (installed: InstalledAcpRegistryAgent[]) => void;
  setAgentInstance: (instance: AgentInstanceConfig) => void;
  removeAgentInstance: (instanceId: string) => void;
  setNotificationStatuses: (value: {
    done?: boolean;
    needsAttention?: boolean;
    error?: boolean;
  }) => void;
  setNotifyL2Cli: (value: boolean) => void;
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
  pushRecentModel: (
    agentKind: string,
    modelId: string,
    presentationMode: ThreadPresentationMode,
  ) => void;
}

const RECENT_MODELS_LIMIT = 16;

function hasBridge(): boolean {
  return typeof window !== "undefined" && window.lightcode !== undefined;
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

function persistSettings(settings: SharedSettingsInput): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

  if (hasBridge() && initialLoadDone) {
    void readBridge().setSharedSettings(settings);
  }
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
  setCommitGenConfig: (commitGenProvider, commitGenModel, commitGenEffort) => {
    set({ commitGenProvider, commitGenModel, commitGenEffort });
    persistSettings(selectSharedSettings(get()));
  },
  setTitleGenConfig: (titleGenProvider, titleGenModel, titleGenEffort) => {
    set({ titleGenProvider, titleGenModel, titleGenEffort });
    persistSettings(selectSharedSettings(get()));
  },
  setConflictResolverConfig: (
    conflictResolverProvider,
    conflictResolverModel,
    conflictResolverEffort,
  ) => {
    set({ conflictResolverProvider, conflictResolverModel, conflictResolverEffort });
    persistSettings(selectSharedSettings(get()));
  },
  setConflictResolverPresentationMode: (conflictResolverPresentationMode) => {
    if (get().conflictResolverPresentationMode === conflictResolverPresentationMode) return;
    set({ conflictResolverPresentationMode });
    persistSettings(selectSharedSettings(get()));
  },
  setWslCommitGenConfig: (wslCommitGenProvider, wslCommitGenModel, wslCommitGenEffort) => {
    set({ wslCommitGenProvider, wslCommitGenModel, wslCommitGenEffort });
    persistSettings(selectSharedSettings(get()));
  },
  setWslTitleGenConfig: (wslTitleGenProvider, wslTitleGenModel, wslTitleGenEffort) => {
    set({ wslTitleGenProvider, wslTitleGenModel, wslTitleGenEffort });
    persistSettings(selectSharedSettings(get()));
  },
  setWslConflictResolverConfig: (
    wslConflictResolverProvider,
    wslConflictResolverModel,
    wslConflictResolverEffort,
  ) => {
    set({ wslConflictResolverProvider, wslConflictResolverModel, wslConflictResolverEffort });
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
  setProviderOrder: (order) => {
    const current = get().providerOrder;
    const next = [...new Set(order.filter((kind) => typeof kind === "string" && kind.length > 0))];
    if (current.length === next.length && current.every((kind, i) => kind === next[i])) return;
    set({ providerOrder: next });
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
  setPreventSleepWhileWorking: (preventSleepWhileWorking) => {
    set({ preventSleepWhileWorking });
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
  setNewThreadMode: (newThreadMode) => {
    set({ newThreadMode });
    persistSettings(selectSharedSettings(get()));
  },
  setHomeScopeEnabled: (homeScopeEnabled) => {
    if (get().homeScopeEnabled === homeScopeEnabled) return;
    set({ homeScopeEnabled });
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
    if (!current[instanceId]) return;
    const { [instanceId]: _removed, ...agentInstances } = current;
    const prefix = `claude:${instanceId}`;
    const removeProfileKey = (values: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(values).filter(([key]) => key !== prefix));
    set({
      agentInstances,
      providerConfigs: removeProfileKey(get().providerConfigs) as SharedSettings["providerConfigs"],
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
  pushRecentModel: (agentKind, modelId, presentationMode) => {
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
    if (
      current.length === next.length &&
      current.every(
        (m, i) =>
          m.agentKind === next[i]!.agentKind &&
          m.modelId === next[i]!.modelId &&
          m.presentationMode === next[i]!.presentationMode,
      )
    ) {
      return;
    }
    set({ recentModels: next });
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
    commitGenProvider: state.commitGenProvider,
    commitGenModel: state.commitGenModel,
    commitGenEffort: state.commitGenEffort,
    titleGenProvider: state.titleGenProvider,
    titleGenModel: state.titleGenModel,
    titleGenEffort: state.titleGenEffort,
    conflictResolverProvider: state.conflictResolverProvider,
    conflictResolverModel: state.conflictResolverModel,
    conflictResolverEffort: state.conflictResolverEffort,
    conflictResolverPresentationMode: state.conflictResolverPresentationMode,
    wslCommitGenProvider: state.wslCommitGenProvider,
    wslCommitGenModel: state.wslCommitGenModel,
    wslCommitGenEffort: state.wslCommitGenEffort,
    wslTitleGenProvider: state.wslTitleGenProvider,
    wslTitleGenModel: state.wslTitleGenModel,
    wslTitleGenEffort: state.wslTitleGenEffort,
    wslConflictResolverProvider: state.wslConflictResolverProvider,
    wslConflictResolverModel: state.wslConflictResolverModel,
    wslConflictResolverEffort: state.wslConflictResolverEffort,
    wslConflictResolverPresentationMode: state.wslConflictResolverPresentationMode,
    agentSettings: state.agentSettings,
    hiddenModels: state.hiddenModels,
    disabledAgents: state.disabledAgents,
    providerOrder: state.providerOrder,
    acpRegistryInstalledAgents: state.acpRegistryInstalledAgents,
    agentInstances: state.agentInstances,
    collapseTerminalComposer: state.collapseTerminalComposer,
    cliPickerTarget: state.cliPickerTarget,
    staleThreadUnloadMinutes: state.staleThreadUnloadMinutes,
    autoArchiveDoneAfterDays: state.autoArchiveDoneAfterDays,
    scrollSpeed: state.scrollSpeed,
    agentTerminalFontSize: state.agentTerminalFontSize,
    guiChatFontSize: state.guiChatFontSize,
    terminalPanelFontSize: state.terminalPanelFontSize,
    preventSleepWhileWorking: state.preventSleepWhileWorking,
    closeToTray: state.closeToTray,
    threadRemoveAction: state.threadRemoveAction,
    newThreadMode: state.newThreadMode,
    homeScopeEnabled: state.homeScopeEnabled,
    sidebarTranslucency: state.sidebarTranslucency,
    sidebarGlassTint: state.sidebarGlassTint,
    autoShowTerminalPanel: state.autoShowTerminalPanel,
    worktreeStorageMode: state.worktreeStorageMode,
    worktreeBasePath: state.worktreeBasePath,
    wslWorktreeBasePath: state.wslWorktreeBasePath,
    gitReviewMode: state.gitReviewMode,
    prCreateMode: state.prCreateMode,
    commitDefaultAction: state.commitDefaultAction,
    providerConfigs: state.providerConfigs,
    lastPresentationModeByAgent: state.lastPresentationModeByAgent,
    lastUsedProjectDirs: state.lastUsedProjectDirs,
    editorLspEnabled: state.editorLspEnabled,
    searchUseIgnoreFiles: state.searchUseIgnoreFiles,
    searchExclude: state.searchExclude,
    disableCliHookPlugin: state.disableCliHookPlugin,
    dismissedHookInstallProposals: state.dismissedHookInstallProposals,
    notificationsEnabled: state.notificationsEnabled,
    notificationSound: state.notificationSound,
    notificationFilter: state.notificationFilter,
    notificationStatuses: state.notificationStatuses,
    notifyL2Cli: state.notifyL2Cli,
    favoriteModels: state.favoriteModels,
    recentModels: state.recentModels,
    browser: state.browser,
    audio: state.audio,
    usage: state.usage,
  };
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
