import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { HostOwnerLease } from "./hostOwnerLease";
import { canonicalHostPath, HOST_ROOT_MANIFEST_FILE, type HostRootPaths } from "./hostRootPaths";
import {
  createHostRootManifest,
  HOST_IMPORT_RECEIPT_FILE,
  readHostRootManifest,
} from "./hostRootManifest";
import { OfflineImportDatabase } from "./hostImportDatabase";
import { assertDistinctHostImportSource } from "./hostImportIdentity";
import { copyImportFiles, hashImportFile, inventoryImportFiles } from "./hostImportFiles";

export const HOST_IMPORT_RECEIPT_VERSION = 1;

export interface HostImportReceipt {
  readonly formatVersion: typeof HOST_IMPORT_RECEIPT_VERSION;
  readonly sourceBackupPath: string;
  readonly sourceDeclaredOffline: true;
  readonly sourceDatabaseVerification: "exclusive-sqlite-lock-and-backup";
  readonly sourceBookkeeping: "sqlite-may-create-or-clean-journals";
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly ownerGeneration: string;
  readonly createdAt: string;
  readonly databaseSchemaVersion: number;
  readonly databaseSha256: string;
  readonly fileInventorySha256: string;
  readonly files: number;
  readonly fileBytes: number;
  readonly credentialMode: "os-sealed-unverified" | "headless-file-unverified" | "unknown";
  readonly activation: "required";
}

/**
 * Automatic desktop promotion (V5 plan 1.3) stages the lease's OWN profile
 * namespace — the historical plain desktop root — into the owned sibling.
 * The offline declaration holds by construction: the shared kernel lease
 * and the data-custody fence exclude every other writer while the staging
 * runs, exactly as if the operator had stopped the owner and copied the
 * directory.
 */
export interface PromoteProfileNamespaceSource {
  readonly promoteProfileNamespaceSource: true;
}

