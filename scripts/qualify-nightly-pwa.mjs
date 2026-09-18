import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "Porabuild/Poracode";
const BRANCH = "master";
export const NIGHTLY_CHECKS = [
  { file: "ci.yml", name: "CI", gate: "CI required gate" },
  { file: "native-ci.yml", name: "Native clients", gate: "Native required gate" },
];
const SHA = /^[a-f0-9]{40}$/;
const sameRepository = (name) => name?.toLowerCase() === REPOSITORY.toLowerCase();
const deny = (reason) => ({ qualified: false, reason });

function trustedRun(run, sha) {
  return (
    sameRepository(run?.repository?.full_name) &&
    sameRepository(run?.head_repository?.full_name) &&
    run.head_branch === BRANCH &&
    run.head_sha === sha &&
    ["push", "workflow_dispatch"].includes(run.event)
  );
}

/** Resolve only a trusted master event; manual dispatch cannot select an unchecked ref. */
export function nightlyCandidate({ eventName, event, repository, ref, sha }) {
  if (!sameRepository(repository) || !sameRepository(event?.repository?.full_name))
    return deny("Nightly publication is restricted to the upstream repository.");
  if (eventName === "workflow_dispatch") {
    if (ref !== `refs/heads/${BRANCH}` || !SHA.test(sha ?? ""))
      return deny("Manual publication requires the exact master commit.");
    return { sha };
  }
  const run = event?.workflow_run;
  if (
    eventName !== "workflow_run" ||
    event.action !== "completed" ||
    !SHA.test(run?.head_sha ?? "") ||
    !trustedRun(run, run.head_sha) ||
    !NIGHTLY_CHECKS.some((check) => check.name === run.name) ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  )
    return deny("The triggering workflow is not a successful trusted master check.");
  return { sha: run.head_sha };
}

async function listAll(request, path, key, query = {}) {
  const items = [];
  for (let page = 1; page <= 10; page++) {
    const data = await request(path, { ...query, per_page: 100, page });
    if (!Array.isArray(data[key]) || !Number.isInteger(data.total_count))
      throw new Error("GitHub returned an invalid qualification response.");
    items.push(...data[key]);
    if (items.length >= data.total_count) return items;
    if (data[key].length === 0) break;
  }
  throw new Error("GitHub qualification results could not be read completely.");
}

/** Read-only qualification. Never select an older success over a pending/failed newer run. */
export async function qualifyNightlyPwa(context, request, requiredSha) {
  const candidate = nightlyCandidate(context);
  if (!candidate.sha) return candidate;
  const { sha } = candidate;
  if (requiredSha !== undefined && requiredSha !== sha)
    return deny("The checked-out candidate differs from the triggering commit.");
  const base = `/repos/${REPOSITORY}`;
  const currentHead = async () => (await request(`${base}/git/ref/heads/${BRANCH}`)).object?.sha;
  if ((await currentHead()) !== sha)
    return deny("The candidate is no longer the current master head.");
  const checks = [];
  for (const check of NIGHTLY_CHECKS) {
    const runs = await listAll(
      request,
      `${base}/actions/workflows/${check.file}/runs`,
      "workflow_runs",
      {
        branch: BRANCH,
        head_sha: sha,
      },
    );
    const run = runs.sort(
      (a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt,
    )[0];
    if (
      !trustedRun(run, sha) ||
      run.path?.split("@")[0] !== `.github/workflows/${check.file}` ||
      !Number.isSafeInteger(run.id) ||
      run.id <= 0 ||
      !Number.isSafeInteger(run.run_number) ||
      run.run_number <= 0 ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt <= 0 ||
      run.status !== "completed" ||
      run.conclusion !== "success"
    )
      return deny(`${check.name} has no successful latest trusted run for this commit.`);
    const jobs = await listAll(
      request,
      `${base}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
      "jobs",
    );
    const gates = jobs.filter((job) => job.name === check.gate);
    if (
      gates.length !== 1 ||
      gates[0].head_sha !== sha ||
      gates[0].status !== "completed" ||
      gates[0].conclusion !== "success"
    )
      return deny(`${check.gate} did not succeed in the latest attempt for this commit.`);
    checks.push({ workflow: check.name, runId: run.id, attempt: run.run_attempt });
  }
  // The branch can advance while the workflow/job pages are being fetched.
  if ((await currentHead()) !== sha) return deny("Master advanced during qualification.");
  return { qualified: true, sha, checks };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--require" || !SHA.test(args[1])))
    throw new Error("Usage: qualify-nightly-pwa.mjs [--require <exact SHA>]");
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
  const context = {
    eventName: process.env.GITHUB_EVENT_NAME,
    event,
    repository: process.env.GITHUB_REPOSITORY,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
  };
  const request = async (path, query = {}) => {
    if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required for qualification.");
    const url = new URL(path, process.env.GITHUB_API_URL ?? "https://api.github.com");
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub qualification request failed (${response.status}).`);
    return response.json();
  };
  const result = await qualifyNightlyPwa(context, request, args[1]);
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `qualified=${result.qualified}\n${result.sha ? `sha=${result.sha}\n` : ""}`,
    );
  if (args.length && !result.qualified) throw new Error(result.reason);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
