import { create } from "zustand";
import { readBridge } from "@/renderer/bridge";
import {
  CHANGELOG_URL,
  hasUnseenChangelog,
  parseChangelogDocument,
  releasesSince,
  type ChangelogRelease,
} from "@/shared/changelog";
import {
  readStoredBoolean,
  readStoredString,
  writeStoredBoolean,
  writeStoredString,
} from "@/renderer/utils/localStorage";

const SEEN_VERSION_KEY = "lightcode-changelog-seen-version";
const HIDDEN_KEY = "lightcode-whatsnew-hidden";
const CACHE_KEY = "lightcode-changelog-cache";

function currentAppVersion(): string {
  try {
    return readBridge().appVersion;
  } catch {
    return "0.0.0";
  }
}

/** Persist "seen up to the current version" + "hidden", returning that version. */
function persistSeenAndHidden(): string {
  const current = currentAppVersion();
  writeStoredString(SEEN_VERSION_KEY, current);
  writeStoredBoolean(HIDDEN_KEY, true);
  return current;
}

/**
 * The last successfully fetched changelog, so the app has content offline and
 * instantly on launch before {@link loadChangelog} refreshes it. Empty until
 * the first successful fetch — the changelog is not bundled in the app.
 */
function loadCachedReleases(): ChangelogRelease[] {
  const raw = readStoredString(CACHE_KEY);
  if (!raw) return [];
  try {
    return parseChangelogDocument(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

interface ChangelogState {
  /** Current releases, newest-first (cache → freshly fetched). Empty until first load. */
  releases: ChangelogRelease[];
  /**
   * Newest version whose changelog the user has acknowledged. `null` only until
   * the first launch initializes it (see {@link bootstrapSeenState}).
   */
  lastSeenVersion: string | null;
  /** Whether the "What's New" dialog is currently shown. */
  whatsNewOpen: boolean;
  /**
   * Whether the user hid the sidebar "What's New" entry. A new unread release
   * overrides this so updates still surface; dismissing it hides it again.
   */
  whatsNewHidden: boolean;
  /**
   * Fetch the changelog from the marketing site, validate it, cache it, and
   * apply it. Degrades silently when offline/unreachable — the cached (or empty)
   * list is kept.
   */
  loadChangelog: () => Promise<void>;
  /**
   * Called once on app mount. On a brand-new profile we silently catch the user
   * up to the current version so the next real update can be detected. We never
   * auto-open the dialog — an unread update only surfaces as the sidebar "What's
   * New" flag, which the user opens (or dismisses) on their own terms.
   */
  bootstrapSeenState: () => void;
  /** Open the "What's New" dialog (always user-triggered, never automatic). */
  openWhatsNew: () => void;
  /** Hide the sidebar "What's New" entry and mark the current version read. */
  hideWhatsNew: () => void;
  /** Record the current version as seen, clearing the unseen flag. */
  markCurrentSeen: () => void;
  /**
   * Close the "What's New" dialog, mark the current version as seen, and hide
   * the sidebar entry — opening the dialog counts as reading it, so it stays
   * hidden until the next unread release brings it back.
   */
  dismissWhatsNew: () => void;
}

// Dedupes concurrent loads — e.g. the launch fetch and opening Settings →
// Changelog at the same time share one request instead of both hitting the net.
let inFlightLoad: Promise<void> | null = null;

export const useChangelogStore = create<ChangelogState>((set) => ({
  releases: loadCachedReleases(),
  lastSeenVersion: readStoredString(SEEN_VERSION_KEY),
  whatsNewOpen: false,
  whatsNewHidden: readStoredBoolean(HIDDEN_KEY, false),

  loadChangelog: () => {
    inFlightLoad ??= (async () => {
      try {
        const response = await fetch(CHANGELOG_URL);
        if (!response.ok) return;
        const releases = parseChangelogDocument(await response.json());
        if (!releases) return;
        writeStoredString(CACHE_KEY, JSON.stringify({ releases }));
        set({ releases });
      } catch {
        // Offline / unreachable / malformed — keep the cached (or empty) list.
      } finally {
        inFlightLoad = null;
      }
    })();
    return inFlightLoad;
  },

  bootstrapSeenState: () => {
    const lastSeen = readStoredString(SEEN_VERSION_KEY);
    // Only initialize on a fresh profile. Existing users keep their last-seen
    // marker so a real version bump still lights up the sidebar flag.
    if (lastSeen !== null) return;
    const current = currentAppVersion();
    writeStoredString(SEEN_VERSION_KEY, current);
    set({ lastSeenVersion: current });
  },

  openWhatsNew: () => set((state) => (state.whatsNewOpen ? {} : { whatsNewOpen: true })),

  hideWhatsNew: () => set({ lastSeenVersion: persistSeenAndHidden(), whatsNewHidden: true }),

  markCurrentSeen: () => {
    const current = currentAppVersion();
    writeStoredString(SEEN_VERSION_KEY, current);
    set((state) => (state.lastSeenVersion === current ? {} : { lastSeenVersion: current }));
  },

  dismissWhatsNew: () =>
    set({ lastSeenVersion: persistSeenAndHidden(), whatsNewOpen: false, whatsNewHidden: true }),
}));

/** True when there is changelog content the user has not acknowledged yet. */
export function useHasUnseenChangelog(): boolean {
  const releases = useChangelogStore((s) => s.releases);
  const lastSeenVersion = useChangelogStore((s) => s.lastSeenVersion);
  return hasUnseenChangelog(releases, currentAppVersion(), lastSeenVersion);
}

/** Releases the user has not seen yet (newest first); empty when caught up. */
export function useUnseenReleases(): ChangelogRelease[] {
  const releases = useChangelogStore((s) => s.releases);
  const lastSeenVersion = useChangelogStore((s) => s.lastSeenVersion);
  return releasesSince(releases, lastSeenVersion);
}