function contains(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return (
    path === "" ||
    (!isAbsolute(path) &&
      path !== ".." &&
      !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`))
  );
}

/**
 * Stage an explicitly offline backup; the one exception is the automatic
 * desktop promotion (`promoteProfileNamespaceSource`), whose "backup" is the
 * lease's own plain profile namespace, made offline by the shared lease and
 * data-custody fence. The receipt records what was verified, and normal
 * startup refuses the staged root until credential, path, provider-session
 * and automation activation exists.
 */
export async function stageHostImport(
  lease: HostOwnerLease,
  request: {
    readonly sourceBackupPath: string;
    readonly sourceDeclaredOffline: true;
    /**
     * Present only for the automatic desktop promotion, whose source is this
     * lease's own profile namespace. Every other overlap stays refused: an
     * explicit import still requires an independent offline backup directory.
     */
    readonly promoteProfileNamespaceSource?: true;
  },
  signal?: AbortSignal,
): Promise<HostImportReceipt> {
  const generation = lease.generation;
  function assertOperationActive(): void {
    lease.assertActive(generation);
    signal?.throwIfAborted();
  }
  assertOperationActive();
  if (request.sourceDeclaredOffline !== true) {
    throw new Error("Host import requires an explicitly offline source backup.");
  }
  const source = canonicalHostPath(request.sourceBackupPath);
  const promotingOwnNamespace =
    request.promoteProfileNamespaceSource === true && source === lease.paths.profileNamespace;
  for (const path of [
    ...(promotingOwnNamespace ? [] : [lease.paths.profileNamespace]),
    lease.paths.dataRoot,
    lease.paths.electronUserDataRoot,
  ]) {
    if (contains(source, path) || contains(path, source)) {
      throw new Error(
        "Import from a separate offline backup, not a profile, owned root or enclosing directory.",
      );
    }
  }
  if (existsSync(lease.paths.dataRoot)) {
    throw new Error("Host import cannot overwrite an existing owned root.");
  }
  if (
    existsSync(join(source, HOST_ROOT_MANIFEST_FILE)) ||
    existsSync(join(source, HOST_IMPORT_RECEIPT_FILE))
  ) {
    throw new Error(
      "Import source already has owned-root format markers; an explicit versioned migration is required.",
    );
  }
  const sourceIdentity = lstatSync(source);
  if (!sourceIdentity.isDirectory()) throw new Error("Offline backup must be a directory.");
  assertDistinctHostImportSource(lease.paths, source, {
    ...(promotingOwnNamespace ? { promoteProfileNamespaceSource: true } : {}),
  });
  const database = OfflineImportDatabase.open(source);
  let staging: string | undefined;
  try {
    staging = mkdtempSync(`${lease.paths.dataRoot}.import-`);
    lease.setPhase("staging-import");
    const before = inventoryImportFiles(source);
    const keyFiles = before.entries.filter((entry) => entry.path.startsWith("secret-key."));
    if (
      keyFiles.some(
        (entry) =>
          entry.kind !== "file" ||
          (entry.path !== "secret-key.safe" && entry.path !== "secret-key.headless"),
      ) ||
      keyFiles.length > 1
    ) {
      throw new Error("Offline backup contains unknown or conflicting credential key modes.");
    }
    const credentialMode =
      keyFiles[0]?.path === "secret-key.safe"
        ? "os-sealed-unverified"
        : keyFiles[0]?.path === "secret-key.headless"
          ? "headless-file-unverified"
          : "unknown";
    await database.copyTo(join(staging, "state.sqlite"), assertOperationActive);
    copyImportFiles(source, staging, before);
    const after = inventoryImportFiles(source);
    const identityAfter = lstatSync(source);
    if (
      before.sha256 !== after.sha256 ||
      sourceIdentity.dev !== identityAfter.dev ||
      sourceIdentity.ino !== identityAfter.ino
    ) {
      throw new Error("Offline backup changed during import; staged data was refused.");
    }
    const receipt: HostImportReceipt = {
      formatVersion: HOST_IMPORT_RECEIPT_VERSION,
      sourceBackupPath: source,
      sourceDeclaredOffline: true,
      sourceDatabaseVerification: "exclusive-sqlite-lock-and-backup",
      sourceBookkeeping: "sqlite-may-create-or-clean-journals",
      profileNamespace: lease.paths.profileNamespace,
      dataRoot: lease.paths.dataRoot,
      ownerGeneration: generation,
      createdAt: new Date().toISOString(),
      databaseSchemaVersion: database.schemaVersion,
      databaseSha256: hashImportFile(join(staging, "state.sqlite")),
      fileInventorySha256: before.sha256,
      files: before.files,
      fileBytes: before.bytes,
      credentialMode,
      activation: "required",
    };
    const serializedReceipt = `${JSON.stringify(receipt, null, 2)}\n`;
    writeFileAtomic(join(staging, HOST_IMPORT_RECEIPT_FILE), serializedReceipt, {
      encoding: "utf8",
      mode: 0o600,
    });
    const manifest = createHostRootManifest(lease.paths, {
      kind: "offline-backup",
      activation: "required",
      receiptSha256: createHash("sha256").update(serializedReceipt).digest("hex"),
    });
    writeFileAtomic(
      join(staging, HOST_ROOT_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    // All asynchronous work has joined and the same owner still holds the lease.
    assertOperationActive();
    renameSync(staging, lease.paths.dataRoot);
    return receipt;
  } finally {
    database.close();
    if (staging) rmSync(staging, { recursive: true, force: true });
    try {
      lease.setPhase("preparing");
    } catch {
      /* A cancelled generation must not rewrite discovery metadata. */
    }
  }
}

/** Only inspect a staged receipt; this never activates its copied state. */
export function readHostImportReceipt(lease: HostOwnerLease): HostImportReceipt {
  lease.assertActive();
  return readHostImportReceiptFromPaths(lease.paths);
}

/**
 * Lease-free inspection for the activation entry's fail-fast pre-checks; the
 * authoritative re-read happens again under the activation lease.
 */
export function readHostImportReceiptFromPaths(paths: HostRootPaths): HostImportReceipt {
  const path = join(paths.dataRoot, HOST_IMPORT_RECEIPT_FILE);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.size > 16_384)
    throw new Error("Invalid host import receipt file.");
  const serialized = readFileSync(path, "utf8");
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== "object") throw new Error("Invalid host import receipt.");
  const receipt = value as Record<string, unknown>;
  if (receipt.formatVersion !== HOST_IMPORT_RECEIPT_VERSION || receipt.activation !== "required") {
    throw new Error("Unsupported host import receipt version or activation state.");
  }
  if (receipt.profileNamespace !== paths.profileNamespace || receipt.dataRoot !== paths.dataRoot) {
    throw new Error("Host import receipt does not match this profile namespace.");
  }
  if (
    typeof receipt.sourceBackupPath !== "string" ||
    !isAbsolute(receipt.sourceBackupPath) ||
    receipt.sourceDeclaredOffline !== true ||
    receipt.sourceDatabaseVerification !== "exclusive-sqlite-lock-and-backup" ||
    receipt.sourceBookkeeping !== "sqlite-may-create-or-clean-journals" ||
    typeof receipt.ownerGeneration !== "string" ||
    !receipt.ownerGeneration ||
    typeof receipt.createdAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.createdAt)) ||
    !["databaseSchemaVersion", "files", "fileBytes"].every(
      (key) => Number.isSafeInteger(receipt[key]) && Number(receipt[key]) >= 0,
    ) ||
    !["databaseSha256", "fileInventorySha256"].every(
      (key) => typeof receipt[key] === "string" && /^[a-f0-9]{64}$/u.test(receipt[key]),
    ) ||
    !["os-sealed-unverified", "headless-file-unverified", "unknown"].includes(
      String(receipt.credentialMode),
    )
  )
    throw new Error("Invalid host import receipt evidence.");
  const manifest = readHostRootManifest(paths);
  if (
    manifest?.source.kind !== "offline-backup" ||
    manifest.source.receiptSha256 !== createHash("sha256").update(serialized).digest("hex")
  )
    throw new Error("Host import receipt does not match its root manifest.");
  return receipt as unknown as HostImportReceipt;
}
