import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { NIGHTLY_CHECKS, qualifyNightlyPwa } from "./qualify-nightly-pwa.mjs";

const sha = "a".repeat(40);
const otherSha = "b".repeat(40);
const repository = { full_name: "Porabuild/Poracode" };

function fixture() {
  const runs = NIGHTLY_CHECKS.map((check, index) => ({
    id: index + 1,
    run_number: 10,
    run_attempt: 2,
    name: check.name,
    path: `.github/workflows/${check.file}@master`,
    repository,
    head_repository: repository,
    head_branch: "master",
    head_sha: sha,
    event: "push",
    status: "completed",
    conclusion: "success",
  }));
  const jobs = NIGHTLY_CHECKS.map((check) => [
    {
      name: check.gate,
      head_sha: sha,
      status: "completed",
      conclusion: "success",
    },
  ]);
  const context = {
    eventName: "workflow_run",
    event: { action: "completed", repository, workflow_run: { ...runs[0] } },
    repository: repository.full_name,
    ref: "refs/heads/master",
    // workflow_run's GITHUB_SHA need not equal the tested SHA.
    sha: otherSha,
  };
  const requests = [];
  const state = { head: sha, runs: runs.map((run) => [run]), jobs, context, requests };
  state.request = async (path, query) => {
    requests.push({ path, query });
    if (path.endsWith("/git/ref/heads/master")) return { object: { sha: state.head } };
    const index = NIGHTLY_CHECKS.findIndex((check) =>
      path.endsWith(`/workflows/${check.file}/runs`),
    );
    if (index !== -1) {
      assert.equal(query.branch, "master");
      assert.equal(query.head_sha, sha);
      assert.equal(
        query.status,
        undefined,
        "Do not hide newer pending/failed runs by filtering success",
      );
      return { total_count: state.runs[index].length, workflow_runs: state.runs[index] };
    }
    const match = /\/runs\/(\d+)\/attempts\/2\/jobs$/.exec(path);
    assert.ok(match, `Read jobs from the exact latest attempt: ${path}`);
    const runJobs = state.jobs[Number(match[1]) - 1];
    return { total_count: runJobs.length, jobs: runJobs };
  };
  return state;
}

test("qualifies both required gates on the tested SHA, never workflow_run's default-branch SHA", async () => {
  const state = fixture();
  const result = await qualifyNightlyPwa(state.context, state.request);
  assert.equal(result.qualified, true);
  assert.equal(result.sha, sha);
  assert.equal(result.checks.length, 2);
  assert.equal(
    state.requests.filter(({ path }) => path.endsWith("/git/ref/heads/master")).length,
    2,
  );
});

test("manual dispatch passes the same checks and cannot override the qualified checkout", async () => {
  const state = fixture();
  state.context.eventName = "workflow_dispatch";
  state.context.sha = sha;
  assert.equal((await qualifyNightlyPwa(state.context, state.request, sha)).qualified, true);
  assert.equal((await qualifyNightlyPwa(state.context, state.request, otherSha)).qualified, false);
  state.runs[1] = [];
  assert.equal((await qualifyNightlyPwa(state.context, state.request, sha)).qualified, false);
});

test("rejects fork, non-master, untrusted, failed, and malformed trigger events before API access", async () => {
  const mutations = [
    (s) => {
      s.context.repository = "someone/Poracode";
    },
    (s) => {
      s.context.event.repository = { full_name: "someone/Poracode" };
    },
    (s) => {
      s.context.event.workflow_run.head_repository = { full_name: "someone/Poracode" };
    },
    (s) => {
      s.context.event.workflow_run.event = "pull_request";
    },
    (s) => {
      s.context.event.workflow_run.head_branch = "poracode/v2";
    },
    (s) => {
      s.context.event.workflow_run.conclusion = "failure";
    },
    (s) => {
      s.context.event.workflow_run.status = "in_progress";
    },
    (s) => {
      s.context.event.workflow_run.head_sha = "master";
    },
    (s) => {
      s.context.event.workflow_run.name = "Unrelated checks";
    },
    (s) => {
      s.context.eventName = "pull_request_target";
    },
    (s) => {
      s.context.eventName = "workflow_dispatch";
      s.context.ref = "refs/heads/poracode/v2";
    },
  ];
  for (const mutate of mutations) {
    const state = fixture();
    mutate(state);
    assert.equal((await qualifyNightlyPwa(state.context, state.request)).qualified, false);
    assert.equal(state.requests.length, 0);
  }
});

