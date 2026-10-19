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

  it("does not treat cursor and title updates after a query as a prompt", () => {
    const gate = createShellPromptGate();
    gate.push("\u001B[6n");
    gate.push("\u001B[?25l\u001B[2J\u001B[H\u001B]0;PowerShell\u0007\u001B[?25h");
    expect(gate.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);
    gate.push("PS C:\\repo> ");
    expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });

  it("waits for prompt text after terminal initialization without a query", () => {
    const gate = createShellPromptGate();
    gate.push("\u001B[?9001h\u001B[?1004h");
    expect(gate.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);
    gate.push("\u001B[?25l\u001B[2J\u001B[m\u001B[H");
    expect(gate.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);
    gate.push("PS C:\\repo> ");
    expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });

  it("recognizes prompt text wrapped in OSC hyperlinks", () => {
    const gate = createShellPromptGate();
    gate.push("\u001B[6n\u001B]8;;file:///repo\u001B\\PS C:\\repo> \u001B]8;;\u001B\\");
    expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });

  it.each(["\u001B[?25h", "\u001B]0;PowerShell\u0007", "\u001B]0;PowerShell\u001B\\"])(
    "keeps waiting when a terminal update is split at any byte: %j",
    (update) => {
      for (let split = 0; split <= update.length; split++) {
        const gate = createShellPromptGate();
        gate.push("\u001B[6n");
        gate.push(update.slice(0, split));
        expect(gate.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);
        gate.push(update.slice(split));
        expect(gate.delayMs()).toBe(SHELL_QUERY_FALLBACK_MS);
        gate.push("PS C:\\repo> ");
        expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
      }
    },
  );

  it("drops a remembered query after reset", () => {
    const gate = createShellPromptGate();
    gate.push("\u001B[6n");
    gate.reset();
    expect(gate.push("> ")).toBe("pending");
    expect(gate.delayMs()).toBe(SHELL_QUIET_READY_MS);
  });
});
