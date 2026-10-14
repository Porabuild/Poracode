/** Renderer-only overlays for reversible catalog edits awaiting their owner. */
type CatalogRow = { readonly id: string };
type CatalogKind = "project" | "thread";
interface PendingEdit {
  base: CatalogRow;
  patch: object;
  revision: number;
  confirmedRevision: number;
  observedMatchRevision: number;
  fieldObservations: Map<string, number>;
  fieldRevisions: Map<string, number>;
  serverGeneratedFields: Set<string>;
}
const edits = new Map<string, PendingEdit>();
const queues = new Map<string, Promise<void>>();
const tails = new Map<
  string,
  { coalesceKey: string | undefined; started: boolean; superseded: boolean }
>();

function keyFor(kind: CatalogKind, id: string): string {
  return `${kind}:${id}`;
}
function matches(row: CatalogRow, patch: object): boolean {
  return Object.entries(patch).every(
    ([key, value]) =>
      JSON.stringify((row as unknown as Record<string, unknown>)[key]) === JSON.stringify(value),
  );
}

export function projectPendingCatalogEdit<T extends CatalogRow>(kind: CatalogKind, row: T): T {
  const key = keyFor(kind, row.id);
  const edit = edits.get(key);
  if (!edit) return row;
  // Incoming rows have already passed the catalog's sequence fence. Preserve
  // the owner's latest values beneath the presentation overlay for refusal.
  for (const field of Object.keys(edit.patch)) {
    const before = (edit.base as unknown as Record<string, unknown>)[field];
    const after = (row as unknown as Record<string, unknown>)[field];
    if (JSON.stringify(before) !== JSON.stringify(after))
      edit.fieldObservations.set(field, (edit.fieldObservations.get(field) ?? 0) + 1);
  }
  edit.base = row;
  const confirmationPatch = Object.fromEntries(
    Object.entries(edit.patch).filter(([field]) => !edit.serverGeneratedFields.has(field)),
  );
  const observed = matches(row, confirmationPatch);
  if (observed) edit.observedMatchRevision = edit.revision;
  if (edit.confirmedRevision >= Math.max(...edit.fieldRevisions.values()) && observed) {
    edits.delete(key);
    return row;
  }
  return { ...row, ...edit.patch };
}

/** Paint first; serialize owner writes so rapid clicks/typing retain their order. */
export function dispatchOptimisticCatalogEdit<T extends CatalogRow>(input: {
  kind: CatalogKind;
  row: T;
  patch: Partial<T>;
  apply: () => void;
  write: () => Promise<unknown>;
  restore: (row: T) => void;
  /** Derived values may differ after the owner applies the same intent (e.g. timestamps). */
  serverGeneratedFields?: readonly (keyof T & string)[];
  /** Replace only undispatched writes of the same field; other commands are order barriers. */
  coalesceKey?: string;
}): Promise<void> {
  const key = keyFor(input.kind, input.row.id);
  const previous = edits.get(key);
  const revision = (previous?.revision ?? 0) + 1;
  const edit: PendingEdit = previous ?? {
    base: input.row,
    patch: {},
    revision: 0,
    confirmedRevision: 0,
    observedMatchRevision: 0,
    fieldObservations: new Map(),
    fieldRevisions: new Map(),
    serverGeneratedFields: new Set(),
  };
  edit.patch = { ...edit.patch, ...input.patch };
  edit.revision = revision;
  for (const field of Object.keys(input.patch)) edit.fieldRevisions.set(field, revision);
  for (const field of input.serverGeneratedFields ?? []) edit.serverGeneratedFields.add(field);
  edits.set(key, edit);
  input.apply();
  const predecessor = queues.get(key);
  const previousTail = tails.get(key);
  if (input.coalesceKey && previousTail?.coalesceKey === input.coalesceKey && !previousTail.started)
    previousTail.superseded = true;
  const tail = { coalesceKey: input.coalesceKey, started: false, superseded: false };
  tails.set(key, tail);
  let sent = false;
  let observationsAtDispatch = new Map<string, number>();
  const send = () => {
    if (tail.superseded || edits.get(key) !== edit) return Promise.resolve();
    tail.started = true;
    sent = true;
    observationsAtDispatch = new Map(edit.fieldObservations);
    return input.write();
  };
  let started: Promise<unknown>;
  try {
    started = predecessor ? predecessor.catch(() => {}).then(send) : Promise.resolve(send());
  } catch (error) {
    started = Promise.reject(error);
  }
  const write = started.then(
    () => {
      if (!sent || edits.get(key) !== edit) return;
      const accepted = Object.fromEntries(
        Object.entries(input.patch).filter(
          ([field]) => edit.fieldObservations.get(field) === observationsAtDispatch.get(field),
        ),
      );
      edit.base = { ...edit.base, ...accepted };
      edit.confirmedRevision = revision;
      if (edit.observedMatchRevision === edit.revision && revision === edit.revision)
        edits.delete(key);
    },
    (error: unknown) => {
      if (edits.get(key) === edit) {
        let changed = false;
        const patch = { ...edit.patch } as Record<string, unknown>;
        for (const field of Object.keys(input.patch)) {
          if (edit.fieldRevisions.get(field) !== revision) continue;
          edit.fieldRevisions.delete(field);
          delete patch[field];
          changed = true;
        }
        edit.patch = patch;
        if (edit.fieldRevisions.size === 0) edits.delete(key);
        if (changed) input.restore({ ...edit.base, ...edit.patch } as T);
      }
      throw error;
    },
  );
  queues.set(key, write);
  void write
    .finally(() => {
      if (queues.get(key) === write) queues.delete(key);
      if (tails.get(key) === tail) tails.delete(key);
    })
    .catch(() => {});
  return write;
}

export function forgetPendingCatalogEdit(kind: CatalogKind, id: string): void {
  edits.delete(keyFor(kind, id));
}

/** Forwarded host commands carry patches, rather than a complete fresh row. */
export function projectAuthoritativeCatalogPatch<T extends CatalogRow>(
  kind: CatalogKind,
  row: T,
  patch: Partial<T>,
): T {
  const base = (edits.get(keyFor(kind, row.id))?.base as T | undefined) ?? row;
  return projectPendingCatalogEdit(kind, { ...base, ...patch });
}

export function catalogEditPatch<T extends CatalogRow>(before: T, after: T): Partial<T> {
  return Object.fromEntries(
    Object.keys({ ...before, ...after })
      .filter(
        (key) => JSON.stringify(before[key as keyof T]) !== JSON.stringify(after[key as keyof T]),
      )
      .map((key) => [key, after[key as keyof T]]),
  ) as Partial<T>;
}

/** Copy only this intent's fields, including explicit clears, into a live row. */
export function applyCatalogPatchFields<T extends CatalogRow>(
  row: T,
  source: T,
  patch: Partial<T>,
): T {
  return {
    ...row,
    ...Object.fromEntries(Object.keys(patch).map((field) => [field, source[field as keyof T]])),
  };
}
