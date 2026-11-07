import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  buildSshRuntimeArchive,
  hashRuntimeDirectory,
  runtimeDirectoryFiles,
} from "./build-ssh-runtime-archive.mjs";
import {
  ptyJobOwnerResource,
  runtimeResourceIdentity,
} from "../src/shared/runtimeResourceInventory.ts";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeFixture() {
  const root = tempDir("poracode-ssh-archive-");
  const mainBundleDir = join(root, "main");
  const agentPluginsDir = join(root, "agent-plugins");
  const wslHelpersDir = join(root, "wsl-helpers");
  const skillsDir = join(root, "skills");
  const pluginsDir = join(root, "plugins");
  const nodeModulesDir = join(root, "node_modules");
  const outDir = join(root, "out");
  mkdirSync(mainBundleDir, { recursive: true });
  mkdirSync(join(agentPluginsDir, "codex"), { recursive: true });
  mkdirSync(wslHelpersDir, { recursive: true });
  mkdirSync(join(skillsDir, "demo"), { recursive: true });
  mkdirSync(join(pluginsDir, "demo"), { recursive: true });
  mkdirSync(join(nodeModulesDir, "node-pty"), { recursive: true });
  mkdirSync(join(nodeModulesDir, "better-sqlite3"), { recursive: true });

  const serverBytes = Buffer.from("module.exports = { server: true };\n");
  writeFileSync(join(mainBundleDir, "server.cjs"), serverBytes);
  writeFileSync(join(mainBundleDir, "shared.cjs"), "module.exports = {};\n");
  const sourceHash = "a".repeat(64);
  writeFileSync(
    join(mainBundleDir, "server.ssh-runtime-manifest.json"),
    `${JSON.stringify({
      version: 1,
      entry: "server",
      sourceHash,
      captureProtocolVersion: 1,
      settingsServiceVersion: 0,
      files: [
        {
          path: "server.cjs",
          format: "commonjs",
          bytes: serverBytes.length,
          sha256: sha256(serverBytes),
        },
        {
          path: "shared.cjs",
          format: "commonjs",
          bytes: 21,
          sha256: sha256("module.exports = {};\n"),
        },
      ],
      dependencies: ["node-pty", "better-sqlite3"],
      resources: [],
    })}\n`,
  );
  writeFileSync(join(agentPluginsDir, "codex", "plugin.json"), "{}\n");
  writeFileSync(join(wslHelpersDir, "README.md"), "helpers\n");
  writeFileSync(join(skillsDir, "demo", "SKILL.md"), "skill\n");
  writeFileSync(join(pluginsDir, "demo", "plugin.json"), "{}\n");
  writeFileSync(
    join(nodeModulesDir, "node-pty", "package.json"),
    '{"name":"node-pty","version":"1.1.0"}\n',
  );
  writeFileSync(
    join(nodeModulesDir, "better-sqlite3", "package.json"),
    '{"name":"better-sqlite3","version":"13.0.3"}\n',
  );

  const npmCalls = [];
  const npmRun = (command, args, cwd) => {
    npmCalls.push({ command, args: [...args], cwd });
    writeFileSync(
      join(cwd, "package-lock.json"),
      `${JSON.stringify({
        name: "poracode-ssh-runtime",
        lockfileVersion: 3,
        packages: { "": { name: "poracode-ssh-runtime" } },
      })}\n`,
    );
  };
  return {
    root,
    mainBundleDir,
    agentPluginsDir,
    wslHelpersDir,
    skillsDir,
    pluginsDir,
    nodeModulesDir,
    outDir,
    npmRun,
    npmCalls,
    sourceHash,
  };
}

void test("the release SSH archive preserves the declared native resource", () => {
  const fixture = writeFixture();
  const root = join(fixture.root, "pty-job-owner");
  mkdirSync(join(root, "win32-x64"), { recursive: true });
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x00004550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  bytes.writeUInt16LE(2, 156);
  writeFileSync(join(root, "win32-x64/pty-job-owner-v1.exe"), bytes);
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({
      formatVersion: 1,
      protocolVersion: 1,
      helperVersion: "1.0.0",
      sourceSha256: "a".repeat(64),
      targets: {
        "win32-x64": {
          relativePath: "win32-x64/pty-job-owner-v1.exe",
          bytes: bytes.length,
          sha256: sha256(bytes),
        },
      },
    }),
  );
  const manifestPath = join(fixture.mainBundleDir, "server.ssh-runtime-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      resources: [runtimeResourceIdentity("pty-job-owner", ptyJobOwnerResource(root).files)],
    }),
  );
  const result = buildSshRuntimeArchive({
    ...fixture,
    shrinkwrap: false,
    rootPackage: {
      version: "2.0.0-fixture",
      dependencies: { "node-pty": "1.1.0", "better-sqlite3": "13.0.3" },
    },
  });
  const extract = join(fixture.root, "native-extract");
  mkdirSync(extract);
  execFileSync("tar", ["-xzf", result.archivePath, "-C", extract]);
  assert.equal(
    runtimeResourceIdentity(
      "pty-job-owner",
      ptyJobOwnerResource(join(extract, "pty-job-owner")).files,
    ).sha256,
    runtimeResourceIdentity("pty-job-owner", ptyJobOwnerResource(root).files).sha256,
  );
});

