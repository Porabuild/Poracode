import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendRuntimeStream,
  hydrateRuntimeStream,
  replaceRuntimeStream,
  type RetainedRuntimeStream,
} from "@/renderer/state/slices/runtimeStreamRetention";
import { HEAD_CHARS, TAIL_CHARS } from "@/shared/runtimeStreamRetentionPolicy";
import { createChatReaderFollowSignal, type ChatReaderFollowSignal } from "../../chatReaderFollow";
import * as windows from "./assistantTextWindow";
import * as plainText from "./longPlainText";
import { useWindowedAssistantText } from "./useWindowedAssistantText";

const WIDTH = plainText.PLAIN_TEXT_WINDOW_CHARS;

function useStreamWindow({
  stream,
  isStreaming = true,
  readerFollow,
}: {
  stream: RetainedRuntimeStream;
  isStreaming?: boolean;
  readerFollow?: ChatReaderFollowSignal;
}) {
  return useWindowedAssistantText(stream.text, isStreaming, stream.retention, readerFollow);
}

function cappedSource(gap = 1_000, tail = "t") {
  return `${"h".repeat(HEAD_CHARS)}${"m".repeat(gap)}${tail.repeat(TAIL_CHARS)}`;
}

afterEach(() => vi.restoreAllMocks());

