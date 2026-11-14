import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { GitStatusResult, Project } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  batch:
    vi.fn<() => Promise<{ staged: Record<string, string>; unstaged: Record<string, string> }>>(),
  content: vi.fn<(payload: unknown) => Promise<{ oldContent: string; newContent: string }>>(),
  build:
    vi.fn<
      (
        items: { diff: string; oldContent?: string; newContent?: string }[],
      ) => Promise<{ data: { text: string }; bundle: object }[]>
    >(),
  models: [] as { clear: () => void; text: string }[],
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ getGitDiffBatch: mocks.batch, getGitFileContent: mocks.content }),
}));
vi.mock("@/renderer/components/common", () => ({ PixelLoader: () => <span>Loading</span> }));
vi.mock("@/renderer/components/common/PixelLoader", () => ({
  PixelLoader: () => <span>Loading section</span>,
}));
vi.mock("../diffBuildClient", () => ({
  useDiffTheme: () => "dark",
  getLang: () => "typescript",
  extractDiffNames: () => ({ oldName: "file.ts", newName: "file.ts" }),
  buildInWorker: mocks.build,
  diffFileFromBundle: (data: { text: string }) => {
    const model = { clear: vi.fn<() => void>(), text: data.text };
    mocks.models.push(model);
    return model;
  },
}));
vi.mock("./parts/SingleFileDiff", () => ({ SingleFileDiff: () => <div>Selected file</div> }));
vi.mock("../DiffAnnotationView", () => ({
  DiffAnnotationView: ({
    diffFile,
    onEditingChange,
  }: {
    diffFile: { text: string };
    onEditingChange: (editing: boolean) => void;
  }) => {
    const [body, setBody] = useState("");
    return (
      <div data-testid="diff-view">
        {diffFile.text}
        <button type="button" onClick={() => onEditingChange(true)}>
          Add comment
        </button>
        <input aria-label="Comment draft" value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="button" onClick={() => onEditingChange(false)}>
          Cancel comment
        </button>
      </div>
    );
  },
}));
import { GitDiffContent } from "./GitDiffContent";

