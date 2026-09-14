import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { startSmokeRenderer, waitForSmokeRenderer } from "./smoke-runtime-processes.mjs";
import { stopOwnedProcess } from "./smoke-owned-process.mjs";
import { smokeRuntimeDependencyRoots } from "./smoke-runtime-build.mjs";
import {
  prepareSmokeRuntime,
  removeSmokeRuntime,
  smokeElectronLaunch,
  validateSmokeNativeDependencies,
  verifyReusableSmokeRuntime,
  verifySmokeRuntime,
} from "./poracode-smoke-runtime.mjs";

const execute = promisify(execFile);

void test("the frozen renderer serves pinned assets without checkout tooling or dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-frozen-renderer-"));
  let child;
  try {
    const script = join(
      root,
      ".agents/skills/interactive-testing/scripts/serve-smoke-renderer.mjs",
    );
    await mkdir(join(root, ".agents/skills/interactive-testing/scripts"), { recursive: true });
    await mkdir(join(root, "dist/renderer"), { recursive: true });
    await cp(fileURLToPath(new URL("./serve-smoke-renderer.mjs", import.meta.url)), script);
    await cp(
      fileURLToPath(new URL("./smoke-runtime-files.mjs", import.meta.url)),
      join(root, ".agents/skills/interactive-testing/scripts/smoke-runtime-files.mjs"),
    );
    await writeFile(join(root, "dist/renderer/index.html"), "<html>frozen-A</html>");
    const reservation = createServer();
    await new Promise((done) => reservation.listen(0, "127.0.0.1", done));
    const port = reservation.address().port;
    await new Promise((done, reject) =>
      reservation.close((error) => (error ? reject(error) : done())),
    );
    child = startSmokeRenderer({
      repoRoot: join(root, "removed-checkout"),
      runtime: { appRoot: root, renderer: "frozen-development-build" },
      env: process.env,
      port,
    });
    const url = `http://127.0.0.1:${port}`;
    await waitForSmokeRenderer(child, url, 5_000);
    assert.equal(await (await fetch(url)).text(), "<html>frozen-A</html>");
  } finally {
    await stopOwnedProcess(child);
    await rm(root, { recursive: true, force: true });
  }
});

