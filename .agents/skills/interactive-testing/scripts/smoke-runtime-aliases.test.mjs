// In-process package/FS fixtures only: no server, build, Git, native app or child.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertWithin, copyRuntimeDependencies, hashTree } from "./smoke-runtime-files.mjs";

async function fixture(run) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "poracode-runtime-alias-")));
  const repoRoot = join(root, "checkout");
  const appRoot = join(root, "session/runtime");
  try {
    await mkdir(repoRoot, { recursive: true });
    await mkdir(appRoot, { recursive: true });
    await writeFile(join(repoRoot, "package.json"), "{}");
    await writeFile(join(appRoot, "package.json"), '{"type":"commonjs"}');
    await run({
      repoRoot,
      appRoot,
      manifest: (value) => writeFile(join(repoRoot, "package.json"), JSON.stringify(value)),
      require: createRequire(join(appRoot, "package.json")),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function installed(owner, key, manifest, source = 'module.exports="fixture";') {
  const path = join(owner, "node_modules", key);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "package.json"), JSON.stringify({ main: "index.cjs", ...manifest }));
  await writeFile(join(path, "index.cjs"), source);
  return path;
}

void test("declared aliases from each root dependency field copy and resolve their real package", async () => {
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    await fixture(async (f) => {
      await f.manifest({ [field]: { "fixture-compat": "npm:fixture-parser@^2" } });
      await installed(
        f.repoRoot,
        "fixture-compat",
        { name: "fixture-parser", version: "2.3.0" },
        'module.exports={version:"2.3.0",self:require.resolve("fixture-parser")};',
      );
      const result = await copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-compat"]);
      assert.equal(result.packages, 1);
      const resolved = f.require.resolve("fixture-compat");
      assertWithin(f.appRoot, resolved);
      assert.equal(f.require("fixture-compat").self, resolved);
      assert.equal(f.require("fixture-compat").version, "2.3.0");
      assert.equal(
        JSON.parse(await readFile(join(dirname(resolved), "package.json"))).name,
        "fixture-parser",
      );
      assert.ok((await hashTree(f.appRoot)).files > 0);
    });
  }
});

void test("nested and scoped aliases use the immediate owner and preserve multiple installed versions", async () => {
  await fixture(async (f) => {
    await f.manifest({
      dependencies: { "fixture-parent": "1", "fixture-compat": "npm:fixture-parser@2" },
    });
    await installed(
      f.repoRoot,
      "fixture-compat",
      { name: "fixture-parser", version: "2.0.0" },
      'module.exports="root-v2";',
    );
    const parent = await installed(
      f.repoRoot,
      "fixture-parent",
      {
        name: "fixture-parent",
        version: "1.0.0",
        dependencies: {
          "fixture-compat": "npm:fixture-parser@1",
          "@compat/reader": "npm:@real/reader@~3.0",
        },
      },
      'module.exports=[require("fixture-compat"),require("@compat/reader")];',
    );
    await installed(
      parent,
      "fixture-compat",
      { name: "fixture-parser", version: "1.0.0" },
      'module.exports="nested-v1";',
    );
    await installed(
      parent,
      "@compat/reader",
      { name: "@real/reader", version: "3.0.4" },
      'module.exports="scoped-v3";',
    );
    const result = await copyRuntimeDependencies(f.repoRoot, f.appRoot, [
      "fixture-parent",
      "fixture-compat",
    ]);
    assert.equal(result.packages, 4);
    assert.equal(f.require("fixture-compat"), "root-v2");
    assert.deepEqual(f.require("fixture-parent"), ["nested-v1", "scoped-v3"]);
    const nested = createRequire(f.require.resolve("fixture-parent"));
    assert.notEqual(nested.resolve("fixture-compat"), f.require.resolve("fixture-compat"));
    assertWithin(f.appRoot, nested.resolve("@compat/reader"));
    assert.ok((await hashTree(f.appRoot)).files > 0);
  });
});

