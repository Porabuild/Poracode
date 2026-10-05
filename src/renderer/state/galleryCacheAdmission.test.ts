import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteImageRefValue } from "@/shared/remote";
import { environmentImageRefKey } from "@/shared/remote/clientEnvironmentImages";
import type { ThreadGalleryCollection } from "@/renderer/components/thread/ChatPane/parts/items/threadGalleryImages";
import type { GalleryCacheRevision } from "./threadGalleryCache";
import { admitGalleryCacheSnapshot, GALLERY_CACHE_ENTRY_MAX_BYTES } from "./galleryCacheAdmission";

function fixture() {
  const ref: RemoteImageRefValue = {
    threadId: "thread",
    itemId: "item",
    path: ["images", 0, "\uD800"],
    mime: "image/png",
    bytes: 12,
    width: 1,
    height: 2,
    preview: "data:image/png;base64,eA==",
  };
  const result: ThreadGalleryCollection = {
    images: [
      {
        src: "data:image/png;base64,eA==",
        mime: "image/png",
        alt: "Label\uD800",
        fileName: "image.png",
      },
    ],
    pendingRemoteRefs: [ref],
    pendingRemotePaths: ["/project/image.png"],
  };
  const revision: GalleryCacheRevision = {
    structuralVersion: 1,
    remoteRevision: "connection",
    locale: "en",
    imageAuthority: {},
  };
  const admit = () => admitGalleryCacheSnapshot("thread", "roots", revision, result);
  return { ref, result, revision, admit };
}

afterEach(() => vi.restoreAllMocks());

