import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { LegendListRef } from "@legendapp/list/react";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { selectRuntimeItemById, type ChatTimelineEntry } from "../chatPaneSelectors";
import { imageViewRendersInline } from "./items/imageViewSource";
import { isToolLikeItem } from "./items/toolCallCategorization";
import {
  getTimelineMeasurementSignature,
  MAX_TIMELINE_SNAPSHOT_ROWS,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "./timelineMeasurementCache";

/** Restore once at the first usable viewport; structural transcript changes
 * never need a geometry read. A layout change invalidates snapshot eligibility:
 * offscreen sizes may still belong to the previous width/font, so they cannot
 * be saved under the new signature. A remount establishes fresh provenance. */
export function useTimelineMeasurements({
  threadId,
  hasItems,
  entriesRef,
  listRef,
  scrollElementRef,
}: {
  threadId: string;
  hasItems: boolean;
  entriesRef: RefObject<readonly ChatTimelineEntry[]>;
  listRef: RefObject<LegendListRef | null>;
  scrollElementRef: RefObject<HTMLDivElement | null>;
}) {
  const layoutRef = useRef<{
    threadId: string;
    signature: string | null;
    restored: boolean;
    invalidated: boolean;
  }>({ threadId, signature: null, restored: false, invalidated: false });
  const fontSize = useSharedSettings((state) => state.guiChatFontSize);
  useLayoutEffect(() => {
    if (layoutRef.current.threadId !== threadId) {
      layoutRef.current = { threadId, signature: null, restored: false, invalidated: false };
    }
    const scrollElement = scrollElementRef.current;
    if (!scrollElement || !hasItems) return;
    const observeLayout = () => {
      const instance = listRef.current;
      if (!instance) return;
      const signature = getTimelineMeasurementSignature(scrollElement);
      if (!signature) return;
      const layout = layoutRef.current;
      if (layout.signature !== null && layout.signature !== signature) {
        layout.invalidated = true;
        layout.signature = null;
      }
      if (layout.invalidated) return;
      layout.signature = signature;
      if (layout.restored) return;
      layout.restored = true;
      const entryIds = new Set(entriesRef.current.map((entry) => entry.id));
      const width = scrollElement.clientWidth;
      for (const measurement of readTimelineMeasurements(threadId, signature)) {
        if (!entryIds.has(String(measurement.key))) continue;
        instance.setItemSize(String(measurement.key), { height: measurement.size, width });
      }
    };
    observeLayout();
    let previousWidth: number | undefined;
    const observer = new ResizeObserver((observations) => {
      const observation = observations?.find((entry) => entry.target === scrollElement);
      if (!observation) return;
      const width = observation.contentRect?.width;
      if (width !== undefined && width === previousWidth) return;
      previousWidth = width;
      observeLayout();
    });
    observer.observe(scrollElement);
    return () => observer.disconnect();
    // The font setting changes computed CSS geometry without changing viewport
    // width, so it must restart the layout check even though it is read via CSS.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [threadId, hasItems, fontSize, entriesRef, listRef, scrollElementRef]);

  // This is the existing imperative ref's callback escape, moved with its
  // cache lifecycle. It remains stable across transcript/font updates.
  return useCallback(
    (instance: LegendListRef, scrollElement: HTMLDivElement) => {
      const state = useAppStore.getState();
      // Project/catalog retirement can leave runtime items resident until their
      // own eviction. A later pane detach must not re-admit a missing owner.
      // Only definitive lifecycle actions retire snapshots; absence alone does not.
      if (!state.threads.some((thread) => thread.id === threadId)) return;
      const layout = layoutRef.current;
      const signature = layout.signature;
      if (
        layout.threadId !== threadId ||
        layout.invalidated ||
        !signature ||
        getTimelineMeasurementSignature(scrollElement) !== signature
      )
        return;
      const sizes = instance.getState().sizes;
      const measurements = [];
      const entries = entriesRef.current;
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        if (
          entry.kind !== "item" ||
          !isRemountStableSnapshotItem(selectRuntimeItemById(state, threadId, entry.id))
        )
          continue;
        const size = sizes.get(entry.id);
        if (size === undefined) continue;
        measurements.push({ key: entry.id, index, size });
        // One over-limit record lets the cache reject the whole snapshot without
        // allocating all measurements in a very large loaded transcript.
        if (measurements.length > MAX_TIMELINE_SNAPSHOT_ROWS) break;
      }
      writeTimelineMeasurements(threadId, signature, measurements);
    },
    [threadId, entriesRef],
  );
}

/**
 * Whether a completed row's measured height survives a remount unchanged, so its
 * cached measurement may be restored (see `writeTimelineMeasurements`, applied
 * via LegendList's `setItemSize`). A row type with local expand/collapse state
 * remounts collapsed (its `useState` dies with the fiber), so restoring an
 * expanded-state size would anchor the list to a stale height on first revisit
 * — the jump the snapshot cache exists to prevent. Tool-call groups, reasoning
 * ("Thought" toggle), user messages (clamped "Show more"), and every tool/
 * command/file/search accordion are therefore unstable; non-completed rows are
 * dropped too since their height keeps changing while the thread works in the
 * background.
 */
function isRemountStableSnapshotItem(item: RuntimeChatItem | undefined): boolean {
  if (!item || item.state !== "completed") return false;
  switch (item.type) {
    case "assistant_message":
    case "plan":
    case "question_answer":
    case "provider_handoff":
    case "error":
      return true;
    default:
      // Inline image cards have no disclosure; every other tool-like row renders
      // the collapsible accordion and remounts collapsed.
      return isToolLikeItem(item) && imageViewRendersInline(item.payload);
  }
}
