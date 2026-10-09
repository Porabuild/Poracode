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
    renew: vi.fn<EditorMediaSource["renew"]>(async () => ({
      ticket: `pc_media_${id}`,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    })),
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

  it("renews the same ticket/URL through 90s/180s without reminting, releasing, or resetting metadata/read ownership", async () => {
    vi.useFakeTimers();
    const first = source("first");
    vi.mocked(createEditorMediaSource).mockResolvedValue(first);
    const screen = renderHook(() => useFileMediaSource(location, "clip.mp4", 1, 0));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(181_000));
    expect(first.renew).toHaveBeenCalledTimes(2);
    expect(createEditorMediaSource).toHaveBeenCalledOnce();
    expect(first.release).not.toHaveBeenCalled();
    expect(screen.result.current.source).toMatchObject({
      url: first.url,
      ticket: first.ticket,
      sizeBytes: first.sizeBytes,
      readImageBytes: first.readImageBytes,
    });
    expect(Date.parse(screen.result.current.source!.expiresAt)).toBe(Date.now() + 119_000);
    screen.unmount();
    expect(first.release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a valid source through transient/older-host failures, retries with a bound, and retires only at expiry", async () => {
    vi.useFakeTimers();
    const first = source("first");
    vi.mocked(first.renew).mockRejectedValue(new Error("404"));
    vi.mocked(createEditorMediaSource).mockResolvedValue(first);
    const screen = renderHook(() => useFileMediaSource(location, "clip.mp4", 1, 0));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(119_999));
    expect(first.renew).toHaveBeenCalledTimes(3);
    expect(screen.result.current.source).toBe(first);
    expect(screen.result.current.failed).toBe(false);
    expect(first.release).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.result.current.failed).toBe(true);
    expect(screen.result.current.source).toBeNull();
    expect(first.release).toHaveBeenCalledOnce();
    screen.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not spin near a session limit and ignores late renewal after retirement", async () => {
    vi.useFakeTimers();
    const first = source("first");
    vi.mocked(first.renew).mockResolvedValue({ ticket: first.ticket, expiresAt: first.expiresAt });
    vi.mocked(createEditorMediaSource).mockResolvedValue(first);
    const screen = renderHook(() => useFileMediaSource(location, "clip.mp4", 1, 0));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(119_999));
    expect(first.renew).toHaveBeenCalledOnce();
    expect(first.release).not.toHaveBeenCalled();
    screen.unmount();
    expect(vi.getTimerCount()).toBe(0);

    const second = source("late");
    let complete!: (value: { ticket: string; expiresAt: string }) => void;
    vi.mocked(second.renew).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    vi.mocked(createEditorMediaSource).mockResolvedValue(second);
    const next = renderHook(() => useFileMediaSource(location, "other.mp4", 1, 0));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    next.unmount();
    await act(async () =>
      complete({ ticket: second.ticket, expiresAt: new Date(Date.now() + 120_000).toISOString() }),
    );
    expect(second.release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
