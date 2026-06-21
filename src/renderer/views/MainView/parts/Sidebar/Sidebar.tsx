import { Tooltip } from "@heroui/react";
import {
  ChevronRight,
  Download,
  House,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings2,
  Smartphone,
} from "lucide-react";
import { startTransition, useEffect } from "react";
import { useShallow } from "zustand/shallow";
import { AnimatedTerminalIcon } from "@/renderer/components/common/AnimatedTerminalIcon";
import { getAppName } from "@/shared/appName";
import type { Thread } from "@/shared/contracts";
import { formatBytes } from "@/shared/formatBytes";
import { isHomeProject, isHomeProjectId } from "@/shared/homeScope";
import { SidebarButton } from "@/renderer/components/common";
import { ThreadProviderIcon } from "@/renderer/components/providers";
import {
  sidebarBodyScrollClass,
  sidebarColumnLayoutClass,
  sidebarFooterNavClass,
} from "@/renderer/components/layout/sidebarChrome";
import { useSidebar } from "@/renderer/views/MainView/parts/AppShell/AppShell";
import { SIDEBAR_MIN_WIDTH } from "@/renderer/views/MainView/parts/AppShell/parts/useResizablePanels";
import { SidebarPanelDragButton } from "@/renderer/views/MainView/parts/Sidebar/parts/SidebarPanelDragButton";
import { SidebarProjectSection } from "@/renderer/views/MainView/parts/Sidebar/parts/SidebarProjectSection";
import { readBridge } from "@/renderer/bridge";
import { openRemoteAccessSettings, openSettings } from "@/renderer/actions/panelActions";
import { ProviderUsageRail } from "@/renderer/components/providers/ProviderUsageRail";
import { openTerminal } from "@/renderer/actions/terminalActions";
import { openThread } from "@/renderer/actions/threadActions";
import {
  useCurrentProjectId,
  useCurrentThreadIds,
  useCurrentWorktreePath,
  useIsProjectTerminalActive,
  useIsProjectTerminalBusy,
  useIsProjectTerminalOpen,
} from "@/renderer/hooks/uiSelectors";
import { useScrollFade } from "@/renderer/hooks/useScrollFade";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSidebarUiStore } from "@/renderer/state/sidebarUiStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useUpdateStore } from "@/renderer/state/updateStore";
import { SidebarProjectThreadList } from "./parts/SidebarProjectThreadList";

function UpdateButtons(props: { iconOnly?: boolean }) {
  const { iconOnly = false } = props;
  const updatePhase = useUpdateStore((s) => s.phase);
  const updateVersion = useUpdateStore((s) => s.version);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);
  const transferred = useUpdateStore((s) => s.downloadTransferred);
  const total = useUpdateStore((s) => s.downloadTotal);
  const bytesPerSecond = useUpdateStore((s) => s.downloadBytesPerSecond);

  if (updatePhase !== "downloading" && updatePhase !== "downloaded") {
    return null;
  }

  if (updatePhase === "downloading") {
    const versionLabel = updateVersion ? ` v${updateVersion}` : "";
    const byteLine =
      transferred != null && total != null && total > 0
        ? `${formatBytes(transferred)} / ${formatBytes(total)}`
        : null;
    const speedLine =
      bytesPerSecond != null && bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : null;

    if (iconOnly) {
      return (
        <Tooltip delay={150}>
          <Tooltip.Trigger>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Download className="size-4 animate-pulse text-accent" />
            </div>
          </Tooltip.Trigger>
          <Tooltip.Content placement="right">
            Downloading{versionLabel} — {Math.round(downloadPercent)}%
            {byteLine ? ` · ${byteLine}` : ""}
            {speedLine ? ` · ${speedLine}` : ""}
          </Tooltip.Content>
        </Tooltip>
      );
    }

    return (
      <div className="flex w-full items-center gap-2 rounded-3xl px-2 py-1.5 text-muted">
        <Download className="size-4 shrink-0 animate-pulse text-accent" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-xs">Downloading{versionLabel}</span>
          <div className="flex min-w-0 items-center justify-between gap-2 text-xs opacity-80">
            <span className="truncate">{byteLine ?? ""}</span>
            <span className="shrink-0 whitespace-nowrap">
              {Math.round(downloadPercent)}%{speedLine ? ` · ${speedLine}` : ""}
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-[var(--row-active)]">
            <div
              className="h-1 rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round(downloadPercent)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarButton
      iconOnly={iconOnly}
      icon={<RefreshCw className="size-4 text-accent" />}
      label={updateVersion ? `Install v${updateVersion}` : "Install update"}
      onPress={() => void readBridge().installUpdate()}
    />
  );
}

