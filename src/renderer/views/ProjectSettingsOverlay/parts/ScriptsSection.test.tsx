import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useGitStore } from "@/renderer/state/gitStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ScriptsSection } from "./ScriptsSection";

const { refreshGitProjectMock } = vi.hoisted(() => ({
  refreshGitProjectMock: vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve()),
}));
vi.mock("@/renderer/state/gitRefresh", () => ({ refreshGitProject: refreshGitProjectMock }));

function seedProject(overrides: Partial<Project> = {}) {
  useAppStore.setState((state) => ({
    ...state,
    projects: [
      {
        id: "project-1",
        name: "Repo",
        location: { kind: "posix", path: "/repo" },
        createdAt: "2026-06-10T00:00:00.000Z",
        ...overrides,
      },
    ],
  }));
}

describe("ScriptsSection copy ignored files", () => {
  beforeEach(() => {
    seedProject();
  });

  it("shows stored patterns one per line", () => {
    seedProject({ scripts: { actions: [], worktreeCopyPatterns: [".env", ".env.*"] } });
    render(<ScriptsSection projectId="project-1" />);

    expect(screen.getByLabelText("Copy ignored files")).toHaveValue(".env\n.env.*");
  });

  it("saves parsed patterns on blur, dropping blanks and comments", () => {
    render(<ScriptsSection projectId="project-1" />);

    const textarea = screen.getByLabelText("Copy ignored files");
    fireEvent.change(textarea, { target: { value: " .env \n\n# secrets\n.env.*" } });
    fireEvent.blur(textarea);

    expect(useAppStore.getState().projects[0]?.scripts?.worktreeCopyPatterns).toEqual([
      ".env",
      ".env.*",
    ]);
  });

  it("clears the setting when the textarea is emptied", () => {
    seedProject({ scripts: { actions: [], worktreeCopyPatterns: [".env"] } });
    render(<ScriptsSection projectId="project-1" />);

    const textarea = screen.getByLabelText("Copy ignored files");
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.blur(textarea);

    expect(useAppStore.getState().projects[0]?.scripts?.worktreeCopyPatterns).toBeUndefined();
  });
});

describe("ScriptsSection default worktree base", () => {
  it("loads the branch list when none is cached yet", () => {
    refreshGitProjectMock.mockClear();
    seedProject();
    useGitStore.setState({ branches: {} });
    render(<ScriptsSection projectId="project-1" />);
    expect(refreshGitProjectMock).toHaveBeenCalledWith(
      { id: "project-1", location: { kind: "posix", path: "/repo" } },
      "manual",
      "full",
    );
  });

  it("picks the default worktree base from the project's branches", () => {
    seedProject({ worktreeBaseBranch: "develop" });
    useGitStore.setState({
      branches: {
        "project-1": {
          current: "main",
          branches: [
            { name: "main", current: true, commit: "a", isRemote: false },
            { name: "develop", current: false, commit: "b", isRemote: false },
            { name: "release", current: false, commit: "c", isRemote: true, remote: "origin" },
          ],
        },
      },
    });
    render(<ScriptsSection projectId="project-1" />);

    const trigger = screen.getByRole("button", { name: /Default worktree base/ });
    expect(trigger).toHaveTextContent("develop");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "release" }));
    expect(useAppStore.getState().projects[0]?.worktreeBaseBranch).toBe("release");

    fireEvent.click(screen.getByRole("button", { name: /Default worktree base/ }));
    fireEvent.click(screen.getByRole("option", { name: "Repository default branch" }));
    expect(useAppStore.getState().projects[0]).not.toHaveProperty("worktreeBaseBranch");
  });
});