describe("detached assistant pages", () => {
  it("preserves raw append browsing through the first cap without allocating pages on stream updates", () => {
    let stream: RetainedRuntimeStream = {
      text: `${"a".repeat(WIDTH)}${"b".repeat(WIDTH)}${"c".repeat(WIDTH)}`,
    };
    const detach = vi.spyOn(windows, "earlierAssistantTextPage");
    const { result, rerender } = renderHook(useStreamWindow, { initialProps: { stream } });
    expect(detach).not.toHaveBeenCalled();
    act(() => result.current.showEarlier());
    const page = result.current.window;
    expect(page?.text).toBe("b".repeat(WIDTH));
    expect(detach).toHaveBeenCalledTimes(1);
    stream = appendRuntimeStream(stream.text, "raw append");
    rerender({ stream });
    expect(result.current.window).toBe(page);
    stream = appendRuntimeStream(
      stream.text,
      "n".repeat(HEAD_CHARS + TAIL_CHARS),
      stream.retention,
    );
    rerender({ stream });
    expect(result.current.window).toBe(page);
    expect(detach).toHaveBeenCalledTimes(1);
    act(() => result.current.showEarlier());
    expect(result.current.window?.text).toBe("a".repeat(WIDTH));
    expect(result.current.window?.start).toBe(0);
    act(() => result.current.showLatest());
    expect(result.current.window?.text).toBe("n".repeat(WIDTH));
    expect(result.current.isBrowsingEarlier).toBe(false);
    expect(detach).toHaveBeenCalledTimes(2);
  });

  it("holds the same snapshot across notice digit growth and completion without inspecting a full source", () => {
    let stream = replaceRuntimeStream(cappedSource(9));
    const inspect = vi.spyOn(plainText, "inspectPlainStream");
    const { result, rerender } = renderHook(useStreamWindow, {
      initialProps: { stream, isStreaming: true },
    });
    act(() => result.current.showEarlier());
    const selected = result.current.window;
    const oldLength = stream.text.length;
    stream = appendRuntimeStream(stream.text, "N", stream.retention);
    expect(stream.text.length).toBe(oldLength + 1);
    rerender({ stream, isStreaming: true });
    expect(result.current.window).toBe(selected);
    rerender({ stream, isStreaming: false });
    expect(result.current.window).toBe(selected);
    expect(inspect).not.toHaveBeenCalled();
    act(() => result.current.showLatest());
    expect(result.current.window?.text.endsWith("N")).toBe(true);
  });

  it.each(["short", "empty", "smaller capped", "larger capped", "identical"])(
    "resets browsing for a %s replacement, even with the same head",
    (kind) => {
      const original = cappedSource();
      let stream = replaceRuntimeStream(original);
      const { result, rerender } = renderHook(useStreamWindow, { initialProps: { stream } });
      act(() => result.current.showEarlier());
      expect(result.current.isBrowsingEarlier).toBe(true);
      const replacement =
        kind === "short"
          ? "h".repeat(WIDTH * 3)
          : kind === "empty"
            ? ""
            : kind === "smaller capped"
              ? cappedSource(10, "s")
              : kind === "larger capped"
                ? cappedSource(10_000, "l")
                : original;
      stream = replaceRuntimeStream(replacement, stream.retention);
      rerender({ stream });
      expect(result.current.isBrowsingEarlier).toBe(false);
      expect(result.current.window?.text ?? "").toBe(
        plainText.plainTextWindow(stream.text, stream.text.length).text,
      );
    },
  );

  it("inherits a short replacement's revision on its first cap, then resets on another larger replacement", () => {
    let stream = replaceRuntimeStream(cappedSource());
    const { result, rerender } = renderHook(useStreamWindow, { initialProps: { stream } });
    act(() => result.current.showEarlier());
    stream = replaceRuntimeStream("h".repeat(WIDTH * 3), stream.retention);
    rerender({ stream });
    expect(result.current.isBrowsingEarlier).toBe(false);
    act(() => result.current.showEarlier());
    const shortPage = result.current.window;
    const revision = stream.retention!.replacementRevision;
    stream = appendRuntimeStream(
      stream.text,
      "h".repeat(HEAD_CHARS + TAIL_CHARS),
      stream.retention,
    );
    rerender({ stream });
    expect(stream.retention?.replacementRevision).toBe(revision);
    expect(result.current.window).toBe(shortPage);
    stream = replaceRuntimeStream(cappedSource(50_000), stream.retention);
    rerender({ stream });
    expect(result.current.isBrowsingEarlier).toBe(false);
  });

  it("starts hydration/remount at latest and preserves a hydrated page during capped appends", () => {
    let stream = hydrateRuntimeStream(cappedSource());
    const first = renderHook(useStreamWindow, { initialProps: { stream } });
    expect(first.result.current.isBrowsingEarlier).toBe(false);
    act(() => first.result.current.showEarlier());
    const page = first.result.current.window;
    stream = appendRuntimeStream(stream.text, "NEXT", stream.retention);
    first.rerender({ stream });
    expect(first.result.current.window).toBe(page);
    first.unmount();
    stream = hydrateRuntimeStream(stream.text, stream.retention);
    const second = renderHook(useStreamWindow, { initialProps: { stream } });
    expect(second.result.current.isBrowsingEarlier).toBe(false);
    expect(second.result.current.window?.text.endsWith("NEXT")).toBe(true);
  });

  it("drops an old live page when fresh host hydration or an unprojected display takes over", () => {
    let stream = replaceRuntimeStream(cappedSource());
    const { result, rerender } = renderHook(useStreamWindow, { initialProps: { stream } });
    act(() => result.current.showEarlier());
    stream = hydrateRuntimeStream(cappedSource(20_000));
    rerender({ stream });
    expect(result.current.isBrowsingEarlier).toBe(false);
    act(() => result.current.showEarlier());
    stream = { text: "authoritative payload ".repeat(5_000) };
    rerender({ stream });
    expect(result.current.isBrowsingEarlier).toBe(false);
    expect(result.current.window?.text).toBe(
      plainText.plainTextWindow(stream.text, stream.text.length).text,
    );
  });
});

