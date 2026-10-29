import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import { ItemMarkdown } from "./ItemMarkdown";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { pathRefUrl } from "./markdownPathRefs";

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredItemMarkdownInner: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercise the pending-chunk fallback.
    throw new Promise(() => {});
  },
}));

describe.each([
  ["full Markdown", ItemMarkdownInner],
  ["lazy fallback", ItemMarkdown],
] as const)("internal path opening in %s", (_, Renderer) => {
  it.each([
    "The same directory appears as `/var/...` and `/private/var/...`.",
    "Compare /var/... with /private/var/....",
    "See src/.../report.ts:12 and src/…/report.ts:12.",
  ])("preserves abbreviated paths without broken file controls: %s", (text) => {
    const actions: ChatPaneActions = {
      projectLocation: { kind: "posix", path: "/repo" },
      projectRootNames: new Set(["src"]),
      openProjectRelativePath: vi
        .fn<(path: string, lineNumber?: number) => Promise<void>>()
        .mockResolvedValue(undefined),
      revealProjectFolderInTree: vi.fn<(path: string) => void>(),
    };
    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <Renderer text={text} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.textContent?.replaceAll("`", "")).toBe(text.replaceAll("`", ""));
    expect(actions.openProjectRelativePath).not.toHaveBeenCalled();
  });

  it("keeps a real file followed by ellipsis punctuation clickable", () => {
    const openProjectRelativePath = vi
      .fn<(path: string, lineNumber?: number) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { container } = render(
      <AppProvider>
        <ChatPaneActionsContext.Provider
          value={{
            projectLocation: { kind: "posix", path: "/repo" },
            projectRootNames: new Set(["src"]),
            openProjectRelativePath,
          }}
        >
          <Renderer text="See src/main.ts…" />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("title", "src/main.ts");
    expect(container).toHaveTextContent("See main.ts…");
    fireEvent.click(chip);
    expect(openProjectRelativePath).toHaveBeenCalledExactlyOnceWith("src/main.ts", undefined);
  });

  it.each([
    {
      name: "explicit path with a literal colon suffix and independent line range",
      href: () => pathRefUrl({ kind: "file", path: "/tmp/report:2026", line: 12, endLine: 18 }),
      path: "report:2026",
      line: 12,
      title: "report:2026:12-18",
    },
    {
      name: "legacy stored link with a line range",
      href: () => "https://poracode.local/path/%2Ftmp%2Freport.txt%3A20-26",
      path: "report.txt",
      line: 20,
      title: "report.txt:20-26",
    },
  ])("opens the correct file and line for $name", ({ href, path, line, title }) => {
    const actions: ChatPaneActions = {
      projectLocation: { kind: "posix", path: "/tmp" },
      openProjectRelativePath: vi
        .fn<(path: string, lineNumber?: number) => Promise<void>>()
        .mockResolvedValue(undefined),
      onContentHeightChange: vi.fn<() => void>(),
    };
    render(
      <AppProvider>
        <ChatPaneActionsContext.Provider value={actions}>
          <Renderer text={`See [report](${href()}).`} />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("title", title);
    fireEvent.click(chip);
    expect(actions.openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(path, line);
  });
});
