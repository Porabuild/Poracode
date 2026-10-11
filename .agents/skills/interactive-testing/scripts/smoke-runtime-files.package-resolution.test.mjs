import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyRuntimeDependencies } from "./smoke-runtime-files.mjs";

void test("copies a declared transitive npm package whose name is also a Node builtin", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-builtin-package-"));
  const repo = join(root, "source");
  const app = join(root, "app");
  const outer = join(repo, "node_modules", "fixture-outer");
  const nested = join(outer, "node_modules", "punycode");
  try {
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({ dependencies: { "fixture-outer": "1.0.0" } }),
    );
    await writeFile(
      join(outer, "package.json"),
      JSON.stringify({
        name: "fixture-outer",
        version: "1.0.0",
        dependencies: { punycode: "2.3.1" },
      }),
    );
    await writeFile(
      join(nested, "package.json"),
      JSON.stringify({ name: "punycode", version: "2.3.1", main: "index.js" }),
    );
    await writeFile(join(nested, "index.js"), "module.exports = 'declared npm package';\n");
    assert.equal(createRequire(join(outer, "package.json")).resolve.paths("punycode"), null);
    const copied = await copyRuntimeDependencies(repo, app, ["fixture-outer"]);
    assert.equal(copied.packages, 2);
    const target = await realpath(
      join(app, "node_modules", "fixture-outer", "node_modules", "punycode"),
    );
    assert(target.startsWith((await realpath(app)) + "/"));
    assert.equal(
      await readFile(join(target, "index.js"), "utf8"),
      "module.exports = 'declared npm package';\n",
    );
    await rm(repo, { recursive: true });
    assert.equal(JSON.parse(await readFile(join(target, "package.json"), "utf8")).version, "2.3.1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("builtin-name fallback still rejects an installed package with the wrong name", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-builtin-name-guard-"));
  const repo = join(root, "source");
  try {
    await mkdir(join(repo, "node_modules", "punycode"), { recursive: true });
    await writeFile(
      join(repo, "package.json"),
      JSON.stringify({ dependencies: { punycode: "2.3.1" } }),
    );
    await writeFile(
      join(repo, "node_modules", "punycode", "package.json"),
      JSON.stringify({ name: "unexpected-package", version: "2.3.1" }),
    );
    await assert.rejects(
      copyRuntimeDependencies(repo, join(root, "app"), ["punycode"]),
      /wrong package name/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
