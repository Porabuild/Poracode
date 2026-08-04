import { ArrowDownUp, CalendarClock, GripVertical, List, ListTree } from "lucide-react";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export type ThreadSortMode = "updated" | "created" | "manual";

export const sortModeOrder: ThreadSortMode[] = ["updated", "created", "manual"];

export const sortModeIcon: Record<ThreadSortMode, typeof ArrowDownUp> = {
  updated: ArrowDownUp,
  created: CalendarClock,
  manual: GripVertical,
};

/** Display labels keyed by the stable {@link ThreadSortMode} id; resolve via `useLingui().t`. */
export const sortModeLabel: Record<ThreadSortMode, MessageDescriptor> = {
  updated: msg`Sort by last updated`,
  created: msg`Sort by created`,
  manual: msg`Manual order`,
};

/**
 * How the thread list is structured — orthogonal to the sort order above.
 * `grouped` renders one section per project; `flat` renders one cross-project
 * list (the PWA layout) with each row labelled by its project. Manual sort
 * only applies to the grouped layout; the flat list falls back to last-updated
 * order.
 */
export type ThreadListLayout = "grouped" | "flat";

export const listLayoutOrder: ThreadListLayout[] = ["grouped", "flat"];

export const listLayoutIcon: Record<ThreadListLayout, typeof ArrowDownUp> = {
  grouped: ListTree,
  flat: List,
};

/** Display labels keyed by the stable {@link ThreadListLayout} id; resolve via `useLingui().t`. */
export const listLayoutLabel: Record<ThreadListLayout, MessageDescriptor> = {
  grouped: msg`Grouped by project`,
  flat: msg`Flat list`,
};
