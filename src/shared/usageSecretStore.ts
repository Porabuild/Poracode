import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { decryptSecret, encryptSecret } from "./secretStorage";

/**
 * On-disk store for captured provider session secrets (e.g. a browser-login
 * cookie), shared by the main and supervisor processes. Values are sealed with
 * the shared `safeStorage`-derived key (see `src/shared/secretStorage.ts`) so the
 * file never holds plaintext. Main writes on capture; the supervisor's usage
 * `CredentialStore.getSecret` reads. Shape: `{ [providerId]: { [key]: sealed } }`.
 *
 * The `decryptSecret`/`encryptSecret` `baseDir` argument is unused by the current
 * scheme; we pass "" and key the store solely by file path.
 */

const SECRETS_FILE = "provider-secrets.json";

type SecretsFile = Record<string, Record<string, string>>;

export function usageSecretsPath(cacheDir: string): string {
  return join(cacheDir, SECRETS_FILE);
}

function readAll(path: string): SecretsFile {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SecretsFile) : {};
  } catch {
    return {};
  }
}

function writeAll(path: string, data: SecretsFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

/** Seal and persist a provider secret. */
export function setUsageSecret(
  cacheDir: string,
  providerId: string,
  key: string,
  plaintext: string,
): void {
  const path = usageSecretsPath(cacheDir);
  const data = readAll(path);
  const bucket = { ...(data[providerId] ?? {}) };
  bucket[key] = encryptSecret("", plaintext);
  data[providerId] = bucket;
  writeAll(path, data);
}

/** Remove a single secret (or the whole provider bucket when `key` is omitted). */
export function clearUsageSecret(cacheDir: string, providerId: string, key?: string): void {
  const path = usageSecretsPath(cacheDir);
  if (!existsSync(path)) return;
  const data = readAll(path);
  if (!data[providerId]) return;
  if (key === undefined) {
    delete data[providerId];
  } else {
    const bucket = { ...data[providerId] };
    delete bucket[key];
    if (Object.keys(bucket).length === 0) delete data[providerId];
    else data[providerId] = bucket;
  }
  writeAll(path, data);
}

/** Read and unseal a provider secret, or undefined when absent/undecryptable. */
export function getUsageSecret(
  cacheDir: string,
  providerId: string,
  key: string,
): string | undefined {
  const path = usageSecretsPath(cacheDir);
  const sealed = readAll(path)[providerId]?.[key];
  if (!sealed) return undefined;
  try {
    return decryptSecret("", sealed);
  } catch {
    return undefined;
  }
}
