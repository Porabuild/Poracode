import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const WORKFLOW_PATH = new URL(
  "../.github/workflows/windows-wsl-qualification.yml",
  import.meta.url,
);

// Exact pins reused from the repository's other workflows (ci.yml,
// v2-perf-qualification.yml). The `# vX` comments in the workflow are cosmetic;
// the pinned SHA is the pin.
const PINNED_ACTIONS = {
  "actions/checkout": "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
  "pnpm/action-setup": "pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271",
  "actions/setup-node": "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/upload-artifact": "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
};

const HOSTED_JOB = "hosted_nat";
const MIRRORED_JOB = "selfhosted_mirrored";
const PROVISION_STEP = {
  [HOSTED_JOB]: "Provision the WSL lab (NAT + sshd)",
  [MIRRORED_JOB]: "Provision the WSL lab (mirrored + sshd)",
};
async function readWorkflow() {
  return parse(await readFile(WORKFLOW_PATH, "utf8"));
}

function stepByName(job, name) {
  return job.steps.find((step) => step.name === name);
}

void test("the workflow never runs on push or pull_request", async () => {
  const workflow = await readWorkflow();
  assert.deepEqual(Object.keys(workflow.on).sort(), ["schedule", "workflow_dispatch"]);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

void test("the schedule is weekly, off-minute, and is the only scheduled trigger", async () => {
  const workflow = await readWorkflow();
  assert.equal(workflow.on.schedule.length, 1);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = workflow.on.schedule[0].cron.split(" ");
  assert.notEqual(minute, "0", "the cron must stay off the hour mark");
  assert.notEqual(minute, "30", "the cron must stay off the half-hour mark");
  assert.equal(dayOfMonth, "*");
  assert.equal(month, "*");
  assert.ok(Number(dayOfWeek) >= 0 && Number(dayOfWeek) <= 6);
  assert.ok(Number(hour) >= 0 && Number(hour) <= 23);
});

void test("run_mirrored is an optional boolean dispatch input defaulting to false", async () => {
  const workflow = await readWorkflow();
  const input = workflow.on.workflow_dispatch.inputs.run_mirrored;
  assert.equal(input.type, "boolean");
  assert.equal(input.required, false);
  assert.equal(input.default, false);
});

void test("the hosted NAT leg stays on windows-latest, time-bounded, NAT-only", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs[HOSTED_JOB];
  assert.equal(job["runs-on"], "windows-latest");
  assert.equal(typeof job["timeout-minutes"], "number");
  assert.ok(job["timeout-minutes"] > 0 && job["timeout-minutes"] <= 360, "hosted cap is 360m");

  const provision = stepByName(job, PROVISION_STEP[HOSTED_JOB]);
  assert.ok(provision, "the hosted leg must provision the lab");
  assert.match(provision.run, /--mode nat\b/u);
  assert.match(provision.run, /--with-sshd/u);
  assert.match(provision.run, /--rootfs-sha256 "\$WSL_ROOTFS_SHA256"/u);
  assert.equal(job.env.WSL_ROOTFS_SHA256, "${{ vars.WSL_ROOTFS_SHA256 }}");
  assert.equal(provision.env.WSL_LAB_EVIDENCE_DIR, "${{ runner.temp }}/windows-wsl-lab-evidence");
  assert.equal(provision.env.WSL_LAB_STATE_DIR, "${{ runner.temp }}/windows-wsl-lab-state");
  assert.match(provision.run, /--out "\$WSL_LAB_EVIDENCE_DIR"/u);
  assert.match(provision.run, /--state "\$WSL_LAB_STATE_DIR"/u);
  assert.match(provision.run, /set -euo pipefail/u);
  assert.doesNotMatch(
    provision.run,
    /--mode mirrored/u,
    "hosted Windows Server must never claim mirrored mode",
  );
});

void test("the hosted sshd leg really exercises ssh, not just provisioning", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs[HOSTED_JOB];
  const provision = stepByName(job, PROVISION_STEP[HOSTED_JOB]);
  assert.match(provision.run, /--with-sshd/u, "the hosted leg is the real-SSH leg");
});

void test("the mirrored leg is manual-only on the labeled self-hosted Windows 11 runner", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs[MIRRORED_JOB];
  assert.deepEqual(job["runs-on"], [
    "self-hosted",
    "Windows",
    "windows11",
    "poracode-wsl-mirrored",
  ]);
  assert.equal(typeof job["timeout-minutes"], "number");
  assert.ok(job["timeout-minutes"] > 0);
  assert.match(job.if, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(job.if, /inputs\.run_mirrored == true/u);
  assert.doesNotMatch(job.if, /schedule/u, "the mirrored leg must never be scheduled");

  const provision = stepByName(job, PROVISION_STEP[MIRRORED_JOB]);
  assert.ok(provision);
  assert.match(provision.run, /--mode mirrored\b/u);
  assert.match(provision.run, /--rootfs-sha256 "\$WSL_ROOTFS_SHA256"/u);
  assert.equal(job.env.WSL_ROOTFS_SHA256, "${{ vars.WSL_ROOTFS_SHA256 }}");
  assert.equal(provision.env.WSL_LAB_EVIDENCE_DIR, "${{ runner.temp }}/windows-wsl-lab-evidence");
  assert.equal(provision.env.WSL_LAB_STATE_DIR, "${{ runner.temp }}/windows-wsl-lab-state");
});

