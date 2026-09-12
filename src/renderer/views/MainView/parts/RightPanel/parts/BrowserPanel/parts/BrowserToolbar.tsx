import { useEffect, useRef, useState, type Key } from "react";
import { createPortal } from "react-dom";
import { Button, Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Globe,
  History,
  MoreHorizontal,
  MousePointerSquareDashed,
  Plus,
  RotateCw,
  Settings,
  Star,
  TerminalSquare,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { useCompactLayout } from "@/renderer/adaptiveLayout";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { panelHeaderIconButtonClass } from "@/renderer/components/layout/sidebarChrome";
import type { BrowserHistoryEntryInfo } from "@/shared/ipc";
import type { PickDestination, PickerThreadTarget } from "../hooks/useElementPicker";
import { BrowserOmnibox } from "./BrowserOmnibox";

const NEW_TAB_HOME = "https://duckduckgo.com";

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
    useShallow((s) => ({
      activeTabId: s.activeTabId,
      activeTab: s.activeTabId ? s.tabs.find((tab) => tab.tabId === s.activeTabId) : undefined,
    })),
  );
  const bookmarks = useBrowserPanelStore((s) => s.bookmarks);
  const bookmarkBarVisible = useBrowserPanelStore((s) => s.bookmarkBarVisible);
  const openSettingsSection = usePanelStore((s) => s.openSettingsSection);
  const [recentHistory, setRecentHistory] = useState<BrowserHistoryEntryInfo[]>([]);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const disabled = !activeTab;
  const bookmarked = !!activeTab && bookmarks.some((b) => b.url === activeTab.url);

  const onToggleBookmark = () => {
    if (!activeTab) return;
    const bridge = readBridge();
    if (bookmarked) {
      bridge.browserRemoveBookmark({ url: activeTab.url }).catch(() => {});
    } else {
      bridge
        .browserAddBookmark({
          url: activeTab.url,
          title: activeTab.title || activeTab.url,
          ...(activeTab.faviconUrl ? { faviconUrl: activeTab.faviconUrl } : {}),
        })
        .catch(() => {});
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

  const onMenuOpenChange = (open: boolean) => {
    if (!open) return;
    readBridge()
      .browserRecentHistory({ limit: 8 })
      .then(setRecentHistory)
      .catch(() => {});
  };

  const onMenuAction = (key: Key) => {
    const bridge = readBridge();
    if (key === "newTab") {
      bridge.browserCreateTab({ url: NEW_TAB_HOME, activate: true }).catch(() => {});
      return;
    }
    if (key === "settings") {
      // Settings renders at z-50, below the floating (z-60) / fullscreen (z-80)
      // browser, so collapse the browser to the docked panel first to reveal it.
      const panel = usePanelStore.getState();
      panel.setBrowserOverlayMaximized(false);
      panel.setBrowserOverlayOpen(false);
      openSettingsSection("browser");
      return;
    }
    if (key === "toggleBookmark") {
      onToggleBookmark();
      return;
    }
    if (key === "bookmarkBar") {
      bridge.browserSetBookmarkBarVisible({ visible: !bookmarkBarVisible }).catch(() => {});
      return;
    }
    if (!activeTabId) return;
    if (key === "screenshot") {
      bridge.browserCopyScreenshot({ tabId: activeTabId }).catch(() => {});
    } else if (key === "hardReload") {
      bridge.browserHardReload({ tabId: activeTabId }).catch(() => {});
    } else if (key === "copyUrl") {
      navigator.clipboard.writeText(activeTab?.url ?? "").catch(() => {});
    } else if (key === "clearHistory") {
      bridge.browserClearHistory({ tabId: activeTabId }).catch(() => {});
    } else if (key === "clearCookies") {
      bridge.browserClearCookies({ tabId: activeTabId }).catch(() => {});
    } else if (key === "clearCache") {
      bridge.browserClearCache({ tabId: activeTabId }).catch(() => {});
    } else if (String(key).startsWith("http")) {
      // A history/bookmark entry from a submenu — open it in the active tab.
      bridge.browserNavigate({ tabId: activeTabId, url: String(key) }).catch(() => {});
    }
  };

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
        disabled={disabled || !activeTab?.canGoBack}
        onClick={() => {
          if (activeTabId)
            void readBridge()
              .browserBack({ tabId: activeTabId })
              .catch(() => {});
        }}
      >
        <ArrowLeft className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Forward`}
        disabled={disabled || !activeTab?.canGoForward}
        onClick={() => {
          if (activeTabId)
            void readBridge()
              .browserForward({ tabId: activeTabId })
              .catch(() => {});
        }}
      >
        <ArrowRight className="size-3.5" />
      </button>
      <button
        type="button"
        className={toolbarButtonClass}
        title={t`Reload`}
        disabled={disabled}
        onClick={() => {
          if (activeTabId)
            void readBridge()
              .browserReload({ tabId: activeTabId })
              .catch(() => {});
        }}
      >
        <RotateCw className="size-3.5" />
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
        disabled={disabled}
        onClick={onToggleBookmark}
      >
        <Star className={`size-3.5 ${bookmarked ? "fill-current" : ""}`} />
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
          disabled={disabled && !props.pickerActive}
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
          disabled={disabled}
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
      <Dropdown onOpenChange={onMenuOpenChange}>
        <Button
          isIconOnly
          aria-label={t`Browser menu`}
          ref={menuButtonRef}
          size="sm"
          variant="ghost"
          className={toolbarDropdownButtonClass}
          isDisabled={disabled}
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
        <Dropdown.Popover placement="bottom end" className="z-[1000] min-w-[218px]">
          <Dropdown.Menu aria-label={t`Browser menu`} onAction={onMenuAction}>
            <Dropdown.Item id="newTab" textValue={t`New tab`}>
              <span className="size-4 shrink-0 text-muted">
                <Plus className="size-4" />
              </span>
              <Label>
                <Trans>New tab</Trans>
              </Label>
            </Dropdown.Item>
            <Separator />
            <Dropdown.SubmenuTrigger>
              <Dropdown.Item id="bookmarksMenu" textValue={t`Bookmarks`}>
                <span className="size-4 shrink-0 text-muted">
                  <Bookmark className="size-4" />
                </span>
                <Label>
                  <Trans>Bookmarks</Trans>
                </Label>
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover className="z-[1000] min-w-[240px]">
                <Dropdown.Menu aria-label={t`Bookmarks`} onAction={onMenuAction}>
                  <Dropdown.Item
                    id="toggleBookmark"
                    textValue={bookmarked ? t`Remove bookmark` : t`Bookmark this page`}
                  >
                    <span
                      className={`size-4 shrink-0 ${bookmarked ? "text-accent" : "text-muted"}`}
                    >
                      <Star className={`size-4 ${bookmarked ? "fill-current" : ""}`} />
                    </span>
                    <Label>
                      {bookmarked ? (
                        <Trans>Remove bookmark</Trans>
                      ) : (
                        <Trans>Bookmark this page</Trans>
                      )}
                    </Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="bookmarkBar" textValue={t`Show Bookmark Bar`}>
                    <Label>
                      <Trans>Show bookmark bar</Trans>
                    </Label>
                    <span
                      className={`ml-auto h-4 w-7 rounded-full after:block after:size-3 after:translate-y-0.5 after:rounded-full after:transition-transform ${
                        bookmarkBarVisible
                          ? "bg-accent after:translate-x-3.5 after:bg-white"
                          : "bg-default after:translate-x-0.5 after:bg-muted"
                      }`}
                    />
                  </Dropdown.Item>
                  {bookmarks.length > 0 ? <Separator /> : null}
                  {bookmarks.slice(0, 20).map((b) => (
                    <Dropdown.Item key={b.url} id={b.url} textValue={b.title || b.url}>
                      {b.faviconUrl ? (
                        <img
                          src={b.faviconUrl}
                          alt=""
                          className="size-4 shrink-0 rounded-[2px]"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="size-4 shrink-0 text-muted">
                          <Globe className="size-4" />
                        </span>
                      )}
                      <Label className="max-w-[220px] truncate">{b.title || b.url}</Label>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
            <Dropdown.SubmenuTrigger>
              <Dropdown.Item id="historyMenu" textValue={t`History`}>
                <span className="size-4 shrink-0 text-muted">
                  <History className="size-4" />
                </span>
                <Label>
                  <Trans>History</Trans>
                </Label>
                <Dropdown.SubmenuIndicator />
              </Dropdown.Item>
              <Dropdown.Popover className="z-[1000] min-w-[240px]">
                <Dropdown.Menu
                  aria-label={t`History`}
                  onAction={onMenuAction}
                  disabledKeys={recentHistory.length === 0 ? ["noHistory"] : []}
                >
                  {recentHistory.length === 0 ? (
                    <Dropdown.Item id="noHistory" textValue={t`No history yet`}>
                      <Label className="text-muted">
                        <Trans>No history yet</Trans>
                      </Label>
                    </Dropdown.Item>
                  ) : (
                    recentHistory.map((h) => (
                      <Dropdown.Item key={h.url} id={h.url} textValue={h.title || h.url}>
                        <span className="size-4 shrink-0 text-muted">
                          <Globe className="size-4" />
                        </span>
                        <Label className="max-w-[220px] truncate">{h.title || h.url}</Label>
                      </Dropdown.Item>
                    ))
                  )}
                  <Separator />
                  <Dropdown.Item id="clearHistory" textValue={t`Clear Browsing History`}>
                    <Label>
                      <Trans>Clear browsing history</Trans>
                    </Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.SubmenuTrigger>
            <Separator />
            <Dropdown.Item id="screenshot" textValue={t`Take Screenshot`}>
              <Label>
                <Trans>Take Screenshot</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="hardReload" textValue={t`Hard Reload`}>
              <Label>
                <Trans>Hard Reload</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="copyUrl" textValue={t`Copy Current URL`}>
              <Label>
                <Trans>Copy Current URL</Trans>
              </Label>
            </Dropdown.Item>
            <Separator />
            <Dropdown.Item id="clearCookies" textValue={t`Clear Cookies`}>
              <Label>
                <Trans>Clear Cookies</Trans>
              </Label>
            </Dropdown.Item>
            <Dropdown.Item id="clearCache" textValue={t`Clear Cache`}>
              <Label>
                <Trans>Clear Cache</Trans>
              </Label>
            </Dropdown.Item>
            <Separator />
            <Dropdown.Item id="settings" textValue={t`Settings`}>
              <span className="size-4 shrink-0 text-muted">
                <Settings className="size-4" />
              </span>
              <Label>
                <Trans>Settings</Trans>
              </Label>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
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
