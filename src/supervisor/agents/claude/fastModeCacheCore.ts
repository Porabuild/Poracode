import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

/**
 * Path-based fast-mode availability cache (no path resolution of its own) so it
 * can be shared by the native probe (host paths via `fastModeCache.ts`) and the
 * WSL probe worker (a Windows path handed in as a `/mnt/c/...` mount). Keyed by
 * a hash of the account email so raw addresses never hit disk, and so native +
 * WSL entries for different accounts coexist in the one file.
 */

export const FAST_MODE_CACHE_FILENAME = "claude-fast-mode.json";
const CACHE_VERSION = 1;

interface FastModeCacheFile {
  version: number;
  accounts: Record<string, { available: boolean }>;
}

export function fastModeAccountKey(accountEmail: string): string {
  return createHash("sha256").update(accountEmail.trim().toLowerCase()).digest("hex").slice(0, 16);
}

async function readCacheFile(cachePath: string): Promise<FastModeCacheFile> {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf8")) as FastModeCacheFile;
    if (parsed.version === CACHE_VERSION && parsed.accounts) return parsed;
  } catch {
    // Missing/corrupt cache falls through to an empty one.
  }
  return { version: CACHE_VERSION, accounts: {} };
}

/** `undefined` = no cached answer for this account (caller should probe). */
export async function readFastAvailabilityAt(
  cachePath: string,
  accountEmail: string,
): Promise<boolean | undefined> {
  const cache = await readCacheFile(cachePath);
  return cache.accounts[fastModeAccountKey(accountEmail)]?.available;
}

export async function writeFastAvailabilityAt(
  cachePath: string,
  accountEmail: string,
  available: boolean,
): Promise<void> {
  try {
    const cache = await readCacheFile(cachePath);
    cache.accounts[fastModeAccountKey(accountEmail)] = { available };
    await fs.mkdir(dirname(cachePath), { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(cache), "utf8");
  } catch {
    // Best-effort cache; a write failure just means we re-probe next time.
  }
}
