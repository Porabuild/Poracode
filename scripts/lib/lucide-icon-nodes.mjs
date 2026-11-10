import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Shared adapter for Lucide's canonical nodes and renamed-icon re-exports. */
export async function loadLucideIconNodes(lucideRoot, name) {
  const path = join(lucideRoot, "dist/esm/icons", `${name}.mjs`);
  const icon = await import(pathToFileURL(path).href);
  if (icon.__iconNode) return icon.__iconNode;
  const alias = readFileSync(path, "utf8").match(/from '\.\/([a-z0-9-]+)\.mjs'/)?.[1];
  if (!alias) throw new Error(`Missing Lucide icon: ${name}`);
  return loadLucideIconNodes(lucideRoot, alias);
}
