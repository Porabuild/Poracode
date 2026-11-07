import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PTY_JOB_OWNER_FILENAME,
  PTY_JOB_OWNER_MANIFEST_VERSION,
  PTY_JOB_OWNER_MAX_BYTES,
  PTY_JOB_OWNER_PROTOCOL_VERSION,
  PTY_JOB_OWNER_VERSION,
  ptyJobOwnerManifestSchema,
} from "../src/shared/contracts/ptyJobOwner.ts";
import { readBoundedRuntimeFileSync } from "../src/shared/readBoundedRuntimeFile.ts";
import { isWindowsGuiExecutable } from "../src/shared/windowsGuiExecutable.ts";
import { readPtyJobOwnerArtifact } from "../src/shared/ptyJobOwnerArtifact.ts";
import { ptyJobOwnerResource } from "../src/shared/runtimeResourceInventory.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Desktop packaging hard-requires an owner for every advertised Windows
// installer (verifyDesktopPtyTargets), so one checkout stages both families.
// The host arch compiles first and proves the source end to end; the other
// arch is a cross compile that cannot run here, so its custody, bytes and
// native GUI shape are the whole check. A failed cross build only warns —
// packaging still refuses to publish without the target, with the target named.
const PTY_JOB_OWNER_BUILD_TARGETS = [
  { target: "win32-x64", triple: "x86_64-pc-windows-msvc" },
  { target: "win32-arm64", triple: "aarch64-pc-windows-msvc" },
];

const pendingArtifactPath = (resourceRoot, target) =>
  join(resourceRoot, target, `${PTY_JOB_OWNER_FILENAME}.pending.exe`);

