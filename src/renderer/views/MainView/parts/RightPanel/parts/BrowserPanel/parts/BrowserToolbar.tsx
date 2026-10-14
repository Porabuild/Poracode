import { useEffect, type Key } from "react";
import { createPortal } from "react-dom";
import { Button, Dropdown, Label } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  ArrowRight,
  MousePointerSquareDashed,
  RotateCw,
  Star,
  TerminalSquare,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { readBridge } from "@/renderer/bridge";
import { runBrowserNavigation, editBrowserPresentation } from "@/renderer/actions/browserActions";
import { useRendererActionStore } from "@/renderer/state/rendererActionStore";
import { useBrowserPanelStore, browserActionKey } from "@/renderer/state/browserPanelStore";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import type { PickDestination, PickerThreadTarget } from "../hooks/useElementPicker";
import { BrowserMenu } from "./BrowserMenu";
import { BrowserOmnibox } from "./BrowserOmnibox";

const toolbarButtonClass = `${panelHeaderIconButtonClass} disabled:pointer-events-none disabled:opacity-35`;
const toolbarDropdownButtonClass =
  "size-5 min-w-0 p-0 text-muted hover:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-35 [--button-bg-hover:transparent] [--button-bg-pressed:transparent]";

export function BrowserToolbar(props: {
  onPick: () => void;
  pickerActive: boolean;
  pickerTargets: PickerThreadTarget[];
  hasPendingPick: boolean;
  pendingPickAnchor: { x: number; y: number } | null;
  onChoosePickTarget: (threadId: string, destination: PickDestination) => void;
  onCancelPendingPick: () => void;
  onMenuPreviewChange: (dataUrl: string | null) => void;
}) {
  const { onMenuPreviewChange } = props;
  const { t } = useLingui();
  const compact = useCompactLayout();
  const { activeTabId, activeTab } = useBrowserPanelStore(
    useShallow((state) => ({
      activeTabId: state.activeTabId,
      activeTab: state.activeTabId
        ? state.tabs.find((tab) => tab.tabId === state.activeTabId)
        : undefined,
    })),
  );
  const bookmarks = useBrowserPanelStore((state) => state.bookmarks);

  const disabled = !activeTab;
  const toolbarPending = useRendererActionStore((state) => !!state.pending["browser:toolbar"]);
  const ownerRevision = useBrowserPanelStore((state) => state.ownerRevision);
  const navigating = useRendererActionStore(
    (state) => !!state.pending[browserActionKey(`browser:navigate:${activeTabId}`, ownerRevision)],
  );
  const pageDisabled = disabled || activeTab?.internalPage !== undefined;
  const bookmarked =
    !!activeTab &&
    !activeTab.internalPage &&
    bookmarks.some((bookmark) => bookmark.url === activeTab.url);

  const onToggleBookmark = () => {
    if (!activeTab || activeTab.internalPage) return;
    const bridge = readBridge();
    if (bookmarked) {
      editBrowserPresentation({ kind: "bookmark", url: activeTab.url, bookmark: null }, () =>
        bridge.browserRemoveBookmark({ url: activeTab.url }),
      );
    } else {
      const bookmark = {
        createdAt: Date.now(),
        url: activeTab.url,
        title: activeTab.title || activeTab.url,
        ...(activeTab.faviconUrl ? { faviconUrl: activeTab.faviconUrl } : {}),
      };
      editBrowserPresentation({ kind: "bookmark", url: activeTab.url, bookmark }, () =>
        bridge.browserAddBookmark(bookmark),
      );
    }
  };
  const pickerButtonClass = `${toolbarButtonClass} ${
    props.pickerActive ? "text-foreground hover:text-foreground" : ""
  }`;
  const pickerDropdownButtonClass = `${toolbarDropdownButtonClass} ${
    props.pickerActive ? "text-foreground hover:text-foreground" : ""
  }`;
  const consoleButtonClass = `${toolbarButtonClass} ${
    activeTab?.devToolsOpen ? "text-accent hover:text-accent" : ""
  }`;
  const pickerLabel = props.pickerActive ? t`Cancel picker` : t`Pick element`;

  useEffect(() => {
    return () => onMenuPreviewChange(null);
  }, [onMenuPreviewChange]);

  // CLI targets offer Terminal vs Composer; everything else only has a
  // composer. The destination is encoded into the menu key as
  // `<destination>:<threadId>` and split on the first colon (thread ids such as
  // `draft:<projectId>` may themselves contain colons).
  const onChoosePickAction = (key: Key) => {
    const raw = String(key);
    const idx = raw.indexOf(":");
    const destination = raw.slice(0, idx) as PickDestination;
    props.onChoosePickTarget(raw.slice(idx + 1), destination);
  };
  const renderPickItems = () =>
    props.pickerTargets.flatMap((target) =>
      target.canRouteToTerminal
        ? [
            <Dropdown.Item
              key={`terminal:${target.threadId}`}
              id={`terminal:${target.threadId}`}
              textValue={t`${target.title} — Terminal`}
            >
              <Label>{target.title}</Label>
              <span className="ml-auto pl-3 text-muted">
                <Trans>Terminal</Trans>
              </span>
            </Dropdown.Item>,
            <Dropdown.Item
              key={`composer:${target.threadId}`}
              id={`composer:${target.threadId}`}
              textValue={t`${target.title} — Composer`}
            >
              <Label>{target.title}</Label>
              <span className="ml-auto pl-3 text-muted">
                <Trans>Composer</Trans>
              </span>
            </Dropdown.Item>,
          ]
        : [
            <Dropdown.Item
              key={`composer:${target.threadId}`}
              id={`composer:${target.threadId}`}
              textValue={target.title}
            >
              <Label>{target.title}</Label>
            </Dropdown.Item>,
          ],
    );

  return (
    <div
      data-browser-toolbar=""
      className={`flex items-center gap-1 border-b border-border bg-[var(--content-background)] px-1.5 py-0.5 ${compact ? "flex-wrap" : ""}`}
    >
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Back`}
        disabled={pageDisabled || !activeTab?.canGoBack}
        onClick={() => {
          if (activeTabId)
            runBrowserNavigation(activeTabId, () =>
              readBridge().browserBack({ tabId: activeTabId }),
            );
        }}
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Forward`}
        disabled={pageDisabled || !activeTab?.canGoForward}
        onClick={() => {
          if (activeTabId)
            runBrowserNavigation(activeTabId, () =>
              readBridge().browserForward({ tabId: activeTabId }),
            );
        }}
      >
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Reload`}
        disabled={pageDisabled}
        onClick={() => {
          if (activeTabId)
            runBrowserNavigation(activeTabId, () =>
              readBridge().browserReload({ tabId: activeTabId }),
            );
        }}
      >
        <RotateCw
          className={`size-3.5 ${navigating || activeTab?.loading ? "animate-spin" : ""}`}
        />
      </button>
      {compact ? null : (
        <BrowserOmnibox
          activeTabId={activeTabId}
          activeUrl={activeTab?.url}
          disabled={disabled}
          onPreviewChange={onMenuPreviewChange}
        />
      )}
      <button
        type="button"
        className={`${toolbarButtonClass} ${bookmarked ? "text-accent hover:text-accent" : ""}`}
        title={bookmarked ? t`Remove bookmark` : t`Bookmark this page`}
        aria-label={bookmarked ? t`Remove bookmark` : t`Bookmark this page`}
        disabled={pageDisabled || toolbarPending}
        onClick={onToggleBookmark}
      >
        <Star
          className={`size-3.5 ${bookmarked ? "fill-current" : ""} ${toolbarPending ? "animate-pulse" : ""}`}
        />
      </button>
      {compact ? null : props.hasPendingPick && props.pendingPickAnchor ? (
        <>
          <button type="button" className={pickerButtonClass} title={pickerLabel} disabled>
            <MousePointerSquareDashed className="size-3.5" />
          </button>
          {createPortal(
            <Dropdown
              isOpen
              onOpenChange={(open) => {
                if (!open) props.onCancelPendingPick();
              }}
            >
              <Dropdown.Trigger
                className="fixed"
                style={{ left: props.pendingPickAnchor.x, top: props.pendingPickAnchor.y }}
              >
                <div className="size-0" />
              </Dropdown.Trigger>
              <Dropdown.Popover
                placement="bottom start"
                className="z-[1000] min-w-[220px]"
                isNonModal
              >
                <Dropdown.Menu aria-label={t`Attach to thread`} onAction={onChoosePickAction}>
                  {renderPickItems()}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>,
            document.body,
          )}
        </>
      ) : props.hasPendingPick ? (
        <Dropdown
          isOpen
          onOpenChange={(open) => {
            if (!open) props.onCancelPendingPick();
          }}
        >
          <Button
            isIconOnly
            aria-label={t`Choose thread to attach to`}
            size="sm"
            variant="ghost"
            className={pickerDropdownButtonClass}
          >
            <MousePointerSquareDashed className="size-3.5" />
          </Button>
          <Dropdown.Popover className="z-[1000] min-w-[220px]">
            <Dropdown.Menu aria-label={t`Attach to thread`} onAction={onChoosePickAction}>
              {renderPickItems()}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : (
        <button
          type="button"
          className={pickerButtonClass}
          title={pickerLabel}
          disabled={pageDisabled && !props.pickerActive}
          onClick={() => props.onPick()}
        >
          <MousePointerSquareDashed className="size-3.5" />
        </button>
      )}
      {compact ? null : (
        <button
          type="button"
          className={consoleButtonClass}
          title={t`Console`}
          disabled={pageDisabled}
          onClick={() => {
            if (activeTabId) {
              void readBridge()
                .browserToggleDevTools({ tabId: activeTabId })
                .catch(() => {});
            }
          }}
        >
          <TerminalSquare className="size-3.5" />
        </button>
      )}
      <BrowserMenu
        activeTab={activeTab}
        bookmarks={bookmarks}
        onToggleBookmark={onToggleBookmark}
        triggerClassName={toolbarDropdownButtonClass}
      />
      {compact ? (
        <div className="poracode-mobile-browser-address min-w-full basis-full">
          <BrowserOmnibox
            activeTabId={activeTabId}
            activeUrl={activeTab?.url}
            disabled={disabled}
            onPreviewChange={onMenuPreviewChange}
          />
        </div>
      ) : null}
    </div>
  );
}
