import { expect, setSystemTime, test } from "bun:test";
import * as S from "./test-support";
import { agentStatusSchema, DEFAULT_TERMINAL_SIZE } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import { TUI_LAST_MODEL_FILE_NAME } from "@/shared/tuiBootstrap";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { MessageListOutput, SessionInfo, SessionListOutput } from "@opencode/client";

test("maps a persisted remote thread to a resumable OpenCode session ID", async () => {
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
    config: { mode: "agent", model: "model-1" },
    title: "Prior thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [remoteThread] } }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const list = (await (
    await value.handle(new Request("http://poracode.invalid/api/session"))
  ).json()) as SessionListOutput;
  expect(list.data.map((session) => session.id)).toEqual(["ses_thread-1"]);
  const session = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1"),
  );
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({
    data: { id: "ses_thread-1", projectID: "project-1" },
  });
});

test("starts a new remote thread from the TUI text prompt and local session selection", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-last-model-test-"));
  const previousHome = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const project = remoteProjectSchema.parse({
      id: "project-1",
      name: "project",
      location: { kind: "windows", path: "C:/repo" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const status = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        models: [{ id: "model-1", label: "Model 1" }],
        modes: ["agent"],
        defaultApprovalPolicy: "ask",
        defaultSandboxMode: "read",
      },
    });
    let started: Parameters<RemoteDesktopClient["startNewThread"]>[0] | undefined;
    const sequence: string[] = [];
    const client = {
      boundedProjectListPage: async () => ({ projects: [project] }),
      agentStatuses: async () => ({ windows: [status], wsl: [] }),
      boundedThreadListPage: async () => ({ page: { threads: [] } }),
      callRemoteProcedure: async () => ({ directoryPath: "", entries: [] }),
      startNewThread: async (value: Parameters<RemoteDesktopClient["startNewThread"]>[0]) => {
        sequence.push("start");
        started = value;
        return { threadId: value.threadId };
      },
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home, async (ids) => {
      sequence.push(`interest:${ids[0]}`);
    });
    const sessionID = "ses_prompt-regression";
    const create = await value.handle(
      new Request("http://poracode.invalid/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: sessionID,
          agent: "build",
          model: { id: "model-1", providerID: "codex", variant: "low" },
        }),
      }),
    );
    expect(create.status).toBe(200);
    expect(await create.json()).toMatchObject({
      data: {
        id: sessionID,
        projectID: "project-1",
        model: { id: "model-1", providerID: "codex" },
      },
    });
    await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/model`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: { id: "model-1", providerID: "codex", variant: "low" },
        }),
      }),
    );
    const localSession = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}`),
    );
    expect(localSession.status).toBe(200);
    expect(await localSession.json()).toMatchObject({
      data: {
        id: sessionID,
        projectID: "project-1",
        agent: "build",
        model: { id: "model-1", providerID: "codex" },
      },
    });
    const response = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "msg_prompt-regression",
          text: "Reply with exactly: OK",
          files: [],
          agents: [],
          delivery: "steer",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        id: "msg_prompt-regression",
        sessionID,
        type: "user",
        payload: { text: "Reply with exactly: OK" },
        delivery: "steer",
      },
    });
    expect(started).toMatchObject({
      threadId: "prompt-regression",
      projectId: "project-1",
      agentKind: "codex",
      config: {
        model: "model-1",
        effort: "low",
        mode: "agent",
        approvalPolicy: "ask",
        sandboxMode: "read",
      },
      prompt: "Reply with exactly: OK",
      userMessageItemId: "prompt-regression",
      presentationMode: "gui",
    });
    expect(sequence).toEqual(["interest:prompt-regression", "start"]);
    const location = await value.handle(
      new Request(
        "http://poracode.invalid/api/location?location.directory=C%3A%2Frepo%2Fsubdirectory",
      ),
    );
    expect(await location.json()).toEqual({
      directory: "C:/repo/subdirectory",
      project: { id: "project-1", directory: "C:/repo", canonical: "C:/repo" },
    });
    const projects = await value.handle(new Request("http://poracode.invalid/api/project"));
    expect(await projects.json()).toMatchObject([
      { id: "project-1", canonical: "C:/repo", name: "project" },
    ]);
    const files = await value.handle(
      new Request("http://poracode.invalid/api/fs/list?location.directory=C%3A%2Frepo"),
    );
    expect(await files.json()).toEqual({ location: { directory: "C:/repo" }, data: [] });
    const forms = await value.handle(
      new Request("http://poracode.invalid/api/form?location.directory=C%3A%2Frepo"),
    );
    expect(await forms.json()).toEqual({ location: { directory: "C:/repo" }, data: [] });
    const inbox = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/inbox`),
    );
    expect(await inbox.json()).toEqual({ data: [] });
    expect(JSON.parse(await readFile(join(home, TUI_LAST_MODEL_FILE_NAME), "utf8"))).toMatchObject({
      version: 1,
      provider: "codex",
      model: "model-1",
      effort: "low",
      approvalPolicy: "ask",
      sandboxMode: "read",
    });
  } finally {
    if (previousHome === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("resumes a persisted thread after a typed pre-effect unknown-session refusal", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-resume-test-"));
  try {
    const project = remoteProjectSchema.parse({
      id: "project-1",
      name: "project",
      location: { kind: "windows", path: "C:/repo" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const status = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        models: [{ id: "model-1", label: "Model 1" }],
        modes: ["agent"],
        defaultApprovalPolicy: "ask",
        defaultSandboxMode: "read",
      },
    });
    const staleThread = {
      id: "thread-old",
      projectId: "project-1",
      agentKind: "codex",
      agentInstanceId: "instance-stale",
      config: { model: "model-stale", mode: "agent" },
      canResumeWithConfig: true,
      sessionRef: {
        providerSessionId: "provider-session-stale",
        discoveredAt: "2026-01-01T00:00:00.000Z",
      },
      presentationMode: "gui",
    };
    const latestThread = {
      ...staleThread,
      agentInstanceId: "instance-latest",
      config: { model: "model-latest", mode: "plan", effort: "high" },
      sessionRef: {
        providerSessionId: "provider-session-latest",
        discoveredAt: "2026-02-01T00:00:00.000Z",
      },
    };
    const sequence: string[] = [];
    let threadListReads = 0;
    let resumed: Parameters<RemoteDesktopClient["startThread"]>[0] | undefined;
    const client = {
      boundedProjectListPage: async () => ({ projects: [project] }),
      agentStatuses: async () => ({ windows: [status], wsl: [] }),
      boundedThreadListPage: async () => ({
        page: { threads: [threadListReads++ === 0 ? staleThread : latestThread] },
      }),
      sendThreadInput: async () => {
        sequence.push("send");
        throw new RemoteClientError(
          "Unknown thread session: thread-old",
          422,
          "unknown_thread_session",
          { requestPhase: "dispatched", requestMayHaveCommitted: false },
        );
      },
      startThread: async (request: Parameters<RemoteDesktopClient["startThread"]>[0]) => {
        sequence.push("resume");
        resumed = request;
        return { threadId: request.threadId! };
      },
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home, async (ids) => {
      sequence.push(`interest:${ids[0]}`);
    });
    const sessionID = "ses_thread-old";
    await value.handle(
      new Request("http://poracode.invalid/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: sessionID,
          agent: "build",
          model: { id: "model-1", providerID: "codex" },
        }),
      }),
    );
    const response = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "msg_follow-up",
          text: "Follow-up marker",
          files: [],
          agents: [],
          delivery: "steer",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(sequence).toEqual(["interest:thread-old", "send", "resume"]);
    // The visibility gate's first list read warms the cache that sendPrompt
    // reuses, so the count stays at send + post-refusal re-list.
    expect(threadListReads).toBe(2);
    expect(resumed).toMatchObject({
      threadId: "thread-old",
      projectLocation: project.location,
      agentKind: "codex",
      agentInstanceId: "instance-latest",
      config: { model: "model-latest", mode: "plan", effort: "high" },
      prompt: "Follow-up marker",
      userMessageItemId: "follow-up",
      presentationMode: "gui",
      sessionRef: {
        providerSessionId: "provider-session-latest",
        discoveredAt: "2026-02-01T00:00:00.000Z",
      },
      initialSize: DEFAULT_TERMINAL_SIZE,
    });
    expect(resumed).not.toHaveProperty("ensureRunning");
    expect(await readFile(join(home, "log", "adapter.log"), "utf8")).toContain(
      '"code":"unknown_thread_session"',
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("refuses a typed unknown-session retry when the host has no resume state", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-no-resume-test-"));
  try {
    const project = remoteProjectSchema.parse({
      id: "project-1",
      name: "project",
      location: { kind: "windows", path: "C:/repo" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const status = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        models: [{ id: "model-1", label: "Model 1" }],
        modes: ["agent"],
        defaultApprovalPolicy: "ask",
        defaultSandboxMode: "read",
      },
    });
    const remoteThread = {
      id: "thread-old",
      projectId: "project-1",
      agentKind: "codex",
      config: { model: "model-1", mode: "agent" },
      canResumeWithConfig: false,
      presentationMode: "gui",
    };
    let sendCalls = 0;
    let startCalls = 0;
    const client = {
      boundedProjectListPage: async () => ({ projects: [project] }),
      agentStatuses: async () => ({ windows: [status], wsl: [] }),
      boundedThreadListPage: async () => ({ page: { threads: [remoteThread] } }),
      sendThreadInput: async () => {
        sendCalls += 1;
        throw new RemoteClientError(
          "Unknown thread session: thread-old",
          422,
          "unknown_thread_session",
          {
            requestPhase: "dispatched",
            requestMayHaveCommitted: false,
          },
        );
      },
      startThread: async () => {
        startCalls += 1;
        return { threadId: "thread-old" };
      },
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home);
    const sessionID = "ses_thread-old";
    await value.handle(
      new Request("http://poracode.invalid/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: sessionID,
          agent: "build",
          model: { id: "model-1", providerID: "codex" },
        }),
      }),
    );
    const response = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "msg_follow-up",
          text: "Follow-up marker",
          files: [],
          agents: [],
          delivery: "steer",
        }),
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {
        code: "adapter_error",
        message:
          "This thread cannot be resumed because the host has no session reference or resumable configuration.",
      },
    });
    expect(sendCalls).toBe(1);
    expect(startCalls).toBe(0);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("session update maps to rename and archive thread commands", async () => {
  const commands: unknown[] = [];
  const client = {
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
    boundedThreadListPage: async () => ({ page: { threads: [] } }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const rename = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "New title" }),
    }),
  );
  expect(rename.status).toBe(204);
  const archive = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: true }),
    }),
  );
  expect(archive.status).toBe(204);
  const unarchive = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: false }),
    }),
  );
  expect(unarchive.status).toBe(204);
  expect(commands).toEqual([
    { kind: "rename", threadId: "thread-1", title: "New title" },
    { kind: "archive", threadId: "thread-1" },
    { kind: "unarchive", threadId: "thread-1" },
  ]);
});

test("session options expose capabilities and persist a choice", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    agentStatuses: async () => ({
      windows: [
        {
          kind: "codex",
          installed: true,
          capabilities: {
            approvalPolicies: [
              { id: "on-request", label: "On request" },
              { id: "never", label: "Never" },
            ],
            sandboxModes: [
              { id: "workspace-write", label: "Workspace write" },
              { id: "read-only", label: "Read only" },
            ],
            defaultApprovalPolicy: "on-request",
            defaultSandboxMode: "workspace-write",
            models: [{ id: "gpt-5" }],
          },
        },
      ],
      wsl: [],
    }),
    boundedThreadListPage: async () => ({ page: { threads: [] } }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const created = await value.handle(
    new Request("http://poracode.invalid/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "ses_thread-9", model: { providerID: "codex", id: "gpt-5" } }),
    }),
  );
  expect(created.status).toBe(200);
  const offered = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-9/options"),
  );
  expect(await offered.json()).toMatchObject({
    data: {
      approvalPolicies: [
        { id: "on-request", label: "On request" },
        { id: "never", label: "Never" },
      ],
      defaults: { approvalPolicy: "on-request", sandboxMode: "workspace-write" },
    },
  });
  const bad = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-9/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvalPolicy: "not-a-policy" }),
    }),
  );
  expect(bad.status).toBe(400);
  const good = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-9/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approvalPolicy: "never", sandboxMode: "read-only" }),
    }),
  );
  expect(good.status).toBe(200);
  expect(await value.sessionOptions("ses_thread-9")).toMatchObject({
    defaults: { approvalPolicy: "on-request" },
  });
  expect(await value.setSessionOptions("ses_thread-9", { approvalPolicy: "bogus" })).toEqual({
    error: "Unknown approval policy: bogus",
    status: 400,
  });
  expect(await value.setSessionOptions("ses_thread-9", { sandboxMode: "read-only" })).toEqual({
    ok: true,
  });
});

test("session list surfaces parentID for child threads", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const remoteThread = {
    id: "child-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "gpt-5" },
    title: "Child",
    parentThreadId: "parent-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [remoteThread] } }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const list = (await (
    await value.handle(new Request("http://poracode.invalid/api/session"))
  ).json()) as SessionListOutput;
  expect(list.data[0]?.parentID).toBe("ses_parent-1");
});

test("hides terminal-mode threads from all session surfaces", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const guiStatus = agentStatusSchema.parse({
    kind: "gui-agent",
    label: "Gui Agent",
    installed: true,
    authState: "authenticated",
    capabilities: { presentationMode: "gui", models: [{ id: "m1", label: "M1" }] },
  });
  const termStatus = agentStatusSchema.parse({
    kind: "term-agent",
    label: "Term Agent",
    installed: true,
    authState: "authenticated",
    capabilities: { presentationMode: "terminal", models: [{ id: "m2", label: "M2" }] },
  });
  const base = {
    projectId: "project-1",
    config: { model: "m1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const threads = [
    { id: "thread-gui", agentKind: "gui-agent", presentationMode: "gui", title: "GUI", ...base },
    {
      id: "thread-term",
      agentKind: "gui-agent",
      presentationMode: "terminal",
      title: "PTY",
      ...base,
    },
    // No own mode: resolves through the provider capability -> terminal.
    { id: "thread-inherit", agentKind: "term-agent", title: "Inherited", ...base },
  ];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    agentStatuses: async () => ({ windows: [guiStatus, termStatus], wsl: [] }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const list = (await (
    await value.handle(new Request("http://poracode.invalid/api/session"))
  ).json()) as SessionListOutput;
  expect(list.data.map((session) => session.id)).toEqual(["ses_thread-gui"]);

  for (const hidden of ["ses_thread-term", "ses_thread-inherit"]) {
    const get = await value.handle(new Request(`http://poracode.invalid/api/session/${hidden}`));
    expect(get.status).toBe(404);
    const messages = (await (
      await value.handle(new Request(`http://poracode.invalid/api/session/${hidden}/message`))
    ).json()) as MessageListOutput;
    expect(messages.data).toEqual([]);
    const prompt = await value.handle(
      new Request(`http://poracode.invalid/api/session/${hidden}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
      }),
    );
    expect(prompt.status).toBe(404);
    const interrupt = await value.handle(
      new Request(`http://poracode.invalid/api/session/${hidden}/interrupt`, {
        method: "POST",
      }),
    );
    expect(interrupt.status).toBe(404);
  }
});

