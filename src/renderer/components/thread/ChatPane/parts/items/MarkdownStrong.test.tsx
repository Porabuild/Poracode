import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Streamdown, defaultRehypePlugins } from "streamdown";
import remarkGfm from "remark-gfm";
import { AppProvider } from "@/renderer/components/ui/provider";
import { dynamicActivate } from "@/renderer/i18n/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  STRONG_TEXT_RUN_COMPONENT,
  STRONG_TEXT_RUN_OPTIONS,
  remarkStrongTextRuns,
  rehypeRestoreStrongTextRuns,
  rehypeStrongTextRunComponents,
} from "@/renderer/markdown/strongTextRuns";
import { splitStreamdownMarkdownBlocks } from "@/renderer/markdown/streamdownBlockSplitter";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { MarkdownStrong } from "./MarkdownStrong";

type RehypePlugins = NonNullable<ComponentProps<typeof Streamdown>["rehypePlugins"]>;
const ordinaryPlugins = Object.entries(defaultRehypePlugins)
  .filter(([key]) => key !== "harden")
  .map(([, plugin]) => plugin) as RehypePlugins;
const runPlugins = Object.entries(defaultRehypePlugins)
  .filter(([key]) => key !== "harden")
  .flatMap(([key, plugin]): RehypePlugins => {
    if (key === "raw") return [plugin, [rehypeRestoreStrongTextRuns, STRONG_TEXT_RUN_OPTIONS]];
    if (key === "sanitize")
      return [plugin, [rehypeStrongTextRunComponents, STRONG_TEXT_RUN_OPTIONS]];
    return [plugin];
  });
const remarkPlugins: NonNullable<ComponentProps<typeof Streamdown>["remarkPlugins"]> = [
  remarkGfm,
  [remarkStrongTextRuns, STRONG_TEXT_RUN_OPTIONS],
];
const components = { [STRONG_TEXT_RUN_COMPONENT]: MarkdownStrong };
const initialSettings = useSharedSettings.getState();

function Snapshot({ text, stock = false }: { text: string; stock?: boolean }) {
  return (
    <Streamdown
      parseMarkdownIntoBlocksFn={splitStreamdownMarkdownBlocks}
      remarkPlugins={stock ? [remarkGfm] : remarkPlugins}
      rehypePlugins={stock ? ordinaryPlugins : runPlugins}
      {...(!stock ? { components } : {})}
      parseIncompleteMarkdown
    >
      {text}
    </Streamdown>
  );
}

function countDOM(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ALL);
  let strong = 0;
  let text = "";
  let privateAttributes = 0;
  const strongAttributes: string[][][] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Element) {
      if (node.getAttribute("data-streamdown") === "strong") {
        strong += 1;
        strongAttributes.push([...node.attributes].map((attr) => [attr.name, attr.value]));
      }
      privateAttributes += [...node.attributes].filter((attr) =>
        /strongrun|strong-text-run/i.test(attr.name),
      ).length;
    }
    if (node instanceof Text) text += node.data;
  }
  expect(strongAttributes).toEqual(
    Array.from({ length: strong }, () => [
      ["class", "font-semibold"],
      ["data-streamdown", "strong"],
    ]),
  );
  return { strong, text, privateAttributes };
}

afterEach(async () => {
  cleanup();
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  useSharedSettings.setState({
    locale: initialSettings.locale,
    themeMode: initialSettings.themeMode,
  });
  await dynamicActivate("en");
});

