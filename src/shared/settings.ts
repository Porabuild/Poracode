import { z } from "zod";
import { allUsageProviderDescriptors } from "@poracode/agents-usage/providers";
import {
  agentInstanceConfigMapSchema,
  installedAcpRegistryAgentSchema,
  builtInMcpDisabledToolsSchema,
  builtInMcpServerDisabledSchema,
  gitReviewModeSchema,
  prCreateModeSchema,
  commitDefaultActionSchema,
  newThreadModeSchema,
  notificationFilterSchema,
  prAutomationModeSchema,
  prMergeMethodSchema,
  providerDraftConfigSchema,
  terminalPositionSchema,
  themeModeSchema,
  threadPresentationModeSchema,
  threadRemoveActionSchema,
  worktreeStorageModeSchema,
  mcpServerListSchema,
  installedPluginsSchema,
  workspaceListSchema,
} from "./contracts";
import {
  defaultMachineScopeModes,
  machineScopeModesSchema,
  machineSettingsEntrySchema,
} from "./machineSettings";
import { parseMachineKey } from "./machines";
import { DEFAULT_SEARCH_EXCLUDE } from "./searchExclude";
import { AI_LANGUAGE_VALUES, LOCALE_SETTING_VALUES } from "./locale";
import { QWEN_DEFAULT_MODEL_ID, QWEN_RETIRED_PREVIEW_MODEL_ID } from "./agents/qwenModels";
import {
  ANTIGRAVITY_ACP_REGISTRY_ID,
  LEGACY_ANTIGRAVITY_ACP_KIND,
  normalizePersistedAntigravityModelSelection,
} from "./agents/antigravity";

export const WINDOWS_SHELL_AUTO = "auto";
export const WINDOWS_SHELL_ARGUMENTS_MAX = 8_192;
export type WindowsShellKind = "pwsh" | "powershell" | "cmd";

export interface AvailableWindowsShell {
  path: string;
  kind: WindowsShellKind;
  /** Product/folder version when known, e.g. "7.2" or "7.6.1". */
  version?: string;
}

const modelPickerEntrySchema = z.object({
  agentKind: z.string().min(1),
  modelId: z.string().min(1),
  presentationMode: threadPresentationModeSchema.default("terminal"),
});

export const agentSelectionUsageEntrySchema = z.object({
  agentKind: z.string().min(1),
  modelId: z.string().min(1),
  effort: z.string().optional(),
  fast: z.boolean().default(false),
  count: z.number().int().positive(),
  lastUsedAt: z.number().int().nonnegative(),
});
export type AgentSelectionUsageEntry = z.infer<typeof agentSelectionUsageEntrySchema>;

export const providerModelPreferenceSchema = z.object({
  effort: z.string().optional(),
  fast: z.boolean().optional(),
});
export type ProviderModelPreference = z.infer<typeof providerModelPreferenceSchema>;

export const MAX_CROSSAGENT_ROUTING_OVERRIDES = 100;
export const MAX_CROSSAGENT_SELECTION_VALUE_LENGTH = 256;

export const crossagentSelectionUsageEntrySchema = agentSelectionUsageEntrySchema.extend({
  /** Normalized task classifications supplied by the calling agent. */
  tags: z.array(z.string().min(1).max(32)).max(5).optional(),
  /**
   * Fields the caller actually supplied. Missing on legacy entries, which are
   * treated as fully explicit to preserve their existing ranking behavior.
   */
  explicitFields: z
    .object({
      provider: z.boolean(),
      model: z.boolean(),
      effort: z.boolean(),
      fast: z.boolean(),
    })
    .optional(),
});
export type CrossagentSelectionUsageEntry = z.infer<typeof crossagentSelectionUsageEntrySchema>;

export const crossagentSelectionUsageEntryKeySchema = crossagentSelectionUsageEntrySchema
  .pick({
    agentKind: true,
    modelId: true,
    effort: true,
    fast: true,
    tags: true,
    explicitFields: true,
  })
  .extend({
    agentKind: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH),
    modelId: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH),
    fast: z.boolean(),
  });
export type CrossagentSelectionUsageEntryKey = z.infer<
  typeof crossagentSelectionUsageEntryKeySchema
>;

export const crossagentRoutingOverrideSchema = z.object({
  tags: z.array(z.string().min(1).max(32)).min(1).max(5),
  agentKind: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH),
  modelId: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH).optional(),
  effort: z.string().min(1).max(MAX_CROSSAGENT_SELECTION_VALUE_LENGTH).optional(),
  fast: z.boolean().optional(),
  updatedAt: z.number().int().nonnegative(),
});
export type CrossagentRoutingOverride = z.infer<typeof crossagentRoutingOverrideSchema>;

/**
 * Cache entry recording whether a given agent supports the **CLI hook plugin**
 * path for status detection on this machine. Keyed by `AgentKind` (and for
 * WSL, by distro) in `agentHookSupport`. The cache is invalidated when ANY of
 * `agentBinaryVersion` / `pluginVersion` / `protocolVersion` change, or when
 * `process.platform` differs from the last recorded value (avoids carrying a
 * stale `supportsL1=true` verdict to a machine where the plugin isn't
 * installed). The JSON field name `supportsL1` is historical.
 */
export const agentHookSupportEntrySchema = z.object({
  agentBinaryVersion: z.string(),
  pluginVersion: z.string(),
  protocolVersion: z.number().int().min(1),
  platform: z.string(),
  verifiedAt: z.string(),
  supportsL1: z.boolean(),
});
export type AgentHookSupportEntry = z.infer<typeof agentHookSupportEntrySchema>;

export const browserLinkOpenTargetSchema = z.enum(["internal", "system"]);
export type BrowserLinkOpenTarget = z.infer<typeof browserLinkOpenTargetSchema>;

export const browserLinkPresentationModeSchema = z.enum(["panel", "overlay"]);
export type BrowserLinkPresentationMode = z.infer<typeof browserLinkPresentationModeSchema>;

const browserSettingsSchema = z.object({
  /**
   * Gate for the MCP `eval` tool. When false (default) the tool
   * returns a "disabled" error to the agent. Off-by-default because eval
   * gives the agent arbitrary script execution in the embedded page.
   */
  allowEval: z.boolean().default(false),
  /**
   * Gate for the MCP `cookies` / `storage` tools. When
   * false (default) those tools refuse to operate. Off-by-default because
   * cookies can include session tokens; storage can include auth state.
   */
  allowDataAccess: z.boolean().default(false),
  /** Where target=_blank / popup links from the embedded browser are opened. */
  linkOpenTarget: browserLinkOpenTargetSchema.default("internal"),
  /** Where to reveal the embedded browser when opening links internally. */
  linkPresentationMode: browserLinkPresentationModeSchema.default("panel"),
});

export const audioTranscriptionModelSchema = z.preprocess(
  (value) =>
    value === "small" || value === "moonshine-tiny" || value === "moonshine-base" ? "tiny" : value,
  z.enum(["tiny", "base"]),
);
export type AudioTranscriptionModel = z.infer<typeof audioTranscriptionModelSchema>;

const audioSettingsSchema = z.object({
  /** Show the composer microphone button. */
  showVoiceInputButton: z.boolean().default(true),
  /** Empty string means the OS/browser default microphone. */
  microphoneDeviceId: z.string().default(""),
  /** Speech-to-text language code, for example "en", "es", or "fr". */
  transcriptionLanguage: z.string().default("en"),
  /** Model used for local composer dictation. */
  transcriptionModel: audioTranscriptionModelSchema.default("tiny"),
  /** Prefer WebGPU acceleration for local speech-to-text when available. */
  useWebGpu: z.boolean().default(true),
});

