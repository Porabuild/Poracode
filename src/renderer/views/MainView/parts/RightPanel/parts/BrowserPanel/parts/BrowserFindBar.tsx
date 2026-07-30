import { useEffect, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { FindBar } from "@/renderer/components/find/FindBar";
import { useFindBarChrome } from "@/renderer/components/find/useFindBarChrome";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";

export function BrowserFindBar() {
  const tabId = useBrowserFindStore((state) => state.tabId);
  const activeTab = useBrowserPanelStore((state) =>
    state.activeTabId ? state.tabs.find((tab) => tab.tabId === state.activeTabId) : undefined,
  );
  if (!tabId || activeTab?.tabId !== tabId || activeTab.internalPage) return null;
  return <ActiveBrowserFindBar tabId={tabId} />;
}

function ActiveBrowserFindBar({ tabId }: { tabId: string }) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useBrowserFindStore((state) => state.query);
  const matchCase = useBrowserFindStore((state) => state.matchCase);
  const matches = useBrowserFindStore((state) => state.matches);
  const currentIndex = useBrowserFindStore((state) => state.currentIndex);
  const openToken = useBrowserFindStore((state) => state.openToken);
  const setQuery = useBrowserFindStore((state) => state.setQuery);
  const toggleMatchCase = useBrowserFindStore((state) => state.toggleMatchCase);
  const close = useBrowserFindStore((state) => state.close);

  useEffect(
    () => () => {
      readBridge()
        .browserStopFindInPage({ tabId, action: "clearSelection" })
        .catch(() => {});
      const findState = useBrowserFindStore.getState();
      if (findState.tabId === tabId) findState.close();
    },
    [tabId],
  );

  function find(text: string, forward: boolean, findNext: boolean, nextMatchCase = matchCase) {
    if (!text) return;
    readBridge()
      .browserFindInPage({ tabId, text, forward, findNext, matchCase: nextMatchCase })
      .catch(() => {});
  }

  function onQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    if (!nextQuery) {
      readBridge()
        .browserStopFindInPage({ tabId, action: "clearSelection" })
        .catch(() => {});
      return;
    }
    find(nextQuery, true, true);
  }

  function onToggleMatchCase() {
    const nextMatchCase = !matchCase;
    toggleMatchCase();
    find(query, true, true, nextMatchCase);
  }

  function onClose() {
    close();
  }

  useFindBarChrome(inputRef, openToken, onClose);

  return (
    <div className="pointer-events-auto absolute right-4 top-2 z-30">
      <FindBar
        ref={inputRef}
        query={query}
        onQueryChange={onQueryChange}
        caseSensitive={matchCase}
        onToggleCaseSensitive={onToggleMatchCase}
        matchCount={matches}
        currentIndex={currentIndex}
        onNext={() => find(query, true, false)}
        onPrev={() => find(query, false, false)}
        onClose={onClose}
        placeholder={t`Find in page`}
      />
    </div>
  );
}
