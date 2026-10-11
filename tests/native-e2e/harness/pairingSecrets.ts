import { existsSync } from "node:fs";
import { join } from "node:path";
import { consumeSecretFile, writeSecretFile } from "./runDirectory.ts";
import type { PairingSecretRecord } from "./types.ts";

export const PAIRING_SECRET_FILENAME = "pairing.json";

/**
 * E.2 real-peer journeys: the one-time pairing credential the real-mode
 * harness mints for an OUT-OF-PROCESS peer (the device journeys pair from a
 * simulator/emulator with their own app storage). It lives in the run dir's
 * secrets (0600 file, 0700 dir) and is deleted with the run dir; it is never
 * part of the secret-free readiness descriptor.
 */
export const REAL_PEER_PAIRING_FILENAME = "real-peer-pairing.json";

export function pairingSecretPath(secretsDir: string): string {
  return join(secretsDir, PAIRING_SECRET_FILENAME);
}

export function realPeerPairingPath(secretsDir: string): string {
  return join(secretsDir, REAL_PEER_PAIRING_FILENAME);
}

export function writeRealPeerPairing(secretsDir: string, pairingUrl: string): void {
  writeSecretFile(realPeerPairingPath(secretsDir), { pairingUrl });
}

export function writePairingSecret(secretsDir: string, record: PairingSecretRecord): void {
  writeSecretFile(pairingSecretPath(secretsDir), record);
}

export function consumePairingSecret(secretsDir: string): PairingSecretRecord {
  return consumeSecretFile<PairingSecretRecord>(pairingSecretPath(secretsDir));
}

export function consumePairingSecretIfPresent(secretsDir: string): PairingSecretRecord | null {
  if (!pairingSecretExists(secretsDir)) return null;
  return consumePairingSecret(secretsDir);
}

export function pairingSecretExists(secretsDir: string): boolean {
  return existsSync(pairingSecretPath(secretsDir));
}
