import {
  Archive,
  Bell,
  Bot,
  Boxes,
  Box,
  Cable,
  Download,
  FlaskConical,
  FolderGit2,
  Gauge,
  GitFork,
  Globe,
  Info,
  Keyboard,
  Layers,
  Megaphone,
  Mic,
  MessageSquare,
  Palette,
  Puzzle,
  QrCode,
  Search,
  Server,
  Settings2,
  Sparkles,
  TerminalSquare,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { isDevApp, isRemoteSession } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import type { SettingsSection } from "./types";

export interface SettingsDestination {
  id: SettingsSection;
  icon: ReactNode;
  label: string;
}

// Sections that only make sense on the desktop app; the remote (PWA) client
// hides them and instead surfaces "Models" in place of the Agents tree. Single
// source of truth for both the collapsed icon rail and the expanded list.
const DESKTOP_ONLY_SECTIONS = new Set<SettingsSection>([
  "audio",
  "search",
  "threads",
  "shortcuts",
  "remoteAccess",
  "remoteServers",
  "agents",
  "skills",
  "mcpServers",
  "plugins",
  "browser",
  "archived",
  "about",
]);

/** Whether this client shows `id`; the sidebar and every settings search share it. */
export function isSettingsSectionVisible(id: SettingsSection, remoteSession: boolean): boolean {
  return (
    (id !== "remoteAccess" || hasClientCapability("localBackend")) &&
    (!remoteSession ||
      !DESKTOP_ONLY_SECTIONS.has(id) ||
      (id === "remoteServers" && hasClientCapability("manageRemoteEnvironments")))
  );
}

export function useSettingsNavigation() {
  const { t } = useLingui();
  const devMode = isDevApp();
  const remoteSession = isRemoteSession();
  const isSectionVisible = (id: SettingsSection) => isSettingsSectionVisible(id, remoteSession);

  // Grouped section model — single source of truth for sidebar order in both
  // the expanded list (with group headers) and the collapsed icon rail. The
  // "agents" group is special: its first row is the expandable agents tree
  // (the "Models" stand-in on remote), followed by its plain sections.
  const sectionGroups: { id: string; label: string; sections: SettingsDestination[] }[] = [
    {
      id: "personal",
      label: t`Personal`,
      sections: [
        { id: "profile", icon: <UserRound className="size-4" />, label: t`Profile` },
        { id: "workspaces", icon: <Layers className="size-4" />, label: t`Workspaces` },
        { id: "general", icon: <Settings2 className="size-4" />, label: t`General` },
        { id: "appearance", icon: <Palette className="size-4" />, label: t`Appearance` },
        { id: "audio", icon: <Mic className="size-4" />, label: t`Audio` },
        { id: "notifications", icon: <Bell className="size-4" />, label: t`Notifications` },
        { id: "shortcuts", icon: <Keyboard className="size-4" />, label: t`Shortcuts` },
      ],
    },
    {
      id: "workspace",
      label: t`Workspace`,
      sections: [
        { id: "terminal", icon: <TerminalSquare className="size-4" />, label: t`Terminal` },
        { id: "threads", icon: <MessageSquare className="size-4" />, label: t`Threads` },
        { id: "git", icon: <GitFork className="size-4" />, label: t`Git` },
        { id: "worktrees", icon: <FolderGit2 className="size-4" />, label: t`Worktrees` },
        { id: "search", icon: <Search className="size-4" />, label: t`Search` },
        { id: "browser", icon: <Globe className="size-4" />, label: t`Browser` },
        { id: "archived", icon: <Archive className="size-4" />, label: t`Archived Threads` },
      ],
    },
    {
      id: "agents",
      label: t`Agents`,
      sections: [
        {
          id: "ai",
          icon: <Sparkles className="size-4" />,
          label: t({
            message: "AI Helpers",
            comment:
              "Settings section: AI helper features (commit messages, thread titles, conflict resolution)",
          }),
        },
        { id: "skills", icon: <Box className="size-4" />, label: t`Skills` },
        { id: "mcpServers", icon: <Cable className="size-4" />, label: t`MCP Servers` },
        { id: "plugins", icon: <Puzzle className="size-4" />, label: t`Plugins` },
        { id: "crews", icon: <UsersRound className="size-4" />, label: t`Crews` },
        {
          id: "usage",
          icon: <Gauge className="size-4" />,
          label: t({
            message: "Provider Usage",
            comment: "Settings section: provider usage and quota dashboard",
          }),
        },
        {
          id: "import",
          icon: <Download className="size-4" />,
          label: t({
            message: "Import",
            comment: "Settings section: import existing CLI sessions as threads",
          }),
        },
      ],
    },
    {
      id: "remote",
      label: t`Remote`,
      sections: [
        { id: "remoteAccess", icon: <QrCode className="size-4" />, label: t`Remote Access` },
        { id: "remoteServers", icon: <Server className="size-4" />, label: t`Remote Environments` },
      ],
    },
    {
      id: "about",
      label: t`About`,
      sections: [
        { id: "changelog", icon: <Megaphone className="size-4" />, label: t`Changelog` },
        { id: "about", icon: <Info className="size-4" />, label: t`About` },
        ...(devMode
          ? [
              {
                id: "dev" as SettingsSection,
                icon: <FlaskConical className="size-4" />,
                label: t({ message: "Dev", comment: "Settings section: developer/debug tools" }),
              },
            ]
          : []),
      ],
    },
  ];

  return { sectionGroups, isSectionVisible };
}

export function useSettingsShortcutDestinations(): SettingsDestination[] {
  const { t } = useLingui();
  const { sectionGroups, isSectionVisible } = useSettingsNavigation();
  const statuses = useAgentStatusesStore((state) => state.agentStatuses);
  const wslStatuses = useAgentStatusesStore((state) => state.wslAgentStatuses);
  const remoteSession = isRemoteSession();
  const agents: SettingsDestination[] = [
    {
      id: "agentsGeneral",
      icon: <Bot className="size-4" />,
      label: remoteSession ? t`Models` : t`Agents · General`,
    },
    ...(!remoteSession
      ? [
          {
            id: "acpRegistry" as const,
            icon: <Boxes className="size-4" />,
            label: t`Agent Registry`,
          },
          ...getSettingsInstalledAgents(statuses, wslStatuses).map((agent) => ({
            id: `agents:${agent.kind}` as const,
            icon: (
              <ProviderIcon
                kind={agent.kind}
                icon={agent.icon}
                fallbackLabel={agent.label}
                className="size-4"
              />
            ),
            label: agent.label,
          })),
        ]
      : []),
  ];
  return sectionGroups.flatMap((group) => [
    ...(group.id === "agents" ? agents : []),
    ...group.sections.filter((section) => isSectionVisible(section.id)),
  ]);
}
