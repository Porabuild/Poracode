import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, setSystemTime, test } from "bun:test";
import type {
  IntegrationListOutput,
  MessageListOutput,
  ModelListOutput,
  ProviderListOutput,
  SessionInfo,
  SessionListOutput,
} from "@opencode/client";
import { hasConnectedProvider } from "../../opencode/packages/tui/src/util/connected-provider";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteClientError } from "@/shared/remote/client";
import { DEFAULT_TERMINAL_SIZE, agentStatusSchema } from "@/shared/contracts";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import { TUI_LAST_MODEL_FILE_NAME } from "@/shared/tuiBootstrap";
import type { TuiBootstrap } from "../bootstrap";
import { EventStreamHub, createEventTranslator, type ThreadEventContext } from "./events";
import { formId } from "./ids";
import { createRouter } from "./router";

const bootstrap: TuiBootstrap = {
  version: 2,
  auth: "pairing",
  appVersion: "0.0.0",
  home: "C:/poracode-tui",
  pairingUrl: "http://127.0.0.1:49152/#token=temporary",
  directory: "C:/repo",
  projectId: "project-1",
  args: {},
};

function router(
  client: RemoteDesktopClient = {} as RemoteDesktopClient,
  home = bootstrap.home,
  setThreadInterests: (ids: readonly string[]) => void | Promise<void> = () => undefined,
  directory = bootstrap.directory,
  overrides: Partial<Parameters<typeof createRouter>[0]> = {},
) {
  const events = new EventStreamHub();
  const contexts = new Map<string, ThreadEventContext>();
  const translator = createEventTranslator(contexts, () => 1);
  const value = createRouter({
    bootstrap: { ...bootstrap, home, directory },
    client,
    events,
    setThreadInterests,
    translate: translator.translate,
    recordPermissionReply: translator.recordPermissionReply,
    recordFormRequest: translator.recordFormRequest,
    forgetFormRequest: translator.forgetFormRequest,
    resetThread: translator.resetThread,
    hasActiveRun: translator.hasActiveRun,
    registerThreadContext: (threadId, context) => contexts.set(threadId, context),
    ...overrides,
  });
  return { events, value };
}

describe("in-process API router", () => {
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
    const { events, value } = router(client);
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
    const { value } = router(client);
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
    const { value } = router(client);
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
    const { value } = router(client);
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
    const { value } = router(client);
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
      new Request("http://poracode.invalid/api/vcs/diff?mode=working"),
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
    const home = await mkdtemp(join(tmpdir(), "poracode-router-command-test-"));
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
      const { value } = router(client, home);
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
    const home = await mkdtemp(join(tmpdir(), "poracode-router-test-"));
    try {
      const { value } = router({} as RemoteDesktopClient, home);
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
    const { value } = router();
    const response = await value.handle(
      new Request("http://poracode.invalid/api/experimental/migration/v1"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "completed" });
  });

  test("returns a generated-shape VCS snapshot for startup", async () => {
    const { value } = router();
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
    const { value } = router();
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
    const { value } = router();
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
    const { value } = router(client);
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
    const { value: windows } = router(client);
    await windows.handle(new Request("http://poracode.invalid/api/provider"));
    windows.handleRemoteEvent({ type: "wsl-agent-statuses", statuses: [status] });
    const nativeProviders = (await (
      await windows.handle(new Request("http://poracode.invalid/api/provider"))
    ).json()) as ProviderListOutput;
    expect(nativeProviders.data).toEqual([]);

    const { value: wsl } = router(
      client,
      bootstrap.home,
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
    const { value } = router(client);

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
    const home = await mkdtemp(join(tmpdir(), "poracode-router-last-model-test-"));
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
      const { value } = router(client, home, async (ids) => {
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
      expect(
        JSON.parse(await readFile(join(home, TUI_LAST_MODEL_FILE_NAME), "utf8")),
      ).toMatchObject({
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
    const home = await mkdtemp(join(tmpdir(), "poracode-router-resume-test-"));
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
      const { value } = router(client, home, async (ids) => {
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
    const home = await mkdtemp(join(tmpdir(), "poracode-router-no-resume-test-"));
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
      const { value } = router(client, home);
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

  test("starts SSE with server.connected and closes streams on resync", async () => {
    const { events, value } = router();
    const response = await value.handle(new Request("http://poracode.invalid/api/event"));
    const reader = response.body!.getReader();
    const first = await reader.read();
    const data = new TextDecoder().decode(first.value).match(/^data: (.+)$/mu)?.[1];
    expect(JSON.parse(data!).type).toBe("server.connected");
    events.resync();
    expect((await reader.read()).done).toBe(true);
  });

  test("sends an OpenCode session interrupt to the mapped remote thread", async () => {
    let interruptedThreadID: string | undefined;
    const client = promptClient({
      interruptThread: async (threadID: string) => {
        interruptedThreadID = threadID;
      },
    });
    const { value } = router(client);
    working(value);
    const response = await value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/interrupt", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ interrupted: true });
    expect(interruptedThreadID).toBe("thread-1");
  });
});

test("session update maps to rename and archive thread commands", async () => {
  const commands: unknown[] = [];
  const client = {
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
    boundedThreadListPage: async () => ({ page: { threads: [] } }),
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);
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
  const { value } = router(client);
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
  const { value } = router(client);
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
  const { value } = router(client);
  const response = await value.handle(new Request("http://poracode.invalid/api/model/default"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: { providerID: "codex", modelID: "gpt-5" },
  });
  expect(calls).toBeGreaterThan(1);
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
  const { value } = router(client);
  const list = (await (
    await value.handle(new Request("http://poracode.invalid/api/session"))
  ).json()) as SessionListOutput;
  expect(list.data[0]?.parentID).toBe("ses_parent-1");
});

test("inbox delete clears the pending steer; an unknown id is a 204 no-op", async () => {
  const cleared: string[] = [];
  const client = promptClient({
    clearPendingSteer: async (id: string) => {
      cleared.push(id);
    },
  });
  const { value } = router(client);
  value.handleRemoteEvent({
    type: "thread-pending-steer",
    threadId: "thread-1",
    pending: { id: "s1", prompt: "steered", stagedAt: 3 },
  });
  // An id that is neither the steer nor a queued item: 204, no clearPendingSteer.
  const noop = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/inbox/inbox-1", {
      method: "DELETE",
    }),
  );
  expect(noop.status).toBe(204);
  expect(cleared).toEqual([]);
  // The steer id itself still clears the pending steer.
  const steer = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/inbox/s1", {
      method: "DELETE",
    }),
  );
  expect(steer.status).toBe(204);
  expect(cleared).toEqual(["thread-1"]);
});

test("subagent task parts link to a virtual read-only subsession", async () => {
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
    config: { model: "gpt-5" },
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
      payload: {
        name: "Task",
        title: "Search the codebase",
        status: "success",
        isSubAgent: true,
        subAgentType: "explore",
      },
    },
    {
      id: "nested-1",
      type: "assistant_message",
      state: "completed",
      streams: {},
      parentItemId: "task-1",
      payload: {
        displayAuthoritative: true,
        content: [{ kind: "text", text: "subagent found three callers" }],
      },
    },
  ];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [parentThread] } }),
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);

  const subSessionID = "ses_thread-1__task-1";

  // The parent transcript's task part carries the navigation id.
  const parentMessages = (await (
    await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"))
  ).json()) as MessageListOutput;
  const taskPart = parentMessages.data
    .flatMap((message) => (message.type === "assistant" ? message.content : []))
    .find((part) => part.type === "tool" && part.name === "task");
  expect(
    taskPart && taskPart.type === "tool" && taskPart.state.status !== "streaming"
      ? taskPart.state.metadata?.sessionID
      : undefined,
  ).toBe(subSessionID);

  // The virtual session resolves with its parent linkage and title.
  const subSession = await value.handle(
    new Request(`http://poracode.invalid/api/session/${subSessionID}`),
  );
  expect(subSession.status).toBe(200);
  const subSessionData = (await subSession.json()) as { data: SessionInfo };
  expect(subSessionData.data.parentID).toBe("ses_thread-1");
  expect(subSessionData.data.title).toBe("Search the codebase");

  // Its transcript is the parent's items nested under the task item.
  const subMessages = (await (
    await value.handle(new Request(`http://poracode.invalid/api/session/${subSessionID}/message`))
  ).json()) as MessageListOutput;
  const nestedText = subMessages.data
    .flatMap((message) => (message.type === "assistant" ? message.content : []))
    .find((part) => part.type === "text");
  expect(nestedText && nestedText.type === "text" ? nestedText.text : "").toContain(
    "subagent found three callers",
  );

  // The subsession is read-only.
  const prompt = await value.handle(
    new Request(`http://poracode.invalid/api/session/${subSessionID}/prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parts: [{ type: "text", text: "hi" }] }),
    }),
  );
  expect(prompt.status).toBe(400);
  const interrupt = await value.handle(
    new Request(`http://poracode.invalid/api/session/${subSessionID}/interrupt`, {
      method: "POST",
    }),
  );
  expect(interrupt.status).toBe(400);
});

