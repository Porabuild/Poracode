import type { ShellStateStore } from "../backend/BackendStateStore";

const BOOKMARKS_KEY = "browser-bookmarks-v1";
const BAR_VISIBLE_KEY = "browser-bookmark-bar-visible-v1";

export interface BrowserBookmark {
  url: string;
  title: string;
  faviconUrl?: string;
  createdAt: number;
}

/**
 * Persistent bookmarks + bookmark-bar visibility, stored as app state (same
 * mechanism as tabs/history). Deduped by URL.
 */
export class BrowserBookmarkStore {
  private bookmarks: BrowserBookmark[] = [];
  private barVisible = false;
  private loaded = false;

  constructor(private readonly state: ShellStateStore) {}

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = this.state.get(BOOKMARKS_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as BrowserBookmark[];
        if (Array.isArray(arr)) {
          this.bookmarks = arr.filter(
            (b): b is BrowserBookmark =>
              !!b && typeof b.url === "string" && typeof b.title === "string",
          );
        }
      }
    } catch {}
    try {
      this.barVisible = this.state.get(BAR_VISIBLE_KEY) === "1";
    } catch {}
  }

  list(): BrowserBookmark[] {
    this.load();
    return this.bookmarks;
  }

  isBarVisible(): boolean {
    this.load();
    return this.barVisible;
  }

  add(bookmark: BrowserBookmark): void {
    this.load();
    if (!/^https?:\/\//i.test(bookmark.url)) return;
    if (this.bookmarks.some((b) => b.url === bookmark.url)) return;
    this.bookmarks = [
      ...this.bookmarks,
      {
        url: bookmark.url,
        title: bookmark.title || bookmark.url,
        createdAt: bookmark.createdAt,
        ...(bookmark.faviconUrl ? { faviconUrl: bookmark.faviconUrl } : {}),
      },
    ];
    this.persist();
  }

  remove(url: string): void {
    this.load();
    const next = this.bookmarks.filter((b) => b.url !== url);
    if (next.length === this.bookmarks.length) return;
    this.bookmarks = next;
    this.persist();
  }

  setBarVisible(visible: boolean): void {
    this.load();
    if (this.barVisible === visible) return;
    this.barVisible = visible;
    try {
      this.state.set(BAR_VISIBLE_KEY, visible ? "1" : "0");
    } catch {}
  }

  private persist(): void {
    try {
      this.state.set(BOOKMARKS_KEY, JSON.stringify(this.bookmarks));
    } catch {}
  }
}
