import { expect, test } from "bun:test";
import * as S from "./test-support";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import type { RemoteDesktopClient } from "@/shared/remote/client";

test("exports a transcript and lists switchable providers", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const remoteThread = {
    id: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "gpt-5" },
    title: "Export me",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [remoteThread] } }),
    threadRuntimeItemsPage: async () => ({
      items: [
        {
          id: "msg-2",
          type: "assistant_message",
          state: "completed",
          payload: { content: [] },
          streams: { assistant_text: "hi back" },
        },
        {
          id: "msg-1",
          type: "user_message",
          state: "completed",
          payload: { content: [{ kind: "text", text: "hello" }] },
          streams: {},
        },
      ],
      nextCursor: null,
    }),
    agentStatuses: async () => ({
      windows: [
        {
          kind: "codex",
          label: "Codex",
          installed: true,
          authState: "authenticated",
          capabilities: {
            presentationModes: ["gui"],
            models: [
              { id: "gpt-5", label: "GPT-5" },
              { id: "gpt-5-codex", label: "GPT-5 Codex" },
            ],
          },
        },
        {
          kind: "claude",
          label: "Claude",
          installed: true,
          authState: "authenticated",
          capabilities: {
            presentationModes: ["gui"],
            models: [{ id: "sonnet", label: "Sonnet" }],
          },
        },
      ],
      wsl: [],
    }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/experimental/session/ses_thread-1/export"),
  );
  expect(response.status).toBe(200);
  const transcript = (await response.json()) as {
    data: { info: { id: string }; messages: { type: string }[] };
  };
  expect(transcript.data.info.id).toBe("ses_thread-1");
  expect(transcript.data.messages.map((message) => message.type)).toEqual(["user", "assistant"]);
  expect(await value.exportSession("ses_thread-1")).toMatchObject({
    info: { id: "ses_thread-1" },
  });
  expect(await value.offeredProviders()).toEqual([
    { id: "codex", label: "Codex", model: "gpt-5" },
    { id: "claude", label: "Claude", model: "sonnet" },
  ]);
});

test("threadFlags/setStarred/setDone send the exact thread commands", async () => {
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
    starred: false,
    done: false,
  };
  const commands: unknown[] = [];
  const client = {
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
      const parsed = command as { kind: string; starred?: boolean; done?: boolean };
      if (parsed.kind === "set-starred") thread.starred = Boolean(parsed.starred);
      if (parsed.kind === "set-done") thread.done = Boolean(parsed.done);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  expect(await value.threadFlags("ses_thread-1")).toEqual({ starred: false, done: false });
  expect(await value.setStarred("ses_thread-1", true)).toEqual({ starred: true, done: false });
  expect(await value.setDone("ses_thread-1", true)).toEqual({ starred: true, done: true });
  expect(await value.setDone("ses_thread-1", false)).toEqual({ starred: true, done: false });
  expect(commands).toEqual([
    { kind: "set-starred", threadId: "thread-1", starred: true },
    { kind: "set-done", threadId: "thread-1", done: true },
    { kind: "set-done", threadId: "thread-1", done: false },
  ]);
  expect(await value.threadFlags("ses_ghost")).toBeUndefined();
});

test("sessionActions maps host actions and invokeSessionAction sends the payload", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "listThreadSessionActions"
        ? { actions: [{ id: "restart" }, { id: "profile" }] }
        : { ok: true, ran: true };
    },
  });
  const { value } = S.router(client);
  expect(await value.sessionActions("ses_thread-1")).toEqual([
    { id: "restart" },
    { id: "profile" },
  ]);
  expect(calls[0]).toEqual({
    name: "listThreadSessionActions",
    payload: { threadId: "thread-1" },
  });
  const result = await value.invokeSessionAction("ses_thread-1", "restart");
  expect(result).toEqual({ ok: true, ran: true });
  expect(calls[1]).toEqual({
    name: "invokeThreadSessionAction",
    payload: { threadId: "thread-1", actionId: "restart", payload: {} },
  });
});

