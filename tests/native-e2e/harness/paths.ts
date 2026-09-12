import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function findRepoRoot(start = process.cwd()): string {
  const fromModule = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  for (const candidate of [fromModule, start]) {
    if (isPoracodeRoot(candidate)) return candidate;
  }
  let dir = start;
  for (;;) {
    if (isPoracodeRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Unable to locate the Poracode repository root from the native-e2e harness.");
    }
    dir = parent;
  }
}

function isPoracodeRoot(dir: string): boolean {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: unknown };
    return parsed.name === "poracode";
  } catch {
    return false;
  }
}

export function protocolManifestPath(repoRoot = findRepoRoot()): string {
  return join(repoRoot, "protocol/remote/v3/manifest.json");
}

export function protocolFixturePath(name: string, repoRoot = findRepoRoot()): string {
  return join(repoRoot, "protocol/remote/v3/fixtures", name);
}

export function protocolInventoryPath(repoRoot = findRepoRoot()): string {
  return join(repoRoot, "protocol/remote/v3/generated/inventory.json");
}

export function detectHeadlessServerEntrypoint(repoRoot = findRepoRoot()): string | null {
  const pkgPath = join(repoRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  const serverScript = pkg.scripts?.server?.trim();
  const fromScript = serverScript?.match(/^node\s+(\S+)/)?.[1];
  const candidates = [
    fromScript ? join(repoRoot, fromScript) : null,
    join(repoRoot, "dist/main/server.cjs"),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

export function detectServerNativeBinding(repoRoot = findRepoRoot()): string | null {
  const candidate = join(repoRoot, "dist/server-native/better_sqlite3.node");
  return existsSync(candidate) ? candidate : null;
}
