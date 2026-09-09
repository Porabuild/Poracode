import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalFeedListener } from "@/shared/remote/terminalFeed";
import type { RemoteTerminalWatchResultReady } from "@/shared/remote/protocol";

const feed = vi.hoisted(() => ({ listener: undefined as TerminalFeedListener | undefined }));
const writeTerminal = vi.hoisted(() =>
  vi
    .fn<(payload: { threadId: string; data: string }) => Promise<void>>()
    .mockResolvedValue(undefined),
);
const unsubscribe = vi.hoisted(() => vi.fn<() => void>());
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ writeTerminal }) }));
vi.mock("@/renderer/state/remoteTerminalFeed", () => ({
  watchRoutedTerminal: (_id: string, listener: TerminalFeedListener) => {
    feed.listener = listener;
    return unsubscribe;
  },
}));

import { createRoutedShellSession, disposeRoutedShellSession } from "./routedShellSession";

function snapshot(data = "$ ", processState: "running" | "exited" = "running") {
  const result: RemoteTerminalWatchResultReady = {
    status: "ready",
    generation: "new-pty",
    fromCursor: 0,
    toCursor: data.length,
    data,
    processState,
    terminalSize: null,
  };
  expect(feed.listener?.onSnapshot).toBeTypeOf("function");
  feed.listener?.onSnapshot?.(result);
}

beforeEach(() => {
  vi.useFakeTimers();
  writeTerminal.mockClear();
  unsubscribe.mockClear();
  feed.listener = undefined;
});
afterEach(() => {
  disposeRoutedShellSession("shell:history");
  vi.useRealTimers();
});

describe("remote shell snapshot readiness", () => {
  function attach(onOutput = vi.fn<(output: string) => void>()) {
    createRoutedShellSession({
      shellId: "shell:history",
      remoteServerId: "host",
      data: "echo ready\r",
      onOutput,
    });
    return onOutput;
  }

  it("starts once when the new spawn's prompt is entirely in its snapshot", () => {
    const onOutput = attach();
    feed.listener?.onReset();
    snapshot();
    vi.advanceTimersByTime(250);
    expect(writeTerminal).toHaveBeenCalledExactlyOnceWith({
      threadId: "shell:history",
      data: "echo ready\r",
    });
    expect(onOutput).not.toHaveBeenCalled();
  });

  it("does not use history observed before this attachment sees a spawn reset", () => {
    attach();
    snapshot("old prompt\x1b]133;B\x07");
    vi.advanceTimersByTime(20_000);
    expect(writeTerminal).not.toHaveBeenCalled();
    feed.listener?.onReset();
    snapshot("new prompt\x1b]133;B\x07");
    expect(writeTerminal).toHaveBeenCalledOnce();
  });

  it("neither reruns the command nor forwards history on reconnect after writing", () => {
    const onOutput = attach();
    feed.listener?.onReset();
    snapshot();
    vi.advanceTimersByTime(250);
    snapshot("old command output\x1b]133;B\x07");
    vi.advanceTimersByTime(20_000);
    expect(writeTerminal).toHaveBeenCalledOnce();
    expect(onOutput).not.toHaveBeenCalled();
    feed.listener?.onOutput("new output");
    expect(onOutput).toHaveBeenCalledExactlyOnceWith("new output");
  });

  it("does not start from an exited or empty snapshot", () => {
    attach();
    feed.listener?.onReset();
    snapshot("$ ", "exited");
    snapshot("");
    vi.advanceTimersByTime(20_000);
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it("cancels pending readiness on reset and disposal", () => {
    attach();
    feed.listener?.onReset();
    snapshot();
    feed.listener?.onReset();
    vi.advanceTimersByTime(250);
    expect(writeTerminal).not.toHaveBeenCalled();
    snapshot();
    disposeRoutedShellSession("shell:history");
    vi.advanceTimersByTime(250);
    expect(writeTerminal).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
