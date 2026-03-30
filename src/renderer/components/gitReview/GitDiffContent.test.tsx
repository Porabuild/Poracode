import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project } from "../../../shared/contracts";

const { bridge } = vi.hoisted(() => ({
  bridge: {
    getGitDiff: vi.fn().mockResolvedValue({ diff: "" }),
    getGitDiffBatch: vi.fn().mockResolvedValue({
      staged: {},
      unstaged: {
        "src/worktree-only.ts": `diff --git a/src/worktree-only.ts b/src/worktree-only.ts
--- a/src/worktree-only.ts
+++ b/src/worktree-only.ts
@@ -1 +1 @@
-old
+new
`,
        "docs/untracked.md": `diff --git a/docs/untracked.md b/docs/untracked.md
new file mode 100644
--- /dev/null
+++ b/docs/untracked.md
@@ -0,0 +1 @@
+hello
`,
      },
    }),
  },
}));

vi.mock("@git-diff-view/react", () => ({
  DiffView: () => <div>diff view</div>,
  DiffFile: {
    createInstance: () => ({
      init: () => undefined,
      buildUnifiedDiffLines: () => undefined,
      buildSplitDiffLines: () => undefined,
    }),
  },
}));

vi.mock("@git-diff-view/react/styles/diff-view.css", () => ({}));

vi.mock("../../bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("../../state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: { themeMode: "light" | "dark" | "system" }) => unknown) =>
    selector({ themeMode: "dark" }),
}));

import { GitDiffContent } from "./GitDiffContent";

describe("GitDiffContent", () => {
  beforeAll(() => {
    if (typeof globalThis.IntersectionObserver === "undefined") {
      globalThis.IntersectionObserver = class IntersectionObserverStub implements IntersectionObserver {
        readonly root = null;
        readonly rootMargin = "";
        readonly scrollMargin = "";
        readonly thresholds = [];

        disconnect() {}
        observe() {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
        unobserve() {}
      };
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads batch diffs from the provided worktree status", async () => {
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      staged: [],
      unstaged: [
        {
          path: "src/worktree-only.ts",
          status: "M",
          staged: false,
          insertions: 1,
          deletions: 1,
        },
        {
          path: "docs/untracked.md",
          status: "?",
          staged: false,
          insertions: 1,
          deletions: 0,
        },
      ],
      totalInsertions: 2,
      totalDeletions: 1,
    };

    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };

    render(
      <GitDiffContent
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        diffMode={1}
        diffFilter="changes"
        refreshKey={0}
      />,
    );

    await waitFor(() => {
      expect(bridge.getGitDiffBatch).toHaveBeenCalledWith({
        projectLocation: { kind: "windows", path: "C:\\repo-worktree" },
        untrackedPaths: ["docs/untracked.md"],
      });
    });

    expect(screen.getByText("src/worktree-only.ts")).toBeInTheDocument();
    expect(screen.getByText("docs/untracked.md")).toBeInTheDocument();
    expect(screen.queryByText("src/main-only.ts")).not.toBeInTheDocument();
  });

  it("re-parses locally when the diff mode changes instead of refetching the batch", async () => {
    const gitStatus: GitStatusResult = {
      isRepo: true,
      branch: "feature/worktree",
      staged: [],
      unstaged: [
        {
          path: "src/worktree-only.ts",
          status: "M",
          staged: false,
          insertions: 1,
          deletions: 1,
        },
      ],
      totalInsertions: 1,
      totalDeletions: 1,
    };

    const project: Project = {
      id: "project-1",
      name: "Lightcode",
      createdAt: new Date().toISOString(),
      location: { kind: "windows", path: "C:\\repo-worktree" },
    };

    const { rerender } = render(
      <GitDiffContent
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        diffMode={1}
        diffFilter="changes"
        refreshKey={0}
      />,
    );

    await waitFor(() => {
      expect(bridge.getGitDiffBatch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <GitDiffContent
        project={project}
        gitStatus={gitStatus}
        selectedFile={null}
        selectedStaged={false}
        diffMode={4}
        diffFilter="changes"
        refreshKey={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("src/worktree-only.ts")).toBeInTheDocument();
    });
    expect(bridge.getGitDiffBatch).toHaveBeenCalledTimes(1);
  });
});
