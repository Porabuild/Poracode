import { afterEach, expect, it } from "vitest";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient.ts";
import {
  WORKFLOW_FIXTURE_MANIFEST,
  WORKFLOW_FIXTURE_REFERENCE,
} from "./harness/workflowFixtures.ts";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("keeps canonical workflow metadata after foreground completion and retires through a manifest read", async () => {
  lab = await startLab();
  expect(
    (await controlRequest(lab, "/v1/checkpoints/workflow-liveness-ready", { method: "POST" }))
      .status,
  ).toBe(200);
  const { accessToken } = await pairAndAuth(lab);
  const headers = { authorization: "Bearer " + accessToken, "content-type": "application/json" };
  const snapshot = await fetch(new URL("api/snapshot", lab.httpBaseUrl), { headers });
  expect(snapshot.status).toBe(200);
  const thread = (await snapshot.json()).threads[0];
  expect(thread.status).toBe("finished");
  const call = async () => {
    const response = await fetch(new URL("api/git/call", lab!.httpBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        procedure: "workflowGetRun",
        payload: {
          manifestPath: WORKFLOW_FIXTURE_MANIFEST,
          transcriptDir: WORKFLOW_FIXTURE_REFERENCE.transcriptDir,
          location: { path: "/Users/fixture/project", kind: "posix" },
          includeAgentChats: false,
        },
      }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).result;
  };
  expect((await call()).run.status).toBe("running");
  expect(
    (await controlRequest(lab, "/v1/checkpoints/workflow-liveness-completed", { method: "POST" }))
      .status,
  ).toBe(200);
  expect((await call()).run.status).toBe("completed");
  const after = await fetch(new URL("api/snapshot", lab.httpBaseUrl), { headers });
  expect((await after.json()).threads[0].status).toBe("finished");
});
