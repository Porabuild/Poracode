import { expect, test } from "bun:test";
import * as S from "./test-support";
import { hasConnectedProvider } from "../../../opencode/packages/tui/src/util/connected-provider";
import { agentStatusSchema } from "@/shared/contracts";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import { TUI_LAST_MODEL_FILE_NAME } from "@/shared/tuiBootstrap";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { EventStreamHub } from "../events";
import type { IntegrationListOutput, ModelListOutput, ProviderListOutput } from "@opencode/client";

test("routes project file search/read and the active provider command catalog", async () => {
  const project = remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const calls: string[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    callRemoteProcedure: async (procedure: string) => {
      calls.push(procedure);
      if (procedure === "searchProjectFiles")
        return {
          entries: [{ path: "src/main.ts", name: "main.ts", type: "file" }],
          totalIndexed: 1,
        };
      if (procedure === "readProjectFile")
        return {
          path: "README.md",
          status: "ready",
          modifiedAtMs: 1,
          content: "# fixture",
        };
      if (procedure === "gitProjectSnapshot")
        return {
          status: null,
          branches: {
            current: "main",
            branches: [{ name: "main", current: true, commit: "abc", isRemote: false }],
          },
          worktrees: [],
          ghAvailable: false,
        };
      if (procedure === "getGitStatus")
        return {
          isRepo: true,
          branch: "main",
          tracking: "",
          hasRemote: false,
          remoteInfo: null,
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [
            {
              path: "README.md",
              status: "modified",
              staged: false,
              insertions: 1,
              deletions: 1,
            },
          ],
          totalInsertions: 1,
          totalDeletions: 1,
        };
      if (procedure === "gitListBranches")
        return {
          current: "main",
          branches: [{ name: "main", current: true, commit: "abc", isRemote: false }],
        };
      if (procedure === "getGitDiff")
        return {
          diff: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n-old\n+new\n",
        };
      throw new Error(`Unexpected procedure: ${procedure}`);
    },
    agentSlashCommands: async (kind: string) => ({
      kind,
      commands: [{ id: "status", label: "Status", description: "Show status" }],
    }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const created = await value.handle(
    new Request("http://poracode.invalid/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ses_thread-1",
        model: { id: "model-1", providerID: "provider-1" },
      }),
    }),
  );
  expect(created.status).toBe(200);

  const found = await value.handle(new Request("http://poracode.invalid/api/fs/find?query=main"));
  expect(await found.json()).toEqual({
    location: { directory: "C:/repo" },
    data: [{ path: "src/main.ts", type: "file" }],
  });
  const read = await value.handle(new Request("http://poracode.invalid/api/fs/read/README.md"));
  expect(await read.text()).toBe("# fixture");
  const commands = await value.handle(new Request("http://poracode.invalid/api/command"));
  expect(await commands.json()).toEqual({
    location: { directory: "C:/repo" },
    data: [{ name: "status", description: "Show status" }],
  });
  const vcs = await value.handle(new Request("http://poracode.invalid/api/vcs"));
  expect(await vcs.json()).toMatchObject({
    data: { branch: { current: "main" } },
  });
  const status = await value.handle(new Request("http://poracode.invalid/api/vcs/status"));
  expect(await status.json()).toMatchObject({
    data: [{ file: "README.md", additions: 1, deletions: 1, status: "modified" }],
  });
  const branches = await value.handle(new Request("http://poracode.invalid/api/vcs/branch"));
  expect(await branches.json()).toMatchObject({ data: ["main"] });
  const diff = await value.handle(
    new Request("http://poracode.invalid/api/vcs/diff?mode=S.working"),
  );
  expect(await diff.json()).toMatchObject({
    data: [{ file: "README.md", additions: 1, deletions: 1, status: "modified" }],
  });
  expect(calls).toEqual([
    "searchProjectFiles",
    "readProjectFile",
    "gitProjectSnapshot",
    "getGitStatus",
    "gitListBranches",
    "getGitDiff",
  ]);
});