test("rejects missing, failed, cancelled, pending, skipped, and wrong-SHA qualification runs", async () => {
  const mutations = [
    (s, i) => {
      s.runs[i] = [];
    },
    ...["failure", "cancelled", "skipped", "neutral", "timed_out"].map((conclusion) => (s, i) => {
      s.runs[i][0].conclusion = conclusion;
    }),
    ...["queued", "in_progress", "pending", "waiting"].map((status) => (s, i) => {
      s.runs[i][0].status = status;
      s.runs[i][0].conclusion = null;
    }),
    (s, i) => {
      s.runs[i][0].head_sha = otherSha;
    },
    (s, i) => {
      s.runs[i][0].head_repository = { full_name: "fork/Poracode" };
    },
    (s, i) => {
      s.runs[i][0].repository = { full_name: "fork/Poracode" };
    },
    (s, i) => {
      s.runs[i][0].head_branch = "poracode/v2";
    },
    (s, i) => {
      s.runs[i][0].event = "pull_request";
    },
    (s, i) => {
      s.runs[i][0].path = ".github/workflows/unrelated.yml";
    },
  ];
  for (const mutate of mutations) {
    for (const index of [0, 1]) {
      const state = fixture();
      mutate(state, index);
      assert.equal((await qualifyNightlyPwa(state.context, state.request)).qualified, false);
    }
  }
});

test("an old success cannot hide a newer failed run or pending retry", async () => {
  for (const sameRun of [false, true]) {
    const state = fixture();
    const original = state.runs[0][0];
    state.runs[0].push({
      ...original,
      id: sameRun ? original.id : 3,
      run_number: sameRun ? original.run_number : original.run_number + 1,
      run_attempt: original.run_attempt + 1,
      status: sameRun ? "in_progress" : "completed",
      conclusion: sameRun ? null : "failure",
    });
    assert.equal((await qualifyNightlyPwa(state.context, state.request)).qualified, false);
  }
});

test("workflow success requires its actual aggregate job to pass on the same SHA", async () => {
  const mutations = [
    (s, i) => {
      s.jobs[i] = [];
    },
    (s, i) => {
      s.jobs[i].push({ ...s.jobs[i][0] });
    },
    (s, i) => {
      s.jobs[i][0].name = "Some optional job";
    },
    (s, i) => {
      s.jobs[i][0].head_sha = otherSha;
    },
    ...["failure", "cancelled", "skipped", "neutral"].map((conclusion) => (s, i) => {
      s.jobs[i][0].conclusion = conclusion;
    }),
    (s, i) => {
      s.jobs[i][0].status = "in_progress";
    },
  ];
  for (const mutate of mutations) {
    for (const index of [0, 1]) {
      const state = fixture();
      mutate(state, index);
      assert.equal((await qualifyNightlyPwa(state.context, state.request)).qualified, false);
    }
  }
});

test("stale queued candidates and a head change during qualification cannot publish", async () => {
  const state = fixture();
  state.head = otherSha;
  assert.equal((await qualifyNightlyPwa(state.context, state.request)).qualified, false);
  assert.equal(state.requests.length, 1);
  const moving = fixture();
  const result = await qualifyNightlyPwa(moving.context, async (path, query) => {
    const data = await moving.request(path, query);
    if (path.endsWith("/attempts/2/jobs")) moving.head = otherSha;
    return data;
  });
  assert.equal(result.qualified, false);
});

test("API errors and incomplete response pages fail closed", async () => {
  const state = fixture();
  await assert.rejects(
    qualifyNightlyPwa(state.context, async () => {
      throw new Error("API unavailable");
    }),
    /API unavailable/,
  );
  await assert.rejects(
    qualifyNightlyPwa(state.context, async (path, query) => {
      const data = await state.request(path, query);
      return path.endsWith("/runs") ? { ...data, total_count: 101, workflow_runs: [] } : data;
    }),
    /could not be read completely/,
  );
});

test("the publication CLI exits nonzero for an unqualified pinned candidate", async () => {
  const temporaryParent = new URL("../tmp/", import.meta.url);
  await mkdir(temporaryParent, { recursive: true });
  const temporary = await mkdtemp(join(fileURLToPath(temporaryParent), "nightly-cli-"));
  try {
    const eventPath = join(temporary, "event.json");
    const outputPath = join(temporary, "output");
    await writeFile(eventPath, JSON.stringify({ repository }));
    const options = {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_REPOSITORY: repository.full_name,
        GITHUB_REF: "refs/heads/unqualified-branch",
        GITHUB_SHA: sha,
        GITHUB_OUTPUT: outputPath,
        GITHUB_TOKEN: "",
      },
    };
    const script = fileURLToPath(new URL("./qualify-nightly-pwa.mjs", import.meta.url));
    assert.equal(spawnSync(process.execPath, [script], options).status, 0);
    const publish = spawnSync(process.execPath, [script, "--require", sha], options);
    assert.equal(publish.status, 1, publish.stdout);
    assert.match(publish.stderr, /requires the exact master commit/);
    assert.equal(await readFile(outputPath, "utf8"), "qualified=false\nqualified=false\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
