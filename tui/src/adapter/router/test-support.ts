import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { agentStatusSchema } from "@/shared/contracts";
import { remoteProjectSchema } from "@/shared/remote/protocol/resources";
import type { TuiBootstrap } from "../../bootstrap";
import { EventStreamHub, createEventTranslator, type ThreadEventContext } from "../events";
import { createRouter } from "../router";
export const bootstrap: TuiBootstrap = {
  version: 2,
  auth: "pairing",
  appVersion: "0.0.0",
  home: "C:/poracode-tui",
  pairingUrl: "http://127.0.0.1:49152/#token=temporary",
  directory: "C:/repo",
  projectId: "project-1",
  args: {},
};

export function router(
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

export const forkProject = () =>
  remoteProjectSchema.parse({
    id: "project-1",
    name: "project",
    location: { kind: "windows", path: "C:/repo" },
    createdAt: "2026-01-01T00:00:00.000Z",
  });
export const forkThread = (overrides: Record<string, unknown> = {}) => ({
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
export const forkEnvironment = { capabilities: { catalogMutations: { versions: [1] } } };

export const elicitationPayload = {
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

export type PromptBody = {
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

export const promptFixture = {
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

export const promptClient = (overrides: Record<string, unknown> = {}) =>
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

export const working = (value: { handleRemoteEvent: (event: unknown) => void }) =>
  value.handleRemoteEvent({ type: "thread-state", threadId: "thread-1", status: "working" });

export const titleProject = remoteProjectSchema.parse({
  id: "project-1",
  name: "project",
  location: { kind: "windows", path: "C:/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
});
export const titleStatus = agentStatusSchema.parse({
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
export const titleStatusB = agentStatusSchema.parse({
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
export const startedThread = {
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

export const titleClient = (options: {
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

export const runPrompt = async (
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
