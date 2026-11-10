import { describe, expect, it } from "vitest";
import { createCodexMapperState, mapCodexNotification } from "../canonicalMapping";

function payloadOf(event: unknown): Record<string, unknown> {
  return (event as { payload?: Record<string, unknown> }).payload ?? {};
}

function mapCompletedCommand(item: Record<string, unknown>) {
  const events = mapCodexNotification(
    "item/completed",
    { threadId: "t", item: { id: "exec-1", type: "commandExecution", ...item } },
    createCodexMapperState("thread-1"),
  );
  const started = events.find((event) => event.type === "item.started");
  const completed = events.find((event) => event.type === "item.completed");
  return { started: payloadOf(started), completed: payloadOf(completed) };
}

describe("codex commandExecution commandActions", () => {
  it("normalizes a read action on started and completed payloads", () => {
    const { started, completed } = mapCompletedCommand({
      command: "pwsh -Command 'Get-Content -LiteralPath notes.txt'",
      status: "completed",
      exitCode: 0,
      commandActions: [
        {
          type: "read",
          command: "Get-Content -LiteralPath notes.txt",
          name: "notes.txt",
          path: "E:\\repo\\notes.txt",
        },
      ],
    });
    const expected = [{ kind: "read", path: "E:\\repo\\notes.txt", name: "notes.txt" }];
    expect(started.actions).toEqual(expected);
    expect(completed.actions).toEqual(expected);
  });

  it("maps listFiles and search action types to shared kinds", () => {
    const { completed } = mapCompletedCommand({
      command: "ls",
      status: "completed",
      commandActions: [
        { type: "listFiles", command: "ls", path: "/repo/src" },
        { type: "search", command: "rg foo", query: "foo", path: "/repo" },
      ],
    });
    expect(completed.actions).toEqual([
      { kind: "list", path: "/repo/src" },
      { kind: "search", path: "/repo", query: "foo" },
    ]);
  });

  it("drops the whole actions array when any entry is unknown", () => {
    const { started, completed } = mapCompletedCommand({
      command: "pwsh -Command \"rg -n -C 2 'x' f\"",
      status: "completed",
      commandActions: [
        { type: "read", command: "cat a", path: "/repo/a" },
        { type: "unknown", command: "git status" },
      ],
    });
    expect(started.actions).toBeUndefined();
    expect(completed.actions).toBeUndefined();
  });

  it("drops actions for an all-unknown command", () => {
    const { completed } = mapCompletedCommand({
      command: "git status",
      status: "completed",
      commandActions: [{ type: "unknown", command: "git status" }],
    });
    expect(completed.actions).toBeUndefined();
  });
});