test("sessionActions returns [] on unsupported hosts and refuses virtual subsessions", async () => {
  const client = S.promptClient({
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  expect(await value.sessionActions("ses_thread-1")).toEqual([]);
  expect(await value.sessionActions("ses_thread-1__task-1")).toEqual([]);
  await expect(value.invokeSessionAction("ses_thread-1__task-1", "x")).rejects.toThrow("read-only");
});

test("archivedThreads returns only archived gui threads for the project", async () => {
  const client = S.promptClient({
    boundedThreadListPage: async () => ({
      page: {
        threads: [
          {
            id: "t-arch",
            title: "old",
            agentKind: "codex",
            projectId: "project-1",
            presentationMode: "gui",
            config: {},
            archived: true,
            createdAt: "",
            updatedAt: "",
          },
          {
            id: "t-act",
            title: "live",
            agentKind: "codex",
            projectId: "project-1",
            presentationMode: "gui",
            config: {},
            archived: false,
            createdAt: "",
            updatedAt: "",
          },
        ],
        nextCursor: null,
      },
      reads: {},
    }),
    agentStatuses: async () => ({ windows: [], wsl: [] }),
  });
  const { value } = S.router(client);
  const archived = await value.archivedThreads();
  expect(archived.map((entry) => entry.id)).toEqual(["t-arch"]);
});

test("providerUsage returns the host response and swallows errors", async () => {
  const usage = {
    snapshots: [
      {
        providerId: "codex",
        status: "ok" as const,
        plan: "pro",
        windows: [
          { id: "5h", label: "5-hour", usedPercent: 62, resetsAt: 1_900_000_000_000 },
          { id: "7d", label: "Weekly", usedPercent: 31 },
        ],
        credits: { balance: 42 },
        fetchedAt: 1,
      },
      {
        providerId: "claude",
        status: "ok" as const,
        windows: [{ id: "5h", label: "5-hour", usedPercent: 12 }],
        fetchedAt: 1,
      },
    ],
    fromCache: false,
  };
  const client = S.promptClient({ providerUsage: async () => usage });
  const { value } = S.router(client);
  expect(await value.providerUsage()).toEqual(usage);
  const failing = S.promptClient({
    providerUsage: async () => {
      throw new Error("unsupported");
    },
  });
  const { value: value2 } = S.router(failing);
  expect(await value2.providerUsage()).toBeUndefined();
});

test("startSideChat launches a hidden gui child with the snapshot context", async () => {
  const started: Record<string, unknown>[] = [];
  const client = S.promptClient({
    startNewThread: async (input: Record<string, unknown>) => {
      started.push(input);
      return {};
    },
    describeHost: async () => ({
      capabilities: { threadLaunchMetadata: { versions: [1] } },
    }),
    threadRuntimeItemsPage: async () => ({
      items: [
        {
          id: "u1",
          type: "user_message",
          state: "completed",
          streams: {},
          payload: { text: "first" },
        },
        {
          id: "a1",
          type: "assistant_message",
          state: "completed",
          streams: { assistant_text: "answer" },
          payload: {},
        },
        {
          id: "u2",
          type: "user_message",
          state: "completed",
          streams: {},
          parentItemId: "a1",
          payload: { text: "nested" },
        },
      ],
      nextCursor: null,
    }),
  });
  const { value } = S.router(client);
  const newSession = await value.startSideChat("ses_thread-1", "what happened?");
  expect(newSession.startsWith("ses_")).toBe(true);
  const request = started[0]!;
  expect(request).toMatchObject({
    agentKind: "codex",
    presentationMode: "gui",
    parentThreadId: "thread-1",
    title: "Side chat · what happened?",
  });
  expect(request.prompt).toBe("what happened?");
  const ctx = (request.clientContext as Record<string, unknown>).conversationSnapshot;
  const text = (ctx as Record<string, unknown>).text as string;
  expect(text).toContain("User: first");
  expect(text).toContain("Assistant: answer");
  expect(text).not.toContain("nested");

  // Without the launch-metadata capability, no parentThreadId.
  const noMeta = S.promptClient({
    startNewThread: async (input: Record<string, unknown>) => {
      started.push(input);
      return {};
    },
    describeHost: async () => ({ capabilities: {} }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
  });
  const { value: value2 } = S.router(noMeta);
  await value2.startSideChat("ses_thread-1", "again");
  expect(started.at(-1)!.parentThreadId).toBeUndefined();

  // Virtual subsessions refuse.
  await expect(value.startSideChat("ses_thread-1__task-1", "x")).rejects.toThrow();
});

test("loginCandidates excludes authenticated and non-gui providers", async () => {
  const client = S.promptClient({
    agentStatuses: async () => ({
      windows: [
        {
          kind: "codex",
          installed: true,
          label: "Codex",
          capabilities: { presentationMode: "gui" },
          authState: "authenticated",
        },
        {
          kind: "kimi",
          installed: true,
          label: "Kimi",
          capabilities: { presentationMode: "gui" },
          authState: "unauthenticated",
        },
        {
          kind: "term",
          installed: true,
          label: "Term",
          capabilities: { presentationMode: "terminal" },
          authState: "unauthenticated",
        },
      ],
      wsl: [],
    }),
  });
  const { value } = S.router(client);
  expect(await value.loginCandidates()).toEqual([{ kind: "kimi", label: "Kimi" }]);
});
