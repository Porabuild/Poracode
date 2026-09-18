import assert from "node:assert/strict";
import { test } from "node:test";
import { RELEASE_CHECKS, qualifyReleasePwa, releaseCandidate } from "./qualify-release-pwa.mjs";

const sha = "c".repeat(40);
const otherSha = "d".repeat(40);
const branch = "poracode/v2";
const repository = { full_name: "Porabuild/Poracode" };

function dispatchContext(overrides = {}) {
  return {
    eventName: "workflow_dispatch",
    event: { repository },
    repository: repository.full_name,
    ref: `refs/heads/${branch}`,
    sha,
    ...overrides,
  };
}

function fixture() {
  const runs = RELEASE_CHECKS.map((check, index) => ({
    id: index + 1,
    run_number: 10,
    run_attempt: 2,
    name: check.name,
    path: `.github/workflows/${check.file}@${branch}`,
    repository,
    head_repository: repository,
    head_branch: branch,
    head_sha: sha,
    event: "push",
    status: "completed",
    conclusion: "success",
  }));
  const jobs = RELEASE_CHECKS.map((check) => [
    { name: check.gate, head_sha: sha, status: "completed", conclusion: "success" },
  ]);
  const state = { head: sha, runs: runs.map((run) => [run]), jobs, requests: [] };
  state.request = async (path, query) => {
    state.requests.push({ path, query });
    if (path.endsWith(`/git/ref/heads/${branch}`)) return { object: { sha: state.head } };
    const index = RELEASE_CHECKS.findIndex((check) =>
      path.endsWith(`/workflows/${check.file}/runs`),
    );
    if (index !== -1) {
      assert.equal(query.branch, branch);
      assert.equal(query.head_sha, sha);
      assert.equal(
        query.status,
        undefined,
        "Do not hide newer pending/failed runs by filtering success",
      );
      return { total_count: state.runs[index].length, workflow_runs: state.runs[index] };
    }
    const jobsMatch = /\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/.exec(path);
    assert.ok(jobsMatch, `Unexpected path: ${path}`);
    const jobsIndex = Number(jobsMatch[1]) - 1;
    assert.ok(jobsIndex >= 0 && jobsIndex < RELEASE_CHECKS.length, `Unexpected run id: ${path}`);
    return { total_count: state.jobs[jobsIndex].length, jobs: state.jobs[jobsIndex] };
  };
  return state;
}

void test("manual dispatch on a branch head is the only trusted candidate", () => {
  assert.deepEqual(releaseCandidate(dispatchContext()), { sha, branch });
  assert.equal(
    releaseCandidate(dispatchContext({ ref: `refs/tags/v1.0.0` })).qualified,
    false,
    "Tag dispatches have no branch-head guarantee",
  );
  assert.equal(releaseCandidate(dispatchContext({ sha: "nothex" })).qualified, false);
  assert.equal(releaseCandidate(dispatchContext({ repository: "other/repo" })).qualified, false);
  assert.equal(
    releaseCandidate({ ...dispatchContext(), eventName: "push" }).qualified,
    false,
    "Only dispatches qualify; pushes qualify through the trigger workflows themselves",
  );
});

void test("qualification requires successful CI and Native runs at the exact SHA", async () => {
  const state = fixture();
  const result = await qualifyReleasePwa(dispatchContext(), state.request);
  assert.equal(result.qualified, true);
  assert.equal(result.sha, sha);
  assert.equal(result.branch, branch);
  assert.deepEqual(
    result.checks.map((check) => check.workflow),
    ["CI", "Native clients"],
  );
  // One branch-head re-check before and after reading the run pages.
  assert.equal(
    state.requests.filter((request) => request.path.includes("/git/ref/heads/")).length,
    2,
  );
});

void test("a missing or failed required gate blocks publication", async () => {
  for (const conclusion of ["failure", "skipped", "pending"]) {
    const state = fixture();
    state.jobs[1][0].conclusion = conclusion;
    const result = await qualifyReleasePwa(dispatchContext(), state.request);
    assert.equal(result.qualified, false);
    assert.match(result.reason, /Native required gate/);
  }

  const failingWorkflow = fixture();
  failingWorkflow.runs[0][0].conclusion = "failure";
  assert.equal(
    (await qualifyReleasePwa(dispatchContext(), failingWorkflow.request)).qualified,
    false,
  );

  const wrongSha = fixture();
  wrongSha.runs[0][0].head_sha = otherSha;
  assert.equal((await qualifyReleasePwa(dispatchContext(), wrongSha.request)).qualified, false);

  const forkRun = fixture();
  forkRun.runs[0][0].head_repository = { full_name: "someone/Poracode" };
  assert.equal((await qualifyReleasePwa(dispatchContext(), forkRun.request)).qualified, false);
});

void test("publication is refused once the branch advances", async () => {
  const state = fixture();
  state.head = otherSha;
  assert.equal((await qualifyReleasePwa(dispatchContext(), state.request)).qualified, false);
  // The --require recheck in the publish step also refuses a stale SHA.
  const stale = await qualifyReleasePwa(dispatchContext(), fixture().request, otherSha);
  assert.equal(stale.qualified, false);
  assert.match(stale.reason, /differs from the dispatch commit/);
});
