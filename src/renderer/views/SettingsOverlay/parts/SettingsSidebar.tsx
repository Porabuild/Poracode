import {
  Archive,
  ArrowLeft,
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  Box,
  Cable,
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
  PanelLeft,
  PanelLeftClose,
  Palette,
  Puzzle,
  QrCode,
  RefreshCw,
  Search,
  Server,
  Settings2,
  Sparkles,
  TerminalSquare,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { baseAgentKind, type AgentStatus } from "@/shared/contracts";
import { useFindFocusStore } from "@/renderer/state/findFocusStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  overlaySidebarColumnClass,
  overlaySidebarSurfaceClass,
  sidebarBodyScrollClass,
  sidebarFooterNavClass,
  sidebarIconRailFooterClass,
} from "@/renderer/components/layout/sidebarChrome";
import { ProviderIcon } from "@/renderer/components/providers/ProviderIcon";
import { PixelLoader, SidebarButton } from "@/renderer/components/common";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { isDevApp, isRemoteSession, isWindows } from "@/renderer/bridge";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { searchSettings } from "./settingsSearchIndex";
import type { SettingsSection } from "./types";

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

function profileSidebarLabel(agent: AgentStatus): string {
  const baseKind = baseAgentKind(agent.kind);
  return agent.label.toLowerCase().startsWith(`${baseKind.toLowerCase()} `)
    ? agent.label.slice(baseKind.length).trim()
    : agent.label;
}

function renderAgentIcon(
  agent: AgentStatus,
  options: {
    disabled: boolean;
    className?: string;
  },
) {
  return (
    <ProviderIcon
      kind={agent.kind}
      icon={agent.icon}
      fallbackLabel={
        baseAgentKind(agent.kind) !== agent.kind ? profileSidebarLabel(agent) : agent.label
      }
      className={`${options.className ?? "size-4"} ${options.disabled ? "opacity-35" : ""}`}
    />
  );
}

type SearchRow =
  | { kind: "section"; key: string; section: SettingsSection; icon: ReactNode; label: string }
  | {
      kind: "setting";
      key: string;
      section: SettingsSection;
      anchor: string;
      icon: ReactNode;
      sectionLabel: string;
      primary: string;
    };

type SectionMeta = { id: SettingsSection; icon: ReactNode; label: string };

/**
 * Settings navigation row. The section list is long (5 groups, ~25 rows plus the
 * expandable agents tree), so every row here uses the compact density to keep the
 * whole list reachable without scrolling.
 */
function SettingsNavButton(props: React.ComponentProps<typeof SidebarButton>) {
  return <SidebarButton density="compact" {...props} />;
}

/**
 * A settings-search result row: a small section "eyebrow" (icon + section name)
 * above the matched setting text (its title, or a description snippet when only
 * the description matched). Clicking navigates to the section and scrolls to the
 * setting.
 */
function SettingsSearchResultRow(props: {
  icon: ReactNode;
  sectionLabel: string;
  primary: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onPress}
      className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--row-hover)]"
    >
      <span className="flex items-center gap-1.5 text-[11px] text-muted [&_svg]:size-3">
        <span className="flex size-3 shrink-0 items-center justify-center">{props.icon}</span>
        <span className="truncate">{props.sectionLabel}</span>
      </span>
      <span className="truncate text-sm text-foreground">{props.primary}</span>
    </button>
  );
}

