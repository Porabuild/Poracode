// Mirrors @pnpm/plugin-esm-node-path for pnpm's global virtual store without a
// configDependency, whose multi-document lockfile is not yet accepted by
// Vercel's project-config parser.
import { createRequire } from "node:module";
import { delimiter } from "node:path";
import { pathToFileURL } from "node:url";

const extraNodePaths = (process.env.NODE_PATH ?? "").split(delimiter).filter(Boolean);

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (originalError) {
    if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
      throw originalError;
    }

    for (const basePath of extraNodePaths) {
      const require = createRequire(pathToFileURL(basePath).href);
      try {
        const resolved = require.resolve(specifier);
        return { url: pathToFileURL(resolved).href };
      } catch {
        // Try the next pnpm-provided NODE_PATH entry.
      }
    }

    throw originalError;
  }
}
