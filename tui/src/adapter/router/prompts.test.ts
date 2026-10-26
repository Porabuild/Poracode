import { expect, test } from "bun:test";
import * as S from "./test-support";
import type { PromptBody } from "./test-support";
import { agentStatusSchema } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { RemoteDesktopClient } from "@/shared/remote/client";

test("plan mode refuses providers without it and toggles validate against capabilities", async () => {
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
    config: { model: "gpt-5" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const status = agentStatusSchema.parse({
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      presentationModes: ["terminal", "gui"],
      modes: ["agent"],
      models: [{ id: "gpt-5", label: "GPT-5" }],
      fastModels: ["gpt-5"],
      thinkingModels: ["gpt-5"],
      contextSizes: [
        { id: "64k", label: "64K" },
        { id: "200k", label: "200K" },
      ],
    },
  });
  const client = {
    agentStatuses: async () => ({ windows: [status], wsl: [] }),
    settings: async () => ({ agentSettings: {} }),
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
    sendThreadInput: async () => ({}),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const sessionID = "ses_thread-1";

  // Plan refused: the provider advertises modes: ["agent"] only.
  const plan = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/agent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "plan" }),
    }),
  );
  expect(plan.status).toBe(400);

  // Options expose the toggle surfaces for the session's model.
  const options = (await (
    await value.handle(new Request(`http://poracode.invalid/api/session/${sessionID}/options`))
  ).json()) as {
    data: {
      fast: { offered: boolean; disabledReason?: string };
      thinking: { offered: boolean };
      contextSizes: readonly { id: string; label: string }[];
    };
  };
  expect(options.data.fast.offered).toBe(true);
  expect(options.data.thinking.offered).toBe(true);
  expect(options.data.contextSizes).toHaveLength(2);

  // Session created via POST so the options route has a sessions entry.
  const create = await value.handle(
    new Request("http://poracode.invalid/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: sessionID,
        model: { providerID: "codex", id: "gpt-5" },
      }),
    }),
  );
  expect(create.status).toBe(200);

  // Toggles set + validate.
  const set = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fast: true, thinking: false, contextSize: "64k" }),
    }),
  );
  expect(set.status).toBe(200);
  const bad = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contextSize: "bogus" }),
    }),
  );
  expect(bad.status).toBe(400);

  // The next prompt carries the toggles into ThreadConfig.
  const sent: unknown[] = [];
  (client as { sendThreadInput: (v: unknown) => Promise<unknown> }).sendThreadInput = async (
    v: unknown,
  ) => {
    sent.push(v);
    return {};
  };
  const prompt = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
    }),
  );
  expect(prompt.status).toBe(200);
  expect(sent[0]).toMatchObject({
    config: { fast: true, thinking: false, contextSize: "64k" },
  });
});

test("uploads prompt attachments as file segments and refuses unsupported images", async () => {
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
    config: { model: "gpt-5" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const status = agentStatusSchema.parse({
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      presentationModes: ["terminal", "gui"],
      modes: ["agent"],
      models: [{ id: "gpt-5", label: "GPT-5" }],
    },
  });
  const uploads: unknown[] = [];
  const sent: unknown[] = [];
  const client = {
    agentStatuses: async () => ({ windows: [status], wsl: [] }),
    settings: async () => ({ agentSettings: {} }),
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
    uploadAttachment: async (input: unknown) => {
      uploads.push(input);
      return "/host/attachments/notes.md";
    },
    sendThreadInput: async (input: unknown) => {
      sent.push(input);
      return {};
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);

  const prompt = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: "look at this" }],
        files: [{ uri: "data:text/plain;base64,aGVsbG8=", name: "notes.md" }],
      }),
    }),
  );
  expect(prompt.status).toBe(200);
  expect(uploads).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    segments: [
      { kind: "attachment", path: "/host/attachments/notes.md", mimeType: "text/plain" },
      { kind: "text", content: "look at this" },
    ],
  });

  // A prompt with attachments sent mid-turn steers with the same segment kind.
  const steered: unknown[] = [];
  (client as unknown as Record<string, unknown>).setPendingSteer = async (input: unknown) => {
    steered.push(input);
  };
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "working" });
  const steeredPrompt = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: "one more" }],
        files: [{ uri: "data:text/plain;base64,aGVsbG8=", name: "notes.md" }],
      }),
    }),
  );
  expect(steeredPrompt.status).toBe(200);
  expect(steered[0]).toMatchObject({
    segments: [
      { kind: "attachment", path: "/host/attachments/notes.md", mimeType: "text/plain" },
      { kind: "text", content: "one more" },
    ],
  });
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "idle" });

  // Refuse images when the provider cannot consume them inline.
  (status as { capabilities: Record<string, unknown> }).capabilities = {
    ...status.capabilities,
    readsImageAttachmentsFromHost: false,
  };
  const refused = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: "see this" }],
        files: [{ uri: "data:image/png;base64,aGVsbG8=", name: "shot.png" }],
      }),
    }),
  );
  expect(refused.status).toBe(400);
  expect(await refused.text()).toContain("does not accept image attachments");
});

