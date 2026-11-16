import { readdirSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RUNTIME_PAYLOAD_PROJECTION_MODULE = "poracode:runtime-payload-projections";
export const RUNTIME_PAYLOAD_PROJECTION_FILE = "persistedRuntimePayload.ts";
export const TOOL_PRESENTATION_ADAPTER_MODULE = "poracode:tool-presentation-adapters";
export const TOOL_PRESENTATION_ADAPTER_FILE = "toolPresentation.ts";

export function runtimePayloadProjectionDirectory(root) {
  return realpathSync(resolve(root, "src/supervisor/agents"));
}

/** Tooling composition only. Node source loaders require file URL imports on Windows. */
export function createRuntimePayloadProjectionSource(root, { fileUrlImports = false } = {}) {
  return createProviderLeafSource(
    root,
    RUNTIME_PAYLOAD_PROJECTION_FILE,
    "runtimePayloadProjection",
    "runtimePayloadProjections",
    fileUrlImports,
  );
}

export function createToolPresentationAdapterSource(root, { fileUrlImports = false } = {}) {
  return createProviderLeafSource(
    root,
    TOOL_PRESENTATION_ADAPTER_FILE,
    "toolPresentationAdapter",
    "toolPresentationAdapters",
    fileUrlImports,
  );
}

function createProviderLeafSource(root, filename, exportName, collectionName, fileUrlImports) {
  const directory = runtimePayloadProjectionDirectory(root);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name, filename);
    if (!existsSync(path)) continue;
    if (realpathSync(path) !== path)
      throw new Error("Payload projection source must not be a link.");
    files.push(path);
  }
  if (files.length > 64) throw new Error("Payload projection module count exceeds64.");
  const source =
    files
      .map(
        (path, index) =>
          `import {${exportName} as p${index}} from ${JSON.stringify(fileUrlImports ? pathToFileURL(path).href : path)};`,
      )
      .join("\n") +
    `\nexport const ${collectionName} = [${files.map((_, index) => "p" + index).join(",")}];\n`;
  return { directory, files, source };
}

/** The source-test loaders share the exact virtual URL and response contract. */
export function resolveRuntimePayloadProjectionModule(specifier) {
  return [RUNTIME_PAYLOAD_PROJECTION_MODULE, TOOL_PRESENTATION_ADAPTER_MODULE].includes(specifier)
    ? { url: specifier, shortCircuit: true }
    : undefined;
}

export function loadRuntimePayloadProjectionModule(url, root) {
  if (![RUNTIME_PAYLOAD_PROJECTION_MODULE, TOOL_PRESENTATION_ADAPTER_MODULE].includes(url))
    return undefined;
  return {
    format: "module",
    shortCircuit: true,
    source: (url === RUNTIME_PAYLOAD_PROJECTION_MODULE
      ? createRuntimePayloadProjectionSource
      : createToolPresentationAdapterSource)(root, { fileUrlImports: true }).source,
  };
}
