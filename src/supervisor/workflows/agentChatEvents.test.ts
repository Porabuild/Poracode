// @vitest-environment node

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readWorkflowAgentChatEvents } from "./agentChatEvents";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "wf-agent-chat-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const TRANSCRIPT_LINES = [
  {
    type: "user",
    agentId: "abc",
    timestamp: "2026-07-17T09:54:04.355Z",
    message: { role: "user", content: "Review the diff for bugs." },
  },
  {
    type: "attachment",
    agentId: "abc",
    attachment: { type: "skill_listing", content: "- something" },
  },
  {
    type: "assistant",
    agentId: "abc",
    timestamp: "2026-07-17T09:54:06.000Z",
    message: {
      id: "msg_1",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [
        { type: "text", text: "Reading the file first." },
        { type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: "a.ts" } },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  },
  {
    type: "user",
    agentId: "abc",
    timestamp: "2026-07-17T09:54:07.000Z",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "file body" }],
    },
  },
  {
    type: "assistant",
    agentId: "abc",
    timestamp: "2026-07-17T09:54:09.000Z",
    message: {
      id: "msg_2",
      role: "assistant",
      model: "claude-sonnet-5",
      content: [{ type: "text", text: "No bugs found." }],
      usage: { input_tokens: 20, output_tokens: 6 },
    },
  },
];

function baseInput(agentId: string) {
  return {
    threadId: `wf-agent-chat:${agentId}`,
    transcriptDir: dir,
    agentId,
    agentFinished: true,
    location: { kind: "windows", path: "C:\\proj" } as const,
  };
}

describe("readWorkflowAgentChatEvents", () => {
  it("converts the transcript into canonical runtime events", async () => {
    await writeFile(
      join(dir, "agent-abc.jsonl"),
      TRANSCRIPT_LINES.map((line) => JSON.stringify(line)).join("\n"),
      "utf8",
    );

    const events = await readWorkflowAgentChatEvents(baseInput("abc"));

    // The prompt becomes a user_message item.
    const userStart = events.find(
      (e) => e.type === "item.started" && e.itemType === "user_message",
    );
    expect(userStart).toMatchObject({
      payload: { content: [{ kind: "text", text: "Review the diff for bugs." }] },
    });

    // Both assistant text blocks survive as separate assistant_message items
    // (the second message must not collide with the first's block index).
    const textDeltas = events.filter(
      (e) => e.type === "content.delta" && e.stream === "assistant_text",
    );
    expect(textDeltas.map((e) => (e.type === "content.delta" ? e.delta : ""))).toEqual([
      "Reading the file first.",
      "No bugs found.",
    ]);

    // The tool call opens and completes via its tool_result.
    const toolStart = events.find(
      (e) =>
        e.type === "item.started" &&
        e.itemType !== "user_message" &&
        e.itemType !== "assistant_message" &&
        e.itemType !== "reasoning",
    );
    expect(toolStart).toBeDefined();
    const toolItemId = toolStart && "itemId" in toolStart ? toolStart.itemId : "";
    expect(events.some((e) => e.type === "item.completed" && e.itemId === toolItemId)).toBe(true);

    // Every id is deterministic and scoped to the agent.
    const itemIds = events.flatMap((event) => ("itemId" in event ? [event.itemId] : []));
    expect(itemIds.length).toBeGreaterThan(0);
    expect(itemIds.filter((id) => !/^wfa-abc-\d+$/.test(id))).toEqual([]);
  });

  it("is deterministic across re-reads of the same file", async () => {
    const first = await readWorkflowAgentChatEvents(baseInput("abc"));
    const second = await readWorkflowAgentChatEvents(baseInput("abc"));
    expect(second).toEqual(first);
  });

  it("returns [] when the transcript does not exist", async () => {
    const events = await readWorkflowAgentChatEvents(baseInput("missing"));
    expect(events).toEqual([]);
  });
});
