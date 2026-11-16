import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ProjectGroupOverrides } from "./projectGroups";

const PERSIST_KEY = "poracode-project-groups";
/** Bounded so a long-lived client doesn't grow the recency map forever. */
const MAX_RECENT_ENTRIES = 200;

/**
 * Device-local presentation preferences for logical projects. Nothing here is
 * host authority: grouping only decides how one client presents the per-host
 * project rows it already mirrors.
 */
interface ProjectGroupState extends ProjectGroupOverrides {
  /** Project id → last time this client chose that environment's row. */
  readonly lastUsedAt: Readonly<Record<string, number>>;
  setOverrides: (overrides: ProjectGroupOverrides) => void;
  markProjectUsed: (projectId: string, at?: number) => void;
}

export const useProjectGroupStore = create<ProjectGroupState>()(
  persist(
    (set) => ({
      manualGroups: {},
      lastUsedAt: {},
      setOverrides: (overrides) =>
        set((state) =>
          sameRecord(state.manualGroups, overrides.manualGroups)
            ? state
            : { manualGroups: overrides.manualGroups },
        ),
      markProjectUsed: (projectId, at = Date.now()) =>
        set((state) => {
          const next = { ...state.lastUsedAt, [projectId]: at };
          const entries = Object.entries(next);
          if (entries.length <= MAX_RECENT_ENTRIES) return { lastUsedAt: next };
          entries.sort((a, b) => b[1] - a[1]);
          return { lastUsedAt: Object.fromEntries(entries.slice(0, MAX_RECENT_ENTRIES)) };
        }),
    }),
    {
      name: PERSIST_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ manualGroups: state.manualGroups, lastUsedAt: state.lastUsedAt }),
      // v1 is the first format, and persist only calls this for another
      // version. A payload from an unversioned or future build carries no
      // grouping we can trust, so it starts fresh instead of throwing; groups
      // are only presentation and rebuild automatically.
      migrate: () => ({ manualGroups: {}, lastUsedAt: {} }),
      // Malformed payloads start fresh rather than throwing during hydration.
      merge: (persisted, current) => {
        const value = (persisted ?? {}) as Partial<ProjectGroupState>;
        return {
          ...current,
          manualGroups: isStringRecord(value.manualGroups) ? value.manualGroups : {},
          lastUsedAt: isNumberRecord(value.lastUsedAt) ? value.lastUsedAt : {},
        };
      },
    },
  ),
);

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function sameRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
