import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { downloadChatFile } from "@/renderer/components/media/fileMediaSource";
import { openExternalWithFeedback } from "@/renderer/utils/openExternal";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import { MarkdownFile } from "./MarkdownFile";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { AssistantMessage } from "./AssistantMessage";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { ProjectLocation } from "@/shared/contracts";

vi.mock("@/renderer/components/media/fileMediaSource", () => ({
  createEditorMediaSource: vi.fn<() => Promise<never>>(),
  downloadChatFile: vi.fn<typeof downloadChatFile>(async () => {}),
}));
vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: vi.fn<typeof openExternalWithFeedback>(),
}));

const location = { kind: "posix" as const, path: "/project" };

beforeEach(() => {
  vi.mocked(downloadChatFile).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(downloadChatFile).mockReset();
  vi.mocked(openExternalWithFeedback).mockReset();
});

function pane(content: React.ReactNode, actions: ChatPaneActions = { mediaLocation: location }) {
  return (
    <AppProvider syncWindowChrome={false}>
      <ChatPaneActionsContext.Provider value={actions}>{content}</ChatPaneActionsContext.Provider>
    </AppProvider>
  );
}

function fileItem(state: RuntimeChatItem["state"], path: string, mimeType?: string) {
  const item: RuntimeChatItem = {
    id: `file-${state}`,
    type: "assistant_message",
    state,
    streams: {},
    payload: {
      content: [{ kind: "file", path, name: "release.zip", ...(mimeType ? { mimeType } : {}) }],
    },
  };
  return item;
}

