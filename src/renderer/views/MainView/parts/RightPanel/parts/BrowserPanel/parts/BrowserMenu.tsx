import { useState, type Key } from "react";
import { Button, Dropdown, Label, Separator } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Bookmark,
  Download,
  Globe,
  History,
  Import as ImportIcon,
  KeyRound,
  MoreHorizontal,
  Plus,
  Printer,
  Search,
  Settings,
  Smartphone,
  Star,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { readBridge } from "@/renderer/bridge";
import { formatKeybinding } from "@/renderer/commands/keybindingMatcher";
import { useBrowserFindStore } from "@/renderer/state/browserFindStore";
import { useBrowserImportStore } from "@/renderer/state/browserImportStore";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import type { BrowserBookmarkInfo, BrowserHistoryEntryInfo, BrowserTabInfo } from "@/shared/ipc";

const NEW_TAB_HOME = "https://duckduckgo.com";
const ZOOM_LEVELS = [0.25, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export function BrowserMenu(props: {
  activeTab: BrowserTabInfo | undefined;
  bookmarks: BrowserBookmarkInfo[];
  onToggleBookmark: () => void;
  triggerClassName: string;
}) {
  const { activeTab, bookmarks } = props;
  const { t } = useLingui();
  const bookmarkBarVisible = useBrowserPanelStore((state) => state.bookmarkBarVisible);
  const openSettingsSection = usePanelStore((state) => state.openSettingsSection);
  const openImport = useBrowserImportStore((state) => state.setOpen);
  const [recentHistory, setRecentHistory] = useState<BrowserHistoryEntryInfo[]>([]);
  const findShortcut = formatKeybinding("Mod+F", readBridge().platform);
  const printShortcut = formatKeybinding("Mod+P", readBridge().platform);

  const activeTabId = activeTab?.tabId;
  const disabled = !activeTab;
  const pageDisabled = disabled || activeTab.internalPage !== undefined;
  const bookmarked =
    !!activeTab &&
    !activeTab.internalPage &&
    bookmarks.some((bookmark) => bookmark.url === activeTab.url);

  function onMenuOpenChange(open: boolean) {
    if (!open) return;
    readBridge()
      .browserRecentHistory({ limit: 8 })
      .then(setRecentHistory)
      .catch(() => {});
  }

  function onMenuAction(key: Key) {
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
    if (key === "downloads") {
      bridge.browserOpenInternalPage({ page: "downloads" }).catch(() => {});
      return;
    }
    if (key === "passwordManager") {
      bridge.browserOpenInternalPage({ page: "passwords" }).catch(() => {});
      return;
    }
    if (key === "importData") {
      openImport(true);
      return;
    }
    if (key === "toggleBookmark") {
      props.onToggleBookmark();
      return;
    }
    if (key === "bookmarkBar") {
      bridge.browserSetBookmarkBarVisible({ visible: !bookmarkBarVisible }).catch(() => {});
      return;
    }
    if (!activeTabId) return;
    if (key === "find") {
      if (!activeTab?.internalPage) useBrowserFindStore.getState().open(activeTabId);
    } else if (key === "print") {
      bridge.browserPrint({ tabId: activeTabId }).catch(() => {});
    } else if (key === "deviceToolbar") {
      bridge
        .browserSetDeviceEmulation({
          tabId: activeTabId,
          emulation: activeTab?.deviceEmulation ?? {
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
            scale: 0.75,
            mobile: false,
            touch: false,
            preset: "Responsive",
          },
        })
        .catch(() => {});
    } else if (key === "zoomOut" || key === "zoomIn" || key === "zoomReset") {
      const current = activeTab?.zoomFactor ?? 1;
      const zoomFactor =
        key === "zoomReset"
          ? 1
          : key === "zoomOut"
            ? (ZOOM_LEVELS.findLast((level) => level < current - 0.001) ?? ZOOM_LEVELS[0]!)
            : (ZOOM_LEVELS.find((level) => level > current + 0.001) ?? ZOOM_LEVELS.at(-1)!);
      bridge.browserSetZoomFactor({ tabId: activeTabId, zoomFactor }).catch(() => {});
    } else if (key === "screenshot") {
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
  }

  return (
    <Dropdown onOpenChange={onMenuOpenChange}>
      <Button
        isIconOnly
        aria-label={t`Browser menu`}
        size="sm"
        variant="ghost"
        className={props.triggerClassName}
        isDisabled={disabled}
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
      <Dropdown.Popover placement="bottom end" className="z-[1000] min-w-[250px]">
        <Dropdown.Menu
          aria-label={t`Browser menu`}
          onAction={onMenuAction}
          disabledKeys={
            pageDisabled
              ? ["find", "print", "zoomMenu", "deviceToolbar", "screenshot", "hardReload"]
              : []
          }
        >
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
              <Dropdown.Menu
                aria-label={t`Bookmarks`}
                onAction={onMenuAction}
                disabledKeys={pageDisabled ? ["toggleBookmark"] : []}
              >
                <Dropdown.Item
                  id="toggleBookmark"
                  textValue={bookmarked ? t`Remove bookmark` : t`Bookmark this page`}
                >
                  <span className={`size-4 shrink-0 ${bookmarked ? "text-accent" : "text-muted"}`}>
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
                {bookmarks.slice(0, 20).map((bookmark) => (
                  <Dropdown.Item
                    key={bookmark.url}
                    id={bookmark.url}
                    textValue={bookmark.title || bookmark.url}
                  >
                    {bookmark.faviconUrl ? (
                      <img
                        src={bookmark.faviconUrl}
                        alt=""
                        className="size-4 shrink-0 rounded-[2px]"
                        onError={(event) => {
                          (event.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="size-4 shrink-0 text-muted">
                        <Globe className="size-4" />
                      </span>
                    )}
                    <Label className="max-w-[220px] truncate">
                      {bookmark.title || bookmark.url}
                    </Label>
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
                  recentHistory.map((history) => (
                    <Dropdown.Item
                      key={history.url}
                      id={history.url}
                      textValue={history.title || history.url}
                    >
                      <span className="size-4 shrink-0 text-muted">
                        <Globe className="size-4" />
                      </span>
                      <Label className="max-w-[220px] truncate">
                        {history.title || history.url}
                      </Label>
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
          <Dropdown.Item id="find" textValue={t`Find in page`}>
            <span className="size-4 shrink-0 text-muted">
              <Search className="size-4" />
            </span>
            <Label>
              <Trans>Find in page</Trans>
            </Label>
            <span className="ml-auto pl-4 text-[10px] text-muted">{findShortcut}</span>
          </Dropdown.Item>
          <Dropdown.Item id="print" textValue={t`Print`}>
            <span className="size-4 shrink-0 text-muted">
              <Printer className="size-4" />
            </span>
            <Label>
              <Trans>Print</Trans>
            </Label>
            <span className="ml-auto pl-4 text-[10px] text-muted">{printShortcut}</span>
          </Dropdown.Item>
          <Dropdown.SubmenuTrigger>
            <Dropdown.Item id="zoomMenu" textValue={t`Zoom`}>
              <span className="size-4 shrink-0 text-muted">
                <ZoomIn className="size-4" />
              </span>
              <Label>
                <Trans>Zoom</Trans>
              </Label>
              <span className="ml-auto pl-3 text-xs tabular-nums text-muted">
                {Math.round((activeTab?.zoomFactor ?? 1) * 100)}%
              </span>
              <Dropdown.SubmenuIndicator />
            </Dropdown.Item>
            <Dropdown.Popover className="z-[1000] min-w-[210px]">
              <Dropdown.Menu aria-label={t`Zoom`} onAction={onMenuAction}>
                <Dropdown.Item id="zoomOut" textValue={t`Zoom out`}>
                  <span className="size-4 shrink-0 text-muted">
                    <ZoomOut className="size-4" />
                  </span>
                  <Label>
                    <Trans>Zoom out</Trans>
                  </Label>
                </Dropdown.Item>
                <Dropdown.Item id="zoomReset" textValue={t`Reset zoom`}>
                  <Label>
                    <Trans>Reset zoom</Trans>
                  </Label>
                  <span className="ml-auto text-xs tabular-nums text-muted">100%</span>
                </Dropdown.Item>
                <Dropdown.Item id="zoomIn" textValue={t`Zoom in`}>
                  <span className="size-4 shrink-0 text-muted">
                    <ZoomIn className="size-4" />
                  </span>
                  <Label>
                    <Trans>Zoom in</Trans>
                  </Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.SubmenuTrigger>
          <Dropdown.Item id="deviceToolbar" textValue={t`Show device toolbar`}>
            <span className="size-4 shrink-0 text-muted">
              <Smartphone className="size-4" />
            </span>
            <Label>
              <Trans>Show device toolbar</Trans>
            </Label>
          </Dropdown.Item>
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
          <Dropdown.Item id="importData" textValue={t`Import cookies and passwords`}>
            <span className="size-4 shrink-0 text-muted">
              <ImportIcon className="size-4" />
            </span>
            <Label>
              <Trans>Import cookies and passwords</Trans>
            </Label>
          </Dropdown.Item>
          <Dropdown.SubmenuTrigger>
            <Dropdown.Item id="passwordsMenu" textValue={t`Passwords and autofill`}>
              <span className="size-4 shrink-0 text-muted">
                <KeyRound className="size-4" />
              </span>
              <Label>
                <Trans>Passwords and autofill</Trans>
              </Label>
              <Dropdown.SubmenuIndicator />
            </Dropdown.Item>
            <Dropdown.Popover className="z-[1000] min-w-[250px]">
              <Dropdown.Menu aria-label={t`Passwords and autofill`} onAction={onMenuAction}>
                <Dropdown.Item id="passwordManager" textValue={t`Password manager`}>
                  <Label>
                    <Trans>Password manager</Trans>
                  </Label>
                </Dropdown.Item>
                <Dropdown.Item id="importData" textValue={t`Import cookies and passwords`}>
                  <Label>
                    <Trans>Import cookies and passwords</Trans>
                  </Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.SubmenuTrigger>
          <Dropdown.Item id="downloads" textValue={t`Downloads`}>
            <span className="size-4 shrink-0 text-muted">
              <Download className="size-4" />
            </span>
            <Label>
              <Trans>Downloads</Trans>
            </Label>
          </Dropdown.Item>
          <Dropdown.SubmenuTrigger>
            <Dropdown.Item id="clearBrowsingDataMenu" textValue={t`Clear browsing data`}>
              <Label>
                <Trans>Clear browsing data</Trans>
              </Label>
              <Dropdown.SubmenuIndicator />
            </Dropdown.Item>
            <Dropdown.Popover className="z-[1000] min-w-[230px]">
              <Dropdown.Menu aria-label={t`Clear browsing data`} onAction={onMenuAction}>
                <Dropdown.Item id="clearHistory" textValue={t`Clear browsing history`}>
                  <Label>
                    <Trans>Clear browsing history</Trans>
                  </Label>
                </Dropdown.Item>
                <Dropdown.Item id="clearCookies" textValue={t`Clear cookies`}>
                  <Label>
                    <Trans>Clear cookies</Trans>
                  </Label>
                </Dropdown.Item>
                <Dropdown.Item id="clearCache" textValue={t`Clear cache`}>
                  <Label>
                    <Trans>Clear cache</Trans>
                  </Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.SubmenuTrigger>
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
  );
}
