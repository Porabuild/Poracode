// Regenerates src/build/testDurations.json from the per-file times a CI run's
// "Test shard (i/N)" jobs printed. The duration sequencer reads it to balance
// shards; refresh it when shard times drift apart.
//
// Usage: node scripts/update-test-durations.mjs <CI run id>
// Needs the gh CLI, authenticated, run inside this checkout (it resolves the repository).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const USAGE = "usage: node scripts/update-test-durations.mjs <CI run id>";
const OUTPUT = resolve(import.meta.dirname, "../src/build/testDurations.json");
// Vitest's default reporter: ` ✓  node  src/a.test.ts (3 tests | 1 skipped) 412ms`.
const FILE_LINE =
  /^\s*[✓×↓]\s+(?:\S+\s+)?(\S+\.test\.tsx?)\s+\(\d+ tests?[^)]*\)\s+(?:\d+ms\s+)?(\d+(?:\.\d+)?)(ms|s)\s*$/u;

// ANSI colors, raw or as the literal "^[[" that GitHub job logs sometimes print.
const COLOR_CODES = new RegExp(`(?:${String.fromCharCode(27)}|\\^\\[)\\[[0-9;]*m`, "gu");

export function parseShardLog(log) {
  const durations = new Map();
  for (const raw of log.split(/\r?\n/)) {
    // Job logs prefix each line with the job name, step and a timestamp.
    const line = raw.replace(/^[^\t]*\t[^\t]*\t\S+Z /u, "").replace(COLOR_CODES, "");
    const match = FILE_LINE.exec(line);
    if (!match) continue;
    const ms = Number(match[2]) * (match[3] === "s" ? 1000 : 1);
    durations.set(match[1], Math.max(durations.get(match[1]) ?? 0, ms));
  }
  return durations;
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const runId = process.argv[2];
  if (!runId || !/^\d+$/u.test(runId)) {
    console.error(USAGE);
    process.exit(2);
  }
  const jobs = JSON.parse(
    gh(["api", `repos/{owner}/{repo}/actions/runs/${runId}/jobs?per_page=100&filter=latest`]),
  ).jobs.filter((job) => /^Test shard \(\d+\/\d+\)$/u.test(job.name));
  if (jobs.length === 0) throw new Error(`Run ${runId} has no test shard jobs.`);
  const all = new Map();
  for (const job of jobs) {
    if (job.conclusion !== "success")
      throw new Error(
        `${job.name} is ${job.conclusion ?? "still running"}; use a completed, successful run.`,
      );
    const durations = parseShardLog(gh(["run", "view", "--job", String(job.id), "--log"]));
    // An empty parse means the log or Vitest's reporter format changed; never
    // overwrite the data with a partial set.
    if (durations.size === 0) throw new Error(`No per-file times found in the ${job.name} log.`);
    for (const [file, ms] of durations) all.set(file, ms);
  }
  // Rounded so a refresh only rewrites files whose time really changed.
  const sorted = Object.fromEntries(
    [...all]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([file, ms]) => [file, Math.max(50, Math.round(ms / 50) * 50)]),
  );
  writeFileSync(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`Wrote ${all.size} file durations from ${jobs.length} shards of run ${runId}.`);
}
