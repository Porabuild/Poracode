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
  describe.each([
    ["full Markdown", ItemMarkdownInner],
    ["lazy fallback", ItemMarkdown],
  ] as const)("review regressions in %s", (_, Renderer) => {
    it("retains the network host when opening an out-of-project UNC citation", () => {
      const actions = makeActions();
      render(
        <AppProvider>
          <ChatPaneActionsContext.Provider value={actions}>
            <Renderer
              text={String.raw`Created :codex-file-citation{path="\\server\share\report.pdf" purpose="output"}.`}
            />
          </ChatPaneActionsContext.Provider>
        </AppProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
      expect(actions.openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(
        "//server/share/report.pdf",
        undefined,
      );
    });

    it.each(["report:2026", "report:20-26"])(
      "opens the exact POSIX filename %s without a line number",
      (filename) => {
        const actions = makeActions();
        const path = `/tmp/${filename}`;
        render(
          <AppProvider>
            <ChatPaneActionsContext.Provider value={actions}>
              <Renderer text={`Created :codex-file-citation{path="${path}" purpose="output"}.`} />
            </ChatPaneActionsContext.Provider>
          </AppProvider>,
        );
        const chip = screen.getByRole("button", { name: filename });
        expect(chip).toHaveAttribute("title", path);
        fireEvent.click(chip);
        expect(actions.openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(path, undefined);
      },
    );

    it.each([
      ["list-contained fence", "- ```text\n  example\n  ```"],
      ["unmatched prose backtick", "An unmatched ` in the earlier paragraph."],
    ])("opens a real citation after a %s", (_case, precedingText) => {
      const actions = makeActions();
      const path = `${projectPath}/report.pdf`;
      const { container } = render(
        <AppProvider>
          <ChatPaneActionsContext.Provider value={actions}>
            <Renderer
              text={`${precedingText}\n\nCreated :codex-file-citation{path="${path}" purpose="output"}.`}
            />
          </ChatPaneActionsContext.Provider>
        </AppProvider>,
      );
      expect(container).not.toHaveTextContent(":codex-file-citation");
      fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
      expect(actions.openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(
        "report.pdf",
        undefined,
      );
    });
  });

  it("keeps blockquote indented code literal while rendering the following citation", () => {
    const actions = makeActions();
    const example = ':codex-file-citation{path="/tmp/example.pdf" purpose="output"}';
    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner
            text={`>     ${example}\n\nCreated :codex-file-citation{path="/tmp/report.pdf" purpose="output"}.`}
          />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(container.querySelector("blockquote pre code")).toHaveTextContent(example);
    expect(container.querySelectorAll(".poracode-inline-path-chip")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
    expect(actions.openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(
      "/tmp/report.pdf",
      undefined,
    );
  });

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
