import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import {
  createEditorMediaSource,
  type EditorMediaSource,
} from "@/renderer/components/media/fileMediaSource";
import { ChatPaneActionsContext, type ChatPaneActions } from "../../chatPaneActionsContext";
import { MarkdownVideo } from "./MarkdownVideo";
import ItemMarkdownInner from "./ItemMarkdownInner";
import { AssistantMessage } from "./AssistantMessage";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { isVisibleRuntimeItem, selectVisibleThreadTimelineEntries } from "../../chatPaneSelectors";
import { useAppStore } from "@/renderer/state/appStore";
import { ChatItemRow } from "./ChatItemRow";

vi.mock("@/renderer/components/media/fileMediaSource", () => ({
  createEditorMediaSource: vi.fn<typeof createEditorMediaSource>(),
}));
const location = { kind: "posix" as const, path: "/project", remoteServerId: "owning-host" };
let media: EditorMediaSource;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  media = {
    ticket: "pc_media_fixture",
    url: "http://owning-host/media?ticket=file-scoped",
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    sizeBytes: 1024,
    modifiedAtMs: 1,
    contentType: "video/mp4",
    renew: vi.fn<EditorMediaSource["renew"]>(async () => ({
      ticket: "pc_media_fixture",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    })),
    release: vi.fn<EditorMediaSource["release"]>(async () => {}),
    readImageBytes: async () => new Uint8Array(),
  };
  vi.mocked(createEditorMediaSource).mockResolvedValue(media);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(createEditorMediaSource).mockReset();
});

function pane(content: React.ReactNode, actions: ChatPaneActions = { mediaLocation: location }) {
  return (
    <AppProvider syncWindowChrome={false}>
      <ChatPaneActionsContext.Provider value={actions}>{content}</ChatPaneActionsContext.Provider>
    </AppProvider>
  );
}

