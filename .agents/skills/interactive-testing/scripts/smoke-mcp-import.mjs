import assert from "node:assert/strict";

/** Verify storage and presentation independently, within the same observation budget. */
export async function verifyProjectMcpImport({
  client,
  evaluate,
  waitForValue,
  projectId,
  serverName,
  timeoutMs,
  now = Date.now,
}) {
  assert.ok(typeof projectId === "string" && projectId.length > 0);
  assert.ok(typeof serverName === "string" && serverName.length > 0);
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0);
  const started = now(),
    deadline = started + timeoutMs;
  const evidence = {
    formatVersion: 1,
    projectId,
    serverName,
    phase: "persistence",
    observations: [],
    droppedObservations: 0,
  };
  const record = (state) => {
    if (evidence.observations.length === 32) {
      evidence.observations.shift();
      evidence.droppedObservations++;
    }
    evidence.observations.push({ phase: evidence.phase, elapsedMs: now() - started, state });
  };
  const read = async (expression) => {
    assert.ok(now() < deadline, "MCP import verification observation budget exhausted");
    const state = await evaluate(client, expression, true);
    record(state);
    assert.ok(now() < deadline, "MCP import verification observation budget exhausted");
    return state;
  };
  try {
    const persistence = await waitForValue(
      () =>
        read(`(async () => {
        const { loopback } = await window.__poracodeDev.loadHostDiagnostics();
        const activation = loopback.readManagedLoopbackActivation();
        if (!activation) throw new Error("Managed host is not active for MCP persistence verification");
        const settings = await activation.client.projectSettings(${JSON.stringify(projectId)});
        return { persisted: settings.mcpServers?.some(server => server.name === ${JSON.stringify(serverName)}) === true };
      })()`),
      (state) => state?.persisted === true,
      "authoritative project MCP import persistence",
    );
    evidence.persistence = persistence;
    evidence.phase = "presentation";
    const presentation = await waitForValue(
      () =>
        read(`(() => {
        const row = [...document.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === ${JSON.stringify(`Delete ${serverName}`)});
        return { importHeadingPresent: document.body.innerText.includes("Import external agent MCP servers"),
          rowHasRect: Boolean(row?.getClientRects().length), visibility: document.visibilityState };
      })()`),
      (state) =>
        state?.importHeadingPresent === false &&
        state.rowHasRect === true &&
        state.visibility === "visible",
      "MCP project import dialog closure and row layout in a visible document",
    );
    evidence.presentation = presentation;
    evidence.phase = "complete";
    return evidence;
  } catch (error) {
    const failure = new Error(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
    failure.scenarioEvidence = evidence;
    throw failure;
  }
}
