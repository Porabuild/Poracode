import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSmokeRunnerArgs } from "./smoke-runner-cli.mjs";

const script = fileURLToPath(new URL("./run-poracode-smoke.mjs", import.meta.url));
const repo = fileURLToPath(new URL("../../../../", import.meta.url));

void test("documented launch forms preserve scope, isolation and session options", () => {
  assert.equal(parseSmokeRunnerArgs([]).scope, "changed");
  const args = parseSmokeRunnerArgs([
    "--scope=full",
    "--mode",
    "mock",
    "--launch-only",
    "--new",
    "--root",
    "/private/session",
    "--port",
    "9223",
    "--vitePort",
    "3101",
    "--startupTimeoutSeconds",
    "450",
    "--reuse-fixture",
    "--rendererViteHMR",
  ]);
  assert.equal(args.scope, "full");
  assert.equal(args.mode, "mock");
  assert.equal(args["launch-only"], true);
  assert.equal(args.new, true);
  assert.equal(args.root, "/private/session");
  assert.equal(args.startupTimeoutSeconds, "450");
});

void test("help and invalid arguments exit before filesystem or launch effects", () => {
  // An in-repository root also makes the old runner fail closed: a regression
  // cannot start an app from this subprocess test.
  const parent = mkdtempSync(join(repo, "tmp/smoke-cli-test-"));
  const root = join(parent, "must-not-be-created");
  try {
    for (const flag of ["--help", "-h"]) {
      const output = execFileSync(process.execPath, [script, flag, "--root", root], {
        encoding: "utf8",
        timeout: 5000,
        maxBuffer: 8192,
      });
      assert.match(output, /Usage:/);
      assert.match(output, /--scope changed\|full/);
      assert.equal(existsSync(root), false);
    }
    for (const [args, message] of [
      [["--scop", "full"], /Unknown option/],
      [["--scope", "unrecognized"], /--scope must be/],
      [["--mode", "unknown"], /--mode must be/],
      [["--port=-1"], /--port must be/],
      [["--startupTimeoutSeconds", "Infinity"], /positive finite number/],
      [["--scope"], /argument/],
    ]) {
      assert.throws(
        () =>
          execFileSync(process.execPath, [script, ...args, "--root", root], {
            encoding: "utf8",
            timeout: 5000,
            maxBuffer: 8192,
            stdio: "pipe",
          }),
        (error) => error.status === 1 && message.test(error.stderr),
      );
      assert.equal(existsSync(root), false);
    }
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