test("delivery precedence: body > settings > default steer; queue hits queueThreadFollowUp", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = S.promptClient({
    settings: async () => ({ agentSettings: {}, followUpBehavior: "queue" }),
    setPendingSteer: async (payload: unknown) => calls.push({ name: "steer", payload }),
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return null;
    },
  });
  const home = await mkdtemp(join(tmpdir(), "poracode-delivery-"));
  const prev = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const { value } = S.router(client, home);
    S.working(value);
    const post = (body: PromptBody) =>
      value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

    expect((await post({ text: "q1" })).status).toBe(200);
    expect(calls.at(-1)?.name).toBe("queueThreadFollowUp");

    expect((await post({ text: "s1", delivery: "steer" })).status).toBe(200);
    expect(calls.at(-1)?.name).toBe("steer");

    calls.length = 0;
    expect((await post({ text: "q2", delivery: "queue" })).status).toBe(200);
    expect(calls[0]).toMatchObject({
      name: "queueThreadFollowUp",
      payload: { threadId: "thread-1", prompt: "q2" },
    });
  } finally {
    if (prev === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = prev;
    await rm(home, { recursive: true, force: true });
  }
});

test("queue on an old host answers 501 and never steers", async () => {
  let steered = false;
  const client = S.promptClient({
    setPendingSteer: async () => {
      steered = true;
    },
    callRemoteProcedure: async () => {
      throw new RemoteClientError("unknown procedure", 404, "unknown_procedure");
    },
  });
  const { value } = S.router(client);
  S.working(value);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "q", delivery: "queue" } satisfies PromptBody),
    }),
  );
  expect(response.status).toBe(501);
  expect(await response.json()).toMatchObject({ error: { code: "unsupported" } });
  expect(steered).toBe(false);
});

test("steer declines an open approval first; queue leaves it alone", async () => {
  const order: string[] = [];
  const approvalItem = {
    id: "pending_request:perm-1",
    type: "pending_request",
    state: "started",
    streams: {},
    payload: {
      requestId: "perm-1",
      requestType: "command_execution_approval",
      payload: {
        summary: "Run command?",
        options: [
          { optionId: "allow", label: "Allow" },
          { optionId: "deny", label: "Deny" },
        ],
      },
    },
  };
  const client = S.promptClient({
    threadRuntimeItemsPage: async () => ({ items: [approvalItem], nextCursor: null }),
    resolveRequest: async () => order.push("resolve"),
    setPendingSteer: async () => order.push("steer"),
    callRemoteProcedure: async (name: string) => {
      order.push(name);
      return null;
    },
  });
  const home = await mkdtemp(join(tmpdir(), "poracode-approval-"));
  const prev = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const { value } = S.router(client, home);
    S.working(value);
    const post = (body: PromptBody) =>
      value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    expect((await post({ text: "go", delivery: "steer" })).status).toBe(200);
    expect(order).toEqual(["resolve", "steer"]);

    order.length = 0;
    expect((await post({ text: "go2", delivery: "queue" })).status).toBe(200);
    expect(order).toEqual(["queueThreadFollowUp"]);
  } finally {
    if (prev === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = prev;
    await rm(home, { recursive: true, force: true });
  }
});

