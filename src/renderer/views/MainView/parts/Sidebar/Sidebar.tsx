import { ChevronRight, Globe, House, PanelLeft, Plus, Search, Settings2 } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { Trans, useLingui } from "@lingui/react/macro";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { getAppName } from "@/shared/appName";
import type { Thread } from "@/shared/contracts";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { SidebarButton } from "@/renderer/components/common/SidebarButton";
import { ThreadProviderIcon } from "@/renderer/components/providers/ThreadProviderIcon";
import {
  sidebarBodyScrollClass,
  sidebarColumnLayoutClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { SIDEBAR_MIN_WIDTH } from "@/renderer/views/MainView/parts/AppShell/parts/useResizablePanels";
import { SidebarPanelDragButton } from "@/renderer/views/MainView/parts/Sidebar/parts/SidebarPanelDragButton";
import { SidebarProjectSection } from "@/renderer/views/MainView/parts/Sidebar/parts/SidebarProjectSection";
import { ThreadContextMenu } from "@/renderer/views/MainView/parts/Sidebar/parts/ThreadContextMenu";
import {
  selectBrowserPanelAvailable,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { readBridge } from "@/renderer/bridge";
import { hasMacWindowChrome } from "@/renderer/components/layout/windowChrome";
import { hasClientCapability } from "@/renderer/clientRuntime";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import {
  openRemoteAccessSettings,
  openSettings,
  toggleBrowserPanel,
} from "@/renderer/actions/panelActions";
import { ProviderUsageRail } from "@/renderer/components/providers/ProviderUsageRail";
import { openTerminal } from "@/renderer/actions/terminalActions";
import { openNewThread, openThread } from "@/renderer/actions/threadActions";
import {
  useCurrentProjectId,
  useIsCurrentThread,
  useCurrentWorktreePath,
  useIsProjectTerminalActive,
  useIsProjectTerminalBusy,
  useIsProjectTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useAppStore } from "@/renderer/state/appStore";
import { useIsPanelTabVisible } from "@/renderer/state/panelDockSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  useProjectIdsHiddenByWorkspace,
  useWorkspaceProjectIds,
  useWorkspaceThreadFilter,
} from "@/renderer/state/workspaceSelectors";
import { SidebarFlatThreadList } from "./parts/SidebarFlatThreadList";
import { SidebarFooterNav } from "./parts/SidebarFooterNav";
import { SidebarProjectThreadList } from "./parts/SidebarProjectThreadList";
import { UpdateButtons } from "./parts/UpdateButtons";
import { useSidebarShortcuts } from "./parts/sidebarShortcuts";
import { WhatsNewButton } from "./parts/WhatsNewButton";
import {
  RemoteAccessSidebarIcon,
  type RemoteAccessSidebarStatus,
  RemoteAccessSidebarTooltip,
} from "./parts/RemoteAccessSidebarIcon";
import { DeferredSettingsOverlay } from "@/renderer/deferredFeatures";
import { MobileHomeActions } from "./parts/MobileHomeActions";

function prewarmSettings(): void {
  void DeferredSettingsOverlay.preload();
}

function HomeTerminalButton(props: { projectId: string; projectName: string }) {
  const { t } = useLingui();
  const hasTerminal = useIsProjectTerminalOpen(props.projectId);
  const isActiveTerminal = useIsProjectTerminalActive(props.projectId);
  const isBusy = useIsProjectTerminalBusy(props.projectId);
  // Match thread / project-header collapse so idle home terminal does not
  // reserve row width for the project title.
  const hiddenPanelButtonClass =
    "w-0 -mr-[3px] overflow-hidden p-0 opacity-0 pointer-events-none group-hover:w-[18px] group-hover:mr-0 group-hover:p-0.5 group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:w-[18px] focus-visible:mr-0 focus-visible:p-0.5 focus-visible:opacity-100 focus-visible:pointer-events-auto";
  return (
    <SidebarPanelDragButton
      panel="terminal"
      projectId={props.projectId}
      ariaLabel={t`Terminal for ${props.projectName}`}
      className={`flex h-[18px] shrink-0 cursor-grab items-center justify-center rounded transition-[opacity,color,background-color] hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
        isActiveTerminal
          ? "w-[18px] p-0.5 text-accent"
          : hasTerminal
            ? "w-[18px] p-0.5 text-foreground"
            : `text-muted/60 ${hiddenPanelButtonClass}`
      }`}
      onPress={() => openTerminal(props.projectId)}
    >
      <AnimatedTerminalIcon className="size-3.5" isBusy={isBusy} />
    </SidebarPanelDragButton>
  );
}

function ThreadIcon(props: { thread: Thread }) {
  return <ThreadProviderIcon thread={props.thread} className="size-3.5" />;
}

function CollapsedThreadRailButton(props: { thread: Thread; projectName?: string }) {
  const { thread, projectName } = props;
  const isActive = useIsCurrentThread(thread.id);
  const project = useAppStore((s) => s.projects.find((p) => p.id === thread.projectId));
  const title = thread.done ? (
    <span className="opacity-50 line-through">{thread.title}</span>
  ) : (
    thread.title
  );
  const button = (
    <SidebarButton
      iconOnly
      icon={<ThreadIcon thread={thread} />}
      label={title}
      {...(projectName
        ? {
            tooltip: (
              <span>
                {title}
                <span className="text-muted"> — {projectName}</span>
              </span>
            ),
          }
        : {})}
      isActive={isActive}
      onPress={() => openThread(thread.id)}
    />
  );
  if (!project) return button;
  // No `onRename`: the icon rail has no inline rename affordance.
  return (
    <ThreadContextMenu thread={thread} project={project}>
      {button}
    </ThreadContextMenu>
  );
}

function CollapsedThreadRail() {
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const showProjectName = usePanelStore((s) => s.threadListLayout === "flat");
  const isThreadInActiveWorkspace = useWorkspaceThreadFilter();
  const projects = useAppStore((s) => s.projects);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const activeThreads = useAppStore(
    useShallow((state) =>
      state.threads.filter(
        (thread) =>
          thread.status !== "inactive" &&
          !thread.done &&
          !thread.archived &&
          (homeScopeEnabled || !isHomeProjectId(thread.projectId)) &&
          isThreadInActiveWorkspace(thread),
      ),
    ),
  );
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });

  return (
    <div
      ref={setScrollContainer}
      className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      style={scrollFadeStyle}
    >
      {activeThreads.map((thread) => {
        const projectName = showProjectName ? projectsById.get(thread.projectId)?.name : undefined;
        return (
          <CollapsedThreadRailButton
            key={thread.id}
            thread={thread}
            {...(projectName ? { projectName } : {})}
          />
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const { t } = useLingui();
  // Only the active workspace's projects; Home is handled separately below and
  // belongs to every workspace.
  const projectIds = useWorkspaceProjectIds();
  const hiddenProjectCount = useProjectIdsHiddenByWorkspace().size;
  const homeProject = useAppStore((state) => state.projects.find(isHomeProject));
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const remoteAccessEnabled = useSharedSettings((s) => s.remoteAccessEnabled);
  const showRemoteAccess = hasClientCapability("localBackend");
  const currentProjectId = useCurrentProjectId();
  const currentWorktreePath = useCurrentWorktreePath();
  const sortMode = usePanelStore((s) => s.threadSortMode);
  const listLayout = usePanelStore((s) => s.threadListLayout);
  const compactLayout = useCompactLayout();
  const effectiveListLayout = compactLayout ? "flat" : listLayout;
  const settingsOpen = usePanelStore((s) => s.settingsOpen);
  const settingsSection = usePanelStore((s) => s.settingsSection);
  // Remote Access has its own sidebar entry, so the generic Settings button
  // lights up for every other section.
  const remoteAccessSettingsActive = settingsOpen && settingsSection === "remoteAccess";
  const otherSettingsActive = settingsOpen && !remoteAccessSettingsActive;
  const threadSearchOpen = usePanelStore((s) => s.threadSearchOpen);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const browserOnScreen = useIsPanelTabVisible("browser");
  const browserVisible = browserPanelOpen && browserOnScreen;
  const browserPanelAvailable = useRemoteServersStore(selectBrowserPanelAvailable);
  const openThreadSearch = usePanelStore((s) => s.openThreadSearch);
  const isHomeProjectCollapsed = useSidebarUiStore((s) =>
    homeProject ? (s.collapsedProjects[homeProject.id] ?? false) : false,
  );
  const setProjectCollapsed = useSidebarUiStore((s) => s.setProjectCollapsed);
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
  const setWorktreeCollapsed = useSidebarUiStore((s) => s.setWorktreeCollapsed);
  const { isCollapsed, expand } = useSidebar();
  const openHome = useAppStore((s) => s.openHome);
  const appView = useAppStore((s) => s.view);
  const appNameForHome = getAppName(readBridge().channel, import.meta.env.DEV);
  const [remoteAccessStatus, setRemoteAccessStatus] = useState<RemoteAccessSidebarStatus>("off");
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });
  const sidebarShortcuts = useSidebarShortcuts();

  useEffect(() => {
    if (currentProjectId) {
      setProjectCollapsed(currentProjectId, false);
    }
  }, [currentProjectId, setProjectCollapsed]);

  useEffect(() => {
    if (currentWorktreePath) {
      setWorktreeCollapsed(currentWorktreePath, false);
    }
  }, [currentWorktreePath, setWorktreeCollapsed]);

  useEffect(() => {
    if (!showRemoteAccess || !remoteAccessEnabled) {
      setRemoteAccessStatus("off");
      return;
    }

    let cancelled = false;
    const readRemoteStatus = async () => {
      try {
        const info = await readBridge().getRemoteAccessPairing();
        if (cancelled) return;
        setRemoteAccessStatus(
          info.status === "ready" ? "online" : info.status === "starting" ? "starting" : "off",
        );
      } catch {
        if (!cancelled) {
          setRemoteAccessStatus("off");
        }
      }
    };

    setRemoteAccessStatus((current) => (current === "online" ? current : "starting"));
    void readRemoteStatus();
    const interval = window.setInterval(() => {
      void readRemoteStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [remoteAccessEnabled, showRemoteAccess]);

  return (
    <div className="poracode-main-sidebar relative h-full">
      {isCollapsed && (
        <div
          className={`absolute inset-y-0 left-0 z-10 flex h-full min-h-0 w-12 flex-col items-start gap-3 pl-2 pb-0 ${
            // macOS keeps the rail below the hidden-inset titlebar (traffic
            // lights); elsewhere the header spacer is dropped when collapsed,
            // so the rail starts at the window top with its own inset.
            hasMacWindowChrome() ? "pt-0" : "pt-2"
          }`}
        >
          <div className="flex shrink-0 flex-col gap-0.5">
            <SidebarButton
              iconOnly
              icon={<House className="size-3.5" />}
              label={appNameForHome}
              isActive={appView.kind === "home"}
              onPress={() => startTransition(() => openHome())}
            />
            <SidebarButton
              iconOnly
              icon={<Search className="size-3.5" />}
              label={t`Search`}
              isActive={threadSearchOpen}
              onPress={openThreadSearch}
            />
            {browserPanelAvailable ? (
              <SidebarButton
                iconOnly
                icon={<Globe className="size-3.5" />}
                label={t`Browser`}
                isActive={browserVisible}
                onPress={toggleBrowserPanel}
              />
            ) : null}
            <SidebarButton
              iconOnly
              icon={<Plus className="size-3.5" />}
              label={t`New thread`}
              isActive={appView.kind === "draft"}
              onPress={() => openNewThread()}
            />
          </div>
          <CollapsedThreadRail />

          <div className="flex flex-col gap-1 border-t border-[var(--hairline)] pt-2 pb-2 pr-2">
            <ProviderUsageRail orientation="column" />
            <UpdateButtons iconOnly />
            <WhatsNewButton iconOnly />
            {sidebarShortcuts.map((shortcut) => (
              <SidebarButton
                key={shortcut.id}
                iconOnly
                icon={shortcut.icon}
                label={shortcut.label}
                isActive={shortcut.isActive}
                onPress={shortcut.onPress}
              />
            ))}
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label={t`Settings`}
              isActive={otherSettingsActive}
              onPreload={prewarmSettings}
              onPress={openSettings}
            />
            {showRemoteAccess ? (
              <SidebarButton
                iconOnly
                icon={<RemoteAccessSidebarIcon status={remoteAccessStatus} />}
                label={t`Remote Access`}
                tooltip={<RemoteAccessSidebarTooltip status={remoteAccessStatus} />}
                isActive={remoteAccessSettingsActive}
                onPreload={prewarmSettings}
                onPress={openRemoteAccessSettings}
              />
            ) : null}
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
        className={`${sidebarColumnLayoutClass} ${isCollapsed ? "invisible" : ""}`}
        style={{ minWidth: SIDEBAR_MIN_WIDTH }}
      >
        {projectIds.length === 0 && !(homeScopeEnabled && homeProject) ? (
          <div
            ref={setScrollContainer}
            className={`${sidebarBodyScrollClass()} flex items-center justify-center`}
            style={scrollFadeStyle}
          >
            <p className="text-center text-sm text-muted">
              {hiddenProjectCount > 0 ? (
                // Distinguish "you own no projects" from "this workspace is
                // empty but others aren't" — otherwise the sidebar looks broken.
                <Trans>No projects in this workspace</Trans>
              ) : (
                <Trans>Add a project to start</Trans>
              )}
            </p>
          </div>
        ) : effectiveListLayout === "flat" ? (
          // The flat list pins its filter/new-thread head above the thread
          // rows, so it renders its own scroll container instead of this one.
          <SidebarFlatThreadList sortMode={sortMode} />
        ) : (
          <div
            ref={setScrollContainer}
            className={sidebarBodyScrollClass()}
            style={scrollFadeStyle}
          >
            <div className="space-y-4">
              {homeScopeEnabled && homeProject ? (
                <section className="space-y-0.5">
                  <SidebarButton
                    icon={
                      <ChevronRight
                        className={`size-3.5 shrink-0 text-muted transition-transform ${
                          isHomeProjectCollapsed ? "" : "rotate-90"
                        }`}
                      />
                    }
                    label={
                      <span className="flex items-center gap-1.5">
                        <House className="size-3.5 shrink-0 text-muted" />
                        <span className="truncate text-xs font-semibold text-foreground">
                          <Trans>Home</Trans>
                        </span>
                      </span>
                    }
                    className="poracode-sidebar-project-nudge !pl-1"
                    onPress={() => toggleProjectCollapsed(homeProject.id)}
                    suffix={
                      <HomeTerminalButton
                        projectId={homeProject.id}
                        projectName={homeProject.name}
                      />
                    }
                  />
                  {isHomeProjectCollapsed ? null : (
                    <SidebarProjectThreadList project={homeProject} sortMode={sortMode} />
                  )}
                </section>
              ) : null}
              {projectIds.map((projectId, projectIndex) => (
                <SidebarProjectSection
                  key={projectId}
                  projectId={projectId}
                  projectIndex={projectIndex}
                  sortMode={sortMode}
                />
              ))}
            </div>
          </div>
        )}

        {compactLayout ? null : <ProviderUsageRail orientation="row" />}
        {compactLayout ? (
          <MobileHomeActions />
        ) : (
          <SidebarFooterNav
            remoteAccessStatus={remoteAccessStatus}
            showRemoteAccess={showRemoteAccess}
          />
        )}
      </div>
    </div>
  );
}