void test("normal and aliased edges to the same physical package deduplicate inside the session", async () => {
  await fixture(async (f) => {
    await f.manifest({
      dependencies: { "fixture-parser": "2", "@compat/parser": "npm:fixture-parser@2" },
    });
    const actual = await installed(f.repoRoot, "fixture-parser", {
      name: "fixture-parser",
      version: "2.0.0",
    });
    const link = join(f.repoRoot, "node_modules/@compat/parser");
    await mkdir(dirname(link), { recursive: true });
    await symlink(actual, link, process.platform === "win32" ? "junction" : "dir");
    const result = await copyRuntimeDependencies(f.repoRoot, f.appRoot, [
      "fixture-parser",
      "@compat/parser",
    ]);
    assert.equal(result.packages, 1);
    assert.equal(f.require.resolve("fixture-parser"), f.require.resolve("@compat/parser"));
    assertWithin(f.appRoot, await realpath(join(f.appRoot, "node_modules/@compat/parser")));
    assert.ok((await hashTree(f.appRoot)).files > 0);
  });
});

void test("alias copies retain bytes after checkout replacement and deletion, including lazy native files", async () => {
  await fixture(async (f) => {
    await f.manifest({ dependencies: { "fixture-compat": "npm:fixture-native@1" } });
    const source = await installed(
      f.repoRoot,
      "fixture-compat",
      { name: "fixture-native", version: "1.0.0" },
      'module.exports=require("node:fs").readFileSync(require("node:path").join(__dirname,"native.bin"),"utf8");',
    );
    await writeFile(join(source, "native.bin"), "native-A");
    await copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-compat"]);
    const before = await hashTree(f.appRoot);
    await writeFile(join(source, "native.bin"), "native-B");
    await rm(f.repoRoot, { recursive: true, force: true });
    assert.equal(f.require("fixture-compat"), "native-A");
    assert.deepEqual(await hashTree(f.appRoot), before);
  });
});

void test("unconfigured aliases and declared aliases containing the wrong package are refused", async () => {
  for (const [manifest, actual] of [
    [{}, "fixture-real"],
    [{ dependencies: { "fixture-compat": "1" } }, "fixture-real"],
    [{ dependencies: { "fixture-compat": "npm:fixture-real@1" } }, "fixture-other"],
    [{ dependencies: { "fixture-compat": "npm:fixture-real@1" } }, "fixture-compat"],
  ]) {
    await fixture(async (f) => {
      await f.manifest(manifest);
      await installed(f.repoRoot, "fixture-compat", { name: actual, version: "1.0.0" });
      await assert.rejects(copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-compat"]), {
        code: "ERR_RUNTIME_PACKAGE_NAME",
      });
    });
  }
});

void test("root alias declarations never authorize a mismatched nested owner's package", async () => {
  await fixture(async (f) => {
    await f.manifest({
      dependencies: { "fixture-parent": "1", "fixture-compat": "npm:fixture-real@1" },
    });
    const parent = await installed(f.repoRoot, "fixture-parent", {
      name: "fixture-parent",
      version: "1.0.0",
      dependencies: { "fixture-compat": "1" },
    });
    await installed(parent, "fixture-compat", { name: "fixture-real", version: "1.0.0" });
    await assert.rejects(copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-parent"]), {
      code: "ERR_RUNTIME_PACKAGE_NAME",
    });
  });
});

void test("missing required roots and aliased transitive dependencies remain failures", async () => {
  await fixture(async (f) => {
    await assert.rejects(copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-required"]), {
      code: "MODULE_NOT_FOUND",
    });
    await f.manifest({ optionalDependencies: { "fixture-optional-root": "npm:fixture-real@1" } });
    await assert.rejects(
      copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-optional-root"]),
      { code: "MODULE_NOT_FOUND" },
    );
    await installed(f.repoRoot, "fixture-parent", {
      name: "fixture-parent",
      version: "1.0.0",
      dependencies: { "fixture-required": "npm:fixture-real@1" },
    });
    await assert.rejects(copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-parent"]), {
      code: "MODULE_NOT_FOUND",
    });
  });
});

