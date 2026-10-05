import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ImageLightboxHost } from "@/renderer/components/composer";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { LC_SELECTOR_LANG } from "./SelectorBadge";
import {
  SmoothItemMarkdown,
  normalizeGfmTableSeparators,
  normalizeShortCodeFenceClosers,
} from "./ItemMarkdown";
import { rewriteMarkdownLocalImageUrls } from "@/shared/markdownLocalImages";
import { isOrdinaryPlainProse, MAX_ORDINARY_PLAIN_PROSE_LENGTH } from "./ordinaryPlainProse";

const { codeBlockSpy, streamdownSpy, parseBlocksSpy } = vi.hoisted(() => ({
  codeBlockSpy:
    vi.fn<(props: { text: string; lang: string; className: string | undefined }) => void>(),
  streamdownSpy: vi.fn<(text: unknown) => void>(),
  parseBlocksSpy: vi.fn<(text: string) => string[]>(),
}));

vi.mock("./ordinaryPlainProse", { spy: true });
vi.mock("./ItemMarkdown", { spy: true });
vi.mock("@/shared/markdownLocalImages", { spy: true });
vi.mock("streamdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("streamdown")>();
  parseBlocksSpy.mockImplementation(actual.parseMarkdownIntoBlocks);
  return {
    ...actual,
    Streamdown(props: ComponentProps<typeof actual.Streamdown>) {
      streamdownSpy(props.children);
      return <actual.Streamdown {...props} parseMarkdownIntoBlocksFn={parseBlocksSpy} />;
    },
  };
});

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
// Keep new differential cases separate from existing image tests: Streamdown
// caches processors globally and serializes plugin options without functions.
const proseTestProject = { kind: "posix", path: "/ordinary-prose-tests" } as const;

