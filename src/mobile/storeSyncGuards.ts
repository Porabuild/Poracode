export function shouldReplaceRuntimeItemsFromSnapshot(input: {
  readonly existingCount: number;
  readonly snapshotItemCount: number;
  readonly threadActive: boolean;
}): boolean {
  if (input.existingCount === 0) return true;
  if (input.snapshotItemCount > input.existingCount) return true;
  return !input.threadActive && input.snapshotItemCount >= input.existingCount;
}
