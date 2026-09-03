import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { MuseMspStdioTransport } from "./stdioTransport";

class FakeStdio extends EventEmitter {
  setEncoding = vi.fn<(encoding: string) => void>();
}

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: FakeStdio;
    stderr: FakeStdio;
    stdin: {
      writable: boolean;
      written: string[];
      ended: boolean;
      write: (text: string) => void;
      end: () => void;
    };
  };
  child.stdout = new FakeStdio();
  child.stderr = new FakeStdio();
  const stdin = {
    writable: true,
    written: [] as string[],
    ended: false,
    write: (text: string) => {
      stdin.written.push(text);
    },
    end: () => {
      stdin.ended = true;
    },
  };
  child.stdin = stdin;
  return child;
}

describe("MuseMspStdioTransport", () => {
  it("splits stdout into newline-delimited JSON messages", () => {
    const child = fakeChild();
    const transport = new MuseMspStdioTransport(child as never);
    const messages: unknown[] = [];
    transport.setListener({
      onMessage: (m) => messages.push(m),
      onClose: () => {},
      onError: () => {},
    });

    child.stdout.emit("data", '{"jsonrpc":"2.0","id":1');
    child.stdout.emit("data", ',"result":{}}\n{"jsonrpc":"2.0","method":"tick"}\n');
    expect(messages).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", method: "tick" },
    ]);
  });

  it("strips carriage returns, skips blank lines, and records invalid JSON", () => {
    const child = fakeChild();
    const transport = new MuseMspStdioTransport(child as never);
    const messages: unknown[] = [];
    transport.setListener({
      onMessage: (m) => messages.push(m),
      onClose: () => {},
      onError: () => {},
    });

    child.stdout.emit("data", '  \r\n{"ok":true}\r\nnot json\n');
    expect(messages).toEqual([{ ok: true }]);
    expect(transport.formatOutput()).toContain("Invalid MSP stdout");
  });

  it("records stderr diagnostics and reports close/error", () => {
    const child = fakeChild();
    const transport = new MuseMspStdioTransport(child as never);
    const events: string[] = [];
    transport.setListener({
      onMessage: () => {},
      onClose: () => events.push("close"),
      onError: () => events.push("error"),
    });

    child.stderr.emit("data", "muse: warning\n");
    child.emit("error", new Error("boom"));
    child.emit("exit");
    expect(events).toEqual(["error", "close"]);
    expect(transport.formatOutput()).toContain("muse: warning");
  });

  it("writes newline-terminated JSON and enforces lifecycle", () => {
    const child = fakeChild();
    const transport = new MuseMspStdioTransport(child as never);
    transport.setListener({ onMessage: () => {}, onClose: () => {}, onError: () => {} });

    transport.write({ jsonrpc: "2.0", id: 7, method: "model/list" });
    expect(child.stdin.written).toEqual(['{"jsonrpc":"2.0","id":7,"method":"model/list"}\n']);

    child.stdin.writable = false;
    expect(() => transport.write({ jsonrpc: "2.0", method: "x" })).toThrow(/not writable/);

    transport.dispose();
    expect(child.stdin.ended).toBe(true);
    expect(() => transport.write({ jsonrpc: "2.0", method: "x" })).toThrow(/disposed/);
  });
});