const observers = new Map<Element, IntersectionObserverCallback>();
class VisibilityObserver {
  constructor(readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    observers.set(target, this.callback);
  }
  disconnect() {
    for (const [target, callback] of observers)
      if (callback === this.callback) observers.delete(target);
  }
}
function visible(index: number, isIntersecting: boolean) {
  const target = document.querySelectorAll("[data-diff-key]")[index]!;
  act(() =>
    observers.get(target)!(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}
const patch = "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-before\n+after\n";
const project: Project = {
  id: "project",
  name: "Project",
  createdAt: "2026-01-01",
  location: { kind: "posix", path: "/project" },
};
const status: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "",
  hasRemote: false,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  totalInsertions: 82,
  totalDeletions: 82,
  detail: "full",
  unstaged: Array.from({ length: 82 }, (_, i) => ({
    path: `file-${i}.ts`,
    status: "M",
    staged: false,
    insertions: 1,
    deletions: 1,
  })),
};
const props = {
  project,
  gitStatus: status,
  selectedFile: null,
  selectedStaged: false,
  diffMode: 1,
  diffFilter: "changes" as const,
  refreshKey: 0,
  worktreePath: undefined,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.models.length = 0;
  observers.clear();
  vi.stubGlobal("IntersectionObserver", VisibilityObserver);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.batch.mockResolvedValue({
    staged: {},
    unstaged: Object.fromEntries(status.unstaged.map((f) => [f.path, patch])),
  });
  mocks.content.mockResolvedValue({ oldContent: "before", newContent: "after" });
  mocks.build.mockImplementation(async (items: { diff: string }[]) =>
    items.map((item) => ({ data: { text: item.diff }, bundle: {} })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function loaded() {
  await waitFor(() => {
    const sections = document.querySelectorAll("[data-diff-key]");
    expect(sections).toHaveLength(82);
    expect([...sections].every((section) => observers.has(section))).toBe(true);
  });
}

describe("deferred aggregate Git diffs", () => {
  it("builds only nearby files and releases their DOM when covered or scrolled away", async () => {
    const view = render(<GitDiffContent {...props} />);
    await loaded();
    expect(mocks.content).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
    visible(0, true);
    await screen.findByTestId("diff-view");
    expect(mocks.content).toHaveBeenCalledTimes(1);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(mocks.build.mock.calls[0]![0][0]).toMatchObject({
      oldContent: "before",
      newContent: "after",
    });
    visible(0, false);
    expect(screen.queryByTestId("diff-view")).toBeNull();
    visible(0, true);
    await screen.findByTestId("diff-view");
    expect(mocks.build).toHaveBeenCalledTimes(1);
    view.rerender(<GitDiffContent {...props} selectedFile="file-1.ts" />);
    expect(screen.queryByTestId("diff-view")).toBeNull();
    expect(screen.getByText("Selected file")).toBeTruthy();
    view.rerender(<GitDiffContent {...props} />);
    await screen.findByTestId("diff-view");
    expect(mocks.content).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(mocks.models[0]!.clear).toHaveBeenCalledTimes(1);
  });
  it("retains an unsent annotation while offscreen, then releases the body on cancel", async () => {
    render(<GitDiffContent {...props} />);
    await loaded();
    visible(0, true);
    await screen.findByTestId("diff-view");
    fireEvent.click(screen.getByText("Add comment"));
    fireEvent.change(screen.getByLabelText("Comment draft"), {
      target: { value: "Keep this draft" },
    });
    visible(0, false);
    expect((screen.getByLabelText("Comment draft") as HTMLInputElement).value).toBe(
      "Keep this draft",
    );
    fireEvent.click(screen.getByText("Cancel comment"));
    expect(screen.queryByTestId("diff-view")).toBeNull();
  });
  it("opens collapsed unseen sections for Find without constructing other files", async () => {
    render(<GitDiffContent {...props} />);
    await loaded();
    const section = document.querySelectorAll("[data-diff-key]")[80]!;
    fireEvent.click(section.querySelector('[role="button"]')!);
    act(() => {
      section.dispatchEvent(new Event("poracode-reveal-diff"));
    });
    await screen.findByTestId("diff-view");
    expect(mocks.content).toHaveBeenCalledTimes(1);
    expect(mocks.content).toHaveBeenCalledWith(expect.objectContaining({ filePath: "file-80.ts" }));
  });
  it("falls back to the patch when full contents cannot be read", async () => {
    mocks.content.mockRejectedValue(new Error("file unavailable"));
    render(<GitDiffContent {...props} />);
    await loaded();
    visible(0, true);
    await screen.findByTestId("diff-view");
    expect(mocks.build.mock.calls[0]![0][0]!.diff).toBe(patch);
    expect(mocks.build.mock.calls[0]![0][0]!.oldContent).toBeUndefined();
  });
  it("does not construct a stale response after its section leaves the viewport", async () => {
    let finish!: (value: { oldContent: string; newContent: string }) => void;
    mocks.content.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<GitDiffContent {...props} />);
    await loaded();
    visible(0, true);
    visible(0, false);
    await act(async () => finish({ oldContent: "before", newContent: "after" }));
    expect(mocks.build).not.toHaveBeenCalled();
    expect(screen.queryByTestId("diff-view")).toBeNull();
  });
  it("falls back to a patch-only model when the full-content build fails", async () => {
    mocks.build.mockRejectedValueOnce(new Error("content build failed"));
    render(<GitDiffContent {...props} />);
    await loaded();
    visible(0, true);
    await screen.findByTestId("diff-view");
    expect(mocks.build).toHaveBeenCalledTimes(2);
    expect(mocks.build.mock.calls[1]![0][0]).toMatchObject({ diff: patch });
    expect(mocks.build.mock.calls[1]![0][0]!.oldContent).toBeUndefined();
  });
  it("invalidates visited models on explicit refresh even when status counts do not change", async () => {
    const view = render(<GitDiffContent {...props} />);
    await loaded();
    visible(0, true);
    await screen.findByTestId("diff-view");
    view.rerender(<GitDiffContent {...props} refreshKey={1} />);
    await waitFor(() => expect(mocks.batch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.models).toHaveLength(2));
    expect(mocks.models[0]!.clear).toHaveBeenCalledTimes(1);
  });
});
