import assert from "node:assert/strict";
import test from "node:test";
import { parseShardLog } from "./update-test-durations.mjs";

const prefix = "Test shard (1/8)\tUNKNOWN STEP\t2026-10-31T21:20:00.0000000Z ";

await test("reads per-file times from a shard job log, colored or not", () => {
  const log = [
    // Captured from a CI shard log (Vitest 5 prints milliseconds).
    `${prefix}^[[32m✓^[[39m ^[[30m^[[43m node ^[[49m^[[39m src/server/serverUpgrade.integration.test.ts ^[[2m(^[[22m^[[2m3 tests^[[22m^[[2m)^[[22m^[[33m 1147305^[[2mms^[[22m^[[39m`,
    `${prefix}\u001b[32m ✓ \u001b[39m node  src/a.test.ts (3 tests) 1.25s`,
    `${prefix}^[[32m ✓ ^[[39m renderer  src/b.test.tsx (2 tests | 1 skipped) 340ms`,
    `${prefix} ✓  packages  packages/x/src/c.test.ts (1 test) 12ms`,
    `${prefix}   ✓ a single test inside a file 900ms`,
    `${prefix} Test Files  3 passed (3)`,
  ].join("\n");

  assert.deepEqual(
    [...parseShardLog(log)],
    [
      ["src/server/serverUpgrade.integration.test.ts", 1147305],
      ["src/a.test.ts", 1250],
      ["src/b.test.tsx", 340],
      ["packages/x/src/c.test.ts", 12],
    ],
  );
});
