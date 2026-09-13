import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { HostOwnerLease } from "./hostOwnerLease";
import { prepareOwnedHostRoot } from "./hostRootManifest";
import {
  readHostCredentialState,
  secretKeyFingerprint,
  writeHostCredentialState,
  type HostCredentialMode,
} from "./hostCredentialState";

export interface NativeSecretValue {
  readonly ownerGeneration: string;
  readonly value: string;
}

/** Native code transforms bytes only. It never receives a root or key-file path. */
export interface NativeSecretCodec {
  seal(request: NativeSecretValue): Promise<NativeSecretValue>;
  unseal(request: NativeSecretValue): Promise<NativeSecretValue>;
}

export type OwnedSecretKeyOptions =
  | { readonly mode: "headless"; readonly environmentKey?: string }
  | { readonly mode: "os-sealed"; readonly codec: NativeSecretCodec }
  | { readonly mode: "session-only" };

const initializing = new WeakMap<HostOwnerLease, { signature: string; result: Promise<string> }>();

function isBase64(value: string): boolean {
  return value.length > 0 && Buffer.from(value, "base64").toString("base64") === value;
}
function validKey(value: string): boolean {
  return isBase64(value) && Buffer.from(value, "base64").length === 32;
}

function readKeyFile(root: string, name: string): string | undefined {
  const path = join(root, name);
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16_384) {
      throw new Error("Invalid stored credential key file; it was not replaced.");
    }
    return readFileSync(path, "utf8").trim();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
}

async function transformNativeKey(
  lease: HostOwnerLease,
  codec: NativeSecretCodec,
  operation: "seal" | "unseal",
  value: string,
): Promise<string> {
  const ownerGeneration = lease.generation;
  lease.assertActive(ownerGeneration);
  let reply: NativeSecretValue;
  try {
    reply = await codec[operation]({ ownerGeneration, value });
  } catch {
    lease.assertActive(ownerGeneration);
    throw new Error("OS-backed credential key operation failed; the existing key was preserved.");
  }
  lease.assertActive(ownerGeneration);
  if (!reply || typeof reply.ownerGeneration !== "string" || typeof reply.value !== "string")
    throw new Error("Invalid OS-backed credential key response.");
  lease.assertActive(reply.ownerGeneration);
  return reply.value;
}

async function initializeKey(
  lease: HostOwnerLease,
  options: OwnedSecretKeyOptions,
): Promise<string> {
  const generation = lease.generation;
  const environmentKey = options.mode === "headless" ? options.environmentKey?.trim() : undefined;
  if (environmentKey !== undefined && !validKey(environmentKey)) {
    throw new Error("PORACODE_SECRET_STORAGE_KEY must be a base64-encoded 32-byte key.");
  }
  prepareOwnedHostRoot(lease);
  const state = readHostCredentialState(lease);
  if (!state && existsSync(join(lease.paths.dataRoot, "state.sqlite"))) {
    throw new Error(
      "Existing database credentials require explicit ownership activation; no key was created.",
    );
  }
  const keyFiles = readdirSync(lease.paths.dataRoot).filter((name) =>
    name.startsWith("secret-key."),
  );
  if (
    keyFiles.length > 1 ||
    keyFiles.some((name) => name !== "secret-key.safe" && name !== "secret-key.headless")
  ) {
    throw new Error("Unknown or conflicting credential key files; no key was replaced.");
  }
  let mode: HostCredentialMode =
    options.mode === "headless"
      ? environmentKey === undefined
        ? "headless-file"
        : "headless-environment"
      : options.mode;
  // Matching explicit injection may reuse an existing file-backed installation;
  // removing that injection on its next restart must not silently change modes.
  if (
    options.mode === "headless" &&
    (state?.mode === "headless-file" || (!state && keyFiles[0] === "secret-key.headless"))
  )
    mode = "headless-file";
  if (state && state.mode !== mode)
    throw new Error(
      "Credential mode change requires explicit activation; the existing key was preserved.",
    );
  if (
    (keyFiles[0] === "secret-key.safe" && mode !== "os-sealed") ||
    (keyFiles[0] === "secret-key.headless" && mode !== "headless-file")
  ) {
    throw new Error(
      "Stored credential key belongs to another mode; the existing key was preserved.",
    );
  }
  let key: string;
  if (mode === "session-only") {
    key = randomBytes(32).toString("base64");
  } else if (mode === "headless-file" || mode === "headless-environment") {
    const stored = readKeyFile(lease.paths.dataRoot, "secret-key.headless");
    if (stored !== undefined && !validKey(stored))
      throw new Error("Invalid stored headless credential key; it was not replaced.");
    if (environmentKey !== undefined && stored !== undefined && environmentKey !== stored) {
      throw new Error("Injected and stored credential keys differ; neither key was replaced.");
    }
    if (mode === "headless-environment") key = environmentKey!;
    else if (stored !== undefined) key = stored;
    else {
      if (state)
        throw new Error("The recorded headless credential key is missing; it was not regenerated.");
      key = randomBytes(32).toString("base64");
      writeFileAtomic(join(lease.paths.dataRoot, "secret-key.headless"), key, {
        encoding: "utf8",
        mode: 0o600,
      });
    }
  } else {
    if (options.mode !== "os-sealed")
      throw new Error("OS-backed credential storage is unavailable.");
    const stored = readKeyFile(lease.paths.dataRoot, "secret-key.safe");
    if (stored !== undefined) {
      if (!isBase64(stored)) throw new Error("Invalid sealed credential key; it was not replaced.");
      key = await transformNativeKey(lease, options.codec, "unseal", stored);
      if (!validKey(key)) throw new Error("Invalid unsealed credential key; it was not replaced.");
    } else {
      if (state)
        throw new Error(
          "The recorded OS-backed credential key is missing; it was not regenerated.",
        );
      key = randomBytes(32).toString("base64");
      const sealed = await transformNativeKey(lease, options.codec, "seal", key);
      if (!isBase64(sealed) || sealed.length > 16_384)
        throw new Error("Invalid sealed credential key response.");
      writeFileAtomic(join(lease.paths.dataRoot, "secret-key.safe"), sealed, {
        encoding: "utf8",
        mode: 0o600,
      });
    }
  }
  lease.assertActive(generation);
  if (state && mode !== "session-only" && state.keyFingerprint !== secretKeyFingerprint(key)) {
    throw new Error("The credential key no longer matches this profile; no key was replaced.");
  }
  if (!state) writeHostCredentialState(lease, mode, key);
  return key;
}

/** One immutable key initialization per owner generation, including native waits. */
export async function getOwnedSecretStorageKey(
  lease: HostOwnerLease,
  options: OwnedSecretKeyOptions,
): Promise<string> {
  lease.assertActive();
  if (
    options.mode === "headless" &&
    options.environmentKey !== undefined &&
    !validKey(options.environmentKey.trim())
  )
    throw new Error("PORACODE_SECRET_STORAGE_KEY must be a base64-encoded 32-byte key.");
  const signature =
    options.mode === "headless"
      ? `${options.mode}:${options.environmentKey === undefined ? "absent" : `present:${options.environmentKey.trim()}`}`
      : options.mode;
  const existing = initializing.get(lease);
  if (existing) {
    if (existing.signature !== signature)
      throw new Error("Credential initialization options changed within one owner generation.");
    return existing.result;
  }
  // Register before invoking even a synchronous native callback implementation.
  const result = Promise.resolve().then(() => initializeKey(lease, options));
  initializing.set(lease, { signature, result });
  return result;
}
