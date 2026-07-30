import { describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { AppCommand } from "./registry";
import { filterCommandsForSearch, filterThreadsForSearch } from "./everythingSearch";

describe("filterThreadsForSearch", () => {
  const project: Project = {
    id: "project-1",
    name: "Poracode",
    location: { kind: "windows", path: "C:\\repo" },
    createdAt: "2026-07-15T00:00:00.000Z",
  };
  const projects = new Map([[project.id, project]]);

  it("matches thread and project/worktree metadata with AND semantics", () => {
    const threads = [
      makeThread({
        id: "match",
        title: "Fix file search",
        worktreeBranch: "feature/everything",
      }),
      makeThread({ id: "miss", title: "Fix file search" }),
    ];

    expect(
      filterThreadsForSearch(threads, projects, "poracode everything").map((t) => t.id),
    ).toEqual(["match"]);
  });

  it("excludes archived threads and keeps starred threads ahead of newer threads", () => {
    const threads = [
      makeThread({ id: "new", updatedAt: "2026-07-15T03:00:00.000Z" }),
      makeThread({ id: "starred", starred: true, updatedAt: "2026-07-14T03:00:00.000Z" }),
      makeThread({ id: "archived", archived: true, starred: true }),
    ];

    expect(filterThreadsForSearch(threads, projects, "").map((t) => t.id)).toEqual([
      "starred",
      "new",
    ]);
  });
});

describe("filterCommandsForSearch", () => {
  const resolve = (value: AppCommand["title"]): string =>
    typeof value === "string" ? value : String(value.message ?? value.id);

  it("keeps project actions out of command results and actions out of command results", () => {
    const commands = [
      makeCommand("files.open", "Open Files", "Project"),
      makeCommand("script.test.run", "Run tests", "Scripts"),
    ];

    expect(filterCommandsForSearch(commands, "", resolve, "command").map((c) => c.id)).toEqual([
      "files.open",
    ]);
    expect(filterCommandsForSearch(commands, "", resolve, "action").map((c) => c.id)).toEqual([
      "script.test.run",
    ]);
  });

  it("matches every query term across command metadata and hides non-runnable results", () => {
    const commands = [
      {
        ...makeCommand("git.open", "Open review", "Project"),
        keywords: ["changes"],
      },
      { ...makeCommand("palette.open", "Open palette", "Poracode"), showInPalette: false },
    ];

    expect(
      filterCommandsForSearch(commands, "project changes", resolve, "command").map(
        (command) => command.id,
      ),
    ).toEqual(["git.open"]);
    expect(filterCommandsForSearch(commands, "palette", resolve, "command")).toEqual([]);
  });
});

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeCommand(id: string, title: string, group: string): AppCommand {
  return { id, title, group, run: vi.fn<() => void>() };
}
