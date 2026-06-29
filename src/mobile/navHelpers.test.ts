import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import { buildGitAddWorktreePayload, selectDraftProject } from "./navHelpers";

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      setPendingDraftWorktreeSelection: () => undefined,
      openDraft: () => undefined,
    }),
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
      worktreeBranch: "lightcode/new-x",
      worktreeBaseBranch: "main",
      worktreeIsNewBranch: true,
    };
    expect(buildGitAddWorktreePayload(project, input)).toEqual({
      projectLocation: { kind: "posix", path: "/repo" },
      branch: "lightcode/new-x",
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
      worktreeBranch: "lightcode/new-x",
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
      worktreeBranch: "lightcode/x",
      worktreeIsNewBranch: true,
    };
    const payload = buildGitAddWorktreePayload(bare, input);
    expect(payload).not.toBeNull();
    expect(payload).not.toHaveProperty("startPoint");
    expect(payload).not.toHaveProperty("copyIgnoredPatterns");
    expect(payload?.createBranch).toBe(true);
  });
});
