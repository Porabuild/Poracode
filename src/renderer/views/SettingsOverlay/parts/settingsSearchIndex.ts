import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { SettingsSection } from "./types";

/**
 * Static index of individual settings, powering the sidebar's "Search settings"
 * search (see {@link ./SettingsSidebar}). A static index is required because
 * only the active section component is mounted at a time, so there is no live
 * DOM of other sections to scan.
 *
 * i18n: `title`/`description` are module-level `msg` descriptors whose source
 * text is byte-identical to the existing `t`/`<Trans>` string in the section
 * component, so Lingui reuses the existing catalog translation — no new strings.
 * `settingsSearchIndex.test.ts` asserts every one resolves to a real catalog
 * entry, so a typo fails loudly instead of silently shipping an English string.
 * Descriptions that key with JSX placeholders (`<0>…</0>`) or interpolation
 * (`&nbsp;`, `${…}`, platform ternaries) cannot be reused as a flat literal, so
 * those omit `description` and rely on `keywords` (plain English, never rendered
 * or translated — a search-only recall aid).
 *
 * `anchor` must match the `anchorId` / `data-settings-anchor` on the rendered
 * row so the search can scroll to and highlight it.
 */
export interface SettingsSearchEntry {
  section: SettingsSection;
  /** Stable unique id; must match the row's `anchorId`/`data-settings-anchor`. */
  anchor: string;
  title: MessageDescriptor;
  /** Omitted when the source string can't be reused as a flat literal. */
  description?: MessageDescriptor;
  /** Plain-English search-only synonyms; never rendered or translated. */
  keywords?: string;
  /** Only offered in dev builds (mirrors the sidebar's `isDevApp()` gate). */
  devOnly?: boolean;
  /** Only rendered in the desktop app, not remote/PWA sessions. */
  desktopOnly?: boolean;
  /** Renders only under a runtime/platform condition; the drift test skips it. */
  conditional?: boolean;
}

