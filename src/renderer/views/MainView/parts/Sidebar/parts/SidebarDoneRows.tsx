import { useEffect, useState, type ReactNode } from "react";
import { useCurrentThreadIds } from "@/renderer/hooks/uiSelectors";
import type { SidebarRow } from "./sidebarProjectRows";

export function SidebarDoneRows(props: {
  rows: SidebarRow[];
  renderRow: (row: SidebarRow) => ReactNode;
}) {
  const { rows, renderRow } = props;
  const openThreadIds = useCurrentThreadIds();
  const [previousRows, setPreviousRows] = useState(rows);
  const [renderedRows, setRenderedRows] = useState(() =>
    rows.map((row) => ({ row, visible: true })),
  );

  if (previousRows !== rows) {
    setPreviousRows(rows);
    const keys = new Set(rows.map((row) => row.key));
    const next = rows.map((row) => ({ row, visible: true }));
    // Keep outgoing rows in their slots until the closing transition finishes.
    renderedRows.forEach(({ row }, index) => {
      if (!keys.has(row.key)) next.splice(index, 0, { row, visible: false });
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

  const blocks: { key: string; pinned: boolean; visible: boolean; rows: SidebarRow[] }[] = [];
  let groupPinned = false;
  for (const { row, visible } of renderedRows) {
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
      previous.rows.push(row);
    } else {
      blocks.push({ key: row.key, pinned, visible, rows: [row] });
    }
  }

  return blocks.map(({ key, pinned, visible, rows: blockRows }) => (
    <div
      key={key}
      aria-hidden={visible ? undefined : true}
      inert={!visible}
      className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${pinned ? "" : "starting:grid-rows-[0fr]"} ${visible ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="min-h-0 overflow-hidden">
        <div>{blockRows.map(renderRow)}</div>
      </div>
    </div>
  ));
}
