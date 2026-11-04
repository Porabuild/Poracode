import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentStatus,
  ImportableSession,
  Project,
  RemoteThreadCommand,
  Thread,
} from "@/shared/contracts";
import type { RemoteProjectCommand, RemoteProjectCommandResponse } from "@/shared/remote";
import { RemoteClientError } from "@/shared/remote/client";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import type { EntityHost } from "@/renderer/state/entityHost";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { hostThreads, importSessions, resolveImportModel } from "./importSessionsActions";

const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
const hostHandle = vi.hoisted(() => ({
  current: vi.fn<(connectionKey: string | undefined) => unknown>(),
}));
vi.mock("@/renderer/state/entityHost", async (original) => ({
  ...(await original<typeof import("@/renderer/state/entityHost")>()),
  hostHandle: hostHandle.current,
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { danger: toastDanger, success: vi.fn<(message: string) => void>() },
}));

const project: Project = {
  id: "fallback",
  name: "fallback",
  location: { kind: "posix", path: "/fallback" },
} as Project;

const session: ImportableSession = {
  id: "agent:ses-1",
  agentKind: "agent",
  providerSessionId: "ses-1",
  path: "/home/u/.agent/sessions/ses-1.jsonl",
  cwd: "/gone",
  cwdExists: false,
  updatedAt: "2026-09-29T00:00:00.000Z",
  preview: "fix the bug",
  model: "agent-model",
};

const pairedServer = {
  desktopId: "pc",
  label: "Poracode on PC",
  endpoint: "https://pc.test/",
  accessToken: "token",
  scopes: [],
};

/** The commands a host's client receives; the host is the managed one unless a key is given. */
function fakeHost(
  options: { connectionKey?: string; capabilities?: Record<string, unknown> } = {},
) {
  const projectCommand = vi.fn<
    (command: RemoteProjectCommand, options?: unknown) => Promise<RemoteProjectCommandResponse>
  >(async (command) => {
    if (command.kind !== "add-existing") throw new Error("Unexpected project command");
    const row = {
      id: "host-project",
      name: "registered",
      location: { kind: "posix", path: command.path },
    };
    return { ok: true, project: row, created: true } as unknown as RemoteProjectCommandResponse;
  });
  const sendThreadCommand = vi.fn<(command: RemoteThreadCommand) => Promise<void>>(
    async () => undefined,
  );
  const environment = vi.fn<() => Promise<{ capabilities: Record<string, unknown> }>>(async () => ({
    capabilities: options.capabilities ?? { sessionImport: { versions: [1] } },
  }));
  const client = { environment, projectCommand, sendThreadCommand };
  const refreshCatalog = vi.fn<() => void>();
  const key = options.connectionKey;
  const host = {
    kind: key === undefined ? "managed" : "paired",
    connectionKey: key,
    hostId: "",
    withClient: (run: (client: unknown) => Promise<unknown>) => run(client),
    hostProjectId: (viewProjectId: string) =>
      key === undefined
        ? viewProjectId
        : useAppStore.getState().projects.find((row) => row.id === viewProjectId)?.remoteId,
    projectThreadRow: (hostThreadId: string) => ({
      threadId: key === undefined ? hostThreadId : `remote:${key}:thread:${hostThreadId}`,
    }),
    refreshCatalog,
  } as unknown as EntityHost;
  hostHandle.current.mockImplementation((requested) => (requested === key ? host : undefined));
  return { projectCommand, sendThreadCommand, environment, refreshCatalog };
}

beforeEach(() => {
  useAppStore.setState({ threads: [], projects: [] });
});

afterEach(() => {
  useAppStore.setState({ threads: [], projects: [], view: { kind: "home" } });
  toastDanger.mockReset();
  hostHandle.current.mockReset();
  useRemoteServersStore.setState({ servers: [] });
});

function codexStatus(models: readonly { id: string; label: string }[]): AgentStatus {
  return { kind: "codex", capabilities: { models } } as AgentStatus;
}

