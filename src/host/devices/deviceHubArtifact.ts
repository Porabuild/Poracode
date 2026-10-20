import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  DEVICE_HUB_BOOTSTRAP,
  DEVICE_HUB_LOCKFILE,
  DEVICE_HUB_NATIVE_MODULE_PATH,
  DEVICE_HUB_NATIVE_MODULE_SHA256,
  DEVICE_HUB_NATIVE_PATCH_RECEIPT,
  DEVICE_HUB_NATIVE_RECEIPT_PATH,
  DEVICE_HUB_SCRCPY_PATH,
  DEVICE_HUB_SCRCPY_SHA256,
  deviceHubArtifactSchema,
  type DeviceHubArtifactManifest,
} from "@/shared/deviceHubArtifact";

export interface DeviceHubArtifact {
  root: string;
  entry: string;
  manifest: DeviceHubArtifactManifest;
}

export async function readDeviceHubArtifact(
  resourcesRoot: string,
  signal: AbortSignal,
  target = { platform: process.platform, arch: process.arch, runtimeAbi: process.versions.modules },
): Promise<DeviceHubArtifact | null> {
  signal.throwIfAborted();
  const root = join(resourcesRoot, `${target.platform}-${target.arch}`);
  let manifest: DeviceHubArtifactManifest;
  try {
    const manifestPath = join(root, "manifest.json");
    const info = await lstat(manifestPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) return null;
    manifest = deviceHubArtifactSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error) return null;
    throw error;
  }
  if (
    manifest.platform !== target.platform ||
    manifest.arch !== target.arch ||
    manifest.runtimeAbi !== target.runtimeAbi ||
    (manifest.platform !== "darwin" && manifest.qualifiedPlatforms.includes("ios")) ||
    new Set(manifest.qualifiedPlatforms).size !== manifest.qualifiedPlatforms.length
  )
    return null;
  const paths = new Set(manifest.files.map((file) => file.path));
  const receiptHash = createHash("sha256")
    .update(`${JSON.stringify(DEVICE_HUB_NATIVE_PATCH_RECEIPT)}\n`)
    .digest("hex");
  if (
    paths.size !== manifest.files.length ||
    !paths.has(manifest.entry) ||
    !paths.has(DEVICE_HUB_BOOTSTRAP) ||
    !paths.has(DEVICE_HUB_LOCKFILE) ||
    manifest.files.find((file) => file.path === DEVICE_HUB_NATIVE_MODULE_PATH)?.sha256 !==
      DEVICE_HUB_NATIVE_MODULE_SHA256 ||
    manifest.files.find((file) => file.path === DEVICE_HUB_NATIVE_RECEIPT_PATH)?.sha256 !==
      receiptHash ||
    (manifest.qualifiedPlatforms.includes("android") && !paths.has(DEVICE_HUB_SCRCPY_PATH))
  )
    return null;
  if (
    manifest.qualifiedPlatforms.includes("android") &&
    manifest.files.find((file) => file.path === DEVICE_HUB_SCRCPY_PATH)?.sha256 !==
      DEVICE_HUB_SCRCPY_SHA256
  )
    return null;
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error) return null;
    throw error;
  }
  const directories = [canonicalRoot];
  let members = 0;
  try {
    while (directories.length) {
      signal.throwIfAborted();
      const directory = directories.pop()!;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (++members > 32_768 || entry.isSymbolicLink()) return null;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) directories.push(path);
        else if (
          !entry.isFile() ||
          (path !== join(canonicalRoot, "manifest.json") &&
            !paths.has(relative(canonicalRoot, path).replaceAll("\\", "/")))
        )
          return null;
      }
    }
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error) return null;
    throw error;
  }
  for (const file of manifest.files) {
    signal.throwIfAborted();
    const path = join(canonicalRoot, file.path);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) return null;
      const tail = relative(canonicalRoot, await realpath(path));
      if (isAbsolute(tail) || tail.split(/[\\/]/u).includes("..")) return null;
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
      if (hash.digest("hex") !== file.sha256) return null;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error) return null;
      throw error;
    }
  }
  signal.throwIfAborted();
  return { root: canonicalRoot, entry: join(canonicalRoot, manifest.entry), manifest };
}