const usageSettingsSchema = z.object({
  /** Auto-refresh provider usage on a background timer. */
  autoRefresh: z.boolean().default(true),
  /**
   * Default minutes between auto-refreshes, used for any provider without its
   * own `providerRefreshIntervals` override. Floored at 2 to respect provider
   * 429 limits.
   */
  refreshIntervalMinutes: z.number().int().min(2).max(120).default(5),
  /**
   * Per-provider auto-refresh cadence override (minutes), keyed by provider id.
   * A provider absent from this map uses the global `refreshIntervalMinutes`.
   * Values are floored at 2 (provider 429 limits) and capped at 120; the UI
   * removes a provider's entry to fall back to the default rather than storing 0.
   */
  providerRefreshIntervals: z.record(z.string(), z.number().int().min(2).max(120)).default({}),
  /**
   * Show estimated $ cost (reconstructed from local logs at public API rates).
   * Opt-in and panel-only — it is meaningless for subscription/OAuth users.
   */
  showEstimatedCost: z.boolean().default(false),
  /** Show the per-provider usage circles in the sidebar (master toggle). */
  showInSidebar: z.boolean().default(true),
  /**
   * Provider ids whose sidebar circle the user hid individually. The provider is
   * still tracked and still shown in the usage panel — only its sidebar ring is
   * omitted. Gated under the `showInSidebar` master toggle.
   */
  sidebarHiddenProviders: z.array(z.string()).default([]),
  /** Provider ids the user turned OFF for usage tracking. Fresh installs start with Claude/Codex on. */
  disabledProviders: z.array(z.string()).default([]),
  /**
   * User-defined display order for providers in the usage panel. Providers not
   * in this list fall back to the built-in default order at the tail.
   */
  providerOrder: z.array(z.string()).default([]),
  /** Provider ids the user collapsed to a compact row in the usage panel. */
  collapsedProviders: z.array(z.string()).default([]),
  /**
   * For providers whose circle can show one of several ring groups (e.g.
   * Antigravity's Gemini vs Claude+GPT quota groups), the group key the user
   * picked, keyed by provider id. Absent = the provider's default (first) group.
   * Right-clicking the sidebar circle swaps this.
   */
  selectedRingGroups: z.record(z.string(), z.string()).default({}),
});
export type UsageSettings = z.infer<typeof usageSettingsSchema>;

export const DEFAULT_USAGE_ENABLED_PROVIDER_IDS = ["claude", "codex"] as const;
const DEFAULT_USAGE_ENABLED_PROVIDER_ID_SET = new Set<string>(DEFAULT_USAGE_ENABLED_PROVIDER_IDS);
export const DEFAULT_USAGE_DISABLED_PROVIDER_IDS = allUsageProviderDescriptors()
  .map((provider) => provider.id)
  .filter((id) => !DEFAULT_USAGE_ENABLED_PROVIDER_ID_SET.has(id));

export const SIDEBAR_SHORTCUT_IDS = ["pullRequests", "githubActions", "schedules"] as const;
export type SidebarShortcutId = (typeof SIDEBAR_SHORTCUT_IDS)[number];

export const THREAD_DOCK_KINDS = ["goal", "plan", "agents", "backgroundTasks", "images"] as const;
export type ThreadDockKind = (typeof THREAD_DOCK_KINDS)[number];

export function normalizeSidebarShortcutOrder(
  order: readonly SidebarShortcutId[],
): SidebarShortcutId[] {
  const normalized = [...new Set(order)];
  for (const id of SIDEBAR_SHORTCUT_IDS) {
    if (!normalized.includes(id)) normalized.push(id);
  }
  return normalized;
}

export function normalizeThreadDocksOrder(order: readonly ThreadDockKind[]): ThreadDockKind[] {
  const normalized = [...new Set(order)];
  for (const kind of THREAD_DOCK_KINDS) {
    if (!normalized.includes(kind)) normalized.push(kind);
  }
  return normalized;
}

export function reorderVisibleThreadDocks(
  order: readonly ThreadDockKind[],
  visibleOrder: readonly ThreadDockKind[],
  fromIndex: number,
  toIndex: number,
): ThreadDockKind[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return [...order];
  const reorderedVisible = [...visibleOrder];
  const [moved] = reorderedVisible.splice(fromIndex, 1);
  if (!moved) return [...order];
  reorderedVisible.splice(toIndex, 0, moved);

  const visibleKinds = new Set(visibleOrder);
  let visibleIndex = 0;
  return order.map((kind) =>
    visibleKinds.has(kind) ? (reorderedVisible[visibleIndex++] ?? kind) : kind,
  );
}

