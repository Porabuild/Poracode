import assert from "node:assert/strict";
import test from "node:test";
import { runTestsInParallel } from "./run-vitest-tests-in-parallel.mjs";

const tests = [
  { title: "upgrades", ancestorTitles: ["upgrade"], fullName: "upgrade upgrades" },
  { title: "rolls back (v2)", ancestorTitles: ["upgrade"], fullName: "upgrade rolls back (v2)" },
];
const skippedAll = tests.map((entry) => ({ ...entry, status: "skipped" }));

/** A fake Vitest: each -t pattern "passes" the tests it matches, the rest are skipped. */
function fakeRun({ listCode = 0, passOverride } = {}) {
  const calls = [];
  const run = async (label, args, options) => {
    calls.push({ label, args, options });
    if (label === "list")
      return { code: listCode, results: listCode === 0 ? skippedAll : [], output: ["boom"] };
    const pattern = new RegExp(args[1]);
    const results = tests.map((entry) => ({
      ...entry,
      status: pattern.test([...entry.ancestorTitles, entry.title].join(" > "))
        ? "passed"
        : "skipped",
    }));
    return { code: 0, results: passOverride ? passOverride(label, results) : results };
  };
  return { run, calls };
}

await test("runs each test alone with an anchored, escaped name pattern", async () => {
  const { run, calls } = fakeRun();
  const lines = [];

  assert.equal(
    await runTestsInParallel({ file: "a.test.ts", run, log: (line) => lines.push(line) }),
    true,
  );
  // Vitest matches -t against "describe > test"; each pattern matches only its own test.
  const names = ["upgrade > upgrades", "upgrade > rolls back (v2)", "upgrade > upgrades again"];
  assert.deepEqual(
    calls.slice(1).map((call) => names.filter((name) => new RegExp(call.args[1]).test(name))),
    [["upgrade > upgrades"], ["upgrade > rolls back (v2)"]],
  );
  assert.ok(lines.some((line) => line.includes("[2] passed  rolls back (v2)")));
});

await test("fails when a test is skipped in the process meant to run it", async () => {
  const { run } = fakeRun({
    passOverride: (label, results) =>
      label === "2" ? results.map((entry) => ({ ...entry, status: "skipped" })) : results,
  });

  assert.equal(await runTestsInParallel({ file: "a.test.ts", run, log: () => {} }), false);
});

await test("fails with Vitest's own output when listing the tests fails", async () => {
  const { run } = fakeRun({ listCode: 1 });
  const lines = [];

  assert.equal(
    await runTestsInParallel({ file: "a.test.ts", run, log: (line) => lines.push(line) }),
    false,
  );
  assert.deepEqual(lines, ["[list] boom", "No tests found in a.test.ts (vitest exited 1)."]);
});
