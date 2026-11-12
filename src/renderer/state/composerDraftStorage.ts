import type { z } from "zod";
import { legacyStoragePayloadFingerprint } from "./browserMetadataCache";
import { projectDraftConfigSchema } from "@/shared/contracts";
import { storableAttachments } from "@/renderer/components/composer/useAttachments";
import {
  serializeClientDraftMetadataWrite,
  queueClientDraftAssetReclamation,
  setClientDraftAssetReferences,
  isClientDraftAsset,
  registerClientDraftWindow,
  protectClientDraftReferences,
  type ClientDraftSubmission,
} from "./composerDrafts/clientDraftDatabase";
import type { DraftContent } from "./slices/types";
import { mergeDraftContent } from "./projectReferences";
import { registerClientDraftCloseFlusher } from "./composerDrafts/clientDraftWindows";
import {
  CLIENT_DRAFT_JOURNAL_PREFIX,
  readClientDraftJournals,
  writeClientDraftJournal,
  removeClientDraftJournal,
  type ClientDraftJournal,
} from "./composerDrafts/clientDraftJournal";

// V2 can contain client asset references. A v1 reader would mistake them for
// host paths, so use a new namespace. Retain v1 bytes with fingerprint-bound
// migration markers: an older tab can still be editing that legacy key.
// Selection chips add only optional text metadata; older v2 readers retain the text.
const PREFIX = "poracode-composer-draft-v2:";
const LEGACY_PREFIX = "poracode-composer-draft-v1:";
import {
  draftContentSchema,
  recordSchema,
  type DraftKind,
  type DraftCheckpoint,
} from "./composerDrafts/checkpointSchema";
export {
  draftContentSchema,
  type DraftKind,
  type DraftCheckpoint,
} from "./composerDrafts/checkpointSchema";