export const sharedSettingsSchema = z.object({
  themeMode: themeModeSchema,
  /**
   * Selected app theme preset id (see `renderer/theme/themePresets`). The
   * matching light/dark variant is chosen by `themeMode`. Free-form string so
   * the catalog can grow without a schema bump; unknown ids fall back to the
   * base "default" theme at apply time.
   */
  themePreset: z.string(),
  /**
   * UI language. `"system"` follows the OS/browser preferred language at
   * runtime (resolved by `resolveLocale`), mirroring `themeMode: "system"`.
   */
  locale: z.enum(LOCALE_SETTING_VALUES).default("system"),
  /**
   * Language for AI-generated git text (commit messages, PR title/description).
   * `"match-app"` follows the resolved UI `locale`; any other value pins a
   * specific language. Defaults to `"en"` so shared/team-facing artifacts stay
   * English regardless of the interface language. Thread titles and other
   * "conversation" text instead always follow the app language and are not
   * governed by this setting.
   */
  gitTextLanguage: z.enum(AI_LANGUAGE_VALUES).default("en"),
  terminalPosition: terminalPositionSchema,
  /** Absolute detected executable path, or "auto" for preferred-shell detection. */
  windowsShellPath: z.string(),
  /** PowerShell host used for internal commands and agent launch wrappers. */
  windowsInternalShellPath: z.string(),
  /** Additional argv passed directly to each interactive Windows shell. */
  windowsShellArguments: z.string().max(WINDOWS_SHELL_ARGUMENTS_MAX),
  commitGenProvider: z.string(),
  commitGenModel: z.string(),
  commitGenEffort: z.string(),
  /** Run commit-message generation in fast mode (Opus-only; ignored otherwise). */
  commitGenFast: z.boolean(),
  titleGenProvider: z.string(),
  titleGenModel: z.string(),
  titleGenEffort: z.string(),
  /** Run title generation in fast mode (Opus-only; ignored otherwise). */
  titleGenFast: z.boolean(),
  conflictResolverProvider: z.string(),
  conflictResolverModel: z.string(),
  conflictResolverEffort: z.string(),
  /** Launch the conflict-resolver session in fast mode (Opus-only; ignored otherwise). */
  conflictResolverFast: z.boolean(),
  /** Last model configuration used to judge an experiment. */
  experimentJudgeProvider: z.string(),
  experimentJudgeModel: z.string(),
  experimentJudgeEffort: z.string(),
  experimentJudgeFast: z.boolean(),
  /**
   * Where "Fix in Agent" opens the conflict-resolver thread: structured chat
   * (`gui`) or terminal-native (`terminal`). Defaults to `gui`. If the resolved
   * provider doesn't support the chosen mode, the consumer falls back to the
   * provider's default presentation mode.
   */
  conflictResolverPresentationMode: threadPresentationModeSchema,
  wslCommitGenProvider: z.string(),
  wslCommitGenModel: z.string(),
  wslCommitGenEffort: z.string(),
  wslCommitGenFast: z.boolean(),
  wslTitleGenProvider: z.string(),
  wslTitleGenModel: z.string(),
  wslTitleGenEffort: z.string(),
  wslTitleGenFast: z.boolean(),
  wslConflictResolverProvider: z.string(),
  wslConflictResolverModel: z.string(),
  wslConflictResolverEffort: z.string(),
  wslConflictResolverFast: z.boolean(),
  wslConflictResolverPresentationMode: threadPresentationModeSchema,
  /** Per-agent settings keyed by agent kind, then setting key. */
  agentSettings: z.record(z.string(), z.record(z.string(), z.union([z.boolean(), z.string()]))),
  /**
   * Lock state per machine-scopable settings domain. "synced" (the default)
   * keeps one global value for every machine; "per-machine" activates the
   * `machineSettings` overrides for that domain.
   */
  machineScopeModes: machineScopeModesSchema,
  /**
   * Sparse per-machine overrides keyed by `machineKey` ("local",
   * "local/wsl:<distro>", "remote:<desktopId>", …). Resolved against the
   * global values by the `effective*` helpers in `machineSettings.ts`.
   * Entries with unparseable machine keys are dropped on normalize.
   */
  machineSettings: z.record(z.string(), machineSettingsEntrySchema),
  /** Per-agent hidden model IDs keyed by agent kind. */
  hiddenModels: z.record(z.string(), z.array(z.string())),
  /** Agent kinds that the user has disabled (hidden from the agent picker). */
  disabledAgents: z.array(z.string()),
  /**
   * User-defined display order for providers in the model picker. Provider kinds not in this
   * list fall back to the built-in default order at the tail.
   */
  providerOrder: z.array(z.string()),
  /** User-installed registry agents keyed by ACP registry id. */
  acpRegistryInstalledAgents: z.record(z.string(), installedAcpRegistryAgentSchema),
  /**
   * ACP registry ids the user explicitly removed. A provider whose registry
   * artifact is auto-installed alongside its detected CLI must not resurrect it
   * on the next detection pass, so removal records an opt-out here and a later
   * explicit install clears it.
   */
  acpRegistryAutoInstallOptOuts: z.array(z.string()),
  /** User-registered agent instances, currently used by generic ACP registry installs. */
  agentInstances: agentInstanceConfigMapSchema,
  /** When true, the composer in terminal-native threads starts collapsed. */
  collapseTerminalComposer: z.boolean(),
  /**
   * Where a thread's informational docks (goal, plan, agents, background
   * tasks) live: stacked above the composer, or in the right panel's Docks tab
   * with compact bubbles over the composer standing in for them. Images always
   * remain in the right panel.
   */
  threadDocksPlacement: z.enum(["composer", "right"]),
  /** User-defined order for right-panel docks and their composer bubbles. */
  threadDocksOrder: z.array(z.enum(THREAD_DOCK_KINDS)),
  /**
   * Where a browser element-picker selection is delivered for a terminal-native
   * (CLI) thread. "ask" shows a chooser on pick (but a collapsed composer always
   * routes straight to the terminal); "terminal" always types it into the PTY
   * input line; "composer" always stages it in the composer attachment bar.
   */
  cliPickerTarget: z.enum(["ask", "terminal", "composer"]),
  /** Idle minutes before a hidden resumable thread is unloaded. 0 disables auto-unload. */
  staleThreadUnloadMinutes: z.number().int().min(0),
  /** Days a thread can stay marked done before it is auto-archived. 0 disables auto-archive. */
  autoArchiveDoneAfterDays: z.number().int().min(0),
  /** Terminal scrollback scroll speed multiplier. */
  scrollSpeed: z.number().int().min(1).max(10),
  /** Base font size for agent terminals. Auto-shrinks in narrow/short panes. */
  agentTerminalFontSize: z.number().int().min(8).max(20),
  /** Base font size for agent thread chat (GUI / ACP markdown surface), in px. */
  guiChatFontSize: z.number().int().min(8).max(20),
  /** Base font size for the dev terminal panel. Auto-shrinks in narrow/short panes. */
  terminalPanelFontSize: z.number().int().min(8).max(20),
  /**
   * When to prevent the OS from sleeping while Poracode is running.
   * - "while-working": only while a thread is actively working
   * - "while-remote-access": while remote access is enabled or a thread is working
   * - "always": keep the machine awake whenever the app is running
   */
  preventSleep: z.enum(["while-working", "while-remote-access", "always"]),
  /** Register Poracode to launch automatically when the user signs in to Windows. */
  launchAtStartup: z.boolean(),
  /** Keep the main window hidden when Poracode is launched automatically at sign-in. */
  startMinimized: z.boolean(),
  /**
   * When true, closing the main window hides Poracode to the system tray
   * instead of quitting. The tray icon's Quit action (or Quit from the app
   * menu) still exits the process.
   */
  closeToTray: z.boolean(),
  /** Enable the desktop's remote access server for paired mobile/browser clients. */
  remoteAccessEnabled: z.boolean(),
  /**
   * Advertise a Tailscale MagicDNS HTTPS URL for remote access. When enabled and
   * the local Tailscale daemon is healthy, the app runs `tailscale serve` to
   * reverse-proxy `https://<machine>.<tailnet>.ts.net` to the local remote-access
   * port and advertises that secure URL in pairing info. Desktop/server-lifecycle
   * only — deliberately excluded from the remote-editable settings subset.
   */
  remoteAccessTailscaleHttps: z.boolean(),
  /**
   * Custom advertised base URL (origin only, http/https) for remote access, e.g.
   * a Cloudflare named tunnel or reverse proxy. Empty means automatic. Desktop/
   * server-lifecycle only — never remotely writable.
   */
  remoteAccessAdvertisedUrl: z.string(),
  /** Default action for the thread remove button: archive or delete permanently. */
  threadRemoveAction: threadRemoveActionSchema,
  /**
   * Mark a worktree thread done as soon as its pull request is observed turning
   * merged. Only live transitions count — a PR already merged when the app
   * starts leaves the thread alone (the sidebar row offers a Done button).
   */
  autoMarkDoneOnPrMerge: z.boolean(),
  /** Default new-thread behaviour: full page or side-by-side panel. */
  newThreadMode: newThreadModeSchema,
  /** Show the projectless Home scope for OS-level agent sessions. */
  homeScopeEnabled: z.boolean(),
  /** Footer shortcuts hidden from both the expanded and collapsed sidebar. */
  sidebarHiddenShortcuts: z.array(z.enum(SIDEBAR_SHORTCUT_IDS)),
  /** Display order for shortcuts in the expanded and collapsed sidebar footer. */
  sidebarShortcutOrder: z.array(z.enum(SIDEBAR_SHORTCUT_IDS)),
  /**
   * Translucent ("liquid glass") sidebar. When on, the window uses a
   * native blur material where supported (macOS vibrancy, Windows 11 acrylic)
   * and an in-app translucent fallback elsewhere. Default on.
   */
  sidebarTranslucency: z.boolean(),
  /**
   * Per-appearance override for the translucent sidebar's frosting: the alpha
   * (0–100) of the `--sidebar-glass-tint` content-background mix. Higher is more
   * frosted (holds the theme color); lower shows more of the blurred backdrop.
   * `null` keeps the built-in per-platform default (see styles.css). Applied
   * Windows-only — macOS vibrancy keeps its own tint.
   */
  sidebarGlassTint: z.object({
    light: z.number().int().min(0).max(100).nullable().default(null),
    dark: z.number().int().min(0).max(100).nullable().default(null),
  }),
  /** Automatically show the terminal panel when running commands or creating worktrees. */
  autoShowTerminalPanel: z.boolean(),
  /**
   * Where git worktrees are created: under a global root (`global`) or nested in
   * each project at `<project>/.poracode/worktrees` (`project-relative`).
   */
  worktreeStorageMode: worktreeStorageModeSchema,
  /**
   * Custom global worktree root for native projects. Empty string = built-in
   * default (`~/.poracode/worktrees`). Only used when `worktreeStorageMode` is
   * `global`.
   */
  worktreeBasePath: z.string(),
  /**
   * Custom global worktree root for WSL projects (a Linux path). Empty string =
   * WSL default (`~/.poracode/worktrees` in the distro home). Only used when
   * `worktreeStorageMode` is `global`.
   */
  wslWorktreeBasePath: z.string(),
  /** Open git review as a right-side panel or a full page overlay. */
  gitReviewMode: gitReviewModeSchema,
  /**
   * Default "Create PR" action: open the dialog to edit details, or
   * auto-generate the summary and create the PR immediately. Doubles as the
   * sticky last-used choice for the Create PR split-button.
   */
  prCreateMode: prCreateModeSchema,
  /** Default automation applied to pull requests created from Poracode. */
  prAutomationDefault: prAutomationModeSchema,
  /**
   * Sticky last-used merge method. The PR split-button and automatic PR
   * merging share this setting so automation matches the user's choice.
   */
  prMergeMethod: prMergeMethodSchema,
  /**
   * Sticky last-used primary commit action for the commit split-button,
   * remembered across sessions so it defaults to whatever the user picked last.
   */
  commitDefaultAction: commitDefaultActionSchema,
  /** Per-provider last-used draft config (model, effort, mode, etc.). App-wide. */
  providerConfigs: z.record(z.string(), providerDraftConfigSchema),
  /** Per-provider and model effort/Fast choices. App-wide. */
  providerModelPreferences: z.record(
    z.string(),
    z.record(z.string(), providerModelPreferenceSchema),
  ),
  /**
   * Per-provider last-picked thread presentation mode (terminal vs gui chat).
   * Read by ThreadDraftView so a provider that supports both modes remembers
   * the user's previous choice.
   */
  lastPresentationModeByAgent: z.record(z.string(), threadPresentationModeSchema),
  /**
   * Last-used parent directory for the create-project folder picker, keyed by
   * runtime (`"native"` or a WSL distro name). Preselected when browsing for a
   * new project; falls back to the runtime's home directory when absent.
   */
  lastUsedProjectDirs: z.record(z.string(), z.string()),
  /** Enable LSP language servers for the file editor (type checking, completions, etc.). */
  editorLspEnabled: z.boolean(),
  /** When true (VS Code default), the @file mention search honors `.gitignore`. */
  searchUseIgnoreFiles: z.boolean(),
  /**
   * Glob exclusions applied to the @file mention search. Keys are minimatch
   * globs. `true` keeps the pattern excluded; `false` is reserved for
   * per-project overrides that re-enable an inherited default.
   */
  searchExclude: z.record(z.string(), z.boolean()),
  notificationsEnabled: z.boolean(),
  notificationSound: z.boolean(),
  notificationFilter: notificationFilterSchema,
  notificationStatuses: z.object({
    done: z.boolean(),
    needsAttention: z.boolean(),
    error: z.boolean(),
  }),
  /**
   * When false, suppress notifications for terminal-presentation threads whose
   * status is derived from the OSC/heuristic fallback (L2) rather than the CLI
   * hook plugin (L1). L2 status is less precise, so users can opt out of its
   * noisier transitions.
   */
  notifyL2Cli: z.boolean(),
  /**
   * Send push notifications and iOS Live Activity updates to paired mobile
   * devices (via the hosted push gateway) on thread-state transitions. Distinct
   * from desktop OS notifications (`notificationsEnabled`).
   */
  remotePushEnabled: z.boolean(),
  /**
   * Redact thread titles and project names in remote push payloads (they
   * traverse the gateway and APNs), replacing them with generic text. The
   * WebSocket-connected foreground app still shows full detail.
   */
  remotePushRedactContent: z.boolean(),
  /**
   * User-defined project groupings ("Work", "Side Hustle", …), newest last.
   * Which one is *active* is not stored here but per-window (see the renderer's
   * `workspaceStore`), so switching in one window leaves the others alone.
   *
   * Not part of `remoteSettingsSchema`, so paired clients (mobile PWA) receive no
   * workspace list and therefore show every project — add it to that allowlist if
   * workspaces should scope remote sessions too.
   */
  workspaces: workspaceListSchema,
  /** User-starred (provider, presentation, model) entries surfaced at the top of the model picker. */
  favoriteModels: z.array(modelPickerEntrySchema),
  /**
   * Most-recent (provider, presentation, model) launches for the model picker. Newest first; the menu
   * caps to 5 entries that aren't already in `favoriteModels`.
   */
  recentModels: z.array(modelPickerEntrySchema),
  /** Popularity of user-launched provider/model configurations used as a Crossagents fallback. */
  agentSelectionUsage: z.array(agentSelectionUsageEntrySchema).default([]),
  /**
   * Popularity of explicit Crossagents selections. Supervisor-managed so an
   * automatic choice can never reinforce itself and renderer writes cannot
   * overwrite a selection recorded by the MCP ingress.
   */
  crossagentSelectionUsage: z.array(crossagentSelectionUsageEntrySchema).default([]),
  /**
   * User-pinned task-tag routes managed by the Crossagents MCP. The most
   * specific matching tag set wins before learned affinity.
   */
  crossagentRoutingOverrides: z
    .array(crossagentRoutingOverrideSchema)
    .max(MAX_CROSSAGENT_ROUTING_OVERRIDES)
    .default([]),
  /**
   * Agent kinds temporarily excluded from the Crossagents routing rotation.
   * Unlike `disabledAgents` (which hides a provider everywhere), pausing only
   * affects Crossagents delegation — e.g. park a provider until its quota
   * resets while keeping it in the normal composer picker.
   */
  crossagentPausedProviders: z.array(z.string()).default([]),
  /**
   * Extra hidden model ids keyed by agent kind, applied on top of the global
   * `hiddenModels` visibility filter but only for Crossagents routing. The
   * Crossagents settings model dropdown lists already-globally-visible models
   * and lets the user narrow them further here.
   */
  crossagentHiddenModels: z.record(z.string(), z.array(z.string())).default({}),
  /**
   * Dev-only: force agents off the CLI hook plugin path (L1) so they fall back
   * to L2 terminal parsing. The UI toggle is only visible in the dev build;
   * the field is always present so the supervisor can read it unconditionally.
   */
  disableCliHookPlugin: z.boolean(),
  /** Draft composer hook-install proposals dismissed by provider/env key. */
  dismissedHookInstallProposals: z.record(z.string(), z.boolean()),
  /** Per-agent CLI hook plugin support cache. Keyed by AgentKind (and WSL distro when applicable). */
  agentHookSupport: z.record(z.string(), agentHookSupportEntrySchema),
  /**
   * Composer MCP servers the user has turned on persistently, keyed by composer
   * MCP id (`"browser"`, `"crossagents"`, `"chrome"`, `"computer-use"`). `true` means the
   * server is on for every *new* thread whose provider/presentation supports it
   * (baked into `thread.config` at launch) and shows no composer chip — it is a
   * standing default rather than a per-thread opt-in. Absent/`false` leaves the
   * server off unless the draft explicitly `@`-mentions it, which stages a
   * removable chip for that one thread. Toggled by the composer "+" menu.
   */
  enabledMcpServers: z.record(z.string(), z.boolean()).default({ crossagents: true }),
  /** Custom MCP servers applied to every new thread unless overridden by its project. */
  mcpServers: mcpServerListSchema,
  /** Built-in MCP servers hard-disabled for all new launches. */
  disabledBuiltInMcpServers: builtInMcpServerDisabledSchema,
  /** Disabled tools for Poracode-owned built-in MCP servers. */
  disabledBuiltInMcpTools: builtInMcpDisabledToolsSchema,
  /** First-party Poracode plugins installed from the built-in marketplace. */
  installedPlugins: installedPluginsSchema,
  /**
   * In-app browser panel + agent MCP bridge settings. Whether the Browser MCP
   * attaches to a thread is decided per thread: a persistent default in
   * `enabledMcpServers.browser` or a one-off `@browser` mention, resolved to
   * `thread.config.browserMcp` at launch. These are the bridge/panel knobs.
   */
  browser: browserSettingsSchema,
  /** Local audio capture and speech-to-text settings. */
  audio: audioSettingsSchema,
  /** Provider usage tracking (auto-refresh cadence, per-provider opt-out, cost). */
  usage: usageSettingsSchema,
  /**
   * Free-text routing instructions appended to the Crossagents MCP server
   * `instructions`, guiding how an agent picks which connected agent/model to
   * delegate to when spawning subagents (e.g. "Codex GPT-5.5 fast for quick
   * lookups, Claude Opus for anything subtle"). Empty string = no guidance.
   * Whether a thread gets the Crossagents MCP lives on `thread.config.crossagentMcp`
   * (persistent default in `enabledMcpServers.crossagents` or a `@crossagents`
   * mention); this is the global guidance text shared across every such thread.
   */
  crossagentRoutingGuide: z.string(),
});
export type SharedSettings = z.infer<typeof sharedSettingsSchema>;

