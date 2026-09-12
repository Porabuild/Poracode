import type { WebSocket } from "ws";
import { expect } from "vitest";
import { controlRequest, startLab } from "./testClient.ts";

export async function expectScenarioConflict(
  harness: Awaited<ReturnType<typeof startLab>>,
  action: Record<string, unknown>,
): Promise<void> {
  const response = await controlRequest(harness, "/v1/scenario/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: {
      code: "scenario_request_conflict",
      message: "Scenario request ID was reused with different action parameters.",
    },
  });
}

export async function waitForSocketOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}
