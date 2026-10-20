#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { npmInvocation } from "./server-host-tools.mjs";
import {
  DEVICE_HUB_ARTIFACT_VERSION,
  DEVICE_HUB_BOOTSTRAP,
  DEVICE_HUB_CLIENT_ADAPTER_VERSION,
  DEVICE_HUB_CLIENT_INTEGRITY,
  DEVICE_HUB_CLIENT_PATCH_SHA256,
  DEVICE_HUB_CLIENT_VERSION,
  DEVICE_HUB_ENTRY,
  DEVICE_HUB_LOCKFILE,
  DEVICE_HUB_NATIVE_MODULE_PATH,
  DEVICE_HUB_NATIVE_MODULE_SHA256,
  DEVICE_HUB_NATIVE_PATCH_RECEIPT,
  DEVICE_HUB_NATIVE_PATCH_SHA256,
  DEVICE_HUB_NATIVE_RECEIPT_PATH,
  DEVICE_HUB_NATIVE_UPSTREAM_SHA256,
  DEVICE_HUB_PACKAGE_INTEGRITY,
  DEVICE_HUB_QUALIFIED_TARGETS,
  DEVICE_HUB_SCRCPY_PATH,
  DEVICE_HUB_SCRCPY_SHA256,
  DEVICE_HUB_SCRCPY_VERSION,
  DEVICE_HUB_SOURCE_COMMIT,
  DEVICE_HUB_VERSION,
  deviceHubArtifactSchema,
} from "../src/shared/deviceHubArtifact.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function inside(root, path) {
  const tail = relative(root, path);
  return tail !== "" && !isAbsolute(tail) && !tail.split(/[\\/]/u).includes("..");
}

