import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { HOST_CONTROL_DISCOVERY_FILE } from "@/shared/hostControlProtocol";
import { HOST_KEY_ADOPTION_OFFER_FILE } from "./nativeSecretKey";
import { HOST_OPERATION_JOURNAL_FILE } from "./hostOperationJournal";

const EXCLUDED_ROOT_ENTRIES = new Set([
  "state.sqlite",
  "state.sqlite-shm",
  "state.sqlite-wal",
  "state.sqlite-journal",
  HOST_CONTROL_DISCOVERY_FILE,
  // Private owned-root operation evidence, like the other markers below; a
  // backup inventory describes migrated data, never local mutation bookkeeping.
  HOST_OPERATION_JOURNAL_FILE,
  // Desktop owner bookkeeping: an offer published while an explicit
  // activation cooperates with a live desktop must never mutate the staged
  // root's verified inventory (the desktop owns this same root since the
  // V5 data-root unification).
  HOST_KEY_ADOPTION_OFFER_FILE,
]);

interface ImportEntry {
  readonly path: string;
  readonly kind: "file" | "directory";
  readonly bytes: number;
  readonly mode: number;
  readonly sha256: string | null;
}

export interface ImportFileInventory {
  readonly entries: readonly ImportEntry[];
  readonly sha256: string;
  readonly files: number;
  readonly bytes: number;
}

/**
 * Cancellation / lease-loss probe threaded through the asynchronous file
 * operations. It is called before every directory entry and every hash chunk
 * or file copy; throwing aborts the operation at the next safe boundary with
 * the staging directory still unpublished. The caller keeps owning custody:
 * these helpers never release a lease or clean up on their own.
 */
export interface ImportFileOperationGuard {
  readonly assertActive?: () => void;
}

/** Hash chunk size; unchanged from the synchronous implementation. */
const HASH_CHUNK_BYTES = 65_536;

/**
 * Files hashed concurrently during one inventory walk. The walk itself stays
 * sequential so entry order — and the composite digest — is byte-identical to
 * the previous synchronous implementation; only the independent file reads
 * overlap, which keeps many-small-file profiles close to their old duration
 * without ever blocking the event loop.
 */
const INVENTORY_HASH_CONCURRENCY = 8;

/**
 * Stream one file into a SHA-256 digest. The read loop yields to the event
 * loop between chunks and probes `assertActive`, so a slow or large file never
 * blocks a desktop window and a lease loss stops the read promptly.
 *
 * Do not call this on an inode whose SQLite lock this process owns.
 */
export async function hashImportFile(
  path: string,
  guard: ImportFileOperationGuard = {},
): Promise<string> {
  const descriptor = await open(path, "r");
  try {
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    for (;;) {
      guard.assertActive?.();
      const { bytesRead } = await descriptor.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) return digest.digest("hex");
      digest.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await descriptor.close();
  }
}

/**
 * Chromium per-process singleton pointers found in the Electron `userData`
 * directory (`SingletonCookie` / `SingletonLock` / `SingletonSocket`). They
 * name the RUNNING process's lock/socket, so they are meaningless in a copy:
 * the automatic desktop promotion skips them instead of refusing them, and
 * the promoted profile mints fresh ones on next launch. Offline backups keep
 * refusing every symlink.
 */
const RUNTIME_SINGLETON_SYMLINK_NAMES = new Set([
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
]);

export interface InventoryImportFilesOptions extends ImportFileOperationGuard {
  /** Skip (do not copy) the Chromium runtime singleton symlinks instead of
   * refusing them; declared by the automatic desktop promotion, whose source
   * is a live desktop root that legitimately contains them. */
  readonly skipRuntimeSingletonSymlinks?: boolean;
  /**
   * V6 C.4: skip Chromium cache directories (Cache, Code Cache, GPUCache,
   * Service Worker, and Partitions/<profile>/Cache) instead of hashing and
   * copying them. Scoped to the root-level Electron `userData` directory of
   * the source — same-named directories at any other depth are user data
   * and stay. Promotion-only; offline backups keep a full inventory.
   */
  readonly excludeChromiumCaches?: boolean;
  /** Called after each copied file with running totals (promotion progress). */
  readonly onCopyProgress?: (copiedBytes: number, totalBytes: number) => void;
}

/** Chromium per-profile cache directory names. Skipped only when promotion asks. */
const CHROMIUM_CACHE_DIRECTORY_NAMES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "Service Worker",
]);

/** Bytes at or above which the desktop shows a promotion progress window. */
export const PROMOTION_PROGRESS_THRESHOLD_BYTES = 64 * 1024 * 1024;

/**
 * The promotion's source is the desktop namespace root, and the Electron
 * `userData` directory is a direct child of it by construction. Only that
 * root-level directory is Chromium-owned: a nested directory that merely
 * shares the name (`projects/demo/userData`) is user data and must survive
 * the copy intact, caches and singleton-named files included.
 */
function isChromiumUserDataRoot(relative: string): boolean {
  return relative === "userData";
}

function isExcludedChromiumCache(relative: string, name: string): boolean {
  if (isChromiumUserDataRoot(relative) && CHROMIUM_CACHE_DIRECTORY_NAMES.has(name)) {
    return true;
  }
  // Per-partition session caches live one level deeper: Partitions/<profile>/Cache.
  return name === "Cache" && /^userData\/Partitions\/[^/]+$/u.test(relative);
}

