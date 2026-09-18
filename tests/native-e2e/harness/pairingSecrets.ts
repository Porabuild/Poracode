import { existsSync } from "node:fs";
import { join } from "node:path";
import { consumeSecretFile, writeSecretFile } from "./runDirectory.ts";
import type { PairingSecretRecord } from "./types.ts";

export const PAIRING_SECRET_FILENAME = "pairing.json";

export function pairingSecretPath(secretsDir: string): string {
  return join(secretsDir, PAIRING_SECRET_FILENAME);
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
