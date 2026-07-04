import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteWebSocketClientMessage } from "@/shared/remote";
import {
  emitTerminalExited,
  emitTerminalReset,
  handleTerminalServerMessage,
  resetTerminalFeed,
  setTerminalSocketSender,
  watchTerminal,
} from "./terminalFeed";

function makeListener() {
  return {
    onOutput: vi.fn<(data: string) => void>(),
    onReset: vi.fn<() => void>(),
    onExited: vi.fn<(exitCode: number | null) => void>(),
  };
}

afterEach(() => {
  resetTerminalFeed();
  setTerminalSocketSender(null);
});

describe("terminalFeed", () => {
  it("sends terminal-watch on first subscribe and routes output to the listener", () => {
    const sent: RemoteWebSocketClientMessage[] = [];
    setTerminalSocketSender((m) => (sent.push(m), true));
    const listener = makeListener();

    const stop = watchTerminal("sh1", listener);
    expect(sent).toEqual([{ type: "terminal-watch", id: "sh1" }]);

    const handled = handleTerminalServerMessage({
      type: "terminal-output",
      id: "sh1",
      data: "ls\r\n",
    });
    expect(handled).toBe(true);
    expect(listener.onOutput).toHaveBeenCalledWith("ls\r\n");
    stop();
  });

  it("only sends one terminal-watch for multiple listeners, unwatch after the last leaves", () => {
    const sent: RemoteWebSocketClientMessage[] = [];
    setTerminalSocketSender((m) => (sent.push(m), true));
    const a = makeListener();
    const b = makeListener();

    const stopA = watchTerminal("sh1", a);
    const stopB = watchTerminal("sh1", b);
    expect(sent.filter((m) => m.type === "terminal-watch")).toHaveLength(1);

    handleTerminalServerMessage({ type: "terminal-output", id: "sh1", data: "x" });
    expect(a.onOutput).toHaveBeenCalledWith("x");
    expect(b.onOutput).toHaveBeenCalledWith("x");

    stopA();
    expect(sent.some((m) => m.type === "terminal-unwatch")).toBe(false);
    stopB();
    expect(sent.at(-1)).toEqual({ type: "terminal-unwatch", id: "sh1" });
  });

  it("fans out reset and exit (which ride the event stream) to watchers", () => {
    setTerminalSocketSender(() => true);
    const listener = makeListener();
    watchTerminal("sh1", listener);

    emitTerminalReset("sh1");
    emitTerminalExited("sh1", 0);
    expect(listener.onReset).toHaveBeenCalledTimes(1);
    expect(listener.onExited).toHaveBeenCalledWith(0);
  });

  it("ignores non-terminal messages and unknown ids", () => {
    const listener = makeListener();
    watchTerminal("sh1", listener);
    expect(handleTerminalServerMessage({ type: "pong", receivedAt: 1 })).toBe(false);
    handleTerminalServerMessage({ type: "terminal-output", id: "other", data: "y" });
    expect(listener.onOutput).not.toHaveBeenCalled();
  });

  it("re-subscribes every watched terminal when a fresh socket sender is set", () => {
    setTerminalSocketSender(() => true);
    watchTerminal("sh1", makeListener());
    watchTerminal("sh2", makeListener());

    const resent: RemoteWebSocketClientMessage[] = [];
    setTerminalSocketSender((m) => (resent.push(m), true));
    expect(resent).toEqual([
      { type: "terminal-watch", id: "sh1" },
      { type: "terminal-watch", id: "sh2" },
    ]);
  });
});