export function SettingsSidebar(props: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection, anchor?: string) => void;
  onClose: () => void;
  installedAgents: AgentStatus[];
  attentionAgentKinds: ReadonlySet<AgentStatus["kind"]>;
  isRefreshingAgents: boolean;
  onRefreshAgents: () => void;
}) {
  const {
    activeSection,
    onSectionChange,
    onClose,
    installedAgents,
    attentionAgentKinds,
    isRefreshingAgents,
    onRefreshAgents,
  } = props;
  const { t } = useLingui();
  const { isCollapsed, collapse, expand } = useSidebar();
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  // Instance-scoped kinds (e.g. Claude profiles "claude:<id>") nest under
  // their base agent's sidebar entry when the base itself is installed;
  // instance kinds without an installed base (ACP registry agents) stay
  // top-level.
  const installedKinds = new Set(installedAgents.map((agent) => agent.kind));
  const nestsUnderBase = (agent: AgentStatus) => {
    const base = baseAgentKind(agent.kind);
    return base !== agent.kind && installedKinds.has(base);
  };
  const primaryAgents = installedAgents.filter((agent) => !nestsUnderBase(agent));
  const instanceAgentsFor = (baseKind: string) =>
    installedAgents.filter(
      (agent) => nestsUnderBase(agent) && baseAgentKind(agent.kind) === baseKind,
    );
  const isAgentsActive =
    activeSection === "agents" ||
    activeSection === "acpRegistry" ||
    activeSection === "agentsGeneral" ||
    activeSection.startsWith("agents:");
  const devMode = isDevApp();
  // Remote (PWA) sessions hide the sections that cannot work remotely
  // (search indexing, the remote-access server, agent installs/auth,
  // archived-thread management via the local store, app updates). AI helper
  // settings sync to the desktop and notifications fire on the device, so
  // both stay. Model visibility/order still matters remotely, so Agents
  // collapses to a single "Models" entry that opens the general agents page.
  const remoteSession = isRemoteSession();

  const openAgents = () => {
    if (isAgentsActive) {
      onSectionChange("general");
      return;
    }
    onSectionChange(installedAgents.length > 0 ? "agentsGeneral" : "agents");
  };

  // Section filter for the expanded sidebar (driven by the global Find command).
  const [sectionFilter, setSectionFilter] = useState("");
  const sectionFilterRef = useRef<HTMLInputElement>(null);
  const settingsFocusToken = useFindFocusStore((state) => state.settingsFocusToken);
  const lastSettingsFocusToken = useRef(settingsFocusToken);
  useEffect(() => {
    if (settingsFocusToken === lastSettingsFocusToken.current) return;
    lastSettingsFocusToken.current = settingsFocusToken;
    if (isCollapsed) expand();
    sectionFilterRef.current?.focus();
    sectionFilterRef.current?.select();
  }, [settingsFocusToken, isCollapsed, expand]);
  const matchesFilter = (label: string) => {
    const needle = sectionFilter.trim().toLowerCase();
    return needle === "" || label.toLowerCase().includes(needle);
  };

  const isSectionVisible = (id: SettingsSection) =>
    !remoteSession ||
    !DESKTOP_ONLY_SECTIONS.has(id) ||
    (id === "remoteServers" && hasClientCapability("manageRemoteEnvironments"));

  // Grouped section model — single source of truth for sidebar order in both
  // the expanded list (with group headers) and the collapsed icon rail. The
  // "agents" group is special: its first row is the expandable agents tree
  // (the "Models" stand-in on remote), followed by its plain sections.
  const sectionGroups: { id: string; label: string; sections: SectionMeta[] }[] = [
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
        {
          id: "usage",
          icon: <Gauge className="size-4" />,
          label: t({
            message: "Provider Usage",
            comment: "Settings section: provider usage and quota dashboard",
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

  // Desktop-only sections drop out of their group on remote sessions; a group
  // whose rows are all hidden renders nothing at all, header included.
  const visibleGroups = sectionGroups
    .map((group) => ({
      ...group,
      hasTree: group.id === "agents",
      sections: group.sections.filter((section) => isSectionVisible(section.id)),
    }))
    .filter((group) => group.hasTree || group.sections.length > 0);

  // When the filter has a query, the section list is replaced by a flat results
  // list that also surfaces individual settings (see ./settingsSearchIndex). Each
  // section's label hit and its setting hits are grouped together, in sidebar
  // group order, with the section icon/label reused as the result "eyebrow".
  const query = sectionFilter.trim();
  const sectionMetaList: SectionMeta[] = sectionGroups.flatMap((group) =>
    group.id === "agents"
      ? [
          { id: "agents" as SettingsSection, icon: <Bot className="size-4" />, label: t`Agents` },
          {
            id: "agentsGeneral" as SettingsSection,
            icon: <Bot className="size-4" />,
            label: t`Agents · General`,
          },
          ...group.sections,
        ]
      : group.sections,
  );
  const settingMatches =
    query === "" ? [] : searchSettings(query, t, { devMode, remoteSession, windows: isWindows() });
  const matchesBySection = new Map<string, typeof settingMatches>();
  for (const match of settingMatches) {
    const list = matchesBySection.get(match.section) ?? [];
    list.push(match);
    matchesBySection.set(match.section, list);
  }
  const searchRows: SearchRow[] = [];
  for (const meta of sectionMetaList) {
    if (!isSectionVisible(meta.id)) continue;
    if (matchesFilter(meta.label)) {
      searchRows.push({
        kind: "section",
        key: `s:${meta.id}`,
        section: meta.id,
        icon: meta.icon,
        label: meta.label,
      });
    }
    for (const match of matchesBySection.get(meta.id) ?? []) {
      searchRows.push({
        kind: "setting",
        key: `a:${match.anchor}`,
        section: meta.id,
        anchor: match.anchor,
        icon: meta.icon,
        sectionLabel: meta.label,
        primary: match.snippet ?? match.title,
      });
    }
  }

  return (
    <div className={`relative h-full ${overlaySidebarSurfaceClass}`}>
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {visibleGroups.map((group, groupIndex) => (
              <div key={group.id} className={groupIndex > 0 ? "space-y-0.5 pt-2" : "space-y-0.5"}>
                {group.hasTree &&
                  (remoteSession ? (
                    <SettingsNavButton
                      iconOnly
                      icon={<Bot className="size-4" />}
                      label={t`Models`}
                      isActive={activeSection === "agentsGeneral"}
                      onPress={() => onSectionChange("agentsGeneral")}
                    />
                  ) : (
                    <>
                      <SettingsNavButton
                        iconOnly
                        icon={<Bot className="size-4" />}
                        label={t`Agents`}
                        isActive={isAgentsActive}
                        onPress={openAgents}
                      />
                      {isAgentsActive && (
                        <SettingsNavButton
                          iconOnly
                          icon={
                            isRefreshingAgents ? (
                              <PixelLoader size="sm" />
                            ) : (
                              <RefreshCw className="size-4" />
                            )
                          }
                          label={t`Refresh detected agents`}
                          isDisabled={isRefreshingAgents}
                          onPress={onRefreshAgents}
                        />
                      )}
                      {isAgentsActive && (
                        <SettingsNavButton
                          iconOnly
                          icon={<Settings2 className="size-4" />}
                          label={t`Agents · General`}
                          isActive={activeSection === "agentsGeneral"}
                          onPress={() => onSectionChange("agentsGeneral")}
                        />
                      )}
                      {isAgentsActive && (
                        <SettingsNavButton
                          iconOnly
                          icon={<Boxes className="size-4" />}
                          label={t`Agent Registry`}
                          isActive={activeSection === "acpRegistry"}
                          onPress={() => onSectionChange("acpRegistry")}
                        />
                      )}
                      {isAgentsActive &&
                        primaryAgents.map((agent) => {
                          const needsAttention = attentionAgentKinds.has(agent.kind);
                          return (
                            <div key={agent.kind} className="space-y-0.5">
                              <SettingsNavButton
                                iconOnly
                                icon={
                                  <span className="relative flex size-4 items-center justify-center">
                                    {renderAgentIcon(agent, {
                                      disabled: disabledAgents.includes(agent.kind),
                                    })}
                                    {needsAttention ? (
                                      <AlertTriangle className="absolute -right-1 -top-1 size-2.5 text-warning" />
                                    ) : null}
                                  </span>
                                }
                                label={agent.label}
                                isActive={activeSection === `agents:${agent.kind}`}
                                onPress={() => onSectionChange(`agents:${agent.kind}`)}
                              />
                              {instanceAgentsFor(agent.kind).map((profile) => {
                                const profileNeedsAttention = attentionAgentKinds.has(profile.kind);
                                return (
                                  <SettingsNavButton
                                    key={profile.kind}
                                    iconOnly
                                    className="ml-3"
                                    icon={
                                      <span className="relative flex size-3.5 items-center justify-center">
                                        {renderAgentIcon(profile, {
                                          disabled: disabledAgents.includes(profile.kind),
                                          className: "size-3.5",
                                        })}
                                        {profileNeedsAttention ? (
                                          <AlertTriangle className="absolute -right-1 -top-1 size-2.5 text-warning" />
                                        ) : null}
                                      </span>
                                    }
                                    label={profile.label}
                                    isActive={activeSection === `agents:${profile.kind}`}
                                    onPress={() => onSectionChange(`agents:${profile.kind}`)}
                                  />
                                );
                              })}
                            </div>
                          );
                        })}
                    </>
                  ))}
                {group.sections.map((section) => (
                  <SettingsNavButton
                    key={section.id}
                    iconOnly
                    icon={section.icon}
                    label={section.label}
                    isActive={activeSection === section.id}
                    onPress={() => onSectionChange(section.id)}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SettingsNavButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={onClose}
            />
            <SettingsNavButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label={t`Show sidebar`}
              onPress={expand}
            />
          </div>
        </div>
      )}

      <div
        className={`${overlaySidebarColumnClass} transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className={sidebarBodyScrollClass()}>
          {/* Transparent, sidebar-item-shaped filter: no opaque fill/border so the
              translucent sidebar glass shows through; hover/focus use the same
              translucent row overlays as SidebarButton. A <label> lets a click
              anywhere (incl. icon/padding) focus the input natively. */}
          <label
            data-poracode-find-scope="settings"
            className="mb-1 flex cursor-text items-center gap-2 rounded-3xl px-2 py-1.5 text-muted transition-colors hover:bg-[var(--row-hover)] hover:text-foreground focus-within:bg-[var(--row-active)] focus-within:text-foreground"
          >
            <Search className="size-4 shrink-0" />
            <input
              ref={sectionFilterRef}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              placeholder={t`Search settings`}
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && sectionFilter) {
                  event.preventDefault();
                  setSectionFilter("");
                }
              }}
            />
          </label>
          {query !== "" ? (
            <div className="space-y-0.5">
              {searchRows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">{t`No results`}</p>
              ) : (
                searchRows.map((row) =>
                  row.kind === "section" ? (
                    <SettingsNavButton
                      key={row.key}
                      icon={row.icon}
                      label={row.label}
                      isActive={activeSection === row.section}
                      onPress={() => onSectionChange(row.section)}
                    />
                  ) : (
                    <SettingsSearchResultRow
                      key={row.key}
                      icon={row.icon}
                      sectionLabel={row.sectionLabel}
                      primary={row.primary}
                      onPress={() => onSectionChange(row.section, row.anchor)}
                    />
                  ),
                )
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {visibleGroups.map((group, groupIndex) => (
                <div
                  key={group.id}
                  className={groupIndex > 0 ? "space-y-0.5 pt-2.5" : "space-y-0.5"}
                >
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                    {group.label}
                  </p>
                  {group.hasTree &&
                    (remoteSession ? (
                      <SettingsNavButton
                        icon={<Bot className="size-4" />}
                        label={t`Models`}
                        isActive={activeSection === "agentsGeneral"}
                        onPress={() => onSectionChange("agentsGeneral")}
                      />
                    ) : (
                      <>
                        <SettingsNavButton
                          icon={<Bot className="size-4" />}
                          label={t`Agents`}
                          isActive={activeSection === "agents"}
                          onPress={openAgents}
                          suffix={
                            <button
                              type="button"
                              aria-label={t`Refresh detected agents`}
                              className="flex size-5 shrink-0 cursor-default items-center justify-center text-muted/70 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:text-muted/40"
                              disabled={isRefreshingAgents}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRefreshAgents();
                              }}
                            >
                              {isRefreshingAgents ? (
                                <PixelLoader size="xs" />
                              ) : (
                                <RefreshCw className="size-3.5" />
                              )}
                            </button>
                          }
                        />
                        {isAgentsActive && (
                          <div className="space-y-0.5 pl-4">
                            <SettingsNavButton
                              icon={<Settings2 className="size-4" />}
                              label={t`General`}
                              isActive={activeSection === "agentsGeneral"}
                              onPress={() => onSectionChange("agentsGeneral")}
                            />
                            <SettingsNavButton
                              icon={<Boxes className="size-4" />}
                              label={t`Agent Registry`}
                              isActive={activeSection === "acpRegistry"}
                              onPress={() => onSectionChange("acpRegistry")}
                            />
                            {primaryAgents.map((agent) => {
                              const agentDisabled = disabledAgents.includes(agent.kind);
                              const needsAttention = attentionAgentKinds.has(agent.kind);
                              return (
                                <div key={agent.kind} className="space-y-0.5">
                                  <SettingsNavButton
                                    icon={renderAgentIcon(agent, {
                                      disabled: agentDisabled,
                                    })}
                                    label={agent.label}
                                    suffix={
                                      needsAttention ? (
                                        <AlertTriangle
                                          aria-hidden="true"
                                          className="size-3.5 text-warning"
                                        />
                                      ) : null
                                    }
                                    className={agentDisabled ? "opacity-50" : ""}
                                    isActive={activeSection === `agents:${agent.kind}`}
                                    onPress={() => onSectionChange(`agents:${agent.kind}`)}
                                  />
                                  {instanceAgentsFor(agent.kind).length > 0 ? (
                                    <div className="space-y-0.5 pl-5">
                                      {instanceAgentsFor(agent.kind).map((profile) => {
                                        const profileDisabled = disabledAgents.includes(
                                          profile.kind,
                                        );
                                        const profileNeedsAttention = attentionAgentKinds.has(
                                          profile.kind,
                                        );
                                        return (
                                          <SettingsNavButton
                                            key={profile.kind}
                                            icon={renderAgentIcon(profile, {
                                              disabled: profileDisabled,
                                              className: "size-3.5",
                                            })}
                                            label={profileSidebarLabel(profile)}
                                            suffix={
                                              profileNeedsAttention ? (
                                                <AlertTriangle
                                                  aria-hidden="true"
                                                  className="size-3.5 text-warning"
                                                />
                                              ) : null
                                            }
                                            className={`text-xs ${profileDisabled ? "opacity-50" : ""}`}
                                            isActive={activeSection === `agents:${profile.kind}`}
                                            onPress={() =>
                                              onSectionChange(`agents:${profile.kind}`)
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ))}
                  {group.sections.map((section) => (
                    <SettingsNavButton
                      key={section.id}
                      icon={section.icon}
                      label={section.label}
                      isActive={activeSection === section.id}
                      onPress={() => onSectionChange(section.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer rows keep the default density (not the compact one the section
            list uses) so they line up with the main sidebar's own 32px footer rows. */}
        <div className={sidebarFooterNavClass}>
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label={t`Return to app`}
            onPress={onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label={t`Hide sidebar`}
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
