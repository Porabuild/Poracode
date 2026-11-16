import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dispatchNpmPublish } from "./dispatch-npm-publish.mjs";

const script = fileURLToPath(new URL("./dispatch-npm-publish.mjs", import.meta.url));

const TITLE = "Publish poracode 2.0.0-nightly.202611091402 (nightly) for run 42";
const runRow = (databaseId, status, conclusion = null, displayTitle = TITLE) => ({
  databaseId,
  displayTitle,
  status,
  conclusion,
});

/**
 * A fake `gh`: `lists` are the successive `gh run list` results (the last one
 * repeats), `views` the successive `gh run view` results.
 */
function fakeGh({ lists, views = [], failReads = 0 }) {
  const calls = [];
  let listIndex = 0;
  let viewIndex = 0;
  let failures = 0;
  const gh = (args) => {
    calls.push(args);
    if (args[0] === "workflow") return "";
    if (failures < failReads) {
      failures++;
      throw new Error("HTTP 502");
    }
    if (args[1] === "list") return JSON.stringify(lists[Math.min(listIndex++, lists.length - 1)]);
    return JSON.stringify({
      url: `https://github.com/Porabuild/Poracode/actions/runs/${args[2]}`,
      ...views[Math.min(viewIndex++, views.length - 1)],
    });
  };
  const dispatches = () => calls.filter((args) => args[0] === "workflow");
  const viewed = () => calls.filter((args) => args[1] === "view").map((args) => args[2]);
  return { gh, calls, dispatches, viewed };
}

const base = {
  version: "2.0.0-nightly.202611091402",
  sourceRef: "7af2002560ddaffd5acdc07c0af2bbb8c786f9a5",
  distTag: "nightly",
  repository: "Porabuild/Poracode",
  sourceRunId: "42",
  sleep: async () => {},
  log: () => {},
};

const SUCCEEDED = { status: "completed", conclusion: "success" };

await test("dispatches the publish workflow and waits for the run it started", async () => {
  const { gh, calls, dispatches, viewed } = fakeGh({
    lists: [[], [], [runRow(900, "queued")]],
    views: [{ status: "queued", conclusion: null }, { status: "in_progress" }, SUCCEEDED],
  });
  await dispatchNpmPublish({ ...base, gh });

  // The run lookup and the status reads decide which run the release waits for.
  assert.deepEqual(calls[0], [
    "run",
    "list",
    "--repo",
    "Porabuild/Poracode",
    "--workflow",
    "publish-npm.yml",
    "--event",
    "workflow_dispatch",
    "--limit",
    "50",
    "--json",
    "databaseId,displayTitle,status,conclusion",
  ]);
  assert.deepEqual(
    calls.find((args) => args[1] === "view"),
    ["run", "view", "900", "--repo", "Porabuild/Poracode", "--json", "status,conclusion,url"],
  );

  assert.deepEqual(dispatches(), [
    [
      "workflow",
      "run",
      "publish-npm.yml",
      "--repo",
      "Porabuild/Poracode",
      "--ref",
      "master",
      "-f",
      "source_run_id=42",
      "-f",
      "version=2.0.0-nightly.202611091402",
      "-f",
      "source_ref=7af2002560ddaffd5acdc07c0af2bbb8c786f9a5",
      "-f",
      "dist_tag=nightly",
    ],
  ]);
  assert.deepEqual(viewed(), ["900", "900", "900"]);
});

await test("a rerun ignores the earlier attempt's failed run and waits for its own", async () => {
  // Release run 42630605254: the first publish run failed on a GitHub 500, and
  // the rerun's lookup matched that failed run before the new one was listed.
  const failed = runRow(800, "completed", "failure");
  const { gh, dispatches, viewed } = fakeGh({
    lists: [[failed], [failed], [runRow(900, "queued"), failed]],
    views: [SUCCEEDED],
  });
  await dispatchNpmPublish({ ...base, gh });

  assert.equal(dispatches().length, 1);
  assert.deepEqual(viewed(), ["900"]);
});

