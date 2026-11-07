import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse } from "yaml";
import { parse as parseToml } from "smol-toml";

import lintStaged from "../lint-staged.config.js";
import { classifyChanges, fullScope } from "./ci-change-scope.mjs";

void test("documentation-only changes skip expensive CI lanes", () => {
  assert.deepEqual(
    classifyChanges([
      "README.md",
      "docs/STANDALONE_SERVER.md",
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".agents/docs/architecture.md",
      ".agents/skills/verify/SKILL.md",
    ]),
    {
      core: false,
      nativeAndroid: false,
      nativeIos: false,
      nativeShared: false,
    },
  );
});

void test("markdown that ships or feeds tests runs the core lanes", () => {
  for (const path of [
    "resources/plugins/subagent-delegation/skills/subagent-delegation/SKILL.md",
    "resources/skills/skill-creator-poracode/SKILL.md",
    "src/supervisor/agents/codex/protocol/README.md",
    "packages/poracode-cli/README.md",
    "protocol/remote/v3/NATIVE_PROTOCOL_POLICY.md",
    "tui/opencode/UPSTREAM.md",
  ]) {
    assert.equal(classifyChanges([path]).core, true, path);
  }
});

void test("platform-only changes run only the affected native clients", () => {
  assert.deepEqual(classifyChanges(["android/app/build.gradle.kts", "docs/MOBILE_DEV.md"]), {
    core: false,
    nativeAndroid: true,
    nativeIos: false,
    nativeShared: false,
  });
  assert.deepEqual(classifyChanges(["ios/App/App/App.swift"]), {
    core: false,
    nativeAndroid: false,
    nativeIos: true,
    nativeShared: false,
  });
  assert.deepEqual(classifyChanges(["android/app/build.gradle.kts", "ios/App/App/App.swift"]), {
    core: false,
    nativeAndroid: true,
    nativeIos: true,
    nativeShared: false,
  });
});

void test("shared and uncertain changes run every qualification lane", () => {
  for (const path of [
    "src/server/server.ts",
    "protocol/remote/v3/generated/schema.json",
    "bun.lock",
    ".github/workflows/native-ci.yml",
  ]) {
    assert.deepEqual(classifyChanges([path]), fullScope(), path);
  }
  assert.deepEqual(classifyChanges([]), fullScope());
});

void test("renderer and separately shipped surfaces do not start native clients", () => {
  for (const path of [
    "src/renderer/App.tsx",
    "chrome-extension/manifest.json",
    "branding/assets/icon.svg",
    "website/package.json",
  ]) {
    assert.deepEqual(
      classifyChanges([path]),
      { core: true, nativeAndroid: false, nativeIos: false, nativeShared: false },
      path,
    );
  }
});

