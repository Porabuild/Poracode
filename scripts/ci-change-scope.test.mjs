import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

import { classifyChanges, fullScope } from "./ci-change-scope.mjs";

void test("documentation-only changes skip expensive CI lanes", () => {
  assert.deepEqual(classifyChanges(["README.md", "docs/STANDALONE_SERVER.md"]), {
    core: false,
    nativeAndroid: false,
    nativeIos: false,
    nativeShared: false,
  });
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
    "pnpm-lock.yaml",
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
  assert.match(coreTest.run, /--exclude=.*native\/runtime\.test\.ts/u);

  const nativeCompile = native.jobs.remote_v3_contract.steps.find(
    (step) => step.name === "Compile generated Swift and Kotlin runtime fixtures",
  );
  assert.match(nativeCompile.run, /native\/runtime\.test\.ts/u);
  assert.match(native.jobs.remote_v3_contract.if, /outputs\.shared == 'true'/u);
});