/** When to prevent the OS from sleeping while Poracode is running. */
export type PreventSleep = SharedSettings["preventSleep"];

/** Browser element-picker delivery target for terminal-native (CLI) threads. */
export type CliPickerTarget = SharedSettings["cliPickerTarget"];

/** Where a thread's informational docks render: above the composer or in the right panel. */
export type ThreadDocksPlacement = SharedSettings["threadDocksPlacement"];

/**
 * Settings as written by the renderer / IPC consumer. Excludes
 * supervisor-only fields (`agentHookSupport`) that the renderer never
 * manages and that the main process re-merges from disk on write.
 */
export type SharedSettingsInput = Omit<
  SharedSettings,
  "agentHookSupport" | "crossagentSelectionUsage" | "crossagentRoutingOverrides"
>;

export const defaultSharedSettings: SharedSettings = {
  themeMode: "dark",
  themePreset: "default",
  locale: "system",
  gitTextLanguage: "en",
  terminalPosition: "bottom",
  windowsShellPath: WINDOWS_SHELL_AUTO,
  windowsInternalShellPath: WINDOWS_SHELL_AUTO,
  windowsShellArguments: "",
  commitGenProvider: "auto",
  commitGenModel: "",
  commitGenEffort: "",
  commitGenFast: false,
  titleGenProvider: "auto",
  titleGenModel: "",
  titleGenEffort: "",
  titleGenFast: false,
  conflictResolverProvider: "auto",
  conflictResolverModel: "",
  conflictResolverEffort: "",
  conflictResolverFast: false,
  experimentJudgeProvider: "",
  experimentJudgeModel: "",
  experimentJudgeEffort: "",
  experimentJudgeFast: false,
  conflictResolverPresentationMode: "gui",
  wslCommitGenProvider: "auto",
  wslCommitGenModel: "",
  wslCommitGenEffort: "",
  wslCommitGenFast: false,
  wslTitleGenProvider: "auto",
  wslTitleGenModel: "",
  wslTitleGenEffort: "",
  wslTitleGenFast: false,
  wslConflictResolverProvider: "auto",
  wslConflictResolverModel: "",
  wslConflictResolverEffort: "",
  wslConflictResolverFast: false,
  wslConflictResolverPresentationMode: "gui",
  agentSettings: {},
  machineScopeModes: defaultMachineScopeModes,
  machineSettings: {},
  hiddenModels: {},
  disabledAgents: [],
  providerOrder: [],
  acpRegistryInstalledAgents: {},
  acpRegistryAutoInstallOptOuts: [],
  agentInstances: {},
  collapseTerminalComposer: false,
  threadDocksPlacement: "composer",
  threadDocksOrder: [...THREAD_DOCK_KINDS],
  cliPickerTarget: "ask",
  staleThreadUnloadMinutes: 60,
  autoArchiveDoneAfterDays: 3,
  scrollSpeed: 2,
  agentTerminalFontSize: 12,
  guiChatFontSize: 13,
  terminalPanelFontSize: 12,
  preventSleep: "while-remote-access",
  launchAtStartup: true,
  startMinimized: true,
  closeToTray: true,
  remoteAccessEnabled: false,
  remoteAccessTailscaleHttps: false,
  remoteAccessAdvertisedUrl: "",
  threadRemoveAction: "archive",
  autoMarkDoneOnPrMerge: true,
  newThreadMode: "page",
  homeScopeEnabled: true,
  sidebarHiddenShortcuts: ["githubActions"],
  sidebarShortcutOrder: [...SIDEBAR_SHORTCUT_IDS],
  sidebarTranslucency: true,
  sidebarGlassTint: { light: null, dark: null },
  autoShowTerminalPanel: true,
  worktreeStorageMode: "global",
  worktreeBasePath: "",
  wslWorktreeBasePath: "",
  gitReviewMode: "panel",
  prCreateMode: "dialog",
  prAutomationDefault: "off",
  prMergeMethod: "squash",
  commitDefaultAction: "commit-push",
  providerConfigs: {},
  providerModelPreferences: {},
  lastPresentationModeByAgent: {},
  lastUsedProjectDirs: {},
  editorLspEnabled: false,
  searchUseIgnoreFiles: true,
  searchExclude: { ...DEFAULT_SEARCH_EXCLUDE },
  notificationsEnabled: true,
  notificationSound: true,
  notificationFilter: "all",
  notificationStatuses: { done: true, needsAttention: true, error: true },
  notifyL2Cli: true,
  remotePushEnabled: true,
  remotePushRedactContent: false,
  workspaces: [],
  favoriteModels: [],
  recentModels: [],
  agentSelectionUsage: [],
  crossagentSelectionUsage: [],
  crossagentRoutingOverrides: [],
  crossagentPausedProviders: [],
  crossagentHiddenModels: {},
  disableCliHookPlugin: false,
  dismissedHookInstallProposals: {},
  agentHookSupport: {},
  enabledMcpServers: { crossagents: true },
  mcpServers: [],
  disabledBuiltInMcpServers: {},
  disabledBuiltInMcpTools: {},
  installedPlugins: {},
  browser: {
    allowEval: false,
    allowDataAccess: false,
    linkOpenTarget: "internal",
    linkPresentationMode: "panel",
  },
  audio: {
    showVoiceInputButton: true,
    microphoneDeviceId: "",
    transcriptionLanguage: "en",
    transcriptionModel: "tiny",
    useWebGpu: true,
  },
  usage: {
    autoRefresh: true,
    refreshIntervalMinutes: 5,
    providerRefreshIntervals: {},
    showEstimatedCost: false,
    showInSidebar: true,
    sidebarHiddenProviders: [],
    disabledProviders: [...DEFAULT_USAGE_DISABLED_PROVIDER_IDS],
    providerOrder: [],
    collapsedProviders: [],
    selectedRingGroups: {},
  },
  crossagentRoutingGuide: "",
};