void test("required gates remain present and validate intentionally skipped jobs", async () => {
  const [core, native] = await Promise.all(
    ["ci.yml", "native-ci.yml"].map(async (name) =>
      parse(await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8")),
    ),
  );

  for (const name of [
    "typecheck",
    "lint",
    "web_build",
    "runtime_deps",
    "rust_helper",
    "test_shard",
    "test_perf",
  ]) {
    assert.equal(core.jobs[name].needs, "changes", name);
    assert.match(core.jobs[name].if, /needs\.changes\.outputs\.core/u, name);
  }
  assert.ok(core.jobs.ci_gate.needs.includes("changes"));
  assert.match(core.jobs.ci_gate.steps.at(-1).run, /expected = required\.has/u);

  for (const [name, output] of [
    ["android", "android"],
    ["ios", "ios"],
    ["remote_v3_contract", "shared"],
  ]) {
    assert.equal(native.jobs[name].needs, "changes", name);
    assert.match(native.jobs[name].if, new RegExp(`outputs\\.${output}`), name);
  }
  assert.ok(native.jobs.native_gate.needs.includes("changes"));
  assert.match(native.jobs.native_gate.steps.at(-1).run, /const wanted = required/u);
});

void test("CI prepares pinned Bun before typechecking, linting and formatting", async () => {
  const core = parse(
    await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  for (const [job, command] of [
    ["typecheck", "bun run typecheck"],
    ["lint", "bun run lint"],
    ["fmt", "bun run fmt:check"],
    ["web_build", "bun run build:web"],
    ["runtime_deps", "bun run codex-protocol:gen"],
    ["test_shard", "bun run test --shard=${{ matrix.shard }}/8"],
    ["test_perf", "bun run test:perf:cli-hook"],
  ]) {
    const steps = core.jobs[job].steps;
    const setup = steps.findIndex((step) => step.uses === "./.github/actions/setup-bun");
    const install = steps.findIndex(
      (step) =>
        step.run ===
        "bun install --frozen-lockfile --ignore-scripts && node node_modules/bun/install.js",
    );
    const check = steps.findIndex((step) => step.run === command);
    assert.ok(setup >= 0, job);
    assert.ok(install > setup, job);
    assert.ok(check > install, job);
  }
});

void test("pinned Bun installation preserves platform binaries across rebuilds", async (t) => {
  const require = createRequire(import.meta.url);
  const bunManifestPath = require.resolve("bun/package.json");
  const bunRoot = dirname(bunManifestPath);
  const bunRequire = createRequire(bunManifestPath);
  const manifest = JSON.parse(await readFile(bunManifestPath, "utf8"));
  const scratchRoot = fileURLToPath(new URL("../tmp", import.meta.url));
  await mkdir(scratchRoot, { recursive: true });
  const fixture = await mkdtemp(join(scratchRoot, "bun-installer-rebuild-"));
  t.after(async () => {
    assert.equal(dirname(fixture), scratchRoot);
    await rm(fixture, { recursive: true, force: true });
  });
  await copyFile(bunManifestPath, join(fixture, "package.json"));
  await copyFile(join(bunRoot, "install.js"), join(fixture, "install.js"));
  for (const binary of Object.values(manifest.bin)) {
    await mkdir(dirname(join(fixture, binary)), { recursive: true });
    await writeFile(join(fixture, binary), "installer placeholder");
  }
  const platformBinaries = [];
  for (const name of Object.keys(manifest.optionalDependencies)) {
    let platformManifest;
    try {
      platformManifest = bunRequire.resolve(`${name}/package.json`);
    } catch (error) {
      if (error.code === "MODULE_NOT_FOUND") continue;
      throw error;
    }
    const destination = join(fixture, "node_modules", name);
    await cp(dirname(platformManifest), destination, { recursive: true });
    platformBinaries.push(
      join(destination, "bin", process.platform === "win32" ? "bun.exe" : "bun"),
    );
  }
  assert.ok(platformBinaries.length > 0, "the installed Bun platform package must be available");
  for (const binary of platformBinaries) assert.ok((await stat(binary)).isFile());
  const execute = promisify(execFile);
  const { stdout: platformRevision } = await execute(platformBinaries[0], ["--revision"]);
  for (let attempt = 0; attempt < 2; attempt++) {
    await execute(process.execPath, [join(fixture, "install.js")], {
      cwd: fixture,
      timeout: 30_000,
    });
    for (const binary of platformBinaries) assert.ok((await stat(binary)).isFile());
    const { stdout } = await execute(join(fixture, manifest.bin.bun), ["--revision"]);
    assert.equal(stdout.trim(), platformRevision.trim());
  }
});

void test("Bun preserves the workspace install policy and bootstraps the pinned binary", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const config = parseToml(await readFile(new URL("../bunfig.toml", import.meta.url), "utf8"));
  assert.equal(manifest.packageManager, `bun@${manifest.devDependencies.bun}`);
  assert.equal(config.install.linker, "isolated");
  assert.equal(config.install.globalStore, true);
  assert.equal(config.install.minimumReleaseAge, 7 * 24 * 60 * 60);
  assert.ok(
    config.install.minimumReleaseAgeExcludes.includes(`bun@${manifest.devDependencies.bun}`),
  );
  assert.deepEqual([...manifest.trustedDependencies].sort(), [
    "@sentry/cli",
    "bun",
    "electron",
    "electron-winstaller",
    "esbuild",
    "node-pty",
    "sharp",
  ]);
  const require = createRequire(import.meta.url);
  const bunManifestPath = require.resolve("bun/package.json");
  const bunManifest = JSON.parse(await readFile(bunManifestPath, "utf8"));
  const binary = join(dirname(bunManifestPath), bunManifest.bin.bun);
  const execute = promisify(execFile);
  const expected = await execute(binary, ["--revision"]);
  const actual = await execute(process.execPath, [
    fileURLToPath(new URL("./setup-bun.mjs", import.meta.url)),
    "--run",
    "--revision",
  ]);
  assert.equal(actual.stdout.trim().split(/\r?\n/).at(-1), expected.stdout.trim());
});

void test("protocol generation resolves the pinned package without package-manager shims", async (t) => {
  const scratchRoot = fileURLToPath(new URL("../tmp", import.meta.url));
  await mkdir(scratchRoot, { recursive: true });
  const fixture = await mkdtemp(join(scratchRoot, "bun-protocol-generate-"));
  t.after(async () => {
    assert.equal(dirname(fixture), scratchRoot);
    await rm(fixture, { recursive: true, force: true });
  });
  await mkdir(join(fixture, "scripts"));
  await mkdir(join(fixture, "generated"));
  await writeFile(join(fixture, "generated", "old.ts"), "old");
  await writeFile(join(fixture, "package.json"), '{"type":"module"}');
  await copyFile(
    new URL("../packages/codex-protocol/scripts/generate.mjs", import.meta.url),
    join(fixture, "scripts", "generate.mjs"),
  );
  const codexRoot = join(fixture, "node_modules", "@openai", "codex");
  await mkdir(join(codexRoot, "bin"), { recursive: true });
  await writeFile(join(codexRoot, "package.json"), '{"name":"@openai/codex","type":"module"}');
  await writeFile(
    join(codexRoot, "bin", "codex.js"),
    `
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
assert.equal(process.versions.bun, undefined);
assert.deepEqual(process.argv.slice(2), ['app-server', 'generate-ts', '--experimental', '--out', './generated.tmp']);
mkdirSync('generated.tmp');
writeFileSync('generated.tmp/index.ts', 'generated');
`,
  );
  await promisify(execFile)(process.execPath, [join(fixture, "scripts", "generate.mjs")], {
    cwd: fixture,
    env: { ...process.env, npm_execpath: "missing-pnpm-entry.cjs" },
  });
  assert.equal(await readFile(join(fixture, "generated", "index.ts"), "utf8"), "generated");
  await assert.rejects(stat(join(fixture, "generated", "old.ts")), { code: "ENOENT" });
});

void test("pinned Bun enforces semantic lint rules, boundaries and formatting", async (t) => {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("bun/package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const executable = join(dirname(manifestPath), manifest.bin.bun);
  const execute = promisify(execFile);
  const scratchRoot = fileURLToPath(new URL("../tmp", import.meta.url));
  await mkdir(scratchRoot, { recursive: true });
  const fixture = await mkdtemp(join(scratchRoot, "bun-check-rules-"));
  t.after(async () => {
    assert.equal(dirname(fixture), scratchRoot);
    await rm(fixture, { recursive: true, force: true });
  });
  await mkdir(join(fixture, ".git"));
  await writeFile(join(fixture, "package.json"), '{"private":true,"type":"module"}');
  for (const config of [".oxlintrc.json", ".oxlintrc.type-aware.json", ".oxfmtrc.json"]) {
    await copyFile(new URL(`../${config}`, import.meta.url), join(fixture, config));
  }
  await writeFile(
    join(fixture, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, target: "ESNext", types: [] },
      include: ["src"],
    }),
  );
  for (const directory of ["renderer", "main", "supervisor", "host"]) {
    await mkdir(join(fixture, "src", directory), { recursive: true });
  }
  const typedFile = join(fixture, "src", "typed.ts");
  await writeFile(
    typedFile,
    `export async function invalid() {
  await 1;
  const values = [1];
  delete values[0];
  Promise.resolve(1);
  const callback: () => void = async () => true;
  const spread = { ...Promise.resolve(1) };
  throw "failure";
}
`,
  );
  await assert.rejects(
    execute(
      executable,
      ["lint", "--type-aware", "-c", ".oxlintrc.type-aware.json", "--format", "json", typedFile],
      { cwd: fixture },
    ),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.deepEqual(
        [...new Set(report.diagnostics.map((diagnostic) => diagnostic.code))].sort(),
        [
          "typescript(await-thenable)",
          "typescript(no-array-delete)",
          "typescript(no-floating-promises)",
          "typescript(no-misused-promises)",
          "typescript(no-misused-spread)",
          "typescript(only-throw-error)",
        ].sort(),
      );
      return true;
    },
  );
  for (const [directory, source] of [
    ["renderer", 'import fs from "node:fs"; export const bridge = window.poracode; void fs;'],
    ["main", 'import value from "@/supervisor/fixture"; export default value;'],
    ["supervisor", 'import value from "@/main/fixture"; export default value;'],
    ["host", 'import value from "@/main/fixture"; export default value;'],
  ]) {
    const file = join(fixture, "src", directory, "fixture.ts");
    await writeFile(file, source);
    await assert.rejects(
      execute(executable, ["lint", "--format", "json", file], { cwd: fixture }),
      (error) => {
        assert.equal(error.code, 1);
        const diagnostics = JSON.parse(error.stdout).diagnostics;
        assert.ok(
          diagnostics.some((diagnostic) => diagnostic.code === "eslint(no-restricted-imports)"),
          directory,
        );
        if (directory === "renderer") {
          assert.ok(
            diagnostics.some(
              (diagnostic) => diagnostic.code === "eslint(no-restricted-properties)",
            ),
          );
        }
        return true;
      },
    );
  }
  const formatFile = join(fixture, "format.ts");
  const generated = join(fixture, "protocol", "remote", "v3", "generated", "fixture.ts");
  await mkdir(dirname(generated), { recursive: true });
  await writeFile(formatFile, "const value={a:1}\r\n");
  await writeFile(generated, "const broken=;");
  await assert.rejects(execute(executable, ["fmt", "--check", formatFile], { cwd: fixture }), {
    code: 1,
  });
  await execute(executable, ["fmt", formatFile, generated], { cwd: fixture });
  assert.equal(await readFile(formatFile, "utf8"), "const value = { a: 1 };\n");
  assert.equal(await readFile(generated, "utf8"), "const broken=;");
  await execute(executable, ["fmt", "--check", formatFile, generated], { cwd: fixture });

  // Package scripts must not shadow the native commands or expand their file scope.
  await writeFile(
    join(fixture, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      scripts: { lint: "exit 44", fmt: "exit 45" },
    }),
  );
  const selected = join(fixture, "src", "selected file.ts");
  await writeFile(selected, "export const selected={value:1}\n");
  const unselected = join(fixture, "src", "renderer", "fixture.ts");
  const untouched = await readFile(unselected, "utf8");
  const binDirectory = fileURLToPath(new URL("../node_modules/.bin", import.meta.url));
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const env = {
    ...process.env,
    [pathKey]: `${binDirectory}${process.platform === "win32" ? ";" : ":"}${process.env[pathKey] ?? ""}`,
    npm_lifecycle_event: "pre-commit",
  };
  for (const command of lintStaged["*.{js,jsx,ts,tsx,mjs,cjs}"]([selected])) {
    await execute(executable, ["exec", command], { cwd: fixture, env });
  }
  assert.equal(await readFile(selected, "utf8"), "export const selected = { value: 1 };\n");
  assert.equal(await readFile(unselected, "utf8"), untouched);
});

