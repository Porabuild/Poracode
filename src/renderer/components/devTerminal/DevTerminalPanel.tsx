import { useEffect, useRef, useState } from "react";
import { Columns2, Plus, Trash2 } from "lucide-react";
import { Tabs } from "@heroui/react";
import type { Project } from "../../../shared/contracts";
import { readBridge } from "../../bridge";
import { useDevTerminalStore, type DevTerminalTab } from "../../state/devTerminalStore";
import { useSharedSettings } from "../../state/sharedSettingsStore";
import { XTermSurface } from "../terminal/XTermSurface";
import { buildWorktreeLocation } from "../../../shared/worktree";
import { ContextMenu } from "../common";

const SPLIT_MIN_PERCENT = 15;
const SPLIT_DEFAULT_PERCENT = 50;
const SPLIT_STORAGE_KEY = "lightcode-split-percent";

function readSplitPercent(): number {
  try {
    const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= SPLIT_MIN_PERCENT && parsed <= 100 - SPLIT_MIN_PERCENT) {
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return SPLIT_DEFAULT_PERCENT;
}

function TerminalSurfaces(props: {
  tabs: DevTerminalTab[];
  selectedTabId: string;
  activeTab: DevTerminalTab | undefined;
  markTabActive: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
}) {
  const { tabs, selectedTabId, activeTab, markTabActive, updateTabTitle } = props;
  const [splitPercent, setSplitPercent] = useState(readSplitPercent);
  const [resizing, setResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startPercent: 0 });

  useEffect(() => {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent));
  }, [splitPercent]);

  useEffect(() => {
    if (!resizing) return;

    function onMouseMove(e: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;
      const totalWidth = container.offsetWidth;
      const deltaPx = e.clientX - dragRef.current.startX;
      const deltaPercent = (deltaPx / totalWidth) * 100;
      const next = dragRef.current.startPercent + deltaPercent;
      if (next >= SPLIT_MIN_PERCENT && next <= 100 - SPLIT_MIN_PERCENT) {
        setSplitPercent(next);
      }
    }

    function onMouseUp() {
      setResizing(false);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing]);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startPercent: splitPercent };
    setResizing(true);
  }

  if (activeTab?.splitId) {
    return (
      <div
        ref={containerRef}
        className={`flex h-full min-h-0 w-full ${resizing ? "select-none" : ""}`}
      >
        <div
          className="relative h-full min-h-0 min-w-0 overflow-hidden"
          style={{ flexBasis: `${splitPercent}%`, flexGrow: 0, flexShrink: 0 }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === selectedTabId ? "" : "invisible"}`}
            >
              <XTermSurface
                terminalId={tab.id}
                onActivity={() => markTabActive(tab.id)}
                onBell={() => markTabActive(tab.id)}
                onTitleChange={(title) => updateTabTitle(tab.id, title)}
              />
            </div>
          ))}
        </div>
        <div
          className="lightcode-pane-divider"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize split"
        />
        <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          {tabs
            .filter((t) => t.splitId)
            .map((tab) => (
              <div
                key={tab.splitId}
                className={`absolute inset-0 ${tab.id === selectedTabId ? "" : "invisible"}`}
              >
                <XTermSurface
                  terminalId={tab.splitId!}
                  onActivity={() => markTabActive(tab.id)}
                  onBell={() => markTabActive(tab.id)}
                  onTitleChange={(title) => updateTabTitle(tab.splitId!, title)}
                />
              </div>
            ))}
        </div>
        {resizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`absolute inset-0 ${tab.id === selectedTabId ? "" : "invisible"}`}
        >
          <XTermSurface
            terminalId={tab.id}
            onActivity={() => markTabActive(tab.id)}
            onBell={() => markTabActive(tab.id)}
            onTitleChange={(title) => updateTabTitle(tab.id, title)}
          />
        </div>
      ))}
    </div>
  );
}

export function DevTerminalPanel(props: { projects: Project[] }) {
  const { projects } = props;
  const tabs = useDevTerminalStore((s) => s.tabs);
  const activeProjectId = useDevTerminalStore((s) => s.activeProjectId);
  const activeTabId = useDevTerminalStore((s) => s.activeTabId);
  const removeTab = useDevTerminalStore((s) => s.removeTab);
  const setActiveTab = useDevTerminalStore((s) => s.setActiveTab);
  const addTab = useDevTerminalStore((s) => s.addTab);
  const splitTabAction = useDevTerminalStore((s) => s.splitTab);
  const closeSplitAction = useDevTerminalStore((s) => s.closeSplit);
  const markTabActive = useDevTerminalStore((s) => s.markTabActive);
  const updateTabTitle = useDevTerminalStore((s) => s.updateTabTitle);
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const spawnedRef = useRef(new Set<string>());

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const selectedTabId =
    projectTabs.find((tab) => tab.id === activeTabId)?.id ?? projectTabs.at(-1)?.id ?? "__add__";
  const activeTab = projectTabs.find((t) => t.id === selectedTabId);

  const isBottom = terminalPosition === "bottom";

  // Re-spawn shells for persisted tabs and splits on mount.
  useEffect(() => {
    for (const tab of tabs) {
      const project = projects.find((p) => p.id === tab.projectId);
      if (!project) continue;
      const location = tab.worktreePath
        ? buildWorktreeLocation(project.location, tab.worktreePath)
        : project.location;

      if (!spawnedRef.current.has(tab.id)) {
        spawnedRef.current.add(tab.id);
        void readBridge()
          .startShell({ shellId: tab.id, projectLocation: location })
          .catch(() => undefined);
      }

      if (tab.splitId && !spawnedRef.current.has(tab.splitId)) {
        spawnedRef.current.add(tab.splitId);
        void readBridge()
          .startShell({ shellId: tab.splitId, projectLocation: location })
          .catch(() => undefined);
      }
    }
  }, [tabs, projects]);

  function handleCloseTab(tab: DevTerminalTab) {
    const remaining = tabs.filter((t) => t.id !== tab.id);
    if (tab.splitId) {
      void readBridge()
        .closeThread({ threadId: tab.splitId })
        .catch(() => undefined);
      spawnedRef.current.delete(tab.splitId);
    }
    removeTab(tab.id);
    void readBridge()
      .closeThread({ threadId: tab.id })
      .catch(() => undefined);
    spawnedRef.current.delete(tab.id);

    const remainingForProject = remaining.filter((t) => t.projectId === tab.projectId);
    if (remainingForProject.length === 0) {
      useDevTerminalStore.getState().closePanel();
    }
  }

  function handleAddTab() {
    if (!activeProject) return;
    const tab = addTab(activeProject.id, activeProject.name);
    setActiveTab(tab.id);
  }

  function handleSplitTab(tab: DevTerminalTab) {
    if (!activeProject) return;
    const project = projects.find((p) => p.id === tab.projectId);
    if (!project) return;

    const splitId = splitTabAction(tab.id);
    const location = tab.worktreePath
      ? buildWorktreeLocation(project.location, tab.worktreePath)
      : project.location;
    void readBridge()
      .startShell({ shellId: splitId, projectLocation: location })
      .catch(() => undefined);
    spawnedRef.current.add(splitId);
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
      return [{ id: "close-split", label: "Close Split", icon: <Columns2 className="size-4" /> }];
    }
    return [
      { id: "split-terminal", label: "Split Terminal", icon: <Columns2 className="size-4" /> },
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
    // If the selected id is a splitId, activate the parent tab instead
    // so both panes show the split view.
    const parentTab = projectTabs.find((t) => t.splitId === id);
    setActiveTab(parentTab ? parentTab.id : id);
  }

  const emptyState = projectTabs.length === 0 ? (
    <div className="flex h-full items-center justify-center">
      <button
        className="cursor-default rounded-lg border border-dashed border-white/10 px-6 py-4 text-sm text-muted transition-colors hover:border-white/20 hover:text-foreground"
        onClick={handleAddTab}
        type="button"
      >
        Open a terminal
      </button>
    </div>
  ) : null;

  if (isBottom) {
    // Bottom position: vertical tabs on the left, terminals on the right.
    // All tabs (primary + split) are flat Tabs.Tab children in one Tabs instance.
    // Both primary and split highlight when parent is selected, so we build a
    // selectedKeys-like list via a composite selectedKey.

    // Build flat entries: primary tabs + their split children
    type TabRow = { id: string; tab: DevTerminalTab; isSplit: boolean };
    const tabRows: TabRow[] = [];
    for (const tab of projectTabs) {
      tabRows.push({ id: tab.id, tab, isSplit: false });
      if (tab.splitId) tabRows.push({ id: tab.splitId, tab, isSplit: true });
    }

    return (
      <div className="flex h-full min-h-0 bg-[var(--content-background)]">
        <div className="w-[140px] shrink-0 overflow-y-auto border-r border-[color:var(--border)] py-1">
          <Tabs
            className="w-full"
            orientation="vertical"
            variant="secondary"
            selectedKey={selectedTabId}
            onSelectionChange={handleSelectionChange}
          >
            <Tabs.ListContainer className="w-full p-0">
              <Tabs.List aria-label="Terminal tabs" className="w-full *:h-6">
                {tabRows.map(({ id, tab, isSplit }) => {
                  const parentSelected = selectedTabId === tab.id;
                  return (
                  <Tabs.Tab
                    key={id}
                    id={id}
                    className={`group w-full gap-0 pl-3 pr-1 text-xs ${isSplit && parentSelected ? "text-foreground" : ""}`}
                  >
                    <ContextMenu
                      items={getTabContextItems(tab)}
                      onAction={(key) => handleTabContextAction(tab, key)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-1">
                        <span className="truncate" title={isSplit ? (tab.splitTitle ?? tab.title) : tab.title}>
                          {isSplit ? (tab.splitTitle ?? tab.title) : tab.title}
                        </span>
                        {isSplit ? (
                          <Columns2 className="size-3 shrink-0 text-accent" />
                        ) : null}
                      </span>
                    </ContextMenu>
                    <button
                      className="ml-auto flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition hover:text-danger group-hover:opacity-100"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (isSplit) handleCloseSplit(tab);
                        else handleCloseTab(tab);
                      }}
                      tabIndex={-1}
                      type="button"
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  );
                })}
                <Tabs.Tab id="__add__" className="min-w-8 max-w-8 px-0">
                  <Plus className="size-3.5 text-muted" />
                  <Tabs.Indicator className="invisible" />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>

        <div className="relative min-h-0 min-w-0 flex-1 px-4 pt-2 pb-2">
          <TerminalSurfaces
            tabs={tabs}
            selectedTabId={selectedTabId}
            activeTab={activeTab}
            markTabActive={markTabActive}
            updateTabTitle={updateTabTitle}
          />
          {emptyState}
        </div>
      </div>
    );
  }

  // Right position: horizontal tabs on top, terminals below
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]">
      <div className="flex shrink-0 items-center gap-0 px-3">
        <Tabs
          className="min-w-0 flex-1 overflow-x-auto rounded-lg"
          variant="secondary"
          selectedKey={selectedTabId}
          onSelectionChange={handleSelectionChange}
        >
          <Tabs.ListContainer className="w-fit p-0.5">
            <Tabs.List aria-label="Terminal tabs" className="*:h-6">
              {projectTabs.map((tab) => (
                <Tabs.Tab
                  key={tab.id}
                  id={tab.id}
                  className="group w-[120px] gap-0 pl-3 pr-1 text-xs"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="truncate" title={tab.title}>
                      {tab.title}
                    </span>
                  </span>
                  <button
                    className="ml-auto flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition hover:text-danger group-hover:opacity-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleCloseTab(tab);
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    <Trash2 className="size-3" />
                  </button>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
              <Tabs.Tab id="__add__" className="min-w-8 max-w-8 px-0">
                <Plus className="size-3.5 text-muted" />
                <Tabs.Indicator className="invisible" />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>

      <div className="relative min-h-0 flex-1 px-6 pt-2 pb-2">
        <TerminalSurfaces
          tabs={tabs}
          selectedTabId={selectedTabId}
          activeTab={activeTab}
          markTabActive={markTabActive}
          updateTabTitle={updateTabTitle}
        />
        {emptyState}
      </div>
    </div>
  );
}
