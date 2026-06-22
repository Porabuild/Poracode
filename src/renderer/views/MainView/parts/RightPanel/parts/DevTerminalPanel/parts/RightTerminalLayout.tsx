import { PanelRightClose, Plus, Trash2 } from "lucide-react";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { Project, TerminalSize } from "@/shared/contracts";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { PanelHeaderProjectName } from "@/renderer/components/layout/PanelHeaderProjectName";
import {
  panelHeaderIconButtonClass,
  panelHeaderRowClass,
} from "@/renderer/components/layout/sidebarChrome";
import { TerminalSurfaces } from "./TerminalSurfaces";

export function RightTerminalLayout(props: {
  tabs: DevTerminalTab[];
  projectTabs: DevTerminalTab[];
  activeProject: Project | undefined;
  selectedTabId: string;
  activeTab: DevTerminalTab | undefined;
  focusRequestId: number;
  markTabActive: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  fadeStyle: { opacity: number; transition: string };
  emptyState: React.ReactNode;
  hideHeader: boolean | undefined;
  handleCloseTab: (tab: DevTerminalTab) => void;
  handleSelectionChange: (key: string | number) => void;
  onTerminalResize?: (terminalId: string, size: TerminalSize) => void;
}) {
  const { t } = useLingui();
  const {
    tabs,
    projectTabs,
    activeProject,
    selectedTabId,
    activeTab,
    focusRequestId,
    markTabActive,
    updateTabTitle,
    fadeStyle,
    emptyState,
    hideHeader,
    handleCloseTab,
    handleSelectionChange,
    onTerminalResize,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--content-background)]" style={fadeStyle}>
      {!hideHeader && activeProject && (
        <div className={panelHeaderRowClass}>
          <PanelHeaderProjectName name={activeProject.name} maxWidthClass="max-w-[100px]" />
          <div className="flex-1" />
          <button
            type="button"
            className={panelHeaderIconButtonClass}
            title={t`Hide terminal`}
            onClick={() => useDevTerminalStore.getState().closePanel()}
          >
            <PanelRightClose className="size-3" />
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-0 px-2">
        <Tabs
          className="min-w-0 flex-1 overflow-x-auto rounded-lg"
          variant="secondary"
          selectedKey={selectedTabId}
          onSelectionChange={handleSelectionChange}
        >
          <Tabs.ListContainer className="w-fit p-0.5">
            <Tabs.List aria-label={t`Terminal tabs`} className="*:h-6">
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

      <div className="relative min-h-0 flex-1 px-2">
        <TerminalSurfaces
          tabs={tabs}
          selectedTabId={selectedTabId}
          activeTab={activeTab}
          focusRequestId={focusRequestId}
          markTabActive={markTabActive}
          updateTabTitle={updateTabTitle}
          {...(onTerminalResize ? { onTerminalResize } : {})}
        />
        {emptyState}
      </div>
    </div>
  );
}
