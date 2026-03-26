import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { Tabs } from "@heroui/react";
import type { Project } from "../../../shared/contracts";
import { readBridge } from "../../bridge";
import { useDevTerminalStore, type DevTerminalTab } from "../../state/devTerminalStore";
import { XTermSurface } from "../terminal/XTermSurface";

export function DevTerminalPanel(props: { projects: Project[] }) {
  const { projects } = props;
  const tabs = useDevTerminalStore((s) => s.tabs);
  const activeProjectId = useDevTerminalStore((s) => s.activeProjectId);
  const activeTabId = useDevTerminalStore((s) => s.activeTabId);
  const removeTab = useDevTerminalStore((s) => s.removeTab);
  const setActiveTab = useDevTerminalStore((s) => s.setActiveTab);
  const addTab = useDevTerminalStore((s) => s.addTab);
  const spawnedRef = useRef(new Set<string>());

  const projectTabs = tabs.filter((t) => t.projectId === activeProjectId);
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Re-spawn shells for persisted tabs on mount.
  useEffect(() => {
    for (const tab of tabs) {
      if (spawnedRef.current.has(tab.id)) continue;
      const project = projects.find((p) => p.id === tab.projectId);
      if (!project) continue;
      spawnedRef.current.add(tab.id);
      void readBridge()
        .startShell({ shellId: tab.id, projectLocation: project.location })
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
          className="lightcode-thin-scrollbar min-w-0 flex-1 overflow-x-auto rounded-lg"
          variant="primary"
          {...(activeTabId ? { selectedKey: activeTabId } : {})}
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
                  <span className="truncate">{tab.title}</span>
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
      <div className="relative min-h-0 flex-1 pt-1 pb-2 pl-3 pr-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`absolute inset-0 pt-1 pb-2 pl-3 pr-1 ${tab.id === activeTabId ? "" : "invisible"}`}
          >
            <XTermSurface terminalId={tab.id} />
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
