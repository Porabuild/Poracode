import type { ThreadPresentationMode } from "./contracts";

export interface ModelPickerRef {
  agentKind: string;
  modelId: string;
  presentationMode?: ThreadPresentationMode;
}

function refKey(ref: ModelPickerRef): string {
  return JSON.stringify([ref.agentKind, ref.modelId, ref.presentationMode]);
}

/** Reorder only the supplied favorites in their existing slots. Hidden models,
 * other presentations and favorites added during a drag retain their positions.
 * Resolve against current entries so a stale menu cannot resurrect removals. */
export function reorderModelPickerRefs<T extends ModelPickerRef>(
  current: readonly T[],
  ordered: readonly ModelPickerRef[],
): T[] {
  const ranks = new Map(ordered.map((ref, index) => [refKey(ref), index]));
  const reordered = current
    .filter((ref) => ranks.has(refKey(ref)))
    .toSorted((a, b) => ranks.get(refKey(a))! - ranks.get(refKey(b))!);
  let index = 0;
  return current.map((ref) => (ranks.has(refKey(ref)) ? reordered[index++]! : ref));
}
