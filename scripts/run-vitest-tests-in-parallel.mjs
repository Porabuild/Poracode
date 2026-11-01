// Runs every test in one Vitest file concurrently, each in its own process.
//
// For integration files whose tests mutate process-wide state (environment,
// ports, working profile) and so cannot run concurrently in one process, but
// are otherwise independent. The file then takes about as long as its slowest
// test instead of the sum. Each test must be reported as passed by exactly the
// process that ran it, so a renamed or filtered-out test fails the run instead
// of being skipped silently.
//
// Usage: node scripts/run-vitest-tests-in-parallel.mjs <test file> [extra vitest args...]
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");

/** Spawns Vitest on `file` with JSON results in `reportPath`; resolves its exit code and output. */
function spawnVitest(file, extraArgs, args, reportPath, onLine) {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [
        vitest,
        "run",
        "--configLoader",
        "runner",
        file,
        ...extraArgs,
        ...args,
        "--reporter=default",
        "--reporter=json",
        `--outputFile.json=${reportPath}`,
      ],
      { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let pending = "";
    const forward = (chunk) => {
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", forward);
    child.on("close", (code) => {
      if (pending) onLine(pending);
      resolveRun(code ?? 1);
    });
  });
}

function readResults(reportPath) {
  try {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    return report.testResults.flatMap((result) => result.assertionResults);
  } catch {
    return [];
  }
}

/**
 * Lists the file's tests, runs each in its own process, and returns whether
 * every one passed in exactly its own run. `run(label, args)` resolves
 * `{ code, results }` for one Vitest invocation.
 */
export async function runTestsInParallel({ file, run, log = console.log }) {
  // A name pattern that matches nothing still reports every test as skipped,
  // which lists the file's tests without running any of them.
  const listed = await run("list", ["-t", "^ poracode-list-only $"], { quiet: true });
  if (listed.code !== 0 || listed.results.length === 0) {
    for (const line of listed.output ?? []) log(`[list] ${line}`);
    log(`No tests found in ${file} (vitest exited ${listed.code}).`);
    return false;
  }
  log(`Running ${listed.results.length} tests from ${file} in parallel processes.`);

  const started = Date.now();
  const outcomes = await Promise.all(
    listed.results.map(async (test, index) => {
      const label = String(index + 1);
      // Vitest matches -t against the describe chain joined with " > ".
      const name = [...(test.ancestorTitles ?? []), test.title].join(" > ");
      const { code, results } = await run(label, ["-t", `^${RegExp.escape(name)}$`]);
      const passed = results.filter((result) => result.status === "passed");
      const ok =
        code === 0 &&
        passed.length === 1 &&
        passed[0].fullName === test.fullName &&
        results.every((result) => result.status !== "failed");
      return { label, title: test.title, ok, code, passed: passed.length };
    }),
  );

  log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s:`);
  for (const outcome of outcomes) {
    const status = outcome.ok
      ? "passed"
      : `FAILED (exit ${outcome.code}, ${outcome.passed} passed)`;
    log(`  [${outcome.label}] ${status}  ${outcome.title}`);
  }
  return outcomes.every((outcome) => outcome.ok);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [file, ...extraArgs] = process.argv.slice(2);
  if (!file) {
    console.error("usage: run-vitest-tests-in-parallel.mjs <test file> [vitest args...]");
    process.exit(2);
  }
  const reports = mkdtempSync(join(tmpdir(), "vitest-parallel-"));
  let ok = false;
  try {
    ok = await runTestsInParallel({
      file,
      run: async (label, args, { quiet = false } = {}) => {
        const reportPath = join(reports, `${label}.json`);
        const output = [];
        const code = await spawnVitest(file, extraArgs, args, reportPath, (line) => {
          if (quiet) output.push(line);
          else process.stdout.write(`[${label}] ${line}\n`);
        });
        return { code, results: readResults(reportPath), output };
      },
    });
  } finally {
    rmSync(reports, { recursive: true, force: true });
  }
  process.exit(ok ? 0 : 1);
}
