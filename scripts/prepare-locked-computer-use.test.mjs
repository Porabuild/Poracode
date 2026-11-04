import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HELPER_IDENTIFIER,
  resolveSigningDefines,
} from "./prepare-locked-computer-use.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repoRoot, "scripts", "prepare-locked-computer-use.mjs");
const sourceRoot = join(repoRoot, "native", "locked-computer-use");
const macOnly = process.platform !== "darwin" ? "requires macOS clang" : false;

function tempDir(t) {
  const root = mkdtempSync(join(tmpdir(), "poracode-lcu-prepare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function runScript(args, env = {}) {
  const childEnv = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete childEnv[key];
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: childEnv });
}

void test("pure plug-in logic passes its C unit tests", { skip: macOnly }, (t) => {
  const binary = join(tempDir(t), "lcu_logic_test");
  const compile = spawnSync(
    "xcrun",
    [
      "clang",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-O2",
      "-o",
      binary,
      join(sourceRoot, "tests", "lcu_logic_test.c"),
      join(sourceRoot, "src", "lcu_logic.c"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(compile.status, 0, compile.stderr);
  const result = spawnSync(binary, [], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /lcu_logic_test: ok/u);
});

void test("is a logged no-op off macOS", (t) => {
  const out = join(tempDir(t), "out");
  const result = runScript(["--platform", "linux", "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipped: the authorization plug-in is macOS only \(linux\)/u);
  assert.equal(existsSync(out), false);
});

void test("validates the signing defines spliced into the requirement", () => {
  assert.deepEqual(resolveSigningDefines({}), {
    teamId: "",
    helperIdentifier: DEFAULT_HELPER_IDENTIFIER,
  });
  assert.equal(DEFAULT_HELPER_IDENTIFIER, "poracode-computer-use");
  assert.deepEqual(
    resolveSigningDefines({
      PORACODE_LCU_TEAM_ID: "ABCDE12345",
      PORACODE_LCU_HELPER_IDENTIFIER: "com.example.helper",
    }),
    { teamId: "ABCDE12345", helperIdentifier: "com.example.helper" },
  );
  assert.throws(() => resolveSigningDefines({ PORACODE_LCU_TEAM_ID: 'X" or true' }), /team/u);
  assert.throws(() => resolveSigningDefines({ PORACODE_LCU_TEAM_ID: "abcde12345" }), /team/u);
  assert.throws(
    () => resolveSigningDefines({ PORACODE_LCU_HELPER_IDENTIFIER: 'a" or anchor apple' }),
    /unsupported characters/u,
  );
});

void test("stages a universal ad-hoc signed bundle with the installer", { skip: macOnly }, (t) => {
  const out = join(tempDir(t), "locked-computer-use");
  const result = runScript(["--out", out], {
    PORACODE_LCU_TEAM_ID: "ABCDE12345",
    PORACODE_LCU_HELPER_IDENTIFIER: undefined,
  });
  assert.equal(result.status, 0, result.stderr);

  const bundle = join(out, "PoracodeLockedUse.bundle");
  const executable = join(bundle, "Contents", "MacOS", "PoracodeLockedUse");
  const archs = spawnSync("lipo", ["-archs", executable], { encoding: "utf8" }).stdout;
  assert.match(archs, /arm64/u);
  assert.match(archs, /x86_64/u);
  const info = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleIdentifier", "raw", "-o", "-", join(bundle, "Contents", "Info.plist")],
    { encoding: "utf8" },
  );
  assert.equal(info.stdout.trim(), "com.poracode.locked-computer-use.plugin");
  assert.equal(spawnSync("codesign", ["--verify", "--strict", bundle]).status, 0);
  assert.ok(
    readFileSync(executable).includes(
      'certificate leaf[subject.OU] = "ABCDE12345" and identifier "poracode-computer-use"',
    ),
  );
  const exported = spawnSync("nm", ["-gU", executable], { encoding: "utf8" }).stdout;
  assert.match(exported, /_AuthorizationPluginCreate/u);
  assert.doesNotMatch(exported, /_lcu_parse_response/u);

  const installer = join(out, "locked-computer-use-installer");
  assert.equal(statSync(installer).mode & 0o777, 0o755);
  assert.ok(existsSync(join(out, "README.md")));
});

void test("--require-team refuses an unsigned build", { skip: macOnly }, (t) => {
  const out = join(tempDir(t), "out");
  const result = runScript(["--require-team", "--out", out], { PORACODE_LCU_TEAM_ID: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /PORACODE_LCU_TEAM_ID is required/u);
  assert.equal(existsSync(out), false);
});
