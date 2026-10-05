import type { RemoteImageRefValue } from "@/shared/remote";
import type {
  ThreadGalleryCollection,
  ThreadGalleryImage,
} from "@/renderer/components/thread/ChatPane/parts/items/threadGalleryImages";
import type { GalleryCacheRevision } from "./threadGalleryCache";

export const GALLERY_CACHE_ENTRY_MAX_BYTES = 16 * 1024 * 1024;
export const GALLERY_CACHE_MAX_RECORDS = 2048;
export const GALLERY_CACHE_MAX_PATH_PARTS = 8192;
export const GALLERY_CACHE_MAX_REF_PATH_PARTS = 64;

const COLLECTION_FIELDS = ["images", "pendingRemoteRefs", "pendingRemotePaths"];
const IMAGE_FIELDS = ["src", "alt", "fileName", "mime"];
const REF_FIELDS = ["threadId", "itemId", "path", "mime", "bytes", "width", "height", "preview"];
const REVISION_FIELDS = ["structuralVersion", "remoteRevision", "locale", "imageAuthority"];
const MAX_FIELD_NAME_CHARS = Math.max(
  ...[...COLLECTION_FIELDS, ...IMAGE_FIELDS, ...REF_FIELDS, ...REVISION_FIELDS].map(
    (key) => key.length,
  ),
);
const REFUSED = new Error("Gallery cache admission refused");

/** Only fixed shallow producer shapes are inspected; never a runtime payload graph.
 * Reflection can enumerate a wide object or run proxy traps before these checks.
 * Work quotas bound our copies/field visits, not that engine-owned work. */
function readRecord(value: unknown, allowedFields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw REFUSED;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw REFUSED;
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowedFields.length) throw REFUSED;
  const fields: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (
      typeof key !== "string" ||
      key.length > MAX_FIELD_NAME_CHARS ||
      !allowedFields.includes(key)
    )
      throw REFUSED;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw REFUSED;
    fields[key] = descriptor.value;
  }
  return fields;
}

/** Fixed descriptor reads keep the hit path free of getters, charging and key walks. */
export function readGalleryCacheRevision(value: unknown): GalleryCacheRevision | null {
  try {
    if (value === null || typeof value !== "object") return null;
    const descriptors = REVISION_FIELDS.map((key) => Object.getOwnPropertyDescriptor(value, key));
    if (descriptors.some((descriptor) => !descriptor || !("value" in descriptor))) return null;
    const structuralVersion: unknown = descriptors[0]!.value;
    const remoteRevision: unknown = descriptors[1]!.value;
    const locale: unknown = descriptors[2]!.value;
    const imageAuthority: unknown = descriptors[3]!.value;
    if (
      typeof structuralVersion !== "number" ||
      typeof remoteRevision !== "string" ||
      typeof locale !== "string" ||
      (imageAuthority !== undefined &&
        imageAuthority !== null &&
        typeof imageAuthority !== "object" &&
        typeof imageAuthority !== "function")
    )
      return null;
    return { structuralVersion, remoteRevision, locale, imageAuthority };
  } catch {
    return null;
  }
}

class GalleryBudget {
  records = 0;
  pathParts = 0;

  constructor(
    public bytes = 256, // Entry, weak identity handles and fixed metadata allowance.
    private readonly allowByteOverflow = false,
  ) {}

  charge(bytes: number): void {
    if (bytes > GALLERY_CACHE_ENTRY_MAX_BYTES - this.bytes) {
      if (!this.allowByteOverflow) throw REFUSED;
      // Continue validating every remaining field/work quota. The result may
      // only be borrowed weakly; its exact projected size is no longer needed.
      this.bytes = GALLERY_CACHE_ENTRY_MAX_BYTES + 1;
      return;
    }
    this.bytes += bytes;
  }

  primitive(value: unknown): void {
    if (typeof value === "string") this.charge(16 + value.length * 2);
    else if (typeof value === "number") this.charge(8);
    else if (value === undefined) this.charge(4);
    else throw REFUSED;
  }

  record(fields: Record<string, unknown>): void {
    this.charge(64);
    // `fields` is our own tiny fixed-schema record, never the caller's object.
    for (const key of Object.keys(fields)) {
      this.charge(8);
      this.primitive(key);
      if (key !== "path") this.primitive(fields[key]);
    }
  }
}

function readArray(value: unknown, budget: GalleryBudget, path = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw REFUSED;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length: unknown = lengthDescriptor?.value;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) throw REFUSED;
  if (path) {
    if (
      length > GALLERY_CACHE_MAX_REF_PATH_PARTS ||
      length > GALLERY_CACHE_MAX_PATH_PARTS - budget.pathParts
    )
      throw REFUSED;
    budget.pathParts += length;
  } else {
    if (length > GALLERY_CACHE_MAX_RECORDS - budget.records) throw REFUSED;
    budget.records += length;
  }
  budget.charge(64 + length * 8);
  // Cardinality plus every required own index and length proves there are no
  // extra own fields, symbols, nonenumerable metadata or holes on an ordinary array.
  if (Reflect.ownKeys(value).length !== length + 1) throw REFUSED;
  const values: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw REFUSED;
    values.push(descriptor.value);
  }
  return values;
}