describe("owned gallery snapshot admission", () => {
  it("owns immutable nested records while preserving fields, ordering, UTF16 and readiness keys", () => {
    const value = fixture();
    Object.defineProperty(value.result.images[0], "alt", { value: undefined, enumerable: true });
    const admitted = value.admit();
    expect(admitted?.kind).toBe("owned");
    if (admitted?.kind !== "owned") throw new Error("Expected owned gallery");
    const owned = admitted.result;
    expect(owned).toEqual(value.result);
    expect(Object.keys(owned)).toEqual(Object.keys(value.result));
    expect(Object.keys(owned.images[0]!)).toEqual(Object.keys(value.result.images[0]!));
    expect(Object.keys(owned.pendingRemoteRefs[0]!)).toEqual(Object.keys(value.ref));
    expect(Object.hasOwn(owned.images[0]!, "alt")).toBe(true);
    expect(environmentImageRefKey(owned.pendingRemoteRefs[0]!)).toBe(
      environmentImageRefKey(value.ref),
    );
    for (const object of [
      owned,
      owned.images,
      owned.images[0],
      owned.pendingRemoteRefs,
      owned.pendingRemoteRefs[0],
      owned.pendingRemoteRefs[0]!.path,
      owned.pendingRemotePaths,
    ])
      expect(Object.isFrozen(object)).toBe(true);
    expect(owned.images).not.toBe(value.result.images);
    expect(owned.images[0]).not.toBe(value.result.images[0]);
    expect(owned.pendingRemoteRefs[0]).not.toBe(value.ref);
    value.result.images[0]!.src = "Changed";
    (value.ref.path as Array<string | number>)[0] = "Changed";
    expect(owned.images[0]!.src).toBe("data:image/png;base64,eA==");
    expect(owned.pendingRemoteRefs[0]!.path[0]).toBe("images");
    expect(() => {
      owned.images[0]!.src = "Changed";
    }).toThrow(/read only/);
  });

  it("charges logical UTF16 occurrences without serialization or encoding", () => {
    const value = fixture();
    const before = value.admit()!.estimatedBytes;
    value.result.images[0]!.src += "\uD800😀";
    const stringify = vi.spyOn(JSON, "stringify").mockImplementation(() => {
      throw new Error("No serialization");
    });
    const encoder = vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(() => {
      throw new Error("No encoding");
    });
    const admitted = value.admit();
    expect(stringify).not.toHaveBeenCalled();
    expect(encoder).not.toHaveBeenCalled();
    stringify.mockRestore();
    encoder.mockRestore();
    expect(admitted!.estimatedBytes - before).toBe(6);
  });

  it("owns the exact byte boundary and borrows one extra UTF16 unit", () => {
    const revision = fixture().revision;
    const result: ThreadGalleryCollection = {
      images: [{ src: "" }],
      pendingRemoteRefs: [],
      pendingRemotePaths: [],
    };
    const base = admitGalleryCacheSnapshot("thread", "roots", revision, result)!.estimatedBytes;
    result.images[0]!.src = "x".repeat((GALLERY_CACHE_ENTRY_MAX_BYTES - base) / 2);
    expect(admitGalleryCacheSnapshot("thread", "roots", revision, result)!.estimatedBytes).toBe(
      16 * 1024 * 1024,
    );
    result.images[0]!.src += "x";
    const overflow = admitGalleryCacheSnapshot("thread", "roots", revision, result);
    expect(overflow?.kind).toBe("borrowed");
    if (overflow?.kind !== "borrowed") throw new Error("Expected weak overflow gallery");
    expect(overflow.result.deref()).toBe(result);
    expect(overflow.estimatedBytes).toBeLessThan(1024);
    expect(Object.isFrozen(result)).toBe(false);
  });

  it("hard-bounds owned key/revision metadata even for an otherwise valid overflow", () => {
    const value = fixture();
    value.result.images[0]!.src = "x".repeat(GALLERY_CACHE_ENTRY_MAX_BYTES);
    const huge = "k".repeat(GALLERY_CACHE_ENTRY_MAX_BYTES / 2);
    for (const [threadId, resolverKey, revision] of [
      [huge, "roots", value.revision],
      ["thread", huge, value.revision],
      ["thread", "roots", { ...value.revision, remoteRevision: huge }],
      ["thread", "roots", { ...value.revision, locale: huge }],
    ] as const)
      expect(admitGalleryCacheSnapshot(threadId, resolverKey, revision, value.result)).toBeNull();
  });

  it("finishes shape validation after byte overflow without invoking later accessors", () => {
    for (const invalid of ["accessor", "unknown", "cycle"] as const) {
      const value = fixture();
      value.result.images[0]!.src = "x".repeat(GALLERY_CACHE_ENTRY_MAX_BYTES);
      const getter = vi.fn<() => Array<string | number>>(() => ["images", 0]);
      if (invalid === "accessor") Object.defineProperty(value.ref, "path", { get: getter });
      else if (invalid === "unknown") Object.defineProperty(value.ref, "extra", { value: true });
      else Object.defineProperty(value.ref, "path", { value: [value.ref] });
      expect(value.admit()).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it.each([
    "collection",
    "image",
    "reference",
    "images",
    "references",
    "paths",
    "refPath",
    "revision",
  ] as const)("refuses unknown own metadata on %s without stripping the original", (level) => {
    for (const kind of ["enumerable", "nonenumerable", "symbol"] as const)
      for (const overflow of [false, true]) {
        const value = fixture();
        if (overflow) value.result.images[0]!.src = "x".repeat(GALLERY_CACHE_ENTRY_MAX_BYTES);
        const targets = {
          collection: value.result,
          image: value.result.images[0]!,
          reference: value.ref,
          images: value.result.images,
          references: value.result.pendingRemoteRefs,
          paths: value.result.pendingRemotePaths,
          refPath: value.ref.path,
          revision: value.revision,
        };
        const target = targets[level];
        const key = kind === "symbol" ? Symbol("unknown") : "unknown";
        const extra = { opaque: true };
        Object.defineProperty(target, key, { value: extra, enumerable: kind === "enumerable" });
        expect(value.admit()).toBeNull();
        expect(Object.getOwnPropertyDescriptor(target, key)?.value).toBe(extra);
      }
  });

  it("refuses unknown accessors before invoking them, and known accessors without reading them", () => {
    for (const key of ["src", "unknown"]) {
      const value = fixture();
      const getter = vi.fn<() => string>(() => "Changed");
      Object.defineProperty(value.result.images[0], key, { get: getter, enumerable: true });
      expect(value.admit()).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it("refuses malformed/cyclic known slots, sparse arrays and throwing reflection", () => {
    const value = fixture();
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    Object.defineProperty(value.ref, "path", { value: cyclic });
    expect(value.admit()).toBeNull();
    const sparse = fixture();
    const hole = Array<string | number>(1);
    // A hole plus extra metadata has the expected own-key count but still
    // must not pass the required-index descriptor checks.
    Object.defineProperty(hole, "extra", { value: "opaque" });
    Object.defineProperty(sparse.ref, "path", { value: hole });
    expect(sparse.admit()).toBeNull();
    const trapped = fixture();
    const proxy = new Proxy(trapped.result.images[0]!, {
      ownKeys: () => {
        throw new Error("Trap");
      },
    });
    (trapped.result.images as Array<ThreadGalleryCollection["images"][number]>)[0] = proxy;
    expect(trapped.admit()).toBeNull();
  });

  it.each([false, true])(
    "bounds combined records before entry reads (byte overflow: %s)",
    (overflow) => {
      const value = fixture();
      const result: ThreadGalleryCollection = {
        images: Array.from({ length: 2048 }, (_, index) => ({
          src: overflow && index === 0 ? "x".repeat(GALLERY_CACHE_ENTRY_MAX_BYTES) : "x",
        })),
        pendingRemoteRefs: [],
        pendingRemotePaths: [],
      };
      expect(admitGalleryCacheSnapshot("thread", "roots", value.revision, result)).not.toBeNull();
      const getter = vi.fn<() => string>(() => "x");
      const extra = ["x"];
      Object.defineProperty(extra, "0", { get: getter });
      expect(
        admitGalleryCacheSnapshot("thread", "roots", value.revision, {
          ...result,
          pendingRemotePaths: extra,
        }),
      ).toBeNull();
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])("bounds each/aggregate ref path (byte overflow: %s)", (overflow) => {
    const value = fixture();
    const path = Array.from({ length: 64 }, (_, index) => index);
    const refs = Array.from({ length: 128 }, () => ({ ...value.ref, path }));
    const result: ThreadGalleryCollection = {
      images: overflow ? [{ src: "x".repeat(GALLERY_CACHE_ENTRY_MAX_BYTES) }] : [],
      pendingRemoteRefs: refs,
      pendingRemotePaths: [],
    };
    expect(admitGalleryCacheSnapshot("thread", "roots", value.revision, result)).not.toBeNull();
    const getter = vi.fn<() => string>(() => "part");
    const excessPath = ["part"];
    Object.defineProperty(excessPath, "0", { get: getter });
    expect(
      admitGalleryCacheSnapshot("thread", "roots", value.revision, {
        ...result,
        pendingRemoteRefs: [...refs, { ...value.ref, path: excessPath }],
      }),
    ).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    expect(
      admitGalleryCacheSnapshot("thread", "roots", value.revision, {
        ...result,
        pendingRemoteRefs: [{ ...value.ref, path: [...path, 64] }],
      }),
    ).toBeNull();
  });
});
