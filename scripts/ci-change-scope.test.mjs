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
    "website/package.json",
  ]) {
    assert.deepEqual(classifyChanges([path]), fullScope(), path);
  }
  assert.deepEqual(classifyChanges([]), fullScope());
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