export function preparePtyJobOwner({
  outDir = join(repoRoot, "resources", "pty-job-owner"),
  run = execFileSync,
  ifSupported = false,
  hostOnly = false,
} = {}) {
  if (ifSupported && process.platform !== "win32") return null;
  if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch))
    throw new Error(
      "Build the PTY job owner on native Windows for x64 or arm64; no target is downloaded implicitly.",
    );
  const resourceRoot = resolve(outDir);
  const source = join(repoRoot, "native", "pty-job-owner", "main.rs");
  const sourceSha256 = hash(readFileSync(source));
  const hostTarget = `win32-${process.arch}`;
  // Development runs only need the owner this host can execute. Retrying a
  // cross target the host cannot compile would cost every launch a rustc run.
  const wanted = (target) => !hostOnly || target === hostTarget;
  const manifestPath = join(resourceRoot, "manifest.json");
  const pendingManifest = `${manifestPath}.pending`;
  let previous;
  if (existsSync(manifestPath)) {
    if (!lstatSync(manifestPath).isFile())
      throw new Error("Preserve the non-file PTY job owner manifest.");
    previous = ptyJobOwnerManifestSchema.parse(
      JSON.parse(readBoundedRuntimeFileSync(manifestPath, 16_384).toString("utf8")),
    );
  }
  if (existsSync(pendingManifest))
    throw new Error("A partial PTY job owner manifest exists; preserve and inspect it.");
  for (const { target } of PTY_JOB_OWNER_BUILD_TARGETS) {
    if (existsSync(pendingArtifactPath(resourceRoot, target)))
      throw new Error("A partial PTY job owner build exists; preserve and inspect it.");
  }
  // Reuse same-source targets. The host binary must still answer --version; a
  // cross-compiled target cannot run on this host, so readPtyJobOwnerArtifact
  // (custody, byte hash, native GUI shape) is the whole cached check.
  const preserved = {};
  const rebuild = PTY_JOB_OWNER_BUILD_TARGETS.map(({ target }) => target).filter(wanted);
  if (previous?.sourceSha256 === sourceSha256) {
    ptyJobOwnerResource(resourceRoot);
    rebuild.length = 0;
    for (const { target } of PTY_JOB_OWNER_BUILD_TARGETS) {
      if (!previous.targets[target]) {
        if (wanted(target)) rebuild.push(target);
        continue;
      }
      const cached = readPtyJobOwnerArtifact(resourceRoot, target);
      if (target === hostTarget) {
        const version = String(
          run(cached.path, ["--version"], {
            windowsHide: true,
            encoding: "utf8",
          }),
        ).trim();
        if (version !== `poracode-pty-job-owner ${PTY_JOB_OWNER_VERSION}`)
          throw new Error("The staged PTY job owner version differs from the declared contract.");
      }
      preserved[target] = previous.targets[target];
    }
    if (rebuild.length === 0) return previous;
  }
  const scratch = join(repoRoot, "tmp");
  mkdirSync(scratch, { recursive: true });
  const buildDirectory = mkdtempSync(join(scratch, "pty-job-owner-build-"));
  const built = {};
  for (const { target, triple } of PTY_JOB_OWNER_BUILD_TARGETS) {
    if (!rebuild.includes(target)) continue;
    try {
      const compiled = join(buildDirectory, `${target}-${PTY_JOB_OWNER_FILENAME}`);
      run(
        "rustc",
        [
          "--edition=2024",
          "--crate-name",
          "poracode_pty_job_owner",
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
          compiled,
        ],
        { windowsHide: true, stdio: "pipe" },
      );
      const bytes = readBoundedRuntimeFileSync(compiled, PTY_JOB_OWNER_MAX_BYTES);
      if (!isWindowsGuiExecutable(bytes, target, PTY_JOB_OWNER_MAX_BYTES))
        throw new Error("Compiler output is not the selected native GUI executable.");
      if (target === hostTarget) {
        const version = String(
          run(compiled, ["--version"], { windowsHide: true, encoding: "utf8" }),
        ).trim();
        if (version !== `poracode-pty-job-owner ${PTY_JOB_OWNER_VERSION}`)
          throw new Error("The compiled PTY job owner version differs from the declared contract.");
      }
      built[target] = { bytes };
    } catch (error) {
      if (target === hostTarget) throw error;
      process.stderr.write(
        `[prepare-pty-job-owner] Skipping the optional ${target} owner: ${error.message}. ` +
          "Desktop packaging still requires it; install this host's cross toolchain " +
          "(for example `rustup target add aarch64-pc-windows-msvc`) and rerun.\n",
      );
    }
  }
  if (Object.keys(built).length === 0) return previous;
  const manifest = ptyJobOwnerManifestSchema.parse({
    formatVersion: PTY_JOB_OWNER_MANIFEST_VERSION,
    protocolVersion: PTY_JOB_OWNER_PROTOCOL_VERSION,
    helperVersion: PTY_JOB_OWNER_VERSION,
    sourceSha256,
    targets: {
      ...preserved,
      ...Object.fromEntries(
        Object.entries(built).map(([target, { bytes }]) => [
          target,
          {
            relativePath: `${target}/${PTY_JOB_OWNER_FILENAME}`,
            bytes: bytes.length,
            sha256: hash(bytes),
          },
        ]),
      ),
    },
  });
  for (const target of Object.keys(built)) {
    mkdirSync(join(resourceRoot, target), { recursive: true });
    writeFileSync(pendingArtifactPath(resourceRoot, target), built[target].bytes, { flag: "wx" });
  }
  writeFileSync(pendingManifest, `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  for (const target of Object.keys(built))
    renameSync(
      pendingArtifactPath(resourceRoot, target),
      join(resourceRoot, target, PTY_JOB_OWNER_FILENAME),
    );
  renameSync(pendingManifest, manifestPath);
  return manifest;
}

if (
  process.argv[1] &&
  realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url))
) {
  const args = process.argv.slice(2);
  const ifSupported = args[0] === "--if-supported";
  if (ifSupported) args.shift();
  const hostOnly = args[0] === "--host-only";
  if (hostOnly) args.shift();
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--out-dir" || !args[1]))
    throw new Error(
      "Usage: prepare-pty-job-owner.mjs [--if-supported] [--host-only] [--out-dir PATH]",
    );
  process.stdout.write(
    `${JSON.stringify(preparePtyJobOwner({ ifSupported, hostOnly, ...(args.length ? { outDir: resolve(args[1]) } : {}) }))}\n`,
  );
}
