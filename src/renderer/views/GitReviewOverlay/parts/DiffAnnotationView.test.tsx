import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiffFile, SplitSide } from "@git-diff-view/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import { usePanelStore } from "@/renderer/state/panelStore";
import {
  DiffAnnotationView,
  DiffAnnotationEditor,
  resolveDiffAnnotationComposerId,
} from "./DiffAnnotationView";

type ResolverState = Parameters<typeof resolveDiffAnnotationComposerId>[0];
type ResolverThread = ResolverState["threads"][number];

function thread(
  id: string,
  projectId: string,
  worktreePath: string | undefined,
  updatedAt = "2026-01-01T00:00:00.000Z",
): ResolverThread {
  return {
    id,
    projectId,
    worktreePath,
    updatedAt,
    archived: false,
    done: false,
  } as ResolverThread;
}

describe("diff annotations", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      measureText: () => ({ width: 8 }),
    } as unknown as CanvasRenderingContext2D);
    useComposerInputInbox.setState({ itemsByComposer: {} });
    useAppStore.setState({
      focusedPaneId: null,
      threads: [],
      view: { kind: "home" },
    });
    usePanelStore.setState({ gitReviewContext: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers the composer that opened the review when sibling threads share a worktree", () => {
    const state: ResolverState = {
      focusedPaneId: "focused-thread",
      threads: [
        thread("focused-thread", "project-1", "C:/work/review"),
        thread("origin-thread", "project-1", "C:/work/review"),
      ],
      view: { kind: "thread", panes: ["focused-thread", "origin-thread"] },
    };

    expect(
      resolveDiffAnnotationComposerId(state, "project-1", "C:/work/review", "origin-thread"),
    ).toBe("origin-thread");
  });

  it("keeps a worktree comment in a worktree-scoped inbox until a matching thread opens", () => {
    const state: ResolverState = {
      focusedPaneId: null,
      threads: [],
      view: { kind: "home" },
    };

    expect(resolveDiffAnnotationComposerId(state, "project-1", "C:/work/review")).toBe(
      "worktree:project-1:C:/work/review",
    );
  });

  it("targets a matching visible pane instead of a focused pane from another worktree", () => {
    const state: ResolverState = {
      focusedPaneId: "other-thread",
      threads: [
        thread("other-thread", "project-1", "C:/work/other"),
        thread("review-thread", "project-1", "C:/work/review"),
      ],
      view: { kind: "thread", panes: ["other-thread", "review-thread"] },
    };

    expect(resolveDiffAnnotationComposerId(state, "project-1", "C:/work/review")).toBe(
      "review-thread",
    );
  });

  it("queues a comment for the matching composer and closes the editor", () => {
    useAppStore.setState({ view: { kind: "draft", projectId: "project-1" } });
    const onClose = vi.fn<() => void>();
    render(
      <DiffAnnotationEditor
        filePath="src/example.ts"
        lineNumber={42}
        onClose={onClose}
        projectId="project-1"
        side={SplitSide.new}
        staged={false}
        worktreePath={undefined}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Review comment" }), {
      target: { value: "Handle the empty state." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(useComposerInputInbox.getState().itemsByComposer["draft:project-1"]).toEqual([
      [
        {
          kind: "diff_comment",
          path: "src/example.ts",
          lineNumber: 42,
          side: "new",
          staged: false,
          body: "Handle the empty state.",
        },
      ],
    ]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens the real diff line widget and queues its comment", async () => {
    useAppStore.setState({ view: { kind: "draft", projectId: "project-1" } });
    const diffFile = DiffFile.createInstance({
      oldFile: { fileName: "src/example.ts", fileLang: "typescript", content: null },
      newFile: { fileName: "src/example.ts", fileLang: "typescript", content: null },
      hunks: [
        "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1,2 @@\n before\n+after\n",
      ],
    });
    diffFile.initTheme("dark");
    diffFile.initRaw();
    diffFile.buildUnifiedDiffLines();

    render(
      <DiffAnnotationView
        diffFile={diffFile}
        filePath="src/example.ts"
        projectId="project-1"
        staged={true}
        worktreePath={undefined}
        diffViewMode={4}
        diffViewTheme="dark"
        diffViewWrap
      />,
    );

    await act(async () => {
      fireEvent.mouseDown(screen.getAllByRole("button", { name: "+" }).at(-1)!);
    });
    fireEvent.change(await screen.findByRole("textbox", { name: "Review comment" }), {
      target: { value: "Keep this addition." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(useComposerInputInbox.getState().itemsByComposer["draft:project-1"]).toEqual([
      [
        {
          kind: "diff_comment",
          path: "src/example.ts",
          lineNumber: 2,
          side: "new",
          staged: true,
          body: "Keep this addition.",
        },
      ],
    ]);
  });
});
