#!/usr/bin/env node
/**
 * Out-of-checkout qualification for the publishable `poracode` launcher (plan D1).
 *
 * Runs the real `npm pack` for `packages/poracode-cli`, installs the packed
 * tarball into an empty external directory with an isolated npm cache, and
 * executes the installed `poracode` bin from a cwd outside the checkout:
 *
 * 1. `--version` and `--help` answer without a runtime (no checkout ancestor,
 *    no compiler, no Electron involved).
 * 2. A local versioned runtime tarball is installed through the documented
 *    PORACODE_SERVER_TARBALL/PORACODE_SERVER_TARBALL_SHA256 escape hatch; the
 *    server command runs from the verified cache.
 * 3. Removing the local tarball and running again proves cache reuse is
 *    network- and source-free.
 * 4. A wrong checksum and an unsupported target fail closed with actionable
 *    messages.
 *
 * The runtime tarball defaults to a stub built from the repository's shipped
 * install scripts; pass --runtime-tarball to qualify a real assembled artifact.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(repoRoot, "packages", "poracode-cli");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runExpectingFailure(command, args, options = {}) {
  try {
    run(command, args, options);
  } catch (error) {
    return {
      status: error.status ?? 1,
      stderr: `${error.stderr ?? ""}${error.stdout ?? ""}`,
    };
  }
  throw new Error(`expected failure but the command succeeded: ${command} ${args.join(" ")}`);
}

function parseArgs(argv) {
  const options = {
    target: `${process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime ? "linuxmusl" : process.platform}-${process.arch}`,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--runtime-tarball") options.runtimeTarball = resolve(argv[++index]);
    else if (argv[index] === "--target") options.target = argv[++index];
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
}

/** A real runtime tarball: shipped install scripts, no runtime dependencies. */
function buildStubRuntimeTarball(workRoot, version) {
  const stage = join(workRoot, "stub-runtime-stage");
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources", "wsl-helpers"), { recursive: true });
  mkdirSync(join(stage, "scripts"), { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        name: "poracode-server",
        version,
        private: true,
        engines: { node: ">=24.10.0" },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(stage, "lib", "server.cjs"),
    "process.stdout.write(JSON.stringify({ stub: true, argv: process.argv.slice(2), " +
      "appVersion: process.env.PORACODE_APP_VERSION }) + '\\n');\n",
  );
  writeFileSync(join(stage, "resources", "wsl-helpers", "README.md"), "stub helpers\n");
  for (const script of ["server-release-install.mjs", "server-native-overlay.mjs"]) {
    cpSync(join(repoRoot, "scripts", script), join(stage, "scripts", script));
  }
  const tarball = join(workRoot, "poracode-server-stub.tar.gz");
  run("tar", ["-czf", tarball, "-C", stage, "."]);
  return tarball;
}

function launcherVersion() {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version;
}

/**
 * Copy a supplied real tarball into the qualification work root. The pipeline
 * hands us the qualified artifact and must keep it: qualification may delete
 * only files it owns (the self-built stub, or this copy), never the caller's
 * tarball. Returns the owned copy.
 */
export function stageOwnedRuntimeTarball(sourceTarball, workRoot) {
  const owned = join(workRoot, "poracode-server-qualified.tar.gz");
  cpSync(sourceTarball, owned);
  return owned;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const workRoot = mkdtempSync(join(tmpdir(), "poracode-cli-qualify-"));
  const home = join(workRoot, "home");
  const cacheRoot = join(workRoot, "runtime-cache");
  const npmCache = join(workRoot, "npm-cache");
  const consumer = join(workRoot, "consumer");
  const emptyCwd = join(workRoot, "empty-cwd");
  for (const dir of [home, cacheRoot, npmCache, consumer, emptyCwd])
    mkdirSync(dir, { recursive: true });
  writeFileSync(join(consumer, "package.json"), '{"name":"qualify-consumer","private":true}\n');

  const runtimeTarballSource = options.runtimeTarball ?? null;
  if (runtimeTarballSource && !existsSync(runtimeTarballSource)) {
    throw new Error(`runtime tarball is missing: ${runtimeTarballSource}`);
  }
  const runtimeTarball = runtimeTarballSource
    ? stageOwnedRuntimeTarball(runtimeTarballSource, workRoot)
    : buildStubRuntimeTarball(workRoot, launcherVersion());
  if (!existsSync(runtimeTarball)) {
    throw new Error(`runtime tarball is missing: ${runtimeTarball}`);
  }
  const runtimeSha = sha256File(runtimeTarball);

  const baseEnv = {
    ...process.env,
    HOME: home,
    PORACODE_RUNTIME_CACHE_DIR: cacheRoot,
    PORACODE_RUNTIME_TARGET: options.target,
    PORACODE_SERVER_TARBALL: runtimeTarball,
    PORACODE_SERVER_TARBALL_SHA256: runtimeSha,
    npm_config_cache: npmCache,
  };

  try {
    const packOutput = run("npm", ["pack", "--pack-destination", workRoot, "--json"], {
      cwd: packageDir,
      env: baseEnv,
    });
    // npm <=11 emits an array; npm 12 emits an object keyed by package name.
    const packResult = JSON.parse(packOutput);
    const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0];
    const packedPath = join(workRoot, packed.filename);
    if (!existsSync(packedPath)) throw new Error(`npm pack did not produce ${packedPath}`);

    run(
      "npm",
      [
        "install",
        packedPath,
        "--no-save",
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        "--offline",
      ],
      { cwd: consumer, env: baseEnv },
    );
    const binPath = join(consumer, "node_modules", ".bin", "poracode");
    if (!existsSync(binPath)) throw new Error(`npm did not install the poracode bin at ${binPath}`);

    const versionOutput = run(binPath, ["--version"], { cwd: emptyCwd, env: baseEnv }).trim();
    if (versionOutput !== launcherVersion()) {
      throw new Error(`poracode --version printed ${versionOutput}, expected ${launcherVersion()}`);
    }
    const helpOutput = run(binPath, ["--help"], { cwd: emptyCwd, env: baseEnv });
    if (!helpOutput.includes("poracode pair --json")) {
      throw new Error("poracode --help did not list the server commands");
    }

    const doctorOutput = run(binPath, ["doctor", "--json"], { cwd: emptyCwd, env: baseEnv });
    const doctor = JSON.parse(doctorOutput.trim().split("\n").at(-1));
    if (doctor.stub === true) {
      if (doctor.argv[0] !== "doctor" || doctor.argv[1] !== "--json") {
        throw new Error(`argv forwarding failed: ${doctorOutput}`);
      }
      if (doctor.appVersion !== launcherVersion()) {
        throw new Error(`PORACODE_APP_VERSION was not pinned: ${JSON.stringify(doctor)}`);
      }
    } else {
      // A real artifact: the pinned runtime must answer the real doctor with
      // the launcher's version, from a profile outside the checkout.
      if (doctor.versions?.appVersion !== launcherVersion()) {
        throw new Error(
          `real doctor reported the wrong version: ${JSON.stringify(doctor.versions)}`,
        );
      }
      if (typeof doctor.profile?.profileNamespace !== "string") {
        throw new Error(`real doctor did not report a profile: ${doctorOutput.slice(0, 400)}`);
      }
    }

    const badChecksum = runExpectingFailure(binPath, ["doctor"], {
      cwd: emptyCwd,
      env: {
        ...baseEnv,
        PORACODE_RUNTIME_CACHE_DIR: join(workRoot, "cache-bad"),
        PORACODE_SERVER_TARBALL_SHA256: "0".repeat(64),
      },
    });
    if (!/checksum|sha256/i.test(badChecksum.stderr)) {
      throw new Error(`bad checksum did not fail closed: ${badChecksum.stderr}`);
    }

    // Cache reuse: with the source tarball gone, the verified install must
    // still run and must not consult the network or the removed file.
    rmSync(runtimeTarball);
    const secondRun = run(binPath, ["doctor", "--json"], { cwd: emptyCwd, env: baseEnv });
    const second = JSON.parse(secondRun.trim().split("\n").at(-1));
    const cachedRuntimeRan =
      second.stub === true || second.versions?.appVersion === launcherVersion();
    if (!cachedRuntimeRan) {
      throw new Error(`cached runtime did not run: ${secondRun.slice(0, 400)}`);
    }

    const unsupported = runExpectingFailure(binPath, ["doctor"], {
      cwd: emptyCwd,
      env: {
        ...baseEnv,
        PORACODE_RUNTIME_TARGET: "win32-x64",
        PORACODE_SERVER_TARBALL: "",
        PORACODE_SERVER_TARBALL_SHA256: "",
        PORACODE_RUNTIME_CACHE_DIR: join(workRoot, "cache-unsupported"),
      },
    });
    if (!/no published standalone runtime/i.test(unsupported.stderr)) {
      throw new Error(`unsupported target did not fail closed: ${unsupported.stderr}`);
    }

    // The supplied qualified tarball is the caller's artifact; qualification
    // copied it and must prove it never deleted the original.
    if (runtimeTarballSource && !existsSync(runtimeTarballSource)) {
      throw new Error(
        `qualification deleted the supplied runtime tarball: ${runtimeTarballSource}`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        packed: packed.filename,
        packedFiles: packed.files.length,
        target: options.target,
        runtimeTarballSource,
        runtimeTarball,
        runtimeSha256: runtimeSha,
      })}\n`,
    );
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  }
}