function HomeTerminalButton(props: { projectId: string; projectName: string }) {
  const hasTerminal = useIsProjectTerminalOpen(props.projectId);
  const isActiveTerminal = useIsProjectTerminalActive(props.projectId);
  const isBusy = useIsProjectTerminalBusy(props.projectId);
  return (
    <SidebarPanelDragButton
      panel="terminal"
      projectId={props.projectId}
      ariaLabel={`Terminal for ${props.projectName}`}
      className={`shrink-0 cursor-grab rounded p-0.5 transition-colors hover:bg-[var(--row-hover)] hover:text-foreground active:cursor-grabbing ${
        isActiveTerminal
          ? "text-accent"
          : hasTerminal
            ? "text-foreground"
            : "text-muted/60 opacity-0 group-hover:opacity-100"
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

function CollapsedThreadRail() {
  const currentThreadIds = useCurrentThreadIds();
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const activeThreads = useAppStore(
    useShallow((state) =>
      state.threads.filter(
        (thread) =>
          thread.status !== "inactive" &&
          !thread.done &&
          !thread.archived &&
          (homeScopeEnabled || !isHomeProjectId(thread.projectId)),
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
      {activeThreads.map((thread) => (
        <SidebarButton
          key={thread.id}
          iconOnly
          icon={<ThreadIcon thread={thread} />}
          label={
            thread.done ? (
              <span className="opacity-50 line-through">{thread.title}</span>
            ) : (
              thread.title
            )
          }
          isActive={currentThreadIds.includes(thread.id)}
          onPress={() => openThread(thread.id)}
        />
      ))}
    </div>
  );
}

export function Sidebar() {
  const projectIds = useAppStore(
    useShallow((state) =>
      state.projects.filter((project) => !isHomeProject(project)).map((project) => project.id),
    ),
  );
  const homeProject = useAppStore((state) => state.projects.find(isHomeProject));
  const homeScopeEnabled = useSharedSettings((s) => s.homeScopeEnabled);
  const currentProjectId = useCurrentProjectId();
  const currentWorktreePath = useCurrentWorktreePath();
  const sortMode = usePanelStore((s) => s.threadSortMode);
  const settingsOpen = usePanelStore((s) => s.settingsOpen);
  const settingsSection = usePanelStore((s) => s.settingsSection);
  // Remote Access has its own sidebar entry, so the generic Settings button
  // lights up for every other section.
  const remoteAccessSettingsActive = settingsOpen && settingsSection === "remoteAccess";
  const otherSettingsActive = settingsOpen && !remoteAccessSettingsActive;
  const threadSearchOpen = usePanelStore((s) => s.threadSearchOpen);
  const openThreadSearch = usePanelStore((s) => s.openThreadSearch);
  const isHomeProjectCollapsed = useSidebarUiStore((s) =>
    homeProject ? (s.collapsedProjects[homeProject.id] ?? false) : false,
  );
  const setProjectCollapsed = useSidebarUiStore((s) => s.setProjectCollapsed);
  const toggleProjectCollapsed = useSidebarUiStore((s) => s.toggleProjectCollapsed);
  const setWorktreeCollapsed = useSidebarUiStore((s) => s.setWorktreeCollapsed);
  const { isCollapsed, collapse, expand } = useSidebar();
  const openHome = useAppStore((s) => s.openHome);
  const appView = useAppStore((s) => s.view);
  const appNameForHome = getAppName(readBridge().channel, import.meta.env.DEV);
  const { setScrollContainer, scrollFadeStyle } = useScrollFade<HTMLDivElement>({
    maxFadePx: 10,
  });

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

  return (
    <div className="relative h-full">
      {isCollapsed && (
        <div className="absolute inset-y-0 left-0 z-10 flex h-full min-h-0 w-12 flex-col items-start gap-3 pl-2 pb-0 pt-0">
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
              label="Search"
              isActive={threadSearchOpen}
              onPress={openThreadSearch}
            />
          </div>
          <CollapsedThreadRail />

          <div className="flex flex-col gap-1 border-t border-[var(--hairline)] pt-2 pb-2 pr-2">
            <ProviderUsageRail orientation="column" />
            <UpdateButtons iconOnly />
            <SidebarButton
              iconOnly
              icon={<Settings2 className="size-4" />}
              label="Settings"
              isActive={otherSettingsActive}
              onPress={openSettings}
            />
            <SidebarButton
              iconOnly
              icon={<Smartphone className="size-4" />}
              label="Remote Access"
              isActive={remoteAccessSettingsActive}
              onPress={openRemoteAccessSettings}
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
        className={`${sidebarColumnLayoutClass} ${isCollapsed ? "invisible" : ""}`}
        style={{ minWidth: SIDEBAR_MIN_WIDTH }}
      >
        <div ref={setScrollContainer} className={sidebarBodyScrollClass()} style={scrollFadeStyle}>
          {projectIds.length === 0 && !(homeScopeEnabled && homeProject) ? (
            <div className="pt-4">
              <p className="text-center text-sm text-muted">Add a project to start</p>
            </div>
          ) : (
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
                        <span className="truncate text-xs font-semibold text-foreground">Home</span>
                      </span>
                    }
                    className="lightcode-sidebar-project-nudge !pl-1"
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
          )}
        </div>

        <ProviderUsageRail orientation="row" />
        <div className={sidebarFooterNavClass}>
          <UpdateButtons />
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <SidebarButton
                icon={<Settings2 className="size-4" />}
                label="Settings"
                isActive={otherSettingsActive}
                onPress={openSettings}
              />
            </div>
            <SidebarButton
              iconOnly
              icon={<Smartphone className="size-4" />}
              label="Remote Access"
              isActive={remoteAccessSettingsActive}
              onPress={openRemoteAccessSettings}
            />
          </div>
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
