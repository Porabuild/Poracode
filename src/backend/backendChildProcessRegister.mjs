// Module hooks for process tests that fork the real TS backend entry
// (`src/backend/index.ts`) under plain Node. Transpiles TS with esbuild
// (correct type-import elision for the whole backend graph) and JSON-as-JS:
// the backend graph imports bundled plugin manifests
// (`src/shared/plugins/builtInCoreSkills.ts`) as bare JSON imports, which the
// bundler inlines in production but Node's ESM loader would refuse without an
// import attribute.
import { register } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformSync } from "esbuild";

register("./backendChildProcessRegister.mjs", import.meta.url);

const repositoryRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");

function candidateFiles(specifier) {
  if (extname(specifier)) return [specifier];
  return [`${specifier}.ts`, `${specifier}.tsx`, join(specifier, "index.ts")];
}

export async function resolve(specifier, context, nextResolve) {
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
  if (url.endsWith(".json")) {
    return {
      format: "module",
      shortCircuit: true,
      source: `export default ${readFileSync(fileURLToPath(url), "utf8")};`,
    };
  }
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const loader = url.endsWith(".tsx") ? "tsx" : "ts";
    const sourcePath = fileURLToPath(url);
    const source = readFileSync(sourcePath, "utf8");
    // The source graph keeps CommonJS `__dirname`/`__filename`; the production
    // bundler provides them per module, so the hook mirrors that contract.
    const shim = /\b(__dirname|__filename)\b/.test(source)
      ? 'import { dirname as __shim_dirname } from "node:path";\n' +
        'import { fileURLToPath as __shim_f2p } from "node:url";\n' +
        "const __filename = __shim_f2p(import.meta.url);\n" +
        "const __dirname = __shim_dirname(__filename);\n"
      : "";
    const result = transformSync(shim + source, {
      loader,
      format: "esm",
      target: "node24",
      sourcefile: sourcePath,
    });
    return { format: "module", shortCircuit: true, source: result.code };
  }
  return nextLoad(url, context);
}
