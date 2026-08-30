import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { AgentDiscoveryScreen } from "@/renderer/components/thread/AgentDiscoveryScreen";
import { BrowserRemoteConnectionGate } from "@/renderer/views/MainView/parts/BrowserRemoteConnectionGate";
import { useProductViewTracking } from "@/renderer/analytics/useProductViewTracking";
import { isRemoteSession, readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { buildWslProjectDistrosKey } from "@/renderer/state/projectKeys";
import { PageLayout } from "@/renderer/components/layout/PageLayout";
import { MobileMachineToolbar } from "@/renderer/components/common/MobileMachineToolbar";
import { agentStatusNeedsAuthAttention } from "@/shared/agentSelection";
import { getSettingsInstalledAgents } from "@/shared/agentStatus";
import { normalizeAnalyticsProvider } from "@/shared/analytics/posthogPrivacy";
import { ProfileSettings } from "./parts/ProfileSettings";
import { AppearanceSettings } from "./parts/AppearanceSettings";
import { BrowserSettings } from "./parts/BrowserSettings";
import { UsageSettings } from "./parts/UsageSettings";
import { AudioSettings } from "./parts/AudioSettings";
import { GeneralSettings } from "./parts/GeneralSettings";
import { GitSettings } from "./parts/GitSettings";
import { WorktreeSettings } from "./parts/WorktreeSettings";
import { NotificationSettings } from "./parts/NotificationSettings";
import { AISettings } from "./parts/AISettings";
import { AcpRegistrySettings } from "./parts/AcpRegistrySettings";
import { AgentsGeneralSettings } from "./parts/AgentsGeneralSettings";
import { RemoteAccessSettings } from "./parts/RemoteAccessSettings";
import { RemoteServersSettings } from "./parts/RemoteServersSettings";
import { SearchSettings } from "./parts/SearchSettings";
import { ShortcutsSettings } from "./parts/ShortcutsSettings";
import { TerminalSettings } from "./parts/TerminalSettings";
import { ThreadSettings } from "./parts/ThreadSettings";
import { ArchivedThreadsSettings } from "./parts/ArchivedThreadsSettings";
import { ChangelogSettings } from "./parts/ChangelogSettings";
import { AboutSettings } from "./parts/AboutSettings";
import { DevSettings } from "./parts/DevSettings";
import { McpServersSettings } from "./parts/McpServersSettings";
import { SkillsSettings } from "./parts/SkillsSettings";
import { PluginsSettings } from "./parts/PluginsSettings";
import { SettingsSidebar } from "./parts/SettingsSidebar";
import { MobileSettingsIndex } from "./parts/MobileSettingsIndex";
import { WorkspacesSettings } from "./parts/WorkspacesSettings";
import { AgentSettingsEmpty, SingleAgentSettings } from "./parts/SingleAgentSettings";
import type { SettingsSection } from "./parts/types";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import {
  selectBrowserBridgeDesktop,
  selectBrowserBridgeServer,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";

type MobileSettingsScreen = "root" | "desktop" | "detail";
type MobileSettingsParent = "main" | "root" | "desktop";

const DESKTOP_MOBILE_SECTIONS = new Set<SettingsSection>([
  "profile",
  "usage",
  "ai",
  "agentsGeneral",
  "archived",
]);

const SECTION_VIEWS: Partial<Record<SettingsSection, () => ReactNode>> = {
  profile: () => <ProfileSettings />,
  workspaces: () => <WorkspacesSettings />,
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
  remoteAccess: () => <RemoteAccessSettings />,
  remoteServers: () => <RemoteServersSettings />,
  shortcuts: () => <ShortcutsSettings />,
  agents: () => <AgentSettingsEmpty />,
  agentsGeneral: () => <AgentsGeneralSettings />,
  skills: () => <SkillsSettings />,
  mcpServers: () => <McpServersSettings />,
  plugins: () => <PluginsSettings />,
  browser: () => <BrowserSettings />,
  usage: () => <UsageSettings />,
  archived: () => <ArchivedThreadsSettings />,
  changelog: () => <ChangelogSettings />,
  about: () => <AboutSettings />,
  dev: () => <DevSettings />,
};

const MACHINE_BACKED_SECTIONS = new Set<SettingsSection>([
  "profile",
  "git",
  "worktrees",
  "agents",
  "agentsGeneral",
  "acpRegistry",
  "ai",
  "skills",
  "mcpServers",
  "usage",
]);

function renderSection(
  activeSection: SettingsSection,
  onSectionChange: (section: SettingsSection) => void,
  onOpenDesktopSettings: (desktopId: string) => void,
): ReactNode {
  let section: ReactNode;
  if (activeSection === "acpRegistry") {
    section = (
      <AcpRegistrySettings onOpenAgentSettings={(kind) => onSectionChange(`agents:${kind}`)} />
    );
  } else if (activeSection.startsWith("agents:")) {
    section = (
      <SingleAgentSettings
        agentKind={activeSection.slice(7)}
        onOpenProfile={(kind) => onSectionChange(`agents:${kind}`)}
      />
    );
  } else if (activeSection === "remoteServers") {
    section = <RemoteServersSettings onOpenDesktopSettings={onOpenDesktopSettings} />;
  } else {
    section = SECTION_VIEWS[activeSection]?.() ?? null;
  }

  return MACHINE_BACKED_SECTIONS.has(activeSection) || activeSection.startsWith("agents:") ? (
    <BrowserRemoteConnectionGate>{section}</BrowserRemoteConnectionGate>
  ) : (
    section
  );
}

export function settingsSectionProductProperties(activeSection: SettingsSection) {
  if (activeSection.startsWith("agents:")) {
    const provider = normalizeAnalyticsProvider(activeSection.slice(7));
    return {
      key: `settings:agent:${provider}`,
      properties: {
        provider,
        settings_section: "agent",
        settings_scope: "application",
      },
    };
  }
  return {
    key: `settings:${activeSection}`,
    properties: { settings_section: activeSection, settings_scope: "application" },
  };
}

export function SettingsOverlay(props: { onClose: () => void; onBack?: () => void }) {
  const { onClose, onBack = onClose } = props;
  const { t } = useLingui();
  const compactLayout = useCompactLayout();
  const requestedSection = usePanelStore((s) => s.settingsSection);
  const clearSettingsSection = usePanelStore((s) => s.clearSettingsSection);
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    (requestedSection as SettingsSection | null) ?? "general",
  );
  const [mobileScreen, setMobileScreen] = useState<MobileSettingsScreen>(
    requestedSection === null ? "root" : "detail",
  );
  const [mobileDetailParent, setMobileDetailParent] = useState<MobileSettingsParent>(
    requestedSection === null ? "root" : "main",
  );
  const [mobileDesktopParent, setMobileDesktopParent] = useState<"root" | "connections">("root");
  const servers = useRemoteServersStore((state) => state.servers);
  const defaultDesktop = useRemoteServersStore(
    (state) => selectBrowserBridgeServer(state) ?? state.servers[0],
  );
  const [mobileDesktopId, setMobileDesktopId] = useState<string | null>(null);
  const selectedDesktop =
    servers.find((server) => server.desktopId === mobileDesktopId) ?? defaultDesktop;
  const initialRequestedSectionRef = useRef(requestedSection !== null);
  useProductViewTracking(
    {
      ...settingsSectionProductProperties(activeSection),
      seenEvent: "settings.section_seen",
      durationEvent: "settings.section_duration",
    },
    "settings",
  );
  // Apply a deep-link request (e.g. clicking a sidebar usage circle) and clear
  // it so it doesn't re-fire on the next open.
  useEffect(() => {
    if (requestedSection) {
      setActiveSection(requestedSection as SettingsSection);
      setMobileDetailParent(
        initialRequestedSectionRef.current
          ? "main"
          : DESKTOP_MOBILE_SECTIONS.has(requestedSection as SettingsSection)
            ? "desktop"
            : "root",
      );
      initialRequestedSectionRef.current = false;
      setMobileScreen("detail");
      clearSettingsSection();
    }
  }, [requestedSection, clearSettingsSection]);

  useEffect(() => {
    if (mobileDesktopId && !servers.some((server) => server.desktopId === mobileDesktopId)) {
      setMobileDesktopId(null);
    }
  }, [mobileDesktopId, servers]);

  const changeMobileDesktop = (desktopId: string | null) => {
    if (!desktopId) return;
    setMobileDesktopId(desktopId);
    selectBrowserBridgeDesktop(desktopId);
  };

  // Pending scroll-to-setting target, set when a settings search result is
  // clicked. The token re-fires the effect when the same setting is picked
  // twice. Local (not a store): only this overlay coordinates the scroll, and it
  // has to land *after* the section content remounts (`key={activeSection}`).
  const [scrollTarget, setScrollTarget] = useState<{ anchor: string; token: number } | null>(null);
  const scrollTokenRef = useRef(0);
  const navigateToSection = useCallback(
    (section: SettingsSection, anchor?: string, parent: MobileSettingsParent = "root") => {
      setActiveSection(section);
      setMobileDetailParent(parent);
      setMobileScreen("detail");
      if (anchor) {
        scrollTokenRef.current += 1;
        setScrollTarget({ anchor, token: scrollTokenRef.current });
      }
    },
    [],
  );

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
        el.classList.add("poracode-setting-highlight");
        el.addEventListener(
          "animationend",
          () => el.classList.remove("poracode-setting-highlight"),
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
      .filter(agentStatusNeedsAuthAttention)
      .map((status) => status.kind),
  );
  const isAgentsSectionActive = activeSection === "agents" || activeSection.startsWith("agents:");
  const wslDistros = wslProjectDistrosKey ? wslProjectDistrosKey.split("\0") : [];
  const section = renderSection(
    activeSection,
    (nextSection) => navigateToSection(nextSection, undefined, mobileDetailParent),
    (desktopId) => {
      changeMobileDesktop(desktopId);
      setMobileDesktopParent("connections");
      setMobileScreen("desktop");
    },
  );
  const remoteSession = isRemoteSession();
  const showMobileDesktopPicker =
    compactLayout && remoteSession && selectedDesktop !== undefined && mobileScreen === "desktop";
  const openSchedules = useAppStore((state) => state.openSchedules);
  const detailTitle = (() => {
    if (activeSection === "general") return t`General`;
    if (activeSection === "appearance") return t`Appearance`;
    if (activeSection === "notifications") return t`Notifications`;
    if (activeSection === "terminal") return t`Terminal`;
    if (activeSection === "git") return t`Git`;
    if (activeSection === "profile") return t`Profile`;
    if (activeSection === "usage") return t`Provider Usage`;
    if (activeSection === "ai") return t`AI Helpers`;
    if (activeSection === "agentsGeneral") return t`Agents`;
    if (activeSection === "archived") return t`Archived Threads`;
    if (activeSection === "remoteServers") return t`Connections`;
    return t`Settings`;
  })();
  const compactTitle =
    mobileScreen === "root"
      ? t`Settings`
      : mobileScreen === "desktop"
        ? t`Desktop Settings`
        : detailTitle;

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

  const mobileIndex = (
    <MobileSettingsIndex
      screen={mobileScreen === "desktop" ? "desktop" : "device"}
      hasDesktop={!remoteSession || selectedDesktop !== undefined}
      showArchived={!remoteSession}
      onOpenDesktop={() => setMobileScreen("desktop")}
      onOpenSchedules={() => {
        onClose();
        openSchedules();
      }}
      onOpenSection={(nextSection) =>
        navigateToSection(nextSection, undefined, mobileScreen === "desktop" ? "desktop" : "root")
      }
    />
  );

  const detailContent =
    activeSection === "acpRegistry" ? (
      <div key={activeSection} className="relative h-full min-h-0">
        {section}
      </div>
    ) : (
      <div
        key={activeSection}
        data-settings-scroll-area="true"
        className={
          compactLayout
            ? "m-settings__body relative"
            : "relative h-full min-h-0 overflow-y-auto px-6 pb-8 pt-4 [overflow-anchor:none] [scrollbar-gutter:stable]"
        }
      >
        {section}
        {isAgentsSectionActive && isRefreshingAgents ? (
          <div className="absolute inset-0 z-20 bg-background/90 backdrop-blur-sm">
            <AgentDiscoveryScreen wslDistros={wslDistros} onCancel={cancelRefreshAgents} />
          </div>
        ) : null}
      </div>
    );

  const pageContent = compactLayout && mobileScreen !== "detail" ? mobileIndex : detailContent;
  const scopedPageContent =
    showMobileDesktopPicker && selectedDesktop ? (
      <div className="m-machine-scoped-content relative h-full min-h-0">
        <div key={selectedDesktop.desktopId} className="h-full min-h-0">
          {pageContent}
        </div>
        <MobileMachineToolbar
          desktopId={selectedDesktop.desktopId}
          onDesktopChange={changeMobileDesktop}
        />
      </div>
    ) : (
      pageContent
    );

  return (
    <PageLayout
      title={t`Settings`}
      compactHome={false}
      compactTitle={compactTitle}
      onCompactBack={() => {
        if (mobileScreen === "root") {
          onBack();
        } else if (mobileScreen === "desktop") {
          if (mobileDesktopParent === "connections") {
            setActiveSection("remoteServers");
            setMobileDetailParent("main");
            setMobileScreen("detail");
          } else {
            setMobileScreen("root");
          }
        } else if (mobileDetailParent === "main") {
          onBack();
        } else {
          setMobileScreen(mobileDetailParent);
        }
      }}
      mobileNavigation
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
      content={scopedPageContent}
    />
  );
}