test("session.remove deletes a gui thread and refuses virtual subsessions", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const parentThread = {
    id: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "m1" },
    title: "Parent",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const items = [
    {
      id: "task-1",
      type: "tool_call",
      state: "completed",
      streams: {},
      payload: { name: "Task", title: "Explore", status: "success", isSubAgent: true },
    },
  ];
  const commands: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [parentThread] } }),
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const remove = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1", { method: "DELETE" }),
  );
  expect(remove.status).toBe(204);
  expect(commands).toEqual([{ kind: "delete", threadId: "thread-1" }]);

  const unknown = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_ghost", { method: "DELETE" }),
  );
  expect(unknown.status).toBe(404);

  const sub = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1", {
      method: "DELETE",
    }),
  );
  expect(sub.status).toBe(400);
  expect(await sub.json()).toMatchObject({ error: { code: "read_only" } });
  expect(commands).toHaveLength(1);
});

test("session.view acknowledges only finished threads; background/environment are no-ops", async () => {
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
  const commands: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  // Not finished yet: no acknowledge.
  const viewWorking = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/view", { method: "POST" }),
  );
  expect(viewWorking.status).toBe(204);
  expect(commands).toHaveLength(0);

  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "finished" });
  const viewDone = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/view", { method: "POST" }),
  );
  expect(viewDone.status).toBe(204);
  expect(commands).toEqual([{ kind: "acknowledge", threadId: "thread-1" }]);

  const background = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/background", {
      method: "POST",
    }),
  );
  expect(background.status).toBe(204);
  const environment = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/environment", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ environment: {} }),
    }),
  );
  expect(environment.status).toBe(204);
  expect(commands).toHaveLength(1);
});

