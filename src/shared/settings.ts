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
  workspaceListSchema,
} from "./contracts";
import { DEFAULT_SEARCH_EXCLUDE } from "./searchExclude";
import { AI_LANGUAGE_VALUES, LOCALE_SETTING_VALUES } from "./locale";

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

export const MAX_CROSSAGENT_ROUTING_OVERRIDES = 100;
export const MAX_CROSSAGENT_SELECTION_VALUE_LENGTH = 256;

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

export function normalizeSidebarShortcutOrder(
  order: readonly SidebarShortcutId[],
): SidebarShortcutId[] {
  const normalized = [...new Set(order)];
  for (const id of SIDEBAR_SHORTCUT_IDS) {
    if (!normalized.includes(id)) normalized.push(id);
  }
  return normalized;
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
  /** User-registered agent instances, currently used by generic ACP registry installs. */
  agentInstances: agentInstanceConfigMapSchema,
  /** When true, the composer in terminal-native threads starts collapsed. */
  collapseTerminalComposer: z.boolean(),
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
  /** Prevent OS sleep while any thread is actively working. */
  preventSleepWhileWorking: z.boolean(),
  /** Prevent OS sleep while the desktop remote access server is enabled. */
  remoteAccessPreventSleep: z.boolean(),
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

/** Browser element-picker delivery target for terminal-native (CLI) threads. */
export type CliPickerTarget = SharedSettings["cliPickerTarget"];

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
  hiddenModels: {},
  disabledAgents: [],
  providerOrder: [],
  acpRegistryInstalledAgents: {},
  agentInstances: {},
  collapseTerminalComposer: false,
  cliPickerTarget: "ask",
  staleThreadUnloadMinutes: 60,
  autoArchiveDoneAfterDays: 3,
  scrollSpeed: 2,
  agentTerminalFontSize: 12,
  guiChatFontSize: 13,
  terminalPanelFontSize: 12,
  preventSleepWhileWorking: true,
  remoteAccessPreventSleep: true,
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
  disableCliHookPlugin: false,
  dismissedHookInstallProposals: {},
  agentHookSupport: {},
  enabledMcpServers: { crossagents: true },
  mcpServers: [],
  disabledBuiltInMcpServers: {},
  disabledBuiltInMcpTools: {},
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

export function normalizeSharedSettings(value: unknown): SharedSettings {
  const normalized = normalizeObjectFromSchema(
    sharedSettingsSchema.shape,
    defaultSharedSettings,
    value,
  );
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) return normalized;

  const hasAutomationMode = prAutomationModeSchema.safeParse(
    parsed.data.prAutomationDefault,
  ).success;
  const legacyAutomationMode =
    parsed.data.prAutoMergeDefault === true
      ? "merge"
      : parsed.data.prWatchDefault === true
        ? "fix"
        : "off";
  const usage = z.record(z.string(), z.unknown()).safeParse(parsed.data.usage);
  const disabledProviders = usage.success
    ? z.array(z.string()).safeParse(usage.data.disabledProviders)
    : undefined;
  return {
    ...normalized,
    sidebarShortcutOrder: normalizeSidebarShortcutOrder(normalized.sidebarShortcutOrder),
    prAutomationDefault: hasAutomationMode ? normalized.prAutomationDefault : legacyAutomationMode,
    usage: {
      ...normalized.usage,
      disabledProviders: disabledProviders?.success ? disabledProviders.data : [],
    },
    enabledMcpServers: {
      ...defaultSharedSettings.enabledMcpServers,
      ...normalized.enabledMcpServers,
    },
  };
}
