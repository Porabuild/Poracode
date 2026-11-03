import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  AppWindow,
  CalendarClock,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Globe,
  Import,
  Layers,
  Mic,
  MonitorCog,
  Network,
  Palette,
  Plug,
  Puzzle,
  Smartphone,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ProfileCoreStats } from "@/shared/contracts";
import type { BuiltInMcpServerId } from "@/shared/contracts/mcpServer";
import type { DiscoverableFeatureId, FeatureSignal } from "@/shared/featureDiscovery";
import type { SIDEBAR_SHORTCUT_IDS } from "@/shared/settings";
import { useAppStore } from "@/renderer/state/appStore";
import type { SettingsSection } from "@/renderer/views/SettingsOverlay/parts/types";
import { openMcpServersSettings } from "@/renderer/actions/panelActions";
import { openSettingsSection, runAppCommand } from "./newsActions";

/** What the discovery rules can see. Built fresh for each new-thread visit. */
export interface FeatureContext {
  /** A generic signal was recorded on this device (see featureUsageTracking). */
  seen: (signal: FeatureSignal) => boolean;
  stats: ProfileCoreStats | null;
  /** Agents called this built-in MCP server (provider-visible server name). */
  usedMcp: (serverName: string) => boolean;
  savedCrews: number;
  threadsWithCrew: boolean;
  threadsInWorktree: boolean;
  threadsWithPullRequest: boolean;
  /** Saved schedules, or null while unknown. */
  schedules: number | null;
  mcpServers: number;
  installedPlugins: number;
  customThemes: number;
  workspaces: number;
  remoteAccessEnabled: boolean;
  remoteServers: number;
  /** Installed and signed-in agents. */
  readyAgents: number;
  /** A local desktop host (not a paired browser client). */
  desktopHost: boolean;
}

/**
 * Product surfaces a feature entry covers. The catalog test requires every
 * Settings section, sidebar shortcut, and built-in MCP server to be covered
 * by a feature or listed in {@link NOT_PROMOTED}, so a new surface cannot ship
 * without a decision about promoting it.
 */
export type CoverageKey =
  | `settings:${SettingsSection}`
  | `sidebar:${(typeof SIDEBAR_SHORTCUT_IDS)[number]}`
  | `mcp:${BuiltInMcpServerId}`;

export interface DiscoverableFeature {
  id: DiscoverableFeatureId;
  covers: readonly CoverageKey[];
  icon: LucideIcon;
  /** One short sentence: the benefit, not the feature name alone. */
  pitch: MessageDescriptor;
  action: MessageDescriptor;
  open: () => void;
  /** Used, or at least opened, so there is nothing left to promote. */
  isUsed: (context: FeatureContext) => boolean;
  /** Worth suggesting in this setup; defaults to always. */
  isRelevant?: (context: FeatureContext) => boolean;
}

