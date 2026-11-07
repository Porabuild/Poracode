import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  attributeAcpCommandTerminal,
  closeOpenTurnItems,
  createAcpMapperState,
  mapAcpSessionUpdate,
  readAcpCommandStatus,
  withAcpCommandStatus,
} from "../canonicalMapping";

function note(update: Record<string, unknown>): SessionNotification {
  return { sessionId: "session", update } as SessionNotification;
}

function payloadFor(
  events: ReturnType<typeof mapAcpSessionUpdate>,
  type: "item.started" | "item.updated" | "item.completed",
  itemId: string,
): Record<string, unknown> | undefined {
  const event = events.find((entry) => entry.type === type && entry.itemId === itemId);
  return event && "payload" in event ? (event.payload as Record<string, unknown>) : undefined;
}

function openCommand(
  state: ReturnType<typeof createAcpMapperState>,
  toolCallId: string,
  rawInput: unknown = { command: "git --version" },
  title = "Running command",
) {
  return mapAcpSessionUpdate(
    note({
      sessionUpdate: "tool_call",
      toolCallId,
      title,
      kind: "execute",
      rawInput,
      status: "in_progress",
    }),
    state,
  );
}

function textContent(text: string) {
  return [{ type: "content", content: { type: "text", text } }];
}

describe("ACP command terminal mapping", () => {
  it("refreshes streamed command and cwd input after the call opens", () => {
    const state = createAcpMapperState("thread");
    const started = openCommand(state, "call", "");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    expect(payloadFor(started, "item.started", itemId)?.command).toBe("Running command");

    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "in_progress",
        rawInput: { command: "git --version", cwd: "C:\\repo" },
      }),
      state,
    );

    expect(payloadFor(updated, "item.updated", itemId)).toMatchObject({
      command: "git --version",
      cwd: "C:\\repo",
    });
    expect(state.toolCallItems.get("call")?.payload.command).toBe("git --version");
  });

  it.each([
    ["with trailing newline", "git version 2\n"],
    ["without trailing newline", "git version 2"],
  ])("joins attributed output and declared status %s", (_label, output) => {
    const state = createAcpMapperState("thread");
    state.resolveTerminalOutput = () => output;
    const started = openCommand(state, "call");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    expect(
      attributeAcpCommandTerminal(state, "terminal", (command) => command === "git --version"),
    ).toBe(true);

    const completed = withAcpCommandStatus(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "completed",
        content: textContent("Exited with code 0"),
      }),
      { exitCode: 0 },
    );
    const events = mapAcpSessionUpdate(completed, state);

    expect(payloadFor(events, "item.completed", itemId)).toMatchObject({
      result: "git version 2\nExited with code 0",
      exitCode: 0,
    });
  });

  it("keeps undeclared text instead of replacing it with attributed output", () => {
    const state = createAcpMapperState("thread");
    state.resolveTerminalOutput = () => "terminal output";
    const started = openCommand(state, "call");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    attributeAcpCommandTerminal(state, "terminal", () => true);

    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "completed",
        content: textContent("agent-reported output"),
        _meta: { "vendor.example/tool": "exec" },
      }),
      state,
    );

    expect(payloadFor(events, "item.completed", itemId)).toMatchObject({
      result: "agent-reported output",
    });
  });

  it("uses the attributed terminal output as an update snapshot without content", () => {
    const state = createAcpMapperState("thread");
    state.resolveTerminalOutput = () => "live terminal output";
    const started = openCommand(state, "call");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    attributeAcpCommandTerminal(state, "terminal", () => true);

    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call",
        status: "in_progress",
      }),
      state,
    );

    expect(payloadFor(events, "item.updated", itemId)?.result).toBe("live terminal output");
  });

  it("attributes only the oldest matching open command without a terminal reference", () => {
    const state = createAcpMapperState("thread");
    const addItem = (
      id: string,
      itemType: "command_execution" | "web_search",
      command: string,
      status = "running",
      extra: { terminalId?: string; attributedTerminalId?: string } = {},
    ) => {
      state.toolCallItems.set(id, {
        itemId: id,
        itemType,
        payload: { command, status },
        isSubAgent: false,
        detached: false,
        ...extra,
      });
    };
    addItem("completed", "command_execution", "git --version", "success");
    addItem("non-command", "web_search", "git --version");
    addItem("referenced", "command_execution", "git --version", "running", {
      terminalId: "content-terminal",
    });
    addItem("attributed", "command_execution", "git --version", "running", {
      attributedTerminalId: "earlier-terminal",
    });
    addItem("other-command", "command_execution", "pwd");
    addItem("oldest-match", "command_execution", "git --version");
    addItem("next-match", "command_execution", "git --version");

    expect(
      attributeAcpCommandTerminal(state, "new-terminal", (command) => command === "git --version"),
    ).toBe(true);
    expect(state.toolCallItems.get("oldest-match")?.attributedTerminalId).toBe("new-terminal");
    expect(state.toolCallItems.get("next-match")?.attributedTerminalId).toBeUndefined();
    expect(attributeAcpCommandTerminal(state, "unmatched", () => false)).toBe(false);
  });

  it("uses attributed output when closing an open command at turn end", () => {
    const state = createAcpMapperState("thread");
    state.resolveTerminalOutput = () => "terminal output at close";
    const started = openCommand(state, "call");
    const itemId = started.find((event) => event.type === "item.started")!.itemId;
    attributeAcpCommandTerminal(state, "terminal", () => true);

    const events = closeOpenTurnItems(state);

    expect(payloadFor(events, "item.completed", itemId)?.result).toBe("terminal output at close");
  });

  it("applies declared exit codes only to command items at open and update", () => {
    const statusMeta = { poracodeCommandStatus: { exitCode: 0 } };
    const state = createAcpMapperState("thread");
    const commandEvents = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "command",
        title: "Run command",
        kind: "execute",
        rawInput: { command: "git --version" },
        status: "completed",
        _meta: statusMeta,
      }),
      state,
    );
    const commandStart = commandEvents.find((event) => event.type === "item.started")!;
    expect(payloadFor(commandEvents, "item.started", commandStart.itemId)?.exitCode).toBe(0);

    const otherEvents = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "other",
        title: "Inspect",
        kind: "other",
        status: "completed",
        _meta: statusMeta,
      }),
      state,
    );
    const otherStart = otherEvents.find((event) => event.type === "item.started")!;
    expect(payloadFor(otherEvents, "item.started", otherStart.itemId)).not.toHaveProperty(
      "exitCode",
    );

    openCommand(state, "update-command");
    const updateId = state.toolCallItems.get("update-command")!.itemId;
    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "update-command",
        status: "completed",
        _meta: { poracodeCommandStatus: { exitCode: -2 } },
      }),
      state,
    );
    expect(payloadFor(updated, "item.completed", updateId)?.exitCode).toBe(-2);
  });

  it("ignores invalid command-status declarations", () => {
    for (const value of [{ exitCode: 1.5 }, { exitCode: "2" }, { exitCode: Number.NaN }]) {
      expect(readAcpCommandStatus({ poracodeCommandStatus: value })).toEqual({});
    }
    for (const value of [null, [], "x"]) {
      expect(readAcpCommandStatus({ poracodeCommandStatus: value })).toBeUndefined();
    }
    expect(readAcpCommandStatus({ other: true })).toBeUndefined();
    expect(readAcpCommandStatus(null)).toBeUndefined();
    expect(readAcpCommandStatus({ poracodeCommandStatus: { exitCode: -3 } })).toEqual({
      exitCode: -3,
    });
  });
});
