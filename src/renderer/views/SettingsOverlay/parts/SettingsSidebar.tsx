import {
  Archive,
  ArrowLeft,
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  FlaskConical,
  FolderGit2,
  Gauge,
  GitFork,
  Globe,
  Info,
  Keyboard,
  Megaphone,
  Mic,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Palette,
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
import { baseAgentKind, isClaudeProfileKind, type AgentStatus } from "@/shared/contracts";
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
import { isDevApp, isRemoteSession } from "@/renderer/bridge";
import { searchSettings } from "./settingsSearchIndex";
import type { SettingsSection } from "./types";

// Sections that only make sense on the desktop app; the remote (PWA) client
// hides them and instead surfaces "Models" in place of the Agents tree. Single
// source of truth for both the collapsed icon rail and the expanded list.
const DESKTOP_ONLY_SECTIONS = new Set<SettingsSection>([
  "search",
  "threads",
  "shortcuts",
  "remoteAccess",
  "remoteServers",
  "agents",
  "browser",
  "archived",
  "about",
]);

function claudeProfileSidebarLabel(agent: AgentStatus): string {
  return agent.label.replace(/^Claude\s+/iu, "").trim() || agent.label;
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
        isClaudeProfileKind(agent.kind) ? claudeProfileSidebarLabel(agent) : agent.label
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
      className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-[var(--row-hover)]"
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
    !remoteSession || !DESKTOP_ONLY_SECTIONS.has(id);

  const sectionsBeforeAgents: { id: SettingsSection; icon: ReactNode; label: string }[] = [
    { id: "profile", icon: <UserRound className="size-4" />, label: t`Profile` },
    { id: "general", icon: <Settings2 className="size-4" />, label: t`General` },
    { id: "audio", icon: <Mic className="size-4" />, label: t`Audio` },
    { id: "appearance", icon: <Palette className="size-4" />, label: t`Appearance` },
    { id: "terminal", icon: <TerminalSquare className="size-4" />, label: t`Terminal` },
    { id: "threads", icon: <MessageSquare className="size-4" />, label: t`Threads` },
    { id: "git", icon: <GitFork className="size-4" />, label: t`Git` },
    { id: "worktrees", icon: <FolderGit2 className="size-4" />, label: t`Worktrees` },
    { id: "notifications", icon: <Bell className="size-4" />, label: t`Notifications` },
    {
      id: "ai",
      icon: <Sparkles className="size-4" />,
      label: t({ message: "AI", comment: "Settings section: AI / assistant configuration" }),
    },
    { id: "search", icon: <Search className="size-4" />, label: t`Search` },
    { id: "shortcuts", icon: <Keyboard className="size-4" />, label: t`Shortcuts` },
    { id: "remoteAccess", icon: <QrCode className="size-4" />, label: t`Remote Access` },
    { id: "remoteServers", icon: <Server className="size-4" />, label: t`Remote Servers` },
  ];
  const sectionsAfterAgents: { id: SettingsSection; icon: ReactNode; label: string }[] = [
    { id: "browser", icon: <Globe className="size-4" />, label: t`Browser` },
    { id: "usage", icon: <Gauge className="size-4" />, label: t`Usage` },
    { id: "archived", icon: <Archive className="size-4" />, label: t`Archived Threads` },
    { id: "changelog", icon: <Megaphone className="size-4" />, label: t`Changelog` },
    { id: "about", icon: <Info className="size-4" />, label: t`About` },
  ];

  // When the filter has a query, the section list is replaced by a flat results
  // list that also surfaces individual settings (see ./settingsSearchIndex). Each
  // section's label hit and its setting hits are grouped together, in section
  // order, with the section icon/label reused as the result "eyebrow".
  const query = sectionFilter.trim();
  const sectionMetaList: { id: SettingsSection; icon: ReactNode; label: string }[] = [
    ...sectionsBeforeAgents,
    { id: "agents", icon: <Bot className="size-4" />, label: t`Agents` },
    { id: "agentsGeneral", icon: <Bot className="size-4" />, label: t`Agents · General` },
    ...sectionsAfterAgents,
    ...(devMode
      ? [
          {
            id: "dev" as SettingsSection,
            icon: <FlaskConical className="size-4" />,
            label: t({ message: "Dev", comment: "Settings section: developer/debug tools" }),
          },
        ]
      : []),
  ];
  const settingMatches = query === "" ? [] : searchSettings(query, t, { devMode, remoteSession });
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
            <SidebarButton
              iconOnly
              icon={<UserRound className="size-4" />}
              label={t`Profile`}
              isActive={activeSection === "profile"}
              onPress={() => onSectionChange("profile")}
            />
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label={t`General`}
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
            <SidebarButton
              iconOnly
              icon={<Mic className="size-4" />}
              label={t`Audio`}
              isActive={activeSection === "audio"}
              onPress={() => onSectionChange("audio")}
            />
            <SidebarButton
              iconOnly
              icon={<Palette className="size-4" />}
              label={t`Appearance`}
              isActive={activeSection === "appearance"}
              onPress={() => onSectionChange("appearance")}
            />
            <SidebarButton
              iconOnly
              icon={<TerminalSquare className="size-4" />}
              label={t`Terminal`}
              isActive={activeSection === "terminal"}
              onPress={() => onSectionChange("terminal")}
            />
            <SidebarButton
              iconOnly
              icon={<MessageSquare className="size-4" />}
              label={t`Threads`}
              isActive={activeSection === "threads"}
              onPress={() => onSectionChange("threads")}
            />
            <SidebarButton
              iconOnly
              icon={<GitFork className="size-4" />}
              label={t`Git`}
              isActive={activeSection === "git"}
              onPress={() => onSectionChange("git")}
            />
            <SidebarButton
              iconOnly
              icon={<FolderGit2 className="size-4" />}
              label={t`Worktrees`}
              isActive={activeSection === "worktrees"}
              onPress={() => onSectionChange("worktrees")}
            />
            <SidebarButton
              iconOnly
              icon={<Bell className="size-4" />}
              label={t`Notifications`}
              isActive={activeSection === "notifications"}
              onPress={() => onSectionChange("notifications")}
            />
            <SidebarButton
              iconOnly
              icon={<Sparkles className="size-4" />}
              label={t({
                message: "AI",
                comment: "Settings section: AI / assistant configuration",
              })}
              isActive={activeSection === "ai"}
              onPress={() => onSectionChange("ai")}
            />
            {!remoteSession && (
              <SidebarButton
                iconOnly
                icon={<Search className="size-4" />}
                label={t`Search`}
                isActive={activeSection === "search"}
                onPress={() => onSectionChange("search")}
              />
            )}
            {!remoteSession && (
              <SidebarButton
                iconOnly
                icon={<Keyboard className="size-4" />}
                label={t`Shortcuts`}
                isActive={activeSection === "shortcuts"}
                onPress={() => onSectionChange("shortcuts")}
              />
            )}
            {!remoteSession && (
              <SidebarButton
                iconOnly
                icon={<QrCode className="size-4" />}
                label={t`Remote Access`}
                isActive={activeSection === "remoteAccess"}
                onPress={() => onSectionChange("remoteAccess")}
              />
            )}
            {remoteSession ? (
              <SidebarButton
                iconOnly
                icon={<Bot className="size-4" />}
                label={t`Models`}
                isActive={activeSection === "agentsGeneral"}
                onPress={() => onSectionChange("agentsGeneral")}
              />
            ) : (
              <SidebarButton
                iconOnly
                icon={<Bot className="size-4" />}
                label={t`Agents`}
                isActive={isAgentsActive}
                onPress={openAgents}
              />
            )}
            {!remoteSession && isAgentsActive && (
              <SidebarButton
                iconOnly
                icon={
                  isRefreshingAgents ? <PixelLoader size="sm" /> : <RefreshCw className="size-4" />
                }
                label={t`Refresh detected agents`}
                isDisabled={isRefreshingAgents}
                onPress={onRefreshAgents}
              />
            )}
            {!remoteSession && isAgentsActive && (
              <SidebarButton
                iconOnly
                icon={<Settings2 className="size-4" />}
                label={t`Agents · General`}
                isActive={activeSection === "agentsGeneral"}
                onPress={() => onSectionChange("agentsGeneral")}
              />
            )}
            {!remoteSession && isAgentsActive && (
              <SidebarButton
                iconOnly
                icon={<Boxes className="size-4" />}
                label={t`Agent Registry`}
                isActive={activeSection === "acpRegistry"}
                onPress={() => onSectionChange("acpRegistry")}
              />
            )}
            {!remoteSession &&
              isAgentsActive &&
              primaryAgents.map((agent) => {
                const needsAttention = attentionAgentKinds.has(agent.kind);
                return (
                  <div key={agent.kind} className="space-y-0.5">
                    <SidebarButton
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
                        <SidebarButton
                          key={profile.kind}
                          iconOnly
                          className="ml-3 h-7 w-7"
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
            <SidebarButton
              iconOnly
              icon={<Globe className="size-4" />}
              label={t`Browser`}
              isActive={activeSection === "browser"}
              onPress={() => onSectionChange("browser")}
            />
            <SidebarButton
              iconOnly
              icon={<Gauge className="size-4" />}
              label={t`Usage`}
              isActive={activeSection === "usage"}
              onPress={() => onSectionChange("usage")}
            />
            {!remoteSession && (
              <SidebarButton
                iconOnly
                icon={<Archive className="size-4" />}
                label={t`Archived Threads`}
                isActive={activeSection === "archived"}
                onPress={() => onSectionChange("archived")}
              />
            )}
            <SidebarButton
              iconOnly
              icon={<Megaphone className="size-4" />}
              label={t`Changelog`}
              isActive={activeSection === "changelog"}
              onPress={() => onSectionChange("changelog")}
            />
            {!remoteSession && (
              <SidebarButton
                iconOnly
                icon={<Info className="size-4" />}
                label={t`About`}
                isActive={activeSection === "about"}
                onPress={() => onSectionChange("about")}
              />
            )}
            {devMode && (
              <SidebarButton
                iconOnly
                icon={<FlaskConical className="size-4" />}
                label={t({ message: "Dev", comment: "Settings section: developer/debug tools" })}
                isActive={activeSection === "dev"}
                onPress={() => onSectionChange("dev")}
              />
            )}
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label={t`Return to app`}
              onPress={onClose}
            />
            <SidebarButton
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
            data-lightcode-find-scope="settings"
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
                    <SidebarButton
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
              {sectionsBeforeAgents
                .filter((section) => isSectionVisible(section.id) && matchesFilter(section.label))
                .map((section) => (
                  <SidebarButton
                    key={section.id}
                    icon={section.icon}
                    label={section.label}
                    isActive={activeSection === section.id}
                    onPress={() => onSectionChange(section.id)}
                  />
                ))}
              {remoteSession && matchesFilter(t`Models`) && (
                <SidebarButton
                  icon={<Bot className="size-4" />}
                  label={t`Models`}
                  isActive={activeSection === "agentsGeneral"}
                  onPress={() => onSectionChange("agentsGeneral")}
                />
              )}
              {!remoteSession && matchesFilter(t`Agents`) && (
                <>
                  <SidebarButton
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
                      <SidebarButton
                        icon={<Settings2 className="size-4" />}
                        label={t`General`}
                        isActive={activeSection === "agentsGeneral"}
                        onPress={() => onSectionChange("agentsGeneral")}
                      />
                      <SidebarButton
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
                            <SidebarButton
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
                                  const profileDisabled = disabledAgents.includes(profile.kind);
                                  const profileNeedsAttention = attentionAgentKinds.has(
                                    profile.kind,
                                  );
                                  return (
                                    <SidebarButton
                                      key={profile.kind}
                                      icon={renderAgentIcon(profile, {
                                        disabled: profileDisabled,
                                        className: "size-3.5",
                                      })}
                                      label={claudeProfileSidebarLabel(profile)}
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
                                      onPress={() => onSectionChange(`agents:${profile.kind}`)}
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
              )}
              {sectionsAfterAgents
                .filter((section) => isSectionVisible(section.id) && matchesFilter(section.label))
                .map((section) => (
                  <SidebarButton
                    key={section.id}
                    icon={section.icon}
                    label={section.label}
                    isActive={activeSection === section.id}
                    onPress={() => onSectionChange(section.id)}
                  />
                ))}
              {devMode &&
                matchesFilter(
                  t({ message: "Dev", comment: "Settings section: developer/debug tools" }),
                ) && (
                  <SidebarButton
                    icon={<FlaskConical className="size-4" />}
                    label={t({
                      message: "Dev",
                      comment: "Settings section: developer/debug tools",
                    })}
                    isActive={activeSection === "dev"}
                    onPress={() => onSectionChange("dev")}
                  />
                )}
            </div>
          )}
        </div>

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