test("session.fork issues a catalog command and returns the forked session", async () => {
  const project = S.forkProject();
  const threads = [S.forkThread()];
  const commands: { command: unknown; options: unknown }[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    environment: async () => S.forkEnvironment,
    sendThreadCommand: async (command: unknown, options: unknown) => {
      commands.push({ command, options });
      const parsed = command as { kind: string; threadId: string };
      if (parsed.kind === "fork")
        threads.push(S.forkThread({ id: parsed.threadId, title: "Parent (fork)" }) as never);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/fork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  );
  expect(response.status).toBe(200);
  const command = commands[0]!;
  const parsed = command.command as Record<string, unknown>;
  expect(parsed).toMatchObject({
    kind: "fork",
    sourceThreadId: "thread-1",
    title: "Parent (fork)",
  });
  expect(parsed).not.toHaveProperty("throughItemId");
  expect((command.options as { commandId: string }).commandId).toBeTruthy();
  const data = (await response.json()) as { data: SessionInfo };
  expect(data.data.id).toBe(`ses_${parsed.threadId}`);
});

test("session.fork maps a before message to the last earlier completed-turn anchor", async () => {
  const project = S.forkProject();
  const items = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    { id: "a1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
    { id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} },
    { id: "a2", type: "assistant_message", state: "completed", streams: {}, payload: {} },
  ];
  const commands: unknown[] = [];
  const threads = [S.forkThread()];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    threadCompletedTurns: async () => [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        anchorItemId: "a1",
      },
      {
        startedAt: "2026-01-01T00:02:00.000Z",
        endedAt: "2026-01-01T00:03:00.000Z",
        anchorItemId: "a2",
      },
    ],
    environment: async () => S.forkEnvironment,
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
      const parsed = command as { kind: string; threadId: string };
      if (parsed.kind === "fork")
        threads.push(S.forkThread({ id: parsed.threadId, title: "Parent (fork)" }) as never);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/fork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ before: "msg_u2" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(commands[0]).toMatchObject({ throughItemId: "a1" });

  // Before the first message: no earlier completed turn -> 400, no command.
  const beforeFirst = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/fork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ before: "msg_u1" }),
    }),
  );
  expect(beforeFirst.status).toBe(400);
  expect(await beforeFirst.json()).toMatchObject({
    error: { code: "invalid_request" },
  });
  expect(commands).toHaveLength(1);
});

