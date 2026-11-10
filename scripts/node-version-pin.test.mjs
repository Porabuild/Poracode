import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

// A floating `node-version: "26"` silently moved CI from Node 24 to 26.13.0
// and turned the weekly WSL qualification red (2026-11-04). Every CI Node
// install is pinned to the exact `.nvmrc` version; bump them together.
const root = new URL("../", import.meta.url);

async function workflowFiles() {
  const files = [];
  for (const name of await readdir(new URL(".github/workflows/", root))) {
    if (name.endsWith(".yml") || name.endsWith(".yaml")) files.push(`.github/workflows/${name}`);
  }
  for (const action of await readdir(new URL(".github/actions/", root))) {
    files.push(`.github/actions/${action}/action.yml`);
  }
  return files;
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  assert.ok(match, `expected an exact x.y.z Node version, got ${JSON.stringify(value)}`);
  return match.slice(1).map(Number);
}

void test(".nvmrc pins an exact Node version that satisfies package.json engines", async () => {
  const pinned = (await readFile(new URL(".nvmrc", root), "utf8")).trim();
  const [major, minor, patch] = parseVersion(pinned);
  const engines = JSON.parse(await readFile(new URL("package.json", root), "utf8")).engines.node;
  const floor = /^>=(\d+)\.(\d+)\.(\d+)$/u.exec(engines);
  assert.ok(floor, `engines.node must be a >=x.y.z floor, got ${engines}`);
  const [floorMajor, floorMinor, floorPatch] = floor.slice(1).map(Number);
  const satisfies =
    major > floorMajor ||
    (major === floorMajor && (minor > floorMinor || (minor === floorMinor && patch >= floorPatch)));
  assert.ok(satisfies, `.nvmrc ${pinned} must satisfy engines.node ${engines}`);
});

void test("every CI Node install uses the exact .nvmrc version", async () => {
  const pinned = (await readFile(new URL(".nvmrc", root), "utf8")).trim();
  let checked = 0;
  for (const file of await workflowFiles()) {
    const source = await readFile(new URL(file, root), "utf8").catch(() => null);
    if (source === null) continue;
    for (const match of source.matchAll(/node-version:\s*["']?([^"'\s#]+)["']?/gu)) {
      checked += 1;
      assert.equal(match[1], pinned, `${file} installs Node ${match[1]} instead of ${pinned}`);
    }
    for (const match of source.matchAll(/\bnode:(\d[^\s"'@-]*)/gu)) {
      checked += 1;
      assert.equal(
        match[1],
        pinned,
        `${file} runs the node:${match[1]} image instead of ${pinned}`,
      );
    }
    assert.doesNotMatch(source, /node-version-file:/u, `${file}: pin literally, not by file`);
  }
  assert.ok(checked > 0, "expected at least one pinned CI Node install");
});
