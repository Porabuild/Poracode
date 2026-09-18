import assert from "node:assert/strict";
import test from "node:test";
import { areasForFile, isProductionFile } from "./smoke-scenarios.mjs";

await test("backend production files are production roots mapped to areas", () => {
  const backendFiles = [
    "src/backend/BackendHostCore.ts",
    "src/backend/BackendDurableServices.ts",
    "src/backend/electronIpcBackpressure.ts",
    "src/backend/index.ts",
    "src/backend/legacyMigrationWorker.ts",
  ];
  for (const file of backendFiles) {
    assert.ok(isProductionFile(file), `${file} must count as a production file`);
    assert.ok(areasForFile(file).length > 0, `${file} must map to a functional area`);
  }
  assert.equal(isProductionFile("src/backend/BackendHostCore.test.ts"), false);
  assert.equal(isProductionFile("src/backend/fixtures/helper.ts"), false);
});

await test("backend-only changes select baseline plus IPC runtime coverage", () => {
  const areas = areasForFile("src/backend/BackendHostCore.ts");
  assert.deepEqual(
    areas.map((area) => area.id),
    ["shared-runtime"],
  );
  assert.ok(areas[0].automated.includes("baseline"));
  assert.ok(areas[0].manual.includes("ipc-roundtrip"));
});

await test("backend browser proxy changes keep their existing area gates", () => {
  const areas = areasForFile("src/backend/BackendRemoteBrowserProxy.ts");
  assert.ok(areas.some((area) => area.id === "shared-runtime"));
  assert.ok(areas.some((area) => area.id === "browser" && area.automated.includes("browser")));
});
