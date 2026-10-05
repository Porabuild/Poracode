import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ComponentProps, Context } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { dynamicActivate, i18n } from "@/renderer/i18n/i18n";
import { splitStreamdownMarkdownBlocks } from "@/renderer/markdown/streamdownBlockSplitter";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import ItemMarkdownInner from "./ItemMarkdownInner";

vi.mock("@/renderer/markdown/streamdownBlockSplitter", { spy: true });

const { projection } = vi.hoisted(() => ({
  projection: {
    Context: null as Context<boolean> | null,
    receivedParser: vi.fn<(parser: ((text: string) => string[]) | undefined) => void>(),
  },
}));

vi.mock("streamdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("streamdown")>();
  const { createContext, useContext } = await import("react");
  const ParserMode = createContext(false);
  projection.Context = ParserMode;
  return {
    ...actual,
    Streamdown(props: ComponentProps<typeof actual.Streamdown>) {
      const oracle = useContext(ParserMode);
      projection.receivedParser(props.parseMarkdownIntoBlocksFn);
      // Delegate the real component with every production option untouched.
      // Only the oracle fixture replaces the parser supplied by the app.
      return oracle ? (
        <actual.Streamdown {...props} parseMarkdownIntoBlocksFn={actual.parseMarkdownIntoBlocks} />
      ) : (
        <actual.Streamdown {...props} />
      );
    },
  };
});

const initialSettings = useSharedSettings.getState();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function Fixture({
  text,
  oracle,
  actions,
}: {
  text: string;
  oracle: boolean;
  actions: ChatPaneActions | null;
}) {
  const ParserMode = projection.Context!;
  return (
    <AppProvider syncWindowChrome={false}>
      <ParserMode.Provider value={oracle}>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={text} />
        </ChatPaneActionsContext.Provider>
      </ParserMode.Provider>
    </AppProvider>
  );
}

function renderPair(text: string, actions: ChatPaneActions | null = null) {
  const candidate = render(<Fixture text={text} oracle={false} actions={actions} />);
  const oracle = render(<Fixture text={text} oracle actions={actions} />);
  return {
    candidate,
    oracle,
    update(nextText: string, nextActions: ChatPaneActions | null = actions) {
      candidate.rerender(<Fixture text={nextText} oracle={false} actions={nextActions} />);
      oracle.rerender(<Fixture text={nextText} oracle actions={nextActions} />);
    },
    async expectEqual() {
      await waitFor(() => expect(candidate.container.innerHTML).toBe(oracle.container.innerHTML));
      const candidateRange = document.createRange();
      const oracleRange = document.createRange();
      candidateRange.selectNodeContents(candidate.container);
      oracleRange.selectNodeContents(oracle.container);
      expect(candidateRange.toString()).toBe(oracleRange.toString());
      expect(candidate.container.textContent).toBe(oracle.container.textContent);
    },
  };
}

beforeEach(() => {
  Reflect.deleteProperty(window, "poracode");
  useSharedSettings.setState({ locale: "en", themeMode: "dark" });
});