test("file: mention maps to a project-relative segment; outside and bad schemes refuse", async () => {
  const sent: unknown[] = [];
  const home = await mkdtemp(join(tmpdir(), "poracode-file-mention-"));
  const prev = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  // The inside/outside URIs are built from the running platform's paths so the
  // test's file:// URLs decode to real project-relative locations on any OS.
  const isWindows = process.platform === "win32";
  const projectPath = isWindows ? "C:/repo" : "/repo";
  const insideUri = pathToFileURL(isWindows ? "C:/repo/src/notes.md" : "/repo/src/notes.md").href;
  const outsideUri = pathToFileURL(isWindows ? "C:/other/secret.md" : "/other/secret.md").href;
  const client2 = S.promptClient({
    sendThreadInput: async (input: unknown) => {
      sent.push(input);
      return {};
    },
    ...(isWindows
      ? {}
      : {
          boundedProjectListPage: async () => ({
            projects: [
              remoteProjectSchema.parse({
                id: "project-1",
                name: "project",
                location: { kind: "posix", path: projectPath },
                createdAt: "2026-01-01T00:00:00.000Z",
              }),
            ],
          }),
        }),
  });
  try {
    const { value } = S.router(client2, home, undefined, projectPath);
    const post = (body: PromptBody) =>
      value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

    const inside = await post({
      text: "read this",
      files: [{ uri: insideUri, name: "notes.md" }],
    });
    expect(inside.status).toBe(200);
    expect(sent.at(-1)).toMatchObject({
      segments: [
        { kind: "file", path: "src/notes.md" },
        { kind: "text", content: "read this" },
      ],
    });

    const outside = await post({
      text: "read that",
      files: [{ uri: outsideUri, name: "secret.md" }],
    });
    expect(outside.status).toBe(200);
    expect(sent.at(-1)).not.toHaveProperty("segments");

    const bad = await post({
      text: "hmm",
      files: [{ uri: "ftp://example.com/x.png", name: "x.png" }],
    });
    expect(bad.status).toBe(400);
  } finally {
    if (prev === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = prev;
    await rm(home, { recursive: true, force: true });
  }
});

test("auto-title renames a standalone thread after generation", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = S.titleClient({ calls });
  const { response } = await S.runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls).toContainEqual(
    expect.objectContaining({
      name: "generateTitle",
      payload: expect.objectContaining({ agentKind: "codex", prompt: "first prompt ever" }),
    }),
  );
  expect(calls).toContainEqual({
    name: "command",
    payload: { kind: "rename", threadId: "thread-new", title: "Generated Title" },
  });
});

test("desktop owner (browserPanel) skips auto-title", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = S.titleClient({ calls, describeHost: { browserPanel: true } });
  const { response } = await S.runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls.some((call) => call.name === "generateTitle")).toBe(false);
});

test("a user rename during generation wins over auto-title", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = S.titleClient({
    calls,
    titlesAfterStart: ["first prompt ever", "User-chosen name"],
  });
  const { response } = await S.runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls.some((call) => call.name === "generateTitle")).toBe(true);
  expect(calls.some((call) => call.name === "command")).toBe(false);
});

test("disabled title generation skips auto-title", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = S.titleClient({
    calls,
    settings: { agentSettings: {}, titleGenProvider: "disabled" },
  });
  const { response } = await S.runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls.some((call) => call.name === "generateTitle")).toBe(false);
});

test("a specific provider forwards its selection", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const selection = { model: "m2", effort: "high" };
  const { client } = S.titleClient({
    calls,
    settings: { agentSettings: {}, titleGenProvider: "other", titleGenSelection: selection },
  });
  const { response } = await S.runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls).toContainEqual(
    expect.objectContaining({
      name: "generateTitle",
      payload: expect.objectContaining({
        agentKind: "other",
        prompt: "first prompt ever",
        selection,
      }),
    }),
  );
});

test("explicit empty-title PATCH generates from the first prompt", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = S.titleClient({ calls, threadsAlways: true });
  const { value } = S.router(client);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-new", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    }),
  );
  expect(response.status).toBe(204);
  expect(calls).toContainEqual(
    expect.objectContaining({
      name: "generateTitle",
      payload: expect.objectContaining({ agentKind: "codex", prompt: "first prompt ever" }),
    }),
  );
  expect(calls).toContainEqual({
    name: "command",
    payload: { kind: "rename", threadId: "thread-new", title: "Generated Title" },
  });
});

test("compact goes through the slash command only when declared", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = S.titleClient({
    calls,
    threadsAlways: true,
    commands: [{ id: "compact", description: "compact" }],
  });
  const { value } = S.router(client);
  const ok = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-new/compact", { method: "POST" }),
  );
  expect(ok.status).toBe(200);
  expect(await ok.json()).toMatchObject({ data: { type: "compaction" } });

  const calls2: { name: string; payload: unknown }[] = [];
  const { client: client2 } = S.titleClient({ calls: calls2, threadsAlways: true, commands: [] });
  const { value: value2 } = S.router(client2);
  const no = await value2.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-new/compact", { method: "POST" }),
  );
  expect(no.status).toBe(400);
  expect(await no.json()).toMatchObject({ error: { code: "unsupported" } });
});

