import type { CSSProperties, ReactNode } from "react";
import { Tabs } from "@heroui/react";
import { useLingui } from "@lingui/react/macro";
import { Loader2, Play, Plus, X } from "lucide-react";
import type { TerminalSize } from "@/shared/contracts";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import { useKeyboardOffset } from "@/renderer/components/mobileComposer/useKeyboardOffset";
import { useDevTerminalStore, type DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { MobileTerminalAccessory } from "./MobileTerminalAccessory";
import { TerminalSurfaces } from "./TerminalSurfaces";

export function MobileTerminalLayout(props: {
  tabs: DevTerminalTab[];
  projectTabs: DevTerminalTab[];
  selectedTabId: string;
  activeTab: DevTerminalTab | undefined;
  focusRequestId: number;
  markTabActive: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  fadeStyle: { opacity: number; transition: string };
  emptyState: ReactNode;
  handleCloseTab: (tab: DevTerminalTab) => void;
  handleSelectionChange: (key: string | number) => void;
  onTerminalResize?: (terminalId: string, size: TerminalSize) => void;
  watchTerminal?: (terminalId: string, listener: TerminalFeedListener) => () => void;
}) {
  const { t } = useLingui();
  const keyboardOffset = useKeyboardOffset();
  const runningTabs = useDevTerminalStore((state) => state.runningTabs);
  const style = {
    ...props.fadeStyle,
    "--m-terminal-keyboard-offset": `${keyboardOffset}px`,
  } as CSSProperties;

  return (
    <div className="m-terminal-page" style={style}>
      <div className="m-terminal-page__surface">
        <TerminalSurfaces
          tabs={props.tabs}
          selectedTabId={props.selectedTabId}
          activeTab={props.activeTab}
          focusRequestId={props.focusRequestId}
          markTabActive={props.markTabActive}
          updateTabTitle={props.updateTabTitle}
          mobile
          allowSplit={false}
          {...(props.watchTerminal ? { watchTerminal: props.watchTerminal } : {})}
          {...(props.onTerminalResize ? { onTerminalResize: props.onTerminalResize } : {})}
        />
        {props.emptyState}
      </div>

      <div className="m-terminal-page__dock">
        {props.activeTab ? <MobileTerminalAccessory terminalId={props.activeTab.id} /> : null}
        <Tabs
          className="min-w-0 w-full"
          variant="secondary"
          selectedKey={props.selectedTabId}
          onSelectionChange={props.handleSelectionChange}
        >
          <Tabs.ListContainer className="w-full rounded-none bg-transparent p-0">
            <Tabs.List aria-label={t`Terminal tabs`} className="m-terminal-tabs">
              {props.projectTabs.map((tab) => (
                <Tabs.Tab
                  key={tab.id}
                  id={tab.id}
                  className="m-terminal-tab"
                  {...(tab.runActionId
                    ? {
                        "aria-label": runningTabs[tab.id]
                          ? t`${tab.title}, Running`
                          : t`${tab.title}, Idle`,
                      }
                    : {})}
                >
                  <span className="m-terminal-tab__body">
                    <span className="m-terminal-tab__title" title={tab.title}>
                      {tab.title}
                    </span>
                    {tab.runActionId ? (
                      runningTabs[tab.id] ? (
                        <Loader2 className="size-3 shrink-0 animate-spin text-accent" aria-hidden />
                      ) : (
                        <Play className="size-3 shrink-0 text-accent" aria-hidden />
                      )
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="m-terminal-tab__close"
                    aria-label={t`Close`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      props.handleCloseTab(tab);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
              <Tabs.Tab
                id="__add__"
                aria-label={t`Open terminal`}
                className="m-terminal-tab m-terminal-tab--add"
              >
                <Plus className="size-4" />
                <Tabs.Indicator className="invisible" />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
    </div>
  );
}
