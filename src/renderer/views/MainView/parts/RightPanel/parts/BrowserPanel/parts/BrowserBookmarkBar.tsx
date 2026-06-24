import { Globe, X } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { readBridge } from "@/renderer/bridge";
import { useBrowserPanelStore } from "@/renderer/state/browserPanelStore";

/**
 * Bookmarks bar shown beneath the toolbar when toggled on (browser menu →
 * "Show Bookmark Bar"). Clicking a bookmark navigates the active tab; the hover
 * "x" removes it. Add bookmarks via the address-bar star.
 */
export function BrowserBookmarkBar() {
  const { t } = useLingui();
  const visible = useBrowserPanelStore((s) => s.bookmarkBarVisible);
  const bookmarks = useBrowserPanelStore((s) => s.bookmarks);
  const activeTabId = useBrowserPanelStore((s) => s.activeTabId);

  if (!visible) return null;

  const navigate = (url: string) => {
    if (!activeTabId) return;
    readBridge()
      .browserNavigate({ tabId: activeTabId, url })
      .catch(() => {});
  };
  const remove = (url: string) => {
    readBridge()
      .browserRemoveBookmark({ url })
      .catch(() => {});
  };

  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-[var(--content-background)] px-1.5">
      {bookmarks.length === 0 ? (
        <span className="px-1 py-0.5 text-[11px] text-muted">
          <Trans>No bookmarks yet — add the current page with the star.</Trans>
        </span>
      ) : (
        bookmarks.map((bm) => (
          <div
            key={bm.url}
            className="group flex max-w-[180px] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[12px] text-foreground/80 hover:bg-[var(--surface-secondary)] hover:text-foreground"
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1"
              title={bm.url}
              onClick={() => navigate(bm.url)}
            >
              {bm.faviconUrl ? (
                <img
                  src={bm.faviconUrl}
                  alt=""
                  className="size-3.5 shrink-0 rounded-[2px]"
                  draggable={false}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Globe className="size-3.5 shrink-0 text-foreground/50" />
              )}
              <span className="truncate">{bm.title || bm.url}</span>
            </button>
            <button
              type="button"
              aria-label={t`Remove bookmark`}
              title={t`Remove bookmark`}
              className="invisible flex size-4 items-center justify-center rounded text-foreground/50 hover:bg-[var(--row-hover)] hover:text-foreground group-hover:visible"
              onClick={() => remove(bm.url)}
            >
              <X className="size-3" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
