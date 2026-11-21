import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
export const outputPath = "ios/App/App/Features/ProviderUI/ProviderUIRegistry.json";

/** Read data declarations only; never execute renderer modules in a host tool. */
export function providerUIEntry(source, directory, defaultFast) {
  const kind = /^\s*kind:\s*["']([^"']+)["']/m.exec(source)?.[1];
  if (kind !== directory) throw new Error(`Provider manifest kind mismatch: ${directory}`);
  const rank = /^\s*order:\s*([^,\n]+)/m.exec(source)?.[1]?.trim();
  if (!rank || !/^\d+$/.test(rank) || !Number.isSafeInteger(Number(rank))) {
    throw new Error(`Expected literal provider order: ${directory}`);
  }
  const value = /^\s*defaultFastEnabled:\s*([^,\n]+)/m.exec(source)?.[1]?.trim();
  if (value !== undefined && value !== "true" && value !== "false") {
    throw new Error(`Expected literal defaultFastEnabled: ${directory}`);
  }
  const identity = {};
  for (const key of ["legacyTerminalRuntimeLabel", "legacyGuiRuntimeVariant"]) {
    const raw = new RegExp(`^\\s*${key}:\\s*([^,\\n]+)`, "m").exec(source)?.[1]?.trim();
    if (raw === undefined) continue;
    const literal = /^["']([^"']+)["']$/.exec(raw)?.[1];
    if (!literal) throw new Error(`Expected literal ${key}: ${directory}`);
    identity[key] = literal;
  }
  return {
    order: Number(rank),
    defaultFastEnabled: value === undefined ? defaultFast : value === "true",
    ...identity,
  };
}

export async function generateProviderUIRegistry(repositoryRoot = root, check = false) {
  const modelConfig = await readFile(
    resolve(repositoryRoot, "src/renderer/components/providers/modelConfig.ts"),
    "utf8",
  );
  const fallback = /\?\.defaultFastEnabled\s*\?\?\s*(true|false)/.exec(modelConfig)?.[1];
  if (!fallback) throw new Error("Cannot resolve the shared renderer Fast fallback");
  const directory = resolve(repositoryRoot, "src/renderer/components/providers");
  const providers = {};
  const ranks = new Set();
  for (const entry of (await readdir(directory, { withFileTypes: true })).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    let source;
    try {
      source = await readFile(resolve(directory, entry.name, "manifest.ts"), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const metadata = providerUIEntry(source, entry.name, fallback === "true");
    if (ranks.has(metadata.order)) throw new Error(`Duplicate provider order: ${metadata.order}`);
    ranks.add(metadata.order);
    providers[entry.name] = metadata;
  }
  if (Object.keys(providers).length === 0)
    throw new Error("No registered provider manifests found");
  // v2 adds provider-owned legacy surface identity. No persisted settings change;
  // the native reader also accepts v1 bundles, with these optional fields absent.
  const text =
    JSON.stringify({ version: 2, defaultFastEnabled: fallback === "true", providers }, null, 2) +
    "\n";
  const path = resolve(repositoryRoot, outputPath);
  if (check) {
    if ((await readFile(path, "utf8")) !== text)
      throw new Error(`Stale native provider UI registry: ${outputPath}`);
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  }
  return text;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await generateProviderUIRegistry(root, process.argv.includes("--check"));
}
