import { expect, test } from "bun:test";
import * as S from "./test-support";
import { formId } from "../ids";
import { RemoteClientError } from "@/shared/remote/client";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import type { RemoteDesktopClient } from "@/shared/remote/client";

test("recovers a pending question form and resolves its shared answer shape", async () => {
  const resolved: unknown[] = [];
  const request = {
    requestId: "question-1",
    requestType: "tool_user_input",
    payload: {
      summary: "Choose a color",
      details: {
        userInputForm: {
          questions: [
            {
              id: "color",
              header: "Color",
              question: "Choose one",
              options: [{ optionId: "blue", label: "Blue" }],
              multiSelect: false,
            },
          ],
        },
      },
    },
  };
  const client = {
    threadRuntimeItemsPage: async () => ({
      items: [
        {
          id: "pending_request:question-1",
          type: "pending_request",
          state: "started",
          payload: request,
          streams: {},
        },
        {
          id: "pending_request:approval-1",
          type: "pending_request",
          state: "started",
          payload: {
            requestId: "approval-1",
            requestType: "command_execution_approval",
            payload: { summary: "Approve command" },
          },
          streams: {},
        },
      ],
    }),
    resolveRequest: async (value: unknown) => {
      resolved.push(value);
    },
  } as unknown as RemoteDesktopClient;
  const { events, value } = S.router(client);
  const sessionID = "ses_thread-1";
  const list = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/form`),
  );
  expect(list.status).toBe(200);
  expect(await list.json()).toMatchObject({
    data: [
      {
        id: formId("thread-1", "question-1"),
        sessionID,
        title: "Choose a color",
        fields: [{ key: "color", type: "string" }],
      },
    ],
  });
  const permissions = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/permission`),
  );
  expect(await permissions.json()).toMatchObject([
    {
      id: expect.stringMatching(/^per_/u),
      sessionID,
      action: "command_execution_approval",
      metadata: {
        options: [
          { optionId: "allow", label: "Allow" },
          { optionId: "deny", label: "Deny" },
        ],
      },
    },
  ]);
  const eventStream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = eventStream.body!.getReader();
  await reader.read();
  const reply = await value.handle(
    new Request(
      `http://poracode.invalid/api/session/${sessionID}/form/${formId("thread-1", "question-1")}/reply`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: { color: "blue" } }),
      },
    ),
  );
  expect(reply.status).toBe(204);
  expect(resolved).toEqual([
    {
      threadId: "thread-1",
      requestId: "question-1",
      method: "requestPermission",
      response: { answers: { color: "blue" } },
    },
  ]);
  const frame = await reader.read();
  const data = new TextDecoder().decode(frame.value).match(/^data: (.+)$/mu)?.[1];
  expect(JSON.parse(data!).type).toBe("form.replied");
  events.resync();
});

test("returns empty request lists before a local session has a host thread", async () => {
  const client = {
    threadRuntimeItemsPage: async () => {
      throw new RemoteClientError("Thread not found.", 404, "thread_not_found");
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const forms = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/form"),
  );
  const permissions = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/permission"),
  );
  expect(forms.status).toBe(200);
  expect(await forms.json()).toEqual({ data: [] });
  expect(permissions.status).toBe(200);
  expect(await permissions.json()).toEqual([]);
});

