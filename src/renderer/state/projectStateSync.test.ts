import { describe, expect, it } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { useAppStore } from "./appStore";
import { applyProjectStateSnapshot } from "./projectStateSync";

describe("database project repair broadcasts", () => {
  it("applies repaired IDs, settings, and unseen threads together without overwriting live thread state", () => {
    const original: Project = {
      id: "original",
      name: "Original",
      location: { kind: "posix", path: "/repo" },
      createdAt: "2024-01-01T00:00:00.000Z",
      scripts: { setupScript: "custom setup", actions: [] },
    };
    const newest = {
      ...original,
      id: "newest",
      createdAt: "2026-01-01T00:00:00.000Z",
      scripts: { actions: [] },
    };
    const thread: Thread = {
      id: "unseen",
      projectId: original.id,
      title: "Saved conversation",
      agentKind: "test-agent",
      config: { model: "auto" },
      status: "inactive",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      createdAt: original.createdAt,
      updatedAt: original.createdAt,
    };
    const live = { ...thread, id: "live", projectId: newest.id, title: "Live title" };
    useAppStore.setState({
      projects: [newest],
      threads: [live],
      view: { kind: "draft", projectId: newest.id },
    });
    const writes: { projectIds: string[]; threadIds: string[] }[] = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      writes.push({
        projectIds: state.projects.map((project) => project.id),
        threadIds: state.threads.map((item) => item.id),
      });
    });
    try {
      applyProjectStateSnapshot([original], [thread, { ...live, title: "Stale title" }]);
      expect(writes[0]).toEqual({ projectIds: [original.id], threadIds: [live.id, thread.id] });
      expect(useAppStore.getState().threads).toEqual([{ ...live, projectId: original.id }, thread]);
      expect(useAppStore.getState().view).toEqual({ kind: "draft", projectId: original.id });
      useAppStore
        .getState()
        .updateProjectScripts(original.id, { setupScript: "edited setup", actions: [] });
      expect(useAppStore.getState().projects[0]?.scripts?.setupScript).toBe("edited setup");
    } finally {
      unsubscribe();
    }
  });
});
