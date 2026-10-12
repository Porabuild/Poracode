import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { PORACODE_ACP_TEXT_STREAM_META_KEY } from "../acp/canonicalMapping/textStreamSnapshots";
import {
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
} from "../acp/canonicalMapping/subagents";
import { PORACODE_ACP_USAGE_BREAKDOWN_META_KEY } from "../acp/canonicalMapping/usageMeta";
import { createDevinAcpTransform } from "./acpTransform";
import cloudStream from "./fixtures/cloud-text-snapshots.json";
import foreground from "./fixtures/subagent.json";

const note = (update: Record<string, unknown>, sessionId = "native"): SessionNotification =>
  ({ sessionId, update }) as SessionNotification;

const textChunk = (meta: Record<string, unknown>, text = "chunk"): SessionNotification =>
  note({
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text },
    _meta: { "cognition.ai/streamingMessageId": "native-1", ...meta },
  });

const transformedMeta = (notification: SessionNotification): Record<string, unknown> =>
  notification.update._meta as Record<string, unknown>;

describe("cloud text stream annotation", () => {
  it("annotates streaming deltas as append and preserves native metadata", () => {
    const transform = createDevinAcpTransform();
    const result = transform(
      textChunk({
        "cognition.ai/eventType": "devin_message",
        "cognition.ai/eventId": "event-3",
        "cognition.ai/streaming": true,
      }),
    );
    const meta = transformedMeta(result);
    expect(meta[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({ id: "native-1", mode: "append" });
    expect(meta["cognition.ai/eventType"]).toBe("devin_message");
    expect(meta["cognition.ai/eventId"]).toBe("event-3");
    expect(meta["cognition.ai/streaming"]).toBe(true);
  });

  it("annotates the full final snapshot as replace", () => {
    const transform = createDevinAcpTransform();
    const meta = transformedMeta(
      transform(textChunk({ "cognition.ai/streaming": false, "cognition.ai/overwrite": true })),
    );
    expect(meta[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({ id: "native-1", mode: "replace" });
  });

  it("annotates an explicit overwrite without a streaming flag as replace", () => {
    const transform = createDevinAcpTransform();
    const meta = transformedMeta(transform(textChunk({ "cognition.ai/overwrite": true })));
    expect(meta[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({ id: "native-1", mode: "replace" });
  });

  it("annotates a boolean streaming:false snapshot without overwrite as append", () => {
    const transform = createDevinAcpTransform();
    const meta = transformedMeta(transform(textChunk({ "cognition.ai/streaming": false })));
    expect(meta[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({ id: "native-1", mode: "append" });
  });

  it("annotates thought chunks with the same rules", () => {
    const transform = createDevinAcpTransform();
    const thought = (meta: Record<string, unknown>): SessionNotification =>
      note({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking" },
        _meta: { "cognition.ai/streamingMessageId": "thought-1", ...meta },
      });
    expect(transformedMeta(transform(thought({ "cognition.ai/streaming": true })))).toEqual(
      expect.objectContaining({
        [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "thought-1", mode: "append" },
      }),
    );
    expect(
      transformedMeta(
        transform(thought({ "cognition.ai/streaming": false, "cognition.ai/overwrite": true })),
      ),
    ).toEqual(
      expect.objectContaining({
        [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "thought-1", mode: "replace" },
      }),
    );
  });

  it("leaves non-text chunks unannotated", () => {
    const transform = createDevinAcpTransform();
    const image = note({
      sessionUpdate: "agent_message_chunk",
      content: { type: "image", data: "png", mimeType: "image/png" },
      _meta: {
        "cognition.ai/streamingMessageId": "native-1",
        "cognition.ai/streaming": true,
      },
    });
    expect(transformedMeta(transform(image))).not.toHaveProperty(PORACODE_ACP_TEXT_STREAM_META_KEY);
  });

  it.each([
    ["missing id", { "cognition.ai/streamingMessageId": undefined }],
    ["empty id", { "cognition.ai/streamingMessageId": "" }],
    ["oversized id", { "cognition.ai/streamingMessageId": "n".repeat(201) }],
    ["numeric id", { "cognition.ai/streamingMessageId": 42 }],
  ])("keeps legacy behavior for a chunk with %s", (_label, metaPatch) => {
    const transform = createDevinAcpTransform();
    const result = transform(textChunk({ "cognition.ai/streaming": true, ...metaPatch }));
    expect(transformedMeta(result)).not.toHaveProperty(PORACODE_ACP_TEXT_STREAM_META_KEY);
  });

  it("keeps a native id of exactly the length limit annotated", () => {
    const transform = createDevinAcpTransform();
    const result = transform(
      textChunk({
        "cognition.ai/streamingMessageId": "n".repeat(200),
        "cognition.ai/streaming": true,
      }),
    );
    expect(transformedMeta(result)[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({
      id: "n".repeat(200),
      mode: "append",
    });
  });

  it.each([
    ["string streaming", { "cognition.ai/streaming": "true" }],
    ["numeric streaming", { "cognition.ai/streaming": 1 }],
    ["string overwrite", { "cognition.ai/overwrite": "true" }],
    ["numeric overwrite", { "cognition.ai/overwrite": 1 }],
  ])("rejects a %s impostor standing alone", (_label, metaPatch) => {
    const transform = createDevinAcpTransform();
    const result = transform(textChunk(metaPatch));
    expect(transformedMeta(result)).not.toHaveProperty(PORACODE_ACP_TEXT_STREAM_META_KEY);
  });

  it("falls back to append when only the overwrite flag is an impostor", () => {
    const transform = createDevinAcpTransform();
    const withStreaming = transformedMeta(
      transform(textChunk({ "cognition.ai/streaming": true, "cognition.ai/overwrite": 1 })),
    );
    expect(withStreaming[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({
      id: "native-1",
      mode: "append",
    });
    const withStringOverwrite = transformedMeta(
      transform(textChunk({ "cognition.ai/streaming": false, "cognition.ai/overwrite": "true" })),
    );
    expect(withStringOverwrite[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({
      id: "native-1",
      mode: "append",
    });
  });

  it("suppresses the legacy new-assistant boundary for annotated chunks", () => {
    const transform = createDevinAcpTransform();
    const first = transformedMeta(
      transform(
        note({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "one" },
          _meta: { "cognition.ai/streamingMessageId": "a", "cognition.ai/streaming": true },
        }),
      ),
    );
    expect(first).not.toHaveProperty(PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY);
    const changedId = transformedMeta(
      transform(
        note({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "two" },
          _meta: { "cognition.ai/streamingMessageId": "b", "cognition.ai/streaming": true },
        }),
      ),
    );
    expect(changedId).not.toHaveProperty(PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY);
    // An untagged chunk (malformed metadata) still gets the exact legacy
    // boundary, compared against the full recorded identity history.
    const untagged = transformedMeta(
      transform(
        note({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "three" },
          _meta: { "cognition.ai/streamingMessageId": "c" },
        }),
      ),
    );
    expect(untagged[PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]).toBe("owner");
    expect(untagged).not.toHaveProperty(PORACODE_ACP_TEXT_STREAM_META_KEY);
  });

  it("keeps subagent ownership attribution on an annotated child chunk", () => {
    const transform = createDevinAcpTransform();
    const state = createAcpMapperState("ownership-thread");
    for (const entry of foreground.slice(0, 3))
      mapAcpSessionUpdate(transform(entry as SessionNotification), state);
    const child = transform(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "child text" },
        _meta: {
          "cognition.ai/streamingMessageId": "child-stream",
          "cognition.ai/streaming": true,
          "cognition.ai/subagent_context": { parentAgentId: "a0c86937" },
        },
      }),
    );
    const meta = transformedMeta(child);
    expect(meta[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({ id: "child-stream", mode: "append" });
    expect(meta[PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]).toBeTypeOf("string");
  });

  it("annotates a chunk whose subagent parent is unknown without attributing it", () => {
    const transform = createDevinAcpTransform();
    const orphan = transform(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "orphan" },
        _meta: {
          "cognition.ai/streamingMessageId": "orphan-stream",
          "cognition.ai/streaming": true,
          "cognition.ai/subagent_context": { parentAgentId: "unknown-agent" },
        },
      }),
    );
    const meta = transformedMeta(orphan);
    expect(meta[PORACODE_ACP_TEXT_STREAM_META_KEY]).toEqual({
      id: "orphan-stream",
      mode: "append",
    });
    expect(meta).not.toHaveProperty(PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY);
  });
});

describe("synthetic bookkeeping tool calls", () => {
  const bookkeeping = (
    metaPatch: Record<string, unknown> = {},
    updatePatch: Record<string, unknown> = {},
  ): SessionNotification =>
    note({
      sessionUpdate: "tool_call",
      kind: "other",
      status: "completed",
      title: "ACU usage reset",
      toolCallId: "event-1",
      ...updatePatch,
      _meta: {
        "cognition.ai/eventType": "acu_consumption_at_last_user_interaction",
        "cognition.ai/eventId": "event-1",
        "cognition.ai/acuAmount": 0,
        "cognition.ai/priority": 100,
        "cognition.ai/streaming": false,
        "cognition.ai/streamingMessageId": "event-1",
        "cognition.ai/overwrite": true,
        ...metaPatch,
      },
    });

  it("converts the exact acu shape to a no-op session_info_update preserving _meta", () => {
    const transform = createDevinAcpTransform();
    const result = transform(bookkeeping({}));
    expect(result.update.sessionUpdate).toBe("session_info_update");
    const update = result.update as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(["_meta", "sessionUpdate"]);
    expect(update._meta).toEqual({
      "cognition.ai/eventType": "acu_consumption_at_last_user_interaction",
      "cognition.ai/eventId": "event-1",
      "cognition.ai/acuAmount": 0,
      "cognition.ai/priority": 100,
      "cognition.ai/streaming": false,
      "cognition.ai/streamingMessageId": "event-1",
      "cognition.ai/overwrite": true,
    });
  });

  it("converts the exact context growth shape", () => {
    const transform = createDevinAcpTransform();
    const result = transform(
      note({
        sessionUpdate: "tool_call",
        kind: "other",
        status: "completed",
        title: "context growth updated",
        toolCallId: "event-5",
        _meta: {
          "cognition.ai/eventType": "context_growth_update",
          "cognition.ai/eventId": "event-5",
          "cognition.ai/contextGrowth": { iteration_count: 1 },
        },
      }),
    );
    expect(result.update.sessionUpdate).toBe("session_info_update");
    expect((result.update as Record<string, unknown>)._meta).toEqual({
      "cognition.ai/eventType": "context_growth_update",
      "cognition.ai/eventId": "event-5",
      "cognition.ai/contextGrowth": { iteration_count: 1 },
    });
  });

  it("keeps the same titled row without the native event type", () => {
    const transform = createDevinAcpTransform();
    const result = transform(bookkeeping({ "cognition.ai/eventType": undefined }));
    const update = result.update as Record<string, unknown>;
    expect(update.sessionUpdate).toBe("tool_call");
    expect(update.title).toBe("ACU usage reset");
    expect(update.toolCallId).toBe("event-1");
  });

  it.each([
    ["an unknown event type", { "cognition.ai/eventType": "devin_message" }, {}],
    ["a pending status", {}, { status: "in_progress" }],
    ["an input kind", {}, { kind: "input" }],
  ])("keeps a row with %s as a tool row", (_label, metaPatch, updatePatch) => {
    const transform = createDevinAcpTransform();
    const result = transform(bookkeeping(metaPatch, updatePatch));
    const update = result.update as Record<string, unknown>;
    expect(update.sessionUpdate).toBe("tool_call");
    expect(update.toolCallId).toBe("event-1");
  });

  it("keeps a tool_call_update variant untouched even with the exact metadata", () => {
    const transform = createDevinAcpTransform();
    const result = transform(
      note({
        sessionUpdate: "tool_call_update",
        kind: "other",
        status: "completed",
        toolCallId: "event-1",
        _meta: { "cognition.ai/eventType": "acu_consumption_at_last_user_interaction" },
      }),
    );
    expect(result.update.sessionUpdate).toBe("tool_call_update");
  });

  it("does not fabricate usage conversions for converted bookkeeping rows", () => {
    const transform = createDevinAcpTransform();
    const result = transform(bookkeeping({}));
    expect(result.update.sessionUpdate).not.toBe("usage_update");
    expect((result.update as Record<string, unknown>)._meta).not.toHaveProperty(
      PORACODE_ACP_USAGE_BREAKDOWN_META_KEY,
    );
  });

  it("leaves the separate usage_update surface annotated as before", () => {
    const transform = createDevinAcpTransform();
    const result = transform(
      note({
        sessionUpdate: "usage_update",
        used: 30,
        size: 100,
        _meta: {
          "cognition.ai/inputTokens": 10,
          "cognition.ai/outputTokens": 20,
        },
      }),
    );
    expect(result.update.sessionUpdate).toBe("usage_update");
    expect(transformedMeta(result)[PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]).toEqual({
      inputTokens: 10,
      outputTokens: 20,
    });
  });
});

const FINAL_THOUGHT_TEXT =
  "The user said not to use tools, but replying at all requires using message_user since that's the only channel to communicate — it's clearly not a \"work\" tool in the sense they meant. I'll just send the response through message_user and wait for them.";

interface RenderedItem {
  itemType?: string;
  text: string;
}

function replayCloudStream(): {
  items: Map<string, RenderedItem>;
  events: ReturnType<typeof mapAcpSessionUpdate>;
  transformed: SessionNotification[];
} {
  const transform = createDevinAcpTransform();
  const state = createAcpMapperState("cloud-snapshots-thread");
  const items = new Map<string, RenderedItem>();
  const events: ReturnType<typeof mapAcpSessionUpdate> = [];
  const transformed: SessionNotification[] = [];
  for (const entry of cloudStream as unknown as SessionNotification[]) {
    const mapped = transform(entry);
    transformed.push(mapped);
    for (const event of mapAcpSessionUpdate(mapped, state)) {
      events.push(event);
      if (event.type === "item.started") {
        items.set(event.itemId, { itemType: event.itemType, text: "" });
      } else if (event.type === "content.delta") {
        const item = items.get(event.itemId);
        if (item) item.text = event.replace === true ? event.delta : item.text + event.delta;
      }
    }
  }
  return { items, events, transformed };
}

describe("cloud-text-snapshots fixture through the production pipeline", () => {
  it("annotates every fixture text chunk with the expected stream mode", () => {
    const { transformed } = replayCloudStream();
    const expected: Array<Record<string, unknown>> = [];
    let appendChunks = 0;
    let replaceChunks = 0;
    cloudStream.forEach((entry, index) => {
      const update = entry.update as Record<string, unknown>;
      if (update.sessionUpdate === "tool_call") return;
      const meta = transformed[index]!.update._meta as Record<string, unknown>;
      const replace = meta["cognition.ai/overwrite"] === true;
      expected.push({
        id: meta["cognition.ai/streamingMessageId"],
        mode: replace ? "replace" : "append",
      });
      if (replace) replaceChunks++;
      else appendChunks++;
    });
    const actual = transformed
      .map((notification) => notification.update as Record<string, unknown>)
      .filter(
        (update) =>
          update.sessionUpdate === "agent_message_chunk" ||
          update.sessionUpdate === "agent_thought_chunk",
      )
      .map(
        (update) => (update._meta as Record<string, unknown>)[PORACODE_ACP_TEXT_STREAM_META_KEY],
      );
    expect(actual).toEqual(expected);
    expect(replaceChunks).toBe(3);
    expect(appendChunks).toBe(35);
    const annotatedNonChunks = transformed.filter((notification) => {
      const update = notification.update as Record<string, unknown>;
      return (
        update.sessionUpdate !== "agent_message_chunk" &&
        update.sessionUpdate !== "agent_thought_chunk" &&
        (update._meta as Record<string, unknown>)[PORACODE_ACP_TEXT_STREAM_META_KEY] !== undefined
      );
    });
    expect(annotatedNonChunks).toEqual([]);
  });

  it("converts the fixture bookkeeping rows away from the tool surface", () => {
    const { transformed } = replayCloudStream();
    const converted = cloudStream
      .map((_, index) => transformed[index]!.update as Record<string, unknown>)
      .filter((update) => update.sessionUpdate === "tool_call");
    expect(converted).toEqual([]);
    const sessionInfo = cloudStream
      .map((_, index) => transformed[index]!.update as Record<string, unknown>)
      .filter((update) => update.sessionUpdate === "session_info_update");
    expect(sessionInfo).toHaveLength(3);
  });

  it("reduces the replayed stream to exactly two assistant markers and one final thought", () => {
    const { items, events } = replayCloudStream();
    const assistants = [...items.values()].filter((item) => item.itemType === "assistant_message");
    expect(assistants.map((item) => item.text)).toEqual([
      "CLOUD_WIRE_FIRST_20261008",
      "CLOUD_WIRE_SECOND_20261008",
    ]);
    const thoughts = [...items.values()].filter((item) => item.itemType === "reasoning");
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0]!.text).toBe(FINAL_THOUGHT_TEXT);
    expect(events.filter((event) => event.type === "error")).toEqual([]);
  });

  it("renders no synthetic bookkeeping tool rows", () => {
    const { items } = replayCloudStream();
    expect([...items.values()].filter((item) => item.itemType === "tool_call")).toEqual([]);
  });

  it("keeps genuine repeated deltas in one message and separate ids as separate messages", () => {
    const transform = createDevinAcpTransform();
    const state = createAcpMapperState("repeated-deltas-thread");
    const chunk = (id: string, text: string): SessionNotification =>
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
        _meta: { "cognition.ai/streamingMessageId": id, "cognition.ai/streaming": true },
      });
    const items = new Map<string, RenderedItem>();
    for (const mapped of [
      chunk("stream-a", "repeat"),
      chunk("stream-a", " one"),
      chunk("stream-b", "second"),
    ]) {
      for (const event of mapAcpSessionUpdate(transform(mapped), state)) {
        if (event.type === "item.started")
          items.set(event.itemId, { itemType: event.itemType, text: "" });
        else if (event.type === "content.delta") {
          const item = items.get(event.itemId);
          if (item) item.text = event.replace === true ? event.delta : item.text + event.delta;
        }
      }
    }
    const assistants = [...items.values()].filter((item) => item.itemType === "assistant_message");
    expect(assistants.map((item) => item.text)).toEqual(["repeat one", "second"]);
  });
});
