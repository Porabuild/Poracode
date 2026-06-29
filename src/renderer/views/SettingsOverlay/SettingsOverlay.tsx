import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { AgentDiscoveryScreen } from "@/renderer/components/thread/AgentDiscoveryScreen";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { ProfileSettings } from "./parts/ProfileSettings";
import { AppearanceSettings } from "./parts/AppearanceSettings";
import { BrowserSettings } from "./parts/BrowserSettings";
import { McpServersSettings } from "./parts/McpServersSettings";
import { UsageSettings } from "./parts/UsageSettings";
import { AudioSettings } from "./parts/AudioSettings";
import { GeneralSettings } from "./parts/GeneralSettings";
import { GitSettings } from "./parts/GitSettings";
import { WorktreeSettings } from "./parts/WorktreeSettings";
import { NotificationSettings } from "./parts/NotificationSettings";
import { AISettings } from "./parts/AISettings";
import { AcpRegistrySettings } from "./parts/AcpRegistrySettings";
import { AgentsGeneralSettings } from "./parts/AgentsGeneralSettings";
import { SearchSettings } from "./parts/SearchSettings";
import { ShortcutsSettings } from "./parts/ShortcutsSettings";
import { TerminalSettings } from "./parts/TerminalSettings";
import { ThreadSettings } from "./parts/ThreadSettings";
import { ArchivedThreadsSettings } from "./parts/ArchivedThreadsSettings";
import { AboutSettings } from "./parts/AboutSettings";
import { DevSettings } from "./parts/DevSettings";
import { SettingsSidebar } from "./parts/SettingsSidebar";
import { AgentSettingsEmpty, SingleAgentSettings } from "./parts/SingleAgentSettings";
import type { SettingsSection } from "./parts/types";

const SECTION_VIEWS: Partial<Record<SettingsSection, () => ReactNode>> = {
  profile: () => <ProfileSettings />,
  general: () => <GeneralSettings />,
  audio: () => <AudioSettings />,
  appearance: () => <AppearanceSettings />,
  terminal: () => <TerminalSettings />,
  threads: () => <ThreadSettings />,
  git: () => <GitSettings />,
  worktrees: () => <WorktreeSettings />,
  notifications: () => <NotificationSettings />,
  ai: () => <AISettings />,
  search: () => <SearchSettings />,
  shortcuts: () => <ShortcutsSettings />,
  agents: () => <AgentSettingsEmpty />,
  agentsGeneral: () => <AgentsGeneralSettings />,
  browser: () => <BrowserSettings />,
  mcp: () => <McpServersSettings />,
  usage: () => <UsageSettings />,
  archived: () => <ArchivedThreadsSettings />,
  about: () => <AboutSettings />,
  dev: () => <DevSettings />,
};

