import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportableSession, Project, Thread } from "@/shared/contracts";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import {
  dbGetProjects,
  dbGetThreads,
  dbUpsertProject,
  dbUpsertThread,
  dbDeleteThread,
  dbDeleteProject,
  dbUpdateProject,
} from "@/host/db/projectsThreads";
import { onProjectThreadDataChanged } from "@/host/db/projectThreadChanges";
import { registerExistingProjectDirectory } from "@/host/remote/projectCommands";
import { projectLocationKey } from "@/shared/projectIdentity";
import { useAppStore } from "@/renderer/state/appStore";
import { importSessions } from "./importSessionsActions";

const ports = vi.hoisted(() => ({
  dbUpsertProject: vi.fn<(row: Project) => Promise<void>>(),
  dbUpsertThread: vi.fn<(row: Thread) => Promise<void>>(),
  dbDeleteThread: vi.fn<(id: string) => Promise<void>>(),
  dbDeleteProject: vi.fn<(id: string) => Promise<void>>(),
  importSessionTranscript: vi.fn<() => Promise<{ messageCount: number }>>(),
}));
const register = vi.hoisted(() =>
  vi.fn<
    typeof import("@/renderer/state/managedRootCatalog/rootCatalogCommands").sendManagedRootProjectCommand
  >(),
);
vi.mock("@/renderer/bridge", async (original) => ({
  ...(await original<typeof import("@/renderer/bridge")>()),
  isWindows: () => false,
  readBridge: () => ports,
}));
vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", async (original) => ({
  ...(await original<typeof import("@/renderer/state/managedRootCatalog/rootCatalogCommands")>()),
  sendManagedRootProjectCommand: register,
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
beforeEach(() => {
  initDatabase(":memory:");
  publishProject = (row) => dbUpsertProject(row, 0);
  ports.dbUpsertProject.mockImplementation(async (row) => publishProject(row));
  ports.dbUpsertThread.mockImplementation(async (row) => dbUpsertThread(row, 0));
  ports.dbDeleteThread.mockImplementation(async (id) => dbDeleteThread(id));
  ports.dbDeleteProject.mockImplementation(async (id) => dbDeleteProject(id));
  ports.importSessionTranscript.mockResolvedValue({ messageCount: 1 });
  register.mockImplementation(async (command) => {
    if (command.kind !== "add-existing") throw new Error("Unexpected project command");
    const result = registerExistingProjectDirectory(
      command,
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
    );
    return result.response;
  });
});
afterEach(() => {
  closeDatabase();
  useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
  for (const mock of Object.values(ports)) mock.mockReset();
  register.mockReset();
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
  expect(ports.dbDeleteProject).not.toHaveBeenCalled();
});

it("keeps one thread when overlapping imports await registration for the same session", async () => {
  const results = await Promise.all([
    importSessions({ sessions: [first] }),
    importSessions({ sessions: [first] }),
  ]);
  expect(results.reduce((total, result) => total + result.imported, 0)).toBe(1);
  expect(dbGetThreads()).toHaveLength(1);
  expect(ports.importSessionTranscript).toHaveBeenCalledOnce();
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
  expect(register).toHaveBeenLastCalledWith({ kind: "add-existing", path: "/fresh" });
});

it("keeps a real concurrent client's row when replay rejects after publication", async () => {
  let rejectReplay!: (error: Error) => void;
  ports.importSessionTranscript.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectReplay = reject;
      }),
  );
  const importing = importSessions({ sessions: [first] });
  await vi.waitFor(() => expect(ports.importSessionTranscript).toHaveBeenCalledOnce());
  const project = dbGetProjects()[0]!;
  dbUpsertThread(otherClientThread(project.id), 0);
  dbUpdateProject({ ...project, name: "Concurrent rename" });
  rejectReplay(new Error("replay failed"));
  await expect(importing).resolves.toMatchObject({ imported: 0, failed: 1 });
  expect(dbGetThreads()).toMatchObject([otherClientThread(project.id)]);
  expect(dbGetProjects()[0]?.name).toBe("Concurrent rename");
  expect(ports.dbDeleteProject).not.toHaveBeenCalled();
});

it("rolls back a real committed thread after a notification failure so retry cannot duplicate it", async () => {
  ports.dbUpsertThread.mockImplementationOnce(async (row) => {
    const unsubscribe = onProjectThreadDataChanged(() => {
      throw new Error("post-commit notification failed");
    });
    try {
      dbUpsertThread(row, 0);
    } finally {
      unsubscribe();
    }
  });
  await expect(importSessions({ sessions: [first] })).resolves.toMatchObject({
    imported: 0,
    failed: 1,
  });
  expect(dbGetThreads()).toEqual([]);
  expect(ports.dbDeleteThread).toHaveBeenCalledOnce();
  await expect(importSessions({ sessions: [first] })).resolves.toMatchObject({
    imported: 1,
    failed: 0,
  });
  expect(dbGetThreads()).toHaveLength(1);
});

it("retains uncertain thread identity when rollback refuses and prevents immediate duplicate import", async () => {
  ports.dbUpsertThread.mockImplementationOnce(async (row) => {
    dbUpsertThread(row, 0);
    throw new Error("reply lost");
  });
  ports.dbDeleteThread.mockRejectedValueOnce(new Error("offline"));
  await expect(importSessions({ sessions: [first, second] })).resolves.toMatchObject({
    imported: 1,
    failed: 1,
  });
  const retry = await importSessions({ sessions: [first] });
  expect(retry.threadIds.has(first.id)).toBe(true);
  expect(dbGetThreads()).toHaveLength(2);
  expect(useAppStore.getState().threads).toHaveLength(2);
});
