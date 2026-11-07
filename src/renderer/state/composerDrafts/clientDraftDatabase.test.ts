import "@/renderer/testUtils/clientDraftDatabase";
import { describe, expect, it, vi } from "vitest";
import { IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import { transact } from "./clientDraftDb";
import {
  CLIENT_DRAFT_DATABASE,
  stageClientDraftAsset,
  readClientDraftAsset,
  closeClientDraftDatabaseForTest,
  preserveClientSubmission,
  listClientSubmissions,
  claimClientSubmission,
  updateClientSubmission,
  reclaimClientDraftAssets,
  retainClientDraftAsset,
  discardClientSubmission,
  serializeClientDraftMetadataWrite,
  type ClientDraftSubmission,
} from "./clientDraftDatabase";

function submission(path: string, id = crypto.randomUUID()): ClientDraftSubmission {
  return {
    formatVersion: 1,
    id,
    draftId: "draft",
    scope: '["project","p"]',
    revision: 1,
    target: "host",
    fingerprint: "content",
    state: "prepared",
    content: { text: "Unsent text" },
    assets: [path],
  };
}

describe("client-owned draft bytes and submissions", () => {
  it("preserves exact bytes, extension and MIME across a client restart", async () => {
    const bytes = new Uint8Array([0, 255, 128, 3]);
    const file = stageClientDraftAsset(new Blob([bytes], { type: "image/png" }), "Image 1.png");
    await file.saved;
    await closeClientDraftDatabaseForTest();
    const restored = await readClientDraftAsset(file.path);
    expect(restored.name).toBe("Image 1.png");
    expect(restored.mimeType).toBe("image/png");
    expect(new Uint8Array(await restored.blob.arrayBuffer())).toEqual(bytes);
  });

  it("keeps an outbox snapshot durably before a composer may clear", async () => {
    const file = stageClientDraftAsset(new Blob(["image"], { type: "image/png" }), "shot.png");
    const record = submission(file.path);
    await preserveClientSubmission(record);
    await closeClientDraftDatabaseForTest();
    expect(await listClientSubmissions()).toEqual([record]);
    expect(await readClientDraftAsset(file.path)).toMatchObject({ name: "shot.png" });
  });

  it("does not commit a submission with missing attachment bytes", async () => {
    await expect(
      preserveClientSubmission(submission("poracode-draft-asset:missing/a.png")),
    ).rejects.toThrow("transaction failed");
    expect(await listClientSubmissions()).toEqual([]);
  });

  it("admits one concurrent producer and one dispatcher for the same revision", async () => {
    const asset = stageClientDraftAsset(new Blob(["asset"]), "a.bin");
    const first = submission(asset.path);
    const attempts = await Promise.allSettled([
      preserveClientSubmission(first),
      preserveClientSubmission(submission(asset.path)),
    ]);
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual(["fulfilled", "rejected"]);
    const [record] = await listClientSubmissions();
    const claims = await Promise.allSettled([
      claimClientSubmission(record!.id),
      claimClientSubmission(record!.id),
    ]);
    expect(claims.map((attempt) => attempt.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("does not turn an accepted or uncertain send into a definite failure", async () => {
    const asset = stageClientDraftAsset(new Blob(["asset"]), "a.bin");
    const record = submission(asset.path);
    await preserveClientSubmission(record);
    await claimClientSubmission(record.id);
    await updateClientSubmission(record.id, "uncertain");
    await updateClientSubmission(record.id, "failed");
    expect((await listClientSubmissions())[0]?.state).toBe("uncertain");
    await updateClientSubmission(record.id, "accepted");
    await updateClientSubmission(record.id, "uncertain");
    expect((await listClientSubmissions())[0]?.state).toBe("accepted");
  });

  it("retains bytes for editors and unsettled submissions, then reclaims unowned bytes", async () => {
    const asset = stageClientDraftAsset(new Blob(["asset"]), "a.bin");
    await asset.saved;
    const release = retainClientDraftAsset(asset.path);
    await reclaimClientDraftAssets([asset.path], new Set());
    expect(await readClientDraftAsset(asset.path)).toMatchObject({ path: asset.path });
    const record = submission(asset.path);
    await preserveClientSubmission(record);
    release();
    await reclaimClientDraftAssets([asset.path], new Set());
    expect(await readClientDraftAsset(asset.path)).toMatchObject({ path: asset.path });
    await updateClientSubmission(record.id, "accepted");
    await discardClientSubmission(record.id);
    await reclaimClientDraftAssets([asset.path], new Set());
    await expect(readClientDraftAsset(asset.path)).rejects.toThrow("transaction failed");
  });

  it("retries a failed database open and native import without poisoning later saves", async () => {
    vi.spyOn(indexedDB, "open").mockImplementationOnce(() => {
      throw new Error("temporary open refusal");
    });
    const asset = stageClientDraftAsset(new Blob(["retry bytes"]), "retry.bin");
    await expect(asset.saved).rejects.toThrow("temporary open refusal");
    await preserveClientSubmission(submission(asset.path));
    expect(await (await readClientDraftAsset(asset.path)).blob.text()).toBe("retry bytes");
    const source = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValueOnce(new Error("file busy"))
      .mockResolvedValueOnce(new Blob(["native retry"]));
    const native = stageClientDraftAsset(source, "native.bin");
    await expect(native.saved).rejects.toThrow("file busy");
    await preserveClientSubmission({ ...submission(native.path), revision: 2 });
    expect(await (await readClientDraftAsset(native.path)).blob.text()).toBe("native retry");
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("rechecks a newly acquired asset lease after asynchronous GC admission", async () => {
    const asset = stageClientDraftAsset(new Blob(["retained"]), "race.bin");
    await asset.saved;
    const reclaim = reclaimClientDraftAssets([asset.path], new Set());
    const release = retainClientDraftAsset(asset.path);
    await reclaim;
    expect(await (await readClientDraftAsset(asset.path)).blob.text()).toBe("retained");
    release();
  });

  it("does not discard a newer recovery snapshot using an older displayed revision", async () => {
    const first = { ...submission("unused"), assets: [], state: "failed" as const };
    await preserveClientSubmission(first);
    const newer = {
      ...first,
      revision: 2,
      fingerprint: "new content",
      content: { text: "newer edit" },
    };
    await serializeClientDraftMetadataWrite((backup) => backup(newer));
    expect(await discardClientSubmission(first.id, true, first)).toBe(false);
    expect(await listClientSubmissions()).toEqual([newer]);
    expect(await discardClientSubmission(newer.id, true, newer)).toBe(true);
  });

  it("preserves future-format records without changing their state", async () => {
    const asset = stageClientDraftAsset(new Blob(["asset"]), "a.bin");
    await asset.saved;
    const future = { ...submission(asset.path), formatVersion: 99 };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(CLIENT_DRAFT_DATABASE);
      request.onsuccess = () => {
        const tx = request.result.transaction("submissions", "readwrite");
        tx.objectStore("submissions").put(future);
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await updateClientSubmission(future.id, "accepted");
    await reclaimClientDraftAssets([asset.path], new Set());
    expect(await readClientDraftAsset(asset.path)).toMatchObject({ path: asset.path });
    expect(await listClientSubmissions()).toEqual([]);
  });

  it("preserves future-format assets during reclamation", async () => {
    const path = "poracode-draft-asset:future/file.bin";
    const future = { path, formatVersion: 99, payload: "future attachment bytes" };
    await transact<void>(["assets"], "readwrite", (tx) => {
      tx.objectStore("assets").put(future);
    });

    expect(await reclaimClientDraftAssets([path], new Set())).toEqual([]);
    expect(
      await transact<unknown>(["assets"], "readonly", (tx, done) => {
        const request = tx.objectStore("assets").get(path);
        request.onsuccess = () => done(request.result);
      }),
    ).toEqual(future);
  });

  it("keeps bytes when another window opens during the asset lookup", async () => {
    const asset = stageClientDraftAsset(new Blob(["retained bytes"]), "window.bin");
    await asset.saved;
    const foreignWindow = "poracode-client-draft-window-v1:opened-during-lookup";
    const originalGet = FakeIDBObjectStore.prototype.get;
    const lookup = vi.spyOn(FakeIDBObjectStore.prototype, "get").mockImplementationOnce(function (
      this: IDBObjectStore,
      key,
    ) {
      const request = originalGet.call(this, key);
      if (this.name === "assets" && key === asset.path)
        localStorage.setItem(foreignWindow, "active");
      return request;
    });
    try {
      expect(await reclaimClientDraftAssets([asset.path], new Set())).toEqual([]);
      expect(await (await readClientDraftAsset(asset.path)).blob.text()).toBe("retained bytes");
    } finally {
      lookup.mockRestore();
      localStorage.removeItem(foreignWindow);
    }
  });

  it("keeps a pending import when a late asset lease aborts reclamation", async () => {
    let finish!: (blob: Blob) => void;
    const asset = stageClientDraftAsset(
      () =>
        new Promise<Blob>((resolve) => {
          finish = resolve;
        }),
      "pending.bin",
    );
    let release: (() => void) | undefined;
    const originalDelete = FakeIDBObjectStore.prototype.delete;
    const deletion = vi.spyOn(FakeIDBObjectStore.prototype, "delete").mockImplementation(function (
      this: IDBObjectStore,
      key,
    ) {
      const request = originalDelete.call(this, key);
      if (this.name === "assets" && key === asset.path)
        request.addEventListener("success", () => {
          release = retainClientDraftAsset(asset.path);
        });
      return request;
    });
    try {
      await expect(reclaimClientDraftAssets([asset.path], new Set())).rejects.toThrow(
        "Client draft transaction failed.",
      );
      finish(new Blob(["pending bytes"]));
      await asset.saved;
      expect(await (await readClientDraftAsset(asset.path)).blob.text()).toBe("pending bytes");
    } finally {
      deletion.mockRestore();
      release?.();
    }
  });
});

it("commits receipts when the browser denies BroadcastChannel", async () => {
  const original = globalThis.BroadcastChannel;
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        throw new Error("channel denied");
      }
    },
  );
  try {
    const asset = stageClientDraftAsset(new Blob(["bytes"]), "file.txt");
    const record = submission(asset.path);
    await preserveClientSubmission(record);
    await updateClientSubmission(record.id, "accepted");
    expect(await listClientSubmissions()).toEqual([expect.objectContaining({ state: "accepted" })]);
  } finally {
    vi.stubGlobal("BroadcastChannel", original);
  }
});