describe("pane reader snapshots", () => {
  it.each(["raw", "capped"])(
    "detaches the committed current %s page before queued appends and resumes the live tail",
    (kind) => {
      let stream: RetainedRuntimeStream =
        kind === "capped"
          ? replaceRuntimeStream(cappedSource())
          : { text: `${"a".repeat(WIDTH)}${"b".repeat(WIDTH)}${"c".repeat(WIDTH)}` };
      const readerFollow = createChatReaderFollowSignal();
      const detach = vi.spyOn(windows, "earlierAssistantTextPage");
      const { result, rerender } = renderHook(useStreamWindow, {
        initialProps: { stream, readerFollow },
      });
      const visibleText = result.current.window!.text;
      act(() => {
        readerFollow.pause();
        stream = appendRuntimeStream(stream.text, "n".repeat(WIDTH * 2), stream.retention);
        rerender({ stream, readerFollow });
      });
      const frozen = result.current.window;
      expect(frozen?.text).toBe(visibleText);
      expect(frozen?.text).not.toContain("nn");
      expect(result.current.isBrowsingEarlier).toBe(false);
      expect(detach).toHaveBeenCalledTimes(1);
      act(() => readerFollow.pause());
      stream = appendRuntimeStream(stream.text, "tail advanced", stream.retention);
      rerender({ stream, readerFollow });
      expect(result.current.window).toBe(frozen);
      expect(detach).toHaveBeenCalledTimes(1);
      expect(stream.text.endsWith("tail advanced")).toBe(true);
      stream = appendRuntimeStream(
        stream.text,
        "n".repeat(HEAD_CHARS + TAIL_CHARS),
        stream.retention,
      );
      rerender({ stream, readerFollow });
      expect(result.current.window).toBe(frozen);
      expect(detach).toHaveBeenCalledTimes(1);
      act(() => readerFollow.resume());
      expect(result.current.window?.text).toBe(
        plainText.plainTextWindow(stream.text, stream.text.length).text,
      );
    },
  );

  it("keeps the current page through formatting thresholds and completion until explicit return", () => {
    const readerFollow = createChatReaderFollowSignal();
    let stream: RetainedRuntimeStream = { text: "plain ".repeat(2_000) };
    const { result, rerender } = renderHook(useStreamWindow, {
      initialProps: { stream, readerFollow, isStreaming: true },
    });
    act(() => readerFollow.pause());
    const frozen = result.current.window;
    stream = appendRuntimeStream(stream.text, "\n# formatted", stream.retention);
    rerender({ stream, readerFollow, isStreaming: true });
    expect(result.current.window).toBe(frozen);
    stream = appendRuntimeStream(stream.text, "z".repeat(plainText.MAX_RICH_TEXT_CHARS));
    rerender({ stream, readerFollow, isStreaming: true });
    expect(result.current.window).toBe(frozen);
    rerender({ stream, readerFollow, isStreaming: false });
    expect(result.current.window).toBe(frozen);
    act(() => readerFollow.resume());
    expect(result.current.window?.text).toBe("z".repeat(WIDTH));
  });

  it("detaches the first committed eligible current page when mounted into an already paused pane", () => {
    const readerFollow = createChatReaderFollowSignal();
    readerFollow.pause();
    let stream: RetainedRuntimeStream = { text: "initial current text ".repeat(2_000) };
    const detach = vi.spyOn(windows, "earlierAssistantTextPage");
    const { result, rerender } = renderHook(useStreamWindow, {
      initialProps: { stream, readerFollow },
    });
    const selected = result.current.window;
    expect(selected?.text).toBe(plainText.plainTextWindow(stream.text, stream.text.length).text);
    expect(detach).toHaveBeenCalledOnce();
    stream = appendRuntimeStream(stream.text, "n".repeat(WIDTH * 2));
    rerender({ stream, readerFollow });
    expect(result.current.window).toBe(selected);
    expect(detach).toHaveBeenCalledOnce();
    act(() => readerFollow.resume());
    expect(result.current.window?.text).toBe("n".repeat(WIDTH));
  });

  it("detaches the first eligible window when formatted output enters windowing while paused", () => {
    const readerFollow = createChatReaderFollowSignal();
    let stream: RetainedRuntimeStream = { text: "# formatted body\n".repeat(2_000) };
    const detach = vi.spyOn(windows, "earlierAssistantTextPage");
    const { result, rerender } = renderHook(useStreamWindow, {
      initialProps: { stream, readerFollow },
    });
    expect(result.current.window).toBeNull();
    act(() => readerFollow.pause());
    expect(detach).not.toHaveBeenCalled();
    stream = appendRuntimeStream(
      stream.text,
      "n".repeat(plainText.MAX_RICH_TEXT_CHARS - stream.text.length + 1),
    );
    rerender({ stream, readerFollow });
    const entered = result.current.window;
    expect(entered?.text).toBe("n".repeat(WIDTH));
    expect(detach).toHaveBeenCalledOnce();
    stream = appendRuntimeStream(stream.text, "m".repeat(WIDTH * 2));
    rerender({ stream, readerFollow });
    expect(result.current.window).toBe(entered);
    expect(detach).toHaveBeenCalledOnce();
    act(() => readerFollow.resume());
    expect(result.current.window?.text).toBe("m".repeat(WIDTH));
  });

  it("preserves explicit Earlier selection independently of pane pause and return", () => {
    const readerFollow = createChatReaderFollowSignal();
    let stream: RetainedRuntimeStream = {
      text: `${"a".repeat(WIDTH)}${"b".repeat(WIDTH)}${"c".repeat(WIDTH)}`,
    };
    const { result, rerender } = renderHook(useStreamWindow, {
      initialProps: { stream, readerFollow },
    });
    act(() => result.current.showEarlier());
    const selected = result.current.window;
    act(() => readerFollow.pause());
    stream = appendRuntimeStream(stream.text, "n".repeat(WIDTH * 2));
    rerender({ stream, readerFollow });
    act(() => readerFollow.resume());
    expect(result.current.window).toBe(selected);
    expect(result.current.isBrowsingEarlier).toBe(true);
    act(() => result.current.showLatest());
    expect(result.current.window?.text).toBe("n".repeat(WIDTH));
  });

  it.each(["replacement", "hydration"])("invalidates an implicit reader snapshot on %s", (kind) => {
    const readerFollow = createChatReaderFollowSignal();
    let stream = replaceRuntimeStream(cappedSource());
    const first = renderHook(useStreamWindow, { initialProps: { stream, readerFollow } });
    act(() => readerFollow.pause());
    const frozen = first.result.current.window;
    stream =
      kind === "replacement"
        ? replaceRuntimeStream(cappedSource(10_000, "r"), stream.retention)
        : hydrateRuntimeStream(cappedSource(10_000, "r"));
    first.rerender({ stream, readerFollow });
    expect(first.result.current.window).not.toBe(frozen);
    expect(first.result.current.window?.text).toBe("r".repeat(WIDTH));
    const current = first.result.current.window;
    stream = appendRuntimeStream(stream.text, "n".repeat(WIDTH * 2), stream.retention);
    first.rerender({ stream, readerFollow });
    expect(first.result.current.window).toBe(current);
    act(() => readerFollow.resume());
    expect(first.result.current.window?.text).toBe("n".repeat(WIDTH));
    first.unmount();
  });

  it("starts a remounted body at its current source and detaches that page while the pane remains paused", () => {
    const readerFollow = createChatReaderFollowSignal();
    let stream = replaceRuntimeStream(cappedSource());
    const first = renderHook(useStreamWindow, { initialProps: { stream, readerFollow } });
    act(() => readerFollow.pause());
    const frozen = first.result.current.window;
    first.unmount();
    stream = appendRuntimeStream(stream.text, "next", stream.retention);
    const second = renderHook(useStreamWindow, { initialProps: { stream, readerFollow } });
    expect(second.result.current.window?.text.endsWith("next")).toBe(true);
    expect(second.result.current.window).not.toBe(frozen);
    const current = second.result.current.window;
    stream = appendRuntimeStream(stream.text, "n".repeat(WIDTH * 2), stream.retention);
    second.rerender({ stream, readerFollow });
    expect(second.result.current.window).toBe(current);
    act(() => readerFollow.resume());
    expect(second.result.current.window?.text).toBe("n".repeat(WIDTH));
    second.unmount();
  });

  it("unsubscribes on unmount and does not detach completed bodies", () => {
    const readerFollow = createChatReaderFollowSignal();
    const unsubscribe = vi.fn<() => void>();
    const subscribe = readerFollow.subscribe;
    vi.spyOn(readerFollow, "subscribe").mockImplementation((listener) => {
      const stop = subscribe(listener);
      return () => {
        stop();
        unsubscribe();
      };
    });
    const detach = vi.spyOn(windows, "earlierAssistantTextPage");
    const { unmount } = renderHook(useStreamWindow, {
      initialProps: {
        stream: { text: "completed ".repeat(2_000) },
        readerFollow,
        isStreaming: false,
      },
    });
    act(() => readerFollow.pause());
    expect(detach).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    act(() => {
      readerFollow.resume();
      readerFollow.pause();
    });
    expect(detach).not.toHaveBeenCalled();
  });
});
