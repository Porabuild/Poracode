import type { KeyboardEvent, RefObject } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  findProjectIconCategory,
  PROJECT_ICON_CATEGORIES,
  projectIconDisplayName,
  type ProjectIconEntry,
} from "@/renderer/utils/projectIcons";

/** Cells per row. Mirrors the `grid-cols-8` class the rows are laid out with. */
const COLUMNS = 8;

function iconCells(root: HTMLElement | null): HTMLButtonElement[] {
  return root ? [...root.querySelectorAll<HTMLButtonElement>("[data-project-icon-cell]")] : [];
}

/** Move focus into the grid. False when there is nothing to focus. */
export function focusFirstProjectIcon(root: HTMLElement | null): boolean {
  const first = iconCells(root)[0];
  first?.focus();
  return first !== undefined;
}

/**
 * The catalog grid. Cells share one roving tab stop and move focus with the
 * arrow keys, so reaching a glyph never costs hundreds of Tab presses; ArrowUp
 * off the first row hands focus back to the caller's search field.
 */
export function ProjectIconGrid(props: {
  /** Search results, or null to show the whole catalog grouped by category. */
  results: readonly ProjectIconEntry[] | null;
  /** Selected catalog id, when the project already uses a bundled glyph. */
  selectedId: string | undefined;
  /** Owned by the caller so its search field can move focus into the grid. */
  rootRef: RefObject<HTMLDivElement | null>;
  onPick: (id: string) => void;
  onExitTop: () => void;
}) {
  const { t } = useLingui();
  // Flat cell offsets across the groups: the roving tab stop is the first cell,
  // and arrow keys walk the whole grid rather than stopping at a category edge.
  let offset = 0;
  const groups = (
    props.results
      ? [{ id: "results", label: undefined, icons: props.results }]
      : PROJECT_ICON_CATEGORIES.map((category) => ({
          id: category.id,
          label: category.label,
          icons: category.icons,
        }))
  ).map((group) => {
    const positioned = { ...group, start: offset };
    offset += group.icons.length;
    return positioned;
  });

  function onCellKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    const step =
      event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowLeft"
          ? -1
          : event.key === "ArrowDown"
            ? COLUMNS
            : event.key === "ArrowUp"
              ? -COLUMNS
              : 0;
    if (step === 0) return;
    event.preventDefault();
    const cells = iconCells(props.rootRef.current);
    const index = cells.indexOf(event.currentTarget);
    if (index < 0) return;
    const next = index + step;
    if (next < 0) {
      props.onExitTop();
      return;
    }
    cells[Math.min(next, cells.length - 1)]?.focus();
  }

  return (
    <div ref={props.rootRef}>
      {groups.map((group) => (
        <div key={group.id} className="mb-2">
          {group.label ? (
            <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
              {t(group.label)}
            </p>
          ) : null}
          <div className="grid grid-cols-8 gap-1">
            {group.icons.map((entry, index) => (
              <IconGridCell
                key={entry.id}
                entry={entry}
                selected={props.selectedId === entry.id}
                tabIndex={group.start + index === 0 ? 0 : -1}
                onKeyDown={onCellKeyDown}
                onPick={() => props.onPick(entry.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function IconGridCell(props: {
  entry: ProjectIconEntry;
  selected: boolean;
  tabIndex: number;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPick: () => void;
}) {
  const { t } = useLingui();
  const label = projectIconDisplayName(props.entry.id);
  const category = findProjectIconCategory(props.entry.id);
  // A native multi-line title rather than a HeroUI Tooltip: the tooltip's
  // trigger wraps its child in a focusable `div[role="button"]`, which for 313
  // cells means 313 extra tab stops (undoing the grid's single roving stop)
  // plus a button nested in a button. The hover text is worth more than the
  // styling here — name, category, and the words that search finds it by.
  const hoverText = [
    label,
    category ? t(category.label) : undefined,
    props.entry.keywords?.join(", "),
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      data-project-icon-cell=""
      className={`flex size-8 items-center justify-center rounded-md outline-none transition-colors focus-visible:focus-ring ${
        props.selected
          ? "bg-accent/20 text-accent"
          : "text-muted hover:bg-[var(--row-active)] hover:text-foreground"
      }`}
      title={hoverText}
      aria-label={t`Project icon: ${label}`}
      aria-pressed={props.selected}
      tabIndex={props.tabIndex}
      onKeyDown={props.onKeyDown}
      onClick={props.onPick}
    >
      <props.entry.Icon className="size-4" />
    </button>
  );
}
