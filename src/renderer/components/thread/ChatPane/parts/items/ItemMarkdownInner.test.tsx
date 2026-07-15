import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { LC_SELECTOR_LANG } from "./SelectorBadge";

const { codeBlockSpy } = vi.hoisted(() => ({
  codeBlockSpy:
    vi.fn<(props: { text: string; lang: string; className: string | undefined }) => void>(),
}));

vi.mock("./CodeBlock", () => ({
  CodeBlock: ({ text, lang, className }: { text: string; lang: string; className?: string }) => {
    codeBlockSpy({ text, lang, className });
    return (
      <div data-testid="code-block" data-lang={lang} className={className}>
        {text}
      </div>
    );
  },
}));

const toastDangerSpy = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);

describe("ItemMarkdownInner", () => {
  beforeEach(() => {
    codeBlockSpy.mockClear();
    toastDangerSpy.mockClear();
    Reflect.deleteProperty(window, "poracode");
  });

  it("routes supported fenced code blocks through CodeBlock", () => {
    render(
      <AppProvider>
        <ItemMarkdownInner
          text={"```css\n.animate-tool-call-enter {\n  animation: fade-in;\n}\n```"}
        />
      </AppProvider>,
    );

    expect(screen.getByTestId("code-block")).toHaveAttribute("data-lang", "css");
    expect(codeBlockSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ".animate-tool-call-enter {\n  animation: fade-in;\n}",
        lang: "css",
        className: expect.stringContaining("not-prose"),
      }),
    );
  });

  it("keeps inline code on the inline code path", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"Use `const value = 1` in the snippet."} />
      </AppProvider>,
    );

    expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
    expect(container.querySelector("code")).toHaveTextContent("const value = 1");
  });

  it("falls back to a plain pre/code block for language-less fences", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"```\nplain block\n```"} />
      </AppProvider>,
    );

    expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
    expect(container.querySelector("pre > code")).toHaveTextContent("plain block");
  });

  it("falls back to a plain pre/code block for unsupported fence languages", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"```text\nplain block\n```"} />
      </AppProvider>,
    );

    expect(screen.queryByTestId("code-block")).not.toBeInTheDocument();
    expect(container.querySelector("pre > code")).toHaveTextContent("plain block");
  });

  it("treats range/path fence info as a code fence header, not visible body text", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"```1:30:AGENTS.md\n# AGENTS.md\n\nBody\n```"} />
      </AppProvider>,
    );

    expect(screen.getByTestId("code-block")).toHaveAttribute("data-lang", "markdown");
    expect(screen.getByTestId("code-block")).toHaveTextContent("# AGENTS.md Body");
    expect(container).not.toHaveTextContent("1:30:AGENTS.md");
  });

  it("hides browser selector metadata fences", () => {
    const payload = JSON.stringify({
      selector: "svg.lnXdpd > path",
      url: "https://www.google.com/",
      name: "selection.png",
    });
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner
          text={`before\n\n\`\`\`${LC_SELECTOR_LANG}\n${payload}\n\`\`\`\n\nafter`}
        />
      </AppProvider>,
    );

    expect(container).toHaveTextContent("before");
    expect(container).toHaveTextContent("after");
    expect(container).not.toHaveTextContent("svg.lnXdpd > path");
    expect(container.querySelector("pre")).toBeNull();
  });

  it("renders single newlines as line breaks", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"line 1\nline 2"} />
      </AppProvider>,
    );

    expect(container.querySelector("p")?.textContent).toBe("line 1\nline 2");
  });

  it("caps markdown images so tall screenshots do not fill the chat", () => {
    render(
      <AppProvider>
        <ItemMarkdownInner text={"![Tall screenshot](https://example.test/tall-screenshot.png)"} />
      </AppProvider>,
    );

    const img = screen.getByAltText("Tall screenshot");
    expect(img).toHaveClass("max-h-[min(18rem,40vh)]", "max-w-full", "object-contain");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("draggable", "false");
  });

  it("renders Windows absolute markdown image paths through the local file protocol", () => {
    render(
      <AppProvider>
        <ItemMarkdownInner
          text={"![Before](C:/Users/sdsle/.poracode-smoke/artifacts/composer-before-full.png)"}
        />
      </AppProvider>,
    );

    expect(screen.getByAltText("Before")).toHaveAttribute(
      "src",
      "poracode-local://local/C:/Users/sdsle/.poracode-smoke/artifacts/composer-before-full.png",
    );
  });

  it("normalizes absolute markdown link hrefs to project file chips", () => {
    const actions = makeActions();

    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner
            text={
              "Changed [styles.css](/Users/serhiivecherenko/work/poracode/src/renderer/styles.css)"
            }
          />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const chip = screen.getByRole("button", { name: /styles\.css/ });
    expect(chip).toHaveAttribute("title", "src/renderer/styles.css");
    expect(container.querySelector('a[href^="/Users/"]')).toBeNull();

    fireEvent.click(chip);
    expect(actions.openProjectRelativePath).toHaveBeenCalledWith(
      "src/renderer/styles.css",
      undefined,
    );
  });

  it("keeps out-of-project absolute markdown link hrefs absolute", () => {
    const actions = makeActions();

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={"Read [outside.txt](/tmp/outside.txt)"} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const chip = screen.getByRole("button", { name: /outside\.txt/ });
    expect(chip).toHaveAttribute("title", "/tmp/outside.txt");

    fireEvent.click(chip);
    expect(actions.openProjectRelativePath).toHaveBeenCalledWith("/tmp/outside.txt", undefined);
  });

  it("does not leave a malformed table as raw piped text", () => {
    // 4-cell header but only 3 separator segments. Without normalization
    // remark-gfm rejects the table and renders the source as a raw paragraph
    // of pipes — the failure users report as a corrupted table. After
    // normalization the block should be recognized as a table, so no `<p>`
    // contains the raw pipes.
    const malformed = ["| a | b | c | d |", "|---|---|---|", "| 1 | 2 | 3 | 4 |", ""].join("\n");

    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={malformed} />
      </AppProvider>,
    );

    const rawParagraph = Array.from(container.querySelectorAll("p")).find((p) =>
      (p.textContent ?? "").includes("| a | b |"),
    );
    expect(rawParagraph).toBeUndefined();
  });

  it("renders a markdown table with thead, tbody, th and td elements", () => {
    const mdTable = [
      "| Name | Role |",
      "|------|------|",
      "| Alice | Engineer |",
      "| Bob | Designer |",
      "",
    ].join("\n");

    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={mdTable} />
      </AppProvider>,
    );

    const table = container.querySelector("table");
    expect(table).not.toBeNull();

    const thead = table!.querySelector("thead");
    expect(thead).not.toBeNull();

    const ths = thead!.querySelectorAll("th");
    expect(ths).toHaveLength(2);
    expect(ths[0]).toHaveTextContent("Name");
    expect(ths[1]).toHaveTextContent("Role");

    const tbody = table!.querySelector("tbody");
    expect(tbody).not.toBeNull();

    const rows = tbody!.querySelectorAll("tr");
    expect(rows).toHaveLength(2);

    const firstRowCells = rows[0]!.querySelectorAll("td");
    expect(firstRowCells).toHaveLength(2);
    expect(firstRowCells[0]).toHaveTextContent("Alice");
    expect(firstRowCells[1]).toHaveTextContent("Engineer");
  });

  it("does not render incomplete absolute markdown hrefs as browser links", () => {
    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={makeActions()}>
          <ItemMarkdownInner text={"Changed [styles.css](/"} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    expect(container.querySelector('a[href="/"]')).toBeNull();
    expect(container).toHaveTextContent("Changed styles.css");
    expect(screen.queryByText(/\[blocked\]/)).not.toBeInTheDocument();
  });

  it("reports failed markdown link opens", async () => {
    const openExternal = vi
      .fn<(href: string) => Promise<void>>()
      .mockRejectedValue(new Error("open failed"));
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        openExternal,
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      },
    });

    render(
      <AppProvider>
        <ItemMarkdownInner text={"Open [docs](https://example.test/docs)."} />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("link", { name: /docs/ }));

    await waitFor(() => {
      expect(toastDangerSpy).toHaveBeenCalledWith("open failed");
    });
    expect(openExternal).toHaveBeenCalledWith("https://example.test/docs");
  });
});

function makeActions(): ChatPaneActions {
  return {
    openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => void>(),
    revealProjectFolderInTree: vi.fn<(path: string) => void>(),
    showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
    onContentHeightChange: vi.fn<() => void>(),
    projectLocation: { kind: "posix", path: "/Users/serhiivecherenko/work/poracode" },
    projectRootNames: new Set(["src"]),
  };
}
