import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compareToBaseline,
  countProviderLiterals,
  main,
  providerIds,
} from "./provider-isolation-audit.mjs";

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "provider-isolation-"));
  for (const directory of [
    "src/supervisor/agents/alpha",
    "src/supervisor/agents/beta",
    "src/supervisor/agents/base",
    "src/renderer/components/providers/alpha",
    "src/renderer/components/providers/beta",
    "scripts",
  ]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

void test("provider ids are folders present as both a supervisor adapter and a renderer plugin", () => {
  const root = fixture({});
  try {
    assert.deepEqual(providerIds(root), ["alpha", "beta"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test("counts exact provider-id literals in shared code only", () => {
  const root = fixture({
    "src/shared/settings.ts": `if (kind === "alpha" || kind === 'beta') {}\nconst x = "alphabet";`,
    "src/shared/settings.test.ts": `expect("alpha").toBe("alpha");`,
    "src/supervisor/agents/alpha/index.ts": `export const id = "alpha";`,
    "src/renderer/components/providers/beta/index.tsx": `export const id = "beta";`,
  });
  try {
    assert.deepEqual(countProviderLiterals(root), { "src/shared/settings.ts": 2 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test("fails on new or increased literals and reports shrinking debt", () => {
  assert.deepEqual(compareToBaseline({ a: 2, b: 1 }, { a: 2 }).regressions, [
    { file: "b", count: 1, allowed: 0 },
  ]);
  assert.deepEqual(compareToBaseline({ a: 3 }, { a: 2 }).regressions, [
    { file: "a", count: 3, allowed: 2 },
  ]);
  assert.deepEqual(compareToBaseline({}, { a: 2 }).improvements, [
    { file: "a", count: 0, allowed: 2 },
  ]);

  const root = fixture({ "src/shared/x.ts": `const k = "alpha";` });
  try {
    writeFileSync(join(root, "scripts/provider-isolation-baseline.json"), "{}\n");
    assert.equal(main(["--root", root]), 1);
    assert.equal(main(["--root", root, "--update"]), 0);
    assert.equal(main(["--root", root]), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
