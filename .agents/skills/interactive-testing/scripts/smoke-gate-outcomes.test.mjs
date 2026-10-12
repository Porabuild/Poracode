import assert from "node:assert/strict";
import test from "node:test";
import { finalizeManualOutcomes, recordManualGate } from "./smoke-gate-outcomes.mjs";

function reportWith(rows) {
  return { manual: rows.map(([gate, status, detail]) => ({ gate, status, detail })) };
}

await test("a failed mock gate keeps its fail status through finalization", () => {
  const report = reportWith([["terminal-pty", "required", "not yet run"]]);
  recordManualGate(report, "terminal-pty", "fail", "terminal presentation control did not render");
  finalizeManualOutcomes(report, { mode: "mock", acknowledged: ["terminal-pty"] });
  assert.equal(report.manual[0].status, "fail");
  assert.equal(report.manual[0].detail, "terminal presentation control did not render");
});

await test("a not-run mock gate stays required instead of being stamped mocked", () => {
  const report = reportWith([
    ["quick-composer", "required", "Invoke the global composer through real controls."],
  ]);
  finalizeManualOutcomes(report, { mode: "mock", acknowledged: ["quick-composer"] });
  assert.equal(report.manual[0].status, "required");
  assert.equal(report.manual[0].detail, "Invoke the global composer through real controls.");
});

await test("a passing mock gate records mocked and keeps it", () => {
  const report = reportWith([["ipc-roundtrip", "required", "ipc-roundtrip gate description"]]);
  recordManualGate(
    report,
    "ipc-roundtrip",
    "mocked",
    "database and settings IPC round-trips returned successfully",
  );
  finalizeManualOutcomes(report, { mode: "mock", acknowledged: [] });
  assert.equal(report.manual[0].status, "mocked");
  assert.equal(
    report.manual[0].detail,
    "database and settings IPC round-trips returned successfully",
  );
});

await test("real mode acknowledges only listed required gates", () => {
  const report = reportWith([
    ["provider-live", "required", "d"],
    ["terminal-pty", "required", "d"],
  ]);
  finalizeManualOutcomes(report, { mode: "real", acknowledged: ["provider-live"] });
  assert.equal(report.manual[0].status, "acknowledged");
  assert.equal(report.manual[1].status, "required");
});

await test("a failed gate is never acknowledged in real mode either", () => {
  const report = reportWith([["terminal-pty", "required", "d"]]);
  recordManualGate(report, "terminal-pty", "fail", "boom");
  finalizeManualOutcomes(report, { mode: "real", acknowledged: ["terminal-pty"] });
  assert.equal(report.manual[0].status, "fail");
});

await test("recording an outcome for a gate outside the report throws", () => {
  const report = reportWith([]);
  assert.throws(
    () => recordManualGate(report, "ipc-roundtrip", "mocked", "d"),
    /not part of the report/,
  );
});
