// Waits for an artifact another job of the current workflow run uploads, then
// downloads it. Lets a job start before that producer finishes (instead of
// listing it in `needs:`) and block only at the step that consumes the artifact.
// Fails fast when a job whose name starts with the producer prefix fails.
//
// Usage: node scripts/wait-for-run-artifact.mjs <artifact> <directory> <producer job prefix>
// Needs GH_TOKEN with `actions: read`, plus GITHUB_REPOSITORY and GITHUB_RUN_ID.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const POLL_MS = 15_000;
const TIMEOUT_MS = 45 * 60_000;
/** Consecutive failed GitHub API polls tolerated before giving up. */
const MAX_POLL_ERRORS = 3;
/** Polls without any job named after the producer before treating the prefix as wrong. */
const MAX_POLLS_WITHOUT_PRODUCER = 4;

export async function waitForRunArtifact({
  artifact,
  directory,
  producerPrefix,
  repository = process.env.GITHUB_REPOSITORY,
  runId = process.env.GITHUB_RUN_ID,
  gh = (args) => execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  sleep = delay,
  now = Date.now,
  log = (message) => console.log(message),
}) {
  if (!repository || !runId) throw new Error("GITHUB_REPOSITORY and GITHUB_RUN_ID are required.");
  const started = now();
  const elapsed = () => `${Math.round((now() - started) / 1000)}s`;
  let pollErrors = 0;
  let pollsWithoutProducer = 0;
  for (;;) {
    let producers;
    try {
      const names = gh([
        "api",
        `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
        "--jq",
        ".artifacts[] | select(.expired | not) | .name",
      ])
        .split(/\r?\n/)
        .filter(Boolean);
      if (names.includes(artifact)) {
        gh(["run", "download", runId, "-R", repository, "-n", artifact, "-D", directory]);
        log(`Downloaded ${artifact} into ${directory} after ${elapsed()}.`);
        return;
      }
      producers = JSON.parse(
        gh([
          "api",
          `repos/${repository}/actions/runs/${runId}/jobs?per_page=100&filter=latest`,
          "--jq",
          `[.jobs[] | select(.name | startswith(${JSON.stringify(producerPrefix)})) | {name, conclusion}]`,
        ]),
      );
      pollErrors = 0;
    } catch (error) {
      // A transient API or network failure should not fail a long build job.
      if (++pollErrors >= MAX_POLL_ERRORS) throw error;
      log(`GitHub API call failed (${pollErrors}/${MAX_POLL_ERRORS}); retrying.`);
      await sleep(POLL_MS);
      continue;
    }
    const failed = producers.filter(
      (job) => job.conclusion === "failure" || job.conclusion === "cancelled",
    );
    if (failed.length > 0)
      throw new Error(
        `${artifact} will not arrive: ${failed.map((job) => job.name).join(", ")} did not succeed.`,
      );
    if (producers.length === 0 && ++pollsWithoutProducer >= MAX_POLLS_WITHOUT_PRODUCER)
      throw new Error(
        `No job in this run is named "${producerPrefix}…"; check the producer prefix.`,
      );
    if (now() - started > TIMEOUT_MS)
      throw new Error(
        `Timed out after ${elapsed()} waiting for ${artifact} from "${producerPrefix}".`,
      );
    log(`Waiting for ${artifact} from "${producerPrefix}" (${elapsed()} elapsed)…`);
    await sleep(POLL_MS);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [artifact, directory, producerPrefix] = process.argv.slice(2);
  if (!artifact || !directory || !producerPrefix) {
    console.error("usage: wait-for-run-artifact.mjs <artifact> <directory> <producer job prefix>");
    process.exit(2);
  }
  try {
    await waitForRunArtifact({ artifact, directory, producerPrefix });
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