function parseSettingOrDefault<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function normalizeObjectFromSchema<
  TShape extends z.ZodRawShape,
  TOutput extends z.infer<z.ZodObject<TShape>>,
>(shape: TShape, defaults: TOutput, value: unknown): TOutput {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  const data = parsed.success ? parsed.data : {};
  const normalized = {} as TOutput;

  for (const key of Object.keys(defaults) as (keyof TOutput)[]) {
    const schema = shape[key as string] as z.ZodType<TOutput[typeof key]>;
    normalized[key] = parseSettingOrDefault(schema, data[key as string], defaults[key]);
  }

  return normalized;
}

function migrateRetiredQwenPreviewModel(settings: SharedSettings): SharedSettings {
  const isRetiredQwenSelection = (agentKind: string, modelId: string) =>
    agentKind === "qwen" && modelId === QWEN_RETIRED_PREVIEW_MODEL_ID;
  const migrateUtilityModel = (provider: string, model: string) =>
    isRetiredQwenSelection(provider, model) ? QWEN_DEFAULT_MODEL_ID : model;
  const qwenProviderConfig = settings.providerConfigs.qwen;
  const providerConfigs =
    qwenProviderConfig?.model === QWEN_RETIRED_PREVIEW_MODEL_ID
      ? {
          ...settings.providerConfigs,
          qwen: { ...qwenProviderConfig, model: QWEN_DEFAULT_MODEL_ID },
        }
      : settings.providerConfigs;
  const qwenModelPreferences = settings.providerModelPreferences.qwen;
  const retiredQwenModelPreference = qwenModelPreferences?.[QWEN_RETIRED_PREVIEW_MODEL_ID];
  let providerModelPreferences = settings.providerModelPreferences;
  if (qwenModelPreferences && retiredQwenModelPreference) {
    const currentQwenModelPreferences = { ...qwenModelPreferences };
    delete currentQwenModelPreferences[QWEN_RETIRED_PREVIEW_MODEL_ID];
    providerModelPreferences = {
      ...settings.providerModelPreferences,
      qwen: {
        ...currentQwenModelPreferences,
        [QWEN_DEFAULT_MODEL_ID]:
          currentQwenModelPreferences[QWEN_DEFAULT_MODEL_ID] ?? retiredQwenModelPreference,
      },
    };
  }

  const seenFavorites = new Set<string>();
  const favoriteModels = settings.favoriteModels
    .map((entry) =>
      isRetiredQwenSelection(entry.agentKind, entry.modelId)
        ? { ...entry, modelId: QWEN_DEFAULT_MODEL_ID }
        : entry,
    )
    .filter((entry) => {
      const key = `${entry.agentKind}\0${entry.modelId}\0${entry.presentationMode}`;
      if (seenFavorites.has(key)) return false;
      seenFavorites.add(key);
      return true;
    });

  const hiddenModels = { ...settings.hiddenModels };
  if (hiddenModels.qwen?.includes(QWEN_RETIRED_PREVIEW_MODEL_ID)) {
    hiddenModels.qwen = [
      ...new Set(
        hiddenModels.qwen.map((modelId) =>
          modelId === QWEN_RETIRED_PREVIEW_MODEL_ID ? QWEN_DEFAULT_MODEL_ID : modelId,
        ),
      ),
    ];
  }

  return {
    ...settings,
    providerConfigs,
    providerModelPreferences,
    hiddenModels,
    commitGenModel: migrateUtilityModel(settings.commitGenProvider, settings.commitGenModel),
    titleGenModel: migrateUtilityModel(settings.titleGenProvider, settings.titleGenModel),
    conflictResolverModel: migrateUtilityModel(
      settings.conflictResolverProvider,
      settings.conflictResolverModel,
    ),
    experimentJudgeModel: migrateUtilityModel(
      settings.experimentJudgeProvider,
      settings.experimentJudgeModel,
    ),
    wslCommitGenModel: migrateUtilityModel(
      settings.wslCommitGenProvider,
      settings.wslCommitGenModel,
    ),
    wslTitleGenModel: migrateUtilityModel(settings.wslTitleGenProvider, settings.wslTitleGenModel),
    wslConflictResolverModel: migrateUtilityModel(
      settings.wslConflictResolverProvider,
      settings.wslConflictResolverModel,
    ),
    favoriteModels,
    // Recents and learned usage are derived; discard retired entries instead of
    // letting them continue to influence the picker or Crossagents routing.
    recentModels: settings.recentModels.filter(
      (entry) => !isRetiredQwenSelection(entry.agentKind, entry.modelId),
    ),
    agentSelectionUsage: settings.agentSelectionUsage.filter(
      (entry) => !isRetiredQwenSelection(entry.agentKind, entry.modelId),
    ),
    crossagentSelectionUsage: settings.crossagentSelectionUsage.filter(
      (entry) => !isRetiredQwenSelection(entry.agentKind, entry.modelId),
    ),
    crossagentRoutingOverrides: settings.crossagentRoutingOverrides.map((entry) =>
      entry.agentKind === "qwen" && entry.modelId === QWEN_RETIRED_PREVIEW_MODEL_ID
        ? { ...entry, modelId: QWEN_DEFAULT_MODEL_ID }
        : entry,
    ),
  };
}

