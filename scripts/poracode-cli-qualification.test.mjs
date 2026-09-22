import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { stageOwnedRuntimeTarball } from "./poracode-cli-qualification.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A real runtime tarball carrying the shipped install scripts and no deps. */
function buildRuntimeTarball(root, version = "9.9.9") {
  const stage = join(root, "stage");
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources", "wsl-helpers"), { recursive: true });
  mkdirSync(join(stage, "scripts"), { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        name: "poracode-server",
        version,
        private: true,
        engines: { node: ">=24.10.0" },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(stage, "lib", "server.cjs"),
    "process.stdout.write(JSON.stringify({ stub: true, argv: process.argv.slice(2), " +
      "appVersion: process.env.PORACODE_APP_VERSION }) + '\\n');\n",
  );
  writeFileSync(join(stage, "resources", "wsl-helpers", "README.md"), "stub helpers\n");
  for (const script of ["server-release-install.mjs", "server-native-overlay.mjs"]) {
    cpSync(join(repoRoot, "scripts", script), join(stage, "scripts", script));
  }
  const tarball = join(root, "poracode-server-stub.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", stage, "."], { stdio: "pipe" });
  return tarball;
}

void test("stageOwnedRuntimeTarball copies the caller's artifact into the work root", () => {
  const root = tempDir("poracode-cli-qualify-copy-");
  const source = buildRuntimeTarball(root);
  const workRoot = join(root, "work");
  mkdirSync(workRoot, { recursive: true });
  const owned = stageOwnedRuntimeTarball(source, workRoot);
  assert.notEqual(owned, source);
  assert.ok(owned.startsWith(workRoot));
  assert.deepEqual(readFileSync(owned), readFileSync(source));
  assert.ok(existsSync(source));
});

void test("qualification never deletes the supplied real tarball", { timeout: 240_000 }, () => {
  const root = tempDir("poracode-cli-qualify-real-");
  const source = buildRuntimeTarball(root);
  const output = execFileSync(
    process.execPath,
    [
      join(repoRoot, "scripts", "poracode-cli-qualification.mjs"),
      "--runtime-tarball",
      source,
      "--target",
      `${process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime ? "linuxmusl" : process.platform}-${process.arch}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = JSON.parse(output.trim().split("\n").at(-1));
  assert.equal(result.ok, true);
  assert.equal(result.runtimeTarballSource, source);
  assert.ok(result.runtimeSha256.length === 64);
  assert.ok(
    existsSync(source),
    "the qualified tarball handed to qualification must survive the run",
  );
});
