// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadAbsoluteFileResult, Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadDetail } from "./ThreadDetail";
import { WorkspaceRoute } from "./routeComponents";
import { useDesktopPanelStore } from "./desktopPanelStore";

const fixture = vi.hoisted(() => ({
  wide: false,
  search: {} as { tab?: "changes" | "files"; file?: string; folder?: string; line?: number },
  navigate: vi.fn<(input: unknown) => void>(),
  remote: {
    booted: true,
    activeThreads: [] as Thread[],
    projects: [] as Project[],
    activeDesktop: { desktopId: "desktop-1" },
    selectedThreadSnapshot: null as { thread: Thread } | null,
    openThread: vi.fn<(thread: Thread) => Promise<void>>(),
  },
  bridge: {
    readAbsoluteFile: vi.fn<() => Promise<ReadAbsoluteFileResult>>(),
    listProjectTree: vi
      .fn<() => Promise<{ directoryPath: string; entries: [] }>>()
      .mockResolvedValue({ directoryPath: "", entries: [] }),
    searchProjectTree: vi.fn<() => Promise<{ entries: [] }>>().mockResolvedValue({ entries: [] }),
    readProjectFile: vi.fn<() => Promise<unknown>>(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useParams: () => ({ threadId: "thread-1" }),
    useSearch: () => fixture.search,
  }),
  useNavigate: () => fixture.navigate,
}));
vi.mock("./remoteContext", () => ({ useRemote: () => fixture.remote }));
vi.mock("./useMediaQuery", () => ({
  DESKTOP_RIGHT_PANEL_QUERY: "wide",
  WIDE_SHELL_QUERY: "wide",
  useMediaQuery: () => fixture.wide,
}));
vi.mock("./useGitSummaryHydration", () => ({ useGitSummaryHydration: () => undefined }));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => fixture.bridge,
  isRemoteSession: () => true,
}));
vi.mock("./views/GitView", () => ({ GitView: () => null, useGitTargetStatus: () => undefined }));
vi.mock("./HighlightedEditor", () => ({
  HighlightedEditor: (props: { value: string; readOnly?: boolean }) => (
    <textarea aria-label="File contents" value={props.value} readOnly={props.readOnly} />
  ),
}));
vi.mock("./views/ThreadView", () => ({
  ThreadView: (props: {
    onOpenWorkspace?: (tab: "files") => void;
    onOpenWorkspaceFolder?: (path: string) => void;
    onOpenWorkspaceFile?: (path: string, line: number) => void;
  }) => (
    <>
      <span>Thread ready</span>
      {props.onOpenWorkspace ? (
        <button type="button" onClick={() => props.onOpenWorkspace?.("files")}>
          Workspace
        </button>
      ) : null}
      {props.onOpenWorkspaceFolder ? (
        <button type="button" onClick={() => props.onOpenWorkspaceFolder?.("Documents")}>
          Folder
        </button>
      ) : null}
      <button type="button" onClick={() => props.onOpenWorkspaceFile?.("/output/report.md", 7)}>
        Citation
      </button>
    </>
  ),
}));