export function createComposerDraftStorage(storage: Storage, lifecycle: Window) {
  registerClientDraftWindow();
  type StoredRecord = z.infer<typeof recordSchema>;
  const pending = new Map<string, StoredRecord | null>();
  const records = new Map<string, StoredRecord | null>();
  const observed = new Map<string, string | null>();
  const legacyObserved = new Map<string, string>();
  const moved = new Map<string, { draftId: string; revision: number }>();
  const writerId = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  let reported = false;
  const key = (kind: DraftKind, id: string) => PREFIX + JSON.stringify([kind, id]);
  const legacyKey = (name: string) => LEGACY_PREFIX + name.slice(PREFIX.length);
  const migrationKey = (name: string) =>
    "poracode-composer-draft-migration-v2:" + name.slice(PREFIX.length);
  const assetPaths = (content: DraftContent | undefined) =>
    content
      ? [
          ...content.attachments.map((attachment) => attachment.path),
          ...content.segments.flatMap((segment) =>
            segment.kind === "attachment" ? [segment.path] : [],
          ),
        ].filter(isClientDraftAsset)
      : [];
  function journalIndex(entries: readonly ClientDraftJournal[]) {
    const index = new Map<string, ClientDraftJournal[]>();
    for (const entry of entries) {
      const group = index.get(entry.name) ?? [];
      group.push(entry);
      index.set(entry.name, group);
    }
    return index;
  }
  function recoverySubmission(
    name: string,
    record: StoredRecord,
    id: string,
  ): ClientDraftSubmission {
    const [kind, ownerId] = JSON.parse(name.slice(PREFIX.length)) as [DraftKind, string];
    return {
      formatVersion: 1,
      id,
      draftId: record.draftId,
      scope: JSON.stringify([kind, ownerId]),
      revision: record.revision,
      target: "local-checkpoint",
      fingerprint: JSON.stringify(record.content),
      state: "failed",
      content: { checkpoint: { ...record, kind, ownerId }, recoveryContent: record.content },
      assets: assetPaths(record.content),
    };
  }

  function stopTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lifecycle.document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  function report(error: unknown) {
    console.error("[poracode] failed to persist composer draft", error);
    if (!reported) lifecycle.dispatchEvent(new Event("poracode:composer-draft-save-failed"));
    reported = true;
  }
  function readRecord(
    kind: DraftKind,
    id: string,
    indexedJournals?: ReadonlyMap<string, readonly ClientDraftJournal[]>,
  ): StoredRecord | undefined {
    const name = key(kind, id);
    if (pending.has(name)) return pending.get(name) ?? undefined;
    if (records.has(name)) return records.get(name) ?? undefined;
    const raw = storage.getItem(name);
    observed.set(name, raw);
    // A pagehide journal can outlive the asynchronous writer. Adopt only an
    // exact base match; concurrent edits with another base remain recoverable.
    const journals = indexedJournals
      ? (indexedJournals.get(name) ?? [])
      : readClientDraftJournals(storage).filter((entry) => entry.name === name);
    for (const entry of journals) {
      if (entry.base !== raw) continue;
      if (entry.record === null) {
        pending.set(name, null);
        records.set(name, null);
        schedule();
        return undefined;
      }
      const candidate = recordSchema.safeParse(entry.record);
      if (!candidate.success) continue;
      pending.set(name, candidate.data);
      records.set(name, candidate.data);
      schedule();
      return candidate.data;
    }
    if (raw) {
      const result = recordSchema.safeParse(JSON.parse(raw));
      if (!result.success) return undefined;
      records.set(name, result.data);
      return result.data;
    }
    const legacy = storage.getItem(legacyKey(name));
    if (!legacy || storage.getItem(migrationKey(name)) === legacyStoragePayloadFingerprint(legacy))
      return undefined;
    const parsed = draftContentSchema.safeParse(JSON.parse(legacy));
    if (!parsed.success) return undefined;
    const record: StoredRecord = {
      formatVersion: 2,
      draftId: crypto.randomUUID(),
      revision: 0,
      content: parsed.data,
      legacyFingerprint: legacyStoragePayloadFingerprint(legacy),
    };
    legacyObserved.set(name, legacy);
    records.set(name, record);
    pending.set(name, record);
    schedule();
    return record;
  }
  function writePending(
    backup?: (record: import("./composerDrafts/clientDraftDatabase").ClientDraftSubmission) => void,
    onlyName?: string,
  ) {
    if (onlyName === undefined) stopTimer();
    const indexedJournals = journalIndex(readClientDraftJournals(storage));
    let failure: unknown;
    for (const [name, record] of pending) {
      if (onlyName !== undefined && name !== onlyName) continue;
      try {
        const raw = storage.getItem(name);
        if (raw !== (observed.get(name) ?? null))
          throw new Error("Composer draft changed in another window.");
        const parsed = raw ? recordSchema.safeParse(JSON.parse(raw)) : undefined;
        if (parsed && !parsed.success) throw new Error("Unsupported composer draft version.");
        const previous = parsed?.success ? parsed.data : undefined;
        if (record) {
          const encoded = JSON.stringify(record);
          storage.setItem(name, encoded);
          observed.set(name, encoded);
        } else {
          storage.removeItem(name);
          observed.set(name, null);
        }
        pending.delete(name);
        for (const entry of indexedJournals.get(name) ?? [])
          if (
            entry.name === name &&
            entry.base === raw &&
            JSON.stringify(entry.record) === JSON.stringify(record)
          )
            removeClientDraftJournal(storage, entry);
        const legacy = legacyObserved.get(name);
        const fingerprint =
          record?.legacyFingerprint ??
          previous?.legacyFingerprint ??
          (legacy !== undefined ? legacyStoragePayloadFingerprint(legacy) : undefined);
        if (fingerprint !== undefined) storage.setItem(migrationKey(name), fingerprint);
        legacyObserved.delete(name);
        const retained = new Set(assetPaths(record?.content));
        queueClientDraftAssetReclamation(
          assetPaths(previous?.content).filter((path) => !retained.has(path)),
        );
      } catch (error) {
        failure ??= error;
        if (record && record.revision > 0 && backup) {
          backup(
            recoverySubmission(name, record, `checkpoint-conflict:${writerId}:${record.draftId}`),
          );
        }
      }
    }
    if (failure)
      throw failure instanceof Error
        ? failure
        : new Error("Client draft write failed.", { cause: failure });
    reported = false;
  }
  async function flushRequired() {
    if (running) return running;
    const work = async () => {
      while (pending.size > 0) {
        if (typeof indexedDB === "undefined") writePending();
        else await serializeClientDraftMetadataWrite(writePending);
      }
    };
    running = work();
    try {
      await running;
    } finally {
      running = undefined;
    }
  }
  async function flushScope(kind: DraftKind, ownerId: string) {
    await running?.catch(() => undefined);
    const name = key(kind, ownerId);
    const write = (backup?: (record: ClientDraftSubmission) => void) => writePending(backup, name);
    while (pending.has(name)) {
      if (typeof indexedDB === "undefined") write();
      else await serializeClientDraftMetadataWrite(write);
    }
    if (pending.size === 0) stopTimer();
  }
  function flush() {
    // Do this before the first await: lifecycle events cannot keep an IDB
    // transaction alive after the page is torn down.
    try {
      if (typeof indexedDB !== "undefined")
        for (const [name, record] of pending)
          writeClientDraftJournal(storage, writerId, name, observed.get(name) ?? null, record);
    } catch (error) {
      report(error);
    }
    if (typeof indexedDB === "undefined") {
      try {
        writePending();
      } catch (error) {
        report(error);
      }
    } else void flushRequired().catch(report);
  }
  function schedule() {
    if (timer !== undefined) return;
    timer = setTimeout(flush, 250);
    lifecycle.document.addEventListener("visibilitychange", onVisibilityChange);
  }
  function onVisibilityChange() {
    if (lifecycle.document.visibilityState === "hidden") flush();
  }
  const unregisterCloseFlusher = registerClientDraftCloseFlusher(flush);
  function load(kind: DraftKind): Record<string, DraftContent> {
    const drafts: Record<string, DraftContent> = {};
    const ids = new Set<string>();
    try {
      const journals = readClientDraftJournals(storage);
      const indexedJournals = journalIndex(journals);
      for (let index = 0; index < storage.length; index++) {
        const name = storage.key(index);
        const prefix = name?.startsWith(PREFIX)
          ? PREFIX
          : name?.startsWith(LEGACY_PREFIX)
            ? LEGACY_PREFIX
            : null;
        if (!prefix || !name) continue;
        try {
          const identity: unknown = JSON.parse(name.slice(prefix.length));
          if (
            Array.isArray(identity) &&
            identity.length === 2 &&
            identity[0] === kind &&
            typeof identity[1] === "string"
          )
            ids.add(identity[1]);
        } catch {
          /* One invalid record must not hide the remaining drafts. */
        }
      }
      for (const name of pending.keys()) {
        const [recordKind, id] = JSON.parse(name.slice(PREFIX.length)) as [DraftKind, string];
        if (recordKind === kind) ids.add(id);
      }
      for (const entry of journals) {
        try {
          const [recordKind, id] = JSON.parse(entry.name.slice(PREFIX.length)) as [
            DraftKind,
            string,
          ];
          if (entry.name.startsWith(PREFIX) && recordKind === kind && typeof id === "string")
            ids.add(id);
        } catch {
          /* Preserve invalid journals. */
        }
      }
      for (const id of ids) {
        try {
          const record = readRecord(kind, id, indexedJournals);
          if (record)
            Object.defineProperty(drafts, id, {
              value: record.content,
              enumerable: true,
              configurable: true,
              writable: true,
            });
        } catch {
          /* Future/corrupt records are never rewritten. */
        }
      }
    } catch (error) {
      console.error("[poracode] failed to load composer drafts", error);
    }
    return drafts;
  }
  function save(kind: DraftKind, id: string, content: DraftContent) {
    const name = key(kind, id);
    const clean = draftContentSchema.parse({
      segments: content.segments,
      attachments: storableAttachments(content.attachments),
    });
    let previous: StoredRecord | undefined;
    try {
      previous = readRecord(kind, id);
    } catch {
      /* keep the new edit in memory and surface persistence failure */
    }
    if (!observed.has(name)) observed.set(name, storage.getItem(name));
    const identity = moved.get(name);
    moved.delete(name);
    if (!identity && previous && JSON.stringify(previous.content) === JSON.stringify(clean)) return;
    const record: StoredRecord = {
      formatVersion: 2,
      draftId: identity?.draftId ?? previous?.draftId ?? crypto.randomUUID(),
      revision: identity?.revision ?? (previous?.revision ?? 0) + 1,
      content: clean,
      ...(previous?.selection ? { selection: previous.selection } : {}),
      ...(previous?.legacyFingerprint ? { legacyFingerprint: previous.legacyFingerprint } : {}),
    };
    records.set(name, record);
    pending.set(name, record);
    protectClientDraftReferences(assetPaths(record?.content));
    schedule();
  }
  function remove(kind: DraftKind, id: string, discardSelection = false) {
    const name = key(kind, id);
    let previous: StoredRecord | undefined;
    try {
      previous = readRecord(kind, id);
    } catch {
      return;
    }
    if (previous?.selection && !discardSelection) {
      save(kind, id, { segments: [], attachments: [] });
      return;
    }
    if (!observed.has(name)) observed.set(name, storage.getItem(name));
    pending.set(name, null);
    records.set(name, null);
    moved.delete(name);
    schedule();
  }
  function canReclaimAssets(): boolean {
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (!name?.startsWith(PREFIX)) continue;
      try {
        if (!recordSchema.safeParse(JSON.parse(storage.getItem(name) ?? "null")).success)
          return false;
      } catch {
        return false;
      }
    }
    const journals = readClientDraftJournals(storage);
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (
        name?.startsWith(CLIENT_DRAFT_JOURNAL_PREFIX) &&
        !journals.some((entry) => entry.key === name)
      )
        return false;
    }
    if (
      journals.some(
        (entry) => entry.record !== null && !recordSchema.safeParse(entry.record).success,
      )
    )
      return false;
    return true;
  }
  function referencedAssets(): Set<string> {
    const drafts = [...Object.values(load("project")), ...Object.values(load("thread"))];
    for (const entry of readClientDraftJournals(storage)) {
      const record = recordSchema.safeParse(entry.record);
      if (record.success) drafts.push(record.data.content);
    }
    // Pending removals cannot make a still-durable reference disappear early.
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index);
      if (!name?.startsWith(PREFIX)) continue;
      try {
        const record = recordSchema.safeParse(JSON.parse(storage.getItem(name) ?? "null"));
        if (record.success) drafts.push(record.data.content);
      } catch {
        /* unknown records disable reclamation at the caller */
      }
    }
    return new Set(drafts.flatMap(assetPaths));
  }
  const api = {
    load,
    save,
    remove,
    flush,
    flushRequired,
    canReclaimAssets,
    referencedAssets,
    async recoverJournals() {
      const restored: ReturnType<typeof readClientDraftJournals> = [];
      await serializeClientDraftMetadataWrite((backup) => {
        for (const entry of readClientDraftJournals(storage)) {
          if (!entry.name.startsWith(PREFIX)) continue;
          const raw = storage.getItem(entry.name);
          if (entry.record === null) {
            const previous = raw ? recordSchema.safeParse(JSON.parse(raw)) : undefined;
            if (raw && !previous?.success) continue;
            if (raw === entry.base) {
              if (previous?.success && previous.data.legacyFingerprint)
                storage.setItem(migrationKey(entry.name), previous.data.legacyFingerprint);
              storage.removeItem(entry.name);
              observed.set(entry.name, null);
              if (!pending.has(entry.name)) records.set(entry.name, null);
            }
            restored.push(entry);
            continue;
          }
          if (JSON.stringify(entry.record) === raw) {
            if (!pending.has(entry.name)) {
              records.delete(entry.name);
              observed.delete(entry.name);
            }
            restored.push(entry);
            continue;
          }
          const parsed = recordSchema.safeParse(entry.record);
          if (!entry.name.startsWith(PREFIX) || !parsed.success) continue;
          if (raw === entry.base && !pending.has(entry.name)) {
            const encoded = JSON.stringify(parsed.data);
            storage.setItem(entry.name, encoded);
            observed.set(entry.name, encoded);
            records.set(entry.name, parsed.data);
            restored.push(entry);
            continue;
          }
          backup(recoverySubmission(entry.name, parsed.data, "journal:" + entry.key));
          restored.push(entry);
        }
      });
      for (const entry of restored) removeClientDraftJournal(storage, entry);
    },
    /** Only an explicit Restore may merge a concurrent writer's branch. */
    async recover(kind: DraftKind, ownerId: string, apply: (content: DraftContent) => void) {
      await running?.catch(() => undefined);
      await serializeClientDraftMetadataWrite(() => {
        const name = key(kind, ownerId);
        const local = pending.get(name) ?? records.get(name);
        if (!local) return;
        const raw = storage.getItem(name);
        const winner = raw ? recordSchema.parse(JSON.parse(raw)) : undefined;
        const conflicting = raw !== (observed.get(name) ?? null);
        const record: StoredRecord = conflicting
          ? {
              ...local,
              draftId: crypto.randomUUID(),
              revision: Math.max(local.revision, winner?.revision ?? 0) + 1,
              content: winner ? mergeDraftContent(local.content, winner.content) : local.content,
            }
          : local;
        const encoded = JSON.stringify(record);
        storage.setItem(name, encoded);
        observed.set(name, encoded);
        records.set(name, record);
        pending.delete(name);
        for (const entry of readClientDraftJournals(storage))
          if (
            entry.name === name &&
            (JSON.stringify(entry.record) === JSON.stringify(local) ||
              JSON.stringify(entry.record) === raw)
          )
            removeClientDraftJournal(storage, entry);
        // Apply under the same synchronous retirement/restore boundary; newer
        // typing can neither be read before nor erased after an await here.
        if (conflicting) apply(record.content);
      });
      await flushScope(kind, ownerId);
    },
    dispose() {
      stopTimer();
      unregisterCloseFlusher();
    },
    async checkpoint(
      kind: DraftKind,
      ownerId: string,
      content: DraftContent,
    ): Promise<DraftCheckpoint> {
      save(kind, ownerId, content);
      const record = readRecord(kind, ownerId);
      await flushScope(kind, ownerId);
      if (!record) throw new Error("Composer draft could not be saved.");
      return { ...record, kind, ownerId };
    },
    async acknowledge(checkpoint: DraftCheckpoint, onRetire?: () => void): Promise<boolean> {
      await flushScope(checkpoint.kind, checkpoint.ownerId);
      let acknowledged = false;
      const retire = () => {
        const name = key(checkpoint.kind, checkpoint.ownerId);
        const queued = pending.get(name);
        if (
          queued &&
          (queued.draftId !== checkpoint.draftId || queued.revision !== checkpoint.revision)
        )
          return;
        const raw = storage.getItem(name);
        const current = raw ? recordSchema.safeParse(JSON.parse(raw)) : undefined;
        if (
          !current?.success ||
          current.data.draftId !== checkpoint.draftId ||
          current.data.revision !== checkpoint.revision
        )
          return;
        if (current.data.legacyFingerprint)
          storage.setItem(migrationKey(name), current.data.legacyFingerprint);
        storage.removeItem(name);
        records.set(name, null);
        pending.delete(name);
        observed.set(name, null);
        acknowledged = true;
        onRetire?.();
      };
      if (typeof indexedDB === "undefined") retire();
      else await serializeClientDraftMetadataWrite(retire);
      return acknowledged;
    },
    transferIdentity(kind: DraftKind, from: string, to: string) {
      const source = readRecord(kind, from);
      if (source)
        moved.set(key(kind, to), { draftId: source.draftId, revision: source.revision + 1 });
    },
    currentDraft(kind: DraftKind, id: string) {
      try {
        return readRecord(kind, id)?.content;
      } catch {
        return undefined;
      }
    },
    currentIdentity(kind: DraftKind, id: string) {
      try {
        const record = readRecord(kind, id);
        return record ? { draftId: record.draftId, revision: record.revision } : undefined;
      } catch {
        return undefined;
      }
    },
    selection(kind: DraftKind, id: string) {
      try {
        return readRecord(kind, id)?.selection;
      } catch {
        return undefined;
      }
    },
    saveSelection(
      kind: DraftKind,
      id: string,
      selection: import("@/shared/contracts").ProjectDraftConfig,
    ) {
      const name = key(kind, id);
      let previous: StoredRecord | undefined;
      try {
        previous = readRecord(kind, id);
      } catch {
        /* preserve malformed persisted data */
      }
      if (!observed.has(name)) observed.set(name, storage.getItem(name));
      const clean = projectDraftConfigSchema.parse(selection);
      if (JSON.stringify(previous?.selection) === JSON.stringify(clean)) return;
      const record: StoredRecord = {
        formatVersion: 2,
        draftId: previous?.draftId ?? crypto.randomUUID(),
        revision: (previous?.revision ?? 0) + 1,
        content: previous?.content ?? { segments: [], attachments: [] },
        selection: clean,
        ...(previous?.legacyFingerprint ? { legacyFingerprint: previous.legacyFingerprint } : {}),
      };
      records.set(name, record);
      pending.set(name, record);
      schedule();
    },
  };
  return api;
}

let instance: ReturnType<typeof createComposerDraftStorage> | undefined;
export function composerDraftStorage() {
  if (typeof window === "undefined") return undefined;
  if (!instance) {
    instance = createComposerDraftStorage(localStorage, window);
    setClientDraftAssetReferences(() =>
      instance?.canReclaimAssets() === false ? undefined : instance?.referencedAssets(),
    );
  }
  return instance;
}
export function resetComposerDraftStorageForTest() {
  instance?.dispose();
  instance = undefined;
}
