import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const WATCHED_PATHS = [
  "src/renderer/**",
  "vitest.browser.config.ts",
  "patches/**",
  "bun.lock",
  ".github/workflows/browser-layout.yml",
];

void test("the browser layout workflow runs real Chromium outside the required gate", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/browser-layout.yml", import.meta.url), "utf8"),
  );
  assert.equal(workflow.name, "Browser layout tests");
  for (const trigger of ["pull_request", "push"]) {
    assert.ok(workflow.on[trigger], `${trigger} trigger must exist`);
    for (const path of WATCHED_PATHS) {
      assert.ok(workflow.on[trigger].paths.includes(path), `${trigger} must watch ${path}`);
    }
  }

  const job = workflow.jobs.browser_layout;
  assert.ok(job, "the browser_layout job must exist");
  const runs = job.steps.map((step) => step.run).filter(Boolean);
  const install = runs.findIndex((run) => run.includes("playwright install --with-deps chromium"));
  const tests = runs.findIndex((run) => run === "bun run test:browser");
  assert.ok(install >= 0 && tests > install, "Chromium is installed before the tests run");

  const ci = parse(await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"));
  assert.ok(
    !ci.jobs.browser_layout,
    "the job must not live in ci.yml: ci_gate.needs must cover every job there",
  );

  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts["test:browser"], /--config vitest\.browser\.config\.ts/u);
});
