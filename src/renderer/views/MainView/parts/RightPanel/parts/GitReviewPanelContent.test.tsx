import { fireEvent, render, screen } from "@testing-library/react";
import type { Project } from "@/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { GitReviewPanelContent } from "./GitReviewPanelContent";

vi.mock("@/renderer/components/common", () => ({
  PixelLoader: () => <span>loading</span>,
}));

vi.mock("@/renderer/views/GitReviewOverlay/parts/GitReviewPanel", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    GitReviewPanel: (props: { statusKey?: string }) => {
      const [value, setValue] = React.useState("");
      return (
        <div>
          <div data-testid="status-key">{props.statusKey ?? "main"}</div>
          <input
            aria-label="Commit message"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      );
    },
  };
});

describe("GitReviewPanelContent", () => {
  const project: Project = {
    id: "project-1",
    name: "Poracode",
    createdAt: new Date().toISOString(),
    location: { kind: "windows", path: "C:\\repo" },
  };

  beforeEach(() => {
    useAppStore.setState({ projects: [project], threads: [] });
  });

  it("remounts git review state when switching worktrees", async () => {
    const { rerender } = render(
      <GitReviewPanelContent
        gitPanelContext={{ projectId: project.id, worktreePath: "C:\\repo-a" }}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
      />,
    );

    const input = await screen.findByLabelText("Commit message");
    fireEvent.change(input, { target: { value: "commit from first worktree" } });
    expect(input).toHaveValue("commit from first worktree");

    rerender(
      <GitReviewPanelContent
        gitPanelContext={{ projectId: project.id, worktreePath: "C:\\repo-b" }}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
      />,
    );

    expect(await screen.findByTestId("status-key")).toHaveTextContent("C:\\repo-b");
    expect(screen.getByLabelText("Commit message")).toHaveValue("");
  });
});