test("session.fork refuses a running thread, virtual subsessions, and old hosts", async () => {
  const project = S.forkProject();
  const parent = S.forkThread();
  const items = [
    {
      id: "task-1",
      type: "tool_call",
      state: "completed",
      streams: {},
      payload: { name: "Task", title: "Explore", status: "success", isSubAgent: true },
    },
  ];
  const commands: unknown[] = [];
  let environment: unknown = S.forkEnvironment;
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [parent] } }),
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    environment: async () => environment,
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const post = (id: string) =>
    value.handle(
      new Request(`http://poracode.invalid/api/session/${id}/fork`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

  // Virtual subsession -> read_only.
  const sub = await post("ses_thread-1__task-1");
  expect(sub.status).toBe(400);
  expect(await sub.json()).toMatchObject({ error: { code: "read_only" } });

  // Unknown / hidden -> 404.
  expect((await post("ses_ghost")).status).toBe(404);

  // Running turn -> 409.
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "working" });
  const busy = await post("ses_thread-1");
  expect(busy.status).toBe(409);
  expect(await busy.json()).toMatchObject({ error: { code: "busy" } });
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "idle" });

  // Host without catalogMutations -> 501.
  environment = { capabilities: {} };
  const oldHost = await post("ses_thread-1");
  expect(oldHost.status).toBe(501);
  expect(await oldHost.json()).toMatchObject({ error: { code: "unsupported" } });
  expect(commands).toHaveLength(0);
});

