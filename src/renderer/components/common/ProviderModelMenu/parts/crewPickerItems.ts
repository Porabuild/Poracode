import { msg } from "@lingui/core/macro";
import type { SavedCrew } from "@/shared/crew";
import type { ProviderModelCrewRow, ProviderModelItem } from "./types";

/** Keep crew shortcuts in the same sections as model shortcuts, before Poracode. */
export function withCrewPickerItems(
  modelItems: ProviderModelItem[],
  crewRows: ProviderModelCrewRow[],
  newCrewRows: ProviderModelItem[],
  shortcutCrews: readonly SavedCrew[],
): ProviderModelItem[] {
  const rowsById = new Map(crewRows.map((row) => [row.crewId, row]));
  const favorites = shortcutCrews.filter((crew) => crew.favorite);
  const favoriteIds = new Set(favorites.map((crew) => crew.id));
  const recents = shortcutCrews
    .filter((crew) => crew.lastUsedAt !== undefined && !favoriteIds.has(crew.id))
    .toSorted((a, b) => b.lastUsedAt! - a.lastUsedAt!);
  const shortcutRows = (crews: readonly SavedCrew[], section: "fav" | "recent") =>
    crews.flatMap((crew) => {
      const row = rowsById.get(crew.id);
      return row
        ? [
            {
              ...row,
              id: `${section}:crew:${crew.id}`,
              isRecent: section === "recent",
              ...(crew.lastUsedAt !== undefined ? { lastUsedAt: crew.lastUsedAt } : {}),
            },
          ]
        : [];
    });
  const out: ProviderModelItem[] = [];
  for (const [section, label, crews] of [
    ["fav", msg`Favorites`, favorites],
    ["recent", msg`Recent`, recents],
  ] as const) {
    const models = modelItems.filter(
      (item) => item.type === "model" && item.id.startsWith(`${section}:`),
    );
    const rows = [...shortcutRows(crews, section), ...models];
    // Stable sorting keeps the original order of pre-timestamp model history.
    const lastUsedAt = (row: ProviderModelItem) =>
      row.type === "crew"
        ? (row.lastUsedAt ?? 0)
        : row.type === "model"
          ? (row.recentRef?.lastUsedAt ?? 0)
          : 0;
    const visibleRows =
      section === "recent"
        ? rows.toSorted((a, b) => lastUsedAt(b) - lastUsedAt(a)).slice(0, 5)
        : rows;
    if (visibleRows.length > 0) {
      out.push({ type: "header-plain", id: `header:${section}`, label }, ...visibleRows);
    }
  }
  if (crewRows.length > 0 || newCrewRows.length > 0) {
    out.push({ type: "header-crews", id: "header-crews" }, ...crewRows, ...newCrewRows);
  }
  out.push(
    ...modelItems.filter(
      (item) =>
        item.id !== "header:fav" &&
        item.id !== "header:recent" &&
        // Locked pickers attach favoriteRef to their normal provider rows too.
        // Only move rows built for the dedicated shortcut sections.
        !(item.type === "model" && (item.id.startsWith("fav:") || item.id.startsWith("recent:"))),
    ),
  );
  return out;
}
