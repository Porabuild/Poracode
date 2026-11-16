import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const launcher = join(root, "scripts/turbo.mjs");
const require = createRequire(import.meta.url);
const bun = execFileSync(
  process.execPath,
  [join(root, "scripts/setup-bun.mjs"), "--run", "--print", "process.execPath"],
  { encoding: "utf8" },
).trim();

await test("Turbo invalidates inputs, restores outputs, and bypasses unsafe build caching", (t) => {
  fs.mkdirSync(join(root, "tmp"), { recursive: true });
  const cwd = fs.mkdtempSync(join(root, "tmp/turbo-regression-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const write = (path, value) => {
    fs.mkdirSync(dirname(join(cwd, path)), { recursive: true });
    fs.writeFileSync(join(cwd, path), value);
  };
  const config = JSON.parse(fs.readFileSync(join(root, "turbo.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(join(root, "package.json"), "utf8"));
  write("scripts/turbo.mjs", fs.readFileSync(launcher, "utf8"));
  write(
    "scripts/heavy-run-gate.mjs",
    fs.readFileSync(join(root, "scripts/heavy-run-gate.mjs"), "utf8"),
  );
  write("node_modules/vite/package.json", JSON.stringify({ name: "vite", type: "module" }));
  write(
    "node_modules/vite/bin/vite.js",
    `
    import assert from "node:assert/strict";
    assert.equal(process.versions.bun, undefined);
    assert.equal(process.argv[2], "build");
    process.argv.splice(2, 1);
    await import("../../../task.mjs");
  `,
  );
  write(
    "package.json",
    JSON.stringify({
      name: "turbo-fixture",
      private: true,
      packageManager: manifest.packageManager,
      workspaces: ["packages/fixture"],
      scripts: {
        build: manifest.scripts.build,
        "build:renderer": manifest.scripts["build:renderer"],
        "build:electron": "node electron.mjs",
      },
    }),
  );
  write(
    "bun.lock",
    JSON.stringify({
      lockfileVersion: 1,
      workspaces: { "": { name: "turbo-fixture" }, "packages/fixture": { name: "fixture" } },
      packages: {},
    }),
  );
  write("turbo.json", JSON.stringify(config));
  write("packages/fixture/package.json", JSON.stringify({ name: "fixture", private: true }));
  write(
    ".gitignore",
    "node_modules/\n.turbo/\ndist/\n.runs\n.electron-runs\n.env.local\npackages/codex-protocol/generated/\n",
  );
  write("source.txt", "first");
  write("packages/codex-protocol/generated/value.ts", "generated-first");
  write(
    "task.mjs",
    `
    import fs from "node:fs";
    const source = fs.readFileSync("source.txt", "utf8");
    const runs = Number(fs.existsSync(".runs") ? fs.readFileSync(".runs", "utf8") : 0) + 1;
    fs.writeFileSync(".runs", String(runs));
    if (source === "fail") process.exit(7);
    const target = process.env.PORACODE_BUILD_TARGET || "renderer";
    const directory = "dist/" + target;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(directory + "/result.json", JSON.stringify({ source, runs,
      generated: fs.readFileSync("packages/codex-protocol/generated/value.ts", "utf8"),
      channel: process.env.PORACODE_CHANNEL, posthog: process.env.POSTHOG_KEY,
      toolchain: process.env.PORACODE_TOOLCHAIN_CACHE_KEY, args: process.argv.slice(2) }));
  `,
  );
  write(
    "electron.mjs",
    `
    import fs from "node:fs";
    import assert from "node:assert/strict";
    assert.ok(fs.existsSync("dist/renderer/result.json"), "renderer must finish first");
    const count = Number(fs.existsSync(".electron-runs") ? fs.readFileSync(".electron-runs", "utf8") : 0);
    fs.writeFileSync(".electron-runs", String(count + 1));
    fs.mkdirSync("dist/main", { recursive: true });
    fs.writeFileSync("dist/main/packaging.json", JSON.stringify({ flag: process.env.EXAMPLE_PACKAGING_FLAG }));
  `,
  );
  execFileSync("git", ["init", "--quiet"], { cwd });
  execFileSync("git", ["add", "."], { cwd });

  let args = ["run", "//#build:renderer"];
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const run = (extra = [], env = {}, script = launcher) => {
    const result = spawnSync(bun, [script, ...args, ...extra], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        [pathKey]: `${dirname(bun)}${delimiter}${process.env[pathKey] ?? ""}`,
        CI: "",
        PORACODE_BUILD_TARGET: "",
        PORACODE_CHANNEL: "stable",
        POSTHOG_KEY: "",
        ...env,
      },
      windowsHide: true,
    });
    assert.ifError(result.error);
    return result;
  };
  const pass = (extra = [], env = {}, script = launcher) => {
    const result = run(extra, env, script);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result;
  };
  const runs = () => Number(fs.readFileSync(join(cwd, ".runs"), "utf8"));
  const output = () => fs.readFileSync(join(cwd, "dist/renderer/result.json"), "utf8");

  // A pre-launcher cache has no runtime fingerprint and must not be reused.
  pass([], { PORACODE_TOOLCHAIN_CACHE_KEY: "" }, require.resolve("turbo"));
  assert.equal(runs(), 1);
  pass();
  assert.equal(runs(), 2);
  const fingerprint = JSON.parse(JSON.parse(output()).toolchain);
  assert.equal(fingerprint.platform, process.platform);
  assert.equal(fingerprint.arch, process.arch);
  assert.equal(fingerprint.node, process.versions.node);
  assert.ok(fingerprint.bunRevision);
  assert.equal(fingerprint.version, 1);
  const built = output();
  pass([], { PORACODE_TOOLCHAIN_CACHE_KEY: "caller-cannot-spoof-runtime" });
  assert.equal(runs(), 2);
  fs.rmSync(join(cwd, "dist"), { recursive: true });
  pass();
  assert.equal(output(), built);
  assert.equal(runs(), 2);

  write("source.txt", "second");
  pass();
  assert.equal(runs(), 3);
  write("source.txt", "first");
  pass();
  assert.equal(runs(), 3);
  write("packages/codex-protocol/generated/value.ts", "generated-second");
  pass();
  assert.equal(runs(), 4);
  assert.equal(JSON.parse(output()).generated, "generated-second");
  write(".env.local", "VITE_TEST=value");
  pass();
  assert.equal(runs(), 5);
  pass([], { PORACODE_CHANNEL: "nightly", POSTHOG_KEY: "test-key" });
  assert.equal(runs(), 6);
  assert.equal(JSON.parse(output()).posthog, "test-key");

  write("source.txt", "fail");
  assert.notEqual(run().status, 0);
  assert.notEqual(run().status, 0);
  assert.equal(runs(), 8);
  write("source.txt", "first");
  pass([], { PORACODE_BUILD_TARGET: "web" });
  pass([], { PORACODE_BUILD_TARGET: "web" });
  assert.equal(runs(), 10);
  pass(["--", "--outDir", "custom"]);
  pass(["--", "--outDir", "custom"]);
  assert.equal(runs(), 12);
  assert.deepEqual(JSON.parse(output()).args, ["--outDir", "custom"]);
  pass();
  assert.equal(runs(), 12);

  args = ["build:renderer"];
  pass([], {}, "run");
  assert.equal(runs(), 12);
  pass(["--force"], {}, "run");
  assert.equal(runs(), 13);
  pass([], {}, "run");
  assert.equal(runs(), 13);
  pass([], { CI: "1" }, "run");
  pass([], { CI: "1" }, "run");
  assert.equal(runs(), 15);
  pass(["--outDir", "custom"], {}, "run");
  assert.equal(runs(), 16);
  assert.deepEqual(JSON.parse(output()).args, ["--outDir", "custom"]);

  args = ["build"];
  const packaging = { EXAMPLE_PACKAGING_FLAG: "fixture" };
  pass([], packaging, "run");
  pass([], packaging, "run");
  assert.equal(runs(), 16);
  assert.equal(fs.readFileSync(join(cwd, ".electron-runs"), "utf8"), "2");
  assert.equal(
    JSON.parse(fs.readFileSync(join(cwd, "dist/main/packaging.json"), "utf8")).flag,
    "fixture",
  );
  pass(["--force"], packaging, "run");
  assert.equal(runs(), 17);
  assert.equal(fs.readFileSync(join(cwd, ".electron-runs"), "utf8"), "3");
});