test("scopes form IDs and pending requests to their thread", async () => {
  const resolved: unknown[] = [];
  const client = {
    threadRuntimeItemsPage: async ({ threadId }: { threadId: string }) => ({
      items: [
        {
          id: "pending_request:question-1",
          type: "pending_request",
          state: "started",
          payload: {
            requestId: "question-1",
            requestType: "tool_user_input",
            payload: {
              summary: `Question for ${threadId}`,
              details: { userInputForm: { questions: [{ id: "answer", question: "Answer?" }] } },
            },
          },
        },
      ],
    }),
    resolveRequest: async (value: unknown) => {
      resolved.push(value);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const formFor = async (sessionID: string) => {
    const response = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/form`),
    );
    return ((await response.json()) as { data: Array<{ id: string }> }).data[0]!.id;
  };
  const firstID = await formFor("ses_thread-1");
  const secondID = await formFor("ses_thread-2");
  expect(firstID).not.toBe(secondID);
  const mismatched = await value.handle(
    new Request(`http://poracode.invalid/api/session/ses_thread-2/form/${firstID}`, {
      method: "DELETE",
    }),
  );
  expect(mismatched.status).toBe(404);
  const reply = await value.handle(
    new Request(`http://poracode.invalid/api/session/ses_thread-2/form/${secondID}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: { answer: "thread two" } }),
    }),
  );
  expect(reply.status).toBe(204);
  expect(resolved).toEqual([
    {
      threadId: "thread-2",
      requestId: "question-1",
      method: "requestPermission",
      response: { answers: { answer: "thread two" } },
    },
  ]);
});

test("cancels a pending question with the renderer dismissal response", async () => {
  let resolved: unknown;
  const client = {
    threadRuntimeItemsPage: async () => ({
      items: [
        {
          id: "pending_request:question-cancel",
          type: "pending_request",
          state: "started",
          payload: {
            requestId: "question-cancel",
            requestType: "tool_user_input",
            payload: {
              summary: "Question",
              details: { userInputForm: { questions: [{ question: "Why?" }] } },
            },
          },
        },
      ],
    }),
    resolveRequest: async (value: unknown) => {
      resolved = value;
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const session = "ses_thread-1";
  const response = await value.handle(
    new Request(
      `http://poracode.invalid/api/session/${session}/form/${formId("thread-1", "question-cancel")}`,
      { method: "DELETE" },
    ),
  );
  expect(response.status).toBe(204);
  expect(resolved).toEqual({
    threadId: "thread-1",
    requestId: "question-cancel",
    method: "requestPermission",
    response: { action: "cancel" },
  });
});

test("empty-schema elicitation surfaces as a permission and resolves accept/decline", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const thread = {
    id: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "m1" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const resolved: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
    resolveRequest: async (input: unknown) => {
      resolved.push(input);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  // Reload path: the pending_request item lists as an elicitation permission.
  (client as unknown as Record<string, unknown>).threadRuntimeItemsPage = async () => ({
    items: [
      {
        id: "pending_request:req-1",
        type: "pending_request",
        state: "started",
        streams: {},
        payload: {
          requestId: "req-1",
          requestType: "tool_user_input",
          payload: S.elicitationPayload,
        },
      },
    ],
    nextCursor: null,
  });
  const listed = (await (
    await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/permission"))
  ).json()) as {
    id: string;
    action: string;
    message: string;
    metadata: { options: { optionId: string }[] };
  }[];
  expect(listed).toHaveLength(1);
  expect(listed[0]).toMatchObject({
    action: "elicitation",
    message: 'Allow the poracode MCP server to run tool "read_project_file"?',
    metadata: {
      options: [{ optionId: "accept" }, { optionId: "decline" }],
    },
  });

  const permissionID = listed[0]!.id;
  const reply = (decision: string) =>
    value.handle(
      new Request(
        `http://poracode.invalid/api/session/ses_thread-1/permission/${permissionID}/reply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      ),
    );
  expect((await reply("once")).status).toBe(204);
  expect(resolved[0]).toMatchObject({
    threadId: "thread-1",
    requestId: "req-1",
    response: { action: "accept", content: {} },
  });

  // Reload the pending record (the item is still open), then reject -> decline.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/permission"));
  (resolved as unknown[]).length = 0;
  expect((await reply("reject")).status).toBe(204);
  expect(resolved[0]).toMatchObject({ response: { action: "decline" } });

  // The live path emits permission.asked instead of an unsupported-form toast.
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  await reader.read(); // server.connected
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "request.opened",
      threadId: "thread-1",
      requestId: "req-2",
      requestType: "tool_user_input",
      payload: S.elicitationPayload,
    },
  });
  const frame = await reader.read();
  const lines = [...decoder.decode(frame.value).matchAll(/^data: (.+)$/gmu)].map((line) =>
    JSON.parse(line[1]!),
  );
  const asked = lines.find((event) => event.type === "permission.asked");
  expect(asked).toBeTruthy();
  expect(asked!.data).toMatchObject({
    action: "elicitation",
    message: 'Allow the poracode MCP server to run tool "read_project_file"?',
  });
  expect(lines.some((event) => event.type === "form.created")).toBe(false);

  // "always" collapses to accept (no persistent grant exists).
  (resolved as unknown[]).length = 0;
  const liveID = asked!.data.id as string;
  const always = await value.handle(
    new Request(`http://poracode.invalid/api/session/ses_thread-1/permission/${liveID}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "always" }),
    }),
  );
  expect(always.status).toBe(204);
  expect(resolved[0]).toMatchObject({
    requestId: "req-2",
    response: { action: "accept", content: {} },
  });
});
