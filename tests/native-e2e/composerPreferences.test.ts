import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";
import { REMOTE_COMMAND_ID_HEADER } from "../../src/shared/remote/protocol.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("hydrates native and WSL provider-order catalogs without replacing an identical kind in another environment", async () => {
  lab = await startLab();
  const { accessToken } = await pairAndAuth(lab);
  const headers = { authorization: "Bearer " + accessToken };
  for (let index = 0; index < 2; index += 1) {
    expect(
      (await controlRequest(lab, "/v1/checkpoints/provider-order-ready", { method: "POST" }))
        .status,
    ).toBe(200);
    const response = await fetch(new URL("api/agent-statuses", lab.httpBaseUrl), { headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.windows.map((status: { kind: string }) => status.kind)).toEqual([
      "codex",
      "fixture-reviewer",
    ]);
    expect(body.windows.every((status: { envKind: string }) => status.envKind === "posix")).toBe(
      true,
    );
    expect(body.wsl.map((status: { kind: string }) => status.kind)).toEqual([
      "codex",
      "fixture-reviewer",
    ]);
    expect(
      body.wsl.every(
        (status: { envKind: string; envDistro: string }) =>
          status.envKind === "wsl" && status.envDistro === "Ubuntu",
      ),
    ).toBe(true);
  }
});

it("qualifies the explicit, narrow native draft-preference intent without replacing project metadata", async () => {
  lab = await startLab();
  expect(
    (await controlRequest(lab, "/v1/checkpoints/composer-preferences-ready", { method: "POST" }))
      .status,
  ).toBe(200);
  const { accessToken } = await pairAndAuth(lab);
  const headers = { authorization: "Bearer " + accessToken, "content-type": "application/json" };
  const environment = await fetch(new URL(".well-known/poracode/environment", lab.httpBaseUrl), {
    headers,
  });
  expect(environment.status).toBe(200);
  expect((await environment.json()).capabilities.catalogMutations).toEqual({ versions: [1] });
  const statuses = await fetch(new URL("api/agent-statuses", lab.httpBaseUrl), { headers });
  expect(statuses.status).toBe(200);
  expect((await statuses.json()).windows).toContainEqual(
    expect.objectContaining({
      kind: "fixture-reviewer",
      capabilities: expect.objectContaining({ efforts: ["low", "high"] }),
    }),
  );
  const snapshot = await fetch(new URL("api/snapshot", lab.httpBaseUrl), { headers });
  expect(snapshot.status).toBe(200);
  const before = (await snapshot.json()).projects[0];
  const config = {
    agentKind: "fixture-reviewer",
    model: "review-model",
    effort: "high",
    fast: false,
    contextSize: "",
    worktreeMode: false,
    crew: null,
  };
  const body = { kind: "set-draft-config", projectId: before.id, lastDraftConfig: config };
  const missingID = await fetch(new URL("api/projects/command", lab.httpBaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  expect(missingID.status).toBe(400);
  const response = await fetch(new URL("api/projects/command", lab.httpBaseUrl), {
    method: "POST",
    headers: { ...headers, [REMOTE_COMMAND_ID_HEADER]: randomUUID() },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.ok).toBe(true);
  expect(result.project).toEqual({ ...before, lastDraftConfig: config });
  const next = await fetch(new URL("api/snapshot", lab.httpBaseUrl), { headers });
  expect((await next.json()).projects[0]).toEqual(result.project);
});
