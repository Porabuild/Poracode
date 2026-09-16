import { safeStorage } from "electron";
import type { NativeCredentialMode, NativeSecretValue } from "@/shared/hostCredentialProtocol";
import type { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";

/** Called after ownership bootstrap; availability does not authorize key-file access. */
export function resolveNativeCredentialMode(
  platform: NodeJS.Platform = process.platform,
): NativeCredentialMode {
  try {
    return safeStorage.isEncryptionAvailable() &&
      !(platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
      ? "os-sealed"
      : "session-only";
  } catch {
    throw new Error("Unable to inspect OS-backed secret storage.");
  }
}

function validBase64(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 16_384 &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

function validKey(value: string): boolean {
  return validBase64(value) && Buffer.from(value, "base64").length === 32;
}

/**
 * Electron only seals/unseals bytes for its current backend generation. The
 * backend owns all file reads, persistence and credential-mode continuity.
 */
export function transformNativeCredentialKey(
  operation: "seal" | "unseal",
  request: NativeSecretValue,
  expectedGeneration: string,
  platform: NodeJS.Platform = process.platform,
): NativeSecretValue {
  if (operation !== "seal" && operation !== "unseal") {
    throw new Error("Unknown credential callback operation.");
  }
  if (
    !request ||
    typeof expectedGeneration !== "string" ||
    !expectedGeneration ||
    typeof request.ownerGeneration !== "string" ||
    request.ownerGeneration !== expectedGeneration
  ) {
    throw new Error("The credential callback belongs to another owner generation.");
  }
  if (
    typeof request.value !== "string" ||
    !(operation === "seal" ? validKey(request.value) : validBase64(request.value))
  ) {
    throw new Error("Invalid credential callback bytes.");
  }
  if (resolveNativeCredentialMode(platform) !== "os-sealed") {
    throw new Error("OS-backed credential storage is unavailable.");
  }
  let value: string;
  try {
    value =
      operation === "seal"
        ? safeStorage.encryptString(request.value).toString("base64")
        : safeStorage.decryptString(Buffer.from(request.value, "base64"));
  } catch {
    throw new Error("OS-backed credential key operation failed.");
  }
  if (!(operation === "seal" ? validBase64(value) : validKey(value))) {
    throw new Error("Invalid OS-backed credential key result.");
  }
  return { ownerGeneration: expectedGeneration, value };
}

/**
 * Production engine for the one-time desktop key-adoption protocol
 * (`HostCredentialAdoptionService` in `src/backend/ownership/nativeSecretKey.ts`).
 * Unseals a staged OS-sealed key blob through {@link transformNativeCredentialKey},
 * fenced to the mounting desktop owner's lease generation, so the staged key
 * material can be adopted headlessly without the raw safeStorage surface or any
 * key-file path crossing the adoption boundary.
 */
export function createNativeCredentialUnsealer(
  lease: HostOwnerLease,
  platform: NodeJS.Platform = process.platform,
): (sealedKey: string, ownerGeneration: string) => Promise<string> {
  const generation = lease.generation;
  return async (sealedKey, ownerGeneration) => {
    lease.assertActive(generation);
    const reply = transformNativeCredentialKey(
      "unseal",
      { ownerGeneration, value: sealedKey },
      generation,
      platform,
    );
    lease.assertActive(generation);
    return reply.value;
  };
}