function moveRecordKey<T>(
  record: Record<string, T>,
  from: string,
  to: string,
  merge: (legacy: T, current: T) => T = (_legacy, current) => current,
): Record<string, T> {
  if (!(from in record)) return record;
  const next = { ...record };
  next[to] = to in next ? merge(next[from]!, next[to]!) : next[from]!;
  delete next[from];
  return next;
}

/** Hook-support cache keys can carry an environment suffix (`<kind>:…`); those move with the kind. */
function hasLegacyHookSupportKey(record: SharedSettings["agentHookSupport"]): boolean {
  return Object.keys(record).some(
    (key) =>
      key === LEGACY_ANTIGRAVITY_ACP_KIND || key.startsWith(`${LEGACY_ANTIGRAVITY_ACP_KIND}:`),
  );
}

function migrateHookSupportKeys(
  record: SharedSettings["agentHookSupport"],
): SharedSettings["agentHookSupport"] {
  if (!hasLegacyHookSupportKey(record)) return record;
  const next = { ...record };
  for (const key of Object.keys(next)) {
    if (key === LEGACY_ANTIGRAVITY_ACP_KIND) {
      if (!("antigravity" in next)) next.antigravity = next[key]!;
      delete next[key];
    } else if (key.startsWith(`${LEGACY_ANTIGRAVITY_ACP_KIND}:`)) {
      const target = `antigravity${key.slice(LEGACY_ANTIGRAVITY_ACP_KIND.length)}`;
      if (!(target in next)) next[target] = next[key]!;
      delete next[key];
    }
  }
  return next;
}

