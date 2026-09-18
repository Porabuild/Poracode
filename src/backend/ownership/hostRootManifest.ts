import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { HostOwnerLease } from "./hostOwnerLease";
import {
  assertHostRootDirectories,
  HOST_ROOT_LAYOUT_VERSION,
  HOST_ROOT_MANIFEST_FILE,
  type HostRootPaths,
} from "./hostRootPaths";

export const HOST_IMPORT_RECEIPT_FILE = "host-import.json";
/**
 * Version of the activated offline-backup manifest form and of the fields that
 * describe the deliberate activation decision. The layout version itself stays
 * 1: an activated root is a new state inside the first owned layout, and an old
 * reader refuses it loudly (see readHostRootManifest compatibility below)
 * instead of misreading it as staged or empty.
 */
export const HOST_ACTIVATION_MANIFEST_VERSION = 1;
const MAX_MANIFEST_BYTES = 4_096;

export interface HostRootManifest {
  readonly layoutVersion: typeof HOST_ROOT_LAYOUT_VERSION;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly createdAt: string;
  readonly source:
    | { readonly kind: "empty"; readonly activation: "ready" }
    | {
        readonly kind: "offline-backup";
        readonly activation: "required";
        readonly receiptSha256: string;
      }
    | {
        readonly kind: "offline-backup";
        readonly activation: "ready";
        /** Kept from the staged form so the activated root stays receipt-bound. */
        readonly receiptSha256: string;
        readonly activationVersion: typeof HOST_ACTIVATION_MANIFEST_VERSION;
        readonly activatedAt: string;
      };
}

export class HostImportRequiredError extends Error {
  readonly code = "HOST_IMPORT_REQUIRED";

  constructor(readonly paths: HostRootPaths) {
    super(
      `Existing profile ${paths.profileNamespace} requires an explicit offline backup import ` +
        `before the owned host can use ${paths.dataRoot}. The original profile was not changed.`,
    );
    this.name = "HostImportRequiredError";
  }
}

export class HostActivationRequiredError extends Error {
  readonly code = "HOST_ACTIVATION_REQUIRED";

  constructor(readonly paths: HostRootPaths) {
    super(
      `The imported root ${paths.dataRoot} is staged and cannot start services. ` +
        "Credential modes, root-owned paths, provider sessions and automation require explicit activation.",
    );
    this.name = "HostActivationRequiredError";
  }
}

/** A missing marker is different from an incompatible or damaged marker. */
export function readHostRootManifest(paths: HostRootPaths): HostRootManifest | undefined {
  const path = join(paths.dataRoot, HOST_ROOT_MANIFEST_FILE);
  let serialized: string;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.size > MAX_MANIFEST_BYTES) {
      throw new Error("Invalid Poracode host-root manifest file.");
    }
    serialized = readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const value: unknown = JSON.parse(serialized);
  return validateHostRootManifest(value, paths);
}

function validateHostRootManifest(value: unknown, paths: HostRootPaths): HostRootManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid Poracode host-root manifest.");
  const record = value as Record<string, unknown>;
  if (record.layoutVersion !== HOST_ROOT_LAYOUT_VERSION) {
    throw new Error("Unsupported Poracode host-root layout version; no state was upgraded.");
  }
  if (
    record.profileNamespace !== paths.profileNamespace ||
    record.dataRoot !== paths.dataRoot ||
    typeof record.createdAt !== "string" ||
    !Number.isFinite(Date.parse(record.createdAt)) ||
    !record.source ||
    typeof record.source !== "object"
  ) {
    throw new Error("The Poracode host-root manifest does not match this profile namespace.");
  }
  const source = record.source as Record<string, unknown>;
  // Compatibility: a pre-activation reader only accepted the staged
  // "required" form here and refused every other offline-backup state, so an
  // old binary reading an activated root fails loudly with this same error
  // instead of treating activated state as staged or empty.
  if (
    !(
      (source.kind === "empty" && source.activation === "ready") ||
      (source.kind === "offline-backup" &&
        source.activation === "required" &&
        typeof source.receiptSha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(source.receiptSha256)) ||
      (source.kind === "offline-backup" &&
        source.activation === "ready" &&
        typeof source.receiptSha256 === "string" &&
        /^[a-f0-9]{64}$/u.test(source.receiptSha256) &&
        source.activationVersion === HOST_ACTIVATION_MANIFEST_VERSION &&
        typeof source.activatedAt === "string" &&
        Number.isFinite(Date.parse(source.activatedAt)))
    )
  ) {
    throw new Error("Unsupported Poracode host-root activation state.");
  }
  return record as unknown as HostRootManifest;
}

export function createHostRootManifest(
  paths: HostRootPaths,
  source: HostRootManifest["source"],
): HostRootManifest {
  return {
    layoutVersion: HOST_ROOT_LAYOUT_VERSION,
    profileNamespace: paths.profileNamespace,
    dataRoot: paths.dataRoot,
    createdAt: new Date().toISOString(),
    source,
  };
}

/** Lease-checked atomic manifest rewrite; only the live owner may mutate it. */
export function writeHostRootManifest(lease: HostOwnerLease, manifest: HostRootManifest): void {
  lease.assertActive();
  if (
    manifest.layoutVersion !== HOST_ROOT_LAYOUT_VERSION ||
    manifest.profileNamespace !== lease.paths.profileNamespace ||
    manifest.dataRoot !== lease.paths.dataRoot
  ) {
    throw new Error("The host-root manifest does not match this owned profile.");
  }
  // Validate through the same reader rules so an unsupported state is never persisted.
  validateHostRootManifest(JSON.parse(JSON.stringify(manifest)) as unknown, lease.paths);
  writeFileAtomic(
    join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

/** Only a genuinely empty namespace can activate without an import review. */
export function prepareOwnedHostRoot(lease: HostOwnerLease): HostRootManifest {
  lease.assertActive();
  assertHostRootDirectories(lease.paths);
  const existing = readHostRootManifest(lease.paths);
  if (existing) {
    if (existing.source.activation === "required") {
      throw new HostActivationRequiredError(lease.paths);
    }
    return existing;
  }
  if (existsSync(lease.paths.dataRoot) && readdirSync(lease.paths.dataRoot).length > 0) {
    throw new Error("The owned Poracode root contains state without a valid host-root manifest.");
  }
  if (
    existsSync(lease.paths.profileNamespace) &&
    readdirSync(lease.paths.profileNamespace).length > 0
  ) {
    throw new HostImportRequiredError(lease.paths);
  }
  mkdirSync(lease.paths.dataRoot, { recursive: true, mode: 0o700 });
  const manifest = createHostRootManifest(lease.paths, { kind: "empty", activation: "ready" });
  writeFileAtomic(
    join(lease.paths.dataRoot, HOST_ROOT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return manifest;
}
