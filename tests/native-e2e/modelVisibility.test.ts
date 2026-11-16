import { afterEach, expect, it } from "vitest";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("hydrates the cross-client model catalogs and persists exact runtime visibility keys", async () => {
  lab = await startLab();
  const { accessToken } = await pairAndAuth(lab);
  const headers = { authorization: "Bearer " + accessToken, "content-type": "application/json" };
  for (let index = 0; index < 2; index++) {
    expect(
      (await controlRequest(lab, "/v1/checkpoints/model-visibility-ready", { method: "POST" }))
        .status,
    ).toBe(200);
    const statuses = await (
      await fetch(new URL("api/agent-statuses", lab.httpBaseUrl), { headers })
    ).json();
    const named = statuses.windows.filter(
      (status: { kind: string }) => status.kind === "named-fixture",
    );
    expect(named).toHaveLength(1);
    expect(
      named[0].runtimeVariants.bridge.capabilities.models.map((model: { id: string }) => model.id),
    ).toEqual(["remote/shared", "remote/chat"]);
  }
  const hiddenModels = {
    unrelated: ["retired"],
    "named-fixture": ["remote/terminal"],
    "named-fixture-bridge": [],
  };
  const written = await fetch(new URL("api/settings", lab.httpBaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ hiddenModels }),
  });
  expect(written.status).toBe(200);
  const result = await (await fetch(new URL("api/settings", lab.httpBaseUrl), { headers })).json();
  expect(result.settings.hiddenModels).toEqual(hiddenModels);
});