function renderSection(
  activeSection: SettingsSection,
  onSectionChange: (section: SettingsSection) => void,
): ReactNode {
  if (activeSection === "acpRegistry") {
    return (
      <AcpRegistrySettings onOpenAgentSettings={(kind) => onSectionChange(`agents:${kind}`)} />
    );
  }
  if (activeSection.startsWith("agents:")) {
    return (
      <SingleAgentSettings
        agentKind={activeSection.slice(7)}
        onOpenProfile={(kind) => onSectionChange(`agents:${kind}`)}
      />
    );
  }
  return SECTION_VIEWS[activeSection]?.() ?? null;
}

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const { t } = useLingui();
  const requestedSection = usePanelStore((s) => s.settingsSection);
  const clearSettingsSection = usePanelStore((s) => s.clearSettingsSection);
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    (requestedSection as SettingsSection | null) ?? "general",
  );
  // Apply a deep-link request (e.g. clicking a sidebar usage circle) and clear
  // it so it doesn't re-fire on the next open.
  useEffect(() => {
    if (requestedSection) {
      setActiveSection(requestedSection as SettingsSection);
      clearSettingsSection();
    }
  }, [requestedSection, clearSettingsSection]);

  // Pending scroll-to-setting target, set when a settings search result is
  // clicked. The token re-fires the effect when the same setting is picked
  // twice. Local (not a store): only this overlay coordinates the scroll, and it
  // has to land *after* the section content remounts (`key={activeSection}`).
  const [scrollTarget, setScrollTarget] = useState<{ anchor: string; token: number } | null>(null);
  const scrollTokenRef = useRef(0);
  const navigateToSection = useCallback((section: SettingsSection, anchor?: string) => {
    setActiveSection(section);
    if (anchor) {
      scrollTokenRef.current += 1;
      setScrollTarget({ anchor, token: scrollTokenRef.current });
    }
  }, []);

  // After the target section mounts, scroll its anchor into view and flash it.
  // Runs on rAF (with a short retry) so the freshly-remounted row is in the DOM.
  useEffect(() => {
    if (!scrollTarget) return;
    const { anchor } = scrollTarget;
    let frames = 0;
    let raf = requestAnimationFrame(function tryScroll() {
      const el = document.querySelector<HTMLElement>(`[data-settings-anchor="${anchor}"]`);
      if (el) {
        if (typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        el.classList.add("lightcode-setting-highlight");
        el.addEventListener(
          "animationend",
          () => el.classList.remove("lightcode-setting-highlight"),
          { once: true },
        );
        setScrollTarget(null);
        return;
      }
      if (frames++ < 4) {
        raf = requestAnimationFrame(tryScroll);
      } else {
        setScrollTarget(null);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollTarget]);

  const [isRefreshingAgents, setIsRefreshingAgents] = useState(false);
  const refreshRunRef = useRef(0);
  const agentStatuses = useAgentStatusesStore((s) => s.agentStatuses);
  const wslAgentStatuses = useAgentStatusesStore((s) => s.wslAgentStatuses);
  const wslProjectDistrosKey = useAppStore((state) => buildWslProjectDistrosKey(state.projects));
  const installedAgents = getSettingsInstalledAgents(agentStatuses, wslAgentStatuses);
  const attentionAgentKinds = new Set(
    [...agentStatuses, ...wslAgentStatuses]
      .filter((status) => status.installed && status.authState === "missing")
      .map((status) => status.kind),
  );
  const isAgentsSectionActive = activeSection === "agents" || activeSection.startsWith("agents:");
  const wslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];
  const section = renderSection(activeSection, navigateToSection);

  const refreshAgents = () => {
    if (isRefreshingAgents) {
      return;
    }
    setActiveSection((prev) => {
      if (prev === "agents" || prev.startsWith("agents:")) {
        return prev;
      }
      const firstInstalled = installedAgents[0];
      return firstInstalled ? `agents:${firstInstalled.kind}` : "agents";
    });
    const refreshRun = refreshRunRef.current + 1;
    refreshRunRef.current = refreshRun;
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "all", wslDistros });
    setIsRefreshingAgents(true);
    void readBridge()
      .refreshAgentStatuses(wslDistros)
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => {
          if (refreshRunRef.current !== refreshRun) {
            return;
          }
          setIsRefreshingAgents(false);
          useAgentStatusesStore.getState().resetDiscoveredAgents();
        }, 1000);
      });
  };

  const cancelRefreshAgents = () => {
    refreshRunRef.current += 1;
    setIsRefreshingAgents(false);
    useAgentStatusesStore.getState().resetDiscoveredAgents();
  };

  return (
    <PageLayout
      title={t`Settings`}
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={navigateToSection}
          onClose={onClose}
          installedAgents={installedAgents}
          attentionAgentKinds={attentionAgentKinds}
          isRefreshingAgents={isRefreshingAgents}
          onRefreshAgents={refreshAgents}
        />
      }
      content={
        activeSection === "acpRegistry" ? (
          <div key={activeSection} className="relative h-full min-h-0">
            {section}
          </div>
        ) : (
          <div
            key={activeSection}
            data-settings-scroll-area="true"
            className="relative h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4 [overflow-anchor:none] [scrollbar-gutter:stable]"
          >
            {section}
            {isAgentsSectionActive && isRefreshingAgents ? (
              <div className="absolute inset-0 z-20 bg-background/90 backdrop-blur-sm">
                <AgentDiscoveryScreen wslDistros={wslDistros} onCancel={cancelRefreshAgents} />
              </div>
            ) : null}
          </div>
        )
      }
    />
  );
}