test("a forked thread's first prompt launches without a sessionRef", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-fork-prompt-"));
  const previousHome = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const project = S.forkProject();
    const status = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {
        presentationMode: "gui",
        presentationModes: ["gui"],
        models: [{ id: "m1", label: "M1" }],
        modes: ["agent"],
        defaultApprovalPolicy: "ask",
        defaultSandboxMode: "read",
      },
    });
    const forked = S.forkThread({
      id: "thread-fork",
      title: "Parent (fork)",
      canResumeWithConfig: true,
    });
    let resumed: Parameters<RemoteDesktopClient["startThread"]>[0] | undefined;
    const client = {
      boundedProjectListPage: async () => ({ projects: [project] }),
      agentStatuses: async () => ({ windows: [status], wsl: [] }),
      settings: async () => ({ agentSettings: {} }),
      boundedThreadListPage: async () => ({ page: { threads: [forked] } }),
      sendThreadInput: async () => {
        throw new RemoteClientError(
          "Unknown thread session: thread-fork",
          422,
          "unknown_thread_session",
          { requestPhase: "dispatched", requestMayHaveCommitted: false },
        );
      },
      startThread: async (request: Parameters<RemoteDesktopClient["startThread"]>[0]) => {
        resumed = request;
        return { threadId: request.threadId! };
      },
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home);
    const response = await value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-fork/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text: "continue" }] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(resumed).toMatchObject({ threadId: "thread-fork", presentationMode: "gui" });
    expect(resumed).not.toHaveProperty("sessionRef");
  } finally {
    if (previousHome === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("session.view acknowledges a thread that finished before connect", async () => {
  const project = S.forkProject();
  const thread = S.forkThread({ status: "finished" });
  const commands: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const view = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/view", { method: "POST" }),
  );
  expect(view.status).toBe(204);
  expect(commands).toEqual([{ kind: "acknowledge", threadId: "thread-1" }]);
});

test("prompt on a visible thread adds no extra thread-list read", async () => {
  const project = S.forkProject();
  const status = agentStatusSchema.parse({
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      presentationMode: "gui",
      presentationModes: ["gui"],
      models: [{ id: "m1", label: "M1" }],
      modes: ["agent"],
      defaultApprovalPolicy: "ask",
      defaultSandboxMode: "read",
    },
  });
  let threadListReads = 0;
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    agentStatuses: async () => ({ windows: [status], wsl: [] }),
    settings: async () => ({ agentSettings: {} }),
    boundedThreadListPage: async () => {
      threadListReads += 1;
      return { page: { threads: [S.forkThread()] } };
    },
    sendThreadInput: async () => undefined,
  } as unknown as RemoteDesktopClient;
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-prompt-reads-"));
  const previousHome = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const { value } = S.router(client, home);
    const response = await value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(threadListReads).toBe(1);
  } finally {
    if (previousHome === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("worktree list/create map to the git procedures", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      if (name === "gitListWorktrees")
        return {
          worktrees: [
            { path: "D:\\wt-main", branch: "main", commit: "abc", isMain: true },
            { path: "D:\\wt-feat", branch: "feat", commit: "def", isMain: false },
          ],
        };
      if (name === "gitAddWorktree") return { path: "D:\\wt-feat" };
      return null;
    },
  });
  const { value } = S.router(client);
  const list = await value.handle(new Request("http://poracode.invalid/api/worktree"));
  expect(list.status).toBe(200);
  expect(await list.json()).toEqual([{ directory: "D:\\wt-main" }, { directory: "D:\\wt-feat" }]);
  const created = await value.handle(
    new Request("http://poracode.invalid/api/worktree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectID: "project-1", name: "feat" }),
    }),
  );
  expect(created.status).toBe(200);
  expect(await created.json()).toEqual({ data: { directory: "D:\\wt-feat" } });
  expect(calls).toContainEqual({
    name: "gitAddWorktree",
    payload: expect.objectContaining({
      branch: "feat",
      createBranch: true,
      projectLocation: expect.objectContaining({}),
    }),
  });
  expect(calls.filter((call) => call.name === "gitListWorktrees").length).toBe(1);
});

