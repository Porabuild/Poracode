import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { DevTerminalTab } from "@/renderer/state/devTerminalStore";
import { XTermSurface, type XTermSurfaceHandle } from "@/renderer/components/terminal/XTermSurface";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { TerminalSize } from "@/shared/contracts";

const SPLIT_MIN_PERCENT = 15;
const SPLIT_DEFAULT_PERCENT = 50;
const SPLIT_STORAGE_KEY = "lightcode-split-percent";

function readSplitPercent(): number {
  try {
    const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (
        Number.isFinite(parsed) &&
        parsed >= SPLIT_MIN_PERCENT &&
        parsed <= 100 - SPLIT_MIN_PERCENT
      ) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return SPLIT_DEFAULT_PERCENT;
}

export function TerminalSurfaces(props: {
  tabs: DevTerminalTab[];
  selectedTabId: string;
  activeTab: DevTerminalTab | undefined;
  focusRequestId: number;
  markTabActive: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;
  onTerminalResize?: (terminalId: string, size: TerminalSize) => void;
}) {
  const { t } = useLingui();
  const {
    tabs,
    selectedTabId,
    activeTab,
    focusRequestId,
    markTabActive,
    updateTabTitle,
    onTerminalResize,
  } = props;
  const fontSize = useSharedSettings((state) => state.terminalPanelFontSize);
  const [splitPercent, setSplitPercent] = useState(readSplitPercent);
  const terminalRefs = useRef(new Map<string, XTermSurfaceHandle>());
  const activeTabId = activeTab?.id;
  const containerRef = useRef<HTMLDivElement>(null);
  const firstPaneRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startX: 0, startPercent: 0 });
  const splitPercentRef = useRef(splitPercent);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    splitPercentRef.current = splitPercent;
    if (firstPaneRef.current) {
      firstPaneRef.current.style.flexBasis = `${splitPercent}%`;
    }
  }, [splitPercent]);

  useEffect(() => {
    localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercent));
  }, [splitPercent]);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!activeTabId || selectedTabId === "__add__") return;
    let frame = 0;
    let settledFrame = 0;

    frame = requestAnimationFrame(() => {
      settledFrame = requestAnimationFrame(() => {
        terminalRefs.current.get(selectedTabId)?.refit();
        if (activeTab?.splitId) terminalRefs.current.get(activeTab.splitId)?.refit();
        terminalRefs.current.get(selectedTabId)?.focus();
      });
    });

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      if (settledFrame !== 0) cancelAnimationFrame(settledFrame);
    };
  }, [activeTab?.splitId, activeTabId, focusRequestId, selectedTabId]);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    cleanupRef.current?.();
    dragRef.current = { startX: e.clientX, startPercent: splitPercentRef.current };

    const overlay = overlayRef.current;
    if (overlay) overlay.style.display = "block";

    function onMouseMove(ev: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;
      const totalWidth = container.offsetWidth;
      const deltaPx = ev.clientX - dragRef.current.startX;
      const deltaPercent = (deltaPx / totalWidth) * 100;
      const next = dragRef.current.startPercent + deltaPercent;
      if (next >= SPLIT_MIN_PERCENT && next <= 100 - SPLIT_MIN_PERCENT) {
        splitPercentRef.current = next;
        if (firstPaneRef.current) {
          firstPaneRef.current.style.flexBasis = `${next}%`;
        }
      }
    }

    function teardown() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (overlay) overlay.style.display = "none";
      cleanupRef.current = null;
    }

    function onMouseUp() {
      teardown();
      setSplitPercent(splitPercentRef.current);
    }

    cleanupRef.current = teardown;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  if (activeTab?.splitId) {
    return (
      <div ref={containerRef} className="flex h-full min-h-0 w-full">
        <div
          ref={firstPaneRef}
          className="relative h-full min-h-0 min-w-0 overflow-hidden"
          style={{ flexBasis: `${splitPercent}%`, flexGrow: 0, flexShrink: 0 }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`absolute inset-0 ${tab.id === selectedTabId ? "" : "invisible"}`}
            >
              <XTermSurface
                ref={(handle) => {
                  if (handle) terminalRefs.current.set(tab.id, handle);
                  else terminalRefs.current.delete(tab.id);
                }}
                terminalId={tab.id}
                baseFontSize={fontSize}
                onActivity={() => markTabActive(tab.id)}
                onBell={() => markTabActive(tab.id)}
                onTitleChange={(title) => updateTabTitle(tab.id, title)}
                {...(onTerminalResize
                  ? { onTerminalResize: (size) => onTerminalResize(tab.id, size) }
                  : {})}
              />
            </div>
          ))}
        </div>
        <div
          className="lightcode-pane-divider"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t`Resize split`}
        />
        <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          {tabs
            .filter((tab) => tab.splitId)
            .map((tab) => (
              <div
                key={tab.splitId}
                className={`absolute inset-0 ${tab.id === selectedTabId ? "" : "invisible"}`}
              >
                <XTermSurface
                  ref={(handle) => {
                    if (handle) terminalRefs.current.set(tab.splitId!, handle);
                    else terminalRefs.current.delete(tab.splitId!);
                  }}
                  terminalId={tab.splitId!}
                  baseFontSize={fontSize}
                  onActivity={() => markTabActive(tab.id)}
                  onBell={() => markTabActive(tab.id)}
                  onTitleChange={(title) => updateTabTitle(tab.splitId!, title)}
                  {...(onTerminalResize
                    ? { onTerminalResize: (size) => onTerminalResize(tab.splitId!, size) }
                    : {})}
                />
              </div>
            ))}
        </div>
        <div
          ref={overlayRef}
          aria-hidden="true"
          className="fixed inset-0 z-50 cursor-col-resize"
          style={{ display: "none" }}
        />
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
            ref={(handle) => {
              if (handle) terminalRefs.current.set(tab.id, handle);
              else terminalRefs.current.delete(tab.id);
            }}
            terminalId={tab.id}
            baseFontSize={fontSize}
            onActivity={() => markTabActive(tab.id)}
            onBell={() => markTabActive(tab.id)}
            onTitleChange={(title) => updateTabTitle(tab.id, title)}
            {...(onTerminalResize
              ? { onTerminalResize: (size) => onTerminalResize(tab.id, size) }
              : {})}
          />
        </div>
      ))}
    </div>
  );
}
