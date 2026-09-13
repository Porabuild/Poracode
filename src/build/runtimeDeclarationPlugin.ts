import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { TsdownPlugin } from "tsdown";
import { RUNTIME_BUILD_SOURCE_HASH as SOURCE_HASH_PLACEHOLDER } from "../shared/runtimeBuildIdentity.ts";
import { RUNTIME_CAPTURE_PROTOCOL_VERSION } from "../shared/runtimeCodeManifest.ts";
import {
  SSH_RUNTIME_ENTRY_CONFIG,
  SSH_RUNTIME_MANIFEST_VERSION,
  SUPERVISOR_SETTINGS_SERVICE_VERSION,
  sshRuntimeBuildManifestSchema,
  sshRuntimeManifestFileName,
  type SshRuntimeEntryName,
} from "../shared/sshRuntimeManifest.ts";
import { readRuntimeSourceDeclaration } from "./runtimeSourceDeclaration.ts";

interface RuntimeDeclarationOptions {
  readonly root: string;
  readonly entryPath: string;
  readonly manifestEntry?: SshRuntimeEntryName;
  readonly buildOptions: Readonly<Record<string, unknown>>;
  readonly dependencies: Readonly<Record<string, string>>;
}

function packageName(moduleId: string): string | undefined {
  if (moduleId.startsWith(".") || moduleId.startsWith("/") || isBuiltin(moduleId)) return undefined;
  const parts = moduleId.split("/");
  const name = moduleId.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return name && !isBuiltin(name) ? name : undefined;
}

/** Read the declaration on every build and embed it during output rendering.
 * Input transforms may be cached across rebuilds; their old value must not
 * determine the identity of a newly rendered host or supervisor. */
export function runtimeDeclarationPlugin(options: RuntimeDeclarationOptions): TsdownPlugin {
  const root = realpathSync(options.root);
  const entryPath = resolve(root, options.entryPath);
  const identityPath = resolve(root, "src/shared/runtimeBuildIdentity.ts");
  let declaration: ReturnType<typeof readRuntimeSourceDeclaration> | undefined;
  let renderedIdentity = false;
  return {
    name: `poracode:runtime-declaration:${options.entryPath}`,
    buildStart() {
      declaration = readRuntimeSourceDeclaration(root, options.buildOptions);
      renderedIdentity = false;
      for (const file of declaration.files) this.addWatchFile(file);
    },
    transform(code, id) {
      if (id === entryPath) {
        // Keep the trusted declaration in the actual entry bundle, including
        // side-effect-only entrypoints. No public IPC or facade field is added.
        return {
          code: `${code}\nexport { RUNTIME_BUILD_SOURCE_HASH as __poracodeRuntimeSourceHash } from ${JSON.stringify(identityPath)};\n`,
          map: null,
        };
      }
      if (id === identityPath && declaration) {
        // Rolldown associates watched input dependencies with the transform.
        // Keep that wakeup edge while rendering the value freshly per build.
        for (const file of declaration.files) this.addWatchFile(file);
      }
      return null;
    },
    renderChunk(code) {
      if (!code.includes(SOURCE_HASH_PLACEHOLDER)) return null;
      if (!declaration) throw new Error("Runtime source declaration is missing.");
      if (SOURCE_HASH_PLACEHOLDER.length !== declaration.sourceHash.length)
        throw new Error("Runtime identity replacement must preserve source-map positions.");
      renderedIdentity = true;
      return {
        code: code.replaceAll(SOURCE_HASH_PLACEHOLDER, declaration.sourceHash),
        map: null,
      };
    },
    generateBundle(_output, bundle) {
      if (!declaration || !renderedIdentity)
        throw new Error("Runtime source declaration was not embedded in this build.");
      const current = readRuntimeSourceDeclaration(root, options.buildOptions);
      if (current.sourceHash !== declaration.sourceHash)
        throw new Error("Runtime inputs changed during the build. Rebuild the complete runtime.");
      const declared = new Set(declaration.files);
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of Object.keys(output.modules)) {
          const path = id.split("?")[0]!;
          const local = relative(root, path);
          if (!isAbsolute(path) || path.split(sep).includes("node_modules")) continue;
          if (!declared.has(path))
            throw new Error(
              `Bundled first-party input is outside the runtime declaration: ${local}`,
            );
        }
      }
      const entry = options.manifestEntry;
      if (!entry) return;
      const files = Object.values(bundle)
        .filter((output) => output.type === "chunk")
        .map((output) => ({
          path: output.fileName,
          format: output.fileName.endsWith(".mjs") ? ("module" as const) : ("commonjs" as const),
          bytes: Buffer.byteLength(output.code),
          sha256: createHash("sha256").update(output.code).digest("hex"),
        }))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      const fileSet = new Set(files.map((file) => file.path));
      const dependencies = new Set<string>(SSH_RUNTIME_ENTRY_CONFIG[entry]);
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const imported of [...output.imports, ...output.dynamicImports]) {
          if (fileSet.has(imported)) continue;
          const name = packageName(imported);
          if (name) dependencies.add(name);
        }
      }
      for (const name of dependencies)
        if (!Object.hasOwn(options.dependencies, name))
          throw new Error(`SSH runtime dependency is missing from package.json: ${name}`);
      const manifest = sshRuntimeBuildManifestSchema.parse({
        version: SSH_RUNTIME_MANIFEST_VERSION,
        entry,
        sourceHash: declaration.sourceHash,
        captureProtocolVersion: RUNTIME_CAPTURE_PROTOCOL_VERSION,
        settingsServiceVersion: entry === "supervisor" ? SUPERVISOR_SETTINGS_SERVICE_VERSION : 0,
        files,
        dependencies: [...dependencies].sort(),
        resources: entry === "supervisor" ? declaration.resources : [],
      });
      this.emitFile({
        type: "asset",
        fileName: sshRuntimeManifestFileName(entry),
        source: `${JSON.stringify(manifest)}\n`,
      });
    },
  };
}