afterEach(async () => {
  cleanup();
  useSharedSettings.setState({
    locale: initialSettings.locale,
    themeMode: initialSettings.themeMode,
  });
  await dynamicActivate("en");
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("block-only projection through the real chat Markdown configuration", () => {
  it("passes the candidate through Streamdown's supported parser prop", async () => {
    const pair = renderPair("**Formatted** paragraph.\n\nAnother _paragraph_.");
    await pair.expectEqual();
    expect(projection.receivedParser).toHaveBeenCalledWith(splitStreamdownMarkdownBlocks);
    expect(
      projection.receivedParser.mock.calls.every(
        ([parser]) => parser === splitStreamdownMarkdownBlocks,
      ),
    ).toBe(true);
    expect(pair.candidate.container.querySelector('[data-streamdown="strong"]')?.textContent).toBe(
      "Formatted",
    );
  });

  // eslint-disable-next-line vitest/expect-expect -- The pair helper asserts exact DOM, text and selection parity.
  it.each([
    [
      "lists and table",
      "# Heading\n\n> A **quote**.\n\n- [x] done\n- [ ] open\n\n| a | b |\n| --- | --- |\n| ~~gone~~ | `code` |\n",
    ],
    [
      "links and image",
      "A [link](https://example.test/page) and ![Screenshot](https://example.test/image.png).",
    ],
    [
      "HTML and footnote",
      "<div>\n\nA **nested** paragraph.\n\n</div>\n\nNote[^n].\r\n\r\n[^n]: Definition.\r\n",
    ],
    [
      "math dialects",
      "Inline $x^2$ and \\(W_{dj}\\).\n\n$$\n\\frac{1}{2}\n$$\n\n\\[y^2\\]\n\n```math\nz^2\n```\n",
    ],
    ["Unicode", "## 🌍\n\n**Café e\u0301** 𐐀 你好 مرحبا\n\n`\ud800X\udfff`\n"],
  ])("preserves exact DOM, text and selection for %s", async (_name, text) => {
    const pair = renderPair(text);
    await pair.expectEqual();
  });

  it("preserves actual highlighted code and copy payloads", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const text = "Before **code**.\n\n```typescript\nconst value = '<tag>';\n```\n\nAfter.";
    const pair = renderPair(text);
    await waitFor(() => expect(pair.candidate.container.querySelector(".lc-shiki")).not.toBeNull());
    await pair.expectEqual();
    expect(pair.candidate.container.querySelector("pre")?.textContent).toBe(
      "const value = '<tag>';",
    );
    expect(pair.candidate.container.querySelector("pre tag")).toBeNull();
    const candidateCopy = within(pair.candidate.container).getByRole("button", {
      name: "Copy code",
    });
    const oracleCopy = within(pair.oracle.container).getByRole("button", { name: "Copy code" });
    fireEvent.click(candidateCopy);
    fireEvent.click(oracleCopy);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls).toEqual([["const value = '<tag>';"], ["const value = '<tag>';"]]);
    await waitFor(() => {
      expect(candidateCopy).toHaveAttribute("aria-label", "Copied");
      expect(oracleCopy).toHaveAttribute("aria-label", "Copied");
    });
  });

  it("preserves raw HTML sanitization and unsafe link/math rejection", async () => {
    const pair = renderPair(
      '<div>\n\n<img src="https://example.test/x.png" onerror="alert(1)"><script>alert(1)</script>\n\n[unsafe](javascript:alert(1))\n\n$\\href{javascript:alert(1)}{click}$ and $x^2$.\n\n</div>',
    );
    await pair.expectEqual();
    expect(
      pair.candidate.container.querySelector("script, [onerror], a[href^='javascript:']"),
    ).toBeNull();
    expect(pair.candidate.container.querySelectorAll(".katex")).toHaveLength(2);
  });

  // eslint-disable-next-line vitest/expect-expect -- Each transition uses the exact DOM/text/selection assertion helper.
  it("matches incomplete syntax, append, replacement, shrink, repeat and clear transitions", async () => {
    const snapshots = [
      "**bold",
      "**bold** [link](https://example",
      "**bold** [link](https://example.test)",
      "**bold** [link](https://example.test)\n\n| a | b |\n| --- | --- |\n| 1 |",
      "**bold** [link](https://example.test)\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
      "Before $x^2$.\n\n$$\n\\frac{1}{2}",
      "Before $x^2$.\n\n$$\n\\frac{1}{2}\n$$\n\nAfter.",
      "<div>\n\n**inside**\n\n</div>\n\n🌍",
      "<div>\n\n**edited**\n\n</div>\n\n\ud83c",
      "<div>\n\n**edited**\n\n</div>\n\n🌍",
      "# Replaced\n\nDifferent _body_.",
      "# Replaced",
      "# Replaced",
      "",
      "A plain paragraph after clearing.  ",
      "**Formatted again**.",
    ];
    const pair = renderPair(snapshots[0]!);
    for (const text of snapshots) {
      pair.update(text);
      await pair.expectEqual();
    }
  });

  it("preserves project path actions, formatter and image-root replacements with unchanged text", async () => {
    const openProjectRelativePath = vi
      .fn<(path: string, lineNumber?: number) => Promise<void>>()
      .mockResolvedValue(undefined);
    const text = "See **source** src/file.ts:7 and ![Shot](images/screen.png).";
    const first: ChatPaneActions = {
      projectLocation: { kind: "posix", path: "/block-projection-first" },
      projectRootNames: new Set(["src", "images"]),
      markdownImageRoots: ["/block-projection-images-first"],
      formatTranscriptMarkdown: (value) => `## First\n\n${value}`,
      openProjectRelativePath,
    };
    const second: ChatPaneActions = {
      projectLocation: { kind: "posix", path: "/block-projection-second" },
      projectRootNames: new Set(["src", "images"]),
      markdownImageRoots: ["/block-projection-images-second"],
      formatTranscriptMarkdown: (value) => `## Second\n\n${value}`,
      openProjectRelativePath,
    };
    const pair = renderPair(text, first);
    await pair.expectEqual();
    expect(pair.candidate.container.querySelector("h2")?.textContent).toBe("First");
    expect(within(pair.candidate.container).getByAltText("Shot")).toHaveAttribute(
      "src",
      "poracode-local://local/block-projection-images-first/images/screen.png",
    );
    pair.update(text, second);
    await pair.expectEqual();
    expect(pair.candidate.container.querySelector("h2")?.textContent).toBe("Second");
    expect(within(pair.candidate.container).getByAltText("Shot")).toHaveAttribute(
      "src",
      "poracode-local://local/block-projection-images-second/images/screen.png",
    );
    fireEvent.click(within(pair.candidate.container).getByRole("button", { name: /file\.ts.*L7/ }));
    fireEvent.click(within(pair.oracle.container).getByRole("button", { name: /file\.ts.*L7/ }));
    expect(openProjectRelativePath.mock.calls).toEqual([
      ["src/file.ts", 7],
      ["src/file.ts", 7],
    ]);
  });

  it.each(["same root", "different root"])(
    "updates the live image owner with unchanged text and %s",
    async (roots) => {
      const text = "**Image** ![Shot](/block-projection-image.png).";
      const first: ChatPaneActions = {
        projectLocation: { kind: "posix", path: "/block-projection-remote-first" },
        remoteLocalImageUrl: () => "https://first.example.test/image.png",
      };
      const second: ChatPaneActions = {
        projectLocation: {
          kind: "posix",
          path:
            roots === "same root"
              ? "/block-projection-remote-first"
              : "/block-projection-remote-second",
        },
        remoteLocalImageUrl: () => "https://second.example.test/image.png",
      };
      const pair = renderPair(text, first);
      await pair.expectEqual();
      const candidateImage = within(pair.candidate.container).getByAltText("Shot");
      const oracleImage = within(pair.oracle.container).getByAltText("Shot");
      const card = candidateImage.closest('[data-poracode-image-card="true"]');
      const textNode = pair.candidate.container.querySelector(
        '[data-streamdown="strong"]',
      )!.firstChild!;
      const selection = window.getSelection()!;
      const range = document.createRange();
      range.setStart(textNode, 1);
      range.setEnd(textNode, 4);
      selection.removeAllRanges();
      selection.addRange(range);
      const parseCount = vi.mocked(splitStreamdownMarkdownBlocks).mock.calls.length;
      expect(candidateImage).toHaveAttribute("src", "https://first.example.test/image.png");
      fireEvent.load(candidateImage);
      fireEvent.load(oracleImage);
      await pair.expectEqual();
      pair.update(text, second);
      await pair.expectEqual();
      expect(within(pair.candidate.container).getByAltText("Shot")).toBe(candidateImage);
      expect(within(pair.oracle.container).getByAltText("Shot")).toBe(oracleImage);
      expect(candidateImage.closest('[data-poracode-image-card="true"]')).toBe(card);
      expect(candidateImage).toHaveAttribute("src", "https://second.example.test/image.png");
      expect(oracleImage).toHaveAttribute("src", "https://second.example.test/image.png");
      expect(candidateImage).toHaveClass("opacity-0");
      expect(selection.anchorNode).toBe(textNode);
      expect(selection.focusNode).toBe(textNode);
      expect(selection.anchorOffset).toBe(1);
      expect(selection.focusOffset).toBe(4);
      expect(selection.toString()).toBe("mag");
      expect(vi.mocked(splitStreamdownMarkdownBlocks).mock.calls.length).toBe(parseCount);
      fireEvent.load(candidateImage);
      fireEvent.load(oracleImage);
      await pair.expectEqual();
      expect(within(pair.candidate.container).getByAltText("Shot")).toHaveClass("opacity-100");
    },
  );

  it("preserves locale and real code-theme replacements without changing Markdown", async () => {
    const text = "**Theme**\n\n```typescript\nconst themed = true;\n```\n";
    const pair = renderPair(text);
    await waitFor(() =>
      expect(pair.candidate.container.querySelector(".lc-shiki pre")).toHaveClass("github-dark"),
    );
    await pair.expectEqual();
    const darkMarkup = pair.candidate.container.querySelector(".lc-shiki")?.innerHTML;
    await act(async () => {
      useSharedSettings.setState({ themeMode: "light", locale: "es" });
      await dynamicActivate("es");
    });
    await waitFor(() => expect(i18n.locale).toBe("es"));
    await waitFor(() =>
      expect(pair.candidate.container.querySelector(".lc-shiki pre")).toHaveClass("github-light"),
    );
    await pair.expectEqual();
    expect(pair.candidate.container.querySelector(".lc-shiki")?.innerHTML).not.toBe(darkMarkup);
    expect(
      within(pair.candidate.container).queryByRole("button", { name: "Copy code" }),
    ).toBeNull();
    expect(
      within(pair.candidate.container).getByRole("button", { name: "Copiar código" }),
    ).toBeTruthy();
    expect(
      within(pair.oracle.container).getByRole("button", { name: "Copiar código" }),
    ).toBeTruthy();
  });

  it("renders all deep strong spans through the actual chat pipeline without recursion failure", () => {
    const text = "*".repeat(8_192) + "x" + "*".repeat(8_192);
    const view = render(<Fixture text={text} oracle={false} actions={null} />);
    // Traverse iteratively: serializing deeply nested DOM would introduce a
    // separate jsdom serializer recursion limit unrelated to the app parser.
    const walker = document.createTreeWalker(view.container, NodeFilter.SHOW_ALL);
    let strongCount = 0;
    let renderedText = "";
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node instanceof Element && node.getAttribute("data-streamdown") === "strong")
        strongCount += 1;
      if (node instanceof Text) renderedText += node.data;
    }
    expect(strongCount).toBe(4_096);
    expect(renderedText).toBe("x");
    const outer = view.container.querySelector('[data-streamdown="strong"]')!;
    view.unmount();
    expect(outer.childNodes).toHaveLength(0);
    expect(view.container.childNodes).toHaveLength(0);
  }, 60_000);
});
