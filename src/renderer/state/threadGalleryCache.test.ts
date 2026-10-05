import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadGalleryCollection } from "@/renderer/components/thread/ChatPane/parts/items/threadGalleryImages";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import { admitGalleryCacheSnapshot, GALLERY_CACHE_ENTRY_MAX_BYTES } from "./galleryCacheAdmission";
import {
  clearThreadGalleryCache,
  forgetThreadGalleryCache,
  readThreadGalleryCache,
  writeThreadGalleryCache,
  type GalleryCacheRevision,
} from "./threadGalleryCache";

function input() {
  const ids = ["item"];
  const items: Record<string, RuntimeChatItem> = {
    item: { id: "item", type: "assistant_message", state: "completed", streams: {} },
  };
  const revision: GalleryCacheRevision = {
    structuralVersion: 1,
    remoteRevision: "connection-1",
    locale: "en",
    imageAuthority: {},
  };
  const result: ThreadGalleryCollection = {
    images: [{ src: "data:image/png;base64,eA==" }],
    pendingRemoteRefs: [],
    pendingRemotePaths: [],
  };
  return { ids, items, revision, result };
}

function write(id: string, value: ReturnType<typeof input>) {
  return writeThreadGalleryCache(id, value.ids, value.items, "roots", value.revision, value.result);
}

function read(id: string, value: ReturnType<typeof input>) {
  return readThreadGalleryCache(id, value.ids, value.items, "roots", value.revision);
}

beforeEach(() => clearThreadGalleryCache());
afterEach(() => {
  clearThreadGalleryCache();
  vi.unstubAllGlobals();
  ControlledWeakRef.references.length = 0;
});

class ControlledWeakRef<T extends object> {
  static references: ControlledWeakRef<object>[] = [];
  private target: T | undefined;
  constructor(target: T) {
    this.target = target;
    ControlledWeakRef.references.push(this);
  }
  deref(): T | undefined {
    return this.target;
  }
  clear(): void {
    this.target = undefined;
  }
}