test("sends a session command as a slash prompt", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-command-test-"));
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
      kind: "agent-a",
      label: "Agent A",
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
    let prompt: string | undefined;
    const client = {
      boundedProjectListPage: async () => ({ projects: [project] }),
      boundedThreadListPage: async () => ({ page: { threads: [] } }),
      agentStatuses: async () => ({ windows: [status], wsl: [] }),
      startNewThread: async (input: Parameters<RemoteDesktopClient["startNewThread"]>[0]) => {
        prompt = input.prompt;
        return { threadId: input.threadId };
      },
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home);
    const sessionID = "ses_command-test";
    await value.handle(
      new Request("http://poracode.invalid/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: sessionID,
          agent: "build",
          model: { id: "model-1", providerID: "agent-a" },
        }),
      }),
    );
    const response = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "status", text: "--short" }),
      }),
    );
    expect(response.status).toBe(204);
    expect(prompt).toBe("/status --short");
  } finally {
    if (previousHome === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previousHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("returns a JSON 404 for unknown routes", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-S.router-test-"));
  try {
    const { value } = S.router({} as RemoteDesktopClient, home);
    const response = await value.handle(new Request("http://poracode.invalid/api/unknown"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
    expect(await readFile(join(home, "log", "adapter.log"), "utf8")).toContain(
      '"responseStatus":404',
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("marks desktop-owned data migration as complete", async () => {
  const { value } = S.router();
  const response = await value.handle(
    new Request("http://poracode.invalid/api/experimental/migration/v1"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "completed" });
});

test("returns a generated-shape VCS snapshot for startup", async () => {
  const { value } = S.router();
  const response = await value.handle(
    new Request("http://poracode.invalid/api/vcs?location.directory=C%3A%2Frepo"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    location: { directory: "C:/repo" },
    data: { branch: {} },
  });
});

test("returns valid worktree list and refresh responses during startup recovery", async () => {
  const { value } = S.router();
  const response = await value.handle(
    new Request("http://poracode.invalid/api/worktree?projectID=project-1"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
  const refreshed = await value.handle(
    new Request("http://poracode.invalid/api/worktree/refresh", { method: "POST" }),
  );
  expect(refreshed.status).toBe(204);
});

test("returns no persistent PTYs for a structured GUI session", async () => {
  const { value } = S.router();
  const response = await value.handle(
    new Request("http://poracode.invalid/api/experimental/session/ses_1/terminal"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [] });
});

test("refreshes provider and model queries from a platform status snapshot", async () => {
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
  const client = {
    agentStatuses: async () => ({
      windows: [],
      wsl: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const providerRequest = () => value.handle(new Request("http://poracode.invalid/api/provider"));
  const modelRequest = () => value.handle(new Request("http://poracode.invalid/api/model"));
  expect(((await (await providerRequest()).json()) as ProviderListOutput).data).toEqual([]);
  expect(((await (await modelRequest()).json()) as ModelListOutput).data).toEqual([]);

  const eventResponse = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = eventResponse.body!.getReader();
  await reader.read(); // server.connected
  value.handleRemoteEvent({ type: "windows-agent-statuses", statuses: [status] });
  const decoder = new TextDecoder();
  const updated = new Set<string>();
  for (let i = 0; i < 6 && updated.size < 4; i += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    for (const line of decoder.decode(chunk.value).matchAll(/"type":"([^"]+)"/gu))
      updated.add(line[1]!);
  }
  expect(updated).toEqual(
    new Set(["agent.updated", "provider.updated", "model.updated", "integration.updated"]),
  );
  await reader.cancel();

  expect(((await (await providerRequest()).json()) as ProviderListOutput).data).toMatchObject([
    { id: "codex", activation: "enabled", integrationID: "codex" },
  ]);
  expect(((await (await modelRequest()).json()) as ModelListOutput).data).toMatchObject([
    { providerID: "codex", id: "model-1" },
  ]);
  const integrations = (await (
    await value.handle(new Request("http://poracode.invalid/api/integration"))
  ).json()) as IntegrationListOutput;
  expect(integrations.data).toMatchObject([
    {
      id: "codex",
      name: "Codex",
      connections: [{ type: "env", name: "codex" }],
    },
  ]);
  expect(hasConnectedProvider(integrations.data)).toBe(true);

  value.handleRemoteEvent({
    type: "agent-status-updated",
    status: { ...status, label: "Codex Updated" },
  });
  expect(((await (await providerRequest()).json()) as ProviderListOutput).data).toMatchObject([
    { id: "codex", name: "Codex Updated" },
  ]);
});

test("does not expose WSL provider status to native projects", async () => {
  const status = agentStatusSchema.parse({
    kind: "wsl-codex",
    label: "WSL Codex",
    installed: true,
    authState: "authenticated",
    envKind: "wsl",
    capabilities: {
      presentationMode: "gui",
      presentationModes: ["gui"],
      models: [{ id: "wsl-model", label: "WSL Model" }],
      modes: ["agent"],
      defaultApprovalPolicy: "ask",
      defaultSandboxMode: "read",
    },
  });
  const client = {
    agentStatuses: async () => ({
      windows: [],
      wsl: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
  } as unknown as RemoteDesktopClient;
  const { value: windows } = S.router(client);
  await windows.handle(new Request("http://poracode.invalid/api/provider"));
  windows.handleRemoteEvent({ type: "wsl-agent-statuses", statuses: [status] });
  const nativeProviders = (await (
    await windows.handle(new Request("http://poracode.invalid/api/provider"))
  ).json()) as ProviderListOutput;
  expect(nativeProviders.data).toEqual([]);

  const { value: wsl } = S.router(
    client,
    S.bootstrap.home,
    () => undefined,
    "\\\\wsl.localhost\\Ubuntu\\home\\repo",
  );
  await wsl.handle(new Request("http://poracode.invalid/api/provider"));
  wsl.handleRemoteEvent({ type: "wsl-agent-statuses", statuses: [status] });
  const wslProviders = (await (
    await wsl.handle(new Request("http://poracode.invalid/api/provider"))
  ).json()) as ProviderListOutput;
  expect(wslProviders.data).toMatchObject([{ id: "wsl-codex", activation: "enabled" }]);
});

test("model default waits for provider discovery on a fresh profile", async () => {
  let calls = 0;
  const status = agentStatusSchema.parse({
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      presentationModes: ["terminal", "gui"],
      models: [{ id: "gpt-5", label: "GPT-5" }],
    },
  });
  const client = {
    agentStatuses: async () => ({
      windows: calls++ === 0 ? [] : [status],
      wsl: [],
    }),
    settings: async () => ({ agentSettings: {} }),
    boundedProjectListPage: async () => ({ projects: [] }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const response = await value.handle(new Request("http://poracode.invalid/api/model/default"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: { providerID: "codex", modelID: "gpt-5" },
  });
  expect(calls).toBeGreaterThan(1);
});

test("a pre-upgrade last-model file without toggle fields parses cleanly", async () => {
  const previous = await Bun.file(join(S.bootstrap.home, TUI_LAST_MODEL_FILE_NAME))
    .json()
    .catch(() => undefined);
  const parsed = (await import("@/shared/tuiBootstrap")).tuiLastModelSchema.safeParse({
    ...(previous ?? {}),
    version: 1,
    provider: "codex",
    model: "gpt-5",
    updatedAt: new Date().toISOString(),
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.fast).toBeUndefined();
    expect(parsed.data.thinking).toBeUndefined();
    expect(parsed.data.contextSize).toBeUndefined();
  }
});

test("mcp list reports the built-in toggles; disabled-by-host omitted", async () => {
  const { value } = S.router(
    S.promptClient({
      settings: async () => ({ disabledBuiltInMcpServers: ["chrome"] }),
    }),
  );
  const response = await value.handle(new Request("http://poracode.invalid/api/mcp"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.location.directory).toBe("C:/repo");
  const data = body.data as { name: string; status: { status: string } }[];
  expect(data.map((server) => server.name).sort()).toEqual(["browser", "crossagents"]);
  expect(data.find((server) => server.name === "browser")?.status.status).toBe("connected");
  // A pending per-session toggle flips the reported status for that server.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1"));
  await value.handle(
    new Request("http://poracode.invalid/api/experimental/mcp/browser/disconnect", {
      method: "POST",
    }),
  );
  const toggled = await value.handle(new Request("http://poracode.invalid/api/mcp"));
  const toggledData = ((await toggled.json()) as { data: typeof data }).data;
  expect(toggledData.find((server) => server.name === "browser")?.status.status).toBe("disabled");
});

test("mcp connect/disconnect stages a per-session toggle applied at launch", async () => {
  const configCalls: { threadId?: string; config: Record<string, unknown> }[] = [];
  const client = S.promptClient({
    sendThreadInput: async (input: { threadId: string; config: Record<string, unknown> }) => {
      configCalls.push(input);
      return {};
    },
  });
  const { value } = S.router(client);
  const toggleResponse = await value.handle(
    new Request("http://poracode.invalid/api/experimental/mcp/browser/disconnect", {
      method: "POST",
    }),
  );
  expect(toggleResponse.status).toBe(204);
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    }),
  );
  expect(configCalls[0]!.config.browserMcp).toBe(false);
  // Consumed — a second send doesn't re-apply.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "again" }),
    }),
  );
  expect(configCalls[1]!.config.browserMcp).toBeUndefined();
});

test("a live-session mcp toggle toasts instead of restarting", async () => {
  const client = S.promptClient({ sendThreadInput: async () => ({}) });
  const { value } = S.router(client);
  S.working(value);
  const sse = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = sse.body!.getReader();
  await reader.read(); // server.connected
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1"));
  const response = await value.handle(
    new Request("http://poracode.invalid/api/experimental/mcp/chrome/connect", {
      method: "POST",
    }),
  );
  expect(response.status).toBe(204);
  const { value: frame } = await reader.read();
  expect(new TextDecoder().decode(frame)).toContain("next time this thread starts");
});

test("skill list maps scanned plugins and prompt skills become segments", async () => {
  const client = S.promptClient({
    sendThreadInput: async () => ({}),
    callRemoteProcedure: async (name: string) =>
      name === "scanSkills"
        ? {
            plugins: [
              { name: "agent-md-refactor", scope: "project", provider: "codex", path: "S.md" },
            ],
          }
        : null,
  });
  const { value } = S.router(client);
  const list = await value.handle(new Request("http://poracode.invalid/api/skill"));
  expect(list.status).toBe(200);
  const data = (await list.json()).data;
  expect(data[0]).toMatchObject({ id: "project:agent-md-refactor", name: "agent-md-refactor" });

  let captured: { segments?: { kind: string; name?: string }[] } | undefined;
  const capturedClient = S.promptClient({
    sendThreadInput: async (input: { segments?: { kind: string; name?: string }[] }) => {
      captured = input;
      return {};
    },
    startThread: async (input: { segments?: { kind: string; name?: string }[] }) => {
      captured = input;
      return {};
    },
    startNewThread: async (input: { segments?: { kind: string; name?: string }[] }) => {
      captured = input;
      return {};
    },
    callRemoteProcedure: async (name: string) =>
      name === "scanSkills"
        ? { plugins: [{ name: "agent-md-refactor", scope: "project", provider: "codex" }] }
        : null,
  });
  const { value: withSkill } = S.router(capturedClient);
  const skillResponse = await withSkill.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "run /agent-md-refactor now",
        skills: [
          {
            id: "project:agent-md-refactor",
            mention: { start: 4, end: 22, text: "/agent-md-refactor" },
          },
        ],
      }),
    }),
  );
  expect(skillResponse.status).toBe(200);
  expect(
    captured!.segments!.some((part) => part.kind === "skill" && part.name === "agent-md-refactor"),
  ).toBe(true);

  const unknown = await withSkill.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "nope", skills: [{ id: "project:nope" }] }),
    }),
  );
  expect(unknown.status).toBe(400);
});