test("send preserves host config fields; model change drops selectionBinding; new threads get MCP defaults", async () => {
  const sent: unknown[] = [];
  const steered: unknown[] = [];
  const started: unknown[] = [];
  const thread = {
    ...S.promptFixture.thread,
    config: {
      model: "m1",
      crossagentMcp: true,
      executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
      mcpServerOverrides: { exa: { url: "x" } },
      approvalsReviewer: { model: "r1" },
      importedFrom: "import-1",
      selectionBinding: { model: "m1" },
    },
  };
  const statusB = agentStatusSchema.parse({
    ...(JSON.parse(JSON.stringify(S.promptFixture.status)) as Record<string, unknown>),
    capabilities: {
      ...(JSON.parse(JSON.stringify(S.promptFixture.status.capabilities)) as Record<
        string,
        unknown
      >),
      models: [
        { id: "m1", label: "M1" },
        { id: "m2", label: "M2" },
      ],
    },
  });
  const client = S.promptClient({
    agentStatuses: async () => ({ windows: [statusB], wsl: [] }),
    settings: async () => ({
      agentSettings: {},
      enabledMcpServers: { crossagents: true },
      disabledBuiltInMcpServers: {},
    }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    sendThreadInput: async (payload: unknown) => {
      sent.push(payload);
      return {};
    },
    setPendingSteer: async (payload: unknown) => steered.push(payload),
    startNewThread: async (payload: unknown) => started.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  S.working(value);
  const post = (body: PromptBody, sessionID = "ses_thread-1") =>
    value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  expect((await post({ text: "steer me" })).status).toBe(200);
  expect(steered.at(-1)).toMatchObject({
    config: {
      model: "m1",
      crossagentMcp: true,
      executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
      mcpServerOverrides: { exa: { url: "x" } },
      approvalsReviewer: { model: "r1" },
      importedFrom: "import-1",
      selectionBinding: { model: "m1" },
    },
  });

  // Model change drops the stale binding but keeps the rest.
  expect(
    (await post({ text: "steer me again", model: { providerID: "codex", id: "m2" } })).status,
  ).toBe(200);
  const changed = steered.at(-1) as { config: Record<string, unknown> };
  expect(changed.config.crossagentMcp).toBe(true);
  expect(changed.config).not.toHaveProperty("selectionBinding");

  // New thread gets the desktop standing MCP defaults.
  const fresh = await post({ text: "brand new" }, "ses_thread-new");
  expect(fresh.status).toBe(200);
  expect(started.at(-1)).toMatchObject({ config: { crossagentMcp: true } });
});

test("new threads skip MCP defaults when settings disable them", async () => {
  const started: unknown[] = [];
  const client = S.promptClient({
    settings: async () => ({
      agentSettings: {},
      enabledMcpServers: { crossagents: false },
      disabledBuiltInMcpServers: {},
    }),
    startNewThread: async (payload: unknown) => started.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-new/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "no agents" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(started.at(-1)).not.toMatchObject({ config: { crossagentMcp: true } });
});

test("model change to another provider stages a switch; the next prompt relaunches in place", async () => {
  const starts: unknown[] = [];
  const sends: unknown[] = [];
  const statusB = {
    ...JSON.parse(JSON.stringify(S.promptFixture.status)),
    kind: "agent-b",
    label: "Agent B",
    capabilities: {
      ...JSON.parse(JSON.stringify(S.promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
    },
  };
  const client = S.promptClient({
    agentStatuses: async () => ({
      windows: [S.promptFixture.status, statusB],
      wsl: [],
    }),
    sendThreadInput: async (payload: unknown) => {
      sends.push(payload);
      return {};
    },
    startThread: async (payload: unknown) => starts.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  const post = (body: unknown) =>
    value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const prompt = () =>
    value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "continue over there" }),
      }),
    );
  // Same provider → normal selection, no switch staged.
  expect((await post({ model: { providerID: "codex", id: "m1" } })).status).toBe(204);
  // Different provider → pending switch.
  expect((await post({ model: { providerID: "agent-b", id: "m2" } })).status).toBe(204);
  // The next prompt launches in place — no sendThreadInput, no sessionRef.
  expect((await prompt()).status).toBe(200);
  expect(sends).toHaveLength(0);
  expect(starts.at(-1)).toMatchObject({
    threadId: "thread-1",
    agentKind: "agent-b",
    config: { model: "m2" },
    prompt: "continue over there",
    providerSwitch: {
      fromAgentKind: "codex",
      contextStrategy: expect.stringMatching(/^(thread-transcript|context-file)$/u),
    },
  });
  expect((starts.at(-1) as Record<string, unknown>).providerSwitch).toMatchObject({
    handoffItemId: expect.stringMatching(/^handoff-/u),
  });
  expect(starts.at(-1)).not.toHaveProperty("sessionRef");
});

test("a provider switch carries MCP tool flags when the target still resolves them", async () => {
  const starts: unknown[] = [];
  const thread = {
    ...S.promptFixture.thread,
    config: {
      model: "m1",
      crossagentMcp: true,
      browserMcp: true,
      mcpServerOverrides: { exa: { url: "x" } },
      pluginOverrides: { p: true },
      computerUse: true,
      selectionBinding: { model: "m1" },
      executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
    },
  };
  const statusB = {
    ...JSON.parse(JSON.stringify(S.promptFixture.status)),
    kind: "agent-b",
    capabilities: {
      ...JSON.parse(JSON.stringify(S.promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
      mcpScope: { gui: "always" },
    },
  };
  const client = S.promptClient({
    agentStatuses: async () => ({ windows: [S.promptFixture.status, statusB], wsl: [] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    startThread: async (payload: unknown) => starts.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: { providerID: "agent-b", id: "m2" } }),
    }),
  );
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "switch me" }),
    }),
  );
  expect(response.status).toBe(200);
  const cfg = (starts.at(-1) as { config: Record<string, unknown> }).config;
  expect(cfg.crossagentMcp).toBe(true);
  expect(cfg.browserMcp).toBe(true);
  expect(cfg.mcpServerOverrides).toEqual({ exa: { url: "x" } });
  expect(cfg.pluginOverrides).toEqual({ p: true });
  expect(cfg).not.toHaveProperty("computerUse");
  expect(cfg).not.toHaveProperty("selectionBinding");
  expect(cfg).not.toHaveProperty("executionEnvironment");
});

