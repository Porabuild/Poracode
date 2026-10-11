import { writeFileSync } from "node:fs";
import {
  assertExpectedInventoryCounts,
  buildOperationMap,
  loadCommittedOperationMap,
  operationMapPath,
} from "./operationMap.ts";

/**
 * Regenerate the committed operation map (`tests/native-e2e/harness/
 * operation-map.json`) from the live protocol manifest and the generated v3
 * inventory `sourceHash` (via `computeManifestHash`/`inventorySourceHash`).
 *
 * Run this in the same change that regenerates
 * `protocol/remote/v3/generated/inventory.json`:
 *
 *   node --experimental-transform-types --disable-warning=ExperimentalWarning \
 *     tests/native-e2e/harness/refreshOperationMap.ts
 *
 * The lock test (`tests/native-e2e/operationMap.test.ts`) fails on any drift
 * between the committed map and the live manifest/inventory pair; the core
 * `Lint` job and the native remote-v3 contract job both run it, so a stale
 * `manifestHash` fails where protocol changes are made instead of late in the
 * native foundation job.
 */

const committed = loadCommittedOperationMap();
const map = buildOperationMap();
const path = operationMapPath();
writeFileSync(path, `${JSON.stringify(map, null, 2)}\n`);

if (committed.manifestHash !== map.manifestHash) {
  console.log(`manifestHash refreshed: ${committed.manifestHash} -> ${map.manifestHash}`);
} else {
  console.log(`manifestHash unchanged: ${map.manifestHash}`);
}
console.log(`wrote ${path} (${String(map.keyCount)} operation keys)`);

// Key-count drift needs a code change the script must not make silently: the
// count expectations live next to the hash in operationMap.ts and the lock
// test enforces them.
try {
  assertExpectedInventoryCounts(map);
} catch (error) {
  console.warn(
    `[warn] ${error instanceof Error ? error.message : String(error)}\n` +
      "[warn] update EXPECTED_OPERATION_KEY_COUNT / EXPECTED_COUNTS in " +
      "tests/native-e2e/harness/operationMap.ts and review the operation-map lock",
  );
}
