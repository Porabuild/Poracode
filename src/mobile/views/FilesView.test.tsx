// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Project, ProjectTreeEntry } from "@/shared/contracts";
import { FilesView } from "./FilesView";

const bridge = vi.hoisted(() => ({
  listProjectTree:
    vi.fn<(payload: unknown) => Promise<{ directoryPath: string; entries: unknown[] }>>(),
  createProjectEntry: vi.fn<(payload: unknown) => Promise<void>>(),
  renameProjectEntry: vi.fn<(payload: unknown) => Promise<void>>(),
  deleteProjectEntry: vi.fn<(payload: unknown) => Promise<void>>(),
  readAbsoluteFile:
    vi.fn<
      (payload: unknown) => Promise<{ status: "ready"; modifiedAtMs: number; content: string }>
    >(),
  readProjectFile: vi.fn<(payload: unknown) => Promise<unknown>>(),
  searchProjectTree: vi.fn<(payload: unknown) => Promise<{ entries: [] }>>(),
  writeProjectFile: vi.fn<(payload: unknown) => Promise<unknown>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

vi.mock("../HighlightedEditor", () => ({
  HighlightedEditor: (props: {
    value: string;
    path: string;
    readOnly?: boolean;
    onChange: (next: string) => void;
  }) => (
    <textarea
      aria-label={`Editor ${props.path}`}
      readOnly={props.readOnly ?? false}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("FilesView", () => {
  beforeEach(() => {
    bridge.listProjectTree.mockReset();
    bridge.createProjectEntry.mockReset();
    bridge.renameProjectEntry.mockReset();
    bridge.deleteProjectEntry.mockReset();
    bridge.readAbsoluteFile.mockReset();
    bridge.readProjectFile.mockReset();
    bridge.searchProjectTree.mockReset();
    bridge.writeProjectFile.mockReset();
    bridge.listProjectTree.mockResolvedValue({ directoryPath: "", entries: [] });
    bridge.readAbsoluteFile.mockResolvedValue({
      status: "ready",
      modifiedAtMs: 123,
      content: "# Plan",
    });
    bridge.readProjectFile.mockResolvedValue({
      path: "notes.md",
      status: "ready",
      modifiedAtMs: 456,
      content: "",
    });
    bridge.searchProjectTree.mockResolvedValue({ entries: [] });
    bridge.createProjectEntry.mockResolvedValue(undefined);
    bridge.renameProjectEntry.mockResolvedValue(undefined);
    bridge.deleteProjectEntry.mockResolvedValue(undefined);
    vi.restoreAllMocks();
  });

  it("opens absolute initial files through the absolute reader as read-only", async () => {
    const planPath = "C:\\Users\\sdsle\\.claude\\plans\\plan.md";
    render(
      <FilesView
        target={{
          project,
          projectLocation: project.location,
          rootLabel: project.name,
        }}
        refreshSignal={0}
        initialFilePath={planPath}
      />,
    );

    const editor = await screen.findByLabelText(`Editor ${planPath}`);

    expect(bridge.readAbsoluteFile).toHaveBeenCalledWith({
      projectLocation: project.location,
      absolutePath: planPath,
    });
    expect(bridge.readProjectFile).not.toHaveBeenCalled();
    expect(editor).toHaveValue("# Plan");
    expect(editor).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(editor, { target: { value: "# Changed" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  it("creates a file from mobile and opens it for editing", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("notes.md");
    render(
      <FilesView
        target={{
          project,
          projectLocation: project.location,
          rootLabel: project.name,
        }}
        refreshSignal={0}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "New file" }));

    await waitFor(() => {
      expect(bridge.createProjectEntry).toHaveBeenCalledWith({
        projectLocation: project.location,
        path: "notes.md",
        type: "file",
      });
    });
    expect(bridge.readProjectFile).toHaveBeenCalledWith({
      projectLocation: project.location,
      path: "notes.md",
    });
  });

  it("renames and deletes existing files from the row action sheet", async () => {
    const appEntry: ProjectTreeEntry = {
      path: "src/app.ts",
      name: "app.ts",
      type: "file",
    };
    bridge.listProjectTree.mockResolvedValue({ directoryPath: "", entries: [appEntry] });
    vi.spyOn(window, "prompt").mockReturnValue("main.ts");
    render(
      <FilesView
        target={{
          project,
          projectLocation: project.location,
          rootLabel: project.name,
        }}
        refreshSignal={0}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Actions for app.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(bridge.renameProjectEntry).toHaveBeenCalledWith({
        projectLocation: project.location,
        path: "src/app.ts",
        nextName: "main.ts",
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Actions for app.ts" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" }).at(-1)!);

    await waitFor(() => {
      expect(bridge.deleteProjectEntry).toHaveBeenCalledWith({
        projectLocation: project.location,
        path: "src/app.ts",
      });
    });
  });
});
