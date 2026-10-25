import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SERVICE_LAUNCHER_FILENAME,
  SERVICE_LAUNCHER_MANIFEST_VERSION,
  SERVICE_LAUNCHER_MAX_BYTES,
  SERVICE_LAUNCHER_PROTOCOL_VERSION,
  SERVICE_LAUNCHER_VERSION,
  serviceLauncherManifestSchema,
} from "../src/shared/contracts/serverServiceLauncher.ts";
import { readBoundedRuntimeFileSync } from "../src/shared/readBoundedRuntimeFile.ts";
import { isWindowsGuiExecutable } from "../src/shared/windowsGuiExecutable.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function prepareServiceLauncher({
  outDir = join(repoRoot, "resources", "service-launcher"),
  run = execFileSync,
} = {}) {
  const architecture = process.arch;
  if (process.platform !== "win32" || !["x64", "arm64"].includes(architecture))
    throw new Error(
      "Build the service launcher on native Windows for x64 or arm64; no target is downloaded implicitly.",
    );
  const source = join(repoRoot, "native", "server-service-launcher", "main.rs");
  const sourceSha256 = hash(readFileSync(source));
  const target = `win32-${architecture}`;
  const directory = join(resolve(outDir), target);
  const manifestPath = join(resolve(outDir), "manifest.json");
  if (existsSync(manifestPath)) {
    if (!lstatSync(manifestPath).isFile())
      throw new Error("Preserve the non-file launcher manifest.");
    serviceLauncherManifestSchema.parse(
      JSON.parse(readBoundedRuntimeFileSync(manifestPath, 16_384).toString("utf8")),
    );
  }
  mkdirSync(directory, { recursive: true });
  const pending = join(directory, `${SERVICE_LAUNCHER_FILENAME}.pending.exe`);
  if (existsSync(pending))
    throw new Error("A partial launcher build exists; preserve and inspect it.");
  const triple = architecture === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc";
  run(
    "rustc",
    [
      "--edition=2024",
      "--crate-name",
      "poracode_service_launcher",
      "--target",
      triple,
      "-D",
      "warnings",
      "-C",
      "opt-level=2",
      "-C",
      "debuginfo=0",
      source,
      "-o",
      pending,
    ],
    { windowsHide: true, stdio: "pipe" },
  );
  const bytes = readBoundedRuntimeFileSync(pending, SERVICE_LAUNCHER_MAX_BYTES);
  if (!isWindowsGuiExecutable(bytes, target, SERVICE_LAUNCHER_MAX_BYTES))
    throw new Error("Compiler output is not the selected native GUI executable.");
  const version = String(
    run(pending, ["--version"], { windowsHide: true, encoding: "utf8" }),
  ).trim();
  if (version !== `poracode-service-launcher ${SERVICE_LAUNCHER_VERSION}`)
    throw new Error("The compiled helper version differs from the declared contract.");
  const manifest = serviceLauncherManifestSchema.parse({
    formatVersion: SERVICE_LAUNCHER_MANIFEST_VERSION,
    protocolVersion: SERVICE_LAUNCHER_PROTOCOL_VERSION,
    helperVersion: SERVICE_LAUNCHER_VERSION,
    sourceSha256,
    targets: {
      [target]: {
        relativePath: `${target}/${SERVICE_LAUNCHER_FILENAME}`,
        bytes: bytes.length,
        sha256: hash(bytes),
      },
    },
  });
  renameSync(pending, join(directory, SERVICE_LAUNCHER_FILENAME));
  const pendingManifest = `${manifestPath}.pending`;
  writeFileSync(pendingManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  renameSync(pendingManifest, manifestPath);
  return manifest;
}

if (
  process.argv[1] &&
  realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url))
) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--out-dir" || !args[1]))
    throw new Error("Usage: prepare-service-launcher.mjs [--out-dir PATH]");
  process.stdout.write(
    `${JSON.stringify(prepareServiceLauncher(args.length ? { outDir: resolve(args[1]) } : {}))}\n`,
  );
}
