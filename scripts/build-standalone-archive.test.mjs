import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  buildStandaloneArchive,
  findLinks,
  POSIX_LAUNCHER,
  prunePlatformPacks,
  WINDOWS_LAUNCHER,
} from "./build-standalone-archive.mjs";
import {
  hostRuntimeTarget,
  installServerRelease,
  readStandaloneRuntimeMarker,
  StandaloneRuntimeError,
} from "./server-release-install.mjs";
import {
  nodeArchiveFileName,
  nodeArchiveMembers,
  readStandaloneArchiveMetadata,
  renderSha256Sums,
  satisfiesNodeFloor,
  standaloneArchiveName,
} from "./standalone-runtime.mjs";

const posixOnly = { skip: process.platform === "win32" ? "POSIX launcher fixture" : false };
const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** A qualified-looking server tarball, its metadata, and a fake pinned Node archive. */
function fixture({ version = "9.8.7-nightly.1", minimum = ">=26.13.0" } = {}) {
  const root = tempDir("poracode-standalone-build-");
  const target = hostRuntimeTarget();
  const stage = join(root, "server-stage");
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources", "wsl-helpers"), { recursive: true });
  mkdirSync(join(stage, "node_modules_seed"), { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify({ name: "poracode-server", version, private: true, dependencies: {} })}\n`,
  );
  writeFileSync(
    join(stage, "lib", "server.cjs"),
    'const pkg = require("../package.json");\n' +
      'if (process.argv[2] === "--version") process.stdout.write(`${pkg.version}\\n`);\n' +
      "else process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }) + '\\n');\n",
  );
  writeFileSync(join(stage, "resources", "wsl-helpers", "README.md"), "helpers\n");
  rmSync(join(stage, "node_modules_seed"), { recursive: true });
  const tarballName = `poracode-server-${version}-${process.platform}-${process.arch}.tar.gz`;
  const tarball = join(root, tarballName);
  execFileSync("tar", ["-czf", tarball, "-C", stage, "."], { stdio: "pipe" });
  const artifact = join(root, "server-artifact.json");
  writeFileSync(
    artifact,
    `${JSON.stringify({
      formatVersion: 1,
      kind: "poracode-server-artifact",
      version,
      targets: [target],
      node: { minimum, packaging: "26.13.0" },
      runtime: { nodePty: "1.0.0", betterSqlite3: "1.0.0" },
      tarball: { name: tarballName, sha256: sha256(tarball), bytes: statSync(tarball).size },
    })}\n`,
  );

  // The fake Node answers --version like the pinned release and otherwise
  // delegates to the Node running this test.
  const members = nodeArchiveMembers(target);
  const nodeStage = join(root, "node-stage");
  const executable = join(nodeStage, ...members.executable.split("/"));
  mkdirSync(join(executable, ".."), { recursive: true });
  writeFileSync(
    executable,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo v26.13.0; exit 0; fi\nexec "${process.execPath}" "$@"\n`,
  );
  chmodSync(executable, 0o755);
  writeFileSync(join(nodeStage, ...members.license.split("/")), "Node license\n");
  const nodeArchive = join(root, nodeArchiveFileName(target));
  execFileSync("tar", ["-czf", nodeArchive, "-C", nodeStage, members.executable.split("/")[0]], {
    stdio: "pipe",
  });
  return { root, target, version, tarball, artifact, nodeArchive, nodeSha: sha256(nodeArchive) };
}

function build(input, overrides = {}) {
  return buildStandaloneArchive({
    serverTarball: input.tarball,
    serverArtifact: input.artifact,
    nodeArchive: input.nodeArchive,
    nodeArchiveSha256: input.nodeSha,
    outDir: join(input.root, "out"),
    workDir: input.root,
    ...overrides,
  });
}

void test(
  "builds a runnable self-contained archive with verified provenance",
  posixOnly,
  async () => {
    const input = fixture();
    const result = await build(input);
    const name = standaloneArchiveName(input.version, input.target);
    assert.equal(result.archivePath, join(input.root, "out", name));
    assert.equal(result.sha256, sha256(result.archivePath));
    assert.equal(
      readFileSync(`${result.archivePath}.sha256`, "utf8"),
      `${result.sha256}  ${name}\n`,
    );
    const metadata = readStandaloneArchiveMetadata(result.metadataPath);
    assert.equal(metadata.target, input.target);
    assert.equal(metadata.archive.sha256, result.sha256);
    assert.equal(metadata.runtime.node.version, "26.13.0");
    assert.equal(metadata.runtime.server.sha256, sha256(input.tarball));

    // The shipped installer recognizes the archive, never runs npm, and the
    // installed launcher runs through a PATH link with no host Node on PATH.
    const releaseDir = join(input.root, "prefix", "releases", input.version);
    const npmCalls = [];
    const installed = installServerRelease({
      tarball: result.archivePath,
      releaseDir,
      npm: "npm-must-not-run",
      run: (command, args, options) => {
        if (command === "npm-must-not-run") npmCalls.push(args);
        return execFileSync(command, args, { stdio: "pipe", ...options });
      },
    });
    assert.equal(installed.standalone, true);
    assert.deepEqual(npmCalls, []);
    assert.equal(readStandaloneRuntimeMarker(releaseDir).version, input.version);
    const binDir = join(input.root, "bin");
    mkdirSync(binDir);
    symlinkSync(join(releaseDir, "bin", "poracode"), join(binDir, "poracode"));
    const output = execFileSync(join(binDir, "poracode"), ["--version"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: input.root },
    });
    assert.equal(output.trim(), input.version);
    const forwarded = execFileSync(join(binDir, "poracode"), ["doctor", "--json", "a b"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: input.root },
    });
    assert.deepEqual(JSON.parse(forwarded).argv, ["doctor", "--json", "a b"]);
  },
);