test("location reload answers 204 without resyncing the event stream", async () => {
  const emitted: string[] = [];
  const { events, value } = S.router(S.promptClient());
  const resync = events.resync.bind(events);
  events.resync = (() => {
    emitted.push("resync");
    return resync();
  }) as never;
  const response = await value.handle(
    new Request("http://poracode.invalid/api/location/reload", { method: "POST" }),
  );
  expect(response.status).toBe(204);
  expect(emitted).toEqual([]);
});

const guiStatus = (over: Record<string, unknown> = {}) =>
  agentStatusSchema.parse({
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities: {
      presentationModes: ["terminal", "gui"],
      models: [
        { id: "gpt-5", label: "GPT-5" },
        { id: "gpt-5-mini", label: "GPT-5 Mini" },
      ],
      modelEfforts: { "gpt-5": ["low", "medium", "high"] },
    },
    ...over,
  });

const captureEmitted = (events: EventStreamHub) => {
  const emitted: string[] = [];
  const emit = events.emit.bind(events);
  events.emit = ((event: Parameters<EventStreamHub["emit"]>[0]) => {
    const type = (event as { type?: string }).type;
    if (type) emitted.push(type);
    return emit(event);
  }) as never;
  return emitted;
};

test("cold start polls statuses until a usable provider appears", async () => {
  let calls = 0;
  const status = guiStatus();
  const client = {
    agentStatuses: async () => ({ windows: calls++ === 0 ? [] : [status], wsl: [] }),
    settings: async () => ({ agentSettings: {} }),
  } as unknown as RemoteDesktopClient;
  const { events, value } = S.router(client, S.bootstrap.home, undefined, S.bootstrap.directory, {
    statusPollIntervalMs: 5,
    statusPollDeadlineMs: 5_000,
  });
  const emitted = captureEmitted(events);

  const first = await value.handle(new Request("http://poracode.invalid/api/model"));
  expect((await first.json()).data).toEqual([]);
  await Bun.sleep(60);
  const later = await value.handle(new Request("http://poracode.invalid/api/model"));
  expect((await later.json()).data.map((m: { modelID: string }) => m.modelID)).toEqual([
    "gpt-5",
    "gpt-5-mini",
  ]);
  expect(emitted).toContain("model.updated");
  expect(emitted).toContain("config.updated");

  const before = calls;
  value.handleRemoteEvent({ type: "windows-agent-statuses", statuses: [status] });
  await Bun.sleep(60);
  expect(calls).toBe(before);
});

