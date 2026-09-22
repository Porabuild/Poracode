import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { runSettingsScenario } from "./smoke-settings.mjs";

await test("releases the owned MCP fixture even when renderer setup and restoration both fail", async () => {
  const server = createServer((_request, response) => response.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const failure = new Error("renderer disconnected");
  const close = () =>
    new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  try {
    await assert.rejects(
      runSettingsScenario({
        client: {},
        mode: "mock",
        outDir: "/unused",
        startMcpProbeFixture: async () => ({ origin: "http://127.0.0.1", close }),
        evaluate: async () => {
          throw failure;
        },
      }),
      failure,
    );
    assert.equal(server.listening, false);
  } finally {
    if (server.listening) await close();
  }
});