void test("integration heads stay fast while master and release runs retain full proof", async () => {
  const native = parse(
    await readFile(new URL("../.github/workflows/native-ci.yml", import.meta.url), "utf8"),
  );

  assert.equal(native.jobs.changes.outputs.full, "${{ steps.mode.outputs.full }}");
  const mode = native.jobs.changes.steps.find((step) => step.id === "mode");
  assert.match(mode.env.FULL_QUALIFICATION, /github\.ref == 'refs\/heads\/master'/u);
  assert.match(mode.env.FULL_QUALIFICATION, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(mode.env.FULL_QUALIFICATION, /github\.event_name == 'workflow_call'/u);
  assert.doesNotMatch(mode.env.FULL_QUALIFICATION, /event_name != 'pull_request'/u);
  assert.doesNotMatch(mode.env.FULL_QUALIFICATION, /labels/u);

  for (const name of [
    "ios_ui",
    "android_api34_runtime",
    "android_api37_runtime",
    "server_install_qualification",
  ]) {
    assert.match(native.jobs[name].if, /needs\.changes\.outputs\.full == 'true'/u, name);
  }

  const loadStep = native.jobs.native_e2e_foundation.steps.find(
    (step) => step.name === "Run isolated native load qualifications",
  );
  assert.match(loadStep.if, /needs\.changes\.outputs\.full == 'true'/u);
  const gate = native.jobs.native_gate.steps.at(-1);
  assert.equal(gate.env.FULL_REQUIRED, "${{ needs.changes.outputs.full }}");
  assert.match(gate.run, /FULL_REQUIRED/u);
});

void test("core gate consumes test shards directly without a no-op runner hop", async () => {
  const core = parse(
    await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );

  assert.equal(core.jobs.test, undefined);
  assert.ok(core.jobs.ci_gate.needs.includes("test_shard"));
  assert.ok(!core.jobs.ci_gate.needs.includes("test"));
});

void test("native compiler fixtures run only in the scoped contract lane", async () => {
  const [core, native] = await Promise.all(
    ["ci.yml", "native-ci.yml"].map(async (name) =>
      parse(await readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8")),
    ),
  );
  const coreTest = core.jobs.test_shard.steps.find((step) => step.name === "Test shard");
  assert.equal(coreTest.env.PORACODE_TEST_LANE, "core");

  const nativeCompile = native.jobs.remote_v3_contract.steps.find(
    (step) => step.name === "Compile generated Swift and Kotlin runtime fixtures",
  );
  assert.match(nativeCompile.run, /native\/runtime\.test\.ts/u);
  assert.match(native.jobs.remote_v3_contract.if, /outputs\.shared == 'true'/u);

  const compilerFile = "src/shared/remote/contract/native/runtime.test.ts";
  const collect = promisify(execFile);
  const repository = fileURLToPath(new URL("../", import.meta.url));
  const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
  const defaultEnv = { ...process.env };
  delete defaultEnv.PORACODE_TEST_LANE;
  const nativeEnv = {
    ...defaultEnv,
    ...native.env,
    ...native.jobs.remote_v3_contract.env,
    ...nativeCompile.env,
  };
  const runs = [
    {
      name: "core",
      env: { ...defaultEnv, ...coreTest.env },
      filter: "src/shared/remote/contract/native/",
      includesCompiler: false,
    },
    {
      name: "default",
      env: defaultEnv,
      filter: "src/shared/remote/contract/native/",
      includesCompiler: true,
    },
    { name: "native", env: nativeEnv, filter: compilerFile, includesCompiler: true },
  ];
  await Promise.all(
    runs.map(async ({ name, env, filter, includesCompiler }) => {
      const { stdout } = await collect(
        process.execPath,
        [vitest, "list", "--configLoader", "runner", "--filesOnly", filter],
        {
          cwd: repository,
          env,
          timeout: 30_000,
        },
      );
      assert.equal(stdout.includes(compilerFile), includesCompiler, `${name} compiler collection`);
      if (name !== "native") {
        assert.ok(
          stdout.includes("native/reducerEmitters.test.ts"),
          `${name} still collects ordinary node tests`,
        );
      }
    }),
  );
});
