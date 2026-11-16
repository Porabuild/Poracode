import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportableSession, Project, RemoteThreadCommand, Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import {
  dbGetProjects,
  dbGetThreads,
  dbUpsertProject,
  dbUpsertThread,
  dbUpdateProject,
} from "@/host/db/projectsThreads";
import { registerExistingProjectDirectory } from "@/host/remote/projectCommands";
import type { RemoteServerContext } from "@/host/remote/server/context";
import { importRemoteSession } from "@/host/remote/server/sessionImportCommand";
import { projectLocationKey } from "@/shared/projectIdentity";
import { useAppStore } from "@/renderer/state/appStore";
import type { EntityHost } from "@/renderer/state/entityHost";
import { importSessions } from "./importSessionsActions";

const supervisor = vi.hoisted(() => ({
  importSessionTranscript: vi.fn<() => Promise<{ messageCount: number }>>(),
}));
const hostHandle = vi.hoisted(() => ({ current: vi.fn<() => unknown>() }));

vi.mock("@/renderer/state/entityHost", async (original) => ({
  ...(await original<typeof import("@/renderer/state/entityHost")>()),
  hostHandle: hostHandle.current,
}));
vi.mock("@heroui/react", async (original) => ({
  ...(await original<typeof import("@heroui/react")>()),
  toast: {
    danger: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
  },
}));

const first: ImportableSession = {
  id: "first",
  agentKind: "agent",
  providerSessionId: "first",
  path: "/store/first.jsonl",
  cwd: "/fresh",
  cwdExists: true,
  updatedAt: "2026-10-29T00:00:00Z",
  preview: "first",
  model: "model",
};
const second = { ...first, id: "second", providerSessionId: "second", path: "/store/second.jsonl" };

function otherClientThread(projectId: string): Thread {
  return {
    id: "other-client",
    projectId,
    title: "Other client work",
    agentKind: "agent",
    config: { model: "model" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: first.updatedAt,
    updatedAt: first.updatedAt,
  };
}

let publishProject: (row: Project) => void;

/**
 * The real host code behind the managed host's client: project registration
 * and the `import-session` thread command, over an in-memory host database.
 */
function connectHostOverRealCommands() {
  const ctx = {
    options: { callSupervisor: supervisor.importSessionTranscript },
  } as unknown as RemoteServerContext;
  const client = {
    environment: async () => ({
      capabilities: {
        sessionImport: { versions: [1] },
        projectCommandResults: { versions: [1] },
      },
    }),
    projectCommand: async (command: { kind: string; path?: string }) => {
      if (command.kind !== "add-existing") throw new Error("Unexpected project command");
      return registerExistingProjectDirectory(
        command as never,
        {
          platform: "linux",
          now: () => new Date().toISOString(),
          getProjects: dbGetProjects,
          findProjectByLocation: (location) =>
            dbGetProjects().find(
              (row) => projectLocationKey(row.location) === projectLocationKey(location),
            ) ?? null,
          upsertProject: (row) => publishProject(row),
          updateProject: dbUpdateProject,
        },
        { resultMode: "bounded" },
      ).response;
    },
    sendThreadCommand: async (command: RemoteThreadCommand) => {
      if (command.kind !== "import-session") throw new Error("Unexpected thread command");
      await importRemoteSession(ctx, command);
    },
  };
  hostHandle.current.mockReturnValue({
    kind: "managed",
    connectionKey: undefined,
    hostId: "",
    withClient: (run: (client: unknown) => Promise<unknown>) => run(client),
    hostProjectId: (id: string) => id,
    projectThreadRow: (id: string) => ({ threadId: id }),
    refreshCatalog: () => undefined,
  } as unknown as EntityHost);
  return client;
}

beforeEach(() => {
  initDatabase(":memory:");
  publishProject = (row) => dbUpsertProject(row, 0);
  supervisor.importSessionTranscript.mockResolvedValue({ messageCount: 1 });
  connectHostOverRealCommands();
});
afterEach(() => {
  closeDatabase();
  useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
  supervisor.importSessionTranscript.mockReset();
  hostHandle.current.mockReset();
});

it("retries a refused project registration for the next session in the same folder", async () => {
  let attempts = 0;
  publishProject = (row) => {
    if (++attempts === 1) throw new Error("pre-commit refusal");
    dbUpsertProject(row, 0);
  };
  await expect(importSessions({ sessions: [first, second] })).resolves.toMatchObject({
    imported: 1,
    failed: 1,
  });
  expect(attempts).toBe(2);
  expect(dbGetProjects()).toHaveLength(1);
  expect(dbGetThreads()).toHaveLength(1);
});

it("keeps one thread when overlapping imports await registration for the same session", async () => {
  const results = await Promise.all([
    importSessions({ sessions: [first] }),
    importSessions({ sessions: [first] }),
  ]);
  expect(results.reduce((total, result) => total + result.imported, 0)).toBe(1);
  expect(dbGetThreads()).toHaveLength(1);
  expect(supervisor.importSessionTranscript).toHaveBeenCalledOnce();
  expect(results[0]!.threadIds.get(first.id)).toBe(results[1]!.threadIds.get(first.id));
});

it("reconciles a committed project without overwriting a concurrent client's metadata or thread", async () => {
  publishProject = (row) => {
    dbUpsertProject(row, 0);
    dbUpdateProject({ ...row, name: "Other client name", icon: "star" });
    dbUpsertThread(otherClientThread(row.id), 0);
    throw new Error("project reply lost");
  };
  await expect(importSessions({ sessions: [first] })).resolves.toMatchObject({ failed: 1 });
  const committed = dbGetProjects()[0]!;
  await expect(importSessions({ sessions: [second] })).resolves.toMatchObject({
    imported: 1,
    failed: 0,
  });
  expect(dbGetProjects()).toEqual([committed]);
  expect(committed).toMatchObject({ name: "Other client name", icon: "star" });
  expect(dbGetThreads().find((row) => row.id === "other-client")).toMatchObject({
    title: "Other client work",
  });
});

it("keeps a real concurrent client's row when replay rejects after publication", async () => {
  let rejectReplay!: (error: Error) => void;
  supervisor.importSessionTranscript.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectReplay = reject;
      }),
  );
  const importing = importSessions({ sessions: [first] });
  await vi.waitFor(() => expect(supervisor.importSessionTranscript).toHaveBeenCalledOnce());
  const project = dbGetProjects()[0]!;
  dbUpsertThread(otherClientThread(project.id), 0);
  dbUpdateProject({ ...project, name: "Concurrent rename" });
  rejectReplay(new Error("replay failed"));
  await expect(importing).resolves.toMatchObject({ imported: 0, failed: 1 });
  expect(dbGetThreads()).toMatchObject([otherClientThread(project.id)]);
  expect(dbGetProjects()[0]?.name).toBe("Concurrent rename");
});

it("lets the host remove a half import, so a retry cannot duplicate it", async () => {
  supervisor.importSessionTranscript.mockRejectedValueOnce(new Error("replay failed"));
  await expect(importSessions({ sessions: [first] })).resolves.toMatchObject({
    imported: 0,
    failed: 1,
  });
  expect(dbGetThreads()).toEqual([]);

  await expect(importSessions({ sessions: [first] })).resolves.toMatchObject({
    imported: 1,
    failed: 0,
  });
  expect(dbGetThreads()).toHaveLength(1);
  expect(dbGetThreads()[0]).toMatchObject({
    presentationMode: "gui",
    status: "inactive",
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: "first" },
    config: { model: "model", importedFrom: { path: first.path } },
  });
});
