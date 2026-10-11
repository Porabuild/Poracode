import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { installProcessStdioErrorHandlers } from "./processStdio";

function createStdio() {
  return {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  };
}

describe("installProcessStdioErrorHandlers", () => {
  it.each(["stdout", "stderr"] as const)("contains %s EPIPE errors", (name) => {
    const stdio = createStdio();
    installProcessStdioErrorHandlers(stdio);
    const error = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });

    expect(() => stdio[name].emit("error", error)).not.toThrow();
  });

  it("does not hide unrelated stdio failures", () => {
    const stdio = createStdio();
    installProcessStdioErrorHandlers(stdio);
    const error = Object.assign(new Error("bad file descriptor"), { code: "EBADF" });

    expect(() => stdio.stderr.emit("error", error)).toThrow(error);
  });
});
