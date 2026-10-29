import { PassThrough, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { promptCli, terminalText } from "./cliPrompts";

class TerminalInput extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode = vi.fn<(enabled: boolean) => this>((enabled: boolean) => {
    this.isRaw = enabled;
    return this;
  });
}
function fixture() {
  const input = new TerminalInput();
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, callback) {
      text += String(chunk);
      callback();
    },
  });
  return {
    input,
    output,
    get text() {
      return text;
    },
  };
}

describe("interactive CLI prompts", () => {
  it.each([false, true])(
    "joins caller cancellation without returning late input (hidden: %s)",
    async (secret) => {
      const f = fixture();
      const controller = new AbortController();
      const reason = new Error("Owned request cancelled");
      const sigint = process.listenerCount("SIGINT"),
        sigterm = process.listenerCount("SIGTERM");
      const pending = promptCli("Question: ", { ...f, secret, signal: controller.signal }).catch(
        (error: unknown) => error,
      );
      f.input.write("partial answer");
      controller.abort(reason);
      f.input.write("late answer\r");
      expect(await pending).toBe(reason);
      expect(f.input.isRaw).toBe(false);
      expect(f.input.readableFlowing).toBe(false);
      expect(f.input.listenerCount("error")).toBe(0);
      expect(f.output.listenerCount("error")).toBe(0);
      expect(process.listenerCount("SIGINT")).toBe(sigint);
      expect(process.listenerCount("SIGTERM")).toBe(sigterm);
    },
  );

  it("refuses an already cancelled prompt before terminal or output effects", async () => {
    const f = fixture();
    const controller = new AbortController();
    const reason = new Error("Caller already gone");
    controller.abort(reason);
    await expect(promptCli("Question: ", { ...f, signal: controller.signal })).rejects.toBe(reason);
    expect(f.text).toBe("");
    expect(f.input.setRawMode).not.toHaveBeenCalled();
    expect(f.input.listenerCount("error")).toBe(0);
    expect(f.output.listenerCount("error")).toBe(0);
  });

  it.each([false, true])(
    "retains cancellation custody until pending terminal output joins (hidden: %s)",
    async (secret) => {
      const input = new TerminalInput();
      const controller = new AbortController();
      const reason = new Error("Cancelled during output join");
      const callbacks: Array<(error?: Error | null) => void> = [];
      const output = new Writable({
        write(_chunk, _encoding, callback) {
          callbacks.push(callback);
        },
      });
      let settled = false;
      const pending = promptCli("Question: ", {
        input,
        output,
        secret,
        signal: controller.signal,
      }).then(
        (value) => {
          settled = true;
          return value;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
      input.write("answered\r");
      await vi.waitFor(() => expect(input.isRaw).toBe(false));
      controller.abort(reason);
      expect(settled).toBe(false);
      expect(output.listenerCount("error")).toBeGreaterThan(0);
      while (callbacks.length) callbacks.shift()!();
      expect(await pending).toBe(reason);
      expect(input.listenerCount("error")).toBe(0);
      expect(output.listenerCount("error")).toBe(0);
    },
  );

  it("reads split UTF-8 secret input without echo or history and restores raw mode", async () => {
    const f = fixture();
    const sigint = process.listenerCount("SIGINT"),
      sigterm = process.listenerCount("SIGTERM");
    const answer = promptCli("FIXTURE_KEY (hidden): ", { ...f, secret: true });
    const bytes = Buffer.from("synthetic-🔑");
    f.input.write(bytes.subarray(0, bytes.length - 2));
    f.input.write(bytes.subarray(bytes.length - 2));
    f.input.write("\r");
    expect(await answer).toBe("synthetic-🔑");
    expect(f.text).toBe("FIXTURE_KEY (hidden): \n");
    expect(f.input.isRaw).toBe(false);
    expect(f.input.listenerCount("error")).toBe(0);
    expect(f.output.listenerCount("error")).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(sigint);
    expect(process.listenerCount("SIGTERM")).toBe(sigterm);
  });

  it.each(["cancel", "eof", "input-error", "output-error", "output-close"])(
    "rejects %s with terminal/listener cleanup",
    async (mode) => {
      const f = fixture();
      const failure = new Error(`Fixture ${mode}`);
      const rejected = promptCli("Secret: ", { ...f, secret: true }).catch(
        (error: unknown) => error,
      );
      f.input.write("partial-sensitive-value");
      if (mode === "cancel") f.input.write("\u0003");
      else if (mode === "eof") f.input.end();
      else if (mode === "input-error") f.input.emit("error", failure);
      else if (mode === "output-close") f.output.destroy();
      else f.output.emit("error", failure);
      const result = await rejected;
      expect(result).toBeInstanceOf(Error);
      expect(mode.endsWith("error") ? result : failure).toBe(failure);
      expect(f.text).not.toContain("partial-sensitive-value");
      expect(f.input.isRaw).toBe(false);
      expect(f.input.listenerCount("error")).toBe(0);
      expect(f.output.listenerCount("error")).toBe(0);
    },
  );

  it("retains error custody until pending output callbacks have joined", async () => {
    const input = new TerminalInput();
    const callbacks: Array<(error?: Error | null) => void> = [];
    const output = new Writable({
      write(_chunk, _encoding, callback) {
        callbacks.push(callback);
      },
    });
    let settled = false;
    const failure = new Error("Fixture delayed stderr failure");
    const answer = promptCli("Secret: ", { input, output, secret: true }).then(
      () => {
        settled = true;
        return undefined;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    input.write("synthetic\r");
    await vi.waitFor(() => expect(input.isRaw).toBe(false));
    expect(settled).toBe(false);
    expect(output.listenerCount("error")).toBeGreaterThan(0);
    callbacks.shift()!(failure);
    expect(await answer).toBe(failure);
    expect(settled).toBe(true);
    expect(output.listenerCount("error")).toBe(0);
    expect(input.listenerCount("error")).toBe(0);
  });

  it("preserves an already-raw input and supports repeated questions", async () => {
    const f = fixture();
    f.input.isRaw = true;
    const first = promptCli("First: ", f);
    f.input.write("1\r");
    expect(await first).toBe("1");
    expect(f.input.isRaw).toBe(true);
    const second = promptCli("Second: ", f);
    f.input.write("2\r");
    expect(await second).toBe("2");
    expect(f.input.isRaw).toBe(true);
  });

  it("refuses nonterminal secret input without writing a prompt", async () => {
    const f = fixture();
    f.input.isTTY = false;
    await expect(promptCli("Secret: ", { ...f, secret: true })).rejects.toThrow(
      "interactive terminal",
    );
    expect(f.text).toBe("");
  });

  it("gives command-neutral private-input guidance when terminal echo cannot be controlled", async () => {
    const input = Object.assign(new PassThrough(), { isTTY: true });
    let text = "";
    const output = new Writable({
      write(chunk, _encoding, callback) {
        text += String(chunk);
        callback();
      },
    });
    await expect(promptCli("MCP value: ", { input, output, secret: true })).rejects.toThrow(
      "supported private file/stdin input",
    );
    expect(text).toBe("");
  });

  it("escapes terminal control text from provider and client labels", () => {
    expect(terminalText("Name\u001b[2J\nnext\u009b31m")).toBe(
      "Name\\u001b[2J\\u000anext\\u009b31m",
    );
  });
});
