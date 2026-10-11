import { existsSync } from "node:fs";
import { dirname, extname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadRuntimePayloadProjectionModule,
  resolveRuntimePayloadProjectionModule,
} from "../src/build/runtimePayloadProjectionSource.mjs";

const repositoryRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function candidateFiles(specifier) {
  if (extname(specifier))
    return [specifier, `${specifier}.ts`, `${specifier}.tsx`, join(specifier, "index.ts")];
  return [`${specifier}.ts`, `${specifier}.tsx`, join(specifier, "index.ts")];
}

export async function resolve(specifier, context, nextResolve) {
  const projection = resolveRuntimePayloadProjectionModule(specifier);
  if (projection) return projection;
  if (specifier.startsWith("@/")) {
    const absolute = resolvePath(repositoryRoot, "src", specifier.slice(2));
    for (const candidate of candidateFiles(absolute)) {
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const base = specifier.startsWith("/") ? specifier : resolvePath(dirname(parent), specifier);
    for (const candidate of candidateFiles(base)) {
      if (existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const projection = loadRuntimePayloadProjectionModule(url, repositoryRoot);
  if (projection) return projection;
  return nextLoad(url, context);
}
