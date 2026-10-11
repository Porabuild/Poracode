import test from "node:test";
import assert from "node:assert/strict";
import { verifyProjectMcpImport } from "./smoke-mcp-import.mjs";

function fixture({
  persistence = [{ persisted: true }],
  presentation = [{ importHeadingPresent: false, rowHasRect: true, visibility: "visible" }],
  limit = 5,
  advance = 1,
  timeoutMs = 100,
} = {}) {
  let time = 0;
  const calls = [];
  return {
    calls,
    input: {
      client: {},
      projectId: "smoke-project",
      serverName: "smoke_external",
      timeoutMs,
      now: () => time,
      evaluate: async (_client, expression, awaitPromise) => {
        assert.equal(awaitPromise, true);
        const phase = expression.includes("projectSettings(") ? "persistence" : "presentation";
        calls.push(phase);
        time += advance;
        const states = phase === "persistence" ? persistence : presentation;
        return states.length > 1 ? states.shift() : states[0];
      },
      waitForValue: async (read, predicate, label) => {
        for (let i = 0; i < limit; i++) {
          const state = await read();
          if (predicate(state)) return state;
        }
        throw new Error("Timed out: " + label);
      },
    },
  };
}

void test("accepted storage and visible presentation are separate required gates", async () => {
  const f = fixture({
    persistence: [{ persisted: false }, { persisted: true }],
    presentation: [
      { importHeadingPresent: true, rowHasRect: false, visibility: "visible" },
      { importHeadingPresent: false, rowHasRect: true, visibility: "visible" },
    ],
  });
  const result = await verifyProjectMcpImport(f.input);
  assert.deepEqual(f.calls, ["persistence", "persistence", "presentation", "presentation"]);
  assert.equal(result.phase, "complete");
  assert.equal(result.persistence.persisted, true);
  assert.equal(result.presentation.rowHasRect, true);
});

void test("missing authoritative save cannot be qualified by a rendered row", async () => {
  const f = fixture({ persistence: [{ persisted: false }] });
  await assert.rejects(
    () => verifyProjectMcpImport(f.input),
    (e) =>
      e.scenarioEvidence.phase === "persistence" &&
      e.message.includes("authoritative project MCP import persistence"),
  );
  assert.ok(f.calls.every((p) => p === "persistence"));
});

void test("persisted data does not qualify retained modal or hidden presentation", async () => {
  for (const presentation of [
    { importHeadingPresent: true, rowHasRect: true, visibility: "visible" },
    { importHeadingPresent: false, rowHasRect: true, visibility: "hidden" },
    { importHeadingPresent: false, rowHasRect: false, visibility: "visible" },
  ]) {
    const f = fixture({ presentation: [presentation] });
    await assert.rejects(
      () => verifyProjectMcpImport(f.input),
      (e) =>
        e.scenarioEvidence.phase === "presentation" &&
        e.scenarioEvidence.persistence.persisted === true &&
        e.scenarioEvidence.observations.at(-1).state === presentation,
    );
  }
});

void test("phase changes do not reset the original observation budget", async () => {
  const f = fixture({ timeoutMs: 3, advance: 2 });
  await assert.rejects(
    () => verifyProjectMcpImport(f.input),
    (e) =>
      e.message.includes("observation budget exhausted") &&
      e.scenarioEvidence.phase === "presentation",
  );
  assert.deepEqual(f.calls, ["persistence", "presentation"]);
});

void test("failure observations stay bounded and preserve the latest phase", async () => {
  const f = fixture({ persistence: [{ persisted: false }], limit: 50 });
  await assert.rejects(
    () => verifyProjectMcpImport(f.input),
    (e) =>
      e.scenarioEvidence.observations.length === 32 &&
      e.scenarioEvidence.droppedObservations === 18 &&
      e.scenarioEvidence.observations.at(-1).elapsedMs === 50,
  );
});
