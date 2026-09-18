import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { parse } from "yaml";

const load = async (name) =>
  parse(await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8"));

void test("both qualification workflows run on the actual V2 and integration heads", async () => {
  for (const name of ["ci", "native-ci"]) {
    const workflow = await load(name);
    for (const branch of ["master", "poracode/v2", "poracode/v4-integration"]) {
      assert.ok(workflow.on.push.branches.includes(branch), `${name} push: ${branch}`);
      assert.ok(workflow.on.pull_request.branches.includes(branch), `${name} PR: ${branch}`);
    }
    assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  }
});

void test("core qualification has an unconditional gate covering every CI job", async () => {
  const { jobs } = await load("ci");
  assert.ok(jobs.ci_gate, "A workflow conclusion alone must not hide skipped required jobs");
  assert.equal(jobs.ci_gate.name, "CI required gate");
  assert.equal(jobs.ci_gate.if, "${{ always() }}");
  assert.deepEqual(
    [...jobs.ci_gate.needs].sort(),
    Object.keys(jobs)
      .filter((name) => name !== "ci_gate")
      .sort(),
  );
  const step = jobs.ci_gate.steps[0];
  const script = /^node -e '(.*)'$/.exec(step.run)?.[1];
  assert.ok(script, "Execute the actual aggregate gate against failure fixtures");
  const good = Object.fromEntries(jobs.ci_gate.needs.map((name) => [name, { result: "success" }]));
  const evaluate = (results) =>
    spawnSync(process.execPath, ["-e", script], {
      env: { ...process.env, JOB_RESULTS: JSON.stringify(results) },
    }).status;
  assert.equal(evaluate(good), 0);
  for (const name of jobs.ci_gate.needs) {
    for (const result of ["failure", "cancelled", "skipped"]) {
      assert.equal(evaluate({ ...good, [name]: { result } }), 1, `${name}: ${result}`);
    }
  }
});

void test("nightly publication is triggered by qualification, with one serialized alias owner", async () => {
  const workflow = await load("deploy-nightly-pwa");
  assert.equal(workflow.on.push, undefined, "A master push must not deploy independently of CI");
  assert.deepEqual([...workflow.on.workflow_run.workflows].sort(), ["CI", "Native clients"]);
  assert.deepEqual(workflow.on.workflow_run.types, ["completed"]);
  assert.deepEqual(workflow.on.workflow_run.branches, ["master"]);
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.equal(workflow.concurrency.group, "deploy-nightly-pwa-master");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.jobs.web.environment, "mobile-web");
  assert.equal(workflow.jobs.web.needs, "qualify");
  assert.equal(workflow.jobs.web.if, "${{ needs.qualify.outputs.qualified == 'true' }}");
  assert.equal(workflow.permissions.actions, "read");
  assert.equal(
    workflow.jobs.qualify.environment,
    undefined,
    "Qualification must not access deployment secrets",
  );
  assert.match(workflow.jobs.qualify.if, /github\.ref == 'refs\/heads\/master'/);
  const checkout = workflow.jobs.web.steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.with.ref, "${{ needs.qualify.outputs.sha }}");
  assert.equal(checkout.with["persist-credentials"], false);
  const publish = workflow.jobs.web.steps.find(
    (step) => step.name === "Deploy and update nightly alias",
  );
  const beforeUpload = publish.run.indexOf(
    'node scripts/qualify-nightly-pwa.mjs --require "$QUALIFIED_SHA"',
  );
  const upload = publish.run.indexOf("vercel deploy --prebuilt");
  const beforeAlias = publish.run.lastIndexOf(
    'node scripts/qualify-nightly-pwa.mjs --require "$QUALIFIED_SHA"',
  );
  const alias = publish.run.indexOf("vercel alias set");
  assert.ok(
    beforeUpload >= 0 && beforeUpload < upload && upload < beforeAlias && beforeAlias < alias,
  );
});

void test("native qualification preserves every existing contract, build, and foundation prerequisite", async () => {
  const { jobs } = await load("native-ci");
  assert.equal(jobs.native_gate.name, "Native required gate");
  assert.equal(jobs.native_gate.if, "${{ always() }}");
  assert.deepEqual([...jobs.native_gate.needs].sort(), [
    "android",
    "android_api26_runtime",
    "android_api37_runtime",
    "ios",
    "native_e2e_foundation",
    "remote_v3_contract",
  ]);
  for (const prerequisite of jobs.native_gate.needs)
    assert.ok(
      jobs.native_gate.steps[0].run.includes(
        `test "\u0024{{ needs.${prerequisite}.result }}" = "success"`,
      ),
    );
});

void test("each portable Swift contract suite is required, isolated, and cannot hide failure behind tee", async () => {
  const { jobs } = await load("native-ci");
  const step = jobs.ios.steps.find((item) => item.name === "Run portable Swift contract suites");
  assert.ok(step);
  assert.equal(step.shell, "bash");
  assert.equal(step["continue-on-error"], undefined);
  assert.match(step.run, /--jobs 2/);
  assert.match(step.run, /--scratch-path "\$RUNNER_TEMP\/poracode-swift-contracts\/\$suite"/);
  const suites = ["PortForwarding", "BrowserMirror", "GitHubOperations", "AdvancedOperations"];
  assert.ok(step.run.includes(`for suite in ${suites.join(" ")}; do`));
  await mkdir(new URL("../tmp/", import.meta.url), { recursive: true });
  const temporary = await mkdtemp(
    resolve(fileURLToPath(new URL("../tmp/", import.meta.url)), "swift-gate-"),
  );
  try {
    const mockSwift = `swift() { echo "running:$*"; case "$*" in *"$FAIL_SUITE"*) return 7;; esac; };\n`;
    for (const failing of ["not-a-suite", ...suites]) {
      const result = spawnSync("bash", ["-c", mockSwift + step.run], {
        env: { ...process.env, RUNNER_TEMP: temporary, FAIL_SUITE: failing },
        encoding: "utf8",
      });
      assert.equal(result.status, failing === "not-a-suite" ? 0 : 7, result.stderr);
    }
    const evidence = jobs.ios.steps.find((item) => item.name === "Upload iOS test evidence");
    assert.ok(evidence.with.path.includes("poracode-swift-contracts/*.log"));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