function shouldSkipRuntimeSingleton(relative: string, name: string): boolean {
  return isChromiumUserDataRoot(relative) && RUNTIME_SINGLETON_SYMLINK_NAMES.has(name);
}

/**
 * SQLite uses its backup API; ephemeral owner control credentials never migrate.
 *
 * The walk is asynchronous and probes the guard before every entry, so an
 * arbitrarily large source keeps the event loop serviceable. Traversal order,
 * entry shape and the composite digest stay byte-identical to the previous
 * synchronous implementation: receipts written by an older app version are
 * still valid and re-validate after the migration.
 */
export async function inventoryImportFiles(
  root: string,
  options: InventoryImportFilesOptions = {},
): Promise<ImportFileInventory> {
  const entries: MutableImportEntry[] = [];
  const pendingHashes: Array<{ readonly index: number; readonly absolute: string }> = [];
  async function visit(relative: string): Promise<void> {
    const names = (await readdir(join(root, relative))).sort();
    for (const name of names) {
      options.assertActive?.();
      if (!relative && EXCLUDED_ROOT_ENTRIES.has(name)) continue;
      const path = relative ? `${relative}/${name}` : name;
      const absolute = join(root, path);
      const metadata = await lstat(absolute);
      if (
        options.excludeChromiumCaches &&
        metadata.isDirectory() &&
        isExcludedChromiumCache(relative, name)
      ) {
        continue;
      }
      if (metadata.isSymbolicLink()) {
        if (options.skipRuntimeSingletonSymlinks && shouldSkipRuntimeSingleton(relative, name)) {
          // Runtime pointer of the (stopped) source process: not data, never
          // copied — the promoted profile mints its own on next launch.
          // Nested files of the same name (including a user `SingletonLock`)
          // stay in the inventory; only the Chromium userData root is skipped.
          continue;
        }
        throw new Error(`Offline backup contains a symbolic link or special file: ${path}`);
      }
      if (!metadata.isDirectory() && !metadata.isFile()) {
        throw new Error(`Offline backup contains a symbolic link or special file: ${path}`);
      }
      // A hard link could alias the original profile or a SQLite-locked inode.
      if (metadata.isFile() && metadata.nlink !== 1) {
        throw new Error(`Offline backup contains a multiply linked file: ${path}`);
      }
      entries.push({
        path,
        kind: metadata.isDirectory() ? "directory" : "file",
        bytes: metadata.isFile() ? metadata.size : 0,
        mode: metadata.isDirectory() ? 0o700 : metadata.mode & 0o700,
        sha256: null,
      });
      if (metadata.isFile()) {
        pendingHashes.push({ index: entries.length - 1, absolute });
      }
      if (metadata.isDirectory()) await visit(path);
    }
  }
  await visit("");
  await hashPendingFiles(entries, pendingHashes, options);
  const files = entries.filter((entry) => entry.kind === "file");
  return {
    entries,
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
    files: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

interface MutableImportEntry {
  path: string;
  kind: "file" | "directory";
  bytes: number;
  mode: number;
  sha256: string | null;
}

/**
 * Hash the files collected by one walk with bounded concurrency. Workers stop
 * claiming new files after the first failure but drain in-flight reads before
 * the failure is rethrown, so the returned promise resolves only once no read
 * of this walk is still outstanding (staging cleanup races stay impossible).
 */
async function hashPendingFiles(
  entries: MutableImportEntry[],
  pending: readonly { readonly index: number; readonly absolute: string }[],
  guard: ImportFileOperationGuard,
): Promise<void> {
  let next = 0;
  let failure: Error | undefined;
  const worker = async (): Promise<void> => {
    while (failure === undefined) {
      const item = pending[next];
      if (item === undefined) return;
      next += 1;
      try {
        guard.assertActive?.();
        entries[item.index]!.sha256 = await hashImportFile(item.absolute, guard);
      } catch (error) {
        if (failure === undefined) {
          failure =
            error instanceof Error
              ? error
              : new Error(`Inventory hashing failed: ${String(error)}`);
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(INVENTORY_HASH_CONCURRENCY, pending.length) }, worker),
  );
  if (failure !== undefined) throw failure;
}

/**
 * Copy exactly the inventoried entries, then verify the destination against
 * the same inventory digest. Every filesystem operation is awaited, so the
 * caller's event loop keeps running and `onCopyProgress` fires incrementally
 * while the copied bytes are still being written.
 */
export async function copyImportFiles(
  source: string,
  destination: string,
  inventory: ImportFileInventory,
  options: InventoryImportFilesOptions = {},
): Promise<void> {
  let copiedBytes = 0;
  const totalBytes = inventory.bytes;
  for (const entry of inventory.entries) {
    options.assertActive?.();
    const target = join(destination, entry.path);
    if (entry.kind === "directory") {
      await mkdir(target, { recursive: true, mode: 0o700 });
    } else {
      await copyFile(join(source, entry.path), target);
      await chmod(target, entry.mode);
      copiedBytes += entry.bytes;
      options.onCopyProgress?.(copiedBytes, totalBytes);
    }
  }
  const copied = await inventoryImportFiles(destination, options);
  if (copied.sha256 !== inventory.sha256) {
    throw new Error("Offline backup changed while its files were copied; staged data was refused.");
  }
}