export const FEATURE_CATALOG: readonly DiscoverableFeature[] = [
  {
    id: "crews",
    covers: ["settings:crews"],
    icon: Users,
    pitch: msg`Let several agents split one task with a crew`,
    action: msg`Try a crew`,
    open: () => openSettingsSection("crews"),
    isUsed: (c) => c.savedCrews > 0 || c.threadsWithCrew || c.seen("settings:crews"),
    isRelevant: (c) => c.readyAgents >= 2,
  },
  {
    id: "chrome-extension",
    covers: ["mcp:chrome"],
    icon: Globe,
    pitch: msg`Let agents work in your real Chrome with the Poracode extension`,
    action: msg`Get the extension`,
    open: () => openSettingsSection("plugins"),
    isUsed: (c) => c.usedMcp("chrome"),
    isRelevant: (c) => c.desktopHost,
  },
  {
    id: "computer-use",
    covers: ["mcp:computer-use"],
    icon: MonitorCog,
    pitch: msg`Let agents use desktop apps in the background with Computer Use`,
    action: msg`Set it up`,
    open: openMcpServersSettings,
    isUsed: (c) => c.usedMcp("computer_use"),
    isRelevant: (c) => c.desktopHost,
  },
  {
    id: "browser",
    covers: ["mcp:browser", "settings:browser"],
    icon: AppWindow,
    pitch: msg`Test web apps with agents in the built-in browser`,
    action: msg`Open the browser`,
    open: () => runAppCommand("browser.toggle"),
    isUsed: (c) =>
      c.usedMcp("browser") || c.seen("panel:browser") || c.seen("command:browser.toggle"),
  },
  {
    id: "crossagents",
    covers: ["mcp:crossagents"],
    icon: Network,
    pitch: msg`Have one agent hand work to another with Crossagents`,
    action: msg`See how`,
    open: openMcpServersSettings,
    isUsed: (c) => (c.stats?.insights.subagentRuns ?? 0) > 0 || c.usedMcp("crossagents"),
    isRelevant: (c) => c.readyAgents >= 2,
  },
  {
    id: "worktrees",
    covers: ["settings:worktrees"],
    icon: GitBranch,
    pitch: msg`Give each thread its own worktree so agents never collide`,
    action: msg`Set it up`,
    open: () => openSettingsSection("worktrees"),
    isUsed: (c) => c.threadsInWorktree || c.seen("settings:worktrees"),
  },
  {
    id: "schedules",
    covers: ["sidebar:schedules"],
    icon: CalendarClock,
    pitch: msg`Run agents on a schedule, like a nightly test fix`,
    action: msg`Create a schedule`,
    open: () => useAppStore.getState().openSchedules(),
    isUsed: (c) => (c.schedules ?? 0) > 0 || c.seen("view:schedules"),
  },
  {
    id: "pull-requests",
    covers: ["sidebar:pullRequests"],
    icon: GitPullRequest,
    pitch: msg`Review and merge pull requests without leaving Poracode`,
    action: msg`Open pull requests`,
    open: () => useAppStore.getState().openPullRequests(),
    isUsed: (c) => c.threadsWithPullRequest || c.seen("view:pullRequests"),
  },
  {
    id: "skills",
    covers: ["settings:skills"],
    icon: Sparkles,
    pitch: msg`Teach your agents reusable procedures with skills`,
    action: msg`Browse skills`,
    open: () => openSettingsSection("skills"),
    isUsed: (c) => (c.stats?.insights.skillsExplored ?? 0) > 0 || c.seen("settings:skills"),
  },
  {
    id: "mcp-servers",
    covers: ["settings:mcpServers"],
    icon: Plug,
    pitch: msg`Connect agents to your own tools with MCP servers`,
    action: msg`Add a server`,
    open: openMcpServersSettings,
    isUsed: (c) => c.mcpServers > 0 || c.seen("settings:mcpServers"),
  },
  {
    id: "plugins",
    covers: ["settings:plugins"],
    icon: Puzzle,
    pitch: msg`Extend Poracode with plugins`,
    action: msg`Browse plugins`,
    open: () => openSettingsSection("plugins"),
    isUsed: (c) => c.installedPlugins > 0 || c.seen("settings:plugins"),
  },
  {
    id: "custom-themes",
    covers: ["settings:appearance"],
    icon: Palette,
    pitch: msg`Make Poracode yours with a custom theme`,
    action: msg`Create a theme`,
    open: () => openSettingsSection("appearance"),
    isUsed: (c) => c.customThemes > 0,
  },
  {
    id: "remote-access",
    covers: ["settings:remoteAccess", "settings:remoteServers"],
    icon: Smartphone,
    pitch: msg`Check on your agents from your phone`,
    action: msg`Pair a phone`,
    open: () => openSettingsSection("remoteAccess"),
    isUsed: (c) => c.remoteAccessEnabled || c.remoteServers > 0 || c.seen("settings:remoteAccess"),
    isRelevant: (c) => c.desktopHost,
  },
  {
    id: "session-import",
    covers: ["settings:import"],
    icon: Import,
    pitch: msg`Bring your existing CLI agent conversations into Poracode`,
    action: msg`Import`,
    open: () => openSettingsSection("import"),
    isUsed: (c) => c.seen("settings:import"),
    isRelevant: (c) => c.desktopHost,
  },
  {
    id: "workspaces",
    covers: ["settings:workspaces"],
    icon: Layers,
    pitch: msg`Group projects into workspaces, like work and side projects`,
    action: msg`Create a workspace`,
    open: () => openSettingsSection("workspaces"),
    isUsed: (c) => c.workspaces > 0 || c.seen("settings:workspaces"),
  },
  {
    id: "ai-git",
    covers: ["settings:git"],
    icon: GitCommitHorizontal,
    pitch: msg`Let an agent write your commit message and pull request`,
    action: msg`Open Git`,
    open: () => runAppCommand("git.open"),
    isUsed: (c) => (c.stats?.aiActions ?? []).some((action) => action.count > 0),
  },
  {
    id: "voice-input",
    covers: ["settings:audio"],
    icon: Mic,
    pitch: msg`Dictate prompts instead of typing them`,
    action: msg`Set up voice`,
    open: () => openSettingsSection("audio"),
    isUsed: (c) => c.seen("command:composer.start-dictation") || c.seen("settings:audio"),
  },
];

/**
 * Surfaces deliberately not promoted, with the reason. Adding a Settings
 * section, sidebar shortcut, or built-in MCP server requires an entry here or
 * a catalog feature that covers it.
 */
export const NOT_PROMOTED: Readonly<Partial<Record<CoverageKey, string>>> = {
  "settings:profile": "Activity insights already link to Profile",
  "settings:general": "Preferences, not a feature",
  "settings:terminal": "Preferences, not a feature",
  "settings:threads": "Preferences, not a feature",
  "settings:notifications": "Preferences, not a feature",
  "settings:ai": "AI helper preferences, not a feature",
  "settings:acpRegistry": "Reached while adding agents",
  "settings:agentsGeneral": "Agent preferences, not a feature",
  "settings:agents": "Every user sets up agents during onboarding",
  "settings:search": "Preferences, not a feature",
  "settings:shortcuts": "Keyboard tips promote shortcuts",
  "settings:usage": "Usage-limit items link to Usage",
  "settings:archived": "Housekeeping, not a feature",
  "settings:changelog": "Changelog highlights cover release notes",
  "settings:about": "Not a feature",
  "settings:dev": "Development builds only",
  "sidebar:githubActions": "Niche and hidden by default",
  "mcp:app-controls": "Always on; agents use it without setup",
};

/** The catalog entry for a feature id; undefined for ids this app does not know. */
export function findFeature(id: string): DiscoverableFeature | undefined {
  return FEATURE_CATALOG.find((feature) => feature.id === id);
}
