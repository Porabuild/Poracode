import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SSH_RUNTIME_MANIFEST_VERSION } from "@/shared/sshRuntimeManifest";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { verifyRuntimeResources } from "@/shared/runtimeResourceInventory";
import {
  RUNTIME_CODE_MAX_FILE_BYTES,
  RUNTIME_MANIFEST_MAX_BYTES,
} from "@/shared/runtimeCodeManifest";
import { readBoundedRuntimeFile } from "@/shared/readBoundedRuntimeFile";
import { readRuntimeBuildManifests, type RuntimeBuildManifests } from "./runtimeBuildManifests";
import {
  hashRuntimeDirectoryAsync,
  regularArchiveExistsAsync,
  runtimeStatSignatureAsync,
  stageRuntimeDirectoryAsync,
  stageRuntimeFileAsync,
  verifyRuntimeBuildCodeAsync,
  writeFileAtomicAsync,
} from "./runtimeBundleFilesAsync";
import { readPreassembledSshRuntimeArchive } from "./runtimeArchive";
import {
  manifestPath,
  readBundleManifest,
  runtimePackageJson,
  sshRuntimeVersion,
  type BundleManifest,
  type SshRuntimeBundle,
  type SshRuntimeBundleOptions,
} from "./runtimeBundleShared";

/**
 * Asynchronous runtime-bundle builder for the off-main SSH utility (C3/A5).
 *
 * Same content-addressed contract as the synchronous build-script core, with
 * every stage abortable and no synchronous multi-MB I/O: a release-shipped
 * immutable archive is preferred when it matches this build, otherwise the
 * stage/hash/tar work happens in the worker process.
 */
export interface SshRuntimeBundleAsyncOptions extends SshRuntimeBundleOptions {
  readonly preassembledArchiveDir?: string;
  readonly signal?: AbortSignal;
}

export interface SshRuntimeBundleAsyncResult extends SshRuntimeBundle {
  readonly source: "preassembled" | "staged";
}

let cachedBundle: {
  readonly key: string;
  readonly hash: string;
  readonly version: string;
  readonly source: "preassembled" | "staged";
} | null = null;

/** Test-only: forget the in-memory bundle cache between fixtures. */
export function resetSshRuntimeBundleAsyncCache(): void {
  cachedBundle = null;
}

export async function ensureSshRuntimeBundleAsync(
  options: SshRuntimeBundleAsyncOptions,
): Promise<SshRuntimeBundleAsyncResult> {
  const signal = options.signal;
  signal?.throwIfAborted();

  const preassembled = await readPreassembledSshRuntimeArchive(
    options.preassembledArchiveDir,
    signal,
  );
  if (preassembled.bundle) return { ...preassembled.bundle, source: "preassembled" };

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
    options.preassembledArchiveDir ?? null,
  ]);
  if (cachedBundle?.key === cacheKey) {
    const archivePath = join(options.cacheDir, `${cachedBundle.hash}.tar.gz`);
    if (await regularArchiveExistsAsync(archivePath)) {
      return {
        archivePath,
        hash: cachedBundle.hash,
        version: cachedBundle.version,
        source: cachedBundle.source,
      };
    }
  }

  const runtimePackage = runtimePackageJson(buildManifest.dependencies);
  const signature = await runtimeStatSignatureAsync(
    [
      ...buildManifest.manifestFiles.map((file) => join(options.mainBundleDir, file)),
      ...buildManifest.files.map((file) => join(options.mainBundleDir, file.path)),
      options.agentPluginsDir,
      options.wslHelpersDir,
      ...(options.bundledSkillsDir ? [options.bundledSkillsDir] : []),
      ...(options.bundledPluginsDir ? [options.bundledPluginsDir] : []),
    ],
    runtimePackage,
    signal,
  );
  const manifest = readBundleManifest(options.cacheDir);
  if (manifest && manifest.key === cacheKey && manifest.signature === signature) {
    const archivePath = join(options.cacheDir, `${manifest.hash}.tar.gz`);
    if (await regularArchiveExistsAsync(archivePath)) {
      cachedBundle = {
        key: cacheKey,
        hash: manifest.hash,
        version: sshRuntimeVersion(),
        source: "staged",
      };
      return { archivePath, hash: manifest.hash, version: sshRuntimeVersion(), source: "staged" };
    }
  }

  for (const file of buildManifest.files) {
    if (!existsSync(join(options.mainBundleDir, file.path))) {
      throw new Error("Poracode SSH runtime asset is missing from the build.");
    }
  }
  if (!existsSync(options.agentPluginsDir)) {
    throw new Error("Poracode SSH agent plugins are missing from the build.");
  }
  await assertHeadlessServerBundleAsync(join(options.mainBundleDir, "server.cjs"), signal);
  await verifyRuntimeBuildCodeAsync(options.mainBundleDir, buildManifest.files, signal);

  await stageBundle(options, buildManifest, runtimePackage, signature, cacheKey, signal);
  const staged = cachedBundle;
  if (!staged || staged.key !== cacheKey)
    throw new Error("Runtime bundle staging did not complete.");
  return {
    archivePath: join(options.cacheDir, `${staged.hash}.tar.gz`),
    hash: staged.hash,
    version: staged.version,
    source: "staged",
  };
}