describe("lossless strong text DOM ownership", () => {
  it("renders all 4096 spans in the actual chat pipeline and disposes them on replacement/unmount", () => {
    const text = "*".repeat(8_192) + "x" + "*".repeat(8_192);
    const fixture = (value: string) => (
      <AppProvider syncWindowChrome={false}>
        <ItemMarkdownInner text={value} />
      </AppProvider>
    );
    const view = render(fixture(text));
    expect(countDOM(view.container)).toEqual({ strong: 4_096, text: "x", privateAttributes: 0 });
    const outer = view.container.querySelector('[data-streamdown="strong"]')!;
    const walker = document.createTreeWalker(outer, NodeFilter.SHOW_TEXT);
    const leaf = walker.nextNode()!;
    const range = document.createRange();
    range.setStart(leaf, 0);
    range.setEnd(leaf, 1);
    window.getSelection()!.addRange(range);
    view.rerender(fixture(text));
    expect(view.container.querySelector('[data-streamdown="strong"]')).toBe(outer);
    expect(leaf.isConnected).toBe(true);
    expect(window.getSelection()!.anchorNode).toBe(leaf);
    expect(window.getSelection()!.focusOffset).toBe(1);
    view.rerender(fixture("ordinary **ok**"));
    expect(countDOM(view.container)).toEqual({
      strong: 1,
      text: "ordinary ok",
      privateAttributes: 0,
    });
    expect(outer.isConnected).toBe(false);
    expect(outer.childNodes).toHaveLength(0);
    view.rerender(fixture(text));
    expect(countDOM(view.container)).toEqual({ strong: 4_096, text: "x", privateAttributes: 0 });
    const nextOuter = view.container.querySelector('[data-streamdown="strong"]')!;
    view.unmount();
    expect(nextOuter.childNodes).toHaveLength(0);
    expect(view.container.childNodes).toHaveLength(0);
  }, 60_000);

  it("owns cleanup under StrictMode, shrink, clear and eligibility replacement", () => {
    const fixture = (text: string) => (
      <StrictMode>
        <Snapshot text={text} />
      </StrictMode>
    );
    const view = render(fixture("*".repeat(256) + "x" + "*".repeat(256)));
    expect(countDOM(view.container)).toEqual({ strong: 128, text: "x", privateAttributes: 0 });
    const first = view.container.querySelector('[data-streamdown="strong"]')!;
    view.rerender(fixture("****y****"));
    expect(countDOM(view.container)).toEqual({ strong: 2, text: "y", privateAttributes: 0 });
    expect(first).toBe(view.container.querySelector('[data-streamdown="strong"]'));
    view.rerender(fixture("****z**** <b>raw</b>"));
    expect(countDOM(view.container)).toEqual({ strong: 2, text: "z raw", privateAttributes: 0 });
    expect(first.childNodes).toHaveLength(0);
    view.rerender(fixture(""));
    expect(countDOM(view.container)).toEqual({ strong: 0, text: "", privateAttributes: 0 });
    view.unmount();
  });

  it("preserves every owned node and selection endpoint across owner, appearance and locale changes", async () => {
    const text = "*".repeat(64) + "word" + "*".repeat(64);
    const fixture = (actions: ChatPaneActions) => (
      <AppProvider syncWindowChrome={false}>
        <ChatPaneActionsContext.Provider value={actions}>
          <ItemMarkdownInner text={text} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>
    );
    const view = render(fixture({ projectLocation: { kind: "posix", path: "/strong-first" } }));
    const walker = document.createTreeWalker(view.container, NodeFilter.SHOW_ALL);
    const before: Node[] = [];
    while (walker.nextNode()) before.push(walker.currentNode);
    const leaf = before.find((node) => node instanceof Text && node.data === "word")!;
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(leaf, 1);
    range.setEnd(leaf, 3);
    selection.addRange(range);
    view.rerender(fixture({ projectLocation: { kind: "posix", path: "/strong-second" } }));
    await act(async () => {
      useSharedSettings.setState({ themeMode: "light", locale: "ru" });
      await dynamicActivate("ru");
    });
    const after: Node[] = [];
    walker.currentNode = view.container;
    while (walker.nextNode()) after.push(walker.currentNode);
    expect(after).toHaveLength(before.length);
    expect(after.every((node, index) => node === before[index])).toBe(true);
    expect(countDOM(view.container)).toEqual({ strong: 32, text: "word", privateAttributes: 0 });
    expect(selection.anchorNode).toBe(leaf);
    expect(selection.focusNode).toBe(leaf);
    expect(selection.anchorOffset).toBe(1);
    expect(selection.focusOffset).toBe(3);
    expect(selection.toString()).toBe("or");
  });

  it("keeps transformed project-path leaves in the stock interactive pipeline", () => {
    const openProjectRelativePath = vi
      .fn<(path: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const view = render(
      <AppProvider syncWindowChrome={false}>
        <ChatPaneActionsContext.Provider
          value={{
            projectLocation: { kind: "posix", path: "/strong-path" },
            projectRootNames: new Set(["src"]),
            openProjectRelativePath,
          }}
        >
          <ItemMarkdownInner text="****src/file.ts****" />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(view.container.querySelectorAll('[data-streamdown="strong"]')).toHaveLength(2);
    const button = view.getByRole("button", { name: "file.ts" });
    fireEvent.click(button);
    expect(openProjectRelativePath).toHaveBeenCalledExactlyOnceWith("src/file.ts", undefined);
  });

  it.each([
    "**one** and _emphasis_ and ~~gone~~.",
    "****two**** and ******three******.",
    "[****label****](https://example.test/path)",
    "- ****first****\n- **second**\n\n> ****quote****",
    "****escaped & <literal>****",
    "****Café 🌍****",
    "****\ud800X\udfff****",
    "\\*\\* literal and **incomplete",
    "**outer _mixed_** and `****code****`",
    "****x**** <b>raw</b>",
    '<strong class="font-bold" title="raw">html</strong>',
    "<poracode-strong-text-run>forged</poracode-strong-text-run>",
    '<strong data-strongrunfake="0" data-poracode-strong-text-run-count="4096">kept</strong>',
    "![image](https://example.test/image.png) and ****text****",
    "$x$ and ****text****",
  ])("matches exact stock shallow markup/selection: %s", (text) => {
    const current = render(<Snapshot text={text} />);
    const stock = render(<Snapshot text={text} stock />);
    expect(current.container.innerHTML).toBe(stock.container.innerHTML);
    const currentRange = document.createRange();
    const stockRange = document.createRange();
    currentRange.selectNodeContents(current.container);
    stockRange.selectNodeContents(stock.container);
    expect(currentRange.toString()).toBe(stockRange.toString());
  });
});
import "fake-indexeddb/auto";