test("maps usage.spent, context.updated, and persisted occupancy to usage events", async () => {
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
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
    threadContextUsage: async () => ({ usedTokens: 42_000, maxTokens: 200_000 }),
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  const queue: Array<{ type: string; data: Record<string, unknown> }> = [];
  const readEvent = async (timeoutMs = 4_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const queued = queue.shift();
      if (queued) return queued;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 300)),
      ]);
      if (!chunk || chunk.done) break;
      for (const line of decoder.decode(chunk.value).matchAll(/^data: (.+)$/gmu)) {
        queue.push(JSON.parse(line[1]!));
      }
    }
    return queue.shift() ?? null;
  };
  expect((await readEvent())?.type).toBe("server.connected");

  // On-load: persisted context occupancy emits session.usage.updated.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  const loaded = await readEvent();
  expect(loaded?.type).toBe("session.usage.updated");
  expect(loaded?.data).toMatchObject({
    sessionID: "ses_thread-1",
    cost: 0,
    tokens: { input: 42_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  });

  // usage.spent maps canonical categories to the OpenCode token buckets.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "usage.spent",
      threadId: "thread-1",
      usage: {
        counterKind: "cumulative",
        counter: 1,
        scopeId: "thread-1",
        epoch: 0,
        sampleId: "sample-1",
        tokens: { input: 100, output: 50, cacheRead: 20, cacheWrite: 5 },
        cost: { amount: 1.5, currency: "USD" },
      },
    },
  });
  const spent = await readEvent();
  expect(spent?.type).toBe("session.usage.updated");
  expect(spent?.data).toMatchObject({
    sessionID: "ses_thread-1",
    cost: 1.5,
    tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 20, write: 5 } },
  });

  // context.updated carries window occupancy and keeps the last spend.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "context.updated",
      threadId: "thread-1",
      usage: { usedTokens: 9_000, maxTokens: 200_000 },
    },
  });
  const context = await readEvent();
  expect(context?.type).toBe("session.usage.updated");
  expect(context?.data).toMatchObject({
    sessionID: "ses_thread-1",
    cost: 1.5,
    tokens: { input: 9_000 },
  });
});

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
  const { value } = router(client);
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

test("a pre-upgrade last-model file without toggle fields parses cleanly", async () => {
  const previous = await Bun.file(join(bootstrap.home, TUI_LAST_MODEL_FILE_NAME))
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
  const { value } = router(client);

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
  const { value } = router(client);

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
  const { value } = router(client);

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
  const { value } = router(client);

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
  const { value } = router(client);

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

const forkProject = () =>
  remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
const forkThread = (overrides: Record<string, unknown> = {}) => ({
  id: "thread-1",
  projectId: "project-1",
  agentKind: "codex",
  presentationMode: "gui",
  status: "idle",
  config: { model: "m1" },
  title: "Parent",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  archived: false,
  ...overrides,
});
const forkEnvironment = { capabilities: { catalogMutations: { versions: [1] } } };

test("session.fork issues a catalog command and returns the forked session", async () => {
  const project = forkProject();
  const threads = [forkThread()];
  const commands: { command: unknown; options: unknown }[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    environment: async () => forkEnvironment,
    sendThreadCommand: async (command: unknown, options: unknown) => {
      commands.push({ command, options });
      const parsed = command as { kind: string; threadId: string };
      if (parsed.kind === "fork")
        threads.push(forkThread({ id: parsed.threadId, title: "Parent (fork)" }) as never);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);

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
  const project = forkProject();
  const items = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    { id: "a1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
    { id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} },
    { id: "a2", type: "assistant_message", state: "completed", streams: {}, payload: {} },
  ];
  const commands: unknown[] = [];
  const threads = [forkThread()];
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
    environment: async () => forkEnvironment,
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
      const parsed = command as { kind: string; threadId: string };
      if (parsed.kind === "fork")
        threads.push(forkThread({ id: parsed.threadId, title: "Parent (fork)" }) as never);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);

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
  const project = forkProject();
  const parent = forkThread();
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
  let environment: unknown = forkEnvironment;
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [parent] } }),
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    environment: async () => environment,
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);
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
  const home = await mkdtemp(join(tmpdir(), "poracode-router-fork-prompt-"));
  const previousHome = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const project = forkProject();
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
    const forked = forkThread({
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
    const { value } = router(client, home);
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
  const project = forkProject();
  const thread = forkThread({ status: "finished" });
  const commands: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
    },
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);
  const view = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/view", { method: "POST" }),
  );
  expect(view.status).toBe(204);
  expect(commands).toEqual([{ kind: "acknowledge", threadId: "thread-1" }]);
});

test("prompt on a visible thread adds no extra thread-list read", async () => {
  const project = forkProject();
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
      return { page: { threads: [forkThread()] } };
    },
    sendThreadInput: async () => undefined,
  } as unknown as RemoteDesktopClient;
  const home = await mkdtemp(join(tmpdir(), "poracode-router-prompt-reads-"));
  const previousHome = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const { value } = router(client, home);
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

const elicitationPayload = {
  summary: 'Allow the poracode MCP server to run tool "read_project_file"?',
  details: {
    mcpElicitation: {
      mode: "form",
      message: 'Allow the poracode MCP server to run tool "read_project_file"?',
      serverName: "poracode",
      requestedSchema: { type: "object", properties: {} },
    },
  },
};

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
  const { value } = router(client);

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
          payload: elicitationPayload,
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
      payload: elicitationPayload,
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

test("listThreadItems returns chronological order across history pages", async () => {
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
    status: "idle",
    config: { model: "m1" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  };
  const older = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    { id: "a1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
  ];
  const newer = [{ id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} }];
  const threads = [thread];
  const commands: unknown[] = [];
  const client = {
    boundedProjectListPage: async () => ({ projects: [project] }),
    boundedThreadListPage: async () => ({ page: { threads } }),
    // Newest page first; beforePosition walks backward in time.
    threadRuntimeItemsPage: async (input: { beforePosition?: number }) => ({
      items: input.beforePosition === undefined ? newer : older,
      nextCursor: input.beforePosition === undefined ? 10 : null,
    }),
    threadCompletedTurns: async () => [
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T00:01:00.000Z",
        anchorItemId: "a1",
      },
    ],
    environment: async () => ({ capabilities: { catalogMutations: { versions: [1] } } }),
    sendThreadCommand: async (command: unknown) => {
      commands.push(command);
      const parsed = command as { kind: string; threadId: string };
      if (parsed.kind === "fork") threads.push({ ...thread, id: parsed.threadId });
    },
  } as unknown as RemoteDesktopClient;
  const { value } = router(client);

  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/fork", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ before: "msg_u2" }),
    }),
  );
  expect(response.status).toBe(200);
  // u2 sits after the turn-1 anchor only when pages are chronological.
  expect(commands[0]).toMatchObject({ throughItemId: "a1" });
});

type PromptBody = {
  parts?: { type: string; text: string }[];
  files?: {
    uri: string;
    name?: string;
    description?: string;
    mention?: { start: number; end: number; text: string };
  }[];
  delivery?: "steer" | "queue";
  text?: string;
  model?: { providerID: string; id: string };
};

const promptFixture = {
  project: remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  }),
  status: agentStatusSchema.parse({
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
  }),
  thread: {
    id: "thread-1",
    projectId: "project-1",
    agentKind: "codex",
    presentationMode: "gui",
    config: { model: "m1" },
    title: "Thread",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    archived: false,
  },
};

const promptClient = (overrides: Record<string, unknown> = {}) =>
  ({
    boundedProjectListPage: async () => ({ projects: [promptFixture.project] }),
    agentStatuses: async () => ({ windows: [promptFixture.status], wsl: [] }),
    settings: async () => ({ agentSettings: {}, followUpBehavior: "steer" }),
    boundedThreadListPage: async () => ({ page: { threads: [promptFixture.thread] } }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
    setPendingSteer: async () => undefined,
    sendThreadInput: async () => ({}),
    ...overrides,
  }) as unknown as RemoteDesktopClient;

const working = (value: { handleRemoteEvent: (event: unknown) => void }) =>
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "working" });