test("session.move refuses running threads, the main checkout, and unknown directories", async () => {
  const client = S.promptClient({
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees"
        ? { worktrees: [{ path: "D:\\wt-feat", branch: "feat", commit: "def", isMain: false }] }
        : null,
  });
  const { value } = S.router(client);
  S.working(value);
  const move = (directory: string) =>
    value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
      }),
    );
  expect((await move("D:\\wt-feat")).status).toBe(409);
  value.handleRemoteEvent({
    type: "thread-state",
    threadId: "thread-1",
    status: "idle",
  });
  expect((await move("D:\\proj")).status).toBe(400);
  expect((await move("D:\\other")).status).toBe(400);
});

test("session.move closes the thread and sends set-worktree with isNewWorktree only when created here", async () => {
  const commands: unknown[] = [];
  let closed = 0;
  const client = S.promptClient({
    closeThread: async () => {
      closed += 1;
    },
    sendThreadCommand: async (command: unknown) => commands.push(command),
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees"
        ? {
            worktrees: [
              { path: "D:\\wt-feat", branch: "feat", commit: "def", isMain: false },
              { path: "D:\\wt-old", branch: "old", commit: "ghi", isMain: false },
            ],
          }
        : name === "gitAddWorktree"
          ? { path: "D:\\wt-feat" }
          : null,
  });
  const { value } = S.router(client);
  value.handleRemoteEvent({
    type: "thread-state",
    threadId: "thread-1",
    status: "idle",
  });
  const move = (directory: string) =>
    value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory }),
      }),
    );
  // Pre-existing worktree: no isNewWorktree.
  expect((await move("D:\\wt-old")).status).toBe(204);
  expect(closed).toBe(1);
  expect(commands.at(-1)).toMatchObject({
    kind: "set-worktree",
    threadId: "thread-1",
    worktreePath: "D:\\wt-old",
    worktreeBranch: "old",
  });
  expect(commands.at(-1)).not.toHaveProperty("isNewWorktree");
  // Worktree created through this adapter: isNewWorktree on the first user.
  await value.handle(
    new Request("http://poracode.invalid/api/worktree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectID: "project-1", name: "feat" }),
    }),
  );
  expect((await move("D:\\wt-feat")).status).toBe(204);
  expect(commands.at(-1)).toMatchObject({
    kind: "set-worktree",
    worktreePath: "D:\\wt-feat",
    isNewWorktree: true,
  });
});

