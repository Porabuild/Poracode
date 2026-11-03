import { create } from "zustand";
import { readStoredJson, readStoredString, writeStoredJson } from "@/renderer/utils/localStorage";
import {
  parseHighlightHistory,
  recordHighlightShown,
  retireHighlight,
  type HighlightHistory,
} from "@/shared/changelogHighlights";

/**
 * Device-local news line memory. Promotion dismissals live in shared settings
 * (they hide promotions on every surface and client); this store only keeps
 * per-device rotation state: which changelog points were shown, and which
 * tips or insights the user closed.
 */
export const NEWS_LINE_STORAGE_KEYS = {
  highlights: "poracode-newsline-highlights",
  hidden: "poracode-newsline-hidden",
  discovery: "poracode-newsline-discovery",
} as const;

/** Per-device memory of how often each feature was suggested. */
export type DiscoveryHistory = Record<string, { count: number; lastShownAt: number }>;

/** Parse stored discovery history defensively; anything malformed starts fresh. */
function parseDiscoveryHistory(value: unknown): DiscoveryHistory {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const history: DiscoveryHistory = {};
  for (const [id, entry] of Object.entries(value)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { count, lastShownAt } = entry as { count?: unknown; lastShownAt?: unknown };
    if (typeof count === "number" && typeof lastShownAt === "number") {
      history[id] = { count, lastShownAt };
    }
  }
  return history;
}

/** Enough for years of closed tips, features, and dated remote items. */
const MAX_HIDDEN_IDS = 256;

function readHidden(): string[] {
  const value = readStoredJson(NEWS_LINE_STORAGE_KEYS.hidden);
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string").slice(-MAX_HIDDEN_IDS)
    : [];
}

interface NewsLineState {
  highlightHistory: HighlightHistory;
  discoveryHistory: DiscoveryHistory;
  /** Tips and insight types the user closed on this device. */
  hiddenIds: string[];
  /** Items closed for the current app session only (for example a usage limit). */
  sessionHiddenIds: string[];
  markHighlightShown: (id: string, poolIds: ReadonlySet<string>) => void;
  markDiscoveryShown: (featureId: string) => void;
  retireHighlight: (id: string) => void;
  hideItem: (id: string) => void;
  hideItemForSession: (id: string) => void;
}

export const useNewsLineStore = create<NewsLineState>((set, get) => ({
  highlightHistory: parseHighlightHistory(readStoredString(NEWS_LINE_STORAGE_KEYS.highlights)),
  discoveryHistory: parseDiscoveryHistory(readStoredJson(NEWS_LINE_STORAGE_KEYS.discovery)),
  hiddenIds: readHidden(),
  sessionHiddenIds: [],
  markHighlightShown: (id, poolIds) => {
    const highlightHistory = recordHighlightShown(get().highlightHistory, id, poolIds);
    writeStoredJson(NEWS_LINE_STORAGE_KEYS.highlights, highlightHistory);
    set({ highlightHistory });
  },
  markDiscoveryShown: (featureId) => {
    const previous = get().discoveryHistory[featureId];
    const discoveryHistory = {
      ...get().discoveryHistory,
      [featureId]: { count: (previous?.count ?? 0) + 1, lastShownAt: Date.now() },
    };
    writeStoredJson(NEWS_LINE_STORAGE_KEYS.discovery, discoveryHistory);
    set({ discoveryHistory });
  },
  retireHighlight: (id) => {
    const highlightHistory = retireHighlight(get().highlightHistory, id);
    if (highlightHistory === get().highlightHistory) return;
    writeStoredJson(NEWS_LINE_STORAGE_KEYS.highlights, highlightHistory);
    set({ highlightHistory });
  },
  hideItem: (id) => {
    if (get().hiddenIds.includes(id)) return;
    const hiddenIds = [...get().hiddenIds, id].slice(-MAX_HIDDEN_IDS);
    writeStoredJson(NEWS_LINE_STORAGE_KEYS.hidden, hiddenIds);
    set({ hiddenIds });
  },
  hideItemForSession: (id) => {
    if (get().sessionHiddenIds.includes(id)) return;
    set({ sessionHiddenIds: [...get().sessionHiddenIds, id] });
  },
}));