await test("a rerun does not publish again when an earlier run already published", async () => {
  const { gh, dispatches, viewed } = fakeGh({
    lists: [[runRow(900, "completed", "success"), runRow(800, "completed", "failure")]],
  });
  await dispatchNpmPublish({ ...base, gh });

  assert.equal(dispatches().length, 0);
  assert.deepEqual(viewed(), []);
});

await test("a rerun waits for an earlier run that is still publishing", async () => {
  const { gh, dispatches, viewed } = fakeGh({
    lists: [[runRow(900, "in_progress")]],
    views: [{ status: "in_progress" }, SUCCEEDED],
  });
  await dispatchNpmPublish({ ...base, gh });

  assert.equal(dispatches().length, 0);
  assert.deepEqual(viewed(), ["900", "900"]);
});

await test("runs published for another release run are not this run's result", async () => {
  const other = runRow(700, "completed", "success", `${TITLE}0`);
  const { gh, dispatches, viewed } = fakeGh({
    lists: [[other], [runRow(900, "queued"), other]],
    views: [SUCCEEDED],
  });
  await dispatchNpmPublish({ ...base, gh });

  assert.equal(dispatches().length, 1);
  assert.deepEqual(viewed(), ["900"]);
});

await test("fails the release when the publish run fails", async () => {
  const { gh } = fakeGh({
    lists: [[], [runRow(900, "queued")]],
    views: [{ status: "in_progress" }, { status: "completed", conclusion: "failure" }],
  });

  await assert.rejects(
    dispatchNpmPublish({ ...base, gh }),
    /publish-npm\.yml run 900 finished with failure: https:\/\/github\.com\/Porabuild\/Poracode\/actions\/runs\/900/,
  );
});

await test("fails when the dispatched run never starts", async () => {
  const sleeps = [];
  const { gh, dispatches } = fakeGh({ lists: [[runRow(800, "completed", "failure")]] });

  await assert.rejects(
    dispatchNpmPublish({ ...base, gh, sleep: async (ms) => void sleeps.push(ms) }),
    /The publish-npm\.yml run for release run 42 did not start/,
  );
  assert.equal(dispatches().length, 1);
  assert.equal(sleeps.length, 29);
});

await test("retries transient GitHub API failures and gives up on persistent ones", async () => {
  const flaky = fakeGh({
    lists: [[], [runRow(900, "queued")]],
    views: [SUCCEEDED],
    failReads: 3,
  });
  await dispatchNpmPublish({ ...base, gh: flaky.gh });
  assert.equal(flaky.dispatches().length, 1);

  const down = fakeGh({ lists: [[]], failReads: Number.POSITIVE_INFINITY });
  await assert.rejects(dispatchNpmPublish({ ...base, gh: down.gh }), /HTTP 502/);
  assert.equal(down.dispatches().length, 0, "nothing is dispatched while the API is down");
});

await test("requires the repository and the release run id", async () => {
  await assert.rejects(
    dispatchNpmPublish({ ...base, repository: "", gh: () => "[]" }),
    /GITHUB_REPOSITORY and GITHUB_RUN_ID are required/,
  );
});

// The workflow runs the file as a command. A main-module guard that evaluated
// false would exit 0 without publishing, so the entry point is exercised too.
const runCli = (args, env) =>
  spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

await test("the command prints usage and exits 2 without the required flags", () => {
  const result = runCli([], {});

  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: dispatch-npm-publish\.mjs --version <version>/);
});

await test("the command fails with an error annotation when the run context is missing", () => {
  const result = runCli(["--version", "2.0.0", "--source-ref", "abc", "--dist-tag", "latest"], {
    GITHUB_REPOSITORY: "",
    GITHUB_RUN_ID: "",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /::error::GITHUB_REPOSITORY and GITHUB_RUN_ID are required/);
});