test("a session created inside a worktree starts its thread there", async () => {
  const started: unknown[] = [];
  const client = S.promptClient({
    startNewThread: async (payload: unknown) => started.push(payload),
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees"
        ? { worktrees: [{ path: "D:\\wt-feat", branch: "feat", commit: "def", isMain: false }] }
        : name === "gitAddWorktree"
          ? { path: "D:\\wt-feat" }
          : null,
  });
  const { value } = S.router(client);
  await value.handle(
    new Request("http://poracode.invalid/api/worktree", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectID: "project-1", name: "feat" }),
    }),
  );
  const created = await value.handle(
    new Request("http://poracode.invalid/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ses_thread-wt",
        location: { directory: "D:\\wt-feat" },
        model: { providerID: "codex", id: "m1" },
      }),
    }),
  );
  expect(created.status).toBe(200);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-wt/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "work in the worktree" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(started.at(-1)).toMatchObject({
    worktreePath: "D:\\wt-feat",
    worktreeBranch: "feat",
    isNewWorktree: true,
  });
});

test("session.wait resolves on idle and 409s after the timeout", async () => {
  const client = S.promptClient({ sendThreadInput: async () => ({}) });
  const { value } = S.router(client);
  const wait = () =>
    value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/wait", { method: "POST" }),
    );
  expect((await wait()).status).toBe(204);
  S.working(value);
  // A live turn keeps the wait blocked even past the thread-state snapshot.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
  });
  const start = Date.now();
  setSystemTime(start);
  const pending = wait();
  await new Promise((resolve) => setTimeout(resolve, 300));
  setSystemTime(start + 31_000);
  expect((await pending).status).toBe(409);
  setSystemTime();
});

