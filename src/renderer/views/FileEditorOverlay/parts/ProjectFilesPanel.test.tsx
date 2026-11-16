import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadProjectFileResult } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { ProjectFilesPanel, ProjectFilesPanelVisibilityContext } from "./ProjectFilesPanel";

const openFile = vi.fn<() => Promise<ReadProjectFileResult>>();

vi.mock("@/renderer/actions/panelActions", () => ({
  showFilesPanel: vi.fn<() => void>(),
}));

vi.mock("./ProjectTreeView/ProjectTreeView", () => ({
  ProjectTreeView: (props: { onSelectFile: (path: string) => void; visible: boolean }) => (
    <button
      type="button"
      data-visible={String(props.visible)}
      onClick={() => props.onSelectFile("README.md")}
    >
      README.md
    </button>
  ),
}));

const rootContext = {
  projectId: "project-1",
  projectName: "Poracode",
  projectLocation: { kind: "posix" as const, path: "/repo" },
  rootLabel: "Poracode",
};

describe("ProjectFilesPanel", () => {
  beforeEach(() => {
    openFile.mockReset().mockRejectedValue(new Error("stop after assertion"));
    useFileEditorStore.setState({ overlayMode: null, openFile });
  });

  it("opens the existing fullscreen editor from the compact file tree", () => {
    render(<ProjectFilesPanel rootContext={rootContext} compact />);

    fireEvent.click(screen.getByRole("button", { name: "README.md" }));

    expect(openFile).toHaveBeenCalledWith("README.md", "fullscreen", true);
  });

  it("preserves inline file opening for the desktop panel", () => {
    render(<ProjectFilesPanel rootContext={rootContext} />);

    fireEvent.click(screen.getByRole("button", { name: "README.md" }));

    expect(openFile).toHaveBeenCalledWith("README.md", "modal", true);
  });

  it("preserves panel and compact-tab visibility while the inline editor is open", () => {
    const view = render(<ProjectFilesPanel rootContext={rootContext} />);
    const visible = () =>
      screen.getByRole("button", { name: "README.md" }).getAttribute("data-visible");
    expect(visible()).toBe("true");
    view.rerender(<ProjectFilesPanel rootContext={rootContext} visible={false} />);
    expect(visible()).toBe("false");
    view.rerender(
      <ProjectFilesPanel rootContext={rootContext} compact compactActionsVisible={false} visible />,
    );
    expect(visible()).toBe("false");
    view.rerender(<ProjectFilesPanel rootContext={rootContext} compact compactActionsVisible />);
    expect(visible()).toBe("true");
    act(() => useFileEditorStore.getState().setOverlayMode("modal"));
    expect(visible()).toBe("true");
    view.rerender(<ProjectFilesPanel rootContext={rootContext} visible={false} />);
    expect(visible()).toBe("false");
    view.rerender(<ProjectFilesPanel rootContext={rootContext} visible />);
    act(() => useFileEditorStore.getState().setOverlayMode(null));
    expect(visible()).toBe("true");
  });

  it("keeps the visible tree active when opening a file activates the inline editor", async () => {
    openFile.mockImplementation(async () => {
      useFileEditorStore.getState().setOverlayMode("modal");
      return {
        path: "README.md",
        status: "ready",
        content: "# Hello",
        modifiedAtMs: 1,
        lineEnding: "lf",
        hasBom: false,
      };
    });
    render(<ProjectFilesPanel rootContext={rootContext} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "README.md" })));
    expect(useFileEditorStore.getState().overlayMode).toBe("modal");
    expect(screen.getByRole("button", { name: "README.md" })).toHaveAttribute(
      "data-visible",
      "true",
    );
  });

  it("suspends the retained panel during its exit animation", () => {
    const panel = <ProjectFilesPanel rootContext={rootContext} visible />;
    const view = render(
      <ProjectFilesPanelVisibilityContext value={true}>{panel}</ProjectFilesPanelVisibilityContext>,
    );
    expect(screen.getByRole("button", { name: "README.md" })).toHaveAttribute(
      "data-visible",
      "true",
    );
    view.rerender(
      <ProjectFilesPanelVisibilityContext value={false}>
        {panel}
      </ProjectFilesPanelVisibilityContext>,
    );
    expect(screen.getByRole("button", { name: "README.md" })).toHaveAttribute(
      "data-visible",
      "false",
    );
  });

  it.each([false, true])(
    "suspends the covered tree until fullscreen closes (compact=%s)",
    (compact) => {
      render(<ProjectFilesPanel rootContext={rootContext} compact={compact} />);
      expect(screen.getByRole("button", { name: "README.md" })).toBeInTheDocument();
      act(() => useFileEditorStore.getState().setOverlayMode("fullscreen"));
      expect(screen.queryByRole("button", { name: "README.md" })).not.toBeInTheDocument();
      act(() => useFileEditorStore.getState().setOverlayMode(null));
      fireEvent.click(screen.getByRole("button", { name: "README.md" }));
      expect(openFile).toHaveBeenCalledWith("README.md", compact ? "fullscreen" : "modal", true);
    },
  );
});
