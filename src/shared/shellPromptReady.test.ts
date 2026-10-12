import { describe, expect, it } from "vitest";
import {
  SHELL_QUERY_FALLBACK_MS,
  SHELL_QUIET_READY_MS,
  createShellPromptGate,
} from "./shellPromptReady";

describe("createShellPromptGate", () => {
  it("treats an OSC 133 prompt-end as ready, including a marker split across chunks", () => {
    const gate = createShellPromptGate();
    expect(gate.push("\u001B]133;")).toBe("pending");
    expect(gate.push("B\u0007")).toBe("ready");
  });

  it("treats an OSC 633 prompt-end as ready", () => {
    const gate = createShellPromptGate();
    expect(gate.push("\u001B]633;B\u001B\\")).toBe("ready");
  });

  it("holds a device-attribute query much longer than ordinary prompt text", () => {
    const queried = createShellPromptGate();
    expect(queried.push("\u001B[0c")).toBe("pending");
    expect(queried.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);

    const prompt = createShellPromptGate();
    expect(prompt.push("$ ")).toBe("pending");
    expect(prompt.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });

  it("stops holding once a later chunk is a plain prompt", () => {
    const gate = createShellPromptGate();
    expect(gate.push("\u001B[6n")).toBe("pending");
    expect(gate.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);
    expect(gate.push("$ ")).toBe("pending");
    expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });

  it("drops a remembered query after reset", () => {
    const gate = createShellPromptGate();
    gate.push("\u001B[6n");
    gate.reset();
    expect(gate.push("> ")).toBe("pending");
    expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });
});