test("delivery precedence: body > settings > default steer; queue hits queueThreadFollowUp", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
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
    const { value } = router(client, home);
    working(value);
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
  const client = promptClient({
    setPendingSteer: async () => {
      steered = true;
    },
    callRemoteProcedure: async () => {
      throw new RemoteClientError("unknown procedure", 404, "unknown_procedure");
    },
  });
  const { value } = router(client);
  working(value);
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
  const client = promptClient({
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
    const { value } = router(client, home);
    working(value);
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

test("inbox mirrors host events: list, delivered on drop, cancelled on delete, delivery changed on patch", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
    clearPendingSteer: async (rawId: string) => calls.push({ name: "clear", payload: rawId }),
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "getThreadFollowUpQueue"
        ? { items: [{ id: "q1", prompt: "queued", stagedAt: 2 }], paused: false }
        : null;
    },
  });
  const { value } = router(client);
  const sessionID = "ses_thread-1";
  const list = async () =>
    (
      (await (
        await value.handle(new Request(`http://poracode.invalid/api/session/${sessionID}/inbox`))
      ).json()) as { data: { id: string; delivery: string }[] }
    ).data;

  expect(await list()).toMatchObject([{ id: "q1", delivery: "queue" }]);

  value.handleRemoteEvent({
    type: "thread-pending-steer",
    threadId: "thread-1",
    pending: { id: "s1", prompt: "steered", stagedAt: 3 },
  });
  expect(await list()).toMatchObject([
    { id: "s1", delivery: "steer" },
    { id: "q1", delivery: "queue" },
  ]);

  value.handleRemoteEvent({ type: "thread-pending-steer", threadId: "thread-1", pending: null });
  expect(await list()).toMatchObject([{ id: "q1" }]);

  const patchSteer = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/inbox/q1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delivery: "steer" }),
    }),
  );
  expect(patchSteer.status).toBe(204);
  expect(calls).toContainEqual({
    name: "steerQueuedThreadFollowUp",
    payload: { threadId: "thread-1", id: "q1" },
  });

  value.handleRemoteEvent({
    type: "thread-pending-steer",
    threadId: "thread-1",
    pending: { id: "s2", prompt: "move me", stagedAt: 4 },
  });
  const patchQueue = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/inbox/s2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delivery: "queue" }),
    }),
  );
  expect(patchQueue.status).toBe(204);
  expect(calls).toContainEqual({ name: "clear", payload: "thread-1" });
  expect(calls).toContainEqual({
    name: "queueThreadFollowUp",
    payload: { threadId: "thread-1", prompt: "move me", config: { model: "m1" } },
  });

  const del = await value.handle(
    new Request(`http://poracode.invalid/api/session/${sessionID}/inbox/q1`, {
      method: "DELETE",
    }),
  );
  expect(del.status).toBe(204);
  expect(calls).toContainEqual({
    name: "removeQueuedThreadFollowUp",
    payload: { threadId: "thread-1", id: "q1" },
  });
});

test("resumeQueue calls resumeThreadFollowUps only when paused", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "getThreadFollowUpQueue" ? { items: [], paused: true } : null;
    },
  });
  const { value } = router(client);
  expect(await value.resumeQueue("ses_thread-1")).toEqual({ resumed: true });
  expect(calls).toContainEqual({
    name: "resumeThreadFollowUps",
    payload: { threadId: "thread-1" },
  });
  expect(await value.resumeQueue("ses_thread-1")).toEqual({ resumed: false });
});

