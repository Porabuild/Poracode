import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { buildFileEditorContext, openFileInEditor } from "./gitHelpers";
import { createChatPaneFileActions } from "@/renderer/components/thread/ChatPane/chatPaneFileActions";
import { useProjectTreeStore } from "@/renderer/state/projectTreeStore";

const project: Project = {
  id: "project",
  name: "Project",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-09-18T00:00:00Z",
};
const homeProject: Project = {
  ...project,
  id: HOME_PROJECT_ID,
  name: "Home",
  location: { kind: "posix", path: "/home/test" },
};
const readExternalFile = vi.fn<PoracodeBridge["readExternalFile"]>(async ({ absolutePath }) => ({
  path: absolutePath,
  status: "ready" as const,
  content: "notes",
  modifiedAtMs: 1,
}));

beforeEach(() => {
  vi.restoreAllMocks();
  readExternalFile.mockClear();
  Object.defineProperty(window, "poracode", { configurable: true, value: { readExternalFile } });
  useFileEditorStore.getState().clearSession();
  useFileEditorStore.getState().setRootContext(buildFileEditorContext(project));
  useFileEditorStore.setState({
    activePath: "draft.md",
    tabs: ["draft.md"],
    buffers: {
      "draft.md": {
        path: "draft.md",
        status: "ready",
        modifiedAtMs: 1,
        content: "unsaved edit",
        savedContent: "original",
        lineEnding: "lf",
        hasBom: false,
        isDirty: true,
        isLoading: false,
      },
    },
  });
});

describe("file opens across editor contexts", () => {
  it("preserves a dirty Home file when a project-folder switch is cancelled", () => {
    useFileEditorStore.setState({ rootContext: buildFileEditorContext(homeProject) });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const expand = vi.spyOn(useProjectTreeStore.getState(), "expandMany");
    const before = useFileEditorStore.getState();
    const actions = createChatPaneFileActions({
      project,
      targetContext: buildFileEditorContext(project),
    });
    actions.revealProjectFolderInTree!("src");
    expect(confirm).toHaveBeenCalledExactlyOnceWith("Discard unsaved editor changes?");
    expect(useFileEditorStore.getState().rootContext).toBe(before.rootContext);
    expect(useFileEditorStore.getState().buffers).toBe(before.buffers);
    expect(expand).not.toHaveBeenCalled();
  });

  it("preserves unsaved project edits when the Home context switch is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const before = useFileEditorStore.getState();
    await openFileInEditor(homeProject, undefined, undefined, "/tmp/notes.md");
    expect(confirm).toHaveBeenCalledExactlyOnceWith("Discard unsaved editor changes?");
    expect(useFileEditorStore.getState().rootContext).toBe(before.rootContext);
    expect(useFileEditorStore.getState().buffers).toBe(before.buffers);
    expect(useFileEditorStore.getState().activePath).toBe("draft.md");
    expect(readExternalFile).not.toHaveBeenCalled();
  });

  it("opens the Home file after an explicit discard", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await openFileInEditor(homeProject, undefined, undefined, "/tmp/notes.md");
    expect(useFileEditorStore.getState().rootContext?.projectId).toBe(HOME_PROJECT_ID);
    expect(readExternalFile).toHaveBeenCalledExactlyOnceWith({
      projectLocation: homeProject.location,
      absolutePath: "/tmp/notes.md",
    });
  });

  it("preserves dirty buffers without prompting when opening in the same context", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openFileInEditor(project, undefined, undefined, "/tmp/notes.md");
    expect(confirm).not.toHaveBeenCalled();
    expect(useFileEditorStore.getState().buffers["draft.md"]?.content).toBe("unsaved edit");
    expect(useFileEditorStore.getState().buffers["draft.md"]?.isDirty).toBe(true);
    expect(readExternalFile).toHaveBeenCalledOnce();
  });
});