void test("both legs drive the fail-closed suite with the lab manifest wired in", async () => {
  const workflow = await readWorkflow();
  for (const jobName of [HOSTED_JOB, MIRRORED_JOB]) {
    const job = workflow.jobs[jobName];
    const suite = job.steps.find((step) => step.run?.includes("tests/real-wsl/vitest.config.ts"));
    assert.ok(suite, `${jobName} must run the real-WSL suite`);
    assert.match(suite.run, /vitest run --configLoader runner/u);
    assert.match(suite.run, /tee "\$WSL_LAB_EVIDENCE_DIR\/real-wsl-suite\.log"/u);
    assert.equal(suite.env.PORACODE_WSL_LAB, "1");
    assert.equal(
      suite.env.PORACODE_WSL_LAB_JSON,
      "${{ runner.temp }}/windows-wsl-lab-evidence/lab.json",
    );
    assert.equal(suite.env.WSL_LAB_EVIDENCE_DIR, "${{ runner.temp }}/windows-wsl-lab-evidence");
  }
});

void test("both legs run the self-tests before spending lab time", async () => {
  const workflow = await readWorkflow();
  for (const jobName of [HOSTED_JOB, MIRRORED_JOB]) {
    const job = workflow.jobs[jobName];
    const selfTests = job.steps.find((step) => step.name === "Lab and workflow self-tests");
    assert.ok(selfTests, `${jobName} must run the regression tests first`);
    assert.match(selfTests.run, /ci-windows-wsl-lab\.test\.mjs/u);
    assert.match(selfTests.run, /windows-wsl-qualification-workflow\.test\.mjs/u);
  }
});

void test("evidence uploads on success and failure but never on cancellation", async () => {
  const workflow = await readWorkflow();
  for (const jobName of [HOSTED_JOB, MIRRORED_JOB]) {
    const job = workflow.jobs[jobName];
    const upload = job.steps.find((step) => step.uses?.startsWith("actions/upload-artifact"));
    assert.ok(upload, `${jobName} must upload its evidence`);
    assert.match(upload.if, /!\s*cancelled\(\)/u, `${jobName} evidence uploads on failure`);
    assert.doesNotMatch(upload.if, /always\(\)/u, "evidence must not upload on cancellation");
    assert.equal(upload.with["if-no-files-found"], "warn");
    assert.match(upload.with.path, /windows-wsl-lab-evidence/u);
    assert.ok(upload.with["retention-days"] > 0);
  }
});

void test("both legs clean up only lab-owned state", async () => {
  const workflow = await readWorkflow();
  for (const jobName of [HOSTED_JOB, MIRRORED_JOB]) {
    const job = workflow.jobs[jobName];
    const cleanup = job.steps.find((step) => step.run?.includes("ci-windows-wsl-lab.mjs cleanup"));
    assert.ok(cleanup, `${jobName} must clean up its lab`);
    assert.match(
      cleanup.if,
      /always\(\)/u,
      "cleanup runs after success, failure, and cancellation",
    );
    assert.match(cleanup.run, /--state "\$WSL_LAB_STATE_DIR"/u);
    assert.equal(cleanup.env.WSL_LAB_STATE_DIR, "${{ runner.temp }}/windows-wsl-lab-state");
  }
});

void test("every action stays pinned to the repository's SHAs", async () => {
  const workflow = await readWorkflow();
  for (const jobName of [HOSTED_JOB, MIRRORED_JOB]) {
    for (const step of workflow.jobs[jobName].steps) {
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

void test("both legs serialize through their own concurrency groups", async () => {
  const workflow = await readWorkflow();
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.match(workflow.concurrency.group, /windows-wsl-qualification/u);
  const mirrored = workflow.jobs[MIRRORED_JOB];
  assert.equal(mirrored.concurrency["cancel-in-progress"], false);
  assert.match(mirrored.concurrency.group, /windows-wsl-qualification/u);
  assert.notEqual(workflow.concurrency.group, mirrored.concurrency.group);
});

void test("the workflow pins a bash shell so the POSIX run steps are honest", async () => {
  const workflow = await readWorkflow();
  assert.equal(workflow.defaults?.run?.shell, "bash");
});
