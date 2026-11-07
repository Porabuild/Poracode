/**
 * Applies one host's authoritative manual order to its rows inside a store
 * array shared with other hosts' rows, whichever host that is. The host's rows
 * are permuted between the slots they already occupy, so other hosts' rows
 * keep their positions. Ids the order did not name follow in their previous
 * relative order; a repeated id keeps its first rank. `orderedHostIds` are the
 * host's own ids (a projected row carries its host id as `remoteId`).
 *
 * Returns `rows` itself when nothing moves.
 */
export function orderHostRows<
  T extends { readonly id: string; readonly remoteId?: string | undefined },
>(
  rows: readonly T[],
  inScope: (row: T) => boolean,
  orderedHostIds: readonly string[],
): readonly T[] {
  if (orderedHostIds.length === 0) return rows;
  const rank = new Map<string, number>();
  for (const [index, id] of orderedHostIds.entries()) if (!rank.has(id)) rank.set(id, index);
  const scoped = rows.filter(inScope);
  if (scoped.length < 2) return rows;
  const ranked = scoped
    .map((row, index) => ({ row, index, rank: rank.get(row.remoteId ?? row.id) }))
    .sort((left, right) => {
      const leftNamed = left.rank !== undefined;
      const rightNamed = right.rank !== undefined;
      if (leftNamed && rightNamed) return left.rank! - right.rank!;
      if (leftNamed !== rightNamed) return leftNamed ? -1 : 1;
      return left.index - right.index;
    });
  if (ranked.every((entry, index) => entry.row === scoped[index])) return rows;
  const next = rows.slice();
  let cursor = 0;
  for (let index = 0; index < next.length; index += 1) {
    if (!inScope(next[index]!)) continue;
    next[index] = ranked[cursor]!.row;
    cursor += 1;
  }
  return next;
}
