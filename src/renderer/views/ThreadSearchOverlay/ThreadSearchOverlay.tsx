import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useShallow } from "zustand/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useDragSource } from "@/renderer/dnd";
import { openThread } from "@/renderer/actions/threadActions";
import { ThreadSearchResultRow } from "./parts/ThreadSearchResultRow";

const RESULT_LIMIT = 50;

export function ThreadSearchOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const threads = useAppStore(useShallow((s) => s.threads));
  const projects = useAppStore(useShallow((s) => s.projects));

  const dragSource = useDragSource();
  const isDraggingThreadFromSearch =
    dragSource?.type === "thread" && threads.some((thread) => thread.id === dragSource.threadId);
  const wasDraggingRef = useRef(false);

  // When a drag started from this overlay ends, close the overlay.
  useEffect(() => {
    if (isDraggingThreadFromSearch) {
      wasDraggingRef.current = true;
      return;
    }
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      onClose();
    }
  }, [isDraggingThreadFromSearch, onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const projectsById = useMemo(() => {
    const map = new Map<string, (typeof projects)[number]>();
    for (const project of projects) map.set(project.id, project);
    return map;
  }, [projects]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const candidates = threads.filter((thread) => !thread.archived);
    const filtered = q
      ? candidates.filter((thread) => thread.title.toLowerCase().includes(q))
      : candidates;
    return filtered
      .slice()
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      })
      .slice(0, RESULT_LIMIT);
  }, [threads, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function activateAt(index: number) {
    const thread = results[index];
    if (!thread) return;
    openThread(thread.id);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activateAt(selectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Hide the overlay visually while a drag is alive so the dragged thread can
  // be dropped onto a pane underneath, without unmounting the dnd source.
  const hidden = isDraggingThreadFromSearch;

  return (
    <div
      role="presentation"
      className={`fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] transition-opacity duration-100 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label={t`Close search`}
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={t`Search threads`}
        className="relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-3xl border border-[var(--hairline-strong)] bg-background shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search…`}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted">
              {query.trim() ? <Trans>No matching threads</Trans> : <Trans>No threads</Trans>}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/70">
                <Trans>Threads</Trans>
              </div>
              {results.map((thread, index) => (
                <ThreadSearchResultRow
                  key={thread.id}
                  thread={thread}
                  project={projectsById.get(thread.projectId)}
                  isSelected={index === selectedIndex}
                  onActivate={() => activateAt(index)}
                  onHover={() => setSelectedIndex(index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreadSearchOverlayHost() {
  const open = usePanelStore((s) => s.threadSearchOpen);
  if (!open) return null;
  return <ThreadSearchOverlay onClose={() => usePanelStore.getState().closeThreadSearch()} />;
}
