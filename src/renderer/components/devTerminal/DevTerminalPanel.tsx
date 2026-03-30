import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Tabs } from "@heroui/react";
import type { Project } from "../../../shared/contracts";
import { readBridge } from "../../bridge";
import { useDevTerminalStore, type DevTerminalTab } from "../../state/devTerminalStore";
import { XTermSurface } from "../terminal/XTermSurface";
import { buildWorktreeLocation } from "../../../shared/worktree";

export function DevTerminalPanel(props: { projects: Project[] }) {
  const { projects } = props;
  const tabs = useDevTerminalStore((s) => s.tabs);
  const activeProjectId = useDevTerminalStore((s) => s.activeProjectId);
  const activeTabId = useDevTerminalStore((s) => s.activeTabId);
  const removeTab = useDevTerminalStore((s) => s.removeTab);
  const setActiveTab = useDevTerminalStore((s) => s.setActiveTab);
  const addTab = useDevTerminalStore((s) => s.addTab);
  const tabActivity = useDevTerminalStore((s) => s.tabActivity);
  const markTabActive = useDevTerminalStore((s) => s.markTabActive);
  const updateTabTitle = useDevTerminalStore((s) => s.updateTabTitle);
  const spawnedRef = useRef(new Set<string>());

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const selectedTabId =
    projectTabs.find((tab) => tab.id === activeTabId)?.id ?? projectTabs.at(-1)?.id ?? "__add__";

  // Re-spawn shells for persisted tabs on mount.
  useEffect(() => {
    for (const tab of tabs) {
      if (spawnedRef.current.has(tab.id)) continue;
      const project = projects.find((p) => p.id === tab.projectId);
      if (!project) continue;
      spawnedRef.current.add(tab.id);
      const location = tab.worktreePath
        ? buildWorktreeLocation(project.location, tab.worktreePath)
        : project.location;
      void readBridge()
        .startShell({ shellId: tab.id, projectLocation: location })
        .catch(() => undefined);
    }
  }, [tabs, projects]);

  function handleCloseTab(tab: DevTerminalTab) {
    const remaining = tabs.filter((t) => t.id !== tab.id);
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
    // The useEffect below will spawn the shell when it sees the new tab.
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)] pt-5">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0 px-3">
        <Tabs
          className="min-w-0 flex-1 overflow-x-auto rounded-lg"
          variant="primary"
          selectedKey={selectedTabId}
          onSelectionChange={(key) => {
            const id = String(key);
            if (id === "__add__") {
              handleAddTab();
            } else {
              setActiveTab(id);
            }
          }}
        >
          <Tabs.ListContainer className="w-fit p-0.5">
            <Tabs.List aria-label="Terminal tabs" className="*:h-6">
              {projectTabs.map((tab, index) => (
                <Tabs.Tab
                  key={tab.id}
                  id={tab.id}
                  className="group max-w-[100px] gap-1 pr-1 text-xs"
                >
                  {index > 0 ? <Tabs.Separator /> : null}
                  {tabActivity[tab.id] ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                  ) : null}
                  <span className="truncate" title={tab.title}>
                    {tab.title}
                  </span>
                  <button
                    className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition hover:text-danger group-hover:opacity-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleCloseTab(tab);
                    }}
                    tabIndex={-1}
                    type="button"
                  >
                    <X className="size-3" />
                  </button>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
              <Tabs.Tab id="__add__" className="min-w-12 max-w-12 px-0">
                {projectTabs.length > 0 ? <Tabs.Separator /> : null}
                <Plus className="size-3.5 text-muted" />
                <Tabs.Indicator className="invisible" />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>

      {/* Terminal surfaces — render ALL tabs (all projects) to keep them alive, only show active */}
      <div className="relative min-h-0 flex-1 px-6 pt-1 pb-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 px-6 pt-1 pb-2 ${tab.id === selectedTabId ? "" : "invisible"}`}
          >
            <XTermSurface
              terminalId={tab.id}
              onActivity={() => markTabActive(tab.id)}
              onBell={() => markTabActive(tab.id)}
              onTitleChange={(title) => updateTabTitle(tab.id, title)}
            />
          </div>
        ))}

        {projectTabs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <button
              className="cursor-default rounded-lg border border-dashed border-white/10 px-6 py-4 text-sm text-muted transition-colors hover:border-white/20 hover:text-foreground"
              onClick={handleAddTab}
              type="button"
            >
              Open a terminal
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
