import { useRef, useState, type ReactNode } from "react";
import { AgentDiscoveryScreen } from "@/renderer/components/thread/AgentDiscoveryScreen";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { BrowserSettings } from "./parts/BrowserSettings";
import { AudioSettings } from "./parts/AudioSettings";
import { GeneralSettings } from "./parts/GeneralSettings";
import { NotificationSettings } from "./parts/NotificationSettings";
import { AISettings } from "./parts/AISettings";
import { AcpRegistrySettings } from "./parts/AcpRegistrySettings";
import { AgentsGeneralSettings } from "./parts/AgentsGeneralSettings";
import { SearchSettings } from "./parts/SearchSettings";
import { ArchivedThreadsSettings } from "./parts/ArchivedThreadsSettings";
import { AboutSettings } from "./parts/AboutSettings";
import { DevSettings } from "./parts/DevSettings";
import { SettingsSidebar } from "./parts/SettingsSidebar";
import { AgentSettingsEmpty, SingleAgentSettings } from "./parts/SingleAgentSettings";
import type { SettingsSection } from "./parts/types";

const SECTION_VIEWS: Partial<Record<SettingsSection, () => ReactNode>> = {
  general: () => <GeneralSettings />,
  audio: () => <AudioSettings />,
  notifications: () => <NotificationSettings />,
  ai: () => <AISettings />,
  search: () => <SearchSettings />,
  agents: () => <AgentSettingsEmpty />,
  agentsGeneral: () => <AgentsGeneralSettings />,
  browser: () => <BrowserSettings />,
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
    return <SingleAgentSettings agentKind={activeSection.slice(7)} />;
  }
  return SECTION_VIEWS[activeSection]?.() ?? null;
}

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const [activeSection, setActiveSection] = useState<SettingsSection>("general");
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
      title="Settings"
      sidebar={
        <SettingsSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onClose={onClose}
          installedAgents={installedAgents}
          attentionAgentKinds={attentionAgentKinds}
          isRefreshingAgents={isRefreshingAgents}
          onRefreshAgents={refreshAgents}
        />
      }
      content={
        <div className="relative h-full min-h-0">
          {renderSection(activeSection, setActiveSection)}
          {isAgentsSectionActive && isRefreshingAgents ? (
            <div className="absolute inset-0 z-20 bg-background/90 backdrop-blur-sm">
              <AgentDiscoveryScreen wslDistros={wslDistros} onCancel={cancelRefreshAgents} />
            </div>
          ) : null}
        </div>
      }
    />
  );
}
