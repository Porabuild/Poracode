import { readFileSync, readdirSync } from "node:fs";
import { isBuiltin } from "node:module";
import { resolve } from "node:path";
import { tokenizer } from "acorn";

// Electron exposes this module from the host runtime; it must not be installed
// into the packaged app's node_modules tree.
const HOST_PROVIDED_PACKAGES = new Set(["electron"]);

// Optional feature probes that are guarded by their caller. These must not
// force a production dependency into the clean packaging stage merely because
// a bundled dependency retains its literal `require()` inside a try/catch.
const OPTIONAL_RUNTIME_PACKAGES = new Set(["supports-color"]);

function packageNameFor(id) {
  const parts = id.split("/");
  return id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * Find literal CommonJS, dynamic-import, static-import, and export-from module
 * IDs without matching examples embedded in comments or template strings. The
 * previous regex scanner mistook the JXA source text `ObjC.import("stdlib")`
 * for a JavaScript dynamic import.
 */
export function scanModuleIds(code) {
  const ids = new Set();
  const tokenStream = tokenizer(code, {
    allowHashBang: true,
    ecmaVersion: "latest",
    sourceType: "module",
  });
  const tokens = [];
  for (;;) {
    const token = tokenStream.getToken();
    if (token.type.label === "eof") break;
    tokens.push(token);
  }

  const addLiteral = (index) => {
    const token = tokens[index];
    if (token?.type.label === "string") {
      ids.add(token.value);
      return;
    }
    // Production minification rewrites literal dynamic-import specifiers to
    // no-substitution templates: import(`@opencode-ai/sdk/v2/client`).
    if (
      token?.type.label === "`" &&
      tokens[index + 1]?.type.label === "template" &&
      tokens[index + 2]?.type.label === "`"
    ) {
      ids.add(tokens[index + 1].value);
    }
  };

  for (let index = 0; index < tokens.length; index++) {
    const current = tokens[index];
    const isRequire = current.type.label === "name" && current.value === "require";
    const isImport = current.type.label === "import";
    const previousLabel = tokens[index - 1]?.type.label;
    const isMemberCall = previousLabel === "." || previousLabel === "?.";
    if (!isMemberCall && (isRequire || isImport) && tokens[index + 1]?.type.label === "(") {
      addLiteral(index + 2);
      continue;
    }
    if (isImport && tokens[index + 1]?.type.label === "string") {
      addLiteral(index + 1);
      continue;
    }
    if (!isImport && current.type.label !== "export") {
      continue;
    }
    // Static `import { x } from "pkg"` and `export { x } from "pkg"` forms.
    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      const candidate = tokens[cursor];
      if (candidate.type.label === ";") break;
      if (
        candidate.type.label === "name" &&
        candidate.value === "from" &&
        tokens[cursor + 1]?.type.label === "string"
      ) {
        addLiteral(cursor + 1);
        break;
      }
    }
  }

  return [...ids];
}

export function scanRuntimeExternals(repoRoot) {
  const outputDir = resolve(repoRoot, "dist/main");
  const files = readdirSync(outputDir)
    .filter((name) => name.endsWith(".cjs") || name.endsWith(".mjs"))
    .map((name) => resolve(outputDir, name));

  if (files.length === 0) {
    throw new Error("No bundled output found. Run `pnpm run build` first.");
  }

  const externals = new Set();
  for (const path of files) {
    for (const id of scanModuleIds(readFileSync(path, "utf8"))) {
      if (id.startsWith(".") || id.startsWith("/") || isBuiltin(id)) continue;
      const packageName = packageNameFor(id);
      if (
        !packageName ||
        isBuiltin(packageName) ||
        HOST_PROVIDED_PACKAGES.has(packageName) ||
        OPTIONAL_RUNTIME_PACKAGES.has(packageName)
      ) {
        continue;
      }
      externals.add(packageName);
    }
  }

  return [...externals].sort();
}