test("file: mention maps to a project-relative segment; outside and bad schemes refuse", async () => {
  const sent: unknown[] = [];
  const client = promptClient({
    sendThreadInput: async (input: unknown) => {
      sent.push(input);
      return {};
    },
  });
  const home = await mkdtemp(join(tmpdir(), "poracode-file-mention-"));
  const prev = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const { value } = router(client, home);
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
      files: [{ uri: "file:///C:/repo/src/notes.md", name: "notes.md" }],
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
      files: [{ uri: "file:///C:/other/secret.md", name: "secret.md" }],
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

const titleProject = remoteProjectSchema.parse({
  id: "project-1",
  name: "project",
  location: { kind: "windows", path: "C:/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
});
const titleStatus = agentStatusSchema.parse({
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
const titleStatusB = agentStatusSchema.parse({
  kind: "other",
  label: "Other",
  installed: true,
  authState: "authenticated",
  capabilities: {
    presentationMode: "gui",
    presentationModes: ["gui"],
    models: [{ id: "m2", label: "M2" }],
    modes: ["agent"],
  },
});
const startedThread = {
  id: "thread-new",
  projectId: "project-1",
  agentKind: "codex",
  presentationMode: "gui",
  config: { model: "m1" },
  title: "first prompt ever",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  archived: false,
};

const titleClient = (options: {
  describeHost?: unknown;
  settings?: unknown;
  title?: string;
  calls?: { name: string; payload: unknown }[];
  commands?: unknown[];
  titlesAfterStart?: string[];
  threadsAlways?: boolean;
}) => {
  const calls = options.calls ?? [];
  const titles = [...(options.titlesAfterStart ?? ["first prompt ever"])];
  let listed = 0;
  return {
    client: {
      boundedProjectListPage: async () => ({ projects: [titleProject] }),
      agentStatuses: async () => ({ windows: [titleStatus, titleStatusB], wsl: [] }),
      settings: async () => options.settings ?? { agentSettings: {} },
      describeHost: async () => options.describeHost ?? {},
      boundedThreadListPage: async () => {
        listed += 1;
        const visible = options.threadsAlways === true || listed > 2;
        return {
          page: {
            threads: visible
              ? [
                  {
                    ...startedThread,
                    title: (titles.length > 1 ? titles.shift()! : titles[0]) ?? "first prompt ever",
                  },
                ]
              : [],
          },
        };
      },
      threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
      startNewThread: async () => {
        calls.push({ name: "start", payload: null });
        return { threadId: "thread-new" };
      },
      sendThreadInput: async () => ({}),
      setPendingSteer: async () => undefined,
      sendThreadCommand: async (command: unknown) => {
        calls.push({ name: "command", payload: command });
      },
      callRemoteProcedure: async (name: string, payload: unknown) => {
        calls.push({ name, payload });
        return name === "generateTitle" ? { title: options.title ?? "Generated Title" } : null;
      },
      agentSlashCommands: async () => ({ commands: options.commands ?? [] }),
      threadPromptIndex: async () => ({
        prompts: [{ itemId: "p1", position: 0, text: "first prompt ever" }],
      }),
    } as unknown as RemoteDesktopClient,
    calls,
  };
};

const runPrompt = async (
  client: RemoteDesktopClient,
  sessionID = "ses_thread-new",
  body: Record<string, unknown> = { text: "first prompt ever" },
) => {
  const home = await mkdtemp(join(tmpdir(), "poracode-title-"));
  const prev = process.env.PORACODE_TUI_HOME;
  process.env.PORACODE_TUI_HOME = home;
  try {
    const { value } = router(client, home);
    const response = await value.handle(
      new Request(`http://poracode.invalid/api/session/${sessionID}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { value, response };
  } finally {
    if (prev === undefined) delete process.env.PORACODE_TUI_HOME;
    else process.env.PORACODE_TUI_HOME = prev;
    await rm(home, { recursive: true, force: true });
  }
};

test("auto-title renames a standalone thread after generation", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = titleClient({ calls });
  const { response } = await runPrompt(client);
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
  const { client } = titleClient({ calls, describeHost: { browserPanel: true } });
  const { response } = await runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls.some((call) => call.name === "generateTitle")).toBe(false);
});

test("a user rename during generation wins over auto-title", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = titleClient({
    calls,
    titlesAfterStart: ["first prompt ever", "User-chosen name"],
  });
  const { response } = await runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls.some((call) => call.name === "generateTitle")).toBe(true);
  expect(calls.some((call) => call.name === "command")).toBe(false);
});

test("disabled title generation skips auto-title", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const { client } = titleClient({
    calls,
    settings: { agentSettings: {}, titleGenProvider: "disabled" },
  });
  const { response } = await runPrompt(client);
  expect(response.status).toBe(200);
  expect(calls.some((call) => call.name === "generateTitle")).toBe(false);
});

test("a specific provider forwards its selection", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const selection = { model: "m2", effort: "high" };
  const { client } = titleClient({
    calls,
    settings: { agentSettings: {}, titleGenProvider: "other", titleGenSelection: selection },
  });
  const { response } = await runPrompt(client);
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
  const { client } = titleClient({ calls, threadsAlways: true });
  const { value } = router(client);
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
  const { client } = titleClient({
    calls,
    threadsAlways: true,
    commands: [{ id: "compact", description: "compact" }],
  });
  const { value } = router(client);
  const ok = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-new/compact", { method: "POST" }),
  );
  expect(ok.status).toBe(200);
  expect(await ok.json()).toMatchObject({ data: { type: "compaction" } });

  const calls2: { name: string; payload: unknown }[] = [];
  const { client: client2 } = titleClient({ calls: calls2, threadsAlways: true, commands: [] });
  const { value: value2 } = router(client2);
  const no = await value2.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-new/compact", { method: "POST" }),
  );
  expect(no.status).toBe(400);
  expect(await no.json()).toMatchObject({ error: { code: "unsupported" } });
});

test("goal state seeds, updates live, and clears", async () => {
  const client = promptClient({
    latestThreadGoalItem: async () => ({
      id: "g1",
      type: "goal",
      payload: {
        action: "set",
        objective: "Ship chunk 6",
        status: "active",
        availableActions: ["edit", "pause", "clear"],
        tokensUsed: 12,
        tokenBudget: 100,
      },
    }),
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
  // Message route seeds the goal.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  expect(await value.goalState("ses_thread-1")).toMatchObject({
    objective: "Ship chunk 6",
    status: "active",
  });
  expect(value.goalLine("ses_thread-1")).toContain("Ship chunk 6");

  // Live updated event.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "item.updated",
      itemType: "goal",
      itemId: "g1",
      payload: {
        action: "updated",
        objective: "Ship chunk 6",
        status: "paused",
        availableActions: ["resume", "clear"],
        tokensUsed: 30,
      },
    },
  });
  expect(await value.goalState("ses_thread-1")).toMatchObject({ status: "paused", tokensUsed: 30 });

  // Cleared removes it.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "item.completed",
      itemType: "goal",
      itemId: "g1",
      payload: { action: "cleared", objective: "Ship chunk 6" },
    },
  });
  expect(await value.goalState("ses_thread-1")).toBeUndefined();
});

test("controlGoal validates availability and edit bounds", async () => {
  const calls: unknown[] = [];
  const client = promptClient({
    latestThreadGoalItem: async () => ({
      id: "g1",
      type: "goal",
      payload: {
        action: "set",
        objective: "x",
        status: "active",
        availableActions: ["edit", "clear"],
      },
    }),
    controlThreadGoal: async (payload: unknown) => calls.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));

  expect(await value.controlGoal("ses_thread-1", { action: "pause" })).toMatchObject({
    error: "The current goal can't be pause right now.",
  });
  expect(calls).toHaveLength(0);

  expect(await value.controlGoal("ses_thread-1", { action: "edit", objective: "" })).toMatchObject({
    error: "Goal objective must be 1-4000 characters.",
  });
  expect(
    await value.controlGoal("ses_thread-1", { action: "edit", objective: "x".repeat(4001) }),
  ).toMatchObject({
    error: "Goal objective must be 1-4000 characters.",
  });
  expect(calls).toHaveLength(0);

  expect(await value.controlGoal("ses_thread-1", { action: "edit", objective: "new" })).toEqual({
    ok: true,
  });
  expect(calls).toContainEqual({ threadId: "thread-1", action: "edit", objective: "new" });
  expect(await value.controlGoal("ses_thread-1", { action: "clear" })).toEqual({ ok: true });
  expect(calls).toContainEqual({ threadId: "thread-1", action: "clear" });
});

test("goalSupported gates on the provider slash command; truncated index falls back", async () => {
  const { client } = titleClient({ threadsAlways: true, commands: [{ id: "goal" }] });
  const { value } = router(client);
  expect(await value.goalSupported("ses_thread-new")).toBe(true);
  const { client: client2 } = titleClient({ threadsAlways: true, commands: [] });
  const { value: value2 } = router(client2);
  expect(await value2.goalSupported("ses_thread-new")).toBe(false);
});

test("send preserves host config fields; model change drops selectionBinding; new threads get MCP defaults", async () => {
  const sent: unknown[] = [];
  const steered: unknown[] = [];
  const started: unknown[] = [];
  const thread = {
    ...promptFixture.thread,
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
    ...(JSON.parse(JSON.stringify(promptFixture.status)) as Record<string, unknown>),
    capabilities: {
      ...(JSON.parse(JSON.stringify(promptFixture.status.capabilities)) as Record<string, unknown>),
      models: [
        { id: "m1", label: "M1" },
        { id: "m2", label: "M2" },
      ],
    },
  });
  const client = promptClient({
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
  const { value } = router(client);
  working(value);
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
  const client = promptClient({
    settings: async () => ({
      agentSettings: {},
      enabledMcpServers: { crossagents: false },
      disabledBuiltInMcpServers: {},
    }),
    startNewThread: async (payload: unknown) => started.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
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

test("live subagent child items route to the virtual subsession, nested to the root, replays dedup", async () => {
  const client = promptClient({
    sendThreadInput: async () => ({}),
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
  // Register the thread context so runtime events translate.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "go" }),
    }),
  );
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  const queue: { type: string; data: Record<string, unknown> }[] = [];
  const readEvent = async () => {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      if (queue.length > 0) return queue.shift();
      const chunk = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
      ]);
      if (!chunk || chunk.done) break;
      for (const line of decoder.decode(chunk.value ?? []).matchAll(/^data: (.+)$/gmu))
        queue.push(JSON.parse(line[1]!));
    }
    return queue.shift() ?? null;
  };
  const emit = (event: Record<string, unknown>) =>
    value.handleRemoteEvent({
      type: "thread-runtime-event",
      threadId: "thread-1",
      event: { threadId: "thread-1", ...event },
    });

  await readEvent(); // server.connected

  emit({
    type: "item.started",
    itemId: "task-1",
    itemType: "task",
    payload: {},
  });
  emit({
    type: "item.started",
    itemId: "child-1",
    parentItemId: "task-1",
    itemType: "assistant_message",
    payload: {},
  });
  emit({
    type: "content.delta",
    itemId: "child-1",
    itemType: "assistant_message",
    stream: "assistant_text",
    delta: "child text",
  });
  emit({
    type: "item.started",
    itemId: "grandchild-1",
    parentItemId: "child-1",
    itemType: "reasoning",
    payload: {},
  });
  emit({ type: "item.completed", itemId: "child-1", itemType: "assistant_message", payload: {} });
  // Replay of a known item.started must not duplicate parts.
  emit({
    type: "item.started",
    itemId: "child-1",
    parentItemId: "task-1",
    itemType: "assistant_message",
    payload: {},
  });

  const seen: { type: string; sessionID?: string }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const next = await readEvent();
    if (!next) break;
    seen.push({ type: next.type, sessionID: String(next.data.sessionID ?? "") });
  }
  const sub = "ses_thread-1__task-1";
  // Child text routes to the subsession; the nested reasoning item joins it.
  expect(seen).toContainEqual({ type: "session.text.started", sessionID: sub });
  expect(seen).toContainEqual({ type: "session.reasoning.started", sessionID: sub });
  // Exactly one text part despite the replayed item.started.
  expect(
    seen.filter((entry) => entry.type === "session.text.started" && entry.sessionID === sub),
  ).toHaveLength(1);
  // Child item parts never leak into the parent session — only the task item's
  // own part belongs there.
  expect(
    seen.filter(
      (entry) =>
        entry.sessionID === "ses_thread-1" &&
        ["session.text.started", "session.reasoning.started", "session.text.delta"].includes(
          entry.type,
        ),
    ),
  ).toEqual([]);
});

test("subagent subscription: load running subagent subscribes, completed does not, completion unsubscribes", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const runningItem = {
    id: "task-1",
    type: "task",
    state: "started",
    streams: {},
    payload: {},
  };
  const client = promptClient({
    threadRuntimeItemsPage: async () => ({ items: [runningItem], nextCursor: null }),
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return null;
    },
  });
  const { value } = router(client);
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/message"),
  );
  expect(calls).toContainEqual({
    name: "subagentSubscribe",
    payload: { threadId: "thread-1", parentItemId: "task-1" },
  });

  // A second load does not resubscribe.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/message"),
  );
  expect(calls.filter((call) => call.name === "subagentSubscribe")).toHaveLength(1);

  // Completion unsubscribes.
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "item.completed", itemId: "task-1" },
  });
  expect(calls).toContainEqual({
    name: "subagentUnsubscribe",
    payload: { threadId: "thread-1", parentItemId: "task-1" },
  });
});

test("a completed subagent does not subscribe on load", async () => {
  const calls: { name: string }[] = [];
  const client = promptClient({
    threadRuntimeItemsPage: async () => ({
      items: [{ id: "task-1", type: "task", state: "completed", streams: {}, payload: {} }],
      nextCursor: null,
    }),
    callRemoteProcedure: async (name: string) => {
      calls.push({ name });
      return null;
    },
  });
  const { value } = router(client);
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/message"),
  );
  expect(calls.some((call) => call.name === "subagentSubscribe")).toBe(false);
});

test("worktree list/create map to the git procedures", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
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
  const { value } = router(client);
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
  const client = promptClient({
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees"
        ? { worktrees: [{ path: "D:\\wt-feat", branch: "feat", commit: "def", isMain: false }] }
        : null,
  });
  const { value } = router(client);
  working(value);
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
  const client = promptClient({
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
  const { value } = router(client);
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
  const client = promptClient({
    startNewThread: async (payload: unknown) => started.push(payload),
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees"
        ? { worktrees: [{ path: "D:\\wt-feat", branch: "feat", commit: "def", isMain: false }] }
        : name === "gitAddWorktree"
          ? { path: "D:\\wt-feat" }
          : null,
  });
  const { value } = router(client);
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
  const client = promptClient({ sendThreadInput: async () => ({}) });
  const { value } = router(client);
  const wait = () =>
    value.handle(
      new Request("http://poracode.invalid/api/session/ses_thread-1/wait", { method: "POST" }),
    );
  expect((await wait()).status).toBe(204);
  working(value);
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

test("revert.stage anchors on the previous turn, skipping hidden items, and maps outcomes", async () => {
  const reverts: { threadId: string; checkpointItemId: string; operationKey: string }[] = [];
  const items = [
    { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
    {
      id: "t1",
      type: "tool_call",
      state: "completed",
      streams: {},
      payload: { name: "read", status: "completed" },
    },
    { id: "p1", type: "plan", state: "completed", streams: {}, payload: {} },
    { id: "e1", type: "error", state: "completed", streams: {}, payload: {} },
    {
      id: "n1",
      type: "assistant_message",
      state: "completed",
      streams: {},
      payload: {},
      parentItemId: "t1",
    },
    { id: "u2", type: "user_message", state: "completed", streams: {}, payload: {} },
  ];
  let outcome: Record<string, unknown> = { outcome: "completed" };
  const client = promptClient({
    threadRuntimeItemsPage: async () => ({ items, nextCursor: null }),
    checkpointRevert: async (input: never) => {
      reverts.push(input);
      return outcome;
    },
  });
  const { value } = router(client);
  const stage = (messageID: string, session = "ses_thread-1") =>
    value.handle(
      new Request(`http://poracode.invalid/api/session/${session}/revert/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageID }),
      }),
    );

  const staged = await stage("msg_u2");
  expect(staged.status).toBe(200);
  expect(await staged.json()).toEqual({ data: { messageID: "msg_u2" } });
  expect(reverts.at(-1)).toMatchObject({ threadId: "thread-1", checkpointItemId: "t1" });
  expect(reverts.at(-1)!.operationKey).toMatch(/^ckpt-revert\./u);

  // The first user message has no earlier turn to revert to.
  expect((await stage("msg_u1")).status).toBe(400);
  expect(reverts).toHaveLength(1);

  // Outcome mapping: ambiguous → 409, failed → 400.
  outcome = { outcome: "ambiguous" };
  expect((await stage("msg_u2")).status).toBe(409);
  outcome = { outcome: "failed" };
  expect((await stage("msg_u2")).status).toBe(400);

  // Virtual subsessions are read-only.
  expect((await stage("msg_u2", "ses_thread-1__task-1")).status).toBe(400);

  // commit is a no-op success; redo is impossible.
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/revert/commit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(204);
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/session/ses_thread-1/revert/clear", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(204);
});

test("runtime.truncated resyncs live sessions like a thread reset", async () => {
  const client = promptClient({ sendThreadInput: async () => ({}) });
  const { value } = router(client);
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  await reader.read(); // server.connected
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "runtime.truncated",
      threadId: "thread-1",
      itemId: "a1",
      removedCompletedTurnAnchors: [],
    },
  });
  // The resync closes the SSE stream so the TUI refetches fresh history.
  const next = await reader.read();
  expect(next.done).toBe(true);
});

test("model change to another provider stages a switch; the next prompt relaunches in place", async () => {
  const starts: unknown[] = [];
  const sends: unknown[] = [];
  const statusB = {
    ...JSON.parse(JSON.stringify(promptFixture.status)),
    kind: "agent-b",
    label: "Agent B",
    capabilities: {
      ...JSON.parse(JSON.stringify(promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
    },
  };
  const client = promptClient({
    agentStatuses: async () => ({
      windows: [promptFixture.status, statusB],
      wsl: [],
    }),
    sendThreadInput: async (payload: unknown) => {
      sends.push(payload);
      return {};
    },
    startThread: async (payload: unknown) => starts.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
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
    ...promptFixture.thread,
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
    ...JSON.parse(JSON.stringify(promptFixture.status)),
    kind: "agent-b",
    capabilities: {
      ...JSON.parse(JSON.stringify(promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
      mcpScope: { gui: "always" },
    },
  };
  const client = promptClient({
    agentStatuses: async () => ({ windows: [promptFixture.status, statusB], wsl: [] }),
    boundedThreadListPage: async () => ({ page: { threads: [thread] } }),
    startThread: async (payload: unknown) => starts.push(payload),
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
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
    ...JSON.parse(JSON.stringify(promptFixture.status)),
    kind: "agent-b",
    capabilities: {
      ...JSON.parse(JSON.stringify(promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
    },
  };
  const client = promptClient({
    agentStatuses: async () => ({ windows: [promptFixture.status, statusB], wsl: [] }),
    startThread: async (payload: unknown) => {
      starts.push(payload);
      const err = new Error("provider switch conflict") as Error & { status: number };
      err.status = 409;
      throw err;
    },
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
  working(value);
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
  const thread = { ...promptFixture.thread, sessionRef: { id: "sess-1" } };
  const statusB = {
    ...JSON.parse(JSON.stringify(promptFixture.status)),
    kind: "agent-b",
    capabilities: {
      ...JSON.parse(JSON.stringify(promptFixture.status.capabilities)),
      models: [{ id: "m2", label: "M2" }],
    },
  };
  const client = promptClient({
    agentStatuses: async () => ({ windows: [promptFixture.status, statusB], wsl: [] }),
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
  const { value } = router(client);
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

test("background tasks surface as shells: seed, live replace, list/get/output/remove", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const tasks = [
    {
      taskId: "task-1",
      kind: "command",
      description: "npm run watch",
      startedAt: 1700000000000,
      progress: "line one\nline two\n",
    },
    {
      taskId: "task-2",
      kind: "other",
      description: "watcher",
      startedAt: 1700000000001,
      stopAction: { id: "task.stop", payload: { taskId: "task-2" } },
    },
  ];
  const client = promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      if (name === "readThreadBackgroundTasks") return { tasks };
      return null;
    },
  });
  const { value } = router(client);
  // Seed on session load.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  expect(calls).toContainEqual({
    name: "readThreadBackgroundTasks",
    payload: { threadId: "thread-1" },
  });

  const listed = await value.handle(new Request("http://poracode.invalid/api/shell"));
  expect(listed.status).toBe(200);
  const listBody = (await listed.json()) as {
    data: { id: string; status: string; command: string }[];
  };
  expect(listBody.data).toHaveLength(2);
  expect(listBody.data[0]).toMatchObject({
    id: "sh_bgt_thread-1__task-1",
    status: "running",
    command: "npm run watch",
  });

  const got = await value.handle(
    new Request("http://poracode.invalid/api/shell/sh_bgt_thread-1__task-1"),
  );
  expect(got.status).toBe(200);

  // Output pages byte-wise over the last progress snapshot.
  const page1 = await value.handle(
    new Request(
      "http://poracode.invalid/api/shell/sh_bgt_thread-1__task-1/output?cursor=0&limit=5",
    ),
  );
  const first = (await page1.json()) as {
    data: { output: string; cursor: number; truncated: boolean };
  };
  expect(first.data).toMatchObject({ output: "line ", cursor: 5, truncated: true });
  const page2 = await value.handle(
    new Request(
      `http://poracode.invalid/api/shell/sh_bgt_thread-1__task-1/output?cursor=${first.data.cursor}&limit=100`,
    ),
  );
  const second = (await page2.json()) as { data: { output: string; truncated: boolean } };
  expect(second.data).toMatchObject({ output: "one\nline two\n", truncated: false });

  // Live replace emits created for new ids and deleted for vanished ones.
  const stream = await value.handle(new Request("http://poracode.invalid/api/event"));
  const reader = stream.body!.getReader();
  await reader.read(); // server.connected
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "background_tasks.changed",
      threadId: "thread-1",
      tasks: [
        {
          taskId: "task-3",
          kind: "command",
          description: "new watcher",
          startedAt: 1700000000002,
        },
      ],
    },
  });
  const events: { type: string }[] = [];
  const decoder = new TextDecoder();
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline && events.length < 3) {
    const chunk = await reader.read();
    if (chunk.done) break;
    for (const line of decoder.decode(chunk.value).matchAll(/^data: (.+)$/gmu))
      events.push(JSON.parse(line[1]!));
  }
  const types = events.map((entry) => entry.type);
  expect(types).toContain("shell.created");
  expect(types).toContain("shell.deleted");

  // remove: stopAction → invokeThreadSessionAction; absent → 409.
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/shell/sh_bgt_thread-1__task-3", {
          method: "DELETE",
        }),
      )
    ).status,
  ).toBe(409);
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: {
      type: "background_tasks.changed",
      threadId: "thread-1",
      tasks,
    },
  });
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/shell/sh_bgt_thread-1__task-2", {
          method: "DELETE",
        }),
      )
    ).status,
  ).toBe(204);
  expect(calls).toContainEqual({
    name: "invokeThreadSessionAction",
    payload: { threadId: "thread-1", actionId: "task.stop", payload: { taskId: "task-2" } },
  });

  // create is unsupported.
  expect(
    (
      await value.handle(
        new Request("http://poracode.invalid/api/shell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: "ls" }),
        }),
      )
    ).status,
  ).toBe(501);
});