test("warm start does not poll when the first snapshot is usable", async () => {
  let calls = 0;
  const client = {
    agentStatuses: async () => {
      calls += 1;
      return { windows: [guiStatus()], wsl: [] };
    },
    settings: async () => ({ agentSettings: {} }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client, S.bootstrap.home, undefined, S.bootstrap.directory, {
    statusPollIntervalMs: 5,
    statusPollDeadlineMs: 2_000,
  });
  await value.handle(new Request("http://poracode.invalid/api/model"));
  await Bun.sleep(40);
  expect(calls).toBe(1);
});

test("a status event landing mid-poll is not overwritten by the stale fetch", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const client = {
    agentStatuses: async () => {
      calls += 1;
      if (calls === 1) return { windows: [], wsl: [] };
      await new Promise<void>((resolve) => (release = resolve));
      return { windows: [guiStatus()], wsl: [] };
    },
    settings: async () => ({ agentSettings: {} }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client, S.bootstrap.home, undefined, S.bootstrap.directory, {
    statusPollIntervalMs: 5,
    statusPollDeadlineMs: 5_000,
  });
  await value.handle(new Request("http://poracode.invalid/api/model"));
  await Bun.sleep(30);
  expect(release).toBeDefined();
  const live = guiStatus({ kind: "claude", label: "Claude" });
  value.handleRemoteEvent({ type: "windows-agent-statuses", statuses: [live] });
  release!();
  await Bun.sleep(30);
  const response = await value.handle(new Request("http://poracode.invalid/api/model"));
  const providers = (await response.json()).data.map((m: { providerID: string }) => m.providerID);
  expect(providers).toEqual(["claude", "claude"]);
});

test("config documents answer the last-used model with its saved variant", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-last-model-"));
  const previous = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    await Bun.write(
      join(home, TUI_LAST_MODEL_FILE_NAME),
      JSON.stringify({
        version: 1,
        provider: "codex",
        model: "gpt-5",
        effort: "high",
        updatedAt: new Date().toISOString(),
      }),
    );
    const client = {
      agentStatuses: async () => ({ windows: [guiStatus()], wsl: [] }),
      settings: async () => ({ agentSettings: {} }),
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home);
    const response = await value.handle(new Request("http://poracode.invalid/api/config"));
    expect(await response.json()).toMatchObject([
      {
        type: "document",
        info: { model: { providerID: "codex", model: "gpt-5", variant: "high" } },
      },
    ]);
  } finally {
    if (previous === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("config default falls back when the last model's provider is unusable", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-last-model-"));
  const previous = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    await Bun.write(
      join(home, TUI_LAST_MODEL_FILE_NAME),
      JSON.stringify({
        version: 1,
        provider: "codex",
        model: "gpt-5",
        updatedAt: new Date().toISOString(),
      }),
    );
    const claude = guiStatus({ kind: "claude", label: "Claude" });
    const codex = guiStatus({ kind: "codex", label: "Codex", authState: "missing" });
    const client = {
      agentStatuses: async () => ({ windows: [codex, claude], wsl: [] }),
      settings: async () => ({ agentSettings: { claude: { model: "gpt-5-mini" } } }),
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home);
    const response = await value.handle(new Request("http://poracode.invalid/api/config"));
    expect(await response.json()).toMatchObject([
      { type: "document", info: { model: { providerID: "claude", model: "gpt-5-mini" } } },
    ]);
  } finally {
    if (previous === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("config default uses the first GUI model when the configured one is missing", async () => {
  const client = {
    agentStatuses: async () => ({ windows: [guiStatus()], wsl: [] }),
    settings: async () => ({ agentSettings: { codex: { model: "gone-model" } } }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const response = await value.handle(new Request("http://poracode.invalid/api/config"));
  expect(await response.json()).toMatchObject([
    { type: "document", info: { model: { providerID: "codex", model: "gpt-5" } } },
  ]);
});

test("config default stays empty while nothing usable is discovered", async () => {
  const client = {
    agentStatuses: async () => ({ windows: [], wsl: [] }),
    settings: async () => ({ agentSettings: {} }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const response = await value.handle(new Request("http://poracode.invalid/api/config"));
  expect(await response.json()).toEqual([]);
});

test("config default answers empty when settings resolution fails", async () => {
  const client = {
    agentStatuses: async () => ({ windows: [guiStatus()], wsl: [] }),
    settings: async () => {
      throw new Error("settings down");
    },
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const response = await value.handle(new Request("http://poracode.invalid/api/config"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});

test("config default answers empty when the status fetch fails", async () => {
  const client = {
    agentStatuses: async () => {
      throw new Error("statuses down");
    },
    settings: async () => ({ agentSettings: {} }),
  } as unknown as RemoteDesktopClient;
  const { value } = S.router(client);
  const response = await value.handle(new Request("http://poracode.invalid/api/config"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual([]);
});

test("config default ignores a last-model file from another version", async () => {
  const home = await mkdtemp(join(tmpdir(), "poracode-last-model-"));
  const previous = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    await Bun.write(
      join(home, TUI_LAST_MODEL_FILE_NAME),
      '{"version":2,"provider":"zzz","model":"gone"}',
    );
    const client = {
      agentStatuses: async () => ({ windows: [guiStatus()], wsl: [] }),
      settings: async () => ({ agentSettings: {} }),
    } as unknown as RemoteDesktopClient;
    const { value } = S.router(client, home);
    const response = await value.handle(new Request("http://poracode.invalid/api/config"));
    expect(await response.json()).toMatchObject([
      { type: "document", info: { model: { providerID: "codex", model: "gpt-5" } } },
    ]);
  } finally {
    if (previous === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});