function checkOptional(
  fields: Record<string, unknown>,
  key: string,
  kind: "string" | "number",
): void {
  if (!Object.hasOwn(fields, key)) return;
  if (fields[key] !== undefined && typeof fields[key] !== kind) throw REFUSED;
}

function copyImage(value: unknown, budget: GalleryBudget): ThreadGalleryImage {
  const fields = readRecord(value, IMAGE_FIELDS);
  if (typeof fields.src !== "string") throw REFUSED;
  for (const key of ["alt", "fileName", "mime"]) checkOptional(fields, key, "string");
  budget.record(fields);
  // Spreading the checked fields preserves key order and optional presence,
  // including explicitly present undefined; every field was validated above.
  return Object.freeze({ ...fields, src: fields.src });
}

function copyRef(value: unknown, budget: GalleryBudget): RemoteImageRefValue {
  const fields = readRecord(value, REF_FIELDS);
  const { threadId, itemId, mime, bytes } = fields;
  if (
    typeof threadId !== "string" ||
    typeof itemId !== "string" ||
    typeof mime !== "string" ||
    typeof bytes !== "number"
  )
    throw REFUSED;
  checkOptional(fields, "width", "number");
  checkOptional(fields, "height", "number");
  checkOptional(fields, "preview", "string");
  budget.record(fields);
  const path = readArray(fields.path, budget, true).map((part) => {
    if (typeof part !== "string" && typeof part !== "number") throw REFUSED;
    budget.primitive(part);
    return part;
  });
  return Object.freeze({ ...fields, threadId, itemId, mime, bytes, path: Object.freeze(path) });
}

interface GalleryCacheMetadata {
  readonly estimatedBytes: number;
  readonly structuralVersion: number;
  readonly remoteRevision: string;
  readonly locale: string;
  readonly imageAuthority: WeakRef<object> | null | undefined;
}

export type GalleryCacheAdmission = GalleryCacheMetadata &
  (
    | { readonly kind: "owned"; readonly result: ThreadGalleryCollection }
    | { readonly kind: "borrowed"; readonly result: WeakRef<ThreadGalleryCollection> }
  );

/** Refusal never mutates or truncates the caller's result. All strings remain
 * byte-for-byte UTF-16 values; the charge is a logical estimate, not a RAM bound.
 * A fully valid byte-overflow result is borrowed weakly with bounded metadata;
 * malformed shapes and work overflows remain uncached. */
export function admitGalleryCacheSnapshot(
  threadId: string,
  resolverKey: string,
  revision: GalleryCacheRevision,
  result: ThreadGalleryCollection,
): GalleryCacheAdmission | null {
  try {
    if (typeof WeakRef !== "function") return null;
    const revisionFields = readRecord(revision, REVISION_FIELDS);
    const metadata = readGalleryCacheRevision(revisionFields);
    if (!metadata || typeof threadId !== "string" || typeof resolverKey !== "string") return null;
    const metadataBudget = new GalleryBudget();
    for (const value of [threadId, resolverKey, metadata.remoteRevision, metadata.locale])
      metadataBudget.primitive(value);
    metadataBudget.primitive(metadata.structuralVersion);
    const fields = readRecord(result, COLLECTION_FIELDS);
    const budget = new GalleryBudget(metadataBudget.bytes, true);
    budget.charge(64 + COLLECTION_FIELDS.length * 8);
    for (const key of COLLECTION_FIELDS) budget.primitive(key);
    const images = readArray(fields.images, budget).map((image) => copyImage(image, budget));
    const refs = readArray(fields.pendingRemoteRefs, budget).map((ref) => copyRef(ref, budget));
    const paths = readArray(fields.pendingRemotePaths, budget).map((value) => {
      if (typeof value !== "string") throw REFUSED;
      budget.primitive(value);
      return value;
    });
    const imageAuthority =
      metadata.imageAuthority === null || metadata.imageAuthority === undefined
        ? metadata.imageAuthority
        : new WeakRef(metadata.imageAuthority);
    const common = {
      structuralVersion: metadata.structuralVersion,
      remoteRevision: metadata.remoteRevision,
      locale: metadata.locale,
      imageAuthority,
    };
    if (budget.bytes > GALLERY_CACHE_ENTRY_MAX_BYTES) {
      metadataBudget.charge(16); // Additional weak result handle.
      return {
        ...common,
        kind: "borrowed",
        result: new WeakRef(result),
        estimatedBytes: metadataBudget.bytes,
      };
    }
    return {
      ...common,
      kind: "owned",
      result: Object.freeze({
        ...fields,
        images: Object.freeze(images),
        pendingRemoteRefs: Object.freeze(refs),
        pendingRemotePaths: Object.freeze(paths),
      }),
      estimatedBytes: budget.bytes,
    };
  } catch {
    return null;
  }
}