void test("unknown native resource kinds refuse before replacing an existing archive directory", () => {
  const fixture = writeFixture();
  const path = join(fixture.mainBundleDir, "server.ssh-runtime-manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(
    path,
    JSON.stringify({
      ...manifest,
      resources: [{ kind: "future-native-owner", sha256: "a".repeat(64) }],
    }),
  );
  mkdirSync(fixture.outDir);
  const sentinel = join(fixture.outDir, "preserve.txt");
  writeFileSync(sentinel, "existing owned archive");
  assert.throws(() => buildSshRuntimeArchive(fixture));
  assert.equal(readFileSync(sentinel, "utf8"), "existing owned archive");
  assert.equal(fixture.npmCalls.length, 0);
});

void test("buildSshRuntimeArchive emits the loader manifest from the frozen closure", () => {
  const fixture = writeFixture();
  const result = buildSshRuntimeArchive({
    mainBundleDir: fixture.mainBundleDir,
    agentPluginsDir: fixture.agentPluginsDir,
    wslHelpersDir: fixture.wslHelpersDir,
    skillsDir: fixture.skillsDir,
    pluginsDir: fixture.pluginsDir,
    outDir: fixture.outDir,
    nodeModulesDir: fixture.nodeModulesDir,
    rootPackage: {
      version: "1.8.1",
      engines: { node: ">=24.10.0" },
      dependencies: { "node-pty": "^1.1.0", "better-sqlite3": "^13.0.3" },
    },
    npmRun: fixture.npmRun,
  });

  assert.deepEqual(Object.keys(result).sort(), [
    "archive",
    "archivePath",
    "archiveSha256",
    "formatVersion",
    "hash",
    "manifestPath",
    "sourceHash",
  ]);
  assert.equal(result.formatVersion, 1);
  assert.equal(result.sourceHash, fixture.sourceHash);
  assert.match(result.archive, /^ssh-runtime-[0-9a-f]{64}\.tar\.gz$/u);
  assert.equal(result.archiveSha256, sha256(readFileSync(result.archivePath)));

  // The manifest on disk is exactly the loader's shape.
  const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8"));
  assert.deepEqual(manifest, {
    formatVersion: 1,
    archive: result.archive,
    hash: result.hash,
    archiveSha256: result.archiveSha256,
    sourceHash: fixture.sourceHash,
  });

  // Extract and re-hash: the archive must carry the frozen closure, the pinned
  // package.json, the generated shrinkwrap, and every runtime resource.
  const extract = join(fixture.root, "extract");
  mkdirSync(extract, { recursive: true });
  execFileSync("tar", ["-xzf", result.archivePath, "-C", extract], { stdio: "pipe" });
  assert.equal(hashRuntimeDirectory(extract), result.hash);
  assert.ok(existsSync(join(extract, "server.cjs")));
  assert.ok(existsSync(join(extract, "server.ssh-runtime-manifest.json")));
  assert.ok(existsSync(join(extract, "agent-plugins", "codex", "plugin.json")));
  assert.ok(existsSync(join(extract, "wsl-helpers", "README.md")));
  assert.ok(existsSync(join(extract, "skills", "demo", "SKILL.md")));
  assert.ok(existsSync(join(extract, "plugins", "demo", "plugin.json")));
  assert.ok(existsSync(join(extract, "npm-shrinkwrap.json")));
  const stagePackage = JSON.parse(readFileSync(join(extract, "package.json"), "utf8"));
  assert.deepEqual(stagePackage.dependencies, {
    "node-pty": "1.1.0",
    "better-sqlite3": "13.0.3",
  });
  assert.equal(stagePackage.version, "1.8.1");
  assert.equal(stagePackage.name, "poracode-ssh-runtime");

  // No second installer: the only npm call is the shrinkwrap generation, and
  // the output directory holds exactly one archive plus the manifest.
  assert.equal(fixture.npmCalls.length, 1);
  const call = fixture.npmCalls[0];
  if (call.command === process.execPath) assert.match(call.args[0], /(?:^|[/\\])npm-cli\.js$/u);
  const npmArgs = call.command === process.execPath ? call.args.slice(1) : call.args;
  assert.deepEqual(npmArgs.slice(0, 3), ["install", "--package-lock-only", "--omit=dev"]);
  assert.deepEqual(readFileSync(join(fixture.outDir, "manifest.json"), "utf8").length > 0, true);
});

void test("hashRuntimeDirectory and runtimeDirectoryFiles mirror the runtime loader contract", () => {
  const root = tempDir("poracode-ssh-hash-");
  mkdirSync(join(root, "nested", "deep"), { recursive: true });
  writeFileSync(join(root, "a.txt"), "a");
  writeFileSync(join(root, "nested", "b.txt"), "b");
  writeFileSync(join(root, "nested", "deep", "c.txt"), "c");
  const files = runtimeDirectoryFiles(root).map((file) => file.path);
  assert.deepEqual(files, ["a.txt", "nested/b.txt", "nested/deep/c.txt"]);
  assert.equal(
    hashRuntimeDirectory(root),
    sha256("a.txt\0a\0nested/b.txt\0b\0nested/deep/c.txt\0c\0"),
  );
});