// No installer, downloader, postinstall or compiler runs here. The dedicated
// toolchain must already have been installed from its committed frozen lock.
export async function prepareDeviceHub(options) {
  const source = resolve(options.source ?? join(repoRoot, "scripts", "device-hub-runtime"));
  const output = resolve(options.output ?? join(repoRoot, "resources", "device-hub"));
  const platform = process.platform;
  const arch = process.arch;
  const runtimeAbi = options.runtimeAbi ?? process.versions.modules;
  if (!/^[0-9]{1,6}$/u.test(runtimeAbi))
    throw new Error("A numeric target Node/Electron ABI is required.");
  const lockBytes = await readFile(join(source, DEVICE_HUB_LOCKFILE));
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const lockedHub = lock.packages?.["node_modules/expo-device-hub"];
  if (
    lock.lockfileVersion !== 3 ||
    lock.packages?.[""]?.dependencies?.["expo-device-hub"] !== DEVICE_HUB_VERSION ||
    lockedHub?.version !== DEVICE_HUB_VERSION ||
    lockedHub.integrity !== DEVICE_HUB_PACKAGE_INTEGRITY
  )
    throw new Error("The device Hub toolchain must use its pinned version-3 package lock.");
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (
      path &&
      (entry.link ||
        typeof entry.integrity !== "string" ||
        !/^sha512-/u.test(entry.integrity) ||
        typeof entry.resolved !== "string" ||
        !entry.resolved.startsWith("https://registry.npmjs.org/"))
    )
      throw new Error(
        "The Hub dependency closure must contain only integrity-pinned npm registry packages.",
      );
  }
  const hub = JSON.parse(
    await readFile(join(source, "node_modules", "expo-device-hub", "package.json"), "utf8"),
  );
  if (hub.name !== "expo-device-hub" || hub.version !== DEVICE_HUB_VERSION)
    throw new Error("The installed Hub differs from its pinned toolchain.");
  const patch = await readFile(
    join(repoRoot, "patches", `@expo__hub-client@${DEVICE_HUB_CLIENT_VERSION}.patch`),
  );
  if (sha256(patch) !== DEVICE_HUB_CLIENT_PATCH_SHA256)
    throw new Error("The public-client adaptation pin is stale.");
  const scrcpy = await readFile(resolve(options.scrcpyServer));
  if (scrcpy.length > 1024 * 1024 || sha256(scrcpy) !== DEVICE_HUB_SCRCPY_SHA256)
    throw new Error("The scrcpy v4.0 server differs from its published SHA-256.");
  const qualifiedPlatforms = [
    ...(DEVICE_HUB_QUALIFIED_TARGETS.find(
      (target) =>
        target.platform === platform && target.arch === arch && target.runtimeAbi === runtimeAbi,
    )?.platforms ?? []),
  ];
  const scratch = resolve(options.scratch ?? join(repoRoot, ".tmp"));
  await mkdir(scratch, { recursive: true });
  const stage = await mkdtemp(join(scratch, "device-hub-stage-"));
  const files = [];
  async function write(path, bytes, mode) {
    const destination = join(stage, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, mode === undefined ? undefined : { mode });
    files.push({ path, sha256: sha256(bytes) });
  }
  async function copyTree(from, to) {
    for (const entry of (await readdir(from, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (entry.name === ".bin") continue;
      const sourcePath = join(from, entry.name);
      const targetPath = `${to}/${entry.name}`;
      // The server imports serve-sim's JS on every host; only these native
      // CoreSimulator payloads are exclusive to macOS.
      if (
        platform !== "darwin" &&
        ["bin", "native", "simcam"].some(
          (directory) =>
            targetPath === `node_modules/expo-device-hub/vendor/serve-sim/dist/${directory}`,
        )
      )
        continue;
      if (entry.isSymbolicLink())
        throw new Error("The staged Hub closure cannot contain symbolic links.");
      if (entry.isDirectory()) await copyTree(sourcePath, targetPath);
      else if (entry.isFile()) {
        const info = await lstat(sourcePath);
        await write(targetPath, await readFile(sourcePath), info.mode);
      } else throw new Error("The staged Hub closure contains a non-file member.");
      if (files.length > 16_380)
        throw new Error("The Hub closure exceeds its manifest file budget.");
    }
  }
  await copyTree(join(source, "node_modules"), "node_modules");
  const nativePatchPath = join(repoRoot, "patches", `expo-device-hub@${DEVICE_HUB_VERSION}.patch`);
  if (
    sha256(await readFile(nativePatchPath)) !== DEVICE_HUB_NATIVE_PATCH_SHA256 ||
    sha256(await readFile(join(stage, DEVICE_HUB_NATIVE_MODULE_PATH))) !==
      DEVICE_HUB_NATIVE_UPSTREAM_SHA256
  )
    throw new Error("The native Hub patch or pristine upstream module differs from its pin.");
  const patchRoot = inside(repoRoot, stage) ? repoRoot : stage;
  const patchDirectory = relative(
    patchRoot,
    join(stage, "node_modules", "expo-device-hub"),
  ).replaceAll("\\", "/");
  execFileSync("git", ["apply", "--check", "--directory", patchDirectory, nativePatchPath], {
    cwd: patchRoot,
    windowsHide: true,
  });
  execFileSync("git", ["apply", "--directory", patchDirectory, nativePatchPath], {
    cwd: patchRoot,
    windowsHide: true,
  });
  const nativeModule = files.find((file) => file.path === DEVICE_HUB_NATIVE_MODULE_PATH);
  const nativeHash = sha256(await readFile(join(stage, DEVICE_HUB_NATIVE_MODULE_PATH)));
  if (!nativeModule || nativeHash !== DEVICE_HUB_NATIVE_MODULE_SHA256)
    throw new Error("The patched native Hub module differs from its pin.");
  nativeModule.sha256 = nativeHash;
  await write(
    DEVICE_HUB_NATIVE_RECEIPT_PATH,
    `${JSON.stringify(DEVICE_HUB_NATIVE_PATCH_RECEIPT)}\n`,
  );
  // The npm publication omits this asset. Supplying the verified build-time
  // copy prevents serve-emu's lazy network download during a preview.
  const previousScrcpy = files.findIndex((file) => file.path === DEVICE_HUB_SCRCPY_PATH);
  if (previousScrcpy !== -1) files.splice(previousScrcpy, 1);
  await write(DEVICE_HUB_SCRCPY_PATH, scrcpy);
  await write(
    DEVICE_HUB_BOOTSTRAP,
    await readFile(join(repoRoot, "resources", "device-hub", DEVICE_HUB_BOOTSTRAP)),
  );
  await write(DEVICE_HUB_LOCKFILE, lockBytes);
  // Keep the complete upstream license/NOTICE files in the copied packages.
  await write("licenses/scrcpy-Apache-2.0.txt", await readFile(join(repoRoot, "LICENSE")));
  const manifest = deviceHubArtifactSchema.parse({
    version: DEVICE_HUB_ARTIFACT_VERSION,
    adapterVersion: DEVICE_HUB_CLIENT_ADAPTER_VERSION,
    hubVersion: DEVICE_HUB_VERSION,
    clientVersion: DEVICE_HUB_CLIENT_VERSION,
    sourceCommit: DEVICE_HUB_SOURCE_COMMIT,
    packageIntegrity: DEVICE_HUB_PACKAGE_INTEGRITY,
    clientIntegrity: DEVICE_HUB_CLIENT_INTEGRITY,
    clientPatchSha256: DEVICE_HUB_CLIENT_PATCH_SHA256,
    scrcpyVersion: DEVICE_HUB_SCRCPY_VERSION,
    scrcpySha256: DEVICE_HUB_SCRCPY_SHA256,
    platform,
    arch,
    runtimeAbi,
    qualifiedPlatforms,
    entry: DEVICE_HUB_ENTRY,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  });
  if (!files.some((file) => file.path === manifest.entry))
    throw new Error("The Hub CLI entry is missing.");
  await writeFile(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const target = join(output, `${platform}-${arch}`);
  if (!inside(output, target))
    throw new Error("The device Hub destination escaped its resource root.");
  await mkdir(output, { recursive: true });
  let previous;
  try {
    const targetInfo = await lstat(target);
    if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink())
      throw new Error("Refusing to replace a linked or non-directory Hub resource target.");
    const previousManifest = JSON.parse(await readFile(join(target, "manifest.json"), "utf8"));
    // Artifact 1 has the same manifest fields and the untrimmed native payloads.
    // It can be replaced atomically, but is no longer admitted by the host.
    if (previousManifest.version !== 1 && previousManifest.version !== DEVICE_HUB_ARTIFACT_VERSION)
      throw new Error("Refusing to replace an unknown Hub artifact version.");
    const current = deviceHubArtifactSchema.parse({
      ...previousManifest,
      version: DEVICE_HUB_ARTIFACT_VERSION,
    });
    if (current.platform !== platform || current.arch !== arch)
      throw new Error("The existing artifact target differs.");
    previous = join(scratch, `device-hub-previous-${randomUUID()}`);
    await rename(target, previous);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // Do not replace a non-artifact directory, even if its manifest is absent.
    try {
      await lstat(target);
      throw new Error("Refusing to replace an unrecognized Hub resource directory.", {
        cause: error,
      });
    } catch (missing) {
      if (missing.code !== "ENOENT") throw missing;
    }
  }
  try {
    await rename(stage, target);
  } catch (error) {
    if (previous) await rename(previous, target);
    throw error;
  }
  return {
    target,
    qualifiedPlatforms,
    manifestSha256: sha256(await readFile(join(target, "manifest.json"))),
    previous,
  };
}

// Release-only orchestration: installations/downloads stay in the disposable
// packaging stage. The host still consumes only a complete verified artifact.
export async function preparePackagedDeviceHub(stageRoot, target, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  const arch = dependencies.arch ?? process.arch;
  const packagePlatform = { win32: "win", darwin: "mac", linux: "linux" }[platform];
  const candidates = DEVICE_HUB_QUALIFIED_TARGETS.filter(
    (entry) => entry.platform === platform && entry.arch === arch,
  );
  if (target.platform !== packagePlatform || !target.arches.includes(arch) || !candidates.length)
    return { qualifiedPlatforms: [] };

  const run = dependencies.run ?? execFileSync;
  const require = createRequire(join(stageRoot, "node_modules", "electron", "package.json"));
  const electron = require("./");
  const identity = JSON.parse(
    String(
      run(
        electron,
        [
          "-p",
          "JSON.stringify({platform:process.platform,arch:process.arch,abi:process.versions.modules})",
        ],
        {
          cwd: stageRoot,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          encoding: "utf8",
          timeout: 10000,
        },
      ),
    ).trim(),
  );
  if (
    identity.platform !== platform ||
    identity.arch !== arch ||
    !candidates.some((entry) => entry.runtimeAbi === identity.abi)
  )
    return { qualifiedPlatforms: [] };

  const source = await mkdtemp(join(stageRoot, ".device-hub-toolchain-"));
  try {
    for (const file of ["package.json", DEVICE_HUB_LOCKFILE])
      await copyFile(join(repoRoot, "scripts", "device-hub-runtime", file), join(source, file));
    const npm = npmInvocation(["ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"]);
    run(npm.command, npm.args, {
      cwd: source,
      shell: npm.shell,
      stdio: "inherit",
      timeout: 120000,
    });

    const fetch = dependencies.fetch ?? globalThis.fetch;
    const response = await fetch(
      `https://github.com/Genymobile/scrcpy/releases/download/v${DEVICE_HUB_SCRCPY_VERSION}/scrcpy-server-v${DEVICE_HUB_SCRCPY_VERSION}`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Unable to fetch the pinned scrcpy server.");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 1024 * 1024)
          throw new Error("The pinned scrcpy server exceeds its size limit.");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const scrcpyServer = join(source, `scrcpy-server-v${DEVICE_HUB_SCRCPY_VERSION}`);
    await writeFile(scrcpyServer, Buffer.concat(chunks));
    const output = join(stageRoot, "resources", "device-hub");
    // Discard only the stage's copied generated cache, never checkout artifacts.
    await rm(output, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
    const stage = dependencies.stage ?? prepareDeviceHub;
    return await stage({
      source,
      output,
      scrcpyServer,
      runtimeAbi: identity.abi,
      scratch: join(source, ".tmp"),
    });
  } finally {
    await rm(source, { recursive: true, force: true, maxRetries: 8, retryDelay: 50 });
  }
}

async function main() {
  const options = {};
  const names = {
    "--source": "source",
    "--output": "output",
    "--runtime-abi": "runtimeAbi",
    "--scrcpy-server": "scrcpyServer",
  };
  for (let index = 2; index < process.argv.length; index++) {
    const name = names[process.argv[index]];
    const value = process.argv[++index];
    if (!name || !value)
      throw new Error(
        "Use --source, --output, --runtime-abi and --scrcpy-server <local verified asset>.",
      );
    options[name] = value;
  }
  if (!options.scrcpyServer)
    throw new Error("--scrcpy-server must name the pre-fetched official pinned v4.0 asset.");
  const result = await prepareDeviceHub(options);
  console.log(
    `[device-hub] staged ${result.target}; qualified: ${result.qualifiedPlatforms.join(", ") || "none"}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
