import { z } from "zod";
import {
  agentInstanceConfigMapSchema,
  installedAcpRegistryAgentSchema,
  gitReviewModeSchema,
  newThreadModeSchema,
  notificationFilterSchema,
  providerDraftConfigSchema,
  terminalPositionSchema,
  themeModeSchema,
  threadPresentationModeSchema,
  threadRemoveActionSchema,
} from "./contracts";
import { DEFAULT_SEARCH_EXCLUDE } from "./searchExclude";

const modelPickerEntrySchema = z.object({
  agentKind: z.string().min(1),
  modelId: z.string().min(1),
  presentationMode: threadPresentationModeSchema.default("terminal"),
});

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

export const sharedSettingsSchema = z.object({
  themeMode: themeModeSchema,
  terminalPosition: terminalPositionSchema,
  commitGenProvider: z.string(),
  commitGenModel: z.string(),
  commitGenEffort: z.string(),
  titleGenProvider: z.string(),
  titleGenModel: z.string(),
  titleGenEffort: z.string(),
  conflictResolverProvider: z.string(),
  conflictResolverModel: z.string(),
  conflictResolverEffort: z.string(),
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
  wslTitleGenProvider: z.string(),
  wslTitleGenModel: z.string(),
  wslTitleGenEffort: z.string(),
  wslConflictResolverProvider: z.string(),
  wslConflictResolverModel: z.string(),
  wslConflictResolverEffort: z.string(),
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
  /**
   * When true, closing the main window hides Lightcode to the system tray
   * instead of quitting. The tray icon's Quit action (or Quit from the app
   * menu) still exits the process.
   */
  closeToTray: z.boolean(),
  /** Default action for the thread remove button: archive or delete permanently. */
  threadRemoveAction: threadRemoveActionSchema,
  /** Default new-thread behaviour: full page or side-by-side panel. */
  newThreadMode: newThreadModeSchema,
  /** Show the projectless Home scope for OS-level agent sessions. */
  homeScopeEnabled: z.boolean(),
  /** Automatically show the terminal panel when running commands or creating worktrees. */
  autoShowTerminalPanel: z.boolean(),
  /** Open git review as a right-side panel or a full page overlay. */
  gitReviewMode: gitReviewModeSchema,
  /** Per-provider last-used draft config (model, effort, mode, etc.). App-wide. */
  providerConfigs: z.record(z.string(), providerDraftConfigSchema),
  /**
   * Per-provider last-picked thread presentation mode (terminal vs gui chat).
   * Read by ThreadDraftView so a provider that supports both modes remembers
   * the user's previous choice.
   */
  lastPresentationModeByAgent: z.record(z.string(), threadPresentationModeSchema),
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
  /** User-starred (provider, presentation, model) entries surfaced at the top of the model picker. */
  favoriteModels: z.array(modelPickerEntrySchema),
  /**
   * Most-recent (provider, presentation, model) launches for the model picker. Newest first; the menu
   * caps to 5 entries that aren't already in `favoriteModels`.
   */
  recentModels: z.array(modelPickerEntrySchema),
  /**
   * Dev-only: force agents off the CLI hook plugin path (L1) so they fall back
   * to L2 terminal parsing. The UI toggle is only visible in the dev build;
   * the field is always present so the supervisor can read it unconditionally.
   */
  disableCliHookPlugin: z.boolean(),
  /** Per-agent CLI hook plugin support cache. Keyed by AgentKind (and WSL distro when applicable). */
  agentHookSupport: z.record(z.string(), agentHookSupportEntrySchema),
  /**
   * In-app browser panel + agent MCP bridge settings. Per-thread MCP opt-in
   * is controlled via the composer "+" menu (sets `thread.config.browserMcp`),
   * not a global toggle.
   */
  browser: browserSettingsSchema,
});
export type SharedSettings = z.infer<typeof sharedSettingsSchema>;

/**
 * Settings as written by the renderer / IPC consumer. Excludes
 * supervisor-only fields (`agentHookSupport`) that the renderer never
 * manages and that the main process re-merges from disk on write.
 */
export type SharedSettingsInput = Omit<SharedSettings, "agentHookSupport">;

export const defaultSharedSettings: SharedSettings = {
  themeMode: "dark",
  terminalPosition: "bottom",
  commitGenProvider: "auto",
  commitGenModel: "",
  commitGenEffort: "",
  titleGenProvider: "auto",
  titleGenModel: "",
  titleGenEffort: "",
  conflictResolverProvider: "auto",
  conflictResolverModel: "",
  conflictResolverEffort: "",
  conflictResolverPresentationMode: "gui",
  wslCommitGenProvider: "auto",
  wslCommitGenModel: "",
  wslCommitGenEffort: "",
  wslTitleGenProvider: "auto",
  wslTitleGenModel: "",
  wslTitleGenEffort: "",
  wslConflictResolverProvider: "auto",
  wslConflictResolverModel: "",
  wslConflictResolverEffort: "",
  wslConflictResolverPresentationMode: "gui",
  agentSettings: {},
  hiddenModels: {},
  disabledAgents: [],
  providerOrder: [],
  acpRegistryInstalledAgents: {},
  agentInstances: {},
  collapseTerminalComposer: false,
  staleThreadUnloadMinutes: 60,
  autoArchiveDoneAfterDays: 7,
  scrollSpeed: 2,
  agentTerminalFontSize: 12,
  guiChatFontSize: 13,
  terminalPanelFontSize: 12,
  preventSleepWhileWorking: true,
  closeToTray: true,
  threadRemoveAction: "archive",
  newThreadMode: "page",
  homeScopeEnabled: true,
  autoShowTerminalPanel: true,
  gitReviewMode: "panel",
  providerConfigs: {},
  lastPresentationModeByAgent: {},
  editorLspEnabled: false,
  searchUseIgnoreFiles: true,
  searchExclude: { ...DEFAULT_SEARCH_EXCLUDE },
  notificationsEnabled: true,
  notificationSound: true,
  notificationFilter: "unfocused",
  notificationStatuses: { done: true, needsAttention: true, error: true },
  notifyL2Cli: true,
  favoriteModels: [],
  recentModels: [],
  disableCliHookPlugin: false,
  agentHookSupport: {},
  browser: {
    allowEval: false,
    allowDataAccess: false,
    linkOpenTarget: "internal",
    linkPresentationMode: "panel",
  },
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
  return normalizeObjectFromSchema(sharedSettingsSchema.shape, defaultSharedSettings, value);
}