void test("only absent optional aliases/peers are skipped; an installed broken graph is refused", async () => {
  await fixture(async (f) => {
    await installed(f.repoRoot, "fixture-parent", {
      name: "fixture-parent",
      version: "1.0.0",
      optionalDependencies: { "fixture-optional": "npm:fixture-real@1" },
      peerDependencies: { "fixture-peer": "npm:@real/peer@1" },
      peerDependenciesMeta: { "fixture-peer": { optional: true } },
    });
    const good = await copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-parent"]);
    assert.equal(good.packages, 1);
  });
  for (const wrongName of [true, false])
    await fixture(async (f) => {
      const parent = await installed(f.repoRoot, "fixture-parent", {
        name: "fixture-parent",
        version: "1.0.0",
        optionalDependencies: { "fixture-optional": "npm:fixture-real@1" },
      });
      await installed(parent, "fixture-optional", {
        name: wrongName ? "fixture-other" : "fixture-real",
        version: "1.0.0",
        dependencies: { "fixture-required": "1" },
      });
      await assert.rejects(copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-parent"]), {
        code: wrongName ? "ERR_RUNTIME_PACKAGE_NAME" : "MODULE_NOT_FOUND",
      });
    });
});

void test("optional declaration overrides regular dependency identity and malformed aliases fail", async () => {
  await fixture(async (f) => {
    await f.manifest({
      dependencies: { "fixture-compat": "npm:fixture-first@1" },
      optionalDependencies: { "fixture-compat": "npm:fixture-second@2" },
    });
    await installed(f.repoRoot, "fixture-compat", { name: "fixture-second", version: "2.0.0" });
    assert.equal(
      (await copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-compat"])).packages,
      1,
    );
  });
  for (const spec of [
    "npm:fixture-real",
    "npm:@real/parser",
    "npm:fixture-real@",
    "npm:fixture-real@ ",
    "npm:../outside@1",
  ]) {
    await fixture(async (f) => {
      await f.manifest({ dependencies: { "fixture-compat": spec } });
      await installed(f.repoRoot, "fixture-compat", { name: "fixture-real", version: "1.0.0" });
      await assert.rejects(
        copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-compat"]),
        /Invalid npm alias/,
      );
    });
  }
});

void test("ordinary undeclared roots remain supported without a root manifest", async () => {
  await fixture(async (f) => {
    await rm(join(f.repoRoot, "package.json"));
    await installed(f.repoRoot, "fixture-plain", { name: "fixture-plain", version: "1.0.0" });
    assert.equal(
      (await copyRuntimeDependencies(f.repoRoot, f.appRoot, ["fixture-plain"])).packages,
      1,
    );
    assert.equal(f.require("fixture-plain"), "fixture");
  });
});

void test("actual streamdown-marked npm alias resolves a fully copied installed Marked17 package", async () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const manifest = JSON.parse(await readFile(join(repoRoot, "package.json")));
  assert.equal(manifest.dependencies["streamdown-marked"], "npm:marked@17.0.6");
  await fixture(async (f) => {
    const source = createRequire(join(repoRoot, "package.json")).resolve("streamdown-marked");
    assert.equal(
      (await copyRuntimeDependencies(repoRoot, f.appRoot, ["streamdown-marked"])).packages,
      1,
    );
    const copied = f.require.resolve("streamdown-marked");
    assertWithin(f.appRoot, copied);
    assert.notEqual(await realpath(copied), await realpath(source));
    assert.deepEqual(await readFile(copied), await readFile(source));
    const packageManifest = JSON.parse(
      await readFile(join(f.appRoot, "node_modules/streamdown-marked/package.json")),
    );
    assert.equal(packageManifest.name, "marked");
    assert.equal(packageManifest.version, "17.0.6");
    assert.ok((await hashTree(f.appRoot)).files > 0);
  });
});
