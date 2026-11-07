import { Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import { MAX_TERMINAL_WRITE_BUFFER_UNITS, TerminalWriteQueue } from "./terminalWriteQueue";

function setup() {
  const callbacks: Array<() => void> = [];
  const write = vi.fn<(data: string, done?: () => void) => void>((_data, done) => {
    if (done) callbacks.push(done);
  });
  const queue = new TerminalWriteQueue({ write });
  const complete = async () => {
    callbacks.shift()?.();
    await Promise.resolve();
  };
  return { queue, write, callbacks, complete };
}

describe("TerminalWriteQueue", () => {
  it("writes immediately, then coalesces bursts only after parsing completes", async () => {
    const { queue, write, complete } = setup();
    expect(queue.write("first")).toBe(true);
    for (let index = 0; index < 100; index += 1) queue.write("next");
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.idle).toBe(false);
    await complete();
    expect(write.mock.calls.map(([data]) => data)).toEqual(["first", "next".repeat(100)]);
    await complete();
    expect(queue.idle).toBe(true);
  });

  it("bounds both queued output and output still parsing", async () => {
    const { queue, write, callbacks, complete } = setup();
    expect(queue.write("x".repeat(MAX_TERMINAL_WRITE_BUFFER_UNITS))).toBe(true);
    expect(queue.write("overflow")).toBe(false);
    expect(write.mock.calls[0]?.[0].length).toBe(65_536);
    while (callbacks.length > 0) await complete();
    expect(write.mock.calls.map(([data]) => data).join("")).toBe(
      "x".repeat(MAX_TERMINAL_WRITE_BUFFER_UNITS),
    );
    expect(write.mock.calls.every(([data]) => data.length <= 65_536)).toBe(true);
    expect(queue.write("recovered")).toBe(true);
  });

  it("flushes accepted chunks ahead of a terminal barrier without duplicating them", async () => {
    const { queue, write, callbacks, complete } = setup();
    queue.write("first");
    queue.write("second");
    queue.write("third");
    queue.flush();
    queue.write("last");
    expect(write.mock.calls.map(([data]) => data)).toEqual(["first", "secondthird"]);
    await complete();
    expect(write).toHaveBeenCalledTimes(2);
    while (callbacks.length > 0) await complete();
    expect(write.mock.calls.map(([data]) => data)).toEqual(["first", "secondthird", "last"]);
    expect(queue.idle).toBe(true);
  });

  it("discards queued stale output while keeping in-flight accounting", async () => {
    const { queue, write, complete } = setup();
    queue.write("old frame");
    queue.write("stale suffix");
    queue.clear();
    expect(queue.idle).toBe(false);
    queue.write("new frame");
    await complete();
    expect(write.mock.calls.map(([data]) => data)).toEqual(["old frame", "new frame"]);
    await complete();
    expect(queue.idle).toBe(true);
  });

  it("keeps flushed writes within the batch limit", async () => {
    const { queue, write, callbacks, complete } = setup();
    queue.write("x".repeat(MAX_TERMINAL_WRITE_BUFFER_UNITS));
    queue.flush();
    expect(write.mock.calls.every(([data]) => data.length <= 65_536)).toBe(true);
    expect(write.mock.calls.map(([data]) => data).join("")).toBe(
      "x".repeat(MAX_TERMINAL_WRITE_BUFFER_UNITS),
    );
    while (callbacks.length > 0) await complete();
    expect(queue.idle).toBe(true);
  });

  it("stops pending work on disposal, including an already scheduled drain", async () => {
    const { queue, write, callbacks } = setup();
    queue.write("first");
    queue.write("queued");
    callbacks.shift()?.();
    queue.dispose();
    await Promise.resolve();
    queue.flush();
    expect(queue.write("late")).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(queue.idle).toBe(true);
  });

  it("preserves split Unicode and escape sequences with the installed parser", async () => {
    const terminal = new Terminal({ allowProposedApi: true, cols: 80, rows: 24 });
    const queue = new TerminalWriteQueue(terminal);
    try {
      const text = `${"\r".repeat(65_535)}😀\x1b[31mred\x1b[0m`;
      expect(queue.write(text)).toBe(true);
      queue.flush();
      await new Promise<void>((resolve) => terminal.write("", resolve));
      expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("😀red");
      expect(queue.idle).toBe(true);
    } finally {
      queue.dispose();
      terminal.dispose();
    }
  });
});
