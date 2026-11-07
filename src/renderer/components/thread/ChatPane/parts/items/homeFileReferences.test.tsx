import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { ChatPaneActionsContext } from "../../chatPaneActionsContext";
import { ItemMarkdown } from "./ItemMarkdown";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { downloadChatFile } from "@/renderer/components/media/fileMediaSource";

vi.mock("@/renderer/components/media/fileMediaSource", () => ({
  downloadChatFile: vi.fn<typeof downloadChatFile>(async () => {}),
}));

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
  it.each(["md", "pdf", "csv", "png"])("opens a %s file without project context", (extension) => {
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
  });

  it.each(["pptx", "docx", "xlsx"])(
    "downloads an unsupported %s file from its Home owner",
    async (extension) => {
      vi.mocked(downloadChatFile).mockClear();
      const path = `/tmp/report.${extension}`;
      const mediaLocation = { kind: "posix" as const, path: "/tmp" };
      const openProjectRelativePath = vi.fn<(path: string, line?: number) => Promise<void>>();
      render(
        <AppProvider>
          <ChatPaneActionsContext.Provider value={{ openProjectRelativePath, mediaLocation }}>
            <Renderer text={`Open \`${path}\` to review it.`} />
          </ChatPaneActionsContext.Provider>
        </AppProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: `report.${extension}` }));
      await waitFor(() =>
        expect(downloadChatFile).toHaveBeenCalledExactlyOnceWith(
          mediaLocation,
          path,
          expect.any(AbortSignal),
        ),
      );
      expect(openProjectRelativePath).not.toHaveBeenCalled();
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
