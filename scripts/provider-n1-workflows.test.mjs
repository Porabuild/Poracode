import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

const WORKFLOW_PATH = new URL(
  "../.github/workflows/provider-n1-qualification.yml",
  import.meta.url,
);

// Exact pins reused from the repository's other workflows. The `# vX`
// comments are cosmetic; the pinned SHA is the pin.
const PINNED_ACTIONS = {
  "actions/checkout": "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
  "pnpm/action-setup": "pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271",
  "actions/setup-node": "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/upload-artifact": "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
};

const RUNNER_LABELS = ["self-hosted", "macOS", "ARM64", "provider-qualification"];
const JOBS = ["providers", "server_n1"];

// Workflows that must never invoke this one: the cells stay out of required
// PR/push/release gates until external runner credentials exist AND a first
// stable published server release provides a real N-1 predecessor.
const GATE_WORKFLOWS = [
  "ci.yml",
  "native-ci.yml",
  "_build.yml",
  "_server-artifact.yml",
  "release.yml",
  "release-nightly.yml",
];

async function readWorkflow() {
  return parse(await readFile(WORKFLOW_PATH, "utf8"));
}

void test("the workflow is dispatch-only and never wired into a required gate", async () => {
  const workflow = await readWorkflow();
  assert.deepEqual(Object.keys(workflow.on).sort(), ["workflow_dispatch"]);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.on.schedule, undefined);
  assert.equal(workflow.on.release, undefined);

  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.equal(inputs.required_providers.required, true);
  assert.equal(inputs.candidate_tarball_url.required, true);
  assert.equal(inputs.candidate_tarball_sha256.required, false);

  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.concurrency["cancel-in-progress"], false);

  for (const gate of GATE_WORKFLOWS) {
    const text = await readFile(new URL(`../.github/workflows/${gate}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      text,
      /provider-n1-qualification/u,
      `${gate} must not reference the dispatch-only qualification workflow`,
    );
  }
});

void test("both cells run on the explicit labeled self-hosted qualification runner", async () => {
  const workflow = await readWorkflow();
  for (const jobName of JOBS) {
    const job = workflow.jobs[jobName];
    assert.deepEqual(job["runs-on"], RUNNER_LABELS);
    assert.ok(Number.isSafeInteger(job["timeout-minutes"]) && job["timeout-minutes"] > 0);
  }
});

void test("the two cells serialize without suppressing independent N-1 evidence", async () => {
  const workflow = await readWorkflow();
  assert.equal(workflow.jobs.server_n1.needs, "providers");
  assert.match(workflow.jobs.server_n1.if, /always\(\).*?!cancelled\(\)/u);
});

void test("every action is pinned to the repository's exact SHAs", async () => {
  const workflow = await readWorkflow();
  for (const jobName of JOBS) {
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

void test("evidence uploads on success and failure but never on cancellation", async () => {
  const workflow = await readWorkflow();
  const uploads = {
    providers: "Upload provider qualification evidence",
    server_n1: "Upload N-1 gate evidence",
  };
  for (const [jobName, stepName] of Object.entries(uploads)) {
    const upload = workflow.jobs[jobName].steps.find((step) => step.name === stepName);
    assert.ok(upload, `${jobName} must upload its evidence`);
    assert.match(upload.if, /!\s*cancelled\(\)/u, `${jobName} evidence must upload on failure`);
    assert.equal(upload.uses, PINNED_ACTIONS["actions/upload-artifact"]);
    assert.ok(String(upload.with.name).includes("github.run_id"));
    assert.equal(upload.with["retention-days"], 30);
  }
});

void test("the providers cell drives the strict-mode lifecycle suite", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs.providers;
  const runStep = job.steps.find(
    (step) => step.name === "Run strict provider lifecycle qualification",
  );
  assert.ok(runStep, "the strict lifecycle step is required");
  assert.equal(
    runStep.env.PORACODE_LIVE_PROVIDERS_REQUIRED,
    "${{ inputs.required_providers }}",
    "the dispatch input must feed the strict-mode gate",
  );
  assert.match(runStep.run, /set -euo pipefail/u);
  assert.match(
    runStep.run,
    /vitest\.integration\.config\.ts/u,
    "the lifecycle suite runs under the integration config",
  );
  assert.match(runStep.run, /tests\/integration\/providers-lifecycle\.integration\.test\.ts/u);
  assert.match(
    runStep.run,
    /tests\/integration\/helpers\/liveProvidersRequired\.test\.ts/u,
    "the pure strict-mode parser tests run before any provider is started",
  );
  assert.match(
    runStep.run,
    /tee "\$PROVIDERS_EVIDENCE_DIR/u,
    "the log must land in the evidence dir",
  );
});

void test("the N-1 cell runs self-tests first and fails closed on the real gate", async () => {
  const workflow = await readWorkflow();
  const job = workflow.jobs.server_n1;
  const selfTests = job.steps.find((step) => step.name === "Qualification self-tests");
  assert.ok(selfTests, "the N-1 cell must run its regression tests before the gate");
  assert.match(selfTests.run, /server-n1-qualification\.test\.mjs/u);
  assert.match(selfTests.run, /provider-n1-workflows\.test\.mjs/u);

  const gate = job.steps.find((step) => step.name === "Run the published N-1 upgrade gate");
  assert.ok(gate, "the N-1 gate step is required");
  assert.match(gate.run, /scripts\/server-n1-qualification\.mjs/u);
  assert.match(gate.run, /--candidate-tarball "\$N1_EVIDENCE_DIR\/candidate\.tar\.gz"/u);
  assert.match(gate.run, /--out-dir "\$N1_EVIDENCE_DIR"/u);
  assert.equal(job.env?.GH_TOKEN, undefined);
  assert.equal(gate.env.GH_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  const download = job.steps.find((step) => step.name === "Download the candidate tarball");
  assert.equal(download.env.GH_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  assert.equal(download.env.N1_EVIDENCE_DIR, "${{ runner.temp }}/n1-qualification-evidence");
  assert.equal(gate.env.N1_EVIDENCE_DIR, "${{ runner.temp }}/n1-qualification-evidence");
});

void test("no token or pairing secret can reach a log through the workflow", async () => {
  const workflow = await readWorkflow();
  // Secrets only travel via env indirection, never inline in run scripts.
  for (const jobName of JOBS) {
    for (const step of workflow.jobs[jobName].steps) {
      if (typeof step.run !== "string") continue;
      assert.doesNotMatch(
        step.run,
        /secrets\./u,
        `${jobName} step "${step.name}" must read secrets through env, not inline interpolation`,
      );
      assert.doesNotMatch(
        step.run,
        /echo[^\n]*(GH_TOKEN|GITHUB_TOKEN|pairingUrl|Bearer )/iu,
        `${jobName} step "${step.name}" must never echo a token or pairing value`,
      );
      assert.doesNotMatch(
        step.run,
        /set -x/u,
        `${jobName} step "${step.name}" must not enable shell tracing (it would print the token header)`,
      );
    }
  }
  // The candidate URL is never printed either — only the expected sha goes
  // through echo (as shasum's check-file input).
  const download = workflow.jobs.server_n1.steps.find(
    (step) => step.name === "Download the candidate tarball",
  );
  assert.ok(download, "the candidate download step is required");
  assert.doesNotMatch(download.run, /echo[^\n]*CANDIDATE_URL/iu);
  assert.match(download.run, /url\.protocol !== "https:"/u);
  assert.match(download.run, /api\.github\.com/u);
  assert.match(download.run, /\^\[0-9a-f\]\{64\}\$/u);
});
