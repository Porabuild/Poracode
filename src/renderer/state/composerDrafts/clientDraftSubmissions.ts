import { transact, CLIENT_DRAFT_FORMAT_VERSION as FORMAT_VERSION } from "./clientDraftDb";
import {
  ensureClientDraftAssetsSaved,
  queueClientDraftAssetReclamation,
} from "./clientDraftAssets";

export interface ClientDraftSubmission {
  formatVersion: 1;
  id: string;
  draftId: string;
  scope: string;
  revision: number;
  target: string;
  fingerprint: string;
  state: "prepared" | "dispatching" | "uncertain" | "failed" | "staged" | "accepted";
  content: unknown;
  assets: string[];
}

/** The outbox and its byte admission commit in one IndexedDB transaction. */
export class ClientSubmissionAlreadyPendingError extends Error {
  constructor() {
    super("This draft revision already has a submission.");
  }
}

export async function preserveClientSubmission(submission: ClientDraftSubmission): Promise<void> {
  await ensureClientDraftAssetsSaved(submission.assets);
  let duplicate = false;
  await transact<void>(["assets", "submissions"], "readwrite", (tx) => {
    const store = tx.objectStore("submissions");
    const existing = store
      .index("draftRevision")
      .getAll([submission.draftId, submission.revision, submission.target]);
    existing.onsuccess = () => {
      if (
        (existing.result as ClientDraftSubmission[]).some(
          (record) => record.formatVersion !== FORMAT_VERSION || record.state !== "failed",
        )
      ) {
        duplicate = true;
        return;
      }
      for (const path of submission.assets) {
        const asset = tx.objectStore("assets").get(path);
        asset.onsuccess = () => {
          if (!asset.result || asset.result.formatVersion !== FORMAT_VERSION) tx.abort();
        };
      }
      store.add(submission);
      for (const previous of existing.result as ClientDraftSubmission[]) {
        if (
          previous.formatVersion === FORMAT_VERSION &&
          previous.state === "failed" &&
          JSON.stringify(previous.assets) === JSON.stringify(submission.assets)
        )
          store.delete(previous.id);
      }
    };
  });
  if (duplicate) throw new ClientSubmissionAlreadyPendingError();
  notifyClientDraftSubmissions();
}

export async function readClientSubmission(id: string): Promise<ClientDraftSubmission | undefined> {
  return transact<ClientDraftSubmission | undefined>(["submissions"], "readonly", (tx, done) => {
    const request = tx.objectStore("submissions").get(id);
    request.onsuccess = () =>
      done(
        request.result?.formatVersion === FORMAT_VERSION
          ? (request.result as ClientDraftSubmission)
          : undefined,
      );
  });
}

export async function claimClientSubmission(id: string): Promise<void> {
  await transact<void>(["submissions"], "readwrite", (tx) => {
    const store = tx.objectStore("submissions");
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as ClientDraftSubmission | undefined;
      if (!record || record.formatVersion !== FORMAT_VERSION || record.state !== "prepared") {
        tx.abort();
        return;
      }
      store.put({ ...record, state: "dispatching" });
    };
  });
}

export async function listClientSubmissions(): Promise<ClientDraftSubmission[]> {
  return transact<ClientDraftSubmission[]>(["submissions"], "readonly", (tx, done) => {
    const request = tx.objectStore("submissions").getAll();
    request.onsuccess = () =>
      done(
        (request.result as ClientDraftSubmission[]).filter(
          (record) => record.formatVersion === FORMAT_VERSION,
        ),
      );
  });
}

export async function listClientSubmissionsForDraft(
  scope: string,
  draftId?: string,
): Promise<ClientDraftSubmission[]> {
  return transact<ClientDraftSubmission[]>(["submissions"], "readonly", (tx, done) => {
    const store = tx.objectStore("submissions");
    const requests = [
      store.index("scope").openCursor(scope, "prev"),
      ...(draftId ? [store.index("draftId").openCursor(draftId, "prev")] : []),
    ];
    const results = new Map<string, ClientDraftSubmission>();
    let remaining = requests.length;
    for (const request of requests)
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value as ClientDraftSubmission;
          if (record.formatVersion !== FORMAT_VERSION || record.state === "accepted") {
            cursor.continue();
            return;
          }
          results.set(record.id, record);
        }
        if (--remaining === 0) done([...results.values()]);
      };
  });
}

