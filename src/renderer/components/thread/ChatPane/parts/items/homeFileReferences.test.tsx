import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { ItemMarkdown } from "./ItemMarkdown";
import ItemMarkdownInner from "./ItemMarkdownInner";

vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredItemMarkdownInner: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Exercise the unloaded Markdown chunk.
    throw new Promise(() => {});
  },
}));

describe.each([
  ["full Markdown", ItemMarkdownInner],
  ["lazy fallback", ItemMarkdown],
] as const)("Home file references in %s", (_, Renderer) => {
  it.each(["md", "pdf", "pptx", "docx", "xlsx", "csv", "png"])(
    "opens a %s file without project context",
    (extension) => {
      const path = `/tmp/report.${extension}`;
      const openProjectRelativePath = vi
        .fn<(path: string, line?: number) => Promise<void>>()
        .mockResolvedValue(undefined);
      render(
        <AppProvider>
          <ChatPaneActionsContext.Provider value={{ openProjectRelativePath }}>
            <Renderer text={`Open \`${path}\` to review it.`} />
          </ChatPaneActionsContext.Provider>
        </AppProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: `report.${extension}` }));
      expect(openProjectRelativePath).toHaveBeenCalledExactlyOnceWith(path, undefined);
    },
  );
});

it("opens an ordinary Markdown PDF link without project context", () => {
  const openProjectRelativePath = vi
    .fn<(path: string, line?: number) => Promise<void>>()
    .mockResolvedValue(undefined);
  render(
    <AppProvider>
      <ChatPaneActionsContext.Provider value={{ openProjectRelativePath }}>
        <ItemMarkdownInner text="[Download the report](/tmp/report.pdf)" />
      </ChatPaneActionsContext.Provider>
    </AppProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "report.pdf" }));
  expect(openProjectRelativePath).toHaveBeenCalledExactlyOnceWith("/tmp/report.pdf", undefined);
});
