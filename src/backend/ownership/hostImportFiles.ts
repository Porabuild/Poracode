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

const EXCLUDED_ROOT_ENTRIES = new Set([
  "state.sqlite",
  "state.sqlite-shm",
  "state.sqlite-wal",
  "state.sqlite-journal",
  HOST_CONTROL_DISCOVERY_FILE,
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

/** SQLite uses its backup API; ephemeral owner control credentials never migrate. */
export function inventoryImportFiles(root: string): ImportFileInventory {
  const entries: ImportEntry[] = [];
  function visit(relative: string): void {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!relative && EXCLUDED_ROOT_ENTRIES.has(name)) continue;
      const path = relative ? `${relative}/${name}` : name;
      const absolute = join(root, path);
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
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
): void {
  for (const entry of inventory.entries) {
    const target = join(destination, entry.path);
    if (entry.kind === "directory") {
      mkdirSync(target, { recursive: true, mode: 0o700 });
    } else {
      copyFileSync(join(source, entry.path), target);
      chmodSync(target, entry.mode);
    }
  }
  const copied = inventoryImportFiles(destination);
  if (copied.sha256 !== inventory.sha256) {
    throw new Error("Offline backup changed while its files were copied; staged data was refused.");
  }
}
