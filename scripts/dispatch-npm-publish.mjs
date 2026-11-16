// Dispatches publish-npm.yml for the current release run and waits for the run
// that dispatch started, so a failed npm publish fails the release.
//
// publish-npm.yml names its runs "… for run <release run id>". Rerunning the
// release's npm job finds the earlier attempt's runs under the same name, so
// only a run that did not exist before this dispatch is its result. An earlier
// run that already published, or is still publishing, is reused: npm rejects a
// second publish of the same version.
//
// Usage: node scripts/dispatch-npm-publish.mjs --version <version> --source-ref <sha> --dist-tag <latest|nightly>
// Needs GH_TOKEN with `actions: write`, plus GITHUB_REPOSITORY and GITHUB_RUN_ID.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const WORKFLOW = "publish-npm.yml";
const POLL_MS = 10_000;
/** Polls for the dispatched run to be listed before giving up (five minutes). */
const MAX_START_POLLS = 30;
/** Consecutive failed GitHub API reads tolerated before giving up. */
const MAX_API_ERRORS = 4;

export async function dispatchNpmPublish({
  version,
  sourceRef,
  distTag,
  repository = process.env.GITHUB_REPOSITORY,
  sourceRunId = process.env.GITHUB_RUN_ID,
  gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  sleep = delay,
  log = (message) => console.log(message),
}) {
  if (!repository || !sourceRunId)
    throw new Error("GITHUB_REPOSITORY and GITHUB_RUN_ID are required.");

  // Reads are idempotent, so a transient API or network failure is retried.
  const read = async (args) => {
    for (let errors = 1; ; errors++) {
      try {
        return JSON.parse(gh(args));
      } catch (error) {
        if (errors >= MAX_API_ERRORS) throw error;
        log(`GitHub API call failed (${errors}/${MAX_API_ERRORS}); retrying.`);
        await sleep(POLL_MS);
      }
    }
  };
  const listRuns = async () =>
    (
      await read([
        "run",
        "list",
        "--repo",
        repository,
        "--workflow",
        WORKFLOW,
        "--event",
        "workflow_dispatch",
        "--limit",
        "50",
        "--json",
        "databaseId,displayTitle,status,conclusion",
      ])
    ).filter((run) => run.displayTitle.endsWith(` for run ${sourceRunId}`));

  const earlier = await listRuns();
  const published = earlier.find((run) => run.conclusion === "success");
  if (published) {
    log(`Run ${published.databaseId} already published ${version}; nothing to dispatch.`);
    return;
  }

  let run = earlier.find((candidate) => candidate.status !== "completed");
  if (run) {
    log(`Run ${run.databaseId} is already publishing ${version}; waiting for it.`);
  } else {
    const known = new Set(earlier.map((candidate) => candidate.databaseId));
    // Not retried: a dispatch whose response was lost may still have started a
    // run, and a rerun of this job finds and reuses that run.
    gh([
      "workflow",
      "run",
      WORKFLOW,
      "--repo",
      repository,
      "--ref",
      "master",
      "-f",
      `source_run_id=${sourceRunId}`,
      "-f",
      `version=${version}`,
      "-f",
      `source_ref=${sourceRef}`,
      "-f",
      `dist_tag=${distTag}`,
    ]);
    for (let poll = 1; ; poll++) {
      run = (await listRuns()).find((candidate) => !known.has(candidate.databaseId));
      if (run) break;
      if (poll >= MAX_START_POLLS)
        throw new Error(
          `The ${WORKFLOW} run for release run ${sourceRunId} did not start within five minutes. ` +
            "If it appears later, re-run this job to wait for it.",
        );
      await sleep(POLL_MS);
    }
    log(`Dispatched ${WORKFLOW} run ${run.databaseId} for ${version} (${distTag}).`);
  }

  for (let status; ;) {
    const state = await read([
      "run",
      "view",
      String(run.databaseId),
      "--repo",
      repository,
      "--json",
      "status,conclusion,url",
    ]);
    if (state.status === "completed") {
      if (state.conclusion !== "success")
        throw new Error(
          `${WORKFLOW} run ${run.databaseId} finished with ${state.conclusion}: ${state.url}`,
        );
      log(`${WORKFLOW} run ${run.databaseId} published ${version}.`);
      return;
    }
    if (state.status !== status) {
      status = state.status;
      log(`${WORKFLOW} run ${run.databaseId} is ${status}: ${state.url}`);
    }
    await sleep(POLL_MS);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const flagValue = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const version = flagValue("--version");
  const sourceRef = flagValue("--source-ref");
  const distTag = flagValue("--dist-tag");
  if (!version || !sourceRef || !distTag) {
    console.error(
      "usage: dispatch-npm-publish.mjs --version <version> --source-ref <sha> --dist-tag <latest|nightly>",
    );
    process.exit(2);
  }
  try {
    await dispatchNpmPublish({ version, sourceRef, distTag });
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
