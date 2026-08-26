export type RuntimeStructuralChangeHint = {
  readonly version: number;
  readonly itemIds: readonly string[] | null;
};

const runtimeStructuralChangeHints = new Map<string, RuntimeStructuralChangeHint>();

export function recordRuntimeStructuralChangeHint(
  threadId: string,
  version: number,
  itemIds: ReadonlySet<string> | null,
): void {
  runtimeStructuralChangeHints.set(threadId, {
    version,
    itemIds: itemIds === null ? null : [...itemIds],
  });
}

export function readRuntimeStructuralChangeHint(
  threadId: string,
  version: number,
): RuntimeStructuralChangeHint | null {
  const hint = runtimeStructuralChangeHints.get(threadId);
  return hint?.version === version ? hint : null;
}

export function clearRuntimeStructuralChangeHint(threadId: string): void {
  runtimeStructuralChangeHints.delete(threadId);
}
