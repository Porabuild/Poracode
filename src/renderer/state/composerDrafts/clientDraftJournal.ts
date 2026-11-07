/** Synchronous close-time protection while the shared metadata writer is async. */
export const CLIENT_DRAFT_JOURNAL_PREFIX = "poracode-composer-draft-journal-v1:";

export interface ClientDraftJournal {
  key: string;
  raw: string;
  name: string;
  base: string | null;
  record: unknown;
}

export function readClientDraftJournals(storage: Storage): ClientDraftJournal[] {
  const entries: ClientDraftJournal[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(CLIENT_DRAFT_JOURNAL_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (
        value.formatVersion === 1 &&
        typeof value.name === "string" &&
        (value.base === null || typeof value.base === "string") &&
        "record" in value
      )
        entries.push({ key, raw, name: value.name, base: value.base, record: value.record });
    } catch {
      // Unknown/corrupt journals are preserved, never rewritten by this reader.
    }
  }
  return entries;
}

export function writeClientDraftJournal(
  storage: Storage,
  writerId: string,
  name: string,
  base: string | null,
  record: unknown,
) {
  storage.setItem(
    CLIENT_DRAFT_JOURNAL_PREFIX + writerId + ":" + name,
    JSON.stringify({ formatVersion: 1, name, base, record }),
  );
}

export function removeClientDraftJournal(storage: Storage, entry: ClientDraftJournal) {
  if (storage.getItem(entry.key) === entry.raw) storage.removeItem(entry.key);
}
