import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import {
  buildGitAddWorktreePayload,
  navigationTransitionType,
  openWorktreeDraft,
  screenDepth,
  selectDraftProject,
  threadIdFromPath,
} from "./navHelpers";

const draftStore = vi.hoisted(() => ({
  setPendingDraftWorktreeSelection: vi.fn<(projectId: string, selection: unknown) => void>(),
  openDraft: vi.fn<(projectId: string) => void>(),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => draftStore,
  },
}));

vi.mock("./gitSummaries", () => ({
  useGitSummariesStore: {
    getState: () => ({ byThread: {} }),
  },
}));

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/repo/${id}` },
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  } as Project;
}

// Home arrives first in the snapshot (it's prepended on the desktop and synced
// with sortOrder 0), and it carries `disabled: true` as an internal marker.
const home = makeProject(HOME_PROJECT_ID, { name: HOME_PROJECT_NAME, disabled: true });
const realA = makeProject("real-a");
const realB = makeProject("real-b");

describe("openWorktreeDraft", () => {
  it("waits for the full draft route before publishing the one-shot worktree target", async () => {
    draftStore.setPendingDraftWorktreeSelection.mockReset();
    draftStore.openDraft.mockReset();
    let finishNavigation: (() => void) | undefined;
    const navigateToDraft = vi.fn<() => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finishNavigation = resolve;
        }),
    );

    const opening = openWorktreeDraft(
      {
        projectId: "real-a",
        worktreePath: "/repo/real-a-worktree",
        worktreeBranch: "feature/mobile-target",
      },
      navigateToDraft,
    );

    expect(navigateToDraft).toHaveBeenCalledTimes(1);
    expect(draftStore.setPendingDraftWorktreeSelection).not.toHaveBeenCalled();
    expect(draftStore.openDraft).not.toHaveBeenCalled();

    finishNavigation?.();
    await opening;

    expect(draftStore.setPendingDraftWorktreeSelection).toHaveBeenCalledWith("real-a", {
      branch: "feature/mobile-target",
      baseBranch: "feature/mobile-target",
      isWorktree: true,
      worktreePath: "/repo/real-a-worktree",
    });
    expect(draftStore.openDraft).toHaveBeenCalledWith("real-a");
  });
});

describe("selectDraftProject", () => {
  it("selects Home when it is explicitly picked (regression: PWA can't select Home)", () => {
    const result = selectDraftProject([home, realA], {
      draftProjectId: HOME_PROJECT_ID,
      selectedThreadProjectId: undefined,
    });
    expect(result?.id).toBe(HOME_PROJECT_ID);
  });

  it("selects an explicitly picked real project", () => {
    const result = selectDraftProject([home, realA, realB], {
      draftProjectId: "real-b",
      selectedThreadProjectId: undefined,
    });
    expect(result?.id).toBe("real-b");
  });

  it("defaults to the first real project, not Home, even though Home sorts first", () => {
    const result = selectDraftProject([home, realA, realB], {
      draftProjectId: null,
      selectedThreadProjectId: undefined,
    });
    expect(result?.id).toBe("real-a");
  });

  it("falls back to the active thread's project when nothing is explicitly picked", () => {
    const result = selectDraftProject([home, realA, realB], {
      draftProjectId: null,
      selectedThreadProjectId: "real-b",
    });
    expect(result?.id).toBe("real-b");
  });

  it("falls back to the active thread even when it is the Home project", () => {
    const result = selectDraftProject([home, realA], {
      draftProjectId: null,
      selectedThreadProjectId: HOME_PROJECT_ID,
    });
    expect(result?.id).toBe(HOME_PROJECT_ID);
  });

  it("uses Home as the default only when it is the only project", () => {
    const result = selectDraftProject([home], {
      draftProjectId: null,
      selectedThreadProjectId: undefined,
    });
    expect(result?.id).toBe(HOME_PROJECT_ID);
  });

  it("excludes user-disabled real projects from selection", () => {
    const disabled = makeProject("real-disabled", { disabled: true });
    const result = selectDraftProject([home, disabled], {
      draftProjectId: "real-disabled",
      selectedThreadProjectId: undefined,
    });
    // The disabled project is filtered out, so it can't be picked; Home is the
    // only remaining option.
    expect(result?.id).toBe(HOME_PROJECT_ID);
  });

  it("returns null when there are no projects", () => {
    const result = selectDraftProject([], {
      draftProjectId: null,
      selectedThreadProjectId: undefined,
    });
    expect(result).toBeNull();
  });
});

describe("buildGitAddWorktreePayload", () => {
  const project = makeProject("proj", {
    location: { kind: "posix", path: "/repo" },
    scripts: { worktreeCopyPatterns: ["node_modules", ".env"] },
  } as Partial<Project>);
  const base: DraftStartInput = {
    agentKind: "claude",
    config: { model: "sonnet" },
    prompt: "hi",
  } as unknown as DraftStartInput;

  it("returns null for a plain project-root thread (no worktree)", () => {
    expect(buildGitAddWorktreePayload(project, base)).toBeNull();
  });

  it("returns null when targeting an existing worktree (caller reuses the path)", () => {
    const input = { ...base, existingWorktreePath: "/repo/wt", worktreeBranch: "feature/x" };
    expect(buildGitAddWorktreePayload(project, input)).toBeNull();
  });

  it("builds a create-worktree payload for a new-worktree draft", () => {
    const input: DraftStartInput = {
      ...base,
      worktreeBranch: "poracode/new-x",
      worktreeBaseBranch: "main",
      worktreeIsNewBranch: true,
    };
    expect(buildGitAddWorktreePayload(project, input)).toEqual({
      projectLocation: { kind: "posix", path: "/repo" },
      branch: "poracode/new-x",
      createBranch: true,
      startPoint: "main",
      copyIgnoredPatterns: ["node_modules", ".env"],
      transferUncommitted: false,
      keepChangesInSource: false,
    });
  });

  it("maps transferUncommitted onto both transfer + keep-in-source (copy semantics)", () => {
    const input: DraftStartInput = {
      ...base,
      worktreeBranch: "poracode/new-x",
      worktreeIsNewBranch: true,
      worktreeTransferUncommitted: true,
    };
    const payload = buildGitAddWorktreePayload(project, input);
    expect(payload?.transferUncommitted).toBe(true);
    expect(payload?.keepChangesInSource).toBe(true);
  });

  it("omits optional fields when the project has no copy patterns or base branch", () => {
    const bare = makeProject("bare", { location: { kind: "posix", path: "/bare" } });
    const input: DraftStartInput = {
      ...base,
      worktreeBranch: "poracode/x",
      worktreeIsNewBranch: true,
    };
    const payload = buildGitAddWorktreePayload(bare, input);
    expect(payload).not.toBeNull();
    expect(payload).not.toHaveProperty("startPoint");
    expect(payload).not.toHaveProperty("copyIgnoredPatterns");
    expect(payload?.createBranch).toBe(true);
  });
});

describe("screenDepth", () => {
  it("ranks home shallowest, then pushed screens, then their subscreens", () => {
    expect(screenDepth("/threads")).toBe(0);
    // Quick-menu destinations, the Settings page, a thread, and the full
    // new-thread composer are all pushed straight from home.
    expect(screenDepth("/thread/abc")).toBe(1);
    expect(screenDepth("/settings")).toBe(1);
    expect(screenDepth("/new")).toBe(1);
    expect(screenDepth("/desktops")).toBe(1);
    expect(screenDepth("/usage")).toBe(1);
    expect(screenDepth("/projects")).toBe(1);
    expect(screenDepth("/browser")).toBe(1);
    expect(screenDepth("/ports")).toBe(1);
    // Settings drill-down: device sections come off the Settings page, the
    // desktop-syncing ones off the deeper Desktop Settings list.
    expect(screenDepth("/settings/desktop")).toBe(2);
    expect(screenDepth("/settings/appearance")).toBe(2);
    expect(screenDepth("/settings/models")).toBe(3);
    expect(screenDepth("/settings/schedules")).toBe(3);
    expect(screenDepth("/workspace/t1")).toBe(2);
    expect(screenDepth("/subagent/t1/parent-1")).toBe(2);
    expect(screenDepth("/notes/t1")).toBe(2);
    expect(screenDepth("/terminal/p1")).toBe(2);
    expect(screenDepth("/pr/42")).toBe(2);
  });
});

describe("threadIdFromPath", () => {
  it("keeps the same thread selected while its desktop workspace panel is open", () => {
    expect(threadIdFromPath("/thread/thread%20one")).toBe("thread one");
    expect(threadIdFromPath("/workspace/thread%20one")).toBe("thread one");
    expect(threadIdFromPath("/notes/thread%20one")).toBe("thread one");
    expect(threadIdFromPath("/subagent/thread%20one/parent-1")).toBe("thread one");
    expect(threadIdFromPath("/settings")).toBeNull();
  });
});

describe("navigationTransitionType", () => {
  it("pushes when going deeper and pops when coming back", () => {
    expect(navigationTransitionType("/threads", "/thread/abc")).toBe("push");
    expect(navigationTransitionType("/thread/abc", "/threads")).toBe("pop");
    expect(navigationTransitionType("/threads", "/settings")).toBe("push");
    expect(navigationTransitionType("/settings", "/threads")).toBe("pop");
    expect(navigationTransitionType("/threads", "/desktops")).toBe("push");
    expect(navigationTransitionType("/settings", "/settings/desktop")).toBe("push");
    expect(navigationTransitionType("/settings", "/settings/appearance")).toBe("push");
    expect(navigationTransitionType("/settings/desktop", "/settings/models")).toBe("push");
    expect(navigationTransitionType("/settings/models", "/settings/desktop")).toBe("pop");
    expect(navigationTransitionType("/thread/abc", "/workspace/abc")).toBe("push");
    expect(navigationTransitionType("/workspace/abc", "/thread/abc")).toBe("pop");
    expect(navigationTransitionType("/thread/abc", "/subagent/abc/parent-1")).toBe("push");
    expect(navigationTransitionType("/subagent/abc/parent-1", "/thread/abc")).toBe("pop");
    expect(navigationTransitionType("/thread/abc", "/notes/abc")).toBe("push");
    expect(navigationTransitionType("/notes/abc", "/thread/abc")).toBe("pop");
  });

  it("fades between same-depth screens (sibling switches)", () => {
    expect(navigationTransitionType("/settings", "/new")).toBe("fade");
    expect(navigationTransitionType("/desktops", "/usage")).toBe("fade");
    expect(navigationTransitionType("/pr/42", "/pr/42/changes")).toBe("fade");
  });

  it("returns null on first paint or a same-path navigation (no animation)", () => {
    expect(navigationTransitionType(undefined, "/threads")).toBeNull();
    expect(navigationTransitionType("/threads", "/threads")).toBeNull();
  });
});
