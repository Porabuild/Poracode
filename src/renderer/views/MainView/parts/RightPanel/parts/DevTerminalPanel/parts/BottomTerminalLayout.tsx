import { Columns2, Loader2, PanelBottomClose, Play, Plus, Trash2 } from "lucide-react";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import type { TerminalSize } from "@/shared/contracts";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { ContextMenu } from "@/renderer/components/common/ContextMenu";
import { PanelHeaderProjectName } from "@/renderer/components/layout/PanelHeaderProjectName";
import {
  panelHeaderIconButtonClass,
  panelHeaderRowClass,
} from "@/renderer/components/layout/sidebarChrome";
import { TerminalSurfaces } from "./TerminalSurfaces";
import {
  BOTTOM_TERMINAL_SIDEBAR_MAX_WIDTH,
  BOTTOM_TERMINAL_SIDEBAR_MIN_WIDTH,
  useBottomTerminalSidebarResize,
} from "./useBottomTerminalSidebarResize";

export function BottomTerminalLayout(props: {
  tabs: DevTerminalTab[];
  projectTabs: DevTerminalTab[];
  activeScopeLabel: string | undefined;
  selectedTabId: string;
  activeTab: DevTerminalTab | undefined;
  focusRequestId: number;
  markTabActive: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  fadeStyle: { opacity: number; transition: string };
  emptyState: React.ReactNode;
  handleCloseTab: (tab: DevTerminalTab) => void;
  handleCloseSplit: (tab: DevTerminalTab) => void;
  handleSelectionChange: (key: string | number) => void;
  getTabContextItems: (
    tab: DevTerminalTab,
  ) => { id: string; label: string; icon: React.ReactNode }[];
  handleTabContextAction: (tab: DevTerminalTab, key: string) => void;
  onTerminalResize?: (terminalId: string, size: TerminalSize) => void;
  watchTerminal?: (terminalId: string, listener: TerminalFeedListener) => () => void;
}) {
  const { t } = useLingui();
  const {
    tabs,
    projectTabs,
    activeScopeLabel,
    selectedTabId,
    activeTab,
    focusRequestId,
    markTabActive,
    updateTabTitle,
    fadeStyle,
    emptyState,
    handleCloseTab,
    handleCloseSplit,
    handleSelectionChange,
    getTabContextItems,
    handleTabContextAction,
    onTerminalResize,
    watchTerminal,
  } = props;
  const { sidebarRef, sidebarWidth, handleResizeStart, handleResizeKeyDown } =
    useBottomTerminalSidebarResize();
  const runningTabs = useDevTerminalStore((state) => state.runningTabs);

  // Build flat entries: primary tabs + their split children
  type TabRow = { id: string; tab: DevTerminalTab; isSplit: boolean };
  const tabRows: TabRow[] = [];
  for (const tab of projectTabs) {
    tabRows.push({ id: tab.id, tab, isSplit: false });
    if (tab.splitId) tabRows.push({ id: tab.splitId, tab, isSplit: true });
  }

  return (
    <div className="flex h-full min-h-0 bg-[var(--content-background)]" style={fadeStyle}>
      <div
        ref={sidebarRef}
        className="flex shrink-0 flex-col overflow-hidden"
        style={{ width: sidebarWidth, minWidth: sidebarWidth }}
      >
        {activeScopeLabel && (
          <div className={panelHeaderRowClass}>
            <PanelHeaderProjectName
              name={activeScopeLabel}
              maxWidthClass="max-w-[calc(100%-1.75rem)]"
            />
            <div className="flex-1" />
            <button
              type="button"
              className={panelHeaderIconButtonClass}
              title={t`Hide terminal`}
              onClick={() => useDevTerminalStore.getState().closePanel()}
            >
              <PanelBottomClose className="size-3" />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <Tabs
            className="w-full"
            orientation="vertical"
            variant="secondary"
            selectedKey={selectedTabId}
            onSelectionChange={handleSelectionChange}
          >
            <Tabs.ListContainer className="w-full p-0">
              <Tabs.List aria-label={t`Terminal tabs`} className="w-full *:h-6">
                {tabRows.map(({ id, tab, isSplit }) => {
                  const parentSelected = selectedTabId === tab.id;
                  return (
                    <Tabs.Tab
                      key={id}
                      id={id}
                      className={`group w-full gap-0 pl-3 pr-1 text-xs ${isSplit && parentSelected ? "text-foreground" : ""}`}
                      {...(!isSplit && tab.runActionId
                        ? {
                            "aria-label": runningTabs[tab.id]
                              ? t`${tab.title}, Running`
                              : t`${tab.title}, Idle`,
                          }
                        : {})}
                    >
                      <ContextMenu
                        items={getTabContextItems(tab)}
                        onAction={(key) => handleTabContextAction(tab, key)}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          <span
                            className="truncate"
                            title={isSplit ? (tab.splitTitle ?? tab.title) : tab.title}
                          >
                            {isSplit ? (tab.splitTitle ?? tab.title) : tab.title}
                          </span>
                          {!isSplit && tab.runActionId ? (
                            <>
                              {runningTabs[tab.id] ? (
                                <Loader2
                                  className="size-3 shrink-0 animate-spin text-accent"
                                  aria-hidden
                                />
                              ) : (
                                <Play className="size-3 shrink-0 text-accent" aria-hidden />
                              )}
                            </>
                          ) : null}
                          {isSplit ? <Columns2 className="size-3 shrink-0 text-accent" /> : null}
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
      </div>

      <div
        className="poracode-pane-divider"
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        role="separator"
        tabIndex={0}
        aria-label={t`Resize sidebar`}
        aria-orientation="vertical"
        aria-valuemin={BOTTOM_TERMINAL_SIDEBAR_MIN_WIDTH}
        aria-valuemax={BOTTOM_TERMINAL_SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
      />

      <div className="relative min-h-0 min-w-0 flex-1 px-2 pt-2">
        <TerminalSurfaces
          tabs={tabs}
          selectedTabId={selectedTabId}
          activeTab={activeTab}
          focusRequestId={focusRequestId}
          markTabActive={markTabActive}
          updateTabTitle={updateTabTitle}
          {...(watchTerminal ? { watchTerminal } : {})}
          {...(onTerminalResize ? { onTerminalResize } : {})}
        />
        {emptyState}
      </div>
    </div>
  );
}
