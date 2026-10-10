import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import {
  createEditorMediaSource,
  type EditorMediaSource,
} from "@/renderer/components/media/fileMediaSource";
import { MobilePageBottomBar } from "@/renderer/components/layout/MobilePageBottomActions";
import { EditorMediaViews } from "./EditorMediaViews";

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock("@/renderer/adaptiveLayout", () => ({ useCompactLayout: () => layout.compact }));
vi.mock("@/renderer/components/media/fileMediaSource", () => ({
  createEditorMediaSource: vi.fn<typeof createEditorMediaSource>(),
}));
vi.mock("@/renderer/components/composer/ImageLightbox", () => ({
  closeImageLightboxForSource: vi.fn<(source: string) => void>(),
  openImageLightbox: vi.fn<() => void>(),
}));
const location = { kind: "posix" as const, path: "/project" };
function source(id: string): EditorMediaSource {
  return {
    ticket: `pc_media_${id}`,
    url: `http://host/${id}`,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    sizeBytes: 10,
    modifiedAtMs: 1,
    contentType: "video/mp4",
    renew: vi.fn<EditorMediaSource["renew"]>(async () => ({
      ticket: `pc_media_${id}`,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    })),
    release: vi.fn<EditorMediaSource["release"]>(async () => {}),
    readImageBytes: async () => new Uint8Array(),
  };
}
beforeEach(() => {
  layout.compact = false;
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(createEditorMediaSource).mockReset();
});

it.each([
  { compact: false, kind: "video", path: "clip.mp4" },
  { compact: true, kind: "video", path: "clip.mp4" },
  { compact: false, kind: "audio", path: "tone.wav" },
  { compact: true, kind: "audio", path: "tone.wav" },
])(
  "preserves playing $kind position through a pending explicit reload (compact=$compact)",
  async ({ compact, kind, path }) => {
    layout.compact = compact;
    let complete!: (value: EditorMediaSource) => void;
    const first = source("first"),
      second = source("second");
    vi.mocked(createEditorMediaSource)
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      );
    const screen = render(
      <>
        <MobilePageBottomBar>
          <span />
        </MobilePageBottomBar>
        <EditorMediaViews path={path} projectLocation={location} />
      </>,
    );
    await waitFor(() =>
      expect(screen.container.querySelector<HTMLMediaElement>(kind)?.src).toBe("http://host/first"),
    );
    const initial = screen.container.querySelector<HTMLMediaElement>(kind)!;
    expect(initial.play).not.toHaveBeenCalled();
    fireEvent.loadedMetadata(initial);
    initial.currentTime = 12;
    Object.defineProperty(initial, "paused", { value: false });
    fireEvent.click(screen.getByRole("button", { name: "Reload preview" }));
    await waitFor(() => expect(createEditorMediaSource).toHaveBeenCalledTimes(2));
    expect(screen.container.querySelector(kind)).toBeNull();
    expect(first.release).toHaveBeenCalledOnce();
    expect(initial.pause).toHaveBeenCalledOnce();
    await act(async () => complete(second));
    const reloaded = screen.container.querySelector<HTMLMediaElement>(kind)!;
    expect(reloaded).not.toBe(initial);
    Object.defineProperty(reloaded, "duration", { value: 20 });
    fireEvent.loadedMetadata(reloaded);
    expect(reloaded.currentTime).toBe(12);
    expect(reloaded.play).toHaveBeenCalledOnce();
    screen.unmount();
    expect(second.release).toHaveBeenCalledOnce();
  },
);

it.each([
  { kind: "video", path: "clip.mp4" },
  { kind: "audio", path: "tone.wav" },
])(
  "keeps a paused $kind paused and clamps its position to the shortened file",
  async ({ kind, path }) => {
    vi.mocked(createEditorMediaSource)
      .mockResolvedValueOnce(source("first"))
      .mockResolvedValueOnce(source("shortened"));
    const screen = render(<EditorMediaViews path={path} projectLocation={location} />);
    await waitFor(() =>
      expect(screen.container.querySelector<HTMLMediaElement>(kind)?.src).toBe("http://host/first"),
    );
    const initial = screen.container.querySelector<HTMLMediaElement>(kind)!;
    fireEvent.loadedMetadata(initial);
    initial.currentTime = 12;
    fireEvent.click(screen.getByRole("button", { name: "Reload preview" }));
    await waitFor(() => {
      const player = screen.container.querySelector(kind);
      expect(player).not.toBeNull();
      expect(player).not.toBe(initial);
      expect(screen.container.querySelector<HTMLMediaElement>(kind)?.src).toBe(
        "http://host/shortened",
      );
    });
    const reloaded = screen.container.querySelector<HTMLMediaElement>(kind)!;
    expect(reloaded).not.toBeNull();
    Object.defineProperty(reloaded, "duration", { value: 5 });
    fireEvent.loadedMetadata(reloaded);
    expect(reloaded.currentTime).toBe(5);
    expect(reloaded.play).not.toHaveBeenCalled();
  },
);

