import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { ProjectFilesPanel } from "./ProjectFilesPanel";

const openFile = vi.fn<() => Promise<never>>();

vi.mock("@/renderer/actions/panelActions", () => ({
  showFilesPanel: vi.fn<() => void>(),
}));

vi.mock("./ProjectTreeView/ProjectTreeView", () => ({
  ProjectTreeView: (props: { onSelectFile: (path: string) => void }) => (
    <button type="button" onClick={() => props.onSelectFile("README.md")}>
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

  it("preserves modal file opening for the desktop panel", () => {
    render(<ProjectFilesPanel rootContext={rootContext} />);

    fireEvent.click(screen.getByRole("button", { name: "README.md" }));

    expect(openFile).toHaveBeenCalledWith("README.md", "modal", true);
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
