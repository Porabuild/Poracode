import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  buildStagePackageJson,
  generateNpmShrinkwrap,
  pinInstalledVersions,
  readRuntimeClosure,
} from "./runtime-closure.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

void test("readRuntimeClosure unions the build manifests and rejects an empty closure", () => {
  const mainBundleDir = tempDir("poracode-closure-");
  writeFileSync(join(mainBundleDir, "server.cjs"), "module.exports = {};\n");
  writeFileSync(
    join(mainBundleDir, "server.ssh-runtime-manifest.json"),
    `${JSON.stringify({
      files: [{ path: "server.cjs", sha256: "a".repeat(64) }],
      dependencies: ["ws", "node-pty"],
    })}\n`,
  );
  writeFileSync(
    join(mainBundleDir, "supervisor.ssh-runtime-manifest.json"),
    `${JSON.stringify({
      files: [{ path: "supervisor.cjs" }],
      dependencies: ["node-pty"],
    })}\n`,
  );
  const closure = readRuntimeClosure(mainBundleDir);
  assert.deepEqual(closure.files.map((file) => file.path).sort(), ["server.cjs", "supervisor.cjs"]);
  assert.deepEqual(closure.dependencies, ["node-pty", "ws"]);
  assert.deepEqual(closure.manifestFiles, [
    "server.ssh-runtime-manifest.json",
    "supervisor.ssh-runtime-manifest.json",
  ]);
  assert.throws(
    () => readRuntimeClosure(tempDir("poracode-closure-empty-")),
    /No ssh-runtime manifests/u,
  );
});

void test("pinInstalledVersions freezes the installed version, not the range", () => {
  const nodeModulesDir = tempDir("poracode-closure-modules-");
  mkdirSync(join(nodeModulesDir, "node-pty"), { recursive: true });
  writeFileSync(
    join(nodeModulesDir, "node-pty", "package.json"),
    '{"name":"node-pty","version":"1.1.0"}\n',
  );
  const dependencies = pinInstalledVersions(["node-pty"], {
    nodeModulesDir,
    rootPackage: { dependencies: { "node-pty": "^1.1.0" } },
  });
  assert.deepEqual(dependencies, { "node-pty": "1.1.0" });
  assert.throws(
    () =>
      pinInstalledVersions(["better-sqlite3"], {
        nodeModulesDir,
        rootPackage: { dependencies: { "better-sqlite3": "13.0.3" } },
      }),
    /is not installed/u,
  );
});

void test("buildStagePackageJson keeps the pinned stage shape", () => {
  assert.deepEqual(
    buildStagePackageJson({
      version: "1.8.1",
      engines: { node: ">=24.10.0" },
      dependencies: { "node-pty": "1.1.0" },
    }),
    {
      name: "poracode-server",
      version: "1.8.1",
      private: true,
      engines: { node: ">=24.10.0" },
      dependencies: { "node-pty": "1.1.0" },
    },
  );
});

void test("generateNpmShrinkwrap freezes the closure and removes package-lock.json", () => {
  const stageDir = tempDir("poracode-closure-stage-");
  writeFileSync(
    join(stageDir, "package.json"),
    `${JSON.stringify(buildStagePackageJson({ version: "1.8.1", engines: { node: ">=24" }, dependencies: {} }))}\n`,
  );
  const result = generateNpmShrinkwrap(stageDir);
  assert.equal(result.lockfileVersion, 3);
  const shrinkwrap = JSON.parse(readFileSync(join(stageDir, "npm-shrinkwrap.json"), "utf8"));
  assert.equal(shrinkwrap.lockfileVersion, 3);
  assert.equal(shrinkwrap.name, "poracode-server");
  assert.throws(() => readFileSync(join(stageDir, "package-lock.json"), "utf8"), /ENOENT/u);
});
