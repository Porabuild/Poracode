import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { HostOwnerLease } from "./hostOwnerLease";

export const HOST_CREDENTIAL_STATE_VERSION = 1;
export const HOST_CREDENTIAL_STATE_FILE = "host-credentials.json";
export type HostCredentialMode =
  | "os-sealed"
  | "headless-file"
  | "headless-environment"
  | "session-only";

export interface HostCredentialState {
  readonly formatVersion: typeof HOST_CREDENTIAL_STATE_VERSION;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly mode: HostCredentialMode;
  readonly keyFingerprint: string | null;
}

export interface HostCredentialCapabilities {
  readonly mode: HostCredentialMode;
  readonly canPersistSecrets: boolean;
  /** Guard new ciphertext writes; ordinary edits may preserve existing ciphertext. */
  assertCanPersistSecrets(): void;
}

/** Resolve once after key initialization; guards remain memory-only and generation-bound. */
export function getOwnedCredentialCapabilities(lease: HostOwnerLease): HostCredentialCapabilities {
  const generation = lease.generation;
  const state = readHostCredentialState(lease);
  if (!state) throw new Error("Host credentials have not been initialized.");
  const mode = state.mode;
  return {
    mode,
    canPersistSecrets: mode !== "session-only",
    assertCanPersistSecrets() {
      lease.assertActive(generation);
      if (mode === "session-only") {
        throw new Error(
          "Persistent credentials are unavailable with a session-only key; existing stored values must be preserved.",
        );
      }
    },
  };
}

export function secretKeyFingerprint(key: string): string {
  return createHash("sha256").update(Buffer.from(key, "base64")).digest("hex");
}

export function readHostCredentialState(lease: HostOwnerLease): HostCredentialState | undefined {
  lease.assertActive();
  const path = join(lease.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE);
  let serialized: string;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 4_096) {
      throw new Error("Invalid host credential-state file.");
    }
    serialized = readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Invalid host credential-state format.");
  }
  if (!value || typeof value !== "object") throw new Error("Invalid host credential-state format.");
  const state = value as Record<string, unknown>;
  if (state.formatVersion !== HOST_CREDENTIAL_STATE_VERSION) {
    throw new Error("Unsupported host credential-state version; the existing key was preserved.");
  }
  if (
    state.profileNamespace !== lease.paths.profileNamespace ||
    state.dataRoot !== lease.paths.dataRoot
  ) {
    throw new Error("Host credential state does not match this owned profile.");
  }
  if (
    !(["os-sealed", "headless-file", "headless-environment", "session-only"] as unknown[]).includes(
      state.mode,
    )
  ) {
    throw new Error("Unsupported host credential mode; the existing key was preserved.");
  }
  if (
    state.mode === "session-only"
      ? state.keyFingerprint !== null
      : typeof state.keyFingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(state.keyFingerprint)
  ) {
    throw new Error("Invalid host credential fingerprint; the existing key was preserved.");
  }
  return state as unknown as HostCredentialState;
}

export function writeHostCredentialState(
  lease: HostOwnerLease,
  mode: HostCredentialMode,
  key: string,
): void {
  lease.assertActive();
  const state: HostCredentialState = {
    formatVersion: HOST_CREDENTIAL_STATE_VERSION,
    profileNamespace: lease.paths.profileNamespace,
    dataRoot: lease.paths.dataRoot,
    mode,
    keyFingerprint: mode === "session-only" ? null : secretKeyFingerprint(key),
  };
  writeFileAtomic(
    join(lease.paths.dataRoot, HOST_CREDENTIAL_STATE_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}
