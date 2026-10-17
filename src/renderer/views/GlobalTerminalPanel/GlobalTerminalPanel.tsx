import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@heroui/react";
import type { TerminalSize } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import { useDevTerminalStore, type TerminalTab } from "@/renderer/state/devTerminalStore";
import { useGlobalTerminalStore } from "@/renderer/state/globalTerminalStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { closeGlobalTerminalTab } from "@/renderer/actions/terminalActions";
import { wasShellStartedDeferred } from "@/renderer/utils/shellUtils";
import { BottomTerminalLayout } from "@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/parts/BottomTerminalLayout";
import { RightTerminalLayout } from "@/renderer/views/MainView/parts/RightPanel/parts/DevTerminalPanel/parts/RightTerminalLayout";

export function GlobalTerminalPanel({ visible = true }: { visible?: boolean }) {
  const { t } = useLingui();
  const panelOpen = useDevTerminalStore((state) => state.isOpen && state.source === "global");
  const focusRequestId = useDevTerminalStore((state) => state.focusRequestId);
  const tabs = useGlobalTerminalStore((state) => state.tabs);
  const activeTabId = useGlobalTerminalStore((state) => state.activeTabId);
  const updateTabTitle = useGlobalTerminalStore((state) => state.updateTabTitle);
  const position = useSharedSettings((state) => state.terminalPosition);
  const isOpen = panelOpen && visible;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  function handleTerminalResize(terminalId: string, size: TerminalSize) {
    if (wasShellStartedDeferred(terminalId)) return;
    const focusedElement = document.activeElement;
    void useGlobalTerminalStore
      .getState()
      .ensureStarted(terminalId, size)
      .then(() => {
        const panel = useDevTerminalStore.getState();
        if (
          panel.isOpen &&
          panel.source === "global" &&
          visible &&
          useGlobalTerminalStore.getState().activeTabId === terminalId &&
          (document.activeElement === focusedElement || document.activeElement === document.body)
        ) {
          panel.openGlobalPanel();
        }
      })
      .catch((error) => toast.danger(friendlyError(error)));
  }

  function handleCloseTab(tab: TerminalTab) {
    closeGlobalTerminalTab(tab.id);
  }

  function handleSelectionChange(key: string | number) {
    const store = useGlobalTerminalStore.getState();
    if (key === "__add__") store.addTab();
    else store.setActiveTab(String(key));
  }

  const emptyState =
    tabs.length === 0 ? (
      <div className="flex h-full items-center justify-center">
        <button
          className="cursor-default rounded-lg border border-dashed border-[var(--hairline-strong)] px-6 py-4 text-sm text-muted transition-colors hover:border-[var(--hairline-strong)] hover:text-foreground"
          onClick={() => useGlobalTerminalStore.getState().addTab()}
          type="button"
        >
          <Trans>Open a terminal</Trans>
        </button>
      </div>
    ) : null;

  const layoutProps = {
    tabs,
    projectTabs: tabs,
    activeScopeLabel: t`Terminal`,
    selectedTabId: activeTabId ?? "__add__",
    activeTab,
    focusRequestId,
    visible: isOpen,
    markTabActive: () => {},
    updateTabTitle,
    fadeStyle: { opacity: 1, transition: "none" },
    emptyState,
    handleCloseTab,
    handleSelectionChange,
    onTerminalResize: handleTerminalResize,
    onTerminalExited: closeGlobalTerminalTab,
  };

  return (
    <section aria-label={t`Terminal`} data-global-terminal={activeTabId} className="h-full min-h-0">
      {position === "bottom" ? (
        <BottomTerminalLayout
          {...layoutProps}
          handleCloseSplit={handleCloseTab}
          getTabContextItems={() => []}
          handleTabContextAction={() => {}}
        />
      ) : (
        <RightTerminalLayout {...layoutProps} hideHeader />
      )}
    </section>
  );
}