test("session.interrupt is a no-op on an idle thread", async () => {
  const interrupts: string[] = [];
  const client = S.promptClient({
    interruptThread: async (id: string) => {
      interrupts.push(id);
    },
  });
  const { value } = S.router(client);
  S.working(value); // live state says S.working, no translator run — interrupt still fires
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/interrupt", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(200);
  expect(interrupts).toEqual(["thread-1"]);
  interrupts.length = 0;
  // Idle status + no active run → 204 without touching the host.
  value.handleRemoteEvent({
    type: "thread-state",
    threadId: "thread-1",
    status: "idle",
  });
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/interrupt", {
          method: "POST",
        }),
      )
    ).status,
  ).toBe(200);
  expect(interrupts).toEqual([]);
});

test("session.wait settles on the translator run state when thread-state lags", async () => {
  const client = S.promptClient();
  const { value } = S.router(client);
  // The last thread-state says S.working but the turn already completed — the
  // runtime stream is authoritative for activity.
  value.handleRemoteEvent({
    type: "thread-state",
    threadId: "thread-1",
    status: "working",
  });
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
  });
  const pending = value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/wait", {
      method: "POST",
    }),
  );
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
  });
  const response = await pending;
  expect(response.status).toBe(204);
});

test("session.wait still 409s at the deadline while a run is active", async () => {
  const client = S.promptClient();
  const { value } = S.router(client);
  S.working(value);
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
  });
  const real = Date.now();
  setSystemTime(real);
  const pending = value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/wait", {
      method: "POST",
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  setSystemTime(real + 40_000);
  const response = await pending;
  setSystemTime();
  expect(response.status).toBe(409);
});