describe("resolveImportModel", () => {
  afterEach(() => {
    useAgentStatusesStore.setState({ agentStatuses: [] });
    useSharedSettings.setState({ providerConfigs: {} });
  });

  it("fails closed when the catalog is empty and the session has no model", () => {
    useAppStore.setState({ projects: [project] });
    useAgentStatusesStore.setState({ agentStatuses: [codexStatus([])] });
    useSharedSettings.setState({
      providerConfigs: {
        codex: { model: "gpt-5.4", mode: "agent", approvalPolicy: "on-request", sandboxMode: "" },
      },
    });
    const { model: _model, ...withoutModel } = session;

    expect(resolveImportModel({ ...withoutModel, agentKind: "codex" }, project.id)).toBe("");
  });

  it("keeps the session model when the catalog is empty", () => {
    useAppStore.setState({ projects: [project] });
    useAgentStatusesStore.setState({ agentStatuses: [codexStatus([])] });

    expect(
      resolveImportModel({ ...session, agentKind: "codex", model: "gpt-5.4" }, project.id),
    ).toBe("gpt-5.4");
  });

  it("uses a saved model only when the catalog offers it", () => {
    useAppStore.setState({ projects: [project] });
    useAgentStatusesStore.setState({
      agentStatuses: [codexStatus([{ id: "gpt-5.4", label: "5.4" }])],
    });
    useSharedSettings.setState({
      providerConfigs: {
        codex: { model: "gpt-5.4", mode: "agent", approvalPolicy: "on-request", sandboxMode: "" },
      },
    });
    const { model: _model, ...withoutModel } = session;

    expect(resolveImportModel({ ...withoutModel, agentKind: "codex" }, project.id)).toBe("gpt-5.4");
  });
});

