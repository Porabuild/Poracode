// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";

const db = vi.hoisted(() => ({
  projects: [] as Project[],
  threads: [] as Thread[],
  upsertedProjects: [] as Project[],
}));

vi.mock("@/host/db", () => ({
  dbGetProject: (projectId: string) =>
    db.projects.find((project) => project.id === projectId) ?? null,
  dbGetProjects: () => db.projects,
  dbGetThread: (threadId: string) => db.threads.find((thread) => thread.id === threadId) ?? null,
  dbGetThreads: () => db.threads,
  dbUpsertThread: (thread: Thread) => {
    const index = db.threads.findIndex((entry) => entry.id === thread.id);
    if (index === -1) db.threads.push(thread);
    else db.threads[index] = thread;
  },
  dbDeleteThread: (threadId: string) => {
    db.threads = db.threads.filter((thread) => thread.id !== threadId);
  },
  dbUpsertProject: (project: Project) => {
    db.upsertedProjects.push(project);
    if (!db.projects.some((entry) => entry.id === project.id)) db.projects.push(project);
  },
  dbUpdateProject: () => {},
  dbDeleteProject: () => {},
}));

import { buildSharedAppControlsIngressDeps, ensureHomeProjectWithPublish } from "./ingressDeps";

function alphaProject(): Project {
  return {
    id: "p1",
    name: "Alpha",
    location: { kind: "posix", path: "/work/alpha" },
    createdAt: "2026-01-01T00:00:00.000Z",
  } as Project;
}

function buildDeps(
  overrides: {
    publishProjectsChanged?: () => void;
    publishThreadsChanged?: (threadIds: readonly string[]) => void;
  } = {},
) {
  return buildSharedAppControlsIngressDeps({
    call: (async (name: string) =>
      name === "getAgentStatuses" ? { fromCache: true, windows: [], wsl: [] } : null) as never,
    sendThreadCommand: () => true,
    getSharedSettings: () => defaultSharedSettings,
    publishProjectsChanged: overrides.publishProjectsChanged ?? (() => {}),
    ...(overrides.publishThreadsChanged
      ? { publishThreadsChanged: overrides.publishThreadsChanged }
      : {}),
  });
}

describe("app-controls ingress host-local invalidation", () => {
  it("publishes the new thread id after create_thread persists the row", async () => {
    db.projects = [alphaProject()];
    db.threads = [];
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const deps = buildDeps({ publishThreadsChanged });

    const result = await deps.createThread({
      projectId: "p1",
      prompt: "Do the thing",
      agentKind: "codex",
      model: "gpt-5.6",
    });

    expect(db.threads.some((thread) => thread.id === result.threadId)).toBe(true);
    expect(publishThreadsChanged).toHaveBeenCalledExactlyOnceWith([result.threadId]);
  });

  it("publishes projects-changed only when ensureHomeProjectWithPublish creates the row", () => {
    db.projects = [];
    db.upsertedProjects = [];
    const publishProjectsChanged = vi.fn<() => void>();

    const first = ensureHomeProjectWithPublish(publishProjectsChanged);

    expect(db.upsertedProjects.map((entry) => entry.id)).toContain(first.id);
    expect(publishProjectsChanged).toHaveBeenCalledTimes(1);

    const second = ensureHomeProjectWithPublish(publishProjectsChanged);

    expect(second.id).toBe(first.id);
    expect(publishProjectsChanged).toHaveBeenCalledTimes(1);
  });
});
