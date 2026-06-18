import { ArrowDownUp, CalendarClock, GripVertical } from "lucide-react";
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
