import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  attributeAcpCommandTerminal,
  createAcpMapperState,
  mapAcpSessionUpdate,
  readAcpCommandStatus,
} from "../acp/canonicalMapping";
import execTerminalFixture from "./fixtures/exec-terminal.json";
import { annotateDevinCommandStatus } from "./commandStatus";
import { createDevinAcpTransform } from "./acpTransform";

const inferenceToolName = "cognition.ai/inferenceToolName";
const statusText = (text: string) => [{ type: "content", content: { type: "text", text } }];
const execTerminalScenarios = execTerminalFixture as unknown as Record<
  "streaming" | "batched",
  ExecTerminalScenario
>;

function notification(
  text: string,
  options: {
    toolName?: string;
    sessionUpdate?: "tool_call" | "tool_call_update";
    status?: "completed" | "failed" | "in_progress";
    content?: unknown;
  } = {},
): SessionNotification {
  return {
    sessionId: "session",
    update: {
      sessionUpdate: options.sessionUpdate ?? "tool_call_update",
      toolCallId: "call",
      status: options.status ?? "completed",
      content: options.content ?? statusText(text),
      _meta: { [inferenceToolName]: options.toolName ?? "exec", "kept-key": "kept-value" },
    },
  } as unknown as SessionNotification;
}

describe("annotateDevinCommandStatus", () => {
  it.each([
    ["Exited with code 0", { exitCode: 0 }],
    ["  Exited with code -2  ", { exitCode: -2 }],
    ["Command timed out", {}],
    ["Command timed out after 30000ms with no output", {}],
    ["Canceled due to user interrupt", {}],
  ])("annotates %s", (text, expected) => {
    const original = notification(text);
    const annotated = annotateDevinCommandStatus(original);
    expect(readAcpCommandStatus(annotated.update._meta)).toEqual(expected);
    expect(annotated.update._meta).toMatchObject({
      [inferenceToolName]: "exec",
      "kept-key": "kept-value",
    });
  });

  it("annotates a failed exec completion", () => {
    const annotated = annotateDevinCommandStatus(
      notification("Canceled due to user interrupt", { status: "failed" }),
    );
    expect(readAcpCommandStatus(annotated.update._meta)).toEqual({});
  });

  it("leaves real command output untouched", () => {
    const original = notification("git version 2.55.0");
    expect(annotateDevinCommandStatus(original)).toBe(original);
  });

  it("leaves non-exec tools and non-terminal statuses untouched", () => {
    const otherTool = notification("Exited with code 0", { toolName: "read" });
    const running = notification("Exited with code 0", { status: "in_progress" });
    expect(annotateDevinCommandStatus(otherTool)).toBe(otherTool);
    expect(annotateDevinCommandStatus(running)).toBe(running);
  });

  it("leaves multi-block content untouched", () => {
    const original = notification("Exited with code 0", {
      content: [...statusText("Exited with code 0"), ...statusText("additional")],
    });
    expect(annotateDevinCommandStatus(original)).toBe(original);
  });
});

type ExecTerminalScenario = {
  events: Array<{
    notification?: SessionNotification;
    terminalCreated?: { terminalId: string; command: string };
  }>;
  terminalOutputs: Record<string, string>;
};

describe("captured terminal command mapping", () => {
  it("keeps real exec output when metadata has no command-status declaration", () => {
    const state = createAcpMapperState("thread");
    state.resolveTerminalOutput = () => "older terminal output";
    const transform = createDevinAcpTransform();
    const openingNotification: SessionNotification = {
      sessionId: "session",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call",
        title: "Running command",
        kind: "execute",
        rawInput: { command: "recording command" },
        status: "in_progress",
        _meta: { [inferenceToolName]: "exec" },
      },
    };
    const started = mapAcpSessionUpdate(transform(openingNotification), state);
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    expect(
      attributeAcpCommandTerminal(state, "terminal", (command) => command === "recording command"),
    ).toBe(true);

    const completionNotification: SessionNotification = {
      sessionId: "session",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "recording\n" } }],
        _meta: { [inferenceToolName]: "exec" },
      },
    };
    const events = mapAcpSessionUpdate(transform(completionNotification), state);
    const completed = events.find(
      (event) => event.type === "item.completed" && event.itemId === itemId,
    );

    const payload =
      completed && "payload" in completed ? (completed.payload as Record<string, unknown>) : {};
    expect(payload.result).toBe("recording\n");
    expect(payload).not.toHaveProperty("exitCode");
  });

  it.each(["streaming", "batched"] as const)(
    "maps the %s session with its real command output",
    (scenarioName) => {
      const scenario = execTerminalScenarios[scenarioName];
      const state = createAcpMapperState("thread");
      state.resolveTerminalOutput = (terminalId) => scenario.terminalOutputs[terminalId];
      const transform = createDevinAcpTransform();
      const started = new Map<string, Record<string, unknown>>();
      const merged = new Map<string, Record<string, unknown>>();
      const terminals: Array<{ terminalId: string; command: string }> = [];
      const attributions: boolean[] = [];

      for (const event of scenario.events) {
        if (event.notification) {
          const mapped = mapAcpSessionUpdate(transform(event.notification), state);
          for (const runtimeEvent of mapped) {
            if (
              (runtimeEvent.type === "item.started" ||
                runtimeEvent.type === "item.updated" ||
                runtimeEvent.type === "item.completed") &&
              "payload" in runtimeEvent
            ) {
              const payload = runtimeEvent.payload as Record<string, unknown>;
              if (runtimeEvent.type === "item.started") started.set(runtimeEvent.itemId, payload);
              merged.set(runtimeEvent.itemId, {
                ...merged.get(runtimeEvent.itemId),
                ...payload,
              });
            }
          }
        } else if (event.terminalCreated) {
          const terminal = event.terminalCreated;
          attributions.push(
            attributeAcpCommandTerminal(
              state,
              terminal.terminalId,
              (command) => command.trim() === terminal.command.trim(),
            ),
          );
          terminals.push(terminal);
        }
      }

      expect(terminals).toHaveLength(3);
      expect(attributions).toEqual([true, true, true]);
      const openingCommands: unknown[] = [];
      for (const [index, terminal] of terminals.entries()) {
        const exitCode = index === 2 ? 1 : 0;
        const finalCall = [...merged.entries()].find(
          ([, payload]) => payload.command === terminal.command,
        );
        expect(finalCall).toBeDefined();
        const [itemId, payload] = finalCall!;
        expect(payload.command).toBe(terminal.command);
        expect(payload.command).not.toBe("Running command");
        const output = scenario.terminalOutputs[terminal.terminalId]!;
        expect(payload.result).toBe(
          `${output}${output.endsWith("\n") ? "" : "\n"}Exited with code ${exitCode}`,
        );
        expect(payload.exitCode).toBe(exitCode);
        openingCommands.push(started.get(itemId)?.command);
      }
      expect(openingCommands).toEqual(
        scenarioName === "streaming"
          ? ["Running command", "Running command", "Running command"]
          : terminals.map((terminal) => terminal.command),
      );
    },
  );
});