describe("inline chat video", () => {
  it.each(["mcp_tool_call", "command_execution"] as const)(
    "shows completed %s video resources outside collapsed tool groups",
    async (type) => {
      const threadId = `tool-video-${type}`;
      const before = useAppStore.getState();
      const video: RuntimeChatItem = {
        id: "video",
        type,
        state: "started",
        streams: {},
        payload: { name: "record_demo", command: "record_demo", status: "running" },
      };
      useAppStore.setState({
        runtimeItemIdsByThread: { [threadId]: ["other", "video"] },
        runtimeItemsByIdByThread: {
          [threadId]: {
            other: {
              id: "other",
              type: "tool_call",
              state: "completed",
              streams: {},
              payload: { name: "read", status: "success" },
            },
            video,
          },
        },
      });
      try {
        expect(selectVisibleThreadTimelineEntries(useAppStore.getState(), threadId)[0]?.kind).toBe(
          "tool_call_group",
        );
        useAppStore.getState().applyRuntimeEvent(threadId, {
          type: "item.completed",
          threadId,
          itemId: "video",
          payload: {
            status: "success",
            result: {
              content: [
                {
                  type: "resource_link",
                  uri: "file:///project/demo.mp4",
                  mimeType: "video/mp4",
                  name: "Recorded demo",
                },
              ],
            },
          },
        });
        const entries = selectVisibleThreadTimelineEntries(useAppStore.getState(), threadId);
        expect(entries).toEqual([
          { kind: "item", id: "other" },
          { kind: "item", id: "video" },
        ]);
        const view = render(
          pane(<ChatItemRow threadId={threadId} entry={entries[1]!} checkpointRevert={null} />),
        );
        await waitFor(() => expect(view.container.querySelector("video")?.src).toBe(media.url));
        view.unmount();
      } finally {
        useAppStore.setState(before, true);
      }
    },
  );
  it.each([
    "[Watch](videos/demo.mp4)",
    "![Demo](videos/demo.mp4)",
    '<video src="videos/demo.mp4" controls autoplay onerror="alert(1)"></video>',
    '<video controls><source src="videos/demo.mp4" type="video/mp4"></video>',
    "[Watch](file:///project/videos/demo.mp4)",
  ])("renders provider-independent markdown with native playback: %s", async (text) => {
    const view = render(pane(<ItemMarkdownInner text={text} />));
    await waitFor(() => expect(view.container.querySelector("video")?.src).toBe(media.url));
    const video = view.container.querySelector("video")!;
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.autoplay).toBe(false);
    expect(video.preload).toBe("metadata");
    expect(video.hasAttribute("onerror")).toBe(false);
    expect(createEditorMediaSource).toHaveBeenCalledWith(
      location,
      "/project/videos/demo.mp4",
      expect.any(AbortSignal),
    );
    expect(view.container.querySelector("iframe")).toBeNull();
    view.unmount();
    expect(media.release).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalled();
  });

  it("plays web videos without a host file read and retries a decoder failure", async () => {
    const view = render(
      pane(<ItemMarkdownInner text="[Demo](https://example.test/demo.webm?token=1)" />),
    );
    const player = view.container.querySelector("video")!;
    expect(player.src).toBe("https://example.test/demo.webm?token=1");
    expect(createEditorMediaSource).not.toHaveBeenCalled();
    fireEvent.error(player);
    expect(view.getByRole("status")).toHaveTextContent("This media preview is unavailable.");
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(view.container.querySelector("video")).not.toBeNull());
  });

  it("keeps the same player and playback position through source renewal and a streamed text append", async () => {
    vi.useFakeTimers();
    const view = render(pane(<ItemMarkdownInner text="[Watch](videos/demo.mp4)" />));
    await act(async () => {});
    const player = view.container.querySelector("video")!;
    player.currentTime = 12;
    await act(async () => vi.advanceTimersByTimeAsync(91_000));
    view.rerender(pane(<ItemMarkdownInner text="[Watch](videos/demo.mp4)\n\nMore text." />));
    expect(view.container.querySelector("video")).toBe(player);
    expect(player.currentTime).toBe(12);
    expect(media.renew).toHaveBeenCalledOnce();
    expect(createEditorMediaSource).toHaveBeenCalledOnce();
  });

  it("shows a failed host read and permits retry without reading another host", async () => {
    vi.mocked(createEditorMediaSource).mockRejectedValueOnce(new Error("File not found"));
    const view = render(pane(<MarkdownVideo src="/project/demo.mp4" />));
    await waitFor(() => expect(view.getByRole("button", { name: "Retry" })).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(view.container.querySelector("video")?.src).toBe(media.url));
    expect(createEditorMediaSource).toHaveBeenCalledTimes(2);
    expect(createEditorMediaSource).toHaveBeenLastCalledWith(
      location,
      "/project/demo.mp4",
      expect.any(AbortSignal),
    );
  });

  it("renders existing canonical video file blocks even in a text-free historical assistant message", async () => {
    const item: RuntimeChatItem = {
      id: "historical-video",
      type: "assistant_message",
      state: "completed",
      streams: {},
      payload: {
        content: [
          { kind: "file", path: "file:///project/demo.mp4", mimeType: "video/mp4", name: "Demo" },
        ],
      },
    };
    const before = structuredClone(item);
    expect(isVisibleRuntimeItem(item)).toBe(true);
    const view = render(
      pane(<AssistantMessage threadId="video-thread" item={item} isTurnActive={false} />),
    );
    await waitFor(() => expect(view.container.querySelector("video")?.src).toBe(media.url));
    expect(item).toEqual(before);
  });

  it.each([
    '<video src="javascript:alert(1)"></video>',
    "[Bad](javascript:demo.mp4)",
    '```html\n<video src="/tmp/demo.mp4"></video>\n```',
  ])("keeps unsafe sources and source-code examples inert", async (text) => {
    const view = render(pane(<ItemMarkdownInner text={text} />));
    await act(async () => {});
    expect(view.container.querySelector("video")).toBeNull();
    expect(createEditorMediaSource).not.toHaveBeenCalled();
  });
});