export const SETTINGS_SEARCH_INDEX: readonly SettingsSearchEntry[] = [
  // General
  {
    section: "general",
    anchor: "general.language",
    title: msg`Language`,
    description: msg`Choose the display language for Poracode's interface.`,
    keywords: "locale display interface translation ui",
  },
  {
    section: "general",
    anchor: "general.commitPrLanguage",
    title: msg`Commit & PR language`,
    description: msg`Language for AI-generated commit messages and pull request summaries. Thread titles always follow the app language.`,
    keywords: "git commit message pull request summary ai",
  },
  {
    section: "general",
    anchor: "general.defaultNewThread",
    title: msg`Default new thread`,
    description: msg`Open new threads as a full page or a side-by-side panel.`,
    keywords: "thread mode full page panel side-by-side layout",
    desktopOnly: true,
  },
  {
    section: "general",
    anchor: "general.homeScope",
    title: msg`Home scope`,
    description: msg`Show a projectless Home scope for OS-level agent sessions.`,
    keywords: "projectless os-level agent session global",
    desktopOnly: true,
  },
  {
    section: "general",
    anchor: "general.preventSleepWhileWorking",
    title: msg`Prevent sleep while working`,
    description: msg`Keep the system awake while any thread is actively working.`,
    keywords: "sleep awake wake idle power system",
    desktopOnly: true,
  },
  {
    section: "general",
    anchor: "general.closeToTray",
    title: msg`Close to tray`,
    description: msg`When you close the window, keep Poracode running in the system tray. Disable to quit on close.`,
    keywords: "tray minimize background quit close window exit",
    desktopOnly: true,
  },
  {
    section: "general",
    anchor: "general.launchAtStartup",
    title: msg`Launch at startup`,
    description: msg`Launch Poracode automatically when you sign in to Windows.`,
    keywords: "autostart auto start login boot sign in windows startup",
    desktopOnly: true,
    conditional: true,
  },
  {
    section: "general",
    anchor: "general.startMinimized",
    title: msg`Start minimized`,
    description: msg`Keep Poracode in the system tray when it launches at startup.`,
    keywords: "minimize hidden tray background login boot windows startup",
    desktopOnly: true,
    conditional: true,
  },
  {
    section: "general",
    anchor: "general.editorLsp",
    title: msg`Editor LSP`,
    description: msg`Enable language server support for type checking, completions, and diagnostics. Requires a language server installed.`,
    keywords: "language server protocol type checking completion diagnostics intellisense",
    desktopOnly: true,
  },

  // Audio
  {
    section: "audio",
    anchor: "audio.showVoiceInputButton",
    title: msg`Show voice input button`,
    description: msg`Show the microphone button in the composer.`,
    keywords: "mic microphone dictation speech composer",
  },
  {
    section: "audio",
    anchor: "audio.microphoneDevice",
    title: msg`Microphone`,
    description: msg`Device used by the composer voice input button.`,
    keywords: "mic input device audio source",
  },
  {
    section: "audio",
    anchor: "audio.testMicrophone",
    title: msg`Test microphone`,
    description: msg`Check the live input level from the selected device.`,
    keywords: "mic check level meter input test",
  },
  {
    section: "audio",
    anchor: "audio.voiceInputLanguage",
    title: msg`Voice input language`,
    description: msg`Language the speech model should expect when transcribing composer dictation.`,
    keywords: "transcription dictation speech locale",
  },
  {
    section: "audio",
    anchor: "audio.voiceInputModel",
    title: msg`Voice input model`,
    description: msg`Fastest uses Whisper tiny; Better uses Whisper base.`,
    keywords: "whisper transcription speech model tiny base quality speed",
  },
  {
    section: "audio",
    anchor: "audio.useWebGpu",
    title: msg`Use WebGPU acceleration`,
    description: msg`Run local transcription on the GPU when available.`,
    keywords: "gpu acceleration hardware transcription performance",
  },

  // Appearance
  {
    section: "appearance",
    anchor: "appearance.mode",
    title: msg`Mode`,
    description: msg`Match your system, or force light or dark.`,
    keywords: "theme light dark appearance system auto color scheme",
  },
  {
    section: "appearance",
    anchor: "appearance.theme",
    title: msg`Theme`,
    description: msg`Popular editor themes adapted to Poracode. Each follows the light or dark mode above.`,
    keywords: "color preset editor theme gallery swatch palette",
  },
  {
    section: "appearance",
    anchor: "appearance.guiChatFontSize",
    title: msg`GUI chat font size`,
    keywords: "text size typography zoom larger smaller readability chat markdown",
  },
  {
    section: "appearance",
    anchor: "appearance.translucentSidebar",
    title: msg`Translucent sidebar`,
    keywords: "transparency blur vibrancy acrylic glass frosted material translucent",
    desktopOnly: true,
  },
  {
    section: "appearance",
    anchor: "appearance.sidebarFrosting",
    title: msg`Sidebar frosting`,
    keywords: "tint glass blur opacity translucency slider acrylic vibrancy",
    desktopOnly: true,
    conditional: true,
  },

  // Terminal
  {
    section: "terminal",
    anchor: "terminal.terminalPosition",
    title: msg`Terminal position`,
    description: msg`Where the terminal panel appears.`,
    keywords: "terminal panel location placement layout bottom right",
    desktopOnly: true,
  },
  {
    section: "terminal",
    anchor: "terminal.autoShowTerminalPanel",
    title: msg`Auto-show terminal panel`,
    description: msg`Automatically show the terminal panel when running commands or creating worktrees.`,
    keywords: "auto open reveal terminal panel commands worktree automatic",
    desktopOnly: true,
  },
  {
    section: "terminal",
    anchor: "terminal.collapseTerminalComposer",
    title: msg`Collapse terminal composer`,
    description: msg`Start the composer collapsed in terminal-native threads. A collapsed composer routes browser element picks straight to the terminal.`,
    keywords: "collapse composer terminal-native threads input minimize",
  },
  {
    section: "terminal",
    anchor: "terminal.cliPickerTarget",
    title: msg`Browser pick target (CLI threads)`,
    description: msg`Where a browser element-picker selection goes in terminal-native threads. A collapsed composer always routes to the terminal.`,
    keywords: "browser pick target cli element picker selection terminal",
    desktopOnly: true,
  },
  {
    section: "terminal",
    anchor: "terminal.agentTerminalFontSize",
    title: msg`Agent terminal font size`,
    description: msg`Base font size for agent terminals. Auto-shrinks in narrow or short panes.`,
    keywords: "agent terminal font size text scale zoom",
  },
  {
    section: "terminal",
    anchor: "terminal.terminalPanelFontSize",
    title: msg`Terminal panel font size`,
    description: msg`Base font size for the terminal panel. Auto-shrinks in narrow or short panes.`,
    keywords: "terminal panel font size text scale zoom",
  },
  {
    section: "terminal",
    anchor: "terminal.scrollSpeed",
    title: msg`Terminal scroll speed`,
    description: msg`Scroll speed multiplier for the terminal scrollback buffer.`,
    keywords: "scroll speed multiplier wheel scrollback terminal",
  },

  // Threads
  {
    section: "threads",
    anchor: "threads.unloadIdleThreadsAfter",
    title: msg`Unload idle threads after`,
    description: msg`Hidden resumable threads are swept every 5 minutes and unloaded after this idle age.`,
    keywords: "unload idle thread memory sweep stale resumable minutes",
    desktopOnly: true,
  },
  {
    section: "threads",
    anchor: "threads.autoArchiveDoneAfter",
    title: msg`Auto-archive done threads after`,
    description: msg`Threads marked done that have not been touched for this many days are archived automatically on app launch. Set to 0 to disable.`,
    keywords: "auto archive done complete days cleanup launch",
    desktopOnly: true,
  },
  {
    section: "threads",
    anchor: "threads.defaultThreadRemoval",
    title: msg`Default thread removal`,
    description: msg`Action for the quick-remove button on sidebar threads.`,
    keywords: "default thread removal delete archive quick remove sidebar",
    desktopOnly: true,
  },

  // Git
  {
    section: "git",
    anchor: "git.gitReviewMode",
    title: msg`Git review mode`,
    description: msg`Open git review as a right-side panel or a full page.`,
    keywords: "diff code review panel page layout",
    desktopOnly: true,
  },
  {
    section: "git",
    anchor: "git.defaultCreatePrAction",
    title: msg`Default Create PR action`,
    description: msg`What the Create PR button does by default: open a dialog to edit the title and description first, or auto-generate them and create the PR in one click. You can also switch this from the button's menu.`,
    keywords: "pull request github create open dialog auto-generate",
  },

  // Worktrees
  {
    section: "worktrees",
    anchor: "worktrees.storageLocation",
    title: msg`Storage location`,
    description: msg`Use one global folder, or nest worktrees inside each project at .poracode/worktrees.`,
    keywords: "worktree storage mode global per-project nested location",
  },
  {
    section: "worktrees",
    anchor: "worktrees.baseFolder",
    title: msg`Base folder`,
    description: msg`Folder that holds all worktrees. Tip: a Dev Drive here speeds up builds.`,
    keywords: "worktree base folder directory path root dev drive global",
    conditional: true,
  },
  {
    section: "worktrees",
    anchor: "worktrees.wslBaseFolder",
    title: msg`WSL base folder`,
    description: msg`Worktree root for WSL projects (a Linux path).`,
    keywords: "wsl linux worktree base folder directory path root",
    conditional: true,
  },

  // Notifications
  {
    section: "notifications",
    anchor: "notifications.enableNotifications",
    title: msg`Enable notifications`,
    description: msg`Show notifications when thread status changes.`,
    keywords: "alerts toggle on off",
  },
  {
    section: "notifications",
    anchor: "notifications.playNotificationSound",
    title: msg`Play notification sound`,
    description: msg`Play a sound when a notification is shown.`,
    keywords: "audio chime beep mute",
    conditional: true,
  },
  {
    section: "notifications",
    anchor: "notifications.showNotifications",
    title: msg`Show notifications`,
    description: msg`When to display in-app toasts for visible threads.`,
    keywords: "toast filter unfocused always when display",
    conditional: true,
  },
  {
    section: "notifications",
    anchor: "notifications.notifyDone",
    title: msg`Done`,
    description: msg`Thread finished or waiting for your input.`,
    keywords: "complete finished notify me about thread",
    conditional: true,
  },
  {
    section: "notifications",
    anchor: "notifications.notifyNeedsAttention",
    title: msg`Needs Attention`,
    description: msg`Approval or reply required from you.`,
    keywords: "approval reply required input notify me about",
    conditional: true,
  },
  {
    section: "notifications",
    anchor: "notifications.notifyError",
    title: msg`Error`,
    description: msg`Agent encountered an error.`,
    keywords: "failure failed problem notify me about agent",
    conditional: true,
  },
  {
    section: "notifications",
    anchor: "notifications.notifyL2Cli",
    title: msg`Notify for L2 CLI threads`,
    keywords: "terminal osc fallback hook plugin suppress cli l2",
    desktopOnly: true,
    conditional: true,
  },

  // AI
  {
    section: "ai",
    anchor: "ai.titleGeneration",
    title: msg`Title Generation`,
    description: msg`Generates short titles for new threads.`,
    keywords: "thread name auto naming summary one-shot",
  },
  {
    section: "ai",
    anchor: "ai.commitMessageGeneration",
    title: msg`Commit Message Generation`,
    description: msg`Generates commit messages from staged changes.`,
    keywords: "git commit message staged diff auto write one-shot",
  },
  {
    section: "ai",
    anchor: "ai.conflictResolver",
    title: msg`Conflict Resolver`,
    description: msg`Resolves merge conflicts during rebase or merge.`,
    keywords: "merge conflict rebase resolve git fix",
  },

  // Search
  {
    section: "search",
    anchor: "search.useIgnoreFiles",
    title: msg`Use ignore files`,
    keywords: "gitignore respect ignored files search exclude",
  },
  {
    section: "search",
    anchor: "search.excludePatterns",
    title: msg`Exclude patterns`,
    description: msg`Files matching these globs are hidden from the @file mention search.`,
    keywords: "glob hide ignore file mention exclude pattern filter",
  },

  // Browser
  {
    section: "browser",
    anchor: "browser.linkOpenTarget",
    title: msg`Open links in`,
    description: msg`Choose whether links from Poracode and browser popups stay in Poracode or open externally.`,
    keywords: "open links target app system external default browser",
    desktopOnly: true,
  },
  {
    section: "browser",
    anchor: "browser.linkPresentationMode",
    title: msg`Show opened links in`,
    description: msg`When links open in a Poracode browser tab, choose where the browser is revealed.`,
    keywords: "presentation panel overlay fullscreen reveal browser tab layout",
    desktopOnly: true,
  },
  {
    section: "browser",
    anchor: "browser.allowEval",
    title: msg`Allow eval`,
    keywords: "eval javascript execute run code arbitrary agent security",
    desktopOnly: true,
  },
  {
    section: "browser",
    anchor: "browser.allowDataAccess",
    title: msg`Allow agents to read/write cookies and storage`,
    keywords: "cookies storage localstorage session tokens auth data access read write agent",
    desktopOnly: true,
  },

  // Usage
  {
    section: "usage",
    anchor: "usage.autoRefreshMinutes",
    title: msg`Default auto-refresh (minutes)`,
    description: msg`The default background refresh cadence, used for any provider without its own interval set below. Set to 0 to turn off (manual only). The 2-minute floor respects provider rate limits.`,
    keywords:
      "automatic update poll interval background fetch refresh frequency default per provider",
    desktopOnly: true,
  },
  {
    section: "usage",
    anchor: "usage.showInSidebar",
    title: msg`Show circles in sidebar`,
    description: msg`Show compact per-provider usage rings in the sidebar. Hide individual providers' circles in the list below.`,
    keywords: "rings circle indicators usage gauge sidebar compact hide per provider",
  },
  {
    section: "usage",
    anchor: "usage.showEstimatedCost",
    title: msg`Show estimated cost`,
    description: msg`Reconstructed from local logs at public API rates — it does not reflect your real bill on subscription plans. Shown only in the usage panel.`,
    keywords: "price spending money dollars estimate billing cost",
  },

  // Agents · General
  {
    section: "agentsGeneral",
    anchor: "agentsGeneral.visibleModels",
    title: msg`Visible models`,
    keywords: "show hide model picker providers toggle filter",
    conditional: true,
  },
  {
    section: "agentsGeneral",
    anchor: "agentsGeneral.modelOrder",
    title: msg`Model order`,
    description: msg`Drag to reorder how providers appear in the model picker.`,
    keywords: "reorder rearrange sort providers drag model picker sequence position",
    conditional: true,
  },
  {
    section: "agentsGeneral",
    anchor: "agentsGeneral.subagentRoutingGuide",
    title: msg`Subagent routing guide`,
    description: msg`Instructions agents follow when choosing which agent or model to delegate to.`,
    keywords: "subagent subagents routing delegate delegation guide instructions spawn agent model",
  },

  // Dev (only in dev builds)
  {
    section: "dev",
    anchor: "dev.disableCliHookPlugin",
    title: msg`Disable CLI hook plugin (L1)`,
    description: msg`Drops incoming hook envelopes on the supervisor so agents fall back to L2 (OSC 9;4 progress) without touching install or iTerm2 notifications. Takes effect on the next hook event — no restart needed.`,
    keywords: "cli hook plugin supervisor l1 l2 osc progress envelope iterm2 fallback",
    devOnly: true,
  },
];

