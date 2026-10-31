import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportableSession, Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import type { RemoteProjectCommand } from "@/shared/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { importSessionsOnHost } from "./remoteSessionImport";

const toast = vi.hoisted(() => ({ danger: vi.fn<(text: string) => void>() }));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast,
}));

const session: ImportableSession = {
  id: "claude:session-1",
  agentKind: "claude",
  providerSessionId: "session-1",
  path: "/home/user/.claude/projects/repo/session-1.jsonl",
  cwd: "/home/user/repo",
  updatedAt: "2026-08-12T00:00:00.000Z",
  preview: "Fix the login form",
  cwdExists: true,
};

function fakeClient(capabilities: Record<string, unknown>) {
  return {
    environment: vi.fn<() => Promise<{ capabilities: Record<string, unknown> }>>(async () => ({
      capabilities,
    })),
    projectCommand: vi.fn<
      (
        command: RemoteProjectCommand,
        options?: unknown,
      ) => Promise<{
        projects: Project[];
        project: Project;
      }>
    >(async () => ({
      projects: [],
      project: { id: "host-project", name: "repo" } as Project,
    })),
    sendThreadCommand: vi.fn<(command: RemoteThreadCommand) => Promise<void>>(
      async () => undefined,
    ),
  };
}

function run(client: ReturnType<typeof fakeClient>) {
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "pc",
        label: "Poracode on PC",
        endpoint: "https://pc.test/",
        accessToken: "token",
        scopes: [],
      },
    ],
    withClient: async (_key, invoke) => invoke(client as never),
    refreshServer: vi.fn<(desktopId: string) => Promise<void>>(async () => undefined),
  });
  return importSessionsOnHost({
    hostKey: "pc",
    sessions: [session],
    findImportedThreadId: (candidate, threads) =>
      threads.find((thread) => thread.sessionRef?.providerSessionId === candidate.providerSessionId)
        ?.id,
    resolveModel: () => "sonnet",
    titleFor: (candidate) => candidate.preview,
  });
}

describe("importing sessions on the bound host", () => {
  const original = useRemoteServersStore.getState();
  beforeEach(() => {
    useAppStore.setState({ projects: [], threads: [] });
    toast.danger.mockClear();
  });
  afterEach(() => {
    useRemoteServersStore.setState({
      servers: [],
      withClient: original.withClient,
      refreshServer: original.refreshServer,
    });
  });

  it("asks an older host for nothing and says it needs an update", async () => {
    const client = fakeClient({});
    const result = await run(client);
    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(toast.danger).toHaveBeenCalledWith("Update PC to import its sessions.");
    expect(client.projectCommand).not.toHaveBeenCalled();
    expect(client.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("registers the folder on the host and imports the session there", async () => {
    const client = fakeClient({ sessionImport: { versions: [1] } });
    const result = await run(client);

    expect(result.imported).toBe(1);
    expect(client.projectCommand.mock.calls[0]?.[0]).toEqual({
      kind: "add-existing",
      path: "/home/user/repo",
    });
    expect(client.sendThreadCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "import-session",
        projectId: "host-project",
        agentKind: "claude",
        model: "sonnet",
        title: "Fix the login form",
        path: session.path,
        providerSessionId: "session-1",
      }),
    );
    const sent = client.sendThreadCommand.mock.calls[0]![0];
    expect(result.threadIds.get(session.id)).toContain(sent.threadId);
  });

  it("reuses the host's thread that already holds the session", async () => {
    useAppStore.setState({
      threads: [
        {
          id: "remote-thread",
          remoteServerId: "pc",
          sessionRef: { providerSessionId: "session-1", discoveredAt: session.updatedAt },
        } as Thread,
      ],
    });
    const client = fakeClient({ sessionImport: { versions: [1] } });
    const result = await run(client);
    expect(result.threadIds.get(session.id)).toBe("remote-thread");
    expect(client.sendThreadCommand).not.toHaveBeenCalled();
  });
});