test("session.interrupt is a no-op on an idle thread", async () => {
  const interrupts: string[] = [];
  const client = promptClient({
    interruptThread: async (id: string) => {
      interrupts.push(id);
    },
  });
  const { value } = router(client);
  working(value); // live state says working, no translator run — interrupt still fires
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
  const client = promptClient();
  const { value } = router(client);
  // The last thread-state says working but the turn already completed — the
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
  const client = promptClient();
  const { value } = router(client);
  working(value);
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

test("generated client request table: supported ops answer the declared contract", async () => {
  // The generated client, not protocol/openapi.json, is the real contract —
  // a missing route hangs or 404s silently, a wrong status or missing body
  // makes the client throw (the /undo interrupt bug).
  const source = await Bun.file(
    fileURLToPath(
      new URL("../../opencode/packages/client/src/promise/generated/client.ts", import.meta.url),
    ),
  ).text();
  const operations = [
    ...source.matchAll(
      /method:\s*"([A-Z]+)",\s*path:\s*`([^`]+)`,[\s\S]{0,400}?successStatus:\s*(\d+),[\s\S]{0,200}?empty:\s*(true|false)/gu,
    ),
  ].map((match) => ({
    method: match[1]!,
    path: match[2]!,
    status: Number(match[3]),
    empty: match[4] === "true",
  }));
  expect(operations.length).toBeGreaterThan(100);
  // Operations the adapter intentionally does not implement (host-level or
  // not-yet-claimed surfaces).
  const unsupported = new Set([
    "POST /api/pair",
    "GET /auth/connect/${encodeURIComponent(input.code)}",
    "GET /api/agent/${encodeURIComponent(input.agentID)}",
    "GET /api/plugin",
    "POST /api/plugin/check",
    "POST /api/plugin/update",
    "GET /api/experimental/session/stats",
    "POST /api/experimental/session/import",
    "POST /api/experimental/session/${encodeURIComponent(input.sessionID)}/skill",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/synthetic",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/shell",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/generate",
    "GET /api/session/${encodeURIComponent(input.sessionID)}/context",
    "GET /api/session/${encodeURIComponent(input.sessionID)}/diff",
    "GET /api/experimental/session/${encodeURIComponent(input.sessionID)}/log",
    "GET /api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries",
    "PUT /api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries/${encodeURIComponent(input.key)}",
    "DELETE /api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries/${encodeURIComponent(input.key)}",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/form",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/permission",
    "POST /api/experimental/fs/write",
    "GET /api/pty",
    "POST /api/pty",
    "GET /api/pty/${encodeURIComponent(input.ptyID)}",
    "PUT /api/pty/${encodeURIComponent(input.ptyID)}",
    "DELETE /api/pty/${encodeURIComponent(input.ptyID)}",
    "POST /api/pty/${encodeURIComponent(input.ptyID)}/connect-token",
    "GET /api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal/read",
    "POST /api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal",
    "POST /api/experimental/persistent-pty/shutdown",
    "POST /api/experimental/persistent-pty/handoff",
    "GET /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}",
    "PUT /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}",
    "GET /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/snapshot",
    "DELETE /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}",
    "POST /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/connect-token",
    "GET /api/reference",
    "DELETE /api/worktree",
    "GET /api/debug/location",
    "DELETE /api/debug/location",
    "GET /api/websearch/provider",
    "POST /api/websearch",
    "GET /api/config/shell",
    "PATCH /api/experimental/config",
    "GET /api/provider/${encodeURIComponent(input.providerID)}",
    "GET /api/integration/${encodeURIComponent(input.integrationID)}",
    "POST /api/experimental/integration/wellknown",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/key",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/external",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth",
    "GET /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}/complete",
    "DELETE /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/command",
    "GET /api/integration/${encodeURIComponent(input.integrationID)}/connect/command/${encodeURIComponent(input.attemptID)}",
    "DELETE /api/integration/${encodeURIComponent(input.integrationID)}/connect/command/${encodeURIComponent(input.attemptID)}",
    "PUT /api/experimental/mcp/${encodeURIComponent(input.server)}",
    "DELETE /api/experimental/mcp/${encodeURIComponent(input.server)}",
    "GET /api/mcp/resource",
    "GET /api/credential",
    "POST /api/credential",
    "PATCH /api/credential/${encodeURIComponent(input.credentialID)}",
    "POST /api/credential/${encodeURIComponent(input.credentialID)}/activate",
    "DELETE /api/credential/${encodeURIComponent(input.credentialID)}",
    "PATCH /api/project/${encodeURIComponent(input.projectID)}",
    "GET /api/permission/request",
    "GET /api/permission/saved",
    "PATCH /api/permission/saved/${encodeURIComponent(input.id)}",
    "DELETE /api/permission/saved/${encodeURIComponent(input.id)}",
    "POST /api/rpc/${encodeURIComponent(input.rpcID)}/${encodeURIComponent(input.method)}",
    "POST /api/experimental/voice/session",
    "POST /api/experimental/generate",
  ]);
  // Supported but unassertable here — the happy path needs state the fixtures
  // cannot provide (reason per entry, keep this list short).
  const fixtureBound = new Map<string, string>([
    ["POST /api/session/${encodeURIComponent(input.sessionID)}/fork", "needs the host fork path"],
    ["POST /api/session/${encodeURIComponent(input.sessionID)}/move", "needs a listed worktree"],
    ["POST /api/worktree", "needs a gitAddWorktree result"],
    ["POST /api/vcs/init", "intentionally unsupported"],
    ["GET /api/vcs", "needs a git snapshot fixture"],
    ["GET /api/vcs/base", "needs a git snapshot fixture"],
    ["GET /api/vcs/status", "needs a git snapshot fixture"],
    ["GET /api/vcs/branch", "needs a git snapshot fixture"],
    ["GET /api/vcs/diff", "needs a git snapshot fixture"],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/revert/stage",
      "needs a real user message + checkpoint",
    ],
    [
      "PATCH /api/session/${encodeURIComponent(input.sessionID)}/inbox/${encodeURIComponent(input.inboxID)}",
      "needs a live steer/queue entry",
    ],
    [
      "GET /api/session/${encodeURIComponent(input.sessionID)}/message/${encodeURIComponent(input.messageID)}",
      "needs a mapped persisted message",
    ],
    [
      "GET /api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}",
      "needs a live pending form",
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}/reply",
      "needs a live pending form",
    ],
    [
      "DELETE /api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}",
      "needs a live pending form",
    ],
    [
      "GET /api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}",
      "needs a live pending permission",
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply",
      "needs a live pending permission",
    ],
    ["GET /api/shell/${encodeURIComponent(input.id)}", "needs a seeded background task"],
    ["GET /api/shell/${encodeURIComponent(input.id)}/output", "needs a seeded background task"],
    ["DELETE /api/shell/${encodeURIComponent(input.id)}", "needs a seeded background task"],
    ["POST /api/shell", "intentionally 501 until user shells land"],
    ["GET /api/fs/read/${encodePath(input.path)}", "needs a readable path"],
    ["GET /api/fs/list", "needs a real directory on disk"],
    ["GET /api/fs/find", "needs a real directory on disk"],
  ]);
  const bodies = new Map<string, string>([
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/model",
      JSON.stringify({ model: { providerID: "codex", id: "m1" } }),
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/agent",
      JSON.stringify({ agent: "build" }),
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/command",
      JSON.stringify({ name: "compact", text: "" }),
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/prompt",
      JSON.stringify({ text: "hi" }),
    ],
  ]);
  const client = promptClient({
    sendThreadInput: async () => ({}),
    sendThreadCommand: async () => ({}),
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees" ? { worktrees: [] } : null,
    agentSlashCommands: async () => ({ commands: [{ id: "compact" }] }),
  });
  const { value } = router(client);
  // Top-level body shape per startup GET the vendored UI reads — "map" = a
  // server-keyed record, "array" = a JSON array, a list = required object keys.
  const shapes = new Map<string, "array" | "map" | string[]>([
    ["GET /api/mcp", "map"],
    ["GET /api/session", ["data", "cursor"]],
    ["GET /api/provider", ["data"]],
    ["GET /api/integration", ["data"]],
    ["GET /api/agent", ["data"]],
    ["GET /api/model", "map"],
    ["GET /api/config", "array"],
    ["GET /api/command", ["data"]],
    ["GET /api/skill", ["data"]],
    ["GET /api/project", "array"],
    ["GET /api/vcs", "map"],
    ["GET /api/location", "map"],
  ]);
  const failures: string[] = [];
  for (const serialized of new Set(operations.map((entry) => JSON.stringify(entry)))) {
    const op = JSON.parse(serialized) as {
      method: string;
      path: string;
      status: number;
      empty: boolean;
    };
    const key = `${op.method} ${op.path}`;
    if (unsupported.has(key) || fixtureBound.has(key)) continue;
    const path = op.path.replaceAll(
      /\$\{encodeURIComponent\(input\.(\w+)\)\}|\$\{encodePath\(input\.(\w+)\)\}/gu,
      (_whole, encoded: string | undefined, plain: string | undefined) =>
        (encoded ?? plain) === "sessionID" ? "ses_thread-1" : "x",
    );
    const body =
      bodies.get(key) ?? (op.method === "GET" || op.method === "DELETE" ? undefined : "{}");
    const response = await value.handle(
      new Request(`http://poracode.invalid${path}`, {
        method: op.method,
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    if (response.status !== op.status) {
      failures.push(`${key} -> ${response.status} (expected ${op.status})`);
      continue;
    }
    if (path === "/api/event") continue; // SSE stream — a 200 is the route answering.
    const text = await response.text();
    if (op.empty && text !== "") failures.push(`${key} -> expected an empty body`);
    if (!op.empty && text === "") failures.push(`${key} -> expected a JSON body`);
    // Startup GETs the vendored UI reads must keep their top-level JSON shape —
    // a list-vs-map mismatch crashes the client at boot (the /api/mcp bug).
    const shape = shapes.get(key);
    if (!op.empty && text !== "" && shape) {
      const parsed = JSON.parse(text) as unknown;
      if (shape === "array" && !Array.isArray(parsed))
        failures.push(`${key} -> expected an array body`);
      if (
        shape === "map" &&
        (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      )
        failures.push(`${key} -> expected a server-keyed map body`);
      if (Array.isArray(shape)) {
        const keys = Object.keys((parsed ?? {}) as Record<string, unknown>);
        for (const required of shape)
          if (!keys.includes(required))
            failures.push(`${key} -> missing top-level key ${required}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

test("file checkpoints: created before dispatch, reconciled to anchors", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
    sendThreadInput: async () => ({}),
    threadRuntimeItemsPage: async () => ({
      items: [
        { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
        { id: "anchor-1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
      ],
      nextCursor: null,
    }),
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "listFileCheckpoints"
        ? { checkpoints: [{ checkpointItemId: "u1" }], turns: [] }
        : null;
    },
  });
  const { value } = router(client);
  // A normal send creates the checkpoint BEFORE the prompt dispatch.
  const order: string[] = [];
  const orderClient = promptClient({
    sendThreadInput: async () => {
      order.push("send");
      return {};
    },
    callRemoteProcedure: async (name: string) => {
      order.push(name);
      return null;
    },
  });
  const { value: ordered } = router(orderClient);
  await ordered.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    }),
  );
  expect(order).toEqual(["createFileCheckpoint", "send"]);

  // Steer/queue deliveries don't create checkpoints — they belong to the turn.
  order.length = 0;
  working(ordered);
  await ordered.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "steer me", delivery: "steer" }),
    }),
  );
  expect(order).not.toContain("createFileCheckpoint");

  // turn.completed on this router reconciles the anchor to its base.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "base" }),
    }),
  );
  value.handleRemoteEvent({
    type: "thread-runtime-events",
    threadId: "thread-1",
    events: [
      { type: "turn.completed", threadId: "thread-1", turnId: "turn-1", state: "completed" },
    ],
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const finalize = calls.filter((call) => call.name === "finalizeFileCheckpoint");
  expect(finalize).toHaveLength(1);
  expect(finalize[0]!.payload).toMatchObject({
    threadId: "thread-1",
    checkpointItemId: "anchor-1",
    baseCheckpointItemId: "u1",
  });
});

test("session load reconciles checkpoints for turns finished while closed", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
    threadRuntimeItemsPage: async () => ({
      items: [
        { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
        { id: "anchor-1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
      ],
      nextCursor: null,
    }),
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "listFileCheckpoints"
        ? { checkpoints: [{ checkpointItemId: "u1" }], turns: [] }
        : null;
    },
  });
  const { value } = router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls).toContainEqual({
    name: "finalizeFileCheckpoint",
    payload: expect.objectContaining({
      threadId: "thread-1",
      checkpointItemId: "anchor-1",
      baseCheckpointItemId: "u1",
    }),
  });
});

test("no finalize without a base checkpoint or a matching anchor", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
    threadRuntimeItemsPage: async () => ({
      items: [
        { id: "u1", type: "user_message", state: "completed", streams: {}, payload: {} },
        { id: "anchor-1", type: "assistant_message", state: "completed", streams: {}, payload: {} },
      ],
      nextCursor: null,
    }),
    threadCompletedTurns: async () => [{ turnId: "turn-1", anchorItemId: "anchor-1" }],
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      // No checkpoint captured for the base.
      return name === "listFileCheckpoints" ? { checkpoints: [], turns: [] } : null;
    },
  });
  const { value } = router(client);
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1/message"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(calls.some((call) => call.name === "finalizeFileCheckpoint")).toBe(false);
});

test("a checkpoint failure never blocks the prompt", async () => {
  const client = promptClient({
    sendThreadInput: async () => ({}),
    callRemoteProcedure: async (name: string) => {
      if (name === "createFileCheckpoint") throw new Error("checkpoint store down");
      return null;
    },
  });
  const { value } = router(client);
  const response = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    }),
  );
  expect(response.status).toBe(200);
});

test("session.shell runs a host dev shell and stashes output for the next prompt", async () => {
  const shells: string[] = [];
  const writes: string[] = [];
  const watches = new Map<string, (data: string) => void>();
  let sent: { prompt: string; segments: unknown } | undefined;
  const client = promptClient({
    startShell: async (input: { shellId: string }) => {
      shells.push(input.shellId);
    },
    writeTerminal: async (input: { threadId: string; data: string }) => {
      writes.push(input.data);
    },
    closeShell: async () => {},
    sendThreadInput: async (input: { prompt: string; segments?: unknown }) => {
      sent = { prompt: input.prompt, segments: input.segments };
      return {};
    },
  });
  const { value } = router(client, bootstrap.home, () => undefined, bootstrap.directory, {
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
      body: JSON.stringify({ command: "ls -la" }),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  const shellId = shells[0]!;
  expect(writes).toEqual(["ls -la\r", "exit\r"]);
  // Feed terminal-output frames for the shell, then its exit event.
  watches.get(shellId)?.("file1\nfile2\n");
  watches.get(shellId)?.("done\n");
  value.handleRemoteEvent({ type: "thread-exited", threadId: shellId });
  const response = await pending;
  expect(response.status).toBe(204);

  // The next real prompt carries the stashed output once.
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "continue" }),
    }),
  );
  expect(sent!.prompt).toContain("Shell output the user ran before this message:");
  expect(sent!.prompt).toContain("$ ls -la");
  expect(sent!.prompt).toContain("done");
  sent = undefined;
  await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "again" }),
    }),
  );
  expect(sent!.prompt).not.toContain("Shell output");
});

test("session.shell refuses while launching and on virtual subsessions", async () => {
  const client = promptClient({ startShell: async () => {} });
  const { value } = router(client);
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "launching" });
  const busy = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "ls" }),
    }),
  );
  expect(busy.status).toBe(409);
  const missing = await value.handle(
    new Request("http://poracode.invalid/api/session/ses_thread-1__task-1/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command: "ls" }),
    }),
  );
  expect(missing.status).toBe(404);
});

test("mcp list reports the built-in toggles; disabled-by-host omitted", async () => {
  const { value } = router(
    promptClient({
      settings: async () => ({ disabledBuiltInMcpServers: ["chrome"] }),
    }),
  );
  const response = await value.handle(new Request("http://poracode.invalid/api/mcp"));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(Object.keys(data).sort()).toEqual(["browser", "crossagents"]);
  expect(data.browser.status).toBe("connected");
  // A pending per-session toggle flips the reported status for that server.
  await value.handle(new Request("http://poracode.invalid/api/session/ses_thread-1"));
  await value.handle(
    new Request("http://poracode.invalid/api/experimental/mcp/browser/disconnect", {
      method: "POST",
    }),
  );
  const toggled = await value.handle(new Request("http://poracode.invalid/api/mcp"));
  expect((await toggled.json()).browser.status).toBe("disabled");
});

test("mcp connect/disconnect stages a per-session toggle applied at launch", async () => {
  const configCalls: { threadId?: string; config: Record<string, unknown> }[] = [];
  const client = promptClient({
    sendThreadInput: async (input: { threadId: string; config: Record<string, unknown> }) => {
      configCalls.push(input);
      return {};
    },
  });
  const { value } = router(client);
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
  const client = promptClient({ sendThreadInput: async () => ({}) });
  const { value } = router(client);
  working(value);
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
  const client = promptClient({
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
  const { value } = router(client);
  const list = await value.handle(new Request("http://poracode.invalid/api/skill"));
  expect(list.status).toBe(200);
  const data = (await list.json()).data;
  expect(data[0]).toMatchObject({ id: "project:agent-md-refactor", name: "agent-md-refactor" });

  let captured: { segments?: { kind: string; name?: string }[] } | undefined;
  const capturedClient = promptClient({
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
  const { value: withSkill } = router(capturedClient);
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

test("sessionActions maps host actions and invokeSessionAction sends the payload", async () => {
  const calls: { name: string; payload: unknown }[] = [];
  const client = promptClient({
    callRemoteProcedure: async (name: string, payload: unknown) => {
      calls.push({ name, payload });
      return name === "listThreadSessionActions"
        ? { actions: [{ id: "restart" }, { id: "profile" }] }
        : { ok: true, ran: true };
    },
  });
  const { value } = router(client);
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
  const client = promptClient({
    callRemoteProcedure: async () => null,
  });
  const { value } = router(client);
  expect(await value.sessionActions("ses_thread-1")).toEqual([]);
  expect(await value.sessionActions("ses_thread-1__task-1")).toEqual([]);
  await expect(value.invokeSessionAction("ses_thread-1__task-1", "x")).rejects.toThrow("read-only");
});

test("session list cursor round-trips across two host pages", async () => {
  const pages = [
    {
      threads: [
        {
          id: "t-new",
          title: "new",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "2024-01-02T00:00:00Z",
          updatedAt: "2024-01-02T00:00:00Z",
        },
      ],
      nextCursor: "host-c1",
    },
    {
      threads: [
        {
          id: "t-old",
          title: "old",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    },
  ];
  let calls = 0;
  const cursors: (string | undefined)[] = [];
  const client = promptClient({
    boundedThreadListPage: async (options: { cursor?: string }) => {
      calls += 1;
      cursors.push(options.cursor);
      return { page: pages[calls - 1]!, reads: { page: calls - 1 } };
    },
    agentStatuses: async () => ({ windows: [], wsl: [] }),
  });
  const { value } = router(client);
  const first = await value.handle(new Request("http://poracode.invalid/api/session"));
  expect(first.status).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.data).toHaveLength(1);
  const next = firstBody.cursor.next as string;
  expect(next.startsWith("tp1.")).toBe(true);
  const second = await value.handle(
    new Request("http://poracode.invalid/api/session?cursor=" + encodeURIComponent(next)),
  );
  const secondBody = await second.json();
  expect(secondBody.data).toHaveLength(1);
  expect(cursors[0]).toBeUndefined();
  expect(cursors[1]).toBe("host-c1");
});

test("a cachedThreadById miss pages onward until the thread is found", async () => {
  const pages = [
    {
      threads: [
        {
          id: "t-new",
          agentKind: "codex",
          projectId: "project-1",
          presentationMode: "gui",
          config: {},
          archived: false,
          createdAt: "",
          updatedAt: "",
        },
      ],
      nextCursor: "c1",
    },
    {
      threads: [
        {
          id: "t-old",
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
  ];
  let calls = 0;
  const client = promptClient({
    boundedThreadListPage: async () => ({ page: pages[calls++]!, reads: {} }),
    agentStatuses: async () => ({ windows: [], wsl: [] }),
  });
  const { value } = router(client);
  // t-old lives on page 2 — a route that resolves the thread reaches it.
  const response = await value.handle(
    new Request("http://poracode.invalid/api/experimental/session/ses_t-old/wait", {
      method: "POST",
    }),
  );
  expect(response.status).toBe(204);
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("archivedThreads returns only archived gui threads for the project", async () => {
  const client = promptClient({
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
  const { value } = router(client);
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
  const client = promptClient({ providerUsage: async () => usage });
  const { value } = router(client);
  expect(await value.providerUsage()).toEqual(usage);
  const failing = promptClient({
    providerUsage: async () => {
      throw new Error("unsupported");
    },
  });
  const { value: value2 } = router(failing);
  expect(await value2.providerUsage()).toBeUndefined();
});

test("startSideChat launches a hidden gui child with the snapshot context", async () => {
  const started: Record<string, unknown>[] = [];
  const client = promptClient({
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
  const { value } = router(client);
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
  const noMeta = promptClient({
    startNewThread: async (input: Record<string, unknown>) => {
      started.push(input);
      return {};
    },
    describeHost: async () => ({ capabilities: {} }),
    threadRuntimeItemsPage: async () => ({ items: [], nextCursor: null }),
  });
  const { value: value2 } = router(noMeta);
  await value2.startSideChat("ses_thread-1", "again");
  expect(started.at(-1)!.parentThreadId).toBeUndefined();

  // Virtual subsessions refuse.
  await expect(value.startSideChat("ses_thread-1__task-1", "x")).rejects.toThrow();
});

test("loginCandidates excludes authenticated and non-gui providers", async () => {
  const client = promptClient({
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
  const { value } = router(client);
  expect(await value.loginCandidates()).toEqual([{ kind: "kimi", label: "Kimi" }]);
});

test("a stashed shell output survives an @file mention exactly once", async () => {
  const shells: string[] = [];
  const watches = new Map<string, (data: string) => void>();
  const sent: { prompt: string; segments?: { kind: string; content?: string }[] }[] = [];
  const client = promptClient({
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
  const { value } = router(client, bootstrap.home, () => undefined, bootstrap.directory, {
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
  const client = promptClient({
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
  const { value } = router(client);
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

test("agent-status changes emit list-refresh events, never resync", async () => {
  const { events, value } = router(promptClient());
  const emitted: string[] = [];
  const emit = events.emit.bind(events);
  const resync = events.resync.bind(events);
  events.emit = ((event: unknown) => {
    emitted.push(String((event as { type?: string })?.type));
    return emit(event as never);
  }) as never;
  events.resync = (() => {
    emitted.push("resync");
    return resync();
  }) as never;
  value.handleRemoteEvent({
    type: "windows-agent-statuses",
    statuses: [
      agentStatusSchema.parse({
        kind: "codex",
        label: "Codex",
        installed: true,
        authState: "authenticated",
        capabilities: {
          presentationMode: "gui",
          presentationModes: ["gui"],
          models: [],
          modes: ["agent"],
        },
      }),
    ],
  });
  expect(emitted).toEqual(
    expect.arrayContaining([
      "agent.updated",
      "provider.updated",
      "model.updated",
      "integration.updated",
    ]),
  );
  expect(emitted).not.toContain("resync");
});

test("a duplicate turn.started emits one session.execution.started", async () => {
  const { events, value } = router(promptClient());
  const emitted: unknown[] = [];
  const emit = events.emit.bind(events);
  events.emit = ((event: unknown) => {
    emitted.push(event);
    return emit(event as never);
  }) as never;
  working(value);
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-1" },
  });
  value.handleRemoteEvent({
    type: "thread-runtime-event",
    threadId: "thread-1",
    event: { type: "turn.started", threadId: "thread-1", turnId: "turn-2" },
  });
  expect(
    emitted.filter((e) => (e as { type?: string }).type === "session.execution.started"),
  ).toHaveLength(1);
});

test("location reload answers 204 without resyncing the event stream", async () => {
  const emitted: string[] = [];
  const { events, value } = router(promptClient());
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
