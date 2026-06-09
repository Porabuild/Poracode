import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { overlaySidebarSurfaceClass } from "@/renderer/components/layout/sidebarChrome";
import { useNotesStore } from "@/renderer/state/notesStore";
import {
  readStoredBoolean,
  readStoredNumber,
  writeStoredBoolean,
  writeStoredNumber,
} from "@/renderer/utils/localStorage";
import { NotesEditor } from "./NotesEditor";
import { TodoList } from "./TodoList";

const RATIO_KEY = "lc.notes.topRatio";
const ORDER_KEY = "lc.notes.notesFirst";
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

const clampRatio = (n: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, n));

/**
 * Per-project notes panel: a free-form notes editor and a structured to-do list,
 * stacked vertically with a draggable divider to resize and a swap control to
 * reorder which one sits on top (both persisted to localStorage). Loads the
 * project's notes lazily and flushes pending edits when it unmounts.
 */
export function NotesPanel(props: { projectId: string }) {
  const { projectId } = props;
  const ensureLoaded = useNotesStore((s) => s.ensureLoaded);
  const flush = useNotesStore((s) => s.flush);
  const status = useNotesStore((s) => s.byProject[projectId]?.status ?? "unloaded");

  const containerRef = useRef<HTMLDivElement>(null);
  const [topRatio, setTopRatio] = useState(() => clampRatio(readStoredNumber(RATIO_KEY, 0.6)));
  const [notesFirst, setNotesFirst] = useState(() => readStoredBoolean(ORDER_KEY, true));

  useEffect(() => {
    ensureLoaded(projectId);
    return () => flush(projectId);
  }, [projectId, ensureLoaded, flush]);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let latest = topRatio;
      const onMove = (ev: PointerEvent) => {
        latest = clampRatio((ev.clientY - rect.top) / rect.height);
        setTopRatio(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        // Persist once at the end of the drag rather than on every pointermove.
        writeStoredNumber(RATIO_KEY, latest);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [topRatio],
  );

  if (status !== "ready") {
    return (
      <div
        className={`flex h-full min-h-0 items-center justify-center ${overlaySidebarSurfaceClass} text-xs text-muted`}
      >
        Loading notes…
      </div>
    );
  }

  // Both sections stay mounted; their vertical order is controlled with CSS
  // `order` so swapping never remounts the editor (which would risk clobbering
  // its content). The top section gets a fixed flex-basis (resizable); the
  // bottom one fills the remaining space.
  const sectionStyle = (isTop: boolean) =>
    isTop
      ? ({ order: 0, flexBasis: `${topRatio * 100}%`, flexGrow: 0, flexShrink: 0 } as const)
      : ({ order: 2, flexBasis: 0, flexGrow: 1, flexShrink: 1 } as const);

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 flex-col ${overlaySidebarSurfaceClass}`}
    >
      <div className="min-h-0 overflow-hidden" style={sectionStyle(notesFirst)}>
        <NotesEditor projectId={projectId} />
      </div>
      <div
        className="group/divider relative z-10 flex h-px shrink-0 items-center justify-center bg-[color:var(--border)]"
        style={{ order: 1 }}
      >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize notes and to-dos"
          className="absolute inset-x-0 -top-1.5 z-0 h-3 cursor-row-resize"
          onPointerDown={onResizePointerDown}
        />
        <button
          type="button"
          title="Swap notes and to-dos"
          aria-label="Swap notes and to-dos"
          className="absolute z-10 flex size-5 items-center justify-center rounded-full border border-[color:var(--border)] bg-[var(--content-background)] text-muted opacity-0 transition-opacity hover:text-foreground group-hover/divider:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const nextRatio = clampRatio(1 - topRatio);
            const nextNotesFirst = !notesFirst;
            setTopRatio(nextRatio);
            setNotesFirst(nextNotesFirst);
            writeStoredNumber(RATIO_KEY, nextRatio);
            writeStoredBoolean(ORDER_KEY, nextNotesFirst);
          }}
        >
          <ArrowUpDown className="size-3" />
        </button>
      </div>
      <div className="min-h-0 overflow-hidden" style={sectionStyle(!notesFirst)}>
        <TodoList projectId={projectId} />
      </div>
    </div>
  );
}