test("a provider switch refuses while the thread is busy and survives a host 409", async () => {
  const starts: unknown[] = [];
  const statusB = {
    ...JSON.parse(JSON.stringify(S.promptFixture.status)),
    kind: "agent-b",
    capabilities: {
      ...JSON.parse(JSON.stringify(S.promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
    },
  };
  const client = S.promptClient({
    agentStatuses: async () => ({ windows: [S.promptFixture.status, statusB], wsl: [] }),
    startThread: async (payload: unknown) => {
      starts.push(payload);
      const err = new Error("provider switch conflict") as Error & { status: number };
      err.status = 409;
      throw err;
    },
    callRemoteProcedure: async () => null,
  });
  const { value } = S.router(client);
  S.working(value);
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/model", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: { providerID: "agent-b", id: "m2" } }),
        }),
      )
    ).status,
  ).toBe(409);
  // Idle again → the switch stages; a host 409 answers 409 and keeps it.
  value.handleRemoteEvent({
    type: "thread-state",
    threadId: "thread-1",
    status: "idle",
  });
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: { providerID: "agent-b", id: "m2" } }),
    }),
  );
  const failed = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "switch" }),
    }),
  );
  expect(failed.status).toBe(409);
  // The pending switch survives — the next prompt still goes through startThread.
  const again = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "switch" }),
    }),
  );
  expect(again.status).toBe(409);
  expect(starts).toHaveLength(2);
});

