import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CodexStdioTransport } from "./stdioTransport";

function makeChild(stdin: Writable): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  Object.assign(child, {
    stdin,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  return child;
}

function makeListener() {
  return {
    onMessage: vi.fn<(message: unknown) => void>(),
    onClose: vi.fn<() => void>(),
    onError: vi.fn<(error: Error) => void>(),
  };
}

describe("CodexStdioTransport stdin errors", () => {
  it("swallows EPIPE from a write still in flight when the app-server exits", async () => {
    const stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      },
    });
    const transport = new CodexStdioTransport(makeChild(stdin));
    const listener = makeListener();
    transport.setListener(listener);

    expect(() => transport.write({ id: "probe-1", method: "ping", params: {} })).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(listener.onError).not.toHaveBeenCalled();
    transport.dispose();
  });

  it("reports non-EPIPE stdin errors to the listener", async () => {
    const failure = new Error("stdin broken");
    const stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback(failure);
      },
    });
    const transport = new CodexStdioTransport(makeChild(stdin));
    const listener = makeListener();
    transport.setListener(listener);

    transport.write({ id: "probe-1", method: "ping", params: {} });
    await new Promise((resolve) => setImmediate(resolve));

    expect(listener.onError).toHaveBeenCalledWith(failure);
    transport.dispose();
  });
});
