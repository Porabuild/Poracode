import type { PaneLayoutAxis } from "@/shared/paneLayout";

/**
 * Id of the drop zone that inserts a pane at a split's divider.
 *
 * Built in one place because two paths produce it and they must agree: the
 * divider's own droppable (`SplitPaneContainer`) and the sibling-edge target
 * derived while a drag hovers the inner edge of a pane (`dnd.tsx`). When the two
 * formats drift, the drag indicator silently stops highlighting — the id no
 * longer matches any rendered divider.
 */
export function paneInsertZoneId(input: {
  axis: PaneLayoutAxis;
  path: readonly number[];
  index: number;
}): string {
  return `pane-insert:${input.axis}:${input.path.join("-")}:${input.index}`;
}