async function stageBundle(
  options: SshRuntimeBundleAsyncOptions,
  buildManifest: RuntimeBuildManifests,
  runtimePackage: string,
  signature: string,
  cacheKey: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  await mkdir(options.cacheDir, { recursive: true });
  const stage = await mkdtemp(join(options.cacheDir, "stage-"));
  try {
    for (const file of buildManifest.files) {
      signal?.throwIfAborted();
      await stageRuntimeFileAsync(
        join(options.mainBundleDir, file.path),
        join(stage, file.path),
        file.bytes,
        signal,
      );
    }
    for (const file of buildManifest.manifestFiles) {
      signal?.throwIfAborted();
      await stageRuntimeFileAsync(
        join(options.mainBundleDir, file),
        join(stage, file),
        RUNTIME_MANIFEST_MAX_BYTES,
        signal,
      );
    }
    await stageRuntimeDirectoryAsync(options.agentPluginsDir, join(stage, "agent-plugins"), signal);
    await stageRuntimeDirectoryAsync(options.wslHelpersDir, join(stage, "wsl-helpers"), signal);
    await stageRuntimeDirectoryAsync(options.bundledSkillsDir, join(stage, "skills"), signal);
    await stageRuntimeDirectoryAsync(options.bundledPluginsDir, join(stage, "plugins"), signal);
    await writeFileAtomicAsync(join(stage, "package.json"), runtimePackage, { encoding: "utf8" });

    // Verify the captured stage as well as the mutable source: a replacement
    // during copy cannot create an archive whose own manifest describes other bytes.
    const stagedManifest = readRuntimeBuildManifests(stage);
    if (stagedManifest.digest !== buildManifest.digest)
      throw new Error("Runtime manifest changed during archive staging.");
    await verifyRuntimeBuildCodeAsync(stage, buildManifest.files, signal);
    verifyRuntimeResources(buildManifest.resources, {
      agentPlugins: { path: join(stage, "agent-plugins"), layout: "staged" },
      bundledPlugins: join(stage, "plugins"),
    });

    signal?.throwIfAborted();
    const hash = await hashRuntimeDirectoryAsync(stage, signal);
    const archivePath = join(options.cacheDir, `${hash}.tar.gz`);
    if (!(await regularArchiveExistsAsync(archivePath))) {
      await createArchive(
        options.tarCommand ?? (process.platform === "win32" ? "tar.exe" : "tar"),
        `${hash}.tar.gz`,
        stage,
        options.cacheDir,
        signal,
      );
    }
    cachedBundle = { key: cacheKey, hash, version: sshRuntimeVersion(), source: "staged" };
    try {
      const manifest: BundleManifest = { key: cacheKey, signature, hash };
      await writeFileAtomicAsync(manifestPath(options.cacheDir), `${JSON.stringify(manifest)}\n`, {
        encoding: "utf8",
      });
    } catch {
      // Best-effort: without the manifest the next app start just rebuilds.
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function assertHeadlessServerBundleAsync(path: string, signal?: AbortSignal): Promise<void> {
  const source = (await readBoundedRuntimeFile(path, RUNTIME_CODE_MAX_FILE_BYTES, signal)).toString(
    "utf8",
  );
  if (/\brequire\(["']electron["']\)|\bimport\(["']electron["']\)/.test(source)) {
    throw new Error(
      "Poracode Helper cannot include Electron. Check the standalone server import graph.",
    );
  }
}

/**
 * Spawn tar and join it on abort. The archive is written to a path relative to
 * `cwd` so GNU tar on Windows never reads the `C:\…` path as an rsh host spec.
 */
async function createArchive(
  command: string,
  archiveName: string,
  stage: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, ["-czf", archiveName, "-C", stage, "."], {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (killTimer !== null) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      if (settled) return;
      child.kill();
      killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      killTimer.unref?.();
    };
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(-4_096);
    });
    child.once("error", (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
    child.once("exit", (code) => {
      if (settled) return;
      if (signal?.aborted) {
        fail(
          signal.reason instanceof Error
            ? signal.reason
            : new Error("Runtime archive was cancelled."),
        );
        return;
      }
      if (code === 0) {
        settled = true;
        cleanup();
        resolve();
        return;
      }
      fail(new Error(stderr.trim() || `tar exited with code ${code ?? "unknown"}.`));
    });
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
