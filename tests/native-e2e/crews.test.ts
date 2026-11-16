import { afterEach, expect, it } from "vitest";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";
import { CREW_FIXTURE } from "./harness/crewFixtures.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("round trips optional saved Crews through existing settings and runtime binding contracts", async () => {
  lab = await startLab();
  expect(
    (await controlRequest(lab, "/v1/checkpoints/crews-ready", { method: "POST" })).status,
  ).toBe(200);
  const { accessToken } = await pairAndAuth(lab);
  const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
  const read = async () =>
    (await fetch(new URL("api/settings", lab!.httpBaseUrl), { headers })).json();
  const original = await read();
  expect(original.settings.crews).toEqual([CREW_FIXTURE]);
  const copy = {
    ...CREW_FIXTURE,
    id: "copy",
    name: "Native crew",
    favorite: false,
    roles: [
      {
        ...CREW_FIXTURE.roles[0]!,
        parallel: 4,
        fallbacks: [{ agentKind: "codex", model: "fixture-mini", fast: false }],
      },
    ],
  };
  const written = await fetch(new URL("api/settings", lab.httpBaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ crews: [CREW_FIXTURE, copy] }),
  });
  expect(written.status).toBe(200);
  const result = await read();
  expect(result.settings.crews).toEqual([CREW_FIXTURE, copy]);
  expect(result.settings.providerOrder).toEqual(original.settings.providerOrder);
  const history = await (
    await fetch(new URL("api/threads/thread-fixture-001/history", lab.httpBaseUrl), { headers })
  ).json();
  expect(history.thread.config.crew).toMatchObject({
    version: 1,
    crewId: CREW_FIXTURE.id,
    roles: CREW_FIXTURE.roles,
  });
  const invalid = await fetch(new URL("api/settings", lab.httpBaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ crews: [{ ...copy, roles: [{ ...copy.roles[0], parallel: 5 }] }] }),
  });
  expect(invalid.status).toBe(400);
  expect((await read()).settings.crews).toEqual([CREW_FIXTURE, copy]);
});