it("keeps the last decoded position when a replacement is reloaded before its metadata arrives", async () => {
  vi.mocked(createEditorMediaSource)
    .mockResolvedValueOnce(source("first"))
    .mockResolvedValueOnce(source("second"))
    .mockResolvedValueOnce(source("third"));
  const screen = render(<EditorMediaViews path="clip.mp4" projectLocation={location} />);
  await waitFor(() =>
    expect(screen.container.querySelector("video")?.src).toBe("http://host/first"),
  );
  const initial = screen.container.querySelector("video")!;
  Object.defineProperty(initial, "duration", { value: 20 });
  fireEvent.loadedMetadata(initial);
  initial.currentTime = 12;
  Object.defineProperty(initial, "paused", { value: false });
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }));
  await waitFor(() =>
    expect(screen.container.querySelector("video")?.src).toBe("http://host/second"),
  );
  // The fresh player's zero/default-paused state is not a decoded position.
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }));
  await waitFor(() =>
    expect(screen.container.querySelector("video")?.src).toBe("http://host/third"),
  );
  const final = screen.container.querySelector("video")!;
  Object.defineProperty(final, "duration", { value: 20 });
  fireEvent.loadedMetadata(final);
  expect(final.currentTime).toBe(12);
  expect(final.play).toHaveBeenCalledOnce();
});

it("releases a late reload grant after the document closes without reviving playback", async () => {
  let complete!: (value: EditorMediaSource) => void;
  const first = source("first"),
    late = source("late");
  vi.mocked(createEditorMediaSource)
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
  const screen = render(<EditorMediaViews path="clip.mp4" projectLocation={location} />);
  await waitFor(() => expect(screen.container.querySelector("video")).not.toBeNull());
  const initial = screen.container.querySelector("video")!;
  Object.defineProperty(initial, "paused", { value: false });
  fireEvent.click(screen.getByRole("button", { name: "Reload preview" }));
  await waitFor(() => expect(createEditorMediaSource).toHaveBeenCalledTimes(2));
  const signal = vi.mocked(createEditorMediaSource).mock.calls[1]![2]!;
  screen.unmount();
  expect(signal.aborted).toBe(true);
  expect(first.release).toHaveBeenCalledOnce();
  expect(initial.pause).toHaveBeenCalledOnce();
  await act(async () => complete(late));
  expect(late.release).toHaveBeenCalledOnce();
  expect(initial.play).not.toHaveBeenCalled();
});

it("does not transfer playback intent into a different file or remote owner", async () => {
  vi.mocked(createEditorMediaSource)
    .mockResolvedValueOnce(source("first"))
    .mockResolvedValueOnce(source("second"))
    .mockResolvedValueOnce(source("other-owner"));
  const screen = render(<EditorMediaViews path="first.mp4" projectLocation={location} />);
  await waitFor(() => expect(screen.container.querySelector("video")).not.toBeNull());
  const first = screen.container.querySelector("video")!;
  fireEvent.loadedMetadata(first);
  first.currentTime = 12;
  Object.defineProperty(first, "paused", { value: false });
  screen.rerender(<EditorMediaViews path="second.mp4" projectLocation={location} />);
  await waitFor(() => expect(createEditorMediaSource).toHaveBeenCalledTimes(2));
  await act(async () => {});
  const second = screen.container.querySelector("video")!;
  Object.defineProperty(second, "duration", { value: 20 });
  fireEvent.loadedMetadata(second);
  expect(second.currentTime).toBe(0);
  expect(second.play).not.toHaveBeenCalled();
  second.currentTime = 15;
  Object.defineProperty(second, "paused", { value: false });
  screen.rerender(
    <EditorMediaViews
      path="second.mp4"
      projectLocation={{ ...location, remoteServerId: "other-host" }}
    />,
  );
  await act(async () => {});
  const other = screen.container.querySelector("video")!;
  Object.defineProperty(other, "duration", { value: 20 });
  fireEvent.loadedMetadata(other);
  expect(other.currentTime).toBe(0);
  expect(other.play).not.toHaveBeenCalled();
});
