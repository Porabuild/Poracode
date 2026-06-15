/**
 * Pure helpers for recognizing a sealed secret value, with NO `node:crypto`
 * import — so they are safe to use in the renderer (Vite externalizes
 * `node:crypto`, and merely importing `secretStorage.ts` there throws). The
 * sealing/unsealing primitives that actually need crypto live in
 * `secretStorage.ts`, which re-exports `isEncryptedSecret` for existing callers.
 */

/** Marker prefix for AES-256-GCM sealed values produced by `encryptSecret`. */
export const SECRET_PREFIX = "lc-safe:v1:";

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX);
}
