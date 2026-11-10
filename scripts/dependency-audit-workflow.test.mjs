import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const workflowUrl = new URL("../.github/workflows/dependency-audit.yml", import.meta.url);

void test("dependency audit fails on high or critical production advisories only", async () => {
  const workflow = parse(await readFile(workflowUrl, "utf8"));
  const steps = workflow.jobs.audit.steps;
  const audit = steps.find((step) => step.name === "Audit production dependencies");
  assert.ok(audit, "the production audit step must stay present");
  assert.equal(audit.run, "bun audit --production --audit-level=high");
  assert.equal(audit["continue-on-error"], undefined, "a failing audit must fail the job");
  const setupIndex = steps.findIndex((step) => step.uses === "./.github/actions/setup-bun");
  assert.ok(setupIndex >= 0 && setupIndex < steps.indexOf(audit), "the pinned Bun runs the audit");
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

void test("dependency audit runs on manifest changes and on a weekly schedule", async () => {
  const workflow = parse(await readFile(workflowUrl, "utf8"));
  for (const event of ["pull_request", "push"]) {
    const paths = workflow.on[event].paths;
    for (const path of ["package.json", "bun.lock", "bunfig.toml", "website/package.json"]) {
      assert.ok(paths.includes(path), `${event} must trigger on ${path}`);
    }
  }
  assert.equal(workflow.on.schedule.length, 1, "advisories against unchanged deps surface weekly");
  assert.ok("workflow_dispatch" in workflow.on);
});