test("a context-file switch extracts, uploads, and orders segments", async () => {
  const starts: unknown[] = [];
  const uploads: unknown[] = [];
  const thread = { ...S.promptFixture.thread, sessionRef: { id: "sess-1" } };
  const statusB = {
    ...JSON.parse(JSON.stringify(S.promptFixture.status)),
    kind: "agent-b",
    capabilities: {
      ...JSON.parse(JSON.stringify(S.promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
    },
  };
  const client = S.promptClient({
    agentStatuses: async () => ({ windows: [S.promptFixture.status, statusB], wsl: [] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    startThread: async (payload: unknown) => starts.push(payload),
    uploadAttachment: async (payload: unknown) => {
      uploads.push(payload);
      return "upl/handoff-context.md";
    },
    callRemoteProcedure: async (name: string, payload: unknown) =>
      name === "extractContext"
        ? {
            summary: "prior turns here",
            sourceProvider: "Codex",
            contentKind: "transcript",
            sourceSessionId: "sess-1",
            extractedAt: "2026-01-02T00:00:00.000Z",
          }
        : (payload as unknown),
  });
  const { value } = S.router(client);
  // threadMentionToolsAvailable stays absent → context-file strategy.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: { providerID: "agent-b", id: "m2" } }),
    }),
  );
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "keep going" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(uploads.at(-1)).toMatchObject({ fileName: "handoff-context.md" });
  const start = starts.at(-1) as Record<string, unknown>;
  const instruction =
    "This task was handed off from a Codex session. The attached file is the chat history of this conversation so far.";
  expect(start.prompt).toContain(instruction);
  expect(start.prompt).toContain("keep going");
  expect(start.providerSwitch).toMatchObject({ contextStrategy: "context-file" });
  expect(start.segments).toMatchObject([
    { kind: "text" },
    { kind: "attachment", path: "upl/handoff-context.md", mimeType: "text/markdown" },
    { kind: "text", content: "\n\n" },
    { kind: "text", content: "keep going" },
  ]);
});

test("a stashed shell output survives an @file mention exactly once", async () => {
  const shells: string[] = [];
  const watches = new Map<string, (data: string) => void>();
  const sent: { prompt: string; segments?: { kind: string; content?: string }[] }[] = [];
  const client = S.promptClient({
    startShell: async (input: { shellId: string }) => {
      shells.push(input.shellId);
    },
    writeTerminal: async () => {},
    closeShell: async () => {},
    boundedProjectListPage: async () => ({
      projects: [{ id: "project-1", location: { kind: "windows", path: "C:/repo" } }],
    }),
    sendThreadInput: async (input: {
      prompt: string;
      segments?: { kind: string; content?: string }[];
    }) => {
      sent.push(input);
      return {};
    },
  });
  const { value } = S.router(client, S.bootstrap.home, () => undefined, S.bootstrap.directory, {
    watchTerminal: (id: string, onOutput: (data: string) => void) => {
      watches.set(id, onOutput);
    },
    unwatchTerminal: (id: string) => {
      watches.delete(id);
    },
  });
  const pending = value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "ls" }),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  watches.get(shells[0]!)?.("out\n");
  value.handleRemoteEvent({ type: "thread-exited", threadId: shells[0]! });
  await pending;
  const promptResponse = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "look @file.md",
        files: [
          { uri: "file:///C:/repo/file.md", mention: { start: 5, end: 13, text: "@file.md" } },
        ],
      }),
    }),
  );
  if (promptResponse.status !== 200)
    console.log("PROMPT STATUS", promptResponse.status, await promptResponse.text());
  const request = sent.at(-1)!;
  expect(request.prompt.startsWith("Shell output the user ran before this message:")).toBe(true);
  expect(request.prompt.split("Shell output the user ran").length - 1).toBe(1);
  expect(request.prompt).toContain("look");
  expect(request.segments?.[0]?.kind).toBe("text");
  expect(request.segments?.[0]?.content).toContain("Shell output the user ran");
});
test("a pending mcp toggle survives a provider switch into startThread", async () => {
  const thread = {
    id: "thread-1",
    title: "t",
    agentKind: "codex",
    projectId: "project-1",
    presentationMode: "gui",
    status: "idle",
    config: { model: "o4", browserMcp: true },
    archived: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
  const switched: { config: Record<string, unknown> }[] = [];
  const client = S.promptClient({
    boundedThreadListPage: async () => ({
      page: { threads: [thread], nextCursor: null },
      reads: {},
    }),
    agentStatuses: async () => ({
      windows: [
        {
          kind: "codex",
          installed: true,
          capabilities: { presentationMode: "gui", mcpScope: "thread" },
          authState: "authenticated",
        },
        {
          kind: "kimi",
          installed: true,
          capabilities: { presentationMode: "gui", mcpScope: "thread" },
          authState: "authenticated",
        },
      ],
      wsl: [],
    }),
    startThread: async (input: { config: Record<string, unknown> }) => {
      switched.push(input);
      return {};
    },
    callRemoteProcedure: async () => ({}),
  });
  const { value } = S.router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1"));
  await value.handle(
    new Request("http://poracode.invalid/api/experimental/mcp/browser/disconnect", {
      method: "POST",
    }),
  );
  // Stage the switch via the model route: a different provider's model.
  const switchPatch = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: { providerID: "kimi", id: "k2" } }),
    }),
  );
  if (switchPatch.status !== 204)
    console.log("PATCH", switchPatch.status, await switchPatch.text());
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "go" }),
    }),
  );
  expect(switched.at(-1)?.config.browserMcp).toBe(false);
});