void test("a lazy supervisor restart keeps session A's compiled revision after checkout rebuild and session B teardown", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "poracode-runtime-isolation-"));
  const repoRoot = join(temporary, "checkout");
  const rootA = join(temporary, "session-a");
  const rootB = join(temporary, "session-b");
  try {
    await mkdir(join(repoRoot, "dist", "main"), { recursive: true });
    await mkdir(join(repoRoot, "src"), { recursive: true });
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "fixture", version: "1.0.0", type: "module" }),
    );
    await execute("git", ["init", "-q"], { cwd: repoRoot });
    await execute("git", ["add", "package.json"], { cwd: repoRoot });
    await execute(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: repoRoot },
    );
    const entry = join(repoRoot, "dist", "main", "backendHost.cjs");
    const writeRevision = (revision) =>
      Promise.all([
        writeFile(entry, `process.stdout.write(${JSON.stringify(revision)});`),
        writeFile(join(repoRoot, "src", "revision.ts"), revision),
      ]);
    const build = async ({ appRoot }) => {
      await cp(join(repoRoot, "dist"), join(appRoot, "dist"), { recursive: true });
      return { dependencies: [] };
    };
    await writeRevision("A");
    const a = await prepareSmokeRuntime({ repoRoot, root: rootA, build });
    await verifyReusableSmokeRuntime(a, { root: rootA, repoRoot });
    await assert.rejects(
      verifyReusableSmokeRuntime(a, { root: rootA, repoRoot, rendererViteHMR: true }),
      /renderer mode differs/,
    );
    const startBackend = async (runtime) =>
      (await execute(process.execPath, [join(runtime.mainBundleDir, "backendHost.cjs")])).stdout;
    assert.equal(await startBackend(a), "A");
    await writeRevision("B");
    await assert.rejects(
      verifyReusableSmokeRuntime(a, { root: rootA, repoRoot }),
      /Checkout source changed/,
    );
    const b = await prepareSmokeRuntime({ repoRoot, root: rootB, build });
    assert.equal(await startBackend(b), "B");
    assert.equal(
      await startBackend(a),
      "A",
      "session A must not load a checkout replacement on restart",
    );
    await removeSmokeRuntime(b, rootB);
    assert.equal(await startBackend(a), "A");
    await verifySmokeRuntime(a, rootA);
    await assert.rejects(removeSmokeRuntime(a, rootB), /outside its owning session/);
    await assert.rejects(
      removeSmokeRuntime({ ...a, ownerToken: "another-owner" }, rootA),
      /owned by another session/,
    );
    await writeFile(join(a.mainBundleDir, "backendHost.cjs"), "changed");
    await assert.rejects(verifySmokeRuntime(a, rootA), /artifacts changed/);
    assert.match(await readFile(entry, "utf8"), /B/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

void test(
  "repairs a missing Electron binary inside the copied graph and strips external runtime overrides",
  { skip: process.platform === "win32" },
  async () => {
    const { copyRuntimeDependencies } = await import("./smoke-runtime-files.mjs");
    const temporary = await mkdtemp(join(tmpdir(), "poracode-native-validation-"));
    const repoRoot = join(temporary, "checkout");
    const appRoot = join(temporary, "runtime");
    try {
      await mkdir(join(appRoot, "scripts"), { recursive: true });
      await writeFile(join(appRoot, "package.json"), '{"type":"module"}');
      await cp(
        fileURLToPath(new URL("../../../../scripts/ensure-native-deps.mjs", import.meta.url)),
        join(appRoot, "scripts", "ensure-native-deps.mjs"),
      );
      const packages = {
        electron:
          'module.exports=require("node:path").join(__dirname,"dist",require("node:fs").readFileSync(require("node:path").join(__dirname,"path.txt"),"utf8").trim());',
        "node-pty": "module.exports={};",
        "better-sqlite3": "module.exports=class Database {close(){}};",
      };
      for (const [name, source] of Object.entries(packages)) {
        const directory = join(repoRoot, "node_modules", name);
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(directory, "package.json"),
          JSON.stringify({ name, version: "1.0.0", main: "index.cjs" }),
        );
        await writeFile(join(directory, "index.cjs"), source);
      }
      const electronRoot = join(repoRoot, "node_modules", "electron");
      // The install fixture wraps the real Node executable; actual Electron/N-API
      // compatibility is separately exercised by the managed-app smoke.
      const executable = `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`;
      await writeFile(
        join(electronRoot, "install.js"),
        `const fs=require("node:fs"),path=require("node:path");fs.mkdirSync(path.join(__dirname,"dist"),{recursive:true});fs.writeFileSync(path.join(__dirname,"dist","electron"),${JSON.stringify(executable)},{mode:0o755});fs.writeFileSync(path.join(__dirname,"path.txt"),"electron");`,
      );
      await copyRuntimeDependencies(repoRoot, appRoot, Object.keys(packages));
      await validateSmokeNativeDependencies(appRoot);
      const launch = smokeElectronLaunch({ appRoot }, join(temporary, "profile"), {
        PATH: process.env.PATH,
        PORACODE_COMPUTER_USE_HELPER_PATH: "/outside/helper",
        PORACODE_BETTER_SQLITE3_NATIVE_BINDING: "/outside/sqlite.node",
        PORACODE_EXAMPLE_PLUGIN_SOURCE: "/outside/plugin",
        ELECTRON_OVERRIDE_DIST_PATH: "/outside/electron",
        ELECTRON_SKIP_BINARY_DOWNLOAD: "1",
        ELECTRON_RUN_AS_NODE: "1",
        NODE_PATH: "/outside/modules",
        NODE_OPTIONS: "--require=/outside/hook.cjs",
      });
      assert.equal(launch.command.startsWith(`${await realpath(appRoot)}/`), true);
      assert.deepEqual(launch.options.env, { PATH: process.env.PATH });
      await assert.rejects(readFile(join(electronRoot, "path.txt")), { code: "ENOENT" });
      assert.equal(
        JSON.parse(
          await readFile(
            join(appRoot, "node_modules", ".cache", "poracode", "electron-native.json"),
            "utf8",
          ),
        ).electronVersion,
        "1.0.0",
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
);

void test("copies dependency versions and native files so a checkout dependency update cannot alter lazy loads", async () => {
  const { copyRuntimeDependencies } = await import("./smoke-runtime-files.mjs");
  const temporary = await mkdtemp(join(tmpdir(), "poracode-native-isolation-"));
  const repoRoot = join(temporary, "checkout");
  const appRoot = join(temporary, "runtime");
  try {
    const nativeRoot = join(repoRoot, "node_modules", "fixture-native");
    await mkdir(nativeRoot, { recursive: true });
    await writeFile(join(repoRoot, "package.json"), "{}");
    await writeFile(
      join(nativeRoot, "package.json"),
      JSON.stringify({
        name: "fixture-native",
        version: "1.0.0",
        main: "index.cjs",
        optionalDependencies: { "not-installed-on-this-os": "1" },
      }),
    );
    await writeFile(
      join(nativeRoot, "index.cjs"),
      'module.exports=require("node:fs").readFileSync(require("node:path").join(__dirname,"native.bin"),"utf8");',
    );
    await writeFile(join(nativeRoot, "native.bin"), "native-A");
    // A createRequire-based lazy dependency does not appear in bundle imports.
    const dependencies = smokeRuntimeDependencyRoots(
      { dependencies: { "fixture-native": "1.0.0" } },
      [],
    );
    await copyRuntimeDependencies(repoRoot, appRoot, dependencies);
    await writeFile(join(nativeRoot, "native.bin"), "native-B");
    const result = await execute(
      process.execPath,
      ["-e", 'process.stdout.write(require("fixture-native"))'],
      { cwd: appRoot },
    );
    assert.equal(result.stdout, "native-A");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

void test("legacy sessions remain readable for explicit teardown and cannot claim isolated runtime verification", async () => {
  const { readDebugSession } = await import("./poracode-debug-session.mjs");
  const root = await mkdtemp(join(tmpdir(), "poracode-legacy-session-"));
  try {
    const path = join(root, "session.json");
    await writeFile(
      path,
      JSON.stringify({
        schemaVersion: 1,
        id: "legacy",
        token: "fixture",
        purpose: "debug",
        state: "ready",
        repoRoot: root,
        root,
        appUrl: "http://127.0.0.1:45678",
        cdpPort: 45679,
        devServerPort: 45678,
        ownerPid: process.pid,
        mode: "mock",
        startedAt: new Date().toISOString(),
      }),
    );
    const legacy = await readDebugSession(path);
    assert.equal(legacy.schemaVersion, 1);
    await assert.rejects(
      verifySmokeRuntime(legacy.runtime, root),
      /does not identify an isolated runtime/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
