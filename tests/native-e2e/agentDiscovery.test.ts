import { afterEach, expect, it } from "vitest";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("requires operate scope for a fresh host scan and publishes authoritative results to other clients", async () => {
  lab = await startLab();
  await controlRequest(lab, "/v1/checkpoints/agent-discovery-ready", { method: "POST" });
  const readonly = await pairAndAuth(lab, ["session:read"]);
  const writable = await pairAndAuth(lab, ["session:read", "session:operate"]);
  const url = new URL("api/git/call", lab.httpBaseUrl);
  const body = JSON.stringify({
    procedure: "refreshAgentStatuses",
    payload: { wslDistros: ["Ubuntu"] },
  });
  const read = async (token: string) =>
    (
      await fetch(new URL("api/agent-statuses", lab!.httpBaseUrl), {
        headers: { authorization: "Bearer " + token },
      })
    ).json();
  expect((await read(readonly.accessToken)).windows).toEqual([]);
  const denied = await fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + readonly.accessToken,
      "content-type": "application/json",
    },
    body,
  });
  expect(denied.status).toBe(403);
  expect(lab.lab.workspace.agentDiscovery.startedCount).toBe(0);
  const pending = fetch(url, {
    method: "POST",
    headers: {
      authorization: "Bearer " + writable.accessToken,
      "content-type": "application/json",
    },
    body,
  });
  await expect.poll(() => lab!.lab.workspace.agentDiscovery.startedCount).toBe(1);
  expect((await read(readonly.accessToken)).windows).toEqual([]);
  await controlRequest(lab, "/v1/checkpoints/agent-discovery-release", { method: "POST" });
  const response = await pending;
  expect(response.status).toBe(200);
  const result = (await response.json()).result;
  expect(result.fromCache).toBe(false);
  expect(result.wsl[0].envDistro).toBe("Ubuntu");
  const latest = await read(readonly.accessToken);
  expect(latest.windows[0]).toMatchObject({
    kind: "fixture-discovered",
    label: "Discovered Agent",
  });
  expect(latest.wsl).toEqual([]); // The HTTP base is project-scoped; native merges the extra scan scope.
  expect(lab.lab.workspace.agentDiscovery.startedCount).toBe(1);
});

it("tears down a pending host discovery without requiring its release checkpoint", async () => {
  lab = await startLab();
  await controlRequest(lab, "/v1/checkpoints/agent-discovery-ready", { method: "POST" });
  const { accessToken } = await pairAndAuth(lab);
  const pending = fetch(new URL("api/git/call", lab.httpBaseUrl), {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify({ procedure: "refreshAgentStatuses", payload: { wslDistros: [] } }),
  }).then(
    (response) => response.status,
    () => 0,
  );
  await expect.poll(() => lab!.lab.workspace.agentDiscovery.startedCount).toBe(1);
  await lab.stop();
  lab = undefined;
  expect([0, 409]).toContain(await pending);
});