describe("ItemMarkdownInner", () => {
  beforeEach(() => {
    codeBlockSpy.mockClear();
    toastDangerSpy.mockClear();
    Reflect.deleteProperty(window, "poracode");
  });

  it.each([
    "A",
    "An ordinary paragraph. Another sentence!",
    'We can use "quotes" and (parentheses); it\'s fine.',
    "A well-known result — 25% faster… perhaps",
    "Two  internal   spaces",
    "Café and cafe\u0301",
    "Привет світе! Zażółć gęślą jaźń.",
    "普通话。日本語、한국어！",
    "مرحبا بالعالم، שלום עולם",
    "Astral letters 𐐀 and emoji 🌍 ☕️ 👍🏽",
    "\ud800",
    "\udbff",
    "\udc00",
    "\udfff",
    "High \ud83c remains \udbff  ",
    "Low \udf0d remains \udfff  ",
    "Broken \ud83cX\udf0d \ud83d\ud83d \udfff\udfff end  ",
    "\udf0d\ud83cX\ud83c🌍 end  ",
    "x=1",
    "a = b",
    "⟦x=1 y=2⟧ ordinary prose",
    "⟦a=2 s=30 t=179000⟧ prose",
    "Trailing spaces ",
    "Trailing spaces   ",
    "Two  internal   spaces  ",
    "Sentence.   ",
    "Emoji 🌍 👍🏽  ",
    "x=1  ",
    "x".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH),
    "x".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH - 1) + " ",
  ])("matches real Streamdown paragraph text, selection and DOM classes: %.60s", (text) => {
    const { container, rerender } = render(<ItemMarkdownInner text={text} />);
    const fastMarkup = container.innerHTML;
    const paragraph = container.querySelector("p")!;
    expect(paragraph.textContent).toBe(text.trimEnd());
    expect(paragraph.childElementCount).toBe(0);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    expect(range.toString()).toBe(text.trimEnd());
    expect(streamdownSpy).not.toHaveBeenCalled();
    expect(parseBlocksSpy).not.toHaveBeenCalled();

    // Force the unchanged rich branch to provide the oracle with the actual
    // app plugins/components. This also detects Streamdown wrapper changes.
    vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
    rerender(<ItemMarkdownInner text={text} />);
    expect(parseBlocksSpy).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe(fastMarkup);
    range.selectNodeContents(container.querySelector("p")!);
    expect(range.toString()).toBe(text.trimEnd());
  });

  it.each([
    "Hello world. Complete words! Two  internal spaces; punctuation? Yes.  ",
    "Hello 🌍 ☕️ 👍🏽 🚀 done!  ",
    "🌍👍🏽🚀",
    "𐐀𐐨 𝔄 𠀀 𞤀 done.  ",
    "𐐀🌍𐐨👍🏽𠀀🚀",
    "High \ud83c remains \udbff  ",
    "Low \udf0d remains \udfff  ",
    "Broken \ud83cX\udf0d \ud83d\ud83d \udfff\udfff end  ",
    "\udf0d\ud83cX\ud83c🌍 end  ",
  ])("matches Streamdown node lifetimes and mutations through ordinary updates: %s", (text) => {
    // Include every UTF-16 boundary: smooth snapshots can split surrogate pairs.
    const snapshots = Array.from({ length: text.length }, (_, index) => text.slice(0, index + 1));
    const fast = render(<ItemMarkdownInner text={snapshots[0]!} />);
    vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
    const rich = render(<ItemMarkdownInner text={snapshots[0]!} />);
    const fastParagraph = fast.container.querySelector("p")!;
    const richParagraph = rich.container.querySelector("p")!;
    const fastText = fastParagraph.firstChild;
    const richText = richParagraph.firstChild;
    const fastWrapper = fastParagraph.parentElement;
    const richWrapper = richParagraph.parentElement;
    const fastObserver = new MutationObserver(() => {});
    const richObserver = new MutationObserver(() => {});
    fastObserver.observe(fast.container, { childList: true, characterData: true, subtree: true });
    richObserver.observe(rich.container, { childList: true, characterData: true, subtree: true });
    streamdownSpy.mockClear();
    parseBlocksSpy.mockClear();
    try {
      const edge = "ordinary words ".repeat(20);
      for (const snapshot of [
        ...snapshots.slice(1),
        `${edge}🌍 middle ${edge}done  `,
        `${edge}\ud83cX middle ${edge}done  `,
        `${edge}\udf0dX middle ${edge}done  `,
        `${edge}\ud83d\ud83d malformed \udfff\udfff ${edge}done  `,
        `${edge}𐐀 middle ${edge}done  `,
        "Short \ud800  ",
        "Repaired 🌍!",
      ]) {
        expect(isOrdinaryPlainProse(snapshot)).toBe(true);
        fast.rerender(<ItemMarkdownInner text={snapshot} />);
        expect(streamdownSpy).not.toHaveBeenCalled();
        expect(parseBlocksSpy).not.toHaveBeenCalled();
        vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
        rich.rerender(<ItemMarkdownInner text={snapshot} />);
        streamdownSpy.mockClear();
        parseBlocksSpy.mockClear();
        expect(fast.container.innerHTML).toBe(rich.container.innerHTML);
        for (const paragraph of [fastParagraph, richParagraph]) {
          expect(paragraph.textContent).toBe(snapshot.trimEnd());
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          expect(range.toString()).toBe(snapshot.trimEnd());
        }
        expect(fast.container.querySelector("p")).toBe(fastParagraph);
        expect(rich.container.querySelector("p")).toBe(richParagraph);
        expect(fastParagraph.firstChild).toBe(fastText);
        expect(richParagraph.firstChild).toBe(richText);
        expect(fastParagraph.parentElement).toBe(fastWrapper);
        expect(richParagraph.parentElement).toBe(richWrapper);
        const fastRecords = fastObserver.takeRecords();
        const richRecords = richObserver.takeRecords();
        expect(fastRecords.map((record) => record.type)).toEqual(
          richRecords.map((record) => record.type),
        );
        expect(
          fastRecords.every(
            (record) => record.addedNodes.length === 0 && record.removedNodes.length === 0,
          ),
        ).toBe(true);
      }
    } finally {
      fastObserver.disconnect();
      richObserver.disconnect();
    }
  });

  it("matches real Streamdown for all 2048 lone surrogate code units without replacing DOM nodes", () => {
    const initial = String.fromCharCode(0xd800);
    const fast = render(<ItemMarkdownInner text={initial} />);
    vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
    const rich = render(<ItemMarkdownInner text={initial} />);
    const fastParagraph = fast.container.querySelector("p")!;
    const richParagraph = rich.container.querySelector("p")!;
    const fastText = fastParagraph.firstChild;
    const richText = richParagraph.firstChild;
    const fastWrapper = fastParagraph.parentElement;
    const richWrapper = richParagraph.parentElement;
    for (let code = 0xd800; code <= 0xdfff; code += 1) {
      const surrogate = String.fromCharCode(code);
      for (const snapshot of [surrogate, `Text ${surrogate} middle ${surrogate}  `]) {
        fast.rerender(<ItemMarkdownInner text={snapshot} />);
        vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
        rich.rerender(<ItemMarkdownInner text={snapshot} />);
        expect(fast.container.innerHTML).toBe(rich.container.innerHTML);
        expect(fast.container.querySelector("p")).toBe(fastParagraph);
        expect(rich.container.querySelector("p")).toBe(richParagraph);
        expect(fastParagraph.firstChild).toBe(fastText);
        expect(richParagraph.firstChild).toBe(richText);
        expect(fastParagraph.parentElement).toBe(fastWrapper);
        expect(richParagraph.parentElement).toBe(richWrapper);
        expect(fastParagraph.textContent).toBe(snapshot.trimEnd());
        expect(richParagraph.textContent).toBe(snapshot.trimEnd());
      }
    }
  });

  it.each([
    "1) ordered item",
    "1. ordered item",
    "Read www.example.test",
    "Read README.md",
    "See src/file.ts",
    "Hello **bold**",
    "Hello [link](https://example.test)",
    "Hello &amp; entity",
    "Hello $x$",
    "Hello <em>HTML</em>",
    "Hello\n\nnext paragraph",
    "Hello 🌍",
    "Hello 🌍 👍🏽 done.  ",
    "x=1",
    "a = b",
    "⟦x=1 y=2⟧ ordinary prose",
    "⟦a=2 s=30 t=179000⟧ prose",
  ])("matches the rich renderer at every streaming prefix and completion: %s", (text) => {
    const { container, rerender } = render(<ItemMarkdownInner text="" />);
    for (let end = 1; end <= text.length; end += 1) {
      const snapshot = text.slice(0, end);
      const eligible = isOrdinaryPlainProse(snapshot);
      streamdownSpy.mockClear();
      parseBlocksSpy.mockClear();
      rerender(<ItemMarkdownInner text={snapshot} />);
      const markup = container.innerHTML;
      expect({ snapshot, renders: streamdownSpy.mock.calls.length }).toEqual({
        snapshot,
        renders: eligible ? 0 : 1,
      });
      // Incomplete-markdown repair can map two rich prefixes to the same input.
      expect(parseBlocksSpy.mock.calls.length).toBeLessThanOrEqual(eligible ? 0 : 1);
      vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
      rerender(<ItemMarkdownInner text={snapshot} />);
      expect({ snapshot, html: container.innerHTML }).toEqual({ snapshot, html: markup });
    }
  });

  it("immediately rechecks same-length, longer-middle and shorter replacements", () => {
    const edge = "ordinary words ".repeat(20);
    const original = `${edge}middle ${edge}done`;
    const { container, rerender } = render(<ItemMarkdownInner text={original} />);
    expect(parseBlocksSpy).not.toHaveBeenCalled();
    for (const replacement of [
      `${edge}**ok** ${edge}done`,
      `${edge}**a longer changed middle** ${edge}done`,
    ]) {
      rerender(<ItemMarkdownInner text={replacement} />);
      expect(container.querySelector('[data-streamdown="strong"]')).not.toBeNull();
      rerender(<ItemMarkdownInner text={original} />);
      expect(container.querySelector('[data-streamdown="strong"]')).toBeNull();
    }
    parseBlocksSpy.mockClear();
    rerender(<ItemMarkdownInner text="Short replacement" />);
    expect(container.querySelector("p")?.textContent).toBe("Short replacement");
    expect(parseBlocksSpy).not.toHaveBeenCalled();
  });

  it("formats exactly once before classification and follows formatter/context changes", () => {
    const source = "Canonical **source**";
    const plainFormatter = vi.fn<(text: string) => string>(() => "Readable display  ");
    const richFormatter = vi.fn<(text: string) => string>(() => "Read **formatted**");
    const view = (actions: ChatPaneActions) => (
      <ChatPaneActionsContext.Provider value={actions}>
        <ItemMarkdownInner text={source} />
      </ChatPaneActionsContext.Provider>
    );
    const { container, rerender } = render(
      view(
        makeActions({
          projectLocation: proseTestProject,
          formatTranscriptMarkdown: plainFormatter,
        }),
      ),
    );
    expect(plainFormatter).toHaveBeenCalledExactlyOnceWith(source);
    expect(isOrdinaryPlainProse).toHaveBeenCalledExactlyOnceWith("Readable display  ");
    expect(parseBlocksSpy).not.toHaveBeenCalled();
    expect(container.querySelector("p")?.textContent).toBe("Readable display");

    rerender(
      view(
        makeActions({ projectLocation: proseTestProject, formatTranscriptMarkdown: richFormatter }),
      ),
    );
    expect(richFormatter).toHaveBeenCalledExactlyOnceWith(source);
    expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe("formatted");
    expect(parseBlocksSpy).toHaveBeenCalledExactlyOnceWith("Read **formatted**");
    rerender(view(makeActions({ projectLocation: proseTestProject })));
    expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe("source");
    parseBlocksSpy.mockClear();
    rerender(
      view(
        makeActions({
          projectLocation: proseTestProject,
          formatTranscriptMarkdown: plainFormatter,
        }),
      ),
    );
    expect(container.querySelector("p")?.textContent).toBe("Readable display");
    expect(parseBlocksSpy).not.toHaveBeenCalled();
    expect(plainFormatter).toHaveBeenNthCalledWith(2, source);
  });

  it("checks the full formatted snapshot cap before trimming its display", () => {
    const text = "x".repeat(MAX_ORDINARY_PLAIN_PROSE_LENGTH) + " ";
    const { container } = render(<ItemMarkdownInner text={text} />);
    expect(isOrdinaryPlainProse).toHaveBeenCalledExactlyOnceWith(text);
    expect(streamdownSpy).toHaveBeenCalledExactlyOnceWith(text);
    expect(container.querySelector("p")?.textContent).toBe(text.trimEnd());
  });

  it("keeps project-path context and click actions on the rich path", () => {
    const view = (actions: ChatPaneActions, text: string) => (
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={text} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>
    );
    const emptyProject = makeActions({
      projectLocation: proseTestProject,
      projectRootNames: new Set(),
    });
    const { rerender } = render(view(emptyProject, "See src/file.ts"));
    expect(screen.queryByRole("button", { name: /file.ts/ })).toBeNull();
    rerender(view(emptyProject, "Ordinary display"));
    const actions = makeActions({ projectLocation: proseTestProject });
    rerender(view(actions, "See src/file.ts"));
    fireEvent.click(screen.getByRole("button", { name: /file.ts/ }));
    expect(actions.openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(
      "src/file.ts",
      undefined,
    );
  });

  it.each(["", " **done**"])(
    "preserves smoothing and flushes completed display text %j",
    async (tail) => {
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 0;
      const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
        frames.set(++nextFrame, frame);
        return nextFrame;
      });
      const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        frames.delete(id);
      });
      const { container, rerender, unmount } = render(
        <SmoothItemMarkdown text="Hello" isStreaming />,
      );
      try {
        await waitFor(() => expect(container.querySelector("p")?.textContent).toBe("Hello"));
        const target = `Hello${" new words".repeat(20)}${tail}`;
        rerender(<SmoothItemMarkdown text={target} isStreaming />);
        expect(container.querySelector("p")?.textContent).toBe("Hello");
        expect(parseBlocksSpy).not.toHaveBeenCalled();
        act(() => {
          const pending = [...frames.values()];
          frames.clear();
          for (const frame of pending) frame(1_000);
        });
        const partial = container.querySelector("p")?.textContent ?? "";
        expect(partial.length).toBeGreaterThan(5);
        expect(partial.length).toBeLessThan(target.length);
        expect(target.startsWith(partial)).toBe(true);
        rerender(<SmoothItemMarkdown text={target} isStreaming={false} />);
        expect(container.querySelector("p")?.textContent).toBe(target.replaceAll("**", ""));
        expect(container.querySelectorAll('[data-streamdown="strong"]')).toHaveLength(tail ? 1 : 0);
        expect(frames.size).toBe(0);
      } finally {
        unmount();
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
      }
    },
  );

  it.each([" newword  ", " 🌍 𐐀 👍🏽 🚀  "])(
    "keeps paragraph and text nodes through smoothed word and surrogate boundaries: %j",
    async (chunk) => {
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 0;
      const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
        frames.set(++nextFrame, frame);
        return nextFrame;
      });
      const cancelFrame = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        frames.delete(id);
      });
      const { container, rerender, unmount } = render(
        <SmoothItemMarkdown text="Hello" isStreaming />,
      );
      const observer = new MutationObserver(() => {});
      try {
        await waitFor(() => expect(container.querySelector("p")?.textContent).toBe("Hello"));
        const paragraph = container.querySelector("p")!;
        const textNode = paragraph.firstChild;
        const wrapper = paragraph.parentElement;
        observer.observe(container, { childList: true, characterData: true, subtree: true });
        const target = `Hello${chunk.repeat(15)}done!   `;
        rerender(<SmoothItemMarkdown text={target} isStreaming />);
        let sawTrailingSpace = false;
        let sawSurrogateHalf = false;
        for (let frame = 1; frames.size > 0 && frame <= 500; frame += 1) {
          act(() => {
            const pending = [...frames.values()];
            frames.clear();
            for (const callback of pending) callback(frame * 16);
          });
          const snapshot = vi.mocked(isOrdinaryPlainProse).mock.calls.at(-1)![0];
          sawTrailingSpace ||= snapshot.endsWith(" ");
          sawSurrogateHalf ||= !snapshot.isWellFormed();
          expect(container.querySelector("p")).toBe(paragraph);
          expect(paragraph.firstChild).toBe(textNode);
          expect(paragraph.parentElement).toBe(wrapper);
          expect(paragraph.textContent).toBe(snapshot.trimEnd());
        }
        expect(sawTrailingSpace).toBe(true);
        expect(sawSurrogateHalf).toBe(chunk.includes("🌍"));
        expect(paragraph.textContent).toBe(target.trimEnd());
        rerender(<SmoothItemMarkdown text={target} isStreaming={false} />);
        expect(container.querySelector("p")).toBe(paragraph);
        expect(paragraph.firstChild).toBe(textNode);
        expect(observer.takeRecords().every((record) => record.type === "characterData")).toBe(
          true,
        );
        expect(frames.size).toBe(0);
        expect(parseBlocksSpy).not.toHaveBeenCalled();
      } finally {
        observer.disconnect();
        unmount();
        requestFrame.mockRestore();
        cancelFrame.mockRestore();
      }
    },
  );

  it("avoids 50 rich parses and all pre-parser normalizers for 50 eligible display updates", () => {
    const chunk = ` ${"ordinary prose ".repeat(11)}`.slice(0, 159) + "x";
    const snapshots = Array.from({ length: 50 }, (_, index) => `A${chunk.repeat(index + 1)}`);
    const formatTranscriptMarkdown = vi.fn<(text: string) => string>((text) => text);
    const actions = makeActions({ projectLocation: proseTestProject, formatTranscriptMarkdown });
    const view = (text: string) => (
      <ChatPaneActionsContext.Provider value={actions}>
        <ItemMarkdownInner text={text} />
      </ChatPaneActionsContext.Provider>
    );
    const fast = render(view(snapshots[0]!));
    for (const snapshot of snapshots.slice(1)) fast.rerender(view(snapshot));
    expect(formatTranscriptMarkdown).toHaveBeenCalledTimes(50);
    expect(isOrdinaryPlainProse).toHaveBeenCalledTimes(50);
    expect(streamdownSpy).not.toHaveBeenCalled();
    expect(parseBlocksSpy).not.toHaveBeenCalled();
    expect(normalizeShortCodeFenceClosers).not.toHaveBeenCalled();
    expect(normalizeGfmTableSeparators).not.toHaveBeenCalled();
    expect(rewriteMarkdownLocalImageUrls).not.toHaveBeenCalled();
    const finalMarkup = fast.container.innerHTML;
    fast.unmount();

    vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
    const rich = render(view(snapshots[0]!));
    for (const snapshot of snapshots.slice(1)) {
      vi.mocked(isOrdinaryPlainProse).mockReturnValueOnce(false);
      rich.rerender(view(snapshot));
    }
    expect(parseBlocksSpy).toHaveBeenCalledTimes(50);
    expect(normalizeShortCodeFenceClosers).toHaveBeenCalledTimes(50);
    expect(normalizeGfmTableSeparators).toHaveBeenCalledTimes(50);
    expect(rewriteMarkdownLocalImageUrls).toHaveBeenCalledTimes(50);
    expect(rich.container.innerHTML).toBe(finalMarkup);
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

  it("does not crash on deeply nested raw HTML", () => {
    const text = `${"<div>".repeat(5_000)}subagent result`;

    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={text} />
      </AppProvider>,
    );

    expect(container).toHaveTextContent("subagent result");
  });

  it("keeps normal raw HTML elements rendered", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"<em>raw emphasis</em>"} />
      </AppProvider>,
    );

    expect(container.querySelector("em")).toHaveTextContent("raw emphasis");
  });

  it("rewrites raw HTML image paths through the local image protocol", () => {
    render(
      <AppProvider>
        <ItemMarkdownInner
          text={'<img src="C:/Users/sdsle/.poracode-smoke/raw-image.png" alt="Raw image" />'}
        />
      </AppProvider>,
    );

    expect(screen.getByAltText("Raw image")).toHaveAttribute(
      "src",
      "poracode-local://local/C:/Users/sdsle/.poracode-smoke/raw-image.png",
    );
  });

  it("caps markdown images so tall screenshots do not fill the chat", () => {
    const { container } = render(
      <AppProvider>
        <ItemMarkdownInner text={"![Tall screenshot](https://example.test/tall-screenshot.png)"} />
      </AppProvider>,
    );

    const img = screen.getByAltText("Tall screenshot");
    expect(img).toHaveClass("max-h-[min(18rem,40vh)]", "max-w-full", "object-contain");
    expect(img).toHaveAttribute("decoding", "async");
    expect(img).toHaveAttribute("draggable", "false");
    expect(img.closest('[data-poracode-image-card="true"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open preview" })).toBeTruthy();
    expect(container.querySelector("p div")).toBeNull();
  });

  it("opens markdown images in the shared lightbox", () => {
    render(
      <AppProvider>
        <ItemMarkdownInner text={"![Screenshot](https://example.test/screenshot.png)"} />
        <ImageLightboxHost />
      </AppProvider>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open image preview" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector(".poracode-image-lightbox__image")).toHaveAttribute(
      "src",
      "https://example.test/screenshot.png",
    );
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

  it("renders remote markdown image paths through the host image endpoint", () => {
    const remoteLocalImageUrl = vi.fn<(url: string) => string>(
      () => "https://remote.test/api/files/image?path=screenshot.png",
    );
    const actions = makeActions({ remoteLocalImageUrl });

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={"![Screenshot](/tmp/screenshot.png)"} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    expect(remoteLocalImageUrl).toHaveBeenCalledWith("poracode-local://local/tmp/screenshot.png");
    expect(screen.getByAltText("Screenshot")).toHaveAttribute(
      "src",
      "https://remote.test/api/files/image?path=screenshot.png",
    );
  });

  it("renders Windows backslash markdown image paths without CommonMark escape corruption", () => {
    // Paths with `\.` (dot-folders) are mangled by CommonMark unless rewritten
    // to poracode-local:// before parse.
    render(
      <AppProvider>
        <ItemMarkdownInner
          text={
            "![Before](C:\\Users\\sdsle\\.grok\\sessions\\E%3A%5Cwork\\assets\\image-ea056148.png)"
          }
        />
      </AppProvider>,
    );

    const src = screen.getByAltText("Before").getAttribute("src") ?? "";
    expect(src.startsWith("poracode-local://local/")).toBe(true);
    // Literal percent folder names must be double-encoded in the URL so the
    // protocol handler's decodeURIComponent restores E%3A… rather than E:…
    expect(src).toContain("E%253A%255Cwork");
    expect(src).toContain(".grok");
    expect(src).not.toContain("sdsle.grok");
  });

  it("renders project-relative markdown image paths via the local file protocol", () => {
    const actions = makeActions({
      projectLocation: {
        kind: "windows",
        path: "E:\\work\\lightcode\\.poracode\\worktrees\\poracode-brave-willow-b4fc6c26",
      },
    });

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner
            text={"![After](verification-shots/01-collapsed-same-file-edits.png)"}
          />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const src = screen.getByAltText("After").getAttribute("src") ?? "";
    expect(src.startsWith("poracode-local://local/E:")).toBe(true);
    expect(src).toContain("verification-shots");
    expect(src).toContain("01-collapsed-same-file-edits.png");
  });

  it("copies project-relative markdown images through the local-file bridge", async () => {
    const readLocalImageFile = vi
      .fn<(payload: { url: string }) => Promise<Uint8Array>>()
      .mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
    const copyImageToClipboard = vi
      .fn<(payload: { data: Uint8Array }) => Promise<boolean>>()
      .mockResolvedValue(true);
    Object.defineProperty(window, "poracode", {
      configurable: true,
      value: {
        appVersion: "test",
        setWindowChrome: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        readLocalImageFile,
        copyImageToClipboard,
      },
    });
    const actions = makeActions({
      projectLocation: { kind: "posix", path: "/tmp/project" },
    });

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={"![Screenshot](images/screenshot.png)"} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));

    await waitFor(() => expect(copyImageToClipboard).toHaveBeenCalledTimes(1));
    expect(readLocalImageFile).toHaveBeenCalledWith({
      url: "poracode-local://local/tmp/project/images/screenshot.png",
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("renders Grok session-relative images/ markdown via the local file protocol", () => {
    const sessionDir =
      "C:\\Users\\sdsle\\.grok\\sessions\\E%3A%5Cwork%5Clightcode%5C.poracode%5Cworktrees%5Cporacode-warm-yak-d27ed350\\019f6789-4fd1-7740-a828-9a42918d42e8";
    const actions = makeActions({
      projectLocation: {
        kind: "windows",
        path: "E:\\work\\lightcode\\.poracode\\worktrees\\poracode-warm-yak-d27ed350",
      },
      markdownImageRoots: [sessionDir],
    });

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={"![Modal PDF preview](images/4.jpg)"} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const src = screen.getByAltText("Modal PDF preview").getAttribute("src") ?? "";
    expect(src.startsWith("poracode-local://local/")).toBe(true);
    expect(src).toContain("images");
    expect(src).toContain("4.jpg");
    // Must land under the Grok session dir, not the project root.
    expect(src).toContain(".grok");
    expect(src).toContain("E%253A%255Cwork");
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

  it("renders a bare filename with a line number as a clickable file chip", () => {
    const actions = makeActions();

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={"BrowserPanelManager.ts:288 lost its badge."} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const chip = screen.getByRole("button", { name: /BrowserPanelManager\.ts.*288/ });
    expect(chip).toHaveAttribute("title", "BrowserPanelManager.ts:288");

    fireEvent.click(chip);
    expect(actions.openProjectRelativePath).toHaveBeenCalledWith("BrowserPanelManager.ts", 288);
  });

  it("makes an unresolved bare filename chip read-only after the index lookup fails", async () => {
    const actions = makeActions({
      openProjectRelativePath: vi
        .fn<(path: string, lineNumber?: number) => Promise<void>>()
        .mockRejectedValue(new Error("File not found")),
    });

    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={"MissingFile.ts:12 could not be found."} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );

    const chip = screen.getByRole("button", { name: /MissingFile\.ts.*12/ });
    fireEvent.click(chip);

    await waitFor(() => expect(chip).toBeDisabled());
    expect(chip).toHaveClass("poracode-inline-path-chip--inert");
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

function makeActions(overrides?: Partial<ChatPaneActions>): ChatPaneActions {
  return {
    openProjectRelativePath: vi.fn<(path: string, lineNumber?: number) => Promise<void>>(),
    revealProjectFolderInTree: vi.fn<(path: string) => void>(),
    showProjectEntryInExplorer: vi.fn<(path: string) => void>(),
    onContentHeightChange: vi.fn<() => void>(),
    projectLocation: { kind: "posix", path: "/Users/serhiivecherenko/work/poracode" },
    projectRootNames: new Set(["src"]),
    ...overrides,
  };
}