describe("document-local thread gallery cache", () => {
  it("does not inspect or strongly snapshot mutable history inputs", () => {
    const value = input();
    const index = value.items;
    value.items = new Proxy(index, {
      get: () => {
        throw new Error("History must not be read");
      },
      ownKeys: () => {
        throw new Error("History must not be enumerated");
      },
    });
    const admitted = write("thread", value);
    index.item = { ...index.item!, streams: { assistant_text: "x".repeat(1_000_000) } };
    expect(read("thread", value)).toBe(admitted);
  });

  it.each([false, true])("copies revision scalars (borrowed: %s)", (overflow) => {
    const value = input();
    if (overflow) value.result.images[0]!.src = "x".repeat(8 * 1024 * 1024);
    write("thread", value);
    value.revision.locale = "fr";
    expect(read("thread", value)).toBeNull();
  });

  it.each(
    (["ids", "items", "authority"] as const).flatMap((kind) =>
      [false, true].map((overflow) => ({ kind, overflow })),
    ),
  )("misses a cleared weak $kind without forced GC (borrowed: $overflow)", ({ kind, overflow }) => {
    vi.stubGlobal("WeakRef", ControlledWeakRef);
    const value = input();
    if (overflow) value.result.images[0]!.src = "x".repeat(8 * 1024 * 1024);
    write("thread", value);
    const target =
      kind === "ids" ? value.ids : kind === "items" ? value.items : value.revision.imageAuthority;
    const reference = ControlledWeakRef.references.find((entry) => entry.deref() === target);
    expect(reference).toBeDefined();
    reference!.clear();
    expect(read("thread", value)).toBeNull();
  });

  it.each([false, true])("never matches lost authority to absent (borrowed: %s)", (overflow) => {
    vi.stubGlobal("WeakRef", ControlledWeakRef);
    const value = input();
    if (overflow) value.result.images[0]!.src = "x".repeat(8 * 1024 * 1024);
    write("thread", value);
    const reference = ControlledWeakRef.references.find(
      (entry) => entry.deref() === value.revision.imageAuthority,
    );
    expect(reference).toBeDefined();
    reference!.clear();
    expect(
      read("thread", { ...value, revision: { ...value.revision, imageAuthority: undefined } }),
    ).toBeNull();
    expect(
      read("thread", { ...value, revision: { ...value.revision, imageAuthority: null } }),
    ).toBeNull();
  });

  it("returns original uncached output and retires the predecessor when WeakRef is absent", () => {
    const value = input();
    write("thread", value);
    vi.stubGlobal("WeakRef", undefined);
    expect(write("thread", value)).toBe(value.result);
    expect(read("thread", value)).toBeNull();
  });

  it("retires invalid predecessors and weakly shares validated overflow unchanged", () => {
    const value = input();
    write("thread", value);
    const unchargeable = input();
    Object.defineProperty(unchargeable.result, "history", { value: { opaque: true } });
    expect(write("thread", unchargeable)).toBe(unchargeable.result);
    expect(read("thread", value)).toBeNull();
    write("thread", value);
    const oversized = input();
    oversized.result = { ...oversized.result, images: [{ src: "x".repeat(8 * 1024 * 1024) }] };
    expect(write("thread", oversized)).toBe(oversized.result);
    expect(read("thread", value)).toBeNull();
    expect(read("thread", oversized)).toBe(oversized.result);
    expect(Object.isFrozen(oversized.result)).toBe(false);
  });

  it("misses a lost borrowed result without refreshing its LRU, then rebuilds", () => {
    vi.stubGlobal("WeakRef", ControlledWeakRef);
    const value = input();
    value.result.images[0]!.src = "x".repeat(8 * 1024 * 1024);
    for (let index = 0; index < 200; index++) write(`weak-${index}`, value);
    const references = ControlledWeakRef.references.filter(
      (entry) => entry.deref() === value.result,
    );
    expect(references).toHaveLength(200);
    references[0]!.clear();
    expect(read("weak-0", value)).toBeNull();
    expect(read("weak-1", value)).toBe(value.result);
    write("weak-200", value);
    expect(read("weak-0", value)).toBeNull();
    expect(read("weak-2", value)).toBe(value.result);
    expect(write("weak-0", value)).toBe(value.result);
    expect(read("weak-0", value)).toBe(value.result);
  });

  it("charges borrowed metadata to aggregate eviction and releases replacement/forget/reset", () => {
    const value = input();
    value.result.images[0]!.src = "x".repeat(8 * 1024 * 1024);
    const roots = "r".repeat(5 * 1024 * 1024);
    const put = (id: string) =>
      writeThreadGalleryCache(id, value.ids, value.items, roots, value.revision, value.result);
    const get = (id: string) =>
      readThreadGalleryCache(id, value.ids, value.items, roots, value.revision);
    for (let index = 0; index < 3; index++) put(`metadata-${index}`);
    expect(get("metadata-0")).toBe(value.result);
    put("metadata-3");
    expect(get("metadata-1")).toBeNull();
    expect(get("metadata-0")).toBe(value.result);
    write("metadata-0", input());
    put("metadata-4");
    expect(get("metadata-2")).toBe(value.result);
    expect(get("metadata-3")).toBe(value.result);
    forgetThreadGalleryCache("metadata-3");
    put("metadata-5");
    expect(get("metadata-2")).toBe(value.result);
    expect(get("metadata-4")).toBe(value.result);
    expect(get("metadata-5")).toBe(value.result);
    clearThreadGalleryCache();
    for (let index = 0; index < 3; index++) put(`fresh-${index}`);
    for (let index = 0; index < 3; index++) expect(get(`fresh-${index}`)).toBe(value.result);
  });

  it.each([false, true])(
    "retains the exact aggregate byte boundary then evicts the oldest (borrowed: %s)",
    (overflow) => {
      const value = input();
      let resolverKey = "roots";
      value.result.images[0]!.src = overflow ? "x".repeat(8 * 1024 * 1024) : "";
      const base = admitGalleryCacheSnapshot("bound-0", resolverKey, value.revision, value.result);
      expect(base).not.toBeNull();
      const units = (GALLERY_CACHE_ENTRY_MAX_BYTES - base!.estimatedBytes) / 2;
      expect(Number.isInteger(units)).toBe(true);
      if (overflow) resolverKey += "r".repeat(units);
      else value.result.images[0]!.src = "x".repeat(units);
      const full = admitGalleryCacheSnapshot("bound-0", resolverKey, value.revision, value.result);
      expect(full?.kind).toBe(overflow ? "borrowed" : "owned");
      expect(full?.estimatedBytes).toBe(GALLERY_CACHE_ENTRY_MAX_BYTES);
      const put = (id: string) =>
        writeThreadGalleryCache(
          id,
          value.ids,
          value.items,
          resolverKey,
          value.revision,
          value.result,
        );
      const get = (id: string) =>
        readThreadGalleryCache(id, value.ids, value.items, resolverKey, value.revision);
      const first = put("bound-0");
      const second = put("bound-1");
      expect(get("bound-0")).toBe(first);
      expect(get("bound-1")).toBe(second);
      const tiny = input();
      const latest = write("tiny", tiny);
      expect(get("bound-0")).toBeNull();
      expect(get("bound-1")).toBe(second);
      expect(read("tiny", tiny)).toBe(latest);
    },
  );

  it("enforces aggregate logical bytes and refreshes only hits", () => {
    const value = input();
    value.result = { ...value.result, images: [{ src: "x".repeat(5 * 1024 * 1024) }] };
    for (let index = 0; index < 3; index++) write(`large-${index}`, value);
    const recent = read("large-0", value);
    expect(recent).not.toBeNull();
    write("large-3", value);
    expect(read("large-1", value)).toBeNull();
    expect(read("large-0", value)).toBe(recent);
    expect(read("large-2", value)).not.toBeNull();
    expect(read("large-3", value)).not.toBeNull();
  });

  it("releases aggregate charge on replacement, forget and reset", () => {
    const value = input();
    value.result = { ...value.result, images: [{ src: "x".repeat(5 * 1024 * 1024) }] };
    for (let index = 0; index < 3; index++) write(`large-${index}`, value);
    write("large-0", input());
    write("large-3", value);
    expect(read("large-1", value)).not.toBeNull();
    expect(read("large-2", value)).not.toBeNull();
    forgetThreadGalleryCache("large-1");
    write("large-4", value);
    expect(read("large-2", value)).not.toBeNull();
    expect(read("large-3", value)).not.toBeNull();
    expect(read("large-4", value)).not.toBeNull();
    clearThreadGalleryCache();
    for (let index = 0; index < 3; index++) write(`fresh-${index}`, value);
    for (let index = 0; index < 3; index++) expect(read(`fresh-${index}`, value)).not.toBeNull();
  });

  it("shares the exact collection only for matching input identities and resolver roots", () => {
    const value = input();
    const admitted = write("thread", value);
    expect(admitted).not.toBe(value.result);
    expect(admitted).toEqual(value.result);
    expect(read("thread", value)).toBe(admitted);
    expect(
      readThreadGalleryCache("thread", [...value.ids], value.items, "roots", value.revision),
    ).toBeNull();
    expect(
      readThreadGalleryCache("thread", value.ids, { ...value.items }, "roots", value.revision),
    ).toBeNull();
    expect(
      readThreadGalleryCache("thread", value.ids, value.items, "new-roots", value.revision),
    ).toBeNull();
    expect(read("thread", value)).toEqual(value.result);
  });

  it.each([
    { structuralVersion: 2 },
    { remoteRevision: "connection-2" },
    { locale: "fr" },
    { imageAuthority: {} },
    { imageAuthority: null },
    { imageAuthority: undefined },
  ])("refuses a collection with changed freshness %j", (change) => {
    for (const overflow of [false, true]) {
      const value = input();
      if (overflow) value.result.images[0]!.src = "x".repeat(8 * 1024 * 1024);
      write("thread", value);
      expect(read("thread", { ...value, revision: { ...value.revision, ...change } })).toBeNull();
      expect(read("thread", value)).toEqual(value.result);
    }
  });

  it("holds exactly 200 owners and refreshes successful hits without clearing survivors", () => {
    const value = input();
    for (let index = 0; index < 200; index++) write(`thread-${index}`, value);
    expect(read("thread-0", value)).toEqual(value.result);
    write("thread-200", value);

    expect(read("thread-1", value)).toBeNull();
    expect(read("thread-0", value)).toEqual(value.result);
    expect(read("thread-199", value)).toEqual(value.result);
    expect(read("thread-200", value)).toEqual(value.result);
    let owners = 0;
    for (let index = 0; index <= 200; index++) if (read(`thread-${index}`, value)) owners++;
    expect(owners).toBe(200);
  });

  it("does not refresh a stale miss", () => {
    const value = input();
    for (let index = 0; index < 200; index++) write(`thread-${index}`, value);
    expect(read("thread-0", { ...value, ids: [...value.ids] })).toBeNull();
    write("thread-200", value);
    expect(read("thread-0", value)).toBeNull();
    expect(read("thread-1", value)).toEqual(value.result);
  });

  it("retires the predecessor before replacement and counts the owner once", () => {
    const before = input();
    for (let index = 0; index < 200; index++) write(`thread-${index}`, before);
    const replacement = input();
    replacement.result = { images: [], pendingRemoteRefs: [], pendingRemotePaths: [] };
    write("thread-0", replacement);

    expect(read("thread-0", before)).toBeNull();
    expect(read("thread-1", before)).toEqual(before.result);
    write("thread-200", before);
    expect(read("thread-2", before)).toBeNull();
    expect(read("thread-0", replacement)).toEqual(replacement.result);
    expect(read("thread-1", before)).toEqual(before.result);
  });

  it("forgets exact owners, permits later recomputation and clears document-local state", () => {
    const value = input();
    write("thread", value);
    write("thread-other", value);
    forgetThreadGalleryCache("thread");
    forgetThreadGalleryCache("thread");
    expect(read("thread", value)).toBeNull();
    expect(read("thread-other", value)).toEqual(value.result);
    write("thread", value);
    expect(read("thread", value)).toEqual(value.result);
    clearThreadGalleryCache();
    expect(read("thread", value)).toBeNull();
    expect(read("thread-other", value)).toBeNull();
  });
});