export interface SettingsSearchResult {
  section: SettingsSection;
  anchor: string;
  /** Localized setting title (always shown). */
  title: string;
  /**
   * Truncated localized description to show as the matched-text line, set only
   * when the match was in the description/keywords (not the title). Mirrors the
   * target UX where a description-only hit surfaces the description snippet.
   */
  snippet: string | null;
}

type Translate = (descriptor: MessageDescriptor) => string;

const SNIPPET_MAX = 64;

function truncate(text: string, max = SNIPPET_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

/**
 * Match `query` against the index. Case-insensitive substring over the localized
 * title, then description, then English `keywords` — same semantics as the
 * sidebar's existing section-label filter. Returns `[]` for a blank query.
 */
export function searchSettings(
  query: string,
  t: Translate,
  opts?: { devMode?: boolean; remoteSession?: boolean; index?: readonly SettingsSearchEntry[] },
): SettingsSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const index = opts?.index ?? SETTINGS_SEARCH_INDEX;
  const results: SettingsSearchResult[] = [];
  for (const entry of index) {
    if (entry.devOnly && !opts?.devMode) continue;
    if (entry.desktopOnly && opts?.remoteSession) continue;
    const title = t(entry.title);
    const description = entry.description ? t(entry.description) : "";
    const titleMatch = title.toLowerCase().includes(needle);
    const descMatch = description !== "" && description.toLowerCase().includes(needle);
    const keywordMatch =
      entry.keywords !== undefined && entry.keywords.toLowerCase().includes(needle);
    if (!titleMatch && !descMatch && !keywordMatch) continue;
    results.push({
      section: entry.section,
      anchor: entry.anchor,
      title,
      snippet: titleMatch || description === "" ? null : truncate(description),
    });
  }
  return results;
}
