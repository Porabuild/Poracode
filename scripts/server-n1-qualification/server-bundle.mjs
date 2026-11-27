import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Production builds can split the host admission code into a separate chunk.
export function serverBundleSupportsD4(libDir) {
  return readdirSync(libDir, { withFileTypes: true }).some((entry) => {
    if (!entry.isFile() || !entry.name.endsWith(".cjs")) return false;
    const chunk = readFileSync(join(libDir, entry.name), "utf8");
    return chunk.includes("not-staging") && chunk.includes("identity-mismatch");
  });
}
