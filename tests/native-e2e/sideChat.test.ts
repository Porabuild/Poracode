import { afterEach, expect, it } from "vitest";
import { REMOTE_COMMAND_ID_HEADER } from "../../src/shared/remote/protocol";
import { controlRequest, pairAndAuth, startLab } from "./helpers/testClient";

let lab: Awaited<ReturnType<typeof startLab>> | undefined;
afterEach(async () => {
  await lab?.stop();
  lab = undefined;
});

it("captures bounded parent context and creates an independent child without painting private metadata", async () => {
  lab = await startLab();
  await controlRequest(lab, "/v1/checkpoints/side-chat-ready", { method: "POST" });
  const { accessToken } = await pairAndAuth(lab, [
    "session:read",
    "session:operate",
    "projects:manage",
  ]);
  const call = (path: string, body?: unknown, commandId?: string) =>
    fetch(new URL(path, lab!.httpBaseUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        ...(commandId ? { [REMOTE_COMMAND_ID_HEADER]: commandId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  expect(await (await call("/.well-known/poracode/environment")).json()).toMatchObject({
    capabilities: { conversationSnapshots: { versions: [1] } },
  });
  const source = "thread-fixture-001";
  const before = await (await call(`/api/threads/${source}/history`)).json();
  const page = await (
    await call(`/api/threads/${source}/history/items?reads=bounded-v1&limit=500`)
  ).json();
  expect(page.reads).toBe("bounded-v1");
  expect(JSON.stringify(page.items)).toContain("Private parent tool result");
  const context = { conversationSnapshot: { text: "Private parent tool result" } };
  const request = {
    kind: "start",
    projectId: before.thread.projectId,
    agentKind: before.thread.agentKind,
    config: before.thread.config,
    prompt: "Independent question",
    title: "Side chat",
    parentThreadId: source,
    focus: false,
    presentationMode: "gui",
    worktreePath: before.thread.worktreePath,
    clientContext: context,
  };
  expect((await call("/api/threads/side-one/command", request, "launch-one")).status).toBe(200);
  expect((await call("/api/threads/side-one/command", request, "launch-one")).status).toBe(200);
  const child = await (await call("/api/threads/side-one/history")).json();
  expect(child.thread.parentThreadId).toBe(source);
  expect(child.thread.worktreePath).toBe(before.thread.worktreePath);
  expect(child.runtimeItems).toHaveLength(2);
  expect(JSON.stringify(child)).not.toContain("Private parent tool result");
  const after = await (await call(`/api/threads/${source}/history`)).json();
  expect(after.thread).toEqual(before.thread);
  expect(after.runtimeItems).toEqual(before.runtimeItems);
  await controlRequest(lab, "/v1/checkpoints/side-chat-parent-updated", { method: "POST" });
  expect(
    JSON.stringify(
      await (await call(`/api/threads/${source}/history/items?reads=bounded-v1&limit=500`)).json(),
    ),
  ).toContain("Parent context changed");
  expect(
    (
      await call("/api/threads/side-one/send", {
        prompt: "Follow up",
        config: request.config,
        clientContext: { conversationSnapshot: { text: "Parent context changed" } },
      })
    ).status,
  ).toBe(200);
  const inputs = lab.lab.lifecycle.sideChats.submissions();
  expect(inputs).toHaveLength(2);
  expect(inputs[1]?.body.clientContext).toEqual({
    conversationSnapshot: { text: "Parent context changed" },
  });
  expect(JSON.stringify(await (await controlRequest(lab, "/v1/state")).json())).not.toContain(
    "Private parent tool result",
  );
  expect((await call("/api/threads/side-one/command", { kind: "delete" })).status).toBe(200);
  expect((await call("/api/threads/side-one/history")).status).toBe(404);
  expect((await call(`/api/threads/${source}/history`)).status).toBe(200);
});