describe("chat file download card", () => {
  it.each([
    ["[Build](dist/release.zip)", "release.zip"],
    ["[Doc](docs/spec.pdf)", "spec.pdf"],
    ["[Win](D:\\\\out\\\\release.zip)", "release.zip"],
    ["[Space](dist/my%20build.zip)", "my build.zip"],
    ["[Abs](file:///project/dist/release.zip)", "release.zip"],
  ])("renders a card for %s and mints only on click", async (text, shown) => {
    const view = render(pane(<ItemMarkdownInner text={text} />));
    const card = await waitFor(() => view.getByTestId("chat-file"));
    expect(card.textContent).toContain(shown);
    expect(downloadChatFile).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: /Download/ }));
    await waitFor(() => expect(downloadChatFile).toHaveBeenCalledOnce());
    const [owner, path] = vi.mocked(downloadChatFile).mock.calls[0]!;
    expect(owner).toEqual(location);
    expect(path.endsWith(shown)).toBe(true);
  });

  it("downloads through the media owner when it differs from the project location", async () => {
    const media: ProjectLocation = { kind: "posix", path: "/media-root" };
    const project: ProjectLocation = { kind: "posix", path: "/project-root" };
    const view = render(
      pane(<MarkdownFile src="release.zip" />, {
        mediaLocation: media,
        projectLocation: project,
      }),
    );
    fireEvent.click(view.getByRole("button", { name: /Download/ }));
    await waitFor(() =>
      expect(downloadChatFile).toHaveBeenCalledWith(media, "release.zip", expect.any(AbortSignal)),
    );
  });

  it("resolves a project-relative artifact path against the owner", async () => {
    const view = render(pane(<MarkdownFile src="dist/release.zip" />));
    fireEvent.click(view.getByRole("button", { name: /Download release\.zip/ }));
    await waitFor(() =>
      expect(downloadChatFile).toHaveBeenCalledWith(
        location,
        "dist/release.zip",
        expect.any(AbortSignal),
      ),
    );
  });

  it("guards repeated clicks while pending and retries after an error toast", async () => {
    let release!: () => void;
    vi.mocked(downloadChatFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const view = render(pane(<MarkdownFile src="release.zip" name="release.zip" />));
    const button = view.getByRole("button", { name: "Download release.zip" });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => release());
    expect(downloadChatFile).toHaveBeenCalledOnce();

    const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    vi.mocked(downloadChatFile).mockRejectedValueOnce(
      new Error("The file path is outside the project."),
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(danger).toHaveBeenCalledWith(
        "Unable to download the file.",
        expect.objectContaining({
          description: expect.stringContaining("outside the project"),
        }),
      ),
    );
    vi.mocked(downloadChatFile).mockResolvedValueOnce(undefined);
    fireEvent.click(button);
    await waitFor(() => expect(downloadChatFile).toHaveBeenCalledTimes(3));
  });

  it("shows a visible pending indicator instead of a blank icon", async () => {
    let release!: () => void;
    vi.mocked(downloadChatFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const view = render(pane(<MarkdownFile src="release.zip" name="release.zip" />));
    const button = view.getByRole("button", { name: "Download release.zip" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(button.querySelector("svg, [class*=loader], [class*=spinner]")).not.toBeNull(),
    );
    await act(async () => release());
  });

  it("aborts a pending mint when the source changes", async () => {
    let signal!: AbortSignal;
    vi.mocked(downloadChatFile).mockImplementation(
      (_l, _p, s) =>
        new Promise<void>(() => {
          signal = s;
        }),
    );
    const view = render(pane(<MarkdownFile src="first.zip" />));
    fireEvent.click(view.getByRole("button", { name: /Download/ }));
    await waitFor(() => expect(signal).toBeDefined());
    view.rerender(pane(<MarkdownFile src="second.zip" />));
    await waitFor(() => expect(signal.aborted).toBe(true));
  });

  it.each(["notes.txt", "report.pdf", "data.csv"])(
    "keeps an editor preview on the name for %s",
    async (name) => {
      const openProjectRelativePath = vi.fn<(path: string, line?: number) => Promise<void>>(
        async () => {},
      );
      const actions: ChatPaneActions = {
        mediaLocation: location,
        projectLocation: location,
        openProjectRelativePath,
      };
      const view = render(pane(<MarkdownFile src={`docs/${name}`} />, actions));
      fireEvent.click(view.getByRole("button", { name }));
      await waitFor(() =>
        expect(openProjectRelativePath).toHaveBeenCalledWith(`docs/${name}`, undefined),
      );
      fireEvent.click(view.getByRole("button", { name: new RegExp(`Download ${name}`) }));
      await waitFor(() => expect(downloadChatFile).toHaveBeenCalledOnce());
    },
  );

  it("toasts when the preview open rejects, without disabling download", async () => {
    const danger = vi.spyOn(toast, "danger").mockImplementation(() => undefined as never);
    const openProjectRelativePath = vi
      .fn<(path: string, line?: number) => Promise<void>>()
      .mockRejectedValue(new Error("gone"));
    const actions: ChatPaneActions = {
      mediaLocation: location,
      projectLocation: location,
      openProjectRelativePath,
    };
    const view = render(pane(<MarkdownFile src="docs/notes.txt" />, actions));
    fireEvent.click(view.getByRole("button", { name: "notes.txt" }));
    await waitFor(() => expect(danger).toHaveBeenCalled());
    fireEvent.click(view.getByRole("button", { name: /Download notes\.txt/ }));
    await waitFor(() => expect(downloadChatFile).toHaveBeenCalledOnce());
  });

  it("does not offer a preview action for archives without an editor action", async () => {
    const actions: ChatPaneActions = { mediaLocation: location, projectLocation: location };
    const view = render(pane(<MarkdownFile src="dist/release.zip" />, actions));
    expect(view.queryByRole("button", { name: "release.zip" })).toBeNull();
    expect(view.getByRole("button", { name: /Download release\.zip/ })).toBeInTheDocument();
  });

  it("aborts a pending mint on unmount", async () => {
    let signal!: AbortSignal;
    vi.mocked(downloadChatFile).mockImplementationOnce(
      (_l, _p, s) =>
        new Promise<void>(() => {
          signal = s;
        }),
    );
    const view = render(pane(<MarkdownFile src="release.zip" />));
    fireEvent.click(view.getByRole("button", { name: /Download/ }));
    await waitFor(() => expect(signal).toBeDefined());
    view.unmount();
    expect(signal.aborted).toBe(true);
  });

  it("disables the download when no owning location exists", async () => {
    const view = render(
      <AppProvider syncWindowChrome={false}>
        <ChatPaneActionsContext.Provider value={{}}>
          <MarkdownFile src="release.zip" />
        </ChatPaneActionsContext.Provider>
      </AppProvider>,
    );
    const button = view.getByRole("button", { name: /Download/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    await act(async () => {});
    expect(downloadChatFile).not.toHaveBeenCalled();
  });

  it("opens a canonical HTTP file reference externally instead of proxying", async () => {
    const view = render(
      pane(<MarkdownFile src="https://example.test/release.zip" name="release.zip" />),
    );
    fireEvent.click(view.getByRole("button", { name: /Download/ }));
    await waitFor(() =>
      expect(openExternalWithFeedback).toHaveBeenCalledWith("https://example.test/release.zip"),
    );
    expect(downloadChatFile).not.toHaveBeenCalled();
  });

  it.each([
    "[Code](src/file.ts)",
    "[Notes](README.md)",
    "[Web](https://example.test/a.zip)",
    "[Bad](javascript:alert(1))",
  ])("keeps %s off the download card path", async (text) => {
    const actions: ChatPaneActions = {
      mediaLocation: location,
      projectLocation: location,
      openProjectRelativePath: vi.fn<(path: string, line?: number) => Promise<void>>(
        async () => {},
      ),
    };
    const view = render(pane(<ItemMarkdownInner text={text} />, actions));
    await act(async () => {});
    expect(view.queryByTestId("chat-file")).toBeNull();
    expect(downloadChatFile).not.toHaveBeenCalled();
  });

  it("renders a canonical non-video file block as a card in a text-free completed message", async () => {
    const view = render(
      pane(
        <AssistantMessage
          threadId="t"
          item={fileItem("completed", "/project/release.zip")}
          isTurnActive={false}
        />,
      ),
    );
    const card = await waitFor(() => view.getByTestId("chat-file"));
    expect(card.textContent).toContain("release.zip");
    fireEvent.click(view.getByRole("button", { name: /Download/ }));
    await waitFor(() =>
      expect(downloadChatFile).toHaveBeenCalledWith(
        location,
        "/project/release.zip",
        expect.any(AbortSignal),
      ),
    );
  });

  it("shows a file card without a phantom loader while a file-only message streams", async () => {
    const view = render(
      pane(
        <AssistantMessage
          threadId="t"
          item={fileItem("started", "/project/release.zip")}
          isTurnActive
        />,
      ),
    );
    await waitFor(() => view.getByTestId("chat-file"));
    expect(view.container.querySelector("[class*='pixel'], svg animate")).toBeNull();
  });

  it("keeps an unsafe typed file reference inert", async () => {
    const item = fileItem("completed", "javascript:alert(1)");
    const view = render(pane(<AssistantMessage threadId="t" item={item} isTurnActive={false} />));
    await act(async () => {});
    expect(view.queryByTestId("chat-file")).toBeNull();
    expect(downloadChatFile).not.toHaveBeenCalled();
  });
});
