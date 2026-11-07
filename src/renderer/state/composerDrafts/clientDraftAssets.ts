import {
  registerClientDraftWindow as registerWindow,
  ownsOnlyActiveDraftWindow as ownsOnlyActiveWindow,
  reconcileClientDraftWindows,
  onClientDraftWindowReady,
  WINDOW_LEASE_PREFIX,
} from "./clientDraftWindows";
export { registerClientDraftWindow } from "./clientDraftWindows";
import { MAX_CLIENT_DRAFT_ASSET_BYTES } from "@/shared/clientDraftAssets";
import { transact, CLIENT_DRAFT_FORMAT_VERSION as FORMAT_VERSION } from "./clientDraftDb";
import type { ClientDraftSubmission } from "./clientDraftSubmissions";
export const CLIENT_ASSET_PREFIX = "poracode-draft-asset:";

export interface ClientDraftAsset {
  formatVersion: 1;
  path: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

const staged = new Map<
  string,
  {
    asset: Promise<ClientDraftAsset>;
    saved: Promise<void>;
    reload: () => Promise<ClientDraftAsset>;
    retire: () => void;
  }
>();

export function isClientDraftAsset(path: string): boolean {
  return path.startsWith(CLIENT_ASSET_PREFIX);
}

/** Reserve the stable path synchronously, before a composer can unmount. */
export function stageClientDraftAsset(
  blob: Blob | (() => Promise<Blob>),
  name: string,
  existingPath?: string,
) {
  registerWindow();
  const path =
    existingPath ?? `${CLIENT_ASSET_PREFIX}${crypto.randomUUID()}/${encodeURIComponent(name)}`;
  if (!isClientDraftAsset(path)) throw new Error("Invalid client asset path.");
  const reload = async (): Promise<ClientDraftAsset> => {
    const value = await (typeof blob === "function" ? blob() : blob);
    if (value.size > MAX_CLIENT_DRAFT_ASSET_BYTES)
      throw new Error("Client draft attachment exceeds the upload size limit.");
    return {
      formatVersion: FORMAT_VERSION,
      path,
      name,
      mimeType: value.type || "application/octet-stream",
      blob: value,
    };
  };
  let retired = false;
  const asset = reload();
  const saved = asset.then(async (value) => {
    const buffer = await value.blob.arrayBuffer();
    if (retired) return;
    await transact<void>(["assets"], "readwrite", (tx) => {
      const store = tx.objectStore("assets");
      const request = store.get(path);
      request.onsuccess = () => {
        if (retired) return;
        if (request.result) {
          if (request.result.formatVersion !== FORMAT_VERSION) tx.abort();
          return;
        }
        const { blob: _blob, ...metadata } = value;
        store.add({ ...metadata, data: new Uint8Array(buffer) });
      };
    });
  });
  const entry = {
    asset,
    saved,
    reload,
    retire: () => {
      retired = true;
    },
  };
  staged.set(path, entry);
  void saved.then(
    () => {
      if (staged.get(path) === entry) staged.delete(path);
    },
    () => undefined,
  );
  return { path, saved };
}

export async function readClientDraftAsset(path: string): Promise<ClientDraftAsset> {
  registerWindow();
  const pending = staged.get(path);
  if (pending) return pending.asset;
  return transact<ClientDraftAsset>(["assets"], "readonly", (tx, done) => {
    const request = tx.objectStore("assets").get(path);
    request.onsuccess = () => {
      const asset = request.result as
        | (Omit<ClientDraftAsset, "blob"> & { data: Uint8Array })
        | undefined;
      if (!asset || asset.formatVersion !== FORMAT_VERSION || !ArrayBuffer.isView(asset.data)) {
        tx.abort();
        return;
      }
      done({ ...asset, blob: new Blob([Uint8Array.from(asset.data)], { type: asset.mimeType }) });
    };
  });
}

export async function ensureClientDraftAssetsSaved(paths: readonly string[]) {
  await Promise.all(
    paths.map(async (path) => {
      const pending = staged.get(path);
      if (!pending) return;
      try {
        await pending.saved;
      } catch {
        const asset = await pending.asset.catch(pending.reload);
        await stageClientDraftAsset(asset.blob, asset.name, path).saved;
      }
    }),
  );
}
/** Reclaim only assets with no saved draft or unsettled submission reference. */
export async function reclaimClientDraftAssets(
  paths: readonly string[],
  draftReferences: ReadonlySet<string> | (() => ReadonlySet<string>),
): Promise<string[]> {
  const candidates = paths.filter(isClientDraftAsset);
  if (candidates.length === 0 || !ownsOnlyActiveWindow()) return [];
  const removed: string[] = [];
  await transact<void>(["assets", "submissions"], "readwrite", (tx) => {
    const operation = { transaction: tx, paths: new Set(candidates) };
    activeReclamations.add(operation);
    const release = () => activeReclamations.delete(operation);
    tx.addEventListener("complete", release, { once: true });
    tx.addEventListener("abort", release, { once: true });
    const request = tx.objectStore("submissions").getAll();
    request.onsuccess = () => {
      if (!ownsOnlyActiveWindow()) return;
      const references =
        typeof draftReferences === "function" ? draftReferences() : draftReferences;
      const retained = new Set(
        (request.result as ClientDraftSubmission[]).flatMap((record) =>
          record.formatVersion !== FORMAT_VERSION
            ? candidates
            : record.state === "accepted"
              ? []
              : record.assets,
        ),
      );
      for (const path of candidates)
        if (!retained.has(path) && !activeAssets.has(path) && !references.has(path)) {
          tx.objectStore("assets").delete(path);
          staged.get(path)?.retire();
          staged.delete(path);
          removed.push(path);
        }
    };
  });
  return removed;
}

const activeAssets = new Map<string, number>();
export function retainClientDraftAsset(path: string): () => void {
  registerWindow();
  protectClientDraftReferences([path]);
  activeAssets.set(path, (activeAssets.get(path) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (activeAssets.get(path) ?? 0) - 1;
    if (count > 0) activeAssets.set(path, count);
    else activeAssets.delete(path);
    queueClientDraftAssetReclamation([path]);
  };
}
let referenceReader: (() => ReadonlySet<string> | undefined) | undefined;
const reclamationCandidates = new Set<string>();
let reclaiming = false;
let reconcilingWindows = false;
let reclamationRequested = false;
export function setClientDraftAssetReferences(reader: () => ReadonlySet<string> | undefined) {
  referenceReader = reader;
  queueClientDraftAssetReclamation([]);
}
export function queueClientDraftAssetReclamation(paths: readonly string[]) {
  for (const path of paths) if (isClientDraftAsset(path)) reclamationCandidates.add(path);
  if (reclaiming) {
    reclamationRequested = true;
    return;
  }
  if (reclamationCandidates.size === 0) return;
  if (!ownsOnlyActiveWindow()) {
    if (!reconcilingWindows) {
      reconcilingWindows = true;
      void reconcileClientDraftWindows()
        .then((removed) => {
          if (removed) queueClientDraftAssetReclamation([]);
        })
        .catch(() => undefined)
        .finally(() => {
          reconcilingWindows = false;
        });
    }
    return;
  }
  reclaiming = true;
  queueMicrotask(() => {
    const candidates = [...reclamationCandidates];
    void (async () => {
      for (let index = 0; index < candidates.length; index += 64) {
        const batch = candidates.slice(index, index + 64);
        await reclaimClientDraftAssets(batch, () => referenceReader?.() ?? new Set(batch));
        // Owners re-queue on metadata removal, outbox retirement and lease release.
        for (const path of batch) reclamationCandidates.delete(path);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        reclaiming = false;
        if (reclamationRequested) {
          reclamationRequested = false;
          queueClientDraftAssetReclamation([]);
        }
      });
  });
}

/** Streams keys, never attachment bodies, to recover interrupted reclamation. */
export async function scanClientDraftAssetBacklog(): Promise<void> {
  await reconcileClientDraftWindows();
  const keys: string[] = [];
  await transact<void>(["assets"], "readonly", (tx) => {
    const cursor = tx.objectStore("assets").openKeyCursor();
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (!entry) return;
      if (typeof entry.key === "string") keys.push(entry.key);
      entry.continue();
    };
  });
  queueClientDraftAssetReclamation(keys);
}

const activeReclamations = new Set<{ transaction: IDBTransaction; paths: ReadonlySet<string> }>();
export function protectClientDraftReferences(paths: readonly string[]) {
  for (const operation of activeReclamations)
    if (paths.some((path) => operation.paths.has(path))) {
      try {
        operation.transaction.abort();
      } catch {
        /* already committed */
      }
    }
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(WINDOW_LEASE_PREFIX)) queueClientDraftAssetReclamation([]);
  });

export function resetClientDraftAssetsForTest() {
  staged.clear();
  activeAssets.clear();
  reclamationCandidates.clear();
  activeReclamations.clear();
  referenceReader = undefined;
  reclaiming = false;
  reclamationRequested = false;
}

onClientDraftWindowReady(() => queueClientDraftAssetReclamation([]));
