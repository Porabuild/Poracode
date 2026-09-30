import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const WORKFLOW_PATH = new URL("../.github/workflows/v2-perf-qualification.yml", import.meta.url);

// Exact pins reused from the repository's other workflows (ci.yml, native-ci.yml).
// The `# vX` comments in the workflow are cosmetic; the pinned SHA is the pin.
const PINNED_ACTIONS = {
  "actions/checkout": "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
  "pnpm/action-setup": "pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271",
  "actions/setup-node": "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/upload-artifact": "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
};

async function readWorkflow() {
  return parse(await readFile(WORKFLOW_PATH, "utf8"));
}

void test("the qualification workflow never runs on push or pull_request and only schedules sustained", async () => {
  const workflow = await readWorkflow();
  assert.deepEqual(Object.keys(workflow.on).sort(), ["schedule", "workflow_dispatch"]);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["mode"]);

  assert.equal(workflow.on.schedule.length, 1);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = workflow.on.schedule[0].cron.split(" ");
  assert.equal(dayOfMonth, "*");
  assert.equal(month, "*");
  assert.equal(dayOfWeek, "1", "the weekly cell runs on Mondays");
  assert.notEqual(minute, "0", "the weekly cron must stay off the hour mark");
  assert.notEqual(minute, "30", "the weekly cron must stay off the half-hour mark");
  assert.ok(Number(minute) >= 0 && Number(minute) <= 59);
  assert.ok(Number(hour) >= 0 && Number(hour) <= 23);

  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.equal(inputs.mode.type, "choice");
  assert.deepEqual(inputs.mode.options, ["sustained", "soak"]);
  assert.equal(inputs.mode.default, "sustained");
});

void test("sustained stays on the hosted macos-26 runner within the hosted job cap", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs.sustained;
  assert.equal(job["runs-on"], "macos-26");
  assert.equal(job["timeout-minutes"], 90);
  assert.ok(job["timeout-minutes"] <= 360, "the hosted runner caps jobs at 360 minutes");
  assert.match(
    job.if,
    /github\.event_name == 'schedule'/u,
    "the weekly schedule must reach the sustained job",
  );
  assert.match(job.if, /inputs\.mode == 'sustained'/u);
});

void test("soak is manual-only on the labeled self-hosted macOS ARM64 qualification runner", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs.soak;
  assert.deepEqual(job["runs-on"], ["self-hosted", "macOS", "ARM64", "v2-perf-qualification"]);
  assert.equal(job["timeout-minutes"], 1560);
  assert.ok(
    job["timeout-minutes"] > 24 * 60,
    "the soak job must outlive its >=24h cell (the default 360m cap would kill it)",
  );
  assert.match(job.if, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(job.if, /inputs\.mode == 'soak'/u);
  assert.doesNotMatch(job.if, /schedule/u, "the soak must never be scheduled");
});

void test("evidence uploads on failure but not cancellation, and every action stays pinned", async () => {
  const workflow = await readWorkflow();
  for (const [jobName, uploadStepName] of [
    ["sustained", "Upload sustained evidence"],
    ["soak", "Upload soak evidence"],
  ]) {
    const job = workflow.jobs[jobName];
    const upload = job.steps.find((step) => step.name === uploadStepName);
    assert.ok(upload, `${jobName} must upload its evidence`);
    assert.match(upload.if, /!\s*cancelled\(\)/u, `${jobName} evidence uploads on failure`);
    assert.equal(upload.uses, PINNED_ACTIONS["actions/upload-artifact"]);
    assert.ok(upload.with.path.includes("v2-perf-evidence"));
    for (const step of job.steps) {
      if (step.uses === undefined) continue;
      const action = step.uses.split("@")[0];
      assert.equal(
        step.uses,
        PINNED_ACTIONS[action],
        `${jobName} step "${step.name ?? action}" must reuse the repository's pinned action`,
      );
    }
  }
});

void test("both jobs drive the tracked CLI and provision the managed-session runtime", async () => {
  const workflow = await readWorkflow();
  for (const [jobName, mode] of [
    ["sustained", "sustained"],
    ["soak", "soak"],
  ]) {
    const job = workflow.jobs[jobName];
    const runStep = job.steps.find((step) =>
      step.run?.includes(`scripts/v2-perf-qualify.mjs ${mode}`),
    );
    assert.ok(runStep, `${jobName} must run the tracked qualification CLI`);
    assert.match(runStep.run, /--arm "\$PWD"/u);
    assert.match(runStep.run, /--out "\$V2Q_EVIDENCE_DIR"/u);
    assert.match(runStep.run, /set -euo pipefail/u);
    assert.doesNotMatch(runStep.run, /--duration/u, "workflow duration stays within its job cap");
    assert.equal(runStep.env.V2Q_EVIDENCE_DIR, "${{ runner.temp }}/v2-perf-evidence");

    const provision = job.steps.find((step) => step.name === "Provision Electron and node-pty");
    assert.ok(provision, `${jobName} must provision Electron and node-pty for the managed session`);
    assert.match(provision.run, /ensure-native-deps\.mjs --electron-native/u);
    assert.match(provision.run, /ci-rebuild-node-pty\.sh/u);

    const selfTests = job.steps.find((step) => step.name === "Qualification runner self-tests");
    assert.ok(selfTests, `${jobName} must run the CLI and workflow regression tests first`);
    assert.match(selfTests.run, /v2-perf-qualify\.test\.mjs/u);
    assert.match(selfTests.run, /v2-perf-qualify-workflows\.test\.mjs/u);
    assert.equal(workflow.env.PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE, "false");
  }
});
