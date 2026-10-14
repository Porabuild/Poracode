import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SSH_RUNTIME_MANIFEST_VERSION } from "@/shared/sshRuntimeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { verifyRuntimeResources } from "@/shared/runtimeResourceInventory";
import { writeFileAtomic } from "@/shared/atomicFile";
import { RUNTIME_MANIFEST_MAX_BYTES } from "@/shared/runtimeCodeManifest";
import {
  hashRuntimeDirectory,
  regularArchiveExists,
  runtimeStatSignature,
  stageRuntimeDirectory,
  stageRuntimeFile,
} from "./runtimeBundleFiles";
import { readRuntimeBuildManifests, verifyRuntimeBuildCode } from "./runtimeBuildManifests";
import {
  assertHeadlessServerBundle,
  manifestPath,
  readBundleManifest,
  runtimePackageJson,
  sshRuntimeVersion,
  type BundleManifest,
  type SshRuntimeBundle,
  type SshRuntimeBundleOptions,
} from "./runtimeBundleShared";

export type { SshRuntimeBundle, SshRuntimeBundleOptions } from "./runtimeBundleShared";

// The staged runtime is fixed for a given app build, so the archive+hash is
// identical on every connect. Cache it per option set (keyed by the source
// dirs) in memory AND in a manifest file next to the archive, so repeat
// connects — including the first one after an app restart, when connectAll()
// fans out across persisted SSH servers — skip the multi-MB copy + full-file
// hashing. Self-heals if the cached archive is later cleaned up on disk.
let cachedBundle: {
  readonly key: string;
  readonly hash: string;
  readonly version: string;
} | null = null;

export function ensureSshRuntimeBundle(options: SshRuntimeBundleOptions): SshRuntimeBundle {
  const buildManifest = readRuntimeBuildManifests(options.mainBundleDir);
  if (buildManifest.resources.length > 0) {
    if (!options.bundledPluginsDir)
      throw new Error("Bundled runtime plugins are required by the build declaration.");
    verifyRuntimeResources(buildManifest.resources, {
      agentPlugins: { path: options.agentPluginsDir, layout: "staged" },
      bundledPlugins: options.bundledPluginsDir,
    });
  }
  const cacheKey = JSON.stringify([
    SSH_RUNTIME_MANIFEST_VERSION,
    RUNTIME_BUILD_SOURCE_HASH,
    buildManifest.digest,
    options.mainBundleDir,
    options.agentPluginsDir,
    options.wslHelpersDir,
    options.bundledSkillsDir ?? null,
    options.bundledPluginsDir ?? null,
    options.cacheDir,
    options.tarCommand ?? null,
  ]);
  if (cachedBundle?.key === cacheKey) {
    const archivePath = join(options.cacheDir, `${cachedBundle.hash}.tar.gz`);
    if (regularArchiveExists(archivePath)) {
      return { archivePath, hash: cachedBundle.hash, version: cachedBundle.version };
    }
  }

  const runtimePackage = runtimePackageJson(buildManifest.dependencies);
  const signature = runtimeStatSignature(
    [
      ...buildManifest.manifestFiles.map((file) => join(options.mainBundleDir, file)),
      ...buildManifest.files.map((file) => join(options.mainBundleDir, file.path)),
      options.agentPluginsDir,
      options.wslHelpersDir,
      ...(options.bundledSkillsDir ? [options.bundledSkillsDir] : []),
      ...(options.bundledPluginsDir ? [options.bundledPluginsDir] : []),
    ],
    runtimePackage,
  );
  const manifest = readBundleManifest(options.cacheDir);
  if (manifest && manifest.key === cacheKey && manifest.signature === signature) {
    const archivePath = join(options.cacheDir, `${manifest.hash}.tar.gz`);
    if (regularArchiveExists(archivePath)) {
      cachedBundle = { key: cacheKey, hash: manifest.hash, version: sshRuntimeVersion() };
      return { archivePath, hash: manifest.hash, version: sshRuntimeVersion() };
    }
  }

  for (const file of buildManifest.files) {
    const source = join(options.mainBundleDir, file.path);
    if (!existsSync(source)) {
      throw new Error(`Poracode SSH runtime asset is missing: ${source}`);
    }
  }
  if (!existsSync(options.agentPluginsDir)) {
    throw new Error(`Poracode SSH agent plugins are missing: ${options.agentPluginsDir}`);
  }
  assertHeadlessServerBundle(join(options.mainBundleDir, "server.cjs"));
  verifyRuntimeBuildCode(options.mainBundleDir, buildManifest.files);

  mkdirSync(options.cacheDir, { recursive: true });
  const stage = mkdtempSync(join(options.cacheDir, "stage-"));
  try {
    for (const file of buildManifest.files)
      stageRuntimeFile(join(options.mainBundleDir, file.path), join(stage, file.path), file.bytes);
    for (const file of buildManifest.manifestFiles)
      stageRuntimeFile(
        join(options.mainBundleDir, file),
        join(stage, file),
        RUNTIME_MANIFEST_MAX_BYTES,
      );
    stageRuntimeDirectory(options.agentPluginsDir, join(stage, "agent-plugins"));
    stageRuntimeDirectory(options.wslHelpersDir, join(stage, "wsl-helpers"));
    stageRuntimeDirectory(options.bundledSkillsDir, join(stage, "skills"));
    stageRuntimeDirectory(options.bundledPluginsDir, join(stage, "plugins"));
    writeFileAtomic(join(stage, "package.json"), runtimePackage, { encoding: "utf8" });

    // Verify the captured stage as well as the mutable source. A replacement
    // during copy cannot create an archive whose own manifest describes other bytes.
    const stagedManifest = readRuntimeBuildManifests(stage);
    if (stagedManifest.digest !== buildManifest.digest)
      throw new Error("Runtime manifest changed during archive staging.");
    verifyRuntimeBuildCode(stage, buildManifest.files);
    verifyRuntimeResources(buildManifest.resources, {
      agentPlugins: { path: join(stage, "agent-plugins"), layout: "staged" },
      bundledPlugins: join(stage, "plugins"),
    });

    const hash = hashRuntimeDirectory(stage);
    const archivePath = join(options.cacheDir, `${hash}.tar.gz`);
    if (!regularArchiveExists(archivePath)) {
      // Name the archive relative to cacheDir (the process cwd) so GNU tar on
      // Windows doesn't read the `C:\…` drive-letter path as an rsh `host:file`
      // spec ("Cannot connect to C:"). bsdtar treats the relative name the same,
      // so this stays correct across tar flavors without a flavor-specific flag.
      execFileSync(
        options.tarCommand ?? (process.platform === "win32" ? "tar.exe" : "tar"),
        ["-czf", `${hash}.tar.gz`, "-C", stage, "."],
        { cwd: options.cacheDir },
      );
    }
    cachedBundle = { key: cacheKey, hash, version: sshRuntimeVersion() };
    try {
      writeFileAtomic(
        manifestPath(options.cacheDir),
        `${JSON.stringify({ key: cacheKey, signature, hash } satisfies BundleManifest)}\n`,
        { encoding: "utf8" },
      );
    } catch {
      // Best-effort: without the manifest the next app start just rebuilds.
    }
    return { archivePath, hash, version: sshRuntimeVersion() };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
