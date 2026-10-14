import { createHash } from "node:crypto";
import { join } from "node:path";
import { msg } from "@/shared/messages";
import { readBoundedRuntimeFileSync } from "@/shared/readBoundedRuntimeFile";
import { RUNTIME_MANIFEST_MAX_BYTES, type RuntimeCodeFile } from "@/shared/runtimeCodeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import {
  SSH_RUNTIME_ENTRY_NAMES,
  SUPERVISOR_SETTINGS_SERVICE_VERSION,
  sshRuntimeBuildManifestSchema,
  sshRuntimeManifestFileName,
  type RuntimeResourceIdentity,
} from "@/shared/sshRuntimeManifest";

export interface RuntimeBuildManifests {
  readonly files: readonly RuntimeCodeFile[];
  readonly dependencies: readonly string[];
  readonly manifestFiles: readonly string[];
  readonly resources: readonly RuntimeResourceIdentity[];
  readonly digest: string;
}

/** Runs before either archive cache lookup. A cached path cannot hide an old
 * manifest or a partially rebuilt runtime declaration. */
export function readRuntimeBuildManifests(mainBundleDir: string): RuntimeBuildManifests {
  const files = new Map<string, RuntimeCodeFile>();
  const dependencies = new Set<string>();
  const resources = new Map<string, RuntimeResourceIdentity>();
  const manifestFiles: string[] = [];
  const digest = createHash("sha256");
  for (const entry of SSH_RUNTIME_ENTRY_NAMES) {
    const name = sshRuntimeManifestFileName(entry);
    const path = join(mainBundleDir, name);
    try {
      const bytes = readBoundedRuntimeFileSync(path, RUNTIME_MANIFEST_MAX_BYTES);
      const manifest = sshRuntimeBuildManifestSchema.parse(
        JSON.parse(bytes.toString("utf8")) as unknown,
      );
      if (
        manifest.entry !== entry ||
        manifest.sourceHash !== RUNTIME_BUILD_SOURCE_HASH ||
        manifest.settingsServiceVersion !==
          (entry === "supervisor" ? SUPERVISOR_SETTINGS_SERVICE_VERSION : 0)
      )
        throw new Error("Runtime build declaration differs.");
      for (const file of manifest.files) {
        const previous = files.get(file.path);
        if (previous && JSON.stringify(previous) !== JSON.stringify(file))
          throw new Error("Runtime manifests disagree about a shared chunk.");
        files.set(file.path, file);
      }
      for (const resource of manifest.resources) {
        const previous = resources.get(resource.kind);
        if (previous && previous.sha256 !== resource.sha256)
          throw new Error("Runtime manifests disagree about a resource.");
        resources.set(resource.kind, resource);
      }
      for (const dependency of manifest.dependencies) dependencies.add(dependency);
      digest
        .update(name + "\0")
        .update(bytes)
        .update("\0");
      manifestFiles.push(name);
    } catch (error) {
      throw new Error(msg("ssh.runtimeManifest.invalid", { path }), { cause: error });
    }
  }
  return {
    files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    dependencies: [...dependencies].sort(),
    resources: [...resources.values()],
    manifestFiles,
    digest: digest.digest("hex"),
  };
}

export function verifyRuntimeBuildCode(
  mainBundleDir: string,
  files: readonly RuntimeCodeFile[],
): void {
  for (const file of files) {
    const path = join(mainBundleDir, file.path);
    const bytes = readBoundedRuntimeFileSync(path, file.bytes);
    if (
      bytes.length !== file.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw new Error(msg("ssh.runtimeManifest.invalid", { path }));
  }
}
