import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as launcherTools from "../lib/hostTools.mjs";
import * as scriptTools from "../../../scripts/server-host-tools.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function sharedSection(path) {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("// --- shared:begin");
  const end = source.indexOf("// --- shared:end");
  assert.ok(start >= 0 && end > start, `${path} must carry the shared markers`);
  return source.slice(start, end);
}

void test("the launcher host-tools twin has a byte-identical shared section", () => {
  const scripts = sharedSection(join(root, "scripts", "server-host-tools.mjs"));
  const launcher = sharedSection(join(root, "packages", "poracode-cli", "lib", "hostTools.mjs"));
  // Only the marker comment's own annotation may differ.
  const normalize = (text) => text.replace(/^\/\/ --- shared:begin.*$/mu, "");
  assert.equal(normalize(launcher), normalize(scripts));
});

void test("both host-tools modules export the same API", () => {
  assert.deepEqual(Object.keys(launcherTools).sort(), Object.keys(scriptTools).sort());
});

void test("both host-tools modules behave identically on injected Windows inputs", () => {
  const win = {
    platform: "win32",
    env: { SystemRoot: "D:\\Win", LOCALAPPDATA: "D:\\Local" },
    execPath: "D:\\node\\node.exe",
    exists: (path) => path === "D:\\Win\\System32\\tar.exe",
  };
  for (const tools of [launcherTools, scriptTools]) {
    assert.deepEqual(tools.resolveTar(win), {
      command: "D:\\Win\\System32\\tar.exe",
      baseArgs: [],
    });
    assert.deepEqual(tools.resolveTar({ ...win, exists: () => false, run: () => "GNU tar 1.35" }), {
      command: "tar",
      baseArgs: ["--force-local"],
    });
    assert.deepEqual(tools.npmInvocation(["install"], { ...win, exists: () => false }), {
      command: "npm.cmd",
      args: ["install"],
      shell: true,
    });
    assert.equal(tools.defaultServerPrefix("win32", win.env), "D:\\Local\\Poracode\\server");
    assert.equal(tools.defaultServerPrefix("linux", {}), "/opt/poracode");
  }
});
