import { useEffect, useState, type ReactNode } from "react";
import { useCurrentThreadIds } from "@/renderer/hooks/uiSelectors";
import type { SidebarRow } from "./sidebarProjectRows";

interface RenderedRow {
  row: SidebarRow;
  visible: boolean;
  /**
   * Added while the list was already showing rows, so it gets its own reveal
   * clip. A row that joins a block already on screen cannot use the block's
   * clip: the block is already open, so the row would pop in at full height.
   */
  entering: boolean;
  /** The one-shot reveal is still running; the clip is dropped afterwards. */
  revealing: boolean;
}

const clipTransitionClass =
  "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none";

function clipClass(starting: boolean, open: boolean): string {
  return `${clipTransitionClass} ${starting ? "starting:grid-rows-[0fr]" : ""} ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`;
}

export function SidebarDoneRows(props: {
  rows: SidebarRow[];
  renderRow: (row: SidebarRow) => ReactNode;
}) {
  const { rows, renderRow } = props;
  const openThreadIds = useCurrentThreadIds();
  const [previousRows, setPreviousRows] = useState(rows);
  const [renderedRows, setRenderedRows] = useState<RenderedRow[]>(() =>
    rows.map((row) => ({ row, visible: true, entering: false, revealing: false })),
  );

  if (previousRows !== rows) {
    setPreviousRows(rows);
    const previousByKey = new Map(renderedRows.map((entry) => [entry.row.key, entry]));
    const keys = new Set(rows.map((row) => row.key));
    const hadVisibleRows = renderedRows.some((entry) => entry.visible);
    const next: RenderedRow[] = rows.map((row) => {
      const previous = previousByKey.get(row.key);
      return previous
        ? { ...previous, row, visible: true }
        : { row, visible: true, entering: hadVisibleRows, revealing: hadVisibleRows };
    });
    // Keep outgoing rows in their slots until the closing transition finishes.
    renderedRows.forEach((entry, index) => {
      if (!keys.has(entry.row.key)) next.splice(index, 0, { ...entry, visible: false });
    });
    setRenderedRows(next);
  }

  useEffect(() => {
    if (renderedRows.every(({ visible }) => visible)) return;
    const timer = window.setTimeout(() => {
      setRenderedRows((current) => current.filter(({ visible }) => visible));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [renderedRows]);

  const revealingKeys = renderedRows
    .filter(({ revealing }) => revealing)
    .map(({ row }) => row.key)
    .join("\n");

  useEffect(() => {
    if (!revealingKeys) return;
    // The starting style is consumed by the first style pass, so the clip can
    // drop once that frame is painted without cancelling the running reveal.
    // Keeping it longer would replay the reveal if the block remounts.
    const scheduledKeys = new Set(revealingKeys.split("\n"));
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setRenderedRows((current) =>
          current.map((entry) =>
            entry.revealing && scheduledKeys.has(entry.row.key)
              ? { ...entry, revealing: false }
              : entry,
          ),
        );
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [revealingKeys]);

  const blocks: { key: string; pinned: boolean; visible: boolean; rows: RenderedRow[] }[] = [];
  let groupPinned = false;
  for (const entry of renderedRows) {
    const { row, visible } = entry;
    let pinned = false;
    if (row.kind === "worktree-group" || row.kind === "thread-group") {
      const threads = row.kind === "worktree-group" ? row.group.threads : row.entry.group.threads;
      pinned = threads.some((thread) => openThreadIds.includes(thread.id));
      groupPinned = pinned;
    } else if (row.kind === "thread") {
      pinned = row.inGroup ? groupPinned : openThreadIds.includes(row.thread.id);
    }
    const previous = blocks.at(-1);
    if (previous && previous.pinned === pinned && previous.visible === visible) {
      previous.rows.push(entry);
    } else {
      blocks.push({ key: row.key, pinned, visible, rows: [entry] });
    }
  }

  return blocks.map(({ key, pinned, visible, rows: blockRows }) => {
    // Rows that just joined reveal through their own clip; the block must not
    // also animate, or the easing compounds. A pinned block (holding the open
    // thread) never animates its own clip.
    const blockStarts = !pinned && !blockRows.some((entry) => entry.revealing);
    return (
      <div
        key={key}
        aria-hidden={visible ? undefined : true}
        inert={!visible}
        className={clipClass(blockStarts, visible)}
      >
        <div className="min-h-0 overflow-hidden">
          <div>
            {blockRows.map(({ row, entering, revealing }) =>
              entering ? (
                <div key={row.key} className={clipClass(revealing, true)}>
                  <div className="min-h-0 overflow-hidden">{renderRow(row)}</div>
                </div>
              ) : (
                renderRow(row)
              ),
            )}
          </div>
        </div>
      </div>
    );
  });
}
