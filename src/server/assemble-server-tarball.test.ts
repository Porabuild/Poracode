import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleServerTarball,
  assertTargetCoverage,
} from "../../scripts/assemble-server-tarball.mjs";
import { readServerArtifactMetadata } from "../../scripts/server-artifact-metadata.mjs";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function sha(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeOverlay(
  overlaySource: string,
  options: {
    targets: string[];
    withSqlite: boolean;
    nodePtyVersion?: string;
    betterSqlite3Version?: string;
  },
) {
  const binding = Buffer.from("arm64-binding");
  const targets = options.targets.map((dir) => ({
    platform: dir.split("-")[0],
    arch: dir.split("-")[1],
    dir,
    overlayTarget: `node_modules/node-pty/prebuilds/${dir}`,
    stagedSha256: { "pty.node": sha(binding) },
  }));
  mkdirSync(join(overlaySource, "node-pty"), { recursive: true });
  for (const target of options.targets) {
    const stagedDir = join(overlaySource, "node-pty", target);
    mkdirSync(stagedDir, { recursive: true });
    writeFileSync(join(stagedDir, "pty.node"), binding);
  }
  writeFileSync(
    join(overlaySource, "node-pty", "overlay.json"),
    `${JSON.stringify({
      formatVersion: 2,
      package: "node-pty",
      version: options.nodePtyVersion ?? "1.1.0",
      targets,
    })}\n`,
  );
  if (options.withSqlite) {
    const sqliteTargets = options.targets.map((dir) => ({
      platform: dir.split("-")[0],
      arch: dir.split("-")[1],
      dir,
      file: `better-sqlite3/${dir}.node`,
      sha256: sha(`sqlite-${dir}`),
    }));
    mkdirSync(join(overlaySource, "better-sqlite3"), { recursive: true });
    for (const target of options.targets) {
      writeFileSync(join(overlaySource, "better-sqlite3", `${target}.node`), `sqlite-${target}`);
    }
    writeFileSync(
      join(overlaySource, "better-sqlite3", "overlay.json"),
      `${JSON.stringify({
        formatVersion: 1,
        package: "better-sqlite3",
        version: options.betterSqlite3Version ?? "13.0.3",
        hostTarget: options.targets[0],
        targets: sqliteTargets,
      })}\n`,
    );
  }
}

function writeWebFixture(webDir: string) {
  mkdirSync(join(webDir, "assets"), { recursive: true });
  writeFileSync(join(webDir, "index.html"), "<html><body>web</body></html>\n");
  writeFileSync(join(webDir, "assets", "app.js"), "console.log('web');\n");
  writeFileSync(join(webDir, "service-worker.js"), 'const BUILD_VERSION = "web-build-1";\n');
}

function fakeNpmRun(_command: string, _args: readonly string[], cwd: string) {
  writeFileSync(
    join(cwd, "package-lock.json"),
    `${JSON.stringify({ name: "poracode-server", version: "1.0.0", lockfileVersion: 3, requires: true, packages: { "": { name: "poracode-server", version: "1.0.0" } } })}\n`,
  );
  return Buffer.from("");
}

function installedVersion(name: string): string {
  return JSON.parse(readFileSync(join(process.cwd(), "node_modules", name, "package.json"), "utf8"))
    .version;
}

/** The host-shaped native overlay target the running machine installs. */
function hostTarget(): string {
  const report = process.report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  return `${
    process.platform === "linux" && !report?.header?.glibcVersionRuntime
      ? "linuxmusl"
      : process.platform
  }-${process.arch}`;
}

function tarballEntries(tarballPath: string): string[] {
  return execFileSync("tar", ["-tzf", tarballPath], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.replace(/^\.\//u, ""))
    .filter((line) => line.length > 0 && line !== ".");
}

describe("assembleServerTarball (V6 D.2, plan D2/D3)", () => {
  it("fails when native-overlay is missing", () => {
    const outDir = tempDir("poracode-tarball-");
    expect(() =>
      assembleServerTarball({
        outDir,
        mainBundleDir: join(outDir, "missing-main"),
        overlaySource: join(outDir, "missing-overlay"),
        shrinkwrap: false,
      }),
    ).toThrow(/native-overlay missing/u);
  });

  it("ships the web client, frozen closure, license and artifact metadata", () => {
    const outDir = tempDir("poracode-tarball-out-");
    const mainBundleDir = tempDir("poracode-tarball-main-");
    const overlaySource = tempDir("poracode-tarball-overlay-");
    const webDir = tempDir("poracode-tarball-web-");
    writeWebFixture(webDir);

    const bundleBytes = Buffer.from("module.exports = {};\n");
    writeFileSync(join(mainBundleDir, "server.cjs"), bundleBytes);
    writeFileSync(
      join(mainBundleDir, "server.ssh-runtime-manifest.json"),
      `${JSON.stringify({
        files: [
          { path: "server.cjs", sha256: createHash("sha256").update(bundleBytes).digest("hex") },
        ],
        dependencies: ["node-pty"],
      })}\n`,
    );
    writeOverlay(overlaySource, { targets: ["linux-x64", "linux-arm64"], withSqlite: true });

    const result = assembleServerTarball({
      outDir,
      mainBundleDir,
      overlaySource,
      webDir,
      targets: ["linux-x64", "linux-arm64"],
      npmRun: fakeNpmRun,
      sourceRevision: "test-revision",
    });

    const shippedOverlay = JSON.parse(
      readFileSync(join(result.stageDir, "native-overlay", "node-pty", "overlay.json"), "utf8"),
    );
    expect(shippedOverlay.targets.map((target: { dir: string }) => target.dir)).toEqual([
      "linux-x64",
      "linux-arm64",
    ]);
    expect(readFileSync(join(result.stageDir, "renderer", "index.html"), "utf8")).toContain("web");
    expect(existsSync(join(result.stageDir, "renderer", "assets", "app.js"))).toBe(true);
    expect(existsSync(join(result.stageDir, "LICENSE"))).toBe(true);
    expect(existsSync(join(result.stageDir, "npm-shrinkwrap.json"))).toBe(true);
    expect(existsSync(join(result.stageDir, "package-lock.json"))).toBe(false);
    const shippedPackage = JSON.parse(readFileSync(join(result.stageDir, "package.json"), "utf8"));
    expect(shippedPackage.dependencies["node-pty"]).toBe(installedVersion("node-pty"));
    for (const script of [
      "server-native-overlay.mjs",
      "server-release-install.mjs",
      "install-server-prefix.mjs",
    ]) {
      expect(readFileSync(join(result.stageDir, "scripts", script), "utf8")).toBe(
        readFileSync(join(process.cwd(), "scripts", script), "utf8"),
      );
    }
    expect(
      readFileSync(join(result.stageDir, "scripts", "server-native-overlay.mjs"), "utf8"),
    ).toContain("export function applyServerNativeOverlay");
    expect(
      readFileSync(join(result.stageDir, "scripts", "server-release-install.mjs"), "utf8"),
    ).toContain("export function installServerRelease");
    expect(
      readFileSync(join(result.stageDir, "scripts", "install-server-prefix.mjs"), "utf8"),
    ).toContain("export function installServerPrefix");
    // The shipped systemd unit is the repository file at its documented
    // artifact path (docs/STANDALONE_SERVER.md §4.1).
    expect(
      readFileSync(
        join(result.stageDir, "packaging", "systemd", "poracode-server.service"),
        "utf8",
      ),
    ).toBe(readFileSync(join(process.cwd(), "packaging/systemd/poracode-server.service"), "utf8"));
    expect(tarballEntries(result.tarballPath)).toEqual(
      expect.arrayContaining([
        "scripts/install-server-prefix.mjs",
        "scripts/server-release-install.mjs",
        "scripts/server-native-overlay.mjs",
        "packaging/systemd/poracode-server.service",
      ]),
    );
    const dockerfile = readFileSync(join(result.stageDir, "Dockerfile"), "utf8");
    expect(dockerfile).toContain("npm install --omit=dev --ignore-scripts");
    expect(dockerfile).toContain("applyServerNativeOverlay");
    expect(dockerfile).toContain("COPY renderer ./renderer");
    expect(isGzipFile(result.tarballPath)).toBe(true);

    const metadata = readServerArtifactMetadata(result.metadataPath);
    expect(metadata.version).toBe(
      JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version,
    );
    expect(metadata.targets).toEqual(["linux-x64", "linux-arm64"]);
    expect(metadata.tarball.sha256).toBe(result.sha256);
    expect(metadata.sourceRevision).toBe("test-revision");
    expect(metadata.webClient).toMatchObject({ present: true, buildVersion: "web-build-1" });
    expect(metadata.runtime.overlayTargets).toEqual({
      nodePty: ["linux-x64", "linux-arm64"],
      betterSqlite3: ["linux-x64", "linux-arm64"],
    });
    for (const shippedPath of [
      "scripts/install-server-prefix.mjs",
      "scripts/server-release-install.mjs",
      "scripts/server-native-overlay.mjs",
      "packaging/systemd/poracode-server.service",
    ]) {
      expect(metadata.files[shippedPath]).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("requires every advertised target in both native modules", () => {
    const overlaySource = tempDir("poracode-tarball-coverage-");
    writeOverlay(overlaySource, { targets: ["linux-x64"], withSqlite: true });
    expect(() => assertTargetCoverage(overlaySource, ["linux-x64", "linux-arm64"])).toThrow(
      /better-sqlite3\/linux-arm64/u,
    );
    expect(() => assertTargetCoverage(overlaySource, ["linux-x64"])).not.toThrow();
  });

  it("builds an explicit API-only artifact when asked", () => {
    const outDir = tempDir("poracode-tarball-api-");
    const mainBundleDir = tempDir("poracode-tarball-api-main-");
    const overlaySource = tempDir("poracode-tarball-api-overlay-");
    writeFileSync(join(mainBundleDir, "server.cjs"), "module.exports = {};\n");
    writeFileSync(
      join(mainBundleDir, "server.ssh-runtime-manifest.json"),
      `${JSON.stringify({ files: [{ path: "server.cjs" }], dependencies: [] })}\n`,
    );
    const target = hostTarget();
    writeOverlay(overlaySource, { targets: [target], withSqlite: true });
    const result = assembleServerTarball({
      outDir,
      mainBundleDir,
      overlaySource,
      webDir: join(outDir, "missing-web"),
      apiOnly: true,
      shrinkwrap: false,
      sourceRevision: "test-revision",
    });
    expect(existsSync(join(result.stageDir, "renderer"))).toBe(false);
    const metadata = readServerArtifactMetadata(result.metadataPath);
    expect(metadata.webClient).toEqual({ present: false });
  });

  it("ignores stale non-overlay leftovers and refuses links inside the overlay layout", () => {
    const outDir = tempDir("poracode-tarball-links-");
    const mainBundleDir = tempDir("poracode-tarball-links-main-");
    const overlaySource = tempDir("poracode-tarball-links-overlay-");
    writeFileSync(join(mainBundleDir, "server.cjs"), "module.exports = {};\n");
    writeFileSync(
      join(mainBundleDir, "server.ssh-runtime-manifest.json"),
      `${JSON.stringify({ files: [{ path: "server.cjs" }], dependencies: [] })}\n`,
    );
    const target = hostTarget();
    writeOverlay(overlaySource, { targets: [target], withSqlite: true });
    // A previous-generation build tree (e.g. dist/server-native/build) may
    // carry node_modules symlinks; it is not part of the overlay layout, so it
    // must not be copied at all.
    mkdirSync(join(overlaySource, "build", "stale"), { recursive: true });
    symlinkSync("/etc/hostname", join(overlaySource, "build", "stale", "link"));
    const result = assembleServerTarball({
      outDir,
      mainBundleDir,
      overlaySource,
      webDir: join(outDir, "missing-web"),
      apiOnly: true,
      shrinkwrap: false,
      sourceRevision: "test-revision",
    });
    expect(existsSync(join(result.stageDir, "native-overlay", "build"))).toBe(false);

    // A link inside the layout the installers consume is a hard failure.
    symlinkSync("pty.node", join(overlaySource, "node-pty", target, "pty-link.node"));
    expect(() =>
      assembleServerTarball({
        outDir: tempDir("poracode-tarball-links-out-"),
        mainBundleDir,
        overlaySource,
        webDir: join(outDir, "missing-web"),
        apiOnly: true,
        shrinkwrap: false,
        sourceRevision: "test-revision",
      }),
    ).toThrow(/symbolic link/u);
  });

  it("ships a self-contained installer closure that installs the artifact outside the checkout", () => {
    const outDir = tempDir("poracode-tarball-closure-out-");
    const mainBundleDir = tempDir("poracode-tarball-closure-main-");
    const overlaySource = tempDir("poracode-tarball-closure-overlay-");
    const target = hostTarget();
    writeFileSync(join(mainBundleDir, "server.cjs"), "module.exports = {};\n");
    writeFileSync(
      join(mainBundleDir, "server.ssh-runtime-manifest.json"),
      `${JSON.stringify({ files: [{ path: "server.cjs" }], dependencies: [] })}\n`,
    );
    writeOverlay(overlaySource, {
      targets: [target],
      withSqlite: true,
      nodePtyVersion: installedVersion("node-pty"),
      betterSqlite3Version: installedVersion("better-sqlite3"),
    });
    const result = assembleServerTarball({
      outDir,
      mainBundleDir,
      overlaySource,
      webDir: join(outDir, "missing-web"),
      apiOnly: true,
      shrinkwrap: false,
      sourceRevision: "test-revision",
    });

    // The documented target-host bootstrap is a bounded extraction of exactly
    // these files from the verified artifact — no checkout, no ancestor
    // node_modules, no install hooks.
    const bootstrap = tempDir("poracode-tarball-bootstrap-");
    mkdirSync(join(bootstrap, "scripts"));
    for (const script of [
      "install-server-prefix.mjs",
      "server-release-install.mjs",
      "server-native-overlay.mjs",
    ]) {
      writeFileSync(
        join(bootstrap, "scripts", script),
        execFileSync("tar", ["-xOzf", result.tarballPath, `./scripts/${script}`]),
      );
    }
    const stubBin = tempDir("poracode-tarball-stub-bin-");
    writeFileSync(join(stubBin, "npm"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(stubBin, "npm"), 0o755);
    const prefix = join(tempDir("poracode-tarball-prefix-"), "opt", "poracode");
    const installed = spawnSync(
      process.execPath,
      [
        join(bootstrap, "scripts", "install-server-prefix.mjs"),
        "--tarball",
        result.tarballPath,
        "--prefix",
        prefix,
      ],
      {
        cwd: tempDir("poracode-tarball-empty-cwd-"),
        env: { ...process.env, PATH: `${stubBin}${delimiter}${process.env.PATH ?? ""}` },
        encoding: "utf8",
      },
    );
    if (installed.status !== 0) {
      throw new Error(`shipped installer failed: ${installed.stderr ?? ""}`);
    }
    expect(existsSync(join(prefix, "current", "lib", "server.cjs"))).toBe(true);
    expect(lstatSync(join(prefix, "current")).isSymbolicLink()).toBe(true);
    expect(
      existsSync(join(prefix, "current", "packaging", "systemd", "poracode-server.service")),
    ).toBe(true);
    expect(existsSync(join(prefix, "current", "scripts", "install-server-prefix.mjs"))).toBe(true);
    expect(
      existsSync(
        join(prefix, "current", "node_modules", "node-pty", "prebuilds", target, "pty.node"),
      ),
    ).toBe(true);
  });

  it("refuses an unknown server-artifact metadata generation", () => {
    const dir = tempDir("poracode-tarball-metadata-");
    const path = join(dir, "server-artifact.json");
    writeFileSync(
      path,
      `${JSON.stringify({
        formatVersion: 2,
        kind: "poracode-server-artifact",
        version: "1.8.1",
        targets: ["linux-x64"],
        tarball: { name: "x.tar.gz", sha256: "a".repeat(64), bytes: 1 },
        runtime: { nodePty: "1.1.0", betterSqlite3: "13.0.3" },
      })}\n`,
    );
    expect(() => readServerArtifactMetadata(path)).toThrow(/unsupported formatVersion/u);
  });
});

function isGzipFile(path: string): boolean {
  return readFileSync(path).subarray(0, 2).toString("latin1") === "\x1f\x8b";
}
