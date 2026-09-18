import { beforeEach, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { openFileInEditor } from "./gitHelpers";

const { editor, layout } = vi.hoisted(() => ({
  layout: { compact: false },
  editor: {
    rootContext: null,
    setRootContext: vi.fn<(context: unknown) => void>(),
    openFile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  },
}));
vi.mock("@/renderer/state/fileEditorStore", () => ({
  useFileEditorStore: { getState: () => editor },
}));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isCompactLayoutViewport: () => layout.compact,
}));

beforeEach(() => {
  vi.clearAllMocks();
  layout.compact = false;
});

it.each(
  ["/remote/notes/plan.md", "C:\\notes\\plan.md", "README.md"].flatMap((path) =>
    [false, true].map((compact) => ({ path, compact })),
  ),
)(
  "opens remote file $path through the owning editor context (compact=$compact)",
  async ({ path, compact }) => {
    layout.compact = compact;
    const project: Project = {
      id: "remote-project",
      remoteServerId: "owning-host",
      name: "Remote project",
      location: path.startsWith("C:")
        ? { kind: "windows", path: "C:\\remote\\project" }
        : { kind: "posix", path: "/remote/project" },
      createdAt: "2026-09-08T00:00:00Z",
    };
    await openFileInEditor(project, undefined, undefined, path, { lineNumber: 7 });
    expect(editor.setRootContext).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        remoteServerId: "owning-host",
        projectLocation: project.location,
      }),
    );
    expect(editor.openFile).toHaveBeenCalledWith(path, compact ? "fullscreen" : "modal", false, {
      lineNumber: 7,
    });
  },
);
