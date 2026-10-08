import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorMediaSource, type EditorMediaSource } from "./fileMediaSource";
import { useFileMediaSource } from "./useFileMediaSource";

vi.mock("./fileMediaSource", () => ({
  createEditorMediaSource: vi.fn<typeof createEditorMediaSource>(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
const location = { kind: "posix" as const, path: "/project" };
function source(id: string): EditorMediaSource {
  return {
    ticket: `pc_media_${id}`,
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    url: `http://host/${id}`,
    sizeBytes: 10,
    modifiedAtMs: 1,
    contentType: "video/mp4",
    release: vi.fn<() => Promise<void>>(async () => {}),
    readImageBytes: async () => new Uint8Array(),
  };
}

describe("editor media source ownership", () => {
  it("retires a late result from a switched file, hides the previous coordinate and releases on unmount", async () => {
    let complete!: (source: EditorMediaSource) => void;
    const first = source("first");
    const second = source("second");
    vi.mocked(createEditorMediaSource)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(second);
    const screen = renderHook(({ path }) => useFileMediaSource(location, path, 1, 0), {
      initialProps: { path: "first.mp4" },
    });
    screen.rerender({ path: "second.mp4" });
    await waitFor(() => expect(screen.result.current.source).toBe(second));
    await act(async () => complete(first));
    expect(first.release).toHaveBeenCalledOnce();
    expect(screen.result.current.source).toBe(second);
    screen.unmount();
    expect(second.release).toHaveBeenCalledOnce();
  });

  it("renews before expiry and retires both generations; an older host fails to the fallback state", async () => {
    vi.useFakeTimers();
    const first = source("first");
    const second = source("second");
    vi.mocked(createEditorMediaSource)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockRejectedValueOnce(new Error("404"));
    const screen = renderHook(() => useFileMediaSource(location, "clip.mp4", 1, 0));
    await act(async () => {});
    expect(screen.result.current.source).toBe(first);
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(screen.result.current.source).toBe(second);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(first.release).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(89_000));
    expect(screen.result.current.failed).toBe(true);
    expect(screen.result.current.source).toBeNull();
    expect(second.release).toHaveBeenCalledOnce();
    screen.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