export async function listAcceptedClientSubmissions(): Promise<ClientDraftSubmission[]> {
  return transact<ClientDraftSubmission[]>(["submissions"], "readonly", (tx, done) => {
    const request = tx.objectStore("submissions").index("state").getAll("accepted");
    request.onsuccess = () =>
      done(
        (request.result as ClientDraftSubmission[]).filter(
          (record) => record.formatVersion === FORMAT_VERSION,
        ),
      );
  });
}

export async function updateClientSubmission(
  id: string,
  state: ClientDraftSubmission["state"],
): Promise<void> {
  await transact<void>(["submissions"], "readwrite", (tx) => {
    const store = tx.objectStore("submissions");
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as ClientDraftSubmission | undefined;
      if (!record || record.formatVersion !== FORMAT_VERSION || record.state === "accepted") return;
      if (record.state === "uncertain" && state === "failed") return;
      store.put({ ...record, state });
    };
  });
  notifyClientDraftSubmissions();
}

const changeListeners = new Set<() => void>();
let changes: BroadcastChannel | undefined;
function emitChange() {
  for (const listener of changeListeners) listener();
}
function channel() {
  if (!changes && typeof BroadcastChannel !== "undefined" && typeof window !== "undefined") {
    changes = new BroadcastChannel("poracode-client-draft-submissions-v1");
    changes.onmessage = emitChange;
  }
  return changes;
}
export function notifyClientDraftSubmissions() {
  emitChange();
  channel()?.postMessage("changed");
}
export function subscribeClientDraftSubmissions(listener: () => void) {
  changeListeners.add(listener);
  channel();
  return () => {
    changeListeners.delete(listener);
  };
}

/** Automatic cleanup needs a receipt; the user may explicitly discard a recovery copy. */
export async function discardClientSubmission(
  id: string,
  explicitDiscard = false,
  expected?: Pick<ClientDraftSubmission, "revision" | "fingerprint">,
): Promise<boolean> {
  const discarded = await transact<boolean>(["submissions"], "readwrite", (tx, done) => {
    const store = tx.objectStore("submissions");
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as ClientDraftSubmission | undefined;
      if (
        record &&
        expected &&
        (record.revision !== expected.revision || record.fingerprint !== expected.fingerprint)
      ) {
        done(false);
        return;
      }
      if (!record || record.formatVersion !== FORMAT_VERSION) {
        tx.abort();
        return;
      }
      if (
        !explicitDiscard &&
        record.state !== "prepared" &&
        record.state !== "failed" &&
        record.state !== "accepted"
      ) {
        tx.abort();
        return;
      }
      store.delete(id);
      done(true);
    };
  });
  notifyClientDraftSubmissions();
  return discarded;
}

/** Serialize metadata CAS with outbox/GC across windows, not merely one JS realm. */
export async function serializeClientDraftMetadataWrite(
  run: (backup: (record: ClientDraftSubmission) => void) => void,
): Promise<void> {
  let failure: unknown;
  await transact<void>(["submissions"], "readwrite", (tx) => {
    const store = tx.objectStore("submissions");
    const lock = store.get("metadata-write-lock");
    lock.onsuccess = () => {
      try {
        run((record) => store.put(record));
      } catch (error) {
        failure = error;
      }
    };
  });
  queueClientDraftAssetReclamation([]);
  if (failure) {
    notifyClientDraftSubmissions();
    throw failure instanceof Error
      ? failure
      : new Error("Client draft write failed.", { cause: failure });
  }
}

export function resetClientDraftSubmissionSignalsForTest() {
  changes?.close();
  changes = undefined;
  changeListeners.clear();
}
