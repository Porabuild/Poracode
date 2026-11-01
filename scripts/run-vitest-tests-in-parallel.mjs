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

const root = resolve(import.meta.dirname, "..");
const vitest = join(root, "node_modules", "vitest", "vitest.mjs");
const [file, ...extraArgs] = process.argv.slice(2);
if (!file) {
  console.error("usage: run-vitest-tests-in-parallel.mjs <test file> [vitest args...]");
  process.exit(2);
}

const reports = mkdtempSync(join(tmpdir(), "vitest-parallel-"));

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runVitest(label, args, reportPath, { quiet = false } = {}) {
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
      if (quiet) return;
      const lines = (pending + chunk).split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(`[${label}] ${line}\n`);
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", forward);
    child.on("close", (code) => {
      if (pending && !quiet) process.stdout.write(`[${label}] ${pending}\n`);
      resolveRun(code ?? 1);
    });
  });
}

function readReport(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return report.testResults.flatMap((result) => result.assertionResults);
}

let failed = false;
try {
  // A name pattern that matches nothing still reports every test as skipped,
  // which lists the file's tests without running any of them.
  const listPath = join(reports, "list.json");
  const listCode = await runVitest("list", ["-t", "^ poracode-list-only $"], listPath, {
    quiet: true,
  });
  const tests = listCode === 0 ? readReport(listPath) : [];
  if (tests.length === 0) {
    console.error(`No tests found in ${file} (vitest exited ${listCode}).`);
    process.exit(1);
  }
  console.log(`Running ${tests.length} tests from ${file} in parallel processes.`);

  const started = Date.now();
  const outcomes = await Promise.all(
    tests.map(async (test, index) => {
      const label = String(index + 1);
      const reportPath = join(reports, `${label}.json`);
      // Vitest matches -t against the describe chain joined with " > ".
      const name = [...(test.ancestorTitles ?? []), test.title].join(" > ");
      const code = await runVitest(label, ["-t", `^${escapeRegExp(name)}$`], reportPath);
      let results = [];
      try {
        results = readReport(reportPath);
      } catch {
        // A missing report is a failure below.
      }
      const passed = results.filter((result) => result.status === "passed");
      const ok =
        code === 0 &&
        passed.length === 1 &&
        passed[0].fullName === test.fullName &&
        results.every((result) => result.status !== "failed");
      return { label, test, ok, code, passed: passed.length };
    }),
  );

  console.log(`\nFinished in ${Math.round((Date.now() - started) / 1000)}s:`);
  for (const outcome of outcomes) {
    console.log(
      `  [${outcome.label}] ${outcome.ok ? "passed" : `FAILED (exit ${outcome.code}, ${outcome.passed} passed)`}  ${outcome.test.title}`,
    );
    if (!outcome.ok) failed = true;
  }
} finally {
  rmSync(reports, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
