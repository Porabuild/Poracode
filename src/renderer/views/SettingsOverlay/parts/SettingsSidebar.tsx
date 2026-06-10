import {
  Archive,
  ArrowLeft,
  AlertTriangle,
  Bell,
  Bot,
  Boxes,
  FlaskConical,
  Gauge,
  GitFork,
  Globe,
  Info,
  Mic,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Palette,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { isClaudeProfileKind, type AgentStatus } from "@/shared/contracts";
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
import { isDevApp } from "@/renderer/bridge";
import type { SettingsSection } from "./types";

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

export function SettingsSidebar(props: {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
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
  const { isCollapsed, collapse, expand } = useSidebar();
  const disabledAgents = useSharedSettings((s) => s.disabledAgents);
  const primaryAgents = installedAgents.filter((agent) => !isClaudeProfileKind(agent.kind));
  const claudeProfileAgents = installedAgents.filter((agent) => isClaudeProfileKind(agent.kind));
  const isAgentsActive =
    activeSection === "agents" ||
    activeSection === "acpRegistry" ||
    activeSection === "agentsGeneral" ||
    activeSection.startsWith("agents:");
  const devMode = isDevApp();

  const openAgents = () => {
    if (isAgentsActive) {
      onSectionChange("general");
      return;
    }
    onSectionChange(installedAgents.length > 0 ? "agentsGeneral" : "agents");
  };

  return (
    <div className={`relative h-full ${overlaySidebarSurfaceClass}`}>
      {isCollapsed && (
        <div className="absolute inset-0 z-10 flex h-full min-h-0 flex-col items-start gap-3 pl-2 pb-1 pt-0">
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label="General"
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
            <SidebarButton
              iconOnly
              icon={<Mic className="size-4" />}
              label="Audio"
              isActive={activeSection === "audio"}
              onPress={() => onSectionChange("audio")}
            />
            <SidebarButton
              iconOnly
              icon={<Palette className="size-4" />}
              label="Appearance"
              isActive={activeSection === "appearance"}
              onPress={() => onSectionChange("appearance")}
            />
            <SidebarButton
              iconOnly
              icon={<TerminalSquare className="size-4" />}
              label="Terminal"
              isActive={activeSection === "terminal"}
              onPress={() => onSectionChange("terminal")}
            />
            <SidebarButton
              iconOnly
              icon={<MessageSquare className="size-4" />}
              label="Threads"
              isActive={activeSection === "threads"}
              onPress={() => onSectionChange("threads")}
            />
            <SidebarButton
              iconOnly
              icon={<GitFork className="size-4" />}
              label="Git"
              isActive={activeSection === "git"}
              onPress={() => onSectionChange("git")}
            />
            <SidebarButton
              iconOnly
              icon={<Bell className="size-4" />}
              label="Notifications"
              isActive={activeSection === "notifications"}
              onPress={() => onSectionChange("notifications")}
            />
            <SidebarButton
              iconOnly
              icon={<Sparkles className="size-4" />}
              label="AI"
              isActive={activeSection === "ai"}
              onPress={() => onSectionChange("ai")}
            />
            <SidebarButton
              iconOnly
              icon={<Search className="size-4" />}
              label="Search"
              isActive={activeSection === "search"}
              onPress={() => onSectionChange("search")}
            />
            <SidebarButton
              iconOnly
              icon={<Bot className="size-4" />}
              label="Agents"
              isActive={isAgentsActive}
              onPress={openAgents}
            />
            {isAgentsActive && (
              <SidebarButton
                iconOnly
                icon={
                  isRefreshingAgents ? <PixelLoader size="sm" /> : <RefreshCw className="size-4" />
                }
                label="Refresh detected agents"
                isDisabled={isRefreshingAgents}
                onPress={onRefreshAgents}
              />
            )}
            {isAgentsActive && (
              <SidebarButton
                iconOnly
                icon={<Settings2 className="size-4" />}
                label="Agents · General"
                isActive={activeSection === "agentsGeneral"}
                onPress={() => onSectionChange("agentsGeneral")}
              />
            )}
            {isAgentsActive && (
              <SidebarButton
                iconOnly
                icon={<Boxes className="size-4" />}
                label="Agent Registry"
                isActive={activeSection === "acpRegistry"}
                onPress={() => onSectionChange("acpRegistry")}
              />
            )}
            {isAgentsActive &&
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
                    {agent.kind === "claude"
                      ? claudeProfileAgents.map((profile) => {
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
                        })
                      : null}
                  </div>
                );
              })}
            <SidebarButton
              iconOnly
              icon={<Globe className="size-4" />}
              label="Browser"
              isActive={activeSection === "browser"}
              onPress={() => onSectionChange("browser")}
            />
            <SidebarButton
              iconOnly
              icon={<Gauge className="size-4" />}
              label="Usage"
              isActive={activeSection === "usage"}
              onPress={() => onSectionChange("usage")}
            />
            <SidebarButton
              iconOnly
              icon={<Archive className="size-4" />}
              label="Archived Threads"
              isActive={activeSection === "archived"}
              onPress={() => onSectionChange("archived")}
            />
            <SidebarButton
              iconOnly
              icon={<Info className="size-4" />}
              label="About"
              isActive={activeSection === "about"}
              onPress={() => onSectionChange("about")}
            />
            {devMode && (
              <SidebarButton
                iconOnly
                icon={<FlaskConical className="size-4" />}
                label="Dev"
                isActive={activeSection === "dev"}
                onPress={() => onSectionChange("dev")}
              />
            )}
          </div>
          <div className={sidebarIconRailFooterClass}>
            <SidebarButton
              iconOnly
              icon={<ArrowLeft className="size-4" />}
              label="Return to app"
              onPress={onClose}
            />
            <SidebarButton
              iconOnly
              icon={<PanelLeft className="size-4" />}
              label="Show sidebar"
              onPress={expand}
            />
          </div>
        </div>
      )}

      <div
        className={`${overlaySidebarColumnClass} transition-opacity duration-150 ${isCollapsed ? "invisible opacity-0" : "opacity-100 delay-100"}`}
      >
        <div className={sidebarBodyScrollClass()}>
          <div className="space-y-0.5">
            <SidebarButton
              icon={<Settings2 className="size-4" />}
              label="General"
              isActive={activeSection === "general"}
              onPress={() => onSectionChange("general")}
            />
            <SidebarButton
              icon={<Mic className="size-4" />}
              label="Audio"
              isActive={activeSection === "audio"}
              onPress={() => onSectionChange("audio")}
            />
            <SidebarButton
              icon={<Palette className="size-4" />}
              label="Appearance"
              isActive={activeSection === "appearance"}
              onPress={() => onSectionChange("appearance")}
            />
            <SidebarButton
              icon={<TerminalSquare className="size-4" />}
              label="Terminal"
              isActive={activeSection === "terminal"}
              onPress={() => onSectionChange("terminal")}
            />
            <SidebarButton
              icon={<MessageSquare className="size-4" />}
              label="Threads"
              isActive={activeSection === "threads"}
              onPress={() => onSectionChange("threads")}
            />
            <SidebarButton
              icon={<GitFork className="size-4" />}
              label="Git"
              isActive={activeSection === "git"}
              onPress={() => onSectionChange("git")}
            />
            <SidebarButton
              icon={<Bell className="size-4" />}
              label="Notifications"
              isActive={activeSection === "notifications"}
              onPress={() => onSectionChange("notifications")}
            />
            <SidebarButton
              icon={<Sparkles className="size-4" />}
              label="AI"
              isActive={activeSection === "ai"}
              onPress={() => onSectionChange("ai")}
            />
            <SidebarButton
              icon={<Search className="size-4" />}
              label="Search"
              isActive={activeSection === "search"}
              onPress={() => onSectionChange("search")}
            />
            <SidebarButton
              icon={<Bot className="size-4" />}
              label="Agents"
              isActive={activeSection === "agents"}
              onPress={openAgents}
              suffix={
                <button
                  type="button"
                  aria-label="Refresh detected agents"
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
                  label="General"
                  isActive={activeSection === "agentsGeneral"}
                  onPress={() => onSectionChange("agentsGeneral")}
                />
                <SidebarButton
                  icon={<Boxes className="size-4" />}
                  label="Agent Registry"
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
                            <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />
                          ) : null
                        }
                        className={agentDisabled ? "opacity-50" : ""}
                        isActive={activeSection === `agents:${agent.kind}`}
                        onPress={() => onSectionChange(`agents:${agent.kind}`)}
                      />
                      {agent.kind === "claude" && claudeProfileAgents.length > 0 ? (
                        <div className="space-y-0.5 pl-5">
                          {claudeProfileAgents.map((profile) => {
                            const profileDisabled = disabledAgents.includes(profile.kind);
                            const profileNeedsAttention = attentionAgentKinds.has(profile.kind);
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
            <SidebarButton
              icon={<Globe className="size-4" />}
              label="Browser"
              isActive={activeSection === "browser"}
              onPress={() => onSectionChange("browser")}
            />
            <SidebarButton
              icon={<Gauge className="size-4" />}
              label="Usage"
              isActive={activeSection === "usage"}
              onPress={() => onSectionChange("usage")}
            />
            <SidebarButton
              icon={<Archive className="size-4" />}
              label="Archived Threads"
              isActive={activeSection === "archived"}
              onPress={() => onSectionChange("archived")}
            />
            <SidebarButton
              icon={<Info className="size-4" />}
              label="About"
              isActive={activeSection === "about"}
              onPress={() => onSectionChange("about")}
            />
            {devMode && (
              <SidebarButton
                icon={<FlaskConical className="size-4" />}
                label="Dev"
                isActive={activeSection === "dev"}
                onPress={() => onSectionChange("dev")}
              />
            )}
          </div>
        </div>

        <div className={sidebarFooterNavClass}>
          <SidebarButton
            icon={<ArrowLeft className="size-4" />}
            label="Return to app"
            onPress={onClose}
          />
          <SidebarButton
            icon={<PanelLeftClose className="size-4" />}
            label="Hide sidebar"
            onPress={collapse}
          />
        </div>
      </div>
    </div>
  );
}
