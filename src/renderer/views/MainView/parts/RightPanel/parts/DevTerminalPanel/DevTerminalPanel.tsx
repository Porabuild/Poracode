import { useEffect, useRef, useState } from "react";
import { toast } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Columns2 } from "lucide-react";
import {
  productSurfaceView,
  useProductViewTracking,
} from "@/renderer/analytics/useProductViewTracking";
import { readBridge } from "@/renderer/bridge";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { watchRemoteTerminal } from "@/renderer/state/remoteTerminalFeed";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { closeAllPanels } from "@/renderer/actions/panelActions";
import { clearEagerShellStart, wasShellStartedEagerly } from "@/renderer/utils/shellUtils";
import { formatProjectScopeLabel } from "@/renderer/utils/projectScopeLabel";
import type { TerminalSize } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import { buildWorktreeLocation } from "@/shared/worktree";
import { BottomTerminalLayout } from "./parts/BottomTerminalLayout";
import { RightTerminalLayout } from "./parts/RightTerminalLayout";
import { MobileTerminalLayout } from "./parts/MobileTerminalLayout";

export function DevTerminalPanel(props: {
  hideHeader?: boolean;
  positionOverride?: "bottom" | "right" | "mobile";
  onEmpty?: () => void;
  watchTerminal?: (terminalId: string, listener: TerminalFeedListener) => () => void;
}) {
  const { hideHeader, onEmpty } = props;
  const { t } = useLingui();
  const projects = useAppStore((s) => s.projects);
  const tabs = useDevTerminalStore((s) => s.tabs);
  const activeProjectId = useDevTerminalStore((s) => s.activeProjectId);
  const activeWorktreePath = useDevTerminalStore((s) => s.activeWorktreePath);
  const activeTabId = useDevTerminalStore((s) => s.activeTabId);
  const focusRequestId = useDevTerminalStore((s) => s.focusRequestId);
  const removeTab = useDevTerminalStore((s) => s.removeTab);
  const setActiveTab = useDevTerminalStore((s) => s.setActiveTab);
  const addTab = useDevTerminalStore((s) => s.addTab);
  const splitTabAction = useDevTerminalStore((s) => s.splitTab);
  const closeSplitAction = useDevTerminalStore((s) => s.closeSplit);
  const markTabActive = useDevTerminalStore((s) => s.markTabActive);
  const updateTabTitle = useDevTerminalStore((s) => s.updateTabTitle);
  const savedTerminalPosition = useSharedSettings((s) => s.terminalPosition);
  const terminalPosition = props.positionOverride ?? savedTerminalPosition;
  const spawnedRef = useRef(new Set<string>());

  const projectTabs = tabs.filter((tab) => {
    if (tab.projectId !== activeProjectId) return false;
    if (activeWorktreePath) return tab.worktreePath === activeWorktreePath;
    return !tab.worktreePath;
  });
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const remoteServerId = activeProject?.remoteServerId;
  const watchTerminal =
    props.watchTerminal ??
    (remoteServerId
      ? (terminalId: string, listener: TerminalFeedListener) =>
          watchRemoteTerminal(remoteServerId, terminalId, listener)
      : undefined);
  const activeScopeLabel = activeProject
    ? formatProjectScopeLabel(activeProject.name, activeWorktreePath ?? undefined)
    : undefined;
  const selectedTabId =
    projectTabs.find((tab) => tab.id === activeTabId)?.id ?? projectTabs.at(-1)?.id ?? "__add__";
  const activeTab = projectTabs.find((tab) => tab.id === selectedTabId);

  const isBottom = terminalPosition === "bottom";
  const isMobile = terminalPosition === "mobile";

  // Cross-fade when switching between project and worktree contexts.
  const isOpen = useDevTerminalStore((s) => s.isOpen);
  useProductViewTracking(productSurfaceView("terminal", "panel"), "panel", {
    active: isOpen && !hideHeader,
    finishWhenInactive: true,
  });
  const contextKey = `${activeProjectId}:${activeWorktreePath ?? ""}`;
  const [fadeOpacity, setFadeOpacity] = useState(1);
  const prevContextRef = useRef(contextKey);
  useEffect(() => {
    if (prevContextRef.current !== contextKey) {
      prevContextRef.current = contextKey;
      if (isOpen && activeProjectId) {
        setFadeOpacity(0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setFadeOpacity(1));
        });
      }
    }
  }, [contextKey, isOpen, activeProjectId]);
  const fadeStyle = {
    opacity: fadeOpacity,
    transition: fadeOpacity < 1 ? "none" : "opacity 150ms ease-out",
  } as const;

  // Deferred shell spawn: each XTermSurface emits onTerminalResize once it
  // has mounted, fit, and measured the real viewport. We start the PTY then,
  // passing the measured cols/rows as initialSize so the shell's first output
  // (Node deprecation warnings, dev server banners, vite logs) wraps to the
  // actual viewport instead of the 120-col fallback — xterm never reflows
  // pre-wrapped scrollback, so getting the very first lines right matters.
  function handleTerminalResize(terminalId: string, size: TerminalSize) {
    if (spawnedRef.current.has(terminalId)) return;
    // Run actions and setup scripts start their shell before the surface
    // mounts; re-issuing startShell would kill that PTY (and the command or
    // process running in it). The surface resizes the live PTY on its own.
    if (wasShellStartedEagerly(terminalId)) return;
    const owningTab = tabs.find((tab) => tab.id === terminalId || tab.splitId === terminalId);
    if (!owningTab) return;
    // An idle action tab preserves its completed output. Only another Run
    // action should replace its PTY; remounting the panel must not create an
    // unrelated interactive shell in the action-owned tab.
    if (owningTab.id === terminalId && owningTab.runActionId) return;
    const project = projects.find((p) => p.id === owningTab.projectId);
    if (!project) return;
    const location = owningTab.worktreePath
      ? buildWorktreeLocation(project.location, owningTab.worktreePath)
      : project.location;
    spawnedRef.current.add(terminalId);
    void readBridge()
      .startShell({
        shellId: terminalId,
        projectLocation: location,
        ...(owningTab.worktreePath ? { worktreePath: owningTab.worktreePath } : {}),
        initialSize: size,
      })
      .catch((error) => {
        spawnedRef.current.delete(terminalId);
        toast.danger(friendlyError(error));
      });
  }

  function handleCloseTab(tab: DevTerminalTab) {
    const remaining = tabs.filter((other) => other.id !== tab.id);
    if (tab.splitId) {
      void readBridge()
        .closeThread({ threadId: tab.splitId })
        .catch(() => undefined);
      spawnedRef.current.delete(tab.splitId);
      clearEagerShellStart(tab.splitId);
    }
    removeTab(tab.id);
    void readBridge()
      .closeThread({ threadId: tab.id })
      .catch(() => undefined);
    spawnedRef.current.delete(tab.id);
    clearEagerShellStart(tab.id);

    const remainingInContext = remaining.filter((other) => {
      if (other.projectId !== tab.projectId) return false;
      if (activeWorktreePath) return other.worktreePath === activeWorktreePath;
      return !other.worktreePath;
    });
    if (remainingInContext.length === 0) {
      if (!isBottom && !isMobile) closeAllPanels();
      useDevTerminalStore.getState().closePanel();
      onEmpty?.();
    }
  }

  function handleAddTab() {
    if (!activeProject) return;
    const name = activeWorktreePath
      ? (activeWorktreePath.split(/[/\\]/).pop() ?? activeProject.name)
      : activeProject.name;
    const tab = addTab(activeProject.id, name, activeWorktreePath ?? undefined);
    setActiveTab(tab.id);
  }

  function handleSplitTab(tab: DevTerminalTab) {
    if (!activeProject) return;
    // The split's XTermSurface mounts on next render and will trigger
    // handleTerminalResize, which spawns the shell with the real size.
    splitTabAction(tab.id);
  }

  function handleCloseSplit(tab: DevTerminalTab) {
    const splitId = closeSplitAction(tab.id);
    if (splitId) {
      void readBridge()
        .closeThread({ threadId: splitId })
        .catch(() => undefined);
      spawnedRef.current.delete(splitId);
    }
  }

  function getTabContextItems(tab: DevTerminalTab) {
    if (!isBottom) return [];

    if (tab.splitId) {
      return [{ id: "close-split", label: t`Close Split`, icon: <Columns2 className="size-4" /> }];
    }
    return [
      { id: "split-terminal", label: t`Split Terminal`, icon: <Columns2 className="size-4" /> },
    ];
  }

  function handleTabContextAction(tab: DevTerminalTab, key: string) {
    if (key === "split-terminal") handleSplitTab(tab);
    if (key === "close-split") handleCloseSplit(tab);
  }

  function handleSelectionChange(key: string | number) {
    const id = String(key);
    if (id === "__add__") {
      handleAddTab();
      return;
    }
    const parentTab = projectTabs.find((tab) => tab.splitId === id);
    setActiveTab(parentTab ? parentTab.id : id);
  }

  const emptyState =
    projectTabs.length === 0 ? (
      <div className="flex h-full items-center justify-center">
        <button
          className="cursor-default rounded-lg border border-dashed border-[var(--hairline-strong)] px-6 py-4 text-sm text-muted transition-colors hover:border-[var(--hairline-strong)] hover:text-foreground"
          onClick={handleAddTab}
          type="button"
        >
          <Trans>Open a terminal</Trans>
        </button>
      </div>
    ) : null;

  if (isMobile) {
    return (
      <MobileTerminalLayout
        tabs={tabs}
        projectTabs={projectTabs}
        selectedTabId={selectedTabId}
        activeTab={activeTab}
        focusRequestId={focusRequestId}
        markTabActive={markTabActive}
        updateTabTitle={updateTabTitle}
        fadeStyle={fadeStyle}
        emptyState={emptyState}
        handleCloseTab={handleCloseTab}
        handleSelectionChange={handleSelectionChange}
        onTerminalResize={handleTerminalResize}
        {...(watchTerminal ? { watchTerminal } : {})}
      />
    );
  }

  if (isBottom) {
    return (
      <BottomTerminalLayout
        tabs={tabs}
        projectTabs={projectTabs}
        activeScopeLabel={activeScopeLabel}
        selectedTabId={selectedTabId}
        activeTab={activeTab}
        focusRequestId={focusRequestId}
        markTabActive={markTabActive}
        updateTabTitle={updateTabTitle}
        fadeStyle={fadeStyle}
        emptyState={emptyState}
        handleCloseTab={handleCloseTab}
        handleCloseSplit={handleCloseSplit}
        handleSelectionChange={handleSelectionChange}
        getTabContextItems={getTabContextItems}
        handleTabContextAction={handleTabContextAction}
        onTerminalResize={handleTerminalResize}
        {...(watchTerminal ? { watchTerminal } : {})}
      />
    );
  }

  return (
    <RightTerminalLayout
      tabs={tabs}
      projectTabs={projectTabs}
      activeScopeLabel={activeScopeLabel}
      selectedTabId={selectedTabId}
      activeTab={activeTab}
      focusRequestId={focusRequestId}
      markTabActive={markTabActive}
      updateTabTitle={updateTabTitle}
      fadeStyle={fadeStyle}
      emptyState={emptyState}
      hideHeader={hideHeader}
      handleCloseTab={handleCloseTab}
      handleSelectionChange={handleSelectionChange}
      onTerminalResize={handleTerminalResize}
      {...(watchTerminal ? { watchTerminal } : {})}
    />
  );
}
