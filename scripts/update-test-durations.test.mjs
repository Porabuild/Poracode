import assert from "node:assert/strict";
import test from "node:test";
import { parseShardLog } from "./update-test-durations.mjs";

const prefix = "Test shard (1/8)\tUNKNOWN STEP\t2026-10-31T21:20:00.0000000Z ";

await test("reads per-file times from a shard job log, colored or not", () => {
  const log = [
    `${prefix}\u001b[32m ✓ \u001b[39m node  src/a.test.ts (3 tests) 1.25s`,
    `${prefix}^[[32m ✓ ^[[39m renderer  src/b.test.tsx (2 tests | 1 skipped) 340ms`,
    `${prefix} ✓  packages  packages/x/src/c.test.ts (1 test) 12ms`,
    `${prefix}   ✓ a single test inside a file 900ms`,
    `${prefix} Test Files  3 passed (3)`,
  ].join("\n");

  assert.deepEqual(
    [...parseShardLog(log)],
    [
      ["src/a.test.ts", 1250],
      ["src/b.test.tsx", 340],
      ["packages/x/src/c.test.ts", 12],
    ],
  );
});