function migrateAntigravityAcpAliasState(settings: SharedSettings): {
  settings: SharedSettings;
  acpAliasMigrated: boolean;
} {
  const record = settings.acpRegistryInstalledAgents[ANTIGRAVITY_ACP_REGISTRY_ID];
  const legacyProviderConfigOnly =
    LEGACY_ANTIGRAVITY_ACP_KIND in settings.providerConfigs &&
    !("antigravity" in settings.providerConfigs);
  const legacyProviderPreferencesOnly =
    LEGACY_ANTIGRAVITY_ACP_KIND in settings.providerModelPreferences &&
    !("antigravity" in settings.providerModelPreferences);
  const legacyHiddenModelsOnly =
    LEGACY_ANTIGRAVITY_ACP_KIND in settings.hiddenModels &&
    !("antigravity" in settings.hiddenModels);
  const legacyCrossagentHiddenModelsOnly =
    LEGACY_ANTIGRAVITY_ACP_KIND in settings.crossagentHiddenModels &&
    !("antigravity" in settings.crossagentHiddenModels);
  const legacyMachineHiddenModelsOnly = new Set(
    Object.entries(settings.machineSettings)
      .filter(
        ([, entry]) =>
          LEGACY_ANTIGRAVITY_ACP_KIND in (entry.hiddenModels ?? {}) &&
          !("antigravity" in (entry.hiddenModels ?? {})),
      )
      .map(([key]) => key),
  );
  // Every field this function rewrites has to be able to trigger it, otherwise a
  // profile whose only remnant is e.g. `providerOrder` keeps the dead kind.
  const hasLegacySettings =
    record?.adapterKind === LEGACY_ANTIGRAVITY_ACP_KIND ||
    [
      settings.providerConfigs,
      settings.providerModelPreferences,
      settings.lastPresentationModeByAgent,
      settings.agentSettings,
      settings.hiddenModels,
      settings.crossagentHiddenModels,
    ].some((byKind) => LEGACY_ANTIGRAVITY_ACP_KIND in byKind) ||
    [settings.disabledAgents, settings.providerOrder, settings.crossagentPausedProviders].some(
      (list) => list.includes(LEGACY_ANTIGRAVITY_ACP_KIND),
    ) ||
    [
      settings.favoriteModels,
      settings.recentModels,
      settings.agentSelectionUsage,
      settings.crossagentSelectionUsage,
      settings.crossagentRoutingOverrides,
    ].some((entries) => entries.some((entry) => entry.agentKind === LEGACY_ANTIGRAVITY_ACP_KIND)) ||
    [
      settings.commitGenProvider,
      settings.titleGenProvider,
      settings.conflictResolverProvider,
      settings.experimentJudgeProvider,
      settings.wslCommitGenProvider,
      settings.wslTitleGenProvider,
      settings.wslConflictResolverProvider,
    ].includes(LEGACY_ANTIGRAVITY_ACP_KIND) ||
    hasLegacyHookSupportKey(settings.agentHookSupport) ||
    Object.values(settings.machineSettings).some(
      (entry) =>
        entry.providerOrder?.includes(LEGACY_ANTIGRAVITY_ACP_KIND) ||
        entry.disabledAgents?.includes(LEGACY_ANTIGRAVITY_ACP_KIND) ||
        LEGACY_ANTIGRAVITY_ACP_KIND in (entry.hiddenModels ?? {}) ||
        LEGACY_ANTIGRAVITY_ACP_KIND in (entry.agentSettings ?? {}),
    );
  const migrateEntry = <T extends { agentKind: string }>(entry: T): T => {
    if (entry.agentKind !== LEGACY_ANTIGRAVITY_ACP_KIND) return entry;
    const modelId =
      "modelId" in entry && typeof entry.modelId === "string" ? entry.modelId : undefined;
    const effort = "effort" in entry && typeof entry.effort === "string" ? entry.effort : undefined;
    const normalized = modelId
      ? normalizePersistedAntigravityModelSelection(modelId, effort, true)
      : undefined;
    return {
      ...entry,
      agentKind: "antigravity",
      ...(normalized
        ? {
            modelId: normalized.model,
            ...(normalized.effort ? { effort: normalized.effort } : {}),
          }
        : {}),
    } as T;
  };
  const migrateProvider = (provider: string) =>
    provider === LEGACY_ANTIGRAVITY_ACP_KIND ? "antigravity" : provider;
  const uniqueStrings = (values: string[]) => [...new Set(values.map(migrateProvider))];
  // The legacy kind was the ACP chat provider on its own. Rewriting a disable
  // or crossagents pause onto "antigravity" would hide the provider's whole
  // surface — the `agy` CLI included — so those entries are dropped and the
  // adopted chat runtime is disabled below instead.
  const withoutLegacy = (values: string[]) =>
    values.filter((k) => k !== LEGACY_ANTIGRAVITY_ACP_KIND);
  const hadLegacyChatDisable =
    settings.disabledAgents.includes(LEGACY_ANTIGRAVITY_ACP_KIND) ||
    settings.crossagentPausedProviders.includes(LEGACY_ANTIGRAVITY_ACP_KIND) ||
    Object.values(settings.machineSettings).some((entry) =>
      entry.disabledAgents?.includes(LEGACY_ANTIGRAVITY_ACP_KIND),
    );
  const adoptedInstance = settings.agentInstances[ANTIGRAVITY_ACP_REGISTRY_ID];
  const mergeObjects = <T extends object>(legacy: T, current: T): T => ({
    ...legacy,
    ...current,
  });
  const mergeStringArrays = (legacy: string[], current: string[]) => [
    ...new Set([...legacy, ...current]),
  ];
  const machineSettings = Object.fromEntries(
    Object.entries(settings.machineSettings).map(([key, entry]) => [
      key,
      {
        ...entry,
        ...(entry.providerOrder ? { providerOrder: uniqueStrings(entry.providerOrder) } : {}),
        ...(entry.disabledAgents ? { disabledAgents: withoutLegacy(entry.disabledAgents) } : {}),
        ...(entry.hiddenModels
          ? {
              hiddenModels: moveRecordKey(
                entry.hiddenModels,
                LEGACY_ANTIGRAVITY_ACP_KIND,
                "antigravity",
                mergeStringArrays,
              ),
            }
          : {}),
        ...(entry.agentSettings
          ? {
              agentSettings: moveRecordKey(
                entry.agentSettings,
                LEGACY_ANTIGRAVITY_ACP_KIND,
                "antigravity",
                mergeObjects,
              ),
            }
          : {}),
      },
    ]),
  );

  const migrated: SharedSettings = hasLegacySettings
    ? {
        ...settings,
        acpRegistryInstalledAgents: record
          ? {
              ...settings.acpRegistryInstalledAgents,
              [ANTIGRAVITY_ACP_REGISTRY_ID]: {
                ...record,
                adapterKind: "antigravity",
                installKind: "first-class",
              },
            }
          : settings.acpRegistryInstalledAgents,
        providerConfigs: moveRecordKey(
          settings.providerConfigs,
          LEGACY_ANTIGRAVITY_ACP_KIND,
          "antigravity",
          mergeObjects,
        ),
        providerModelPreferences: moveRecordKey(
          settings.providerModelPreferences,
          LEGACY_ANTIGRAVITY_ACP_KIND,
          "antigravity",
          mergeObjects,
        ),
        lastPresentationModeByAgent: moveRecordKey(
          settings.lastPresentationModeByAgent,
          LEGACY_ANTIGRAVITY_ACP_KIND,
          "antigravity",
        ),
        agentSettings: moveRecordKey(
          settings.agentSettings,
          LEGACY_ANTIGRAVITY_ACP_KIND,
          "antigravity",
          mergeObjects,
        ),
        hiddenModels: moveRecordKey(
          settings.hiddenModels,
          LEGACY_ANTIGRAVITY_ACP_KIND,
          "antigravity",
          mergeStringArrays,
        ),
        crossagentHiddenModels: moveRecordKey(
          settings.crossagentHiddenModels,
          LEGACY_ANTIGRAVITY_ACP_KIND,
          "antigravity",
          mergeStringArrays,
        ),
        machineSettings,
        // Disabling the chat provider must not disable the CLI it was adopted
        // into; the chat runtime itself is what the user opted out of.
        disabledAgents: withoutLegacy(settings.disabledAgents),
        providerOrder: uniqueStrings(settings.providerOrder),
        crossagentPausedProviders: withoutLegacy(settings.crossagentPausedProviders),
        agentInstances: adoptedInstance
          ? {
              ...settings.agentInstances,
              [ANTIGRAVITY_ACP_REGISTRY_ID]: hadLegacyChatDisable
                ? { ...adoptedInstance, enabled: false }
                : adoptedInstance,
            }
          : settings.agentInstances,
        // `enabled: false` alone cannot keep the runtime down: the supervisor
        // auto-installs the artifact wherever the CLI is detected, and an
        // install rebuilds the instance enabled. Record the opt-out so a
        // removal-grade opt-out survives the adoption; an explicit install
        // clears it again.
        acpRegistryAutoInstallOptOuts: hadLegacyChatDisable
          ? [...new Set([...settings.acpRegistryAutoInstallOptOuts, ANTIGRAVITY_ACP_REGISTRY_ID])]
          : settings.acpRegistryAutoInstallOptOuts,
        agentHookSupport: migrateHookSupportKeys(settings.agentHookSupport),
        favoriteModels: settings.favoriteModels.map(migrateEntry),
        recentModels: settings.recentModels.map(migrateEntry),
        agentSelectionUsage: settings.agentSelectionUsage.map(migrateEntry),
        crossagentSelectionUsage: settings.crossagentSelectionUsage.map(migrateEntry),
        crossagentRoutingOverrides: settings.crossagentRoutingOverrides.map(migrateEntry),
        commitGenProvider: migrateProvider(settings.commitGenProvider),
        titleGenProvider: migrateProvider(settings.titleGenProvider),
        conflictResolverProvider: migrateProvider(settings.conflictResolverProvider),
        experimentJudgeProvider: migrateProvider(settings.experimentJudgeProvider),
        wslCommitGenProvider: migrateProvider(settings.wslCommitGenProvider),
        wslTitleGenProvider: migrateProvider(settings.wslTitleGenProvider),
        wslConflictResolverProvider: migrateProvider(settings.wslConflictResolverProvider),
      }
    : settings;

  const normalizeConfig = <T extends { model: string; effort?: string | undefined }>(
    config: T,
    acpOrigin = false,
  ): T => {
    const normalized = normalizePersistedAntigravityModelSelection(
      config.model,
      config.effort,
      acpOrigin,
    );
    return normalized.model === config.model ? config : ({ ...config, ...normalized } as T);
  };
  const normalizeModelIds = (models: string[], acpOrigin = false) => [
    ...new Set(
      models.map(
        (model) => normalizePersistedAntigravityModelSelection(model, undefined, acpOrigin).model,
      ),
    ),
  ];
  const normalizePreferences = (
    preferences: Record<string, ProviderModelPreference>,
    currentConfig: { model: string; effort?: string | undefined } | undefined,
    acpOrigin = false,
  ): Record<string, ProviderModelPreference> => {
    const normalized: Record<string, ProviderModelPreference> = {};
    for (const [model, preference] of Object.entries(preferences)) {
      const selection = normalizePersistedAntigravityModelSelection(
        model,
        preference.effort,
        acpOrigin,
      );
      if (selection.model === model) continue;
      normalized[selection.model] = {
        ...normalized[selection.model],
        ...preference,
        ...(selection.effort ? { effort: selection.effort } : {}),
      };
    }
    for (const [model, preference] of Object.entries(preferences)) {
      const selection = normalizePersistedAntigravityModelSelection(
        model,
        preference.effort,
        acpOrigin,
      );
      if (selection.model !== model) continue;
      normalized[model] = { ...normalized[model], ...preference };
    }
    if (currentConfig) {
      const current = normalizePersistedAntigravityModelSelection(
        currentConfig.model,
        currentConfig.effort,
        acpOrigin,
      );
      if (current.model !== currentConfig.model) {
        const currentPreference = preferences[currentConfig.model];
        normalized[current.model] = {
          ...normalized[current.model],
          ...currentPreference,
          ...(current.effort ? { effort: current.effort } : {}),
        };
      }
    }
    return normalized;
  };
  const normalizeSelectionEntry = <
    T extends { agentKind: string; modelId: string; effort?: string | undefined },
  >(
    entry: T,
  ): T => {
    if (entry.agentKind !== "antigravity") return entry;
    const normalized = normalizePersistedAntigravityModelSelection(
      entry.modelId,
      entry.effort,
      "presentationMode" in entry && entry.presentationMode === "gui",
    );
    return normalized.model === entry.modelId
      ? entry
      : ({
          ...entry,
          modelId: normalized.model,
          ...(normalized.effort ? { effort: normalized.effort } : {}),
        } as T);
  };
  const normalizeUtilityModel = (
    provider: string,
    model: string,
    effort: string,
    acpOrigin = false,
  ) => {
    if (provider !== "antigravity") return { model, effort };
    const normalized = normalizePersistedAntigravityModelSelection(model, effort, acpOrigin);
    return { model: normalized.model, effort: normalized.effort ?? effort };
  };
  const commitGen = normalizeUtilityModel(
    migrated.commitGenProvider,
    migrated.commitGenModel,
    migrated.commitGenEffort,
    settings.commitGenProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const titleGen = normalizeUtilityModel(
    migrated.titleGenProvider,
    migrated.titleGenModel,
    migrated.titleGenEffort,
    settings.titleGenProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const conflictResolver = normalizeUtilityModel(
    migrated.conflictResolverProvider,
    migrated.conflictResolverModel,
    migrated.conflictResolverEffort,
    settings.conflictResolverProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const experimentJudge = normalizeUtilityModel(
    migrated.experimentJudgeProvider,
    migrated.experimentJudgeModel,
    migrated.experimentJudgeEffort,
    settings.experimentJudgeProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const wslCommitGen = normalizeUtilityModel(
    migrated.wslCommitGenProvider,
    migrated.wslCommitGenModel,
    migrated.wslCommitGenEffort,
    settings.wslCommitGenProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const wslTitleGen = normalizeUtilityModel(
    migrated.wslTitleGenProvider,
    migrated.wslTitleGenModel,
    migrated.wslTitleGenEffort,
    settings.wslTitleGenProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const wslConflictResolver = normalizeUtilityModel(
    migrated.wslConflictResolverProvider,
    migrated.wslConflictResolverModel,
    migrated.wslConflictResolverEffort,
    settings.wslConflictResolverProvider === LEGACY_ANTIGRAVITY_ACP_KIND,
  );
  const antigravityConfig = migrated.providerConfigs.antigravity;

  const normalized: SharedSettings = {
    ...migrated,
    providerConfigs: antigravityConfig
      ? {
          ...migrated.providerConfigs,
          antigravity: normalizeConfig(antigravityConfig, legacyProviderConfigOnly),
        }
      : migrated.providerConfigs,
    providerModelPreferences: migrated.providerModelPreferences.antigravity
      ? {
          ...migrated.providerModelPreferences,
          antigravity: normalizePreferences(
            migrated.providerModelPreferences.antigravity,
            antigravityConfig,
            legacyProviderPreferencesOnly,
          ),
        }
      : migrated.providerModelPreferences,
    hiddenModels: migrated.hiddenModels.antigravity
      ? {
          ...migrated.hiddenModels,
          antigravity: normalizeModelIds(migrated.hiddenModels.antigravity, legacyHiddenModelsOnly),
        }
      : migrated.hiddenModels,
    crossagentHiddenModels: migrated.crossagentHiddenModels.antigravity
      ? {
          ...migrated.crossagentHiddenModels,
          antigravity: normalizeModelIds(
            migrated.crossagentHiddenModels.antigravity,
            legacyCrossagentHiddenModelsOnly,
          ),
        }
      : migrated.crossagentHiddenModels,
    machineSettings: Object.fromEntries(
      Object.entries(migrated.machineSettings).map(([key, entry]) => [
        key,
        entry.hiddenModels?.antigravity
          ? {
              ...entry,
              hiddenModels: {
                ...entry.hiddenModels,
                antigravity: normalizeModelIds(
                  entry.hiddenModels.antigravity,
                  legacyMachineHiddenModelsOnly.has(key),
                ),
              },
            }
          : entry,
      ]),
    ),
    favoriteModels: migrated.favoriteModels.map(normalizeSelectionEntry),
    recentModels: migrated.recentModels.map(normalizeSelectionEntry),
    agentSelectionUsage: migrated.agentSelectionUsage.map(normalizeSelectionEntry),
    crossagentSelectionUsage: migrated.crossagentSelectionUsage.map(normalizeSelectionEntry),
    crossagentRoutingOverrides: migrated.crossagentRoutingOverrides.map((entry) => {
      if (!entry.modelId || entry.agentKind !== "antigravity") return entry;
      const selection = normalizePersistedAntigravityModelSelection(entry.modelId, entry.effort);
      return selection.model === entry.modelId
        ? entry
        : {
            ...entry,
            modelId: selection.model,
            ...(selection.effort ? { effort: selection.effort } : {}),
          };
    }),
    commitGenModel: commitGen.model,
    commitGenEffort: commitGen.effort,
    titleGenModel: titleGen.model,
    titleGenEffort: titleGen.effort,
    conflictResolverModel: conflictResolver.model,
    conflictResolverEffort: conflictResolver.effort,
    experimentJudgeModel: experimentJudge.model,
    experimentJudgeEffort: experimentJudge.effort,
    wslCommitGenModel: wslCommitGen.model,
    wslCommitGenEffort: wslCommitGen.effort,
    wslTitleGenModel: wslTitleGen.model,
    wslTitleGenEffort: wslTitleGen.effort,
    wslConflictResolverModel: wslConflictResolver.model,
    wslConflictResolverEffort: wslConflictResolver.effort,
  };
  return { settings: normalized, acpAliasMigrated: hasLegacySettings };
}

/**
 * Settings keys `migrateAntigravityAcpAliasState` can rewrite. The
 * supervisor's `persistAcpRegistrySettingsMigrations` overlays exactly these
 * onto the raw file, so the migration and the persist path cannot drift.
 */
export const ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS = [
  "acpRegistryInstalledAgents",
  "providerConfigs",
  "providerModelPreferences",
  "lastPresentationModeByAgent",
  "agentSettings",
  "hiddenModels",
  "crossagentHiddenModels",
  "machineSettings",
  "disabledAgents",
  "providerOrder",
  "crossagentPausedProviders",
  "favoriteModels",
  "recentModels",
  "agentSelectionUsage",
  "crossagentSelectionUsage",
  "crossagentRoutingOverrides",
  "commitGenProvider",
  "titleGenProvider",
  "conflictResolverProvider",
  "experimentJudgeProvider",
  "wslCommitGenProvider",
  "wslTitleGenProvider",
  "wslConflictResolverProvider",
  "agentInstances",
  "acpRegistryAutoInstallOptOuts",
  "agentHookSupport",
] as const satisfies readonly (keyof SharedSettings)[];

export function pickAntigravityAcpAliasMigratedFields(
  settings: SharedSettings,
): Pick<SharedSettings, (typeof ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS)[number]> {
  return Object.fromEntries(
    ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS.map((key) => [key, settings[key]]),
  ) as Pick<SharedSettings, (typeof ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS)[number]>;
}

/**
 * Per-entry tolerant parse of `machineSettings`: entries with unparseable
 * machine keys or malformed values are dropped individually instead of
 * resetting the whole map (which the per-field schema fallback would do).
 */
function normalizeMachineSettings(value: unknown): SharedSettings["machineSettings"] {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) return {};
  const result: SharedSettings["machineSettings"] = {};
  for (const [key, entry] of Object.entries(parsed.data)) {
    if (parseMachineKey(key) === undefined) continue;
    const parsedEntry = machineSettingsEntrySchema.safeParse(entry);
    if (parsedEntry.success) result[key] = parsedEntry.data;
  }
  return result;
}

function normalizeSharedSettingsStateImpl(value: unknown): {
  settings: SharedSettings;
  acpAliasMigrated: boolean;
} {
  const normalized = normalizeObjectFromSchema(
    sharedSettingsSchema.shape,
    defaultSharedSettings,
    value,
  );
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) return { settings: normalized, acpAliasMigrated: false };

  const hasAutomationMode = prAutomationModeSchema.safeParse(
    parsed.data.prAutomationDefault,
  ).success;
  const legacyAutomationMode =
    parsed.data.prAutoMergeDefault === true
      ? "merge"
      : parsed.data.prWatchDefault === true
        ? "fix"
        : "off";
  // Unversioned settings file: migrate the two legacy sleep booleans into
  // the single `preventSleep` enum. An explicit valid value always wins.
  const hasPreventSleep = sharedSettingsSchema.shape.preventSleep.safeParse(
    parsed.data.preventSleep,
  ).success;
  const hasLegacyPreventSleepKeys =
    "preventSleepWhileWorking" in parsed.data || "remoteAccessPreventSleep" in parsed.data;
  const migratedPreventSleep =
    !hasPreventSleep && hasLegacyPreventSleepKeys
      ? parsed.data.remoteAccessPreventSleep === true
        ? ("while-remote-access" as const)
        : ("while-working" as const)
      : normalized.preventSleep;
  const usage = z.record(z.string(), z.unknown()).safeParse(parsed.data.usage);
  const disabledProviders = usage.success
    ? z.array(z.string()).safeParse(usage.data.disabledProviders)
    : undefined;
  return migrateAntigravityAcpAliasState(
    migrateRetiredQwenPreviewModel({
      ...normalized,
      machineSettings: normalizeMachineSettings(parsed.data.machineSettings),
      sidebarShortcutOrder: normalizeSidebarShortcutOrder(normalized.sidebarShortcutOrder),
      threadDocksOrder: normalizeThreadDocksOrder(normalized.threadDocksOrder),
      prAutomationDefault: hasAutomationMode
        ? normalized.prAutomationDefault
        : legacyAutomationMode,
      preventSleep: migratedPreventSleep,
      usage: {
        ...normalized.usage,
        disabledProviders: disabledProviders?.success ? disabledProviders.data : [],
      },
      enabledMcpServers: {
        ...defaultSharedSettings.enabledMcpServers,
        ...normalized.enabledMcpServers,
      },
    }),
  );
}

export function normalizeSharedSettings(value: unknown): SharedSettings {
  return normalizeSharedSettingsState(value).settings;
}

/**
 * `normalizeSharedSettings` plus whether the Antigravity ACP alias migration
 * applied, so the supervisor can decide whether the migrated fields still need
 * to be persisted back to the raw file.
 */
export function normalizeSharedSettingsState(value: unknown): {
  settings: SharedSettings;
  acpAliasMigrated: boolean;
} {
  return normalizeSharedSettingsStateImpl(value);
}
