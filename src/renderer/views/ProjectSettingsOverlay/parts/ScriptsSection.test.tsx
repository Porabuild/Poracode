import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ScriptsSection } from "./ScriptsSection";

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
