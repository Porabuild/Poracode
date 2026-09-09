import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import {
  ChatPaneActionsContext,
  type ChatPaneActions,
} from "../../thread/ChatPane/chatPaneActionsContext";
import ItemMarkdownInner from "../../thread/ChatPane/parts/items/ItemMarkdownInner";
import { ItemMarkdown } from "../../thread/ChatPane/parts/items/ItemMarkdown";
import { resolveThreadTranscriptMarkdownFormatter } from "../../thread/threadTranscriptMarkdown";

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredItemMarkdownInner: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercise React Suspense's pending-chunk fallback.
    throw new Promise(() => {});
  },
}));

const projectPath = "D:/OneDrive - Institute/Projects/Robotics (Review)";
const text = `Created the shorter, aligned layout in :codex-file-citation{path="${projectPath}/figures/source/workflow_3.pptx" purpose="output"}, with matching :codex-file-citation{path="${projectPath}/figures/source/workflow_3.pdf" purpose="output"}.

:codex-file-citation{path="${projectPath}/figures/source/workflow_2.pptx" purpose="output"} now contains only the original slide. Your wording and colors are preserved.`;

function makeActions(): ChatPaneActions {
  return {
    projectLocation: { kind: "windows", path: projectPath },
    projectRootNames: new Set(["figures"]),
    openProjectRelativePath: vi
      .fn<(path: string, lineNumber?: number) => Promise<void>>()
      .mockResolvedValue(undefined),
    onContentHeightChange: vi.fn<() => void>(),
    formatTranscriptMarkdown: resolveThreadTranscriptMarkdownFormatter("codex"),
  };
}

describe("Codex file citation rendering", () => {
  it.each([
    ["full Markdown", ItemMarkdownInner],
    ["lazy fallback", ItemMarkdown],
  ] as const)(
    "renders the stored-response regression as three working files in %s",
    (_, Renderer) => {
      const actions = makeActions();
      const { container } = render(
        <AppProvider>
          <ChatPaneActionsContext.Provider value={actions}>
            <Renderer text={text} />
          </ChatPaneActionsContext.Provider>
        </AppProvider>,
      );
      expect(container).not.toHaveTextContent(":codex-file-citation");
      expect(container).not.toHaveTextContent('purpose="output"');
      expect(container).not.toHaveTextContent("https://poracode.local");
      expect(container).toHaveTextContent("Your wording and colors are preserved.");
      expect(container.querySelectorAll(".poracode-inline-path-chip")).toHaveLength(3);
      for (const file of ["workflow_3.pptx", "workflow_3.pdf", "workflow_2.pptx"]) {
        fireEvent.click(screen.getByRole("button", { name: file }));
        expect(actions.openProjectRelativePath).toHaveBeenCalledWith(
          `figures/source/${file}`,
          undefined,
        );
      }
    },
  );

  it("keeps Markdown punctuation and Unicode in filenames intact", () => {
    const actions = makeActions();
    const name = "日本語 [draft](50%)_v2).pdf";
    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner
            text={`Created :codex-file-citation{path="${projectPath}/${name}" purpose="output"}.`}
          />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name }));
    expect(actions.openProjectRelativePath).toHaveBeenCalledWith(name, undefined);
  });

  it("renders a completed streaming fragment through the same formatter", () => {
    const actions = makeActions();
    const renderText = (value: string) => (
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={value} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>
    );
    const { container, rerender } = render(
      renderText('Created :codex-file-citation{path="D:/OneDrive'),
    );
    rerender(renderText(text));
    expect(container).not.toHaveTextContent(":codex-file-citation");
    expect(screen.getByRole("button", { name: "workflow_3.pptx" })).toBeInTheDocument();
  });
});