describe("importSessions", () => {
  it("fails every session when the managed host is not connected", async () => {
    hostHandle.current.mockReturnValue(undefined);

    const result = await importSessions({ sessions: [session] });

    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(toastDanger).toHaveBeenCalledOnce();
  });

  it("asks a host that lacks the import capability for nothing", async () => {
    const host = fakeHost({ capabilities: {} });

    const result = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(toastDanger).toHaveBeenCalledWith("Update Local to import its sessions.");
    expect(host.projectCommand).not.toHaveBeenCalled();
    expect(host.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("registers the folder on the host and imports the session there, writing no local rows", async () => {
    const host = fakeHost();

    const result = await importSessions({
      sessions: [{ ...session, cwd: "/new-project", cwdExists: true }],
    });

    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(host.projectCommand.mock.calls[0]?.[0]).toEqual({
      kind: "add-existing",
      path: "/new-project",
    });
    expect(host.sendThreadCommand).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: "import-session",
        projectId: "host-project",
        agentKind: "agent",
        model: "agent-model",
        title: "fix the bug",
        path: session.path,
        providerSessionId: "ses-1",
      }),
    );
    const sent = host.sendThreadCommand.mock.calls[0]![0];
    expect(result.threadIds.get(session.id)).toBe(sent.threadId);
    // The host's catalog brings the rows in; nothing is written here.
    expect(useAppStore.getState().threads).toEqual([]);
    expect(host.refreshCatalog).toHaveBeenCalledOnce();
  });

  it("declares the bounded project result only when the host advertised it", async () => {
    const host = fakeHost({
      capabilities: {
        sessionImport: { versions: [1] },
        projectCommandResults: { versions: [1] },
      },
    });

    await importSessions({ sessions: [{ ...session, cwd: "/new-project", cwdExists: true }] });

    expect(host.projectCommand.mock.calls[0]?.[1]).toMatchObject({ result: "bounded" });
  });

  it("imports into the chosen project when the session's folder no longer exists", async () => {
    const host = fakeHost();
    useAppStore.setState({ projects: [project] });

    const result = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(host.projectCommand).not.toHaveBeenCalled();
    expect(host.sendThreadCommand).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "import-session", projectId: "fallback" }),
    );
  });

  it("reports a missing project without asking the host for anything", async () => {
    const host = fakeHost();

    const result = await importSessions({ sessions: [session] });

    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(host.projectCommand).not.toHaveBeenCalled();
    expect(host.sendThreadCommand).not.toHaveBeenCalled();
    expect(toastDanger).toHaveBeenCalledWith(
      "Choose a project for sessions whose folder no longer exists.",
    );
  });

  it("registers no project when no model is available", async () => {
    const host = fakeHost();
    const { model: _model, ...withoutModel } = session;

    const result = await importSessions({
      sessions: [{ ...withoutModel, cwd: "/new-project", cwdExists: true }],
    });

    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(host.projectCommand).not.toHaveBeenCalled();
    expect(host.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("does not import a session one of the host's own threads already holds", async () => {
    const host = fakeHost();
    useAppStore.setState({
      projects: [project],
      threads: [
        { id: "held", sessionRef: { providerSessionId: "ses-1" }, agentKind: "agent", config: {} },
      ] as unknown as Thread[],
    });

    const result = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(result.threadIds.get(session.id)).toBe("held");
    expect(host.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("does not take another host's thread for the managed host's session", async () => {
    const host = fakeHost();
    useAppStore.setState({
      projects: [project],
      threads: [
        {
          id: "remote:pc:thread:t1",
          remoteServerId: "pc",
          sessionRef: { providerSessionId: "ses-1" },
          agentKind: "agent",
          config: {},
        },
      ] as unknown as Thread[],
    });

    const result = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(result).toMatchObject({ imported: 1 });
    expect(host.sendThreadCommand).toHaveBeenCalledOnce();
  });

  it("keeps one thread when overlapping imports request the same session", async () => {
    const host = fakeHost();
    useAppStore.setState({ projects: [project] });
    let finish!: () => void;
    host.sendThreadCommand.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const first = importSessions({ sessions: [session], fallbackProjectId: "fallback" });
    await vi.waitFor(() => expect(host.sendThreadCommand).toHaveBeenCalledOnce());
    const second = importSessions({ sessions: [session], fallbackProjectId: "fallback" });
    finish();
    const results = await Promise.all([first, second]);

    expect(host.sendThreadCommand).toHaveBeenCalledOnce();
    expect(results.reduce((total, result) => total + result.imported, 0)).toBe(1);
    expect(results[0]!.threadIds.get(session.id)).toBeDefined();
  });

  it("reports a failed import and continues with the rest of the batch", async () => {
    const host = fakeHost();
    useAppStore.setState({ projects: [project] });
    host.sendThreadCommand
      .mockRejectedValueOnce(new Error("replay failed"))
      .mockResolvedValue(undefined);

    const result = await importSessions({
      sessions: [
        session,
        { ...session, id: "second", path: "/second.jsonl", providerSessionId: "second" },
      ],
      fallbackProjectId: "fallback",
    });

    expect(result).toMatchObject({ imported: 1, failed: 1 });
    expect(result.threadIds.has(session.id)).toBe(false);
    expect(result.threadIds.has("second")).toBe(true);
    expect(toastDanger).toHaveBeenCalledWith("replay failed");
  });

  it("retries a refused project registration for the next session in the same folder", async () => {
    const host = fakeHost();
    host.projectCommand.mockRejectedValueOnce(new Error("pre-commit refusal"));
    const inFolder = { ...session, cwd: "/fresh", cwdExists: true };

    const result = await importSessions({
      sessions: [
        inFolder,
        { ...inFolder, id: "second", path: "/second.jsonl", providerSessionId: "second" },
      ],
    });

    expect(result).toMatchObject({ imported: 1, failed: 1 });
    expect(host.projectCommand).toHaveBeenCalledTimes(2);
    expect(host.sendThreadCommand).toHaveBeenCalledOnce();
  });

  it("reuses the thread id after an unconfirmed outcome, so a retry cannot import twice", async () => {
    const host = fakeHost();
    useAppStore.setState({ projects: [project] });
    host.sendThreadCommand.mockRejectedValueOnce(
      new RemoteClientError("lost reply", 502, "bad_gateway"),
    );

    const first = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });
    expect(first).toMatchObject({ imported: 0, failed: 1 });
    const attempted = host.sendThreadCommand.mock.calls[0]![0].threadId;

    // The host already holds the row from the lost reply.
    host.sendThreadCommand.mockRejectedValueOnce(
      new RemoteClientError("exists", 409, "thread_already_exists"),
    );
    const retry = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(host.sendThreadCommand.mock.calls[1]![0].threadId).toBe(attempted);
    expect(retry).toMatchObject({ imported: 1, failed: 0 });
    expect(retry.threadIds.get(session.id)).toBe(attempted);
  });

  it("imports into a paired host through the same commands, in that host's ids", async () => {
    const host = fakeHost({ connectionKey: "pc" });
    useRemoteServersStore.setState({ servers: [pairedServer] });
    useAppStore.setState({
      projects: [
        {
          ...project,
          id: "remote:pc:project:host-fallback",
          remoteServerId: "pc",
          remoteId: "host-fallback",
        },
      ],
    });

    const result = await importSessions({
      sessions: [session],
      fallbackProjectId: "remote:pc:project:host-fallback",
      hostKey: "pc",
    });

    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(host.sendThreadCommand).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "import-session", projectId: "host-fallback" }),
    );
    const sent = host.sendThreadCommand.mock.calls[0]![0];
    expect(result.threadIds.get(session.id)).toBe(`remote:pc:thread:${sent.threadId}`);
  });

  it("names a paired host that needs an update", async () => {
    fakeHost({ connectionKey: "pc", capabilities: {} });
    useRemoteServersStore.setState({ servers: [pairedServer] });

    await importSessions({ sessions: [session], hostKey: "pc" });

    expect(toastDanger).toHaveBeenCalledWith("Update PC to import its sessions.");
  });
});

describe("hostThreads", () => {
  it("keeps only the rows one host owns", () => {
    const rows = [{ id: "a" }, { id: "b", remoteServerId: "pc" }] as Thread[];
    expect(hostThreads(rows, undefined).map((row) => row.id)).toEqual(["a"]);
    expect(hostThreads(rows, "pc").map((row) => row.id)).toEqual(["b"]);
  });
});
