import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { GitReviewPanelContent } from "./GitReviewPanelContent";

vi.mock("@/renderer/components/common/PixelLoader", () => ({
  PixelLoader: () => <span>loading</span>,
}));

const gitPanelProps = vi.hoisted(() => ({
  current: null as { statusKey?: string; locationOverride?: ProjectLocation } | null,
}));

vi.mock("@/renderer/views/GitReviewOverlay/parts/GitReviewPanel", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    GitReviewPanel: (props: { statusKey?: string; locationOverride?: ProjectLocation }) => {
      gitPanelProps.current = props;
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
    gitPanelProps.current = null;
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

  it("keeps the remote location override and status key while the draft project changes", async () => {
    const remoteProject: Project = {
      id: "remote:mac-desktop:project:project-1",
      remoteServerId: "mac-desktop",
      remoteId: "project-1",
      name: "Poracode on Mac",
      createdAt: new Date().toISOString(),
      location: { kind: "posix", path: "/Users/me/repo", remoteServerId: "mac-desktop" },
    };
    const localDraftProject: Project = {
      ...project,
      id: "local-draft",
    };
    const remoteWorktreePath = "/Users/me/repo/.poracode/worktrees/remote-branch";
    const gitPanelContext = { projectId: remoteProject.id, worktreePath: remoteWorktreePath };
    useAppStore.setState({
      projects: [remoteProject, localDraftProject],
      view: { kind: "draft", projectId: localDraftProject.id },
    });

    const { rerender } = render(
      <GitReviewPanelContent
        gitPanelContext={gitPanelContext}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
      />,
    );

    const expectRemotePanel = () => {
      expect(gitPanelProps.current).toMatchObject({
        statusKey: remoteWorktreePath,
        locationOverride: {
          kind: "posix",
          path: remoteWorktreePath,
          remoteServerId: "mac-desktop",
        },
      });
    };
    expect(await screen.findByTestId("status-key")).toHaveTextContent(remoteWorktreePath);
    expectRemotePanel();

    await act(async () => {
      useAppStore.setState({ view: { kind: "draft", projectId: remoteProject.id } });
    });
    rerender(
      <GitReviewPanelContent
        gitPanelContext={gitPanelContext}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
      />,
    );
    expectRemotePanel();

    await act(async () => {
      useAppStore.setState({ view: { kind: "draft", projectId: localDraftProject.id } });
    });
    rerender(
      <GitReviewPanelContent
        gitPanelContext={gitPanelContext}
        onClose={() => undefined}
        onExpandToOverlay={() => undefined}
      />,
    );
    expectRemotePanel();
  });
});
