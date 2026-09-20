import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
} from "node:fs";
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

/** Do not call this on an inode whose SQLite lock this process owns. */
export function hashImportFile(path: string): string {
  const descriptor = openSync(path, "r");
  try {
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(65_536);
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) return digest.digest("hex");
      digest.update(buffer.subarray(0, bytes));
    }
  } finally {
    closeSync(descriptor);
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

export interface InventoryImportFilesOptions {
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

/** SQLite uses its backup API; ephemeral owner control credentials never migrate. */
export function inventoryImportFiles(
  root: string,
  options: InventoryImportFilesOptions = {},
): ImportFileInventory {
  const entries: ImportEntry[] = [];
  function visit(relative: string): void {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!relative && EXCLUDED_ROOT_ENTRIES.has(name)) continue;
      const path = relative ? `${relative}/${name}` : name;
      const absolute = join(root, path);
      const metadata = lstatSync(absolute);
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
        sha256: metadata.isFile() ? hashImportFile(absolute) : null,
      });
      if (metadata.isDirectory()) visit(path);
    }
  }
  visit("");
  const files = entries.filter((entry) => entry.kind === "file");
  return {
    entries,
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
    files: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

export function copyImportFiles(
  source: string,
  destination: string,
  inventory: ImportFileInventory,
  options: InventoryImportFilesOptions = {},
): void {
  let copiedBytes = 0;
  const totalBytes = inventory.bytes;
  for (const entry of inventory.entries) {
    const target = join(destination, entry.path);
    if (entry.kind === "directory") {
      mkdirSync(target, { recursive: true, mode: 0o700 });
    } else {
      copyFileSync(join(source, entry.path), target);
      chmodSync(target, entry.mode);
      copiedBytes += entry.bytes;
      options.onCopyProgress?.(copiedBytes, totalBytes);
    }
  }
  const copied = inventoryImportFiles(destination, options);
  if (copied.sha256 !== inventory.sha256) {
    throw new Error("Offline backup changed while its files were copied; staged data was refused.");
  }
}
