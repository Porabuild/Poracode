import type { DragSourceData } from "@/renderer/dnd";

/**
 * Drag-source options for a thread or draft pane.
 *
 * dnd-kit's accessibility plugin decorates `handle ?? element` with
 * role="button", tabindex="0" and aria-disabled. A lone pane never mounts a
 * drag handle, so registering the pane element would turn the whole pane,
 * composer included, into a disabled button. Chromium then reports every
 * descendant as disabled through UI Automation, and dictation tools such as
 * Typeless treat the composer as read-only and fall back to a popup. Callers
 * must therefore only pass the pane element to `useDraggable` while
 * `registerElement` is true (two or more panes, so a handle exists); a lone
 * pane registers a disabled source with nothing to decorate.
 */
export function paneDragSourceOptions(input: { paneId: string; paneCount: number }): {
  options: {
    id: string;
    type: "pane";
    data: DragSourceData;
    disabled: boolean;
  };
  registerElement: boolean;
} {
  const draggable = input.paneCount > 1;
  return {
    options: {
      id: `pane:${input.paneId}`,
      type: "pane",
      data: { type: "pane", paneId: input.paneId },
      disabled: !draggable,
    },
    registerElement: draggable,
  };
}