void test(
  "refuses a mismatched target, tarball, Node archive or Node floor",
  posixOnly,
  async () => {
    const input = fixture();
    await assert.rejects(build(input, { target: "freebsd-x64" }), /built on their own target/u);
    await assert.rejects(build(input, { nodeArchiveSha256: "0".repeat(64) }), /pinned/u);
    writeFileSync(input.tarball, "tampered");
    await assert.rejects(build(input), /does not match the qualified/u);

    const old = fixture({ minimum: ">=99.0.0" });
    await assert.rejects(build(old), /does not satisfy the server's engines\.node/u);
  },
);

void test(
  "installServerRelease refuses a standalone archive for another target",
  posixOnly,
  async () => {
    const input = fixture();
    const result = await build(input);
    assert.throws(
      () =>
        installServerRelease({
          tarball: result.archivePath,
          releaseDir: join(input.root, "foreign"),
          hostTarget: "linux-riscv64",
        }),
      (error) => error instanceof StandaloneRuntimeError && /built for/u.test(error.message),
    );
    // A standalone archive is not accepted as the server tarball input.
    const metadata = JSON.parse(readFileSync(input.artifact, "utf8"));
    metadata.tarball = {
      name: metadata.tarball.name,
      sha256: sha256(result.archivePath),
      bytes: statSync(result.archivePath).size,
    };
    writeFileSync(input.artifact, `${JSON.stringify(metadata)}\n`);
    await assert.rejects(
      build({ ...input, tarball: result.archivePath }),
      /already a standalone archive/u,
    );
  },
);

void test("standalone markers fail closed on unknown formats", () => {
  const root = tempDir("poracode-standalone-marker-");
  writeFileSync(
    join(root, "standalone.json"),
    '{"kind":"poracode-standalone-runtime","formatVersion":2}',
  );
  assert.throws(() => readStandaloneRuntimeMarker(root), StandaloneRuntimeError);
  writeFileSync(
    join(root, "standalone.json"),
    JSON.stringify({
      kind: "poracode-standalone-runtime",
      formatVersion: 1,
      version: "1.0.0",
      target: "linux-x64",
      node: { version: "26.13.0", executable: "../escape" },
    }),
  );
  assert.throws(() => readStandaloneRuntimeMarker(root), StandaloneRuntimeError);
  rmSync(join(root, "standalone.json"));
  assert.equal(readStandaloneRuntimeMarker(root), null);
});

void test("prunes only the Claude Code platform packs and detects links", posixOnly, () => {
  const root = tempDir("poracode-standalone-prune-");
  for (const name of ["claude-agent-sdk", "claude-agent-sdk-darwin-arm64", "sdk"]) {
    mkdirSync(join(root, "node_modules", "@anthropic-ai", name), { recursive: true });
  }
  assert.deepEqual(prunePlatformPacks(root), ["@anthropic-ai/claude-agent-sdk-darwin-arm64"]);
  assert.ok(existsSync(join(root, "node_modules", "@anthropic-ai", "claude-agent-sdk")));
  assert.ok(existsSync(join(root, "node_modules", "@anthropic-ai", "sdk")));
  symlinkSync("/etc/hosts", join(root, "node_modules", "link"));
  assert.deepEqual(findLinks(root), [join("node_modules", "link")]);
});

void test("launchers and helpers keep their documented shapes", () => {
  assert.match(POSIX_LAUNCHER, /^#!\/bin\/sh\n/u);
  assert.match(POSIX_LAUNCHER, /exec "\$root\/runtime\/node" "\$root\/lib\/server\.cjs" "\$@"/u);
  assert.match(WINDOWS_LAUNCHER, /\r\n/u);
  const windowsLines = WINDOWS_LAUNCHER.split("\r\n").filter(Boolean);
  assert.equal(
    windowsLines.at(-1),
    'goto #_undefined_# 2>NUL || title %COMSPEC% & "%~dp0..\\runtime\\node.exe" "%~dp0..\\lib\\server.cjs" %*',
  );
  assert.ok(
    windowsLines.slice(0, -1).every((line) => /^(@echo off|rem )/u.test(line)),
    "nothing may run after Node: cmd.exe would reread a launcher that update or uninstall replaced",
  );
  assert.equal(standaloneArchiveName("2.0.0", "win32-x64"), "poracode-2.0.0-win32-x64.zip");
  assert.equal(standaloneArchiveName("2.0.0", "linux-arm64"), "poracode-2.0.0-linux-arm64.tar.gz");
  assert.equal(nodeArchiveFileName("win32-x64", "26.13.0"), "node-v26.13.0-win-x64.zip");
  assert.equal(satisfiesNodeFloor("26.13.0", ">=26.13.0"), true);
  assert.equal(satisfiesNodeFloor("26.12.9", ">=26.13.0"), false);
  assert.equal(satisfiesNodeFloor("27.0.0", ">=26.13.0"), true);
  assert.throws(() => satisfiesNodeFloor("26.13.0", "^26"), /Unsupported engines\.node/u);
  assert.equal(
    renderSha256Sums([
      { name: "b.tar.gz", sha256: "b".repeat(64) },
      { name: "a.zip", sha256: "a".repeat(64) },
    ]),
    `${"a".repeat(64)}  a.zip\n${"b".repeat(64)}  b.tar.gz\n`,
  );
});
