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

export function preparePtyJobOwner({
  outDir = join(repoRoot, "resources", "pty-job-owner"),
  run = execFileSync,
  ifSupported = false,
} = {}) {
  if (ifSupported && process.platform !== "win32") return null;
  if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch))
    throw new Error(
      "Build the PTY job owner on native Windows for x64 or arm64; no target is downloaded implicitly.",
    );
  const source = join(repoRoot, "native", "pty-job-owner", "main.rs");
  const sourceSha256 = hash(readFileSync(source));
  const target = `win32-${process.arch}`;
  const directory = join(resolve(outDir), target);
  const manifestPath = join(resolve(outDir), "manifest.json");
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
  const pending = join(directory, `${PTY_JOB_OWNER_FILENAME}.pending.exe`);
  if (existsSync(pending))
    throw new Error("A partial PTY job owner build exists; preserve and inspect it.");
  if (previous?.sourceSha256 === sourceSha256) {
    ptyJobOwnerResource(resolve(outDir));
    if (previous.targets[target]) {
      const cached = readPtyJobOwnerArtifact(resolve(outDir), target);
      const version = String(
        run(cached.path, ["--version"], { windowsHide: true, encoding: "utf8" }),
      ).trim();
      if (version !== `poracode-pty-job-owner ${PTY_JOB_OWNER_VERSION}`)
        throw new Error("The staged PTY job owner version differs from the declared contract.");
      return previous;
    }
  }
  mkdirSync(directory, { recursive: true });
  const scratch = join(repoRoot, "tmp");
  mkdirSync(scratch, { recursive: true });
  const buildDirectory = mkdtempSync(join(scratch, "pty-job-owner-build-"));
  const compiled = join(buildDirectory, PTY_JOB_OWNER_FILENAME);
  const triple = process.arch === "x64" ? "x86_64-pc-windows-msvc" : "aarch64-pc-windows-msvc";
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
  const version = String(
    run(compiled, ["--version"], { windowsHide: true, encoding: "utf8" }),
  ).trim();
  if (version !== `poracode-pty-job-owner ${PTY_JOB_OWNER_VERSION}`)
    throw new Error("The compiled PTY job owner version differs from the declared contract.");
  const manifest = ptyJobOwnerManifestSchema.parse({
    formatVersion: PTY_JOB_OWNER_MANIFEST_VERSION,
    protocolVersion: PTY_JOB_OWNER_PROTOCOL_VERSION,
    helperVersion: PTY_JOB_OWNER_VERSION,
    sourceSha256,
    targets: {
      ...(previous?.sourceSha256 === sourceSha256 ? previous.targets : {}),
      [target]: {
        relativePath: `${target}/${PTY_JOB_OWNER_FILENAME}`,
        bytes: bytes.length,
        sha256: hash(bytes),
      },
    },
  });
  writeFileSync(pending, bytes, { flag: "wx" });
  writeFileSync(pendingManifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  renameSync(pending, join(directory, PTY_JOB_OWNER_FILENAME));
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
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--out-dir" || !args[1]))
    throw new Error("Usage: prepare-pty-job-owner.mjs [--if-supported] [--out-dir PATH]");
  process.stdout.write(
    `${JSON.stringify(preparePtyJobOwner({ ifSupported, ...(args.length ? { outDir: resolve(args[1]) } : {}) }))}\n`,
  );
}