const project: Project = {
  id: HOME_PROJECT_ID,
  name: "Home",
  location: { kind: "posix", path: "/home/test" },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const thread = { id: "thread-1", projectId: HOME_PROJECT_ID } as Thread;

describe("mobile Home workspace entry points", () => {
  beforeEach(() => {
    fixture.wide = false;
    fixture.search = {};
    fixture.navigate.mockClear();
    fixture.remote.projects = [project];
    fixture.remote.activeThreads = [thread];
    fixture.remote.selectedThreadSnapshot = { thread };
    fixture.bridge.readAbsoluteFile
      .mockReset()
      .mockResolvedValue({ status: "ready", content: "Report", modifiedAtMs: 1 });
    fixture.bridge.listProjectTree.mockClear();
    fixture.bridge.searchProjectTree.mockClear();
    fixture.bridge.readProjectFile.mockClear();
    useDesktopPanelStore.getState().reset();
  });

  it.each([false, true])(
    "keeps Home file citations available without project browsing (wide=%s)",
    async (wide) => {
      fixture.wide = wide;
      render(<ThreadDetail thread={thread} hideHeader={false} />);
      await screen.findByText("Thread ready");
      expect(screen.queryByRole("button", { name: "Workspace" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Folder" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Citation" }));
      expect(
        wide ? useDesktopPanelStore.getState() : fixture.navigate.mock.calls[0]?.[0],
      ).toMatchObject(
        wide
          ? { open: true, initialFilePath: "/output/report.md", initialLineNumber: 7 }
          : {
              to: "/workspace/$threadId",
              params: { threadId: thread.id },
              search: { tab: "files", file: "/output/report.md", line: 7 },
            },
      );
    },
  );

  it.each([false, true])("keeps project browsing available (wide=%s)", async (wide) => {
    fixture.wide = wide;
    const projectThread = { ...thread, projectId: "project-1" };
    render(<ThreadDetail thread={projectThread} hideHeader={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Workspace" }));
    expect(screen.getByRole("button", { name: "Folder" })).toBeInTheDocument();
    expect(
      wide ? useDesktopPanelStore.getState() : fixture.navigate.mock.calls[0]?.[0],
    ).toMatchObject(
      wide
        ? { open: true, activeTab: "files" }
        : {
            to: "/workspace/$threadId",
            params: { threadId: thread.id },
            search: { tab: "files" },
          },
    );
  });

  it.each(
    [false, true].flatMap((wide) =>
      [{}, { tab: "files" }, { tab: "changes" }, { folder: "Documents" }, { folder: "" }].map(
        (search) => ({ wide, search }),
      ),
    ),
  )("shows a labeled Home route and a working Back for %o", async ({ wide, search }) => {
    fixture.wide = wide;
    fixture.search = search as typeof fixture.search;
    render(<WorkspaceRoute />);
    expect(await screen.findByText("No file selected.")).toBeInTheDocument();
    expect(fixture.bridge.listProjectTree).not.toHaveBeenCalled();
    expect(fixture.bridge.searchProjectTree).not.toHaveBeenCalled();
    expect(fixture.bridge.readAbsoluteFile).not.toHaveBeenCalled();
    expect(useDesktopPanelStore.getState().open).toBe(false);
    expect(fixture.navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/thread/$threadId",
      params: { threadId: thread.id },
    });
  });

  it("keeps a stale Home folder route empty across narrow/wide layout changes", async () => {
    fixture.search = { tab: "files", folder: "Documents" };
    const { rerender } = render(<WorkspaceRoute />);
    await screen.findByText("No file selected.");
    for (const wide of [true, false, true]) {
      fixture.wide = wide;
      rerender(<WorkspaceRoute />);
      expect(screen.getByText("No file selected.")).toBeInTheDocument();
      expect(useDesktopPanelStore.getState().open).toBe(false);
    }
    expect(fixture.navigate).not.toHaveBeenCalled();
    expect(fixture.bridge.listProjectTree).not.toHaveBeenCalled();
  });

  it("clears the previous Home file when the route no longer selects one", async () => {
    fixture.search = { file: "/output/report.md" };
    const { rerender } = render(<WorkspaceRoute />);
    await screen.findByRole("textbox", { name: "File contents" });
    fixture.search = { folder: "Documents" };
    rerender(<WorkspaceRoute />);
    expect(await screen.findByText("No file selected.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(fixture.bridge.listProjectTree).not.toHaveBeenCalled();
  });

  function selectProjectRoute() {
    fixture.remote.projects = [{ ...project, id: "project-1", name: "Repo" }];
    fixture.remote.activeThreads = [{ ...thread, projectId: "project-1" }];
    fixture.search = { tab: "files" };
  }
  it("preserves the narrow project file tree", async () => {
    selectProjectRoute();
    render(<WorkspaceRoute />);
    await waitFor(() => expect(fixture.bridge.listProjectTree).toHaveBeenCalled());
    expect(screen.queryByText("No file selected.")).not.toBeInTheDocument();
  });
  it("preserves the wide project file panel route", () => {
    selectProjectRoute();
    fixture.wide = true;
    render(<WorkspaceRoute />);
    expect(useDesktopPanelStore.getState()).toMatchObject({ open: true, activeTab: "files" });
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/thread/$threadId",
      params: { threadId: thread.id },
      replace: true,
    });
  });

  it("routes an explicit wide Home citation to the editor request", () => {
    fixture.wide = true;
    fixture.search = { tab: "files", file: "/output/report.md", line: 7 };
    render(<WorkspaceRoute />);
    expect(useDesktopPanelStore.getState()).toMatchObject({
      open: true,
      initialFilePath: "/output/report.md",
      initialLineNumber: 7,
    });
  });

  it("shows loading and then the read-only file for a narrow Home citation", async () => {
    const read = Promise.withResolvers<ReadAbsoluteFileResult>();
    fixture.bridge.readAbsoluteFile.mockReturnValue(read.promise);
    fixture.search = { file: "/output/report.md" };
    render(<WorkspaceRoute />);
    await waitFor(() => expect(fixture.bridge.readAbsoluteFile).toHaveBeenCalled());
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("No file selected.")).not.toBeInTheDocument();
    await act(async () => read.resolve({ status: "ready", content: "Report", modifiedAtMs: 1 }));
    expect(await screen.findByRole("textbox", { name: "File contents" })).toHaveValue("Report");
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
    expect(fixture.bridge.listProjectTree).not.toHaveBeenCalled();
  });

  it.each(["EACCES", "EISDIR"])(
    "keeps a labeled state and Back after a failed Home read (%s)",
    async (error) => {
      fixture.bridge.readAbsoluteFile.mockRejectedValue(new Error(error));
      fixture.search = { file: "/output/report.md" };
      render(<WorkspaceRoute />);
      await waitFor(() => expect(fixture.bridge.readAbsoluteFile).toHaveBeenCalled());
      expect(await screen.findByText("No file selected.")).toBeInTheDocument();
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(fixture.navigate).toHaveBeenCalledWith({
        to: "/thread/$threadId",
        params: { threadId: thread.id },
      });
      expect(fixture.bridge.listProjectTree).not.toHaveBeenCalled();
    },
  );
});
