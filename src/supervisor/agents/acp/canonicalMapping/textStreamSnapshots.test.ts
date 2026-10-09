import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { createAcpMapperState, mapAcpSessionUpdate } from "../canonicalMapping";
import { resetMapperForTurnEnd } from "./state";
import {
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "./subagents";
import { mapAcpTextStreamSnapshot, PORACODE_ACP_TEXT_STREAM_META_KEY } from "./textStreamSnapshots";

/**
 * Neutral tests for the text-stream snapshot seam: a `_meta` annotation opts
 * an agent text chunk into snapshot semantics on the shared mapper. Fixtures
 * carry no vendor payload shape — any provider boundary transform may emit
 * this annotation.
 */

type SnapshotMode = "append" | "replace";

function note(update: SessionNotification["update"], sessionId = "s1"): SessionNotification {
  return { sessionId, update };
}

function streamChunk(
  kind: "message" | "thought",
  text: string,
  id: string,
  mode: SnapshotMode,
  sessionId = "s1",
  extraMeta: Record<string, unknown> = {},
): SessionNotification {
  return note(
    {
      sessionUpdate: kind === "message" ? "agent_message_chunk" : "agent_thought_chunk",
      content: { type: "text", text },
      _meta: {
        [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id, mode },
        ...extraMeta,
      },
    } as SessionNotification["update"],
    sessionId,
  );
}

function messageChunk(
  text: string,
  id: string,
  mode: SnapshotMode,
  sessionId = "s1",
): SessionNotification {
  return streamChunk("message", text, id, mode, sessionId);
}

function thoughtChunk(
  text: string,
  id: string,
  mode: SnapshotMode,
  sessionId = "s1",
): SessionNotification {
  return streamChunk("thought", text, id, mode, sessionId);
}

/** Production child shape: the stream annotation plus its declared owner. */
function ownedChunk(
  kind: "message" | "thought",
  text: string,
  id: string,
  mode: SnapshotMode,
  parentToolCallId: string,
  sessionId = "s1",
): SessionNotification {
  return streamChunk(kind, text, id, mode, sessionId, {
    [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: parentToolCallId,
  });
}

function ownedMessageChunk(
  text: string,
  id: string,
  mode: SnapshotMode,
  parentToolCallId: string,
): SessionNotification {
  return ownedChunk("message", text, id, mode, parentToolCallId);
}

function ownedThoughtChunk(
  text: string,
  id: string,
  mode: SnapshotMode,
  parentToolCallId: string,
): SessionNotification {
  return ownedChunk("thought", text, id, mode, parentToolCallId);
}

const SUBAGENT_RAW_INPUT = {
  description: "Critiquing path fixes",
  agent_type: "rubber-duck",
  prompt: "We need to get a clean green run.",
};

/** Start a neutral subagent tool call whose lifetime owns a child transcript. */
function startSubAgentParent(state: ReturnType<typeof createAcpMapperState>, toolCallId: string) {
  return mapAcpSessionUpdate(
    note({
      sessionUpdate: "tool_call",
      toolCallId,
      title: "Critiquing path fixes",
      status: "in_progress",
      rawInput: { ...SUBAGENT_RAW_INPUT, name: `duck-${toolCallId}` },
    } as SessionNotification["update"]),
    state,
  );
}

/** Complete a subagent tool call, removing its active lifetime. */
function completeSubAgentParent(
  state: ReturnType<typeof createAcpMapperState>,
  toolCallId: string,
): void {
  mapAcpSessionUpdate(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: "completed",
    } as SessionNotification["update"]),
    state,
  );
}

/** First `item.started` id among the events of a single notification. */
function firstStartedItemId(events: RuntimeEvent[]): string {
  const started = events.find((event) => event.type === "item.started");
  expect(started).toBeDefined();
  return (started as { itemId: string }).itemId;
}

/** Replace generated item ids with a placeholder so two runs are comparable. */
function withPlaceholderIds(events: RuntimeEvent[]): unknown[] {
  return events.map((event) => ("itemId" in event ? { ...event, itemId: "<item>" } : event));
}

describe("textStreamSnapshots final replace", () => {
  it("corrects appended text with an explicit replace on the same canonical item", () => {
    const state = createAcpMapperState("snap-corrected");
    const streamed = mapAcpSessionUpdate(messageChunk("The answer is 41.", "ans", "append"), state);
    expect(streamed).toHaveLength(2);
    const itemId = firstStartedItemId(streamed);
    expect(streamed[1]).toMatchObject({
      type: "content.delta",
      itemId,
      stream: "assistant_text",
      delta: "The answer is 41.",
    });
    expect(streamed[1]).not.toHaveProperty("replace");
    expect(state.openAssistantItemId).toBe(itemId);

    const corrected = mapAcpSessionUpdate(
      messageChunk("The answer is 42.", "ans", "replace"),
      state,
    );
    expect(corrected).toEqual([
      {
        type: "content.delta",
        threadId: "snap-corrected",
        itemId,
        stream: "assistant_text",
        delta: "The answer is 42.",
        replace: true,
      },
    ]);
    expect(state.openAssistantItemId).toBe(itemId);
  });

  it("shortens streamed text when the final snapshot is shorter", () => {
    const state = createAcpMapperState("snap-shorter");
    const streamed = mapAcpSessionUpdate(messageChunk("one two three", "sum", "append"), state);
    const itemId = firstStartedItemId(streamed);
    const shortened = mapAcpSessionUpdate(messageChunk("one", "sum", "replace"), state);
    expect(shortened).toEqual([
      {
        type: "content.delta",
        threadId: "snap-shorter",
        itemId,
        stream: "assistant_text",
        delta: "one",
        replace: true,
      },
    ]);
  });

  it("clears the correlated item with an empty replace and stays correlated", () => {
    const state = createAcpMapperState("snap-clear");
    const streamed = mapAcpSessionUpdate(messageChunk("draft", "note", "append"), state);
    const itemId = firstStartedItemId(streamed);
    const cleared = mapAcpSessionUpdate(messageChunk("", "note", "replace"), state);
    expect(cleared).toEqual([
      {
        type: "content.delta",
        threadId: "snap-clear",
        itemId,
        stream: "assistant_text",
        delta: "",
        replace: true,
      },
    ]);
    expect(cleared.some((event) => event.type === "item.completed")).toBe(false);
    const after = mapAcpSessionUpdate(messageChunk("final", "note", "append"), state);
    expect(after).toEqual([
      {
        type: "content.delta",
        threadId: "snap-clear",
        itemId,
        stream: "assistant_text",
        delta: "final",
      },
    ]);
  });
});

describe("textStreamSnapshots final-only and empty appends", () => {
  it("allocates the canonical item once for a final-only replace snapshot", () => {
    const state = createAcpMapperState("snap-final-only");
    const only = mapAcpSessionUpdate(messageChunk("Final answer.", "ans", "replace"), state);
    expect(only).toEqual([
      {
        type: "item.started",
        threadId: "snap-final-only",
        itemId: firstStartedItemId(only),
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: "snap-final-only",
        itemId: firstStartedItemId(only),
        stream: "assistant_text",
        delta: "Final answer.",
        replace: true,
      },
    ]);
    const replay = mapAcpSessionUpdate(messageChunk("Final answer.", "ans", "replace"), state);
    expect(replay).toEqual([
      {
        type: "content.delta",
        threadId: "snap-final-only",
        itemId: firstStartedItemId(only),
        stream: "assistant_text",
        delta: "Final answer.",
        replace: true,
      },
    ]);
    expect(state.openAssistantItemId).toBe(firstStartedItemId(only));
  });

  it("never creates an item for an empty append snapshot", () => {
    const state = createAcpMapperState("snap-empty-append");
    expect(mapAcpSessionUpdate(messageChunk("", "ans", "append"), state)).toEqual([]);
    expect(state.openAssistantItemId).toBeUndefined();
    const only = mapAcpSessionUpdate(messageChunk("Ready.", "ans", "replace"), state);
    expect(only).toHaveLength(2);
    expect(only[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
  });

  it("ignores an empty append on a live snapshot stream", () => {
    const state = createAcpMapperState("snap-live-empty");
    const streamed = mapAcpSessionUpdate(messageChunk("live", "ans", "append"), state);
    const itemId = firstStartedItemId(streamed);
    expect(mapAcpSessionUpdate(messageChunk("", "ans", "append"), state)).toEqual([]);
    const after = mapAcpSessionUpdate(messageChunk("more", "ans", "append"), state);
    expect(after).toEqual([
      {
        type: "content.delta",
        threadId: "snap-live-empty",
        itemId,
        stream: "assistant_text",
        delta: "more",
      },
    ]);
  });
});

describe("textStreamSnapshots late snapshots for completed items", () => {
  it("streams a late replace into the already-closed reasoning item without reopening siblings", () => {
    const state = createAcpMapperState("snap-late");
    const thought = mapAcpSessionUpdate(thoughtChunk("thinking about it", "t1", "append"), state);
    const reasoningItemId = firstStartedItemId(thought);
    expect(thought[0]).toMatchObject({ type: "item.started", itemType: "reasoning" });
    expect(state.openReasoningItemId).toBe(reasoningItemId);

    const answer = mapAcpSessionUpdate(messageChunk("Answer.", "a1", "append"), state);
    const assistantItemId = firstStartedItemId(answer);
    expect(answer).toEqual([
      { type: "item.completed", threadId: "snap-late", itemId: reasoningItemId },
      {
        type: "item.started",
        threadId: "snap-late",
        itemId: assistantItemId,
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: "snap-late",
        itemId: assistantItemId,
        stream: "assistant_text",
        delta: "Answer.",
      },
    ]);

    const late = mapAcpSessionUpdate(thoughtChunk("settled thought", "t1", "replace"), state);
    expect(late).toEqual([
      {
        type: "content.delta",
        threadId: "snap-late",
        itemId: reasoningItemId,
        stream: "reasoning_text",
        delta: "settled thought",
        replace: true,
      },
    ]);
    expect(state.openAssistantItemId).toBe(assistantItemId);
    expect(state.openReasoningItemId).toBeUndefined();

    const lateAgain = mapAcpSessionUpdate(thoughtChunk("settled twice", "t1", "replace"), state);
    expect(lateAgain).toEqual([
      {
        type: "content.delta",
        threadId: "snap-late",
        itemId: reasoningItemId,
        stream: "reasoning_text",
        delta: "settled twice",
        replace: true,
      },
    ]);
  });
});

describe("textStreamSnapshots correlation isolation", () => {
  it("keeps owners, native sessions, and stream kinds separate", () => {
    const state = createAcpMapperState("snap-isolation");
    const root = mapAcpTextStreamSnapshot(
      messageChunk("root", "shared", "append"),
      state,
      undefined,
      false,
    )!;
    const child = mapAcpTextStreamSnapshot(
      messageChunk("child", "shared", "append"),
      state,
      "child-1",
      false,
    )!;
    const otherSession = mapAcpTextStreamSnapshot(
      messageChunk("elsewhere", "shared", "append", "s2"),
      state,
      undefined,
      false,
    )!;
    const reasoning = mapAcpTextStreamSnapshot(
      thoughtChunk("thought", "shared", "append"),
      state,
      undefined,
      false,
    )!;
    const rootItemId = firstStartedItemId(root);
    const childItemId = firstStartedItemId(child);
    const otherSessionItemId = firstStartedItemId(otherSession);
    const reasoningItemId = firstStartedItemId(reasoning);
    expect(new Set([rootItemId, childItemId, otherSessionItemId, reasoningItemId]).size).toBe(4);

    const followUps = [
      {
        notification: messageChunk("root again", "shared", "replace"),
        parentToolCallId: undefined,
        itemId: rootItemId,
        stream: "assistant_text",
        delta: "root again",
      },
      {
        notification: messageChunk("child again", "shared", "replace"),
        parentToolCallId: "child-1",
        itemId: childItemId,
        stream: "assistant_text",
        delta: "child again",
      },
      {
        notification: messageChunk("elsewhere again", "shared", "replace", "s2"),
        parentToolCallId: undefined,
        itemId: otherSessionItemId,
        stream: "assistant_text",
        delta: "elsewhere again",
      },
      {
        notification: thoughtChunk("thought again", "shared", "replace"),
        parentToolCallId: undefined,
        itemId: reasoningItemId,
        stream: "reasoning_text",
        delta: "thought again",
      },
    ] as const;
    for (const { notification, parentToolCallId, itemId, stream, delta } of followUps) {
      expect(mapAcpTextStreamSnapshot(notification, state, parentToolCallId, false)).toEqual([
        {
          type: "content.delta",
          threadId: "snap-isolation",
          itemId,
          stream,
          delta,
          replace: true,
        },
      ]);
    }
  });

  it("does not leak correlation across mapper states", () => {
    const stateA = createAcpMapperState("snap-leak-a");
    const stateB = createAcpMapperState("snap-leak-b");
    const allocatedA = mapAcpTextStreamSnapshot(
      messageChunk("in a", "shared", "append"),
      stateA,
      undefined,
      false,
    )!;
    const allocatedB = mapAcpTextStreamSnapshot(
      messageChunk("in b", "shared", "append"),
      stateB,
      undefined,
      false,
    )!;
    const itemA = firstStartedItemId(allocatedA);
    const itemB = firstStartedItemId(allocatedB);
    expect(itemA).not.toBe(itemB);
    expect(
      mapAcpTextStreamSnapshot(
        messageChunk("only b", "shared", "append"),
        stateB,
        undefined,
        false,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "snap-leak-b",
        itemId: itemB,
        stream: "assistant_text",
        delta: "only b",
      },
    ]);
    expect(
      mapAcpTextStreamSnapshot(
        messageChunk("only a", "shared", "append"),
        stateA,
        undefined,
        false,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "snap-leak-a",
        itemId: itemA,
        stream: "assistant_text",
        delta: "only a",
      },
    ]);
  });

  it("tags a newly allocated snapshot item with its subagent parent", () => {
    const state = createAcpMapperState("snap-subagent");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-task",
        title: "Critiquing path fixes",
        status: "in_progress",
        rawInput: {
          description: "Critiquing path fixes",
          agent_type: "rubber-duck",
          name: "path-fix-duck",
          prompt: "We need to get a clean green run.",
        },
      } as SessionNotification["update"]),
      state,
    );
    const parentItemId = firstStartedItemId(started);

    const child = mapAcpSessionUpdate(
      messageChunk("Working on it.", "agent-stream", "append"),
      state,
    );
    expect(child).toHaveLength(3);
    expect(child[0]).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
      parentItemId,
    });
    expect(child[1]).toMatchObject({
      type: "content.delta",
      stream: "assistant_text",
      delta: "Working on it.",
    });
  });
});

describe("textStreamSnapshots ordinary path preservation", () => {
  it("maps malformed annotations through the ordinary path unchanged", () => {
    const malformedMetas: Array<Record<string, unknown>> = [
      {},
      { [PORACODE_ACP_TEXT_STREAM_META_KEY]: "replace-the-text" },
      { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "", mode: "replace" } },
      { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "i".repeat(201), mode: "replace" } },
      { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "valid" } },
      { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "valid", mode: "set" } },
      { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: 7, mode: "append" } },
    ];
    for (const meta of malformedMetas) {
      const plain = mapAcpSessionUpdate(
        note({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "plain text" },
        }),
        createAcpMapperState("snap-invalid"),
      );
      const annotated = mapAcpSessionUpdate(
        note({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "plain text" },
          _meta: meta,
        } as SessionNotification["update"]),
        createAcpMapperState("snap-invalid"),
      );
      expect(withPlaceholderIds(annotated)).toEqual(withPlaceholderIds(plain));
      expect(
        mapAcpTextStreamSnapshot(
          note({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "plain text" },
            _meta: meta,
          } as SessionNotification["update"]),
          createAcpMapperState("snap-invalid"),
          undefined,
          false,
        ),
      ).toBeUndefined();
    }
  });

  it("accepts a stream id at the 200-character boundary", () => {
    const state = createAcpMapperState("snap-id-boundary");
    const allocated = mapAcpTextStreamSnapshot(
      messageChunk("boundary", "i".repeat(200), "append"),
      state,
      undefined,
      false,
    );
    expect(allocated).toHaveLength(2);
  });

  it("does not capture non-text content or other session updates", () => {
    const state = createAcpMapperState("snap-non-text");
    const image = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "image", mimeType: "image/png", data: "aGk=", uri: "file:///hi.png" },
        _meta: { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "pic", mode: "replace" } },
      } as SessionNotification["update"]),
      state,
    );
    expect(image).toHaveLength(2);
    expect(image[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(image[1]).toMatchObject({ type: "item.updated" });
    expect(
      mapAcpTextStreamSnapshot(
        note({
          sessionUpdate: "agent_message_chunk",
          content: { type: "image", mimeType: "image/png", data: "aGk=" },
          _meta: { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "pic", mode: "replace" } },
        } as SessionNotification["update"]),
        state,
        undefined,
        false,
      ),
    ).toBeUndefined();
    const userEcho = mapAcpSessionUpdate(
      note({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "echo" },
        _meta: { [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "echo", mode: "append" } },
      } as SessionNotification["update"]),
      state,
    );
    expect(userEcho).toEqual([]);
  });

  it("bypasses embedded-tag parsing for annotated text", () => {
    const state = createAcpMapperState("snap-tags");
    const events = mapAcpSessionUpdate(
      messageChunk("<thinking>secret plan</thinking>Visible answer.", "tagged", "append"),
      state,
    );
    expect(events).toEqual([
      {
        type: "item.started",
        threadId: "snap-tags",
        itemId: firstStartedItemId(events),
        itemType: "assistant_message",
      },
      {
        type: "content.delta",
        threadId: "snap-tags",
        itemId: firstStartedItemId(events),
        stream: "assistant_text",
        delta: "<thinking>secret plan</thinking>Visible answer.",
      },
    ]);
    expect(state.openReasoningItemId).toBeUndefined();
  });

  it("preserves legitimate repeated deltas on the same stream", () => {
    const state = createAcpMapperState("snap-repeat");
    const first = mapAcpSessionUpdate(messageChunk("hello", "m", "append"), state);
    const itemId = firstStartedItemId(first);
    const second = mapAcpSessionUpdate(messageChunk("hello", "m", "append"), state);
    expect(second).toEqual([
      {
        type: "content.delta",
        threadId: "snap-repeat",
        itemId,
        stream: "assistant_text",
        delta: "hello",
      },
    ]);
    expect(state.openAssistantItemId).toBe(itemId);
  });
});

describe("textStreamSnapshots suppression", () => {
  it("emits nothing and updates no state for annotated chunks while suppressed", () => {
    const state = createAcpMapperState("snap-suppressed");
    const suppressed = { suppressAgentOutput: true } as const;
    expect(mapAcpSessionUpdate(messageChunk("ignored", "m", "append"), state, suppressed)).toEqual(
      [],
    );
    expect(mapAcpSessionUpdate(thoughtChunk("ignored", "t", "replace"), state, suppressed)).toEqual(
      [],
    );
    expect(state.openAssistantItemId).toBeUndefined();
    expect(state.openReasoningItemId).toBeUndefined();
    expect(state.extensionStore.size).toBe(0);
    expect(
      mapAcpTextStreamSnapshot(messageChunk("direct", "d", "append"), state, "child-1", true),
    ).toEqual([]);
    expect(state.extensionStore.size).toBe(0);

    const after = mapAcpSessionUpdate(messageChunk("after", "m", "replace"), state);
    expect(after).toHaveLength(2);
    expect(after[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(after[1]).toMatchObject({ type: "content.delta", delta: "after", replace: true });
  });
});

describe("textStreamSnapshots correlation bounds", () => {
  it("evicts the least recently used stream beyond 256 correlations", () => {
    const state = createAcpMapperState("snap-bounds");
    const itemIds = new Map<string, string>();
    for (let index = 1; index <= 256; index += 1) {
      const allocated = mapAcpTextStreamSnapshot(
        messageChunk(`text-${index}`, `id-${index}`, "append"),
        state,
        undefined,
        false,
      )!;
      itemIds.set(`id-${index}`, firstStartedItemId(allocated));
    }
    expect(itemIds.size).toBe(256);

    const touch = mapAcpTextStreamSnapshot(
      messageChunk(" touch", "id-1", "append"),
      state,
      undefined,
      false,
    )!;
    expect(touch).toEqual([
      {
        type: "content.delta",
        threadId: "snap-bounds",
        itemId: itemIds.get("id-1"),
        stream: "assistant_text",
        delta: " touch",
      },
    ]);

    mapAcpTextStreamSnapshot(
      messageChunk("overflow", "id-257", "append"),
      state,
      undefined,
      false,
    )!;
    const reallocated = mapAcpTextStreamSnapshot(
      messageChunk(" again", "id-2", "append"),
      state,
      undefined,
      false,
    )!;
    expect(reallocated.find((event) => event.type === "item.started")).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
    });
    expect(firstStartedItemId(reallocated)).not.toBe(itemIds.get("id-2"));

    const survivor = mapAcpTextStreamSnapshot(
      messageChunk(" more", "id-1", "append"),
      state,
      undefined,
      false,
    )!;
    expect(survivor).toEqual([
      {
        type: "content.delta",
        threadId: "snap-bounds",
        itemId: itemIds.get("id-1"),
        stream: "assistant_text",
        delta: " more",
      },
    ]);
  });
});

describe("textStreamSnapshots completed subagent ownership", () => {
  it("recovers the completed parent's child stream instead of minting a root item", () => {
    const state = createAcpMapperState("snap-completed-owner");
    const started = startSubAgentParent(state, "tc-task");
    const parentItemId = firstStartedItemId(started);
    const child = mapAcpSessionUpdate(
      ownedMessageChunk("Working on it.", "agent-stream", "append", "tc-task"),
      state,
    );
    const childItemId = firstStartedItemId(child);
    expect(child[0]).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
      parentItemId,
    });
    completeSubAgentParent(state, "tc-task");
    expect(state.activeSubAgents).toHaveLength(0);

    const late = mapAcpSessionUpdate(
      ownedMessageChunk("Final critique.", "agent-stream", "replace", "tc-task"),
      state,
    );
    expect(late).toEqual([
      {
        type: "content.delta",
        threadId: "snap-completed-owner",
        itemId: childItemId,
        stream: "assistant_text",
        delta: "Final critique.",
        replace: true,
      },
    ]);
    expect(state.openAssistantItemId).toBeUndefined();
  });

  it("keeps a late child snapshot off a root stream sharing its native id", () => {
    const state = createAcpMapperState("snap-root-collision");
    startSubAgentParent(state, "tc-task");
    const child = mapAcpSessionUpdate(
      ownedMessageChunk("child text", "shared", "append", "tc-task"),
      state,
    );
    const childItemId = firstStartedItemId(child);
    completeSubAgentParent(state, "tc-task");

    const root = mapAcpSessionUpdate(messageChunk("root text", "shared", "append"), state);
    const rootItemId = firstStartedItemId(root);
    expect(rootItemId).not.toBe(childItemId);

    const late = mapAcpSessionUpdate(
      ownedMessageChunk("child final", "shared", "replace", "tc-task"),
      state,
    );
    expect(late).toEqual([
      {
        type: "content.delta",
        threadId: "snap-root-collision",
        itemId: childItemId,
        stream: "assistant_text",
        delta: "child final",
        replace: true,
      },
    ]);
  });

  it("does not adopt a sibling child stream or an unknown owner", () => {
    const state = createAcpMapperState("snap-sibling-collision");
    startSubAgentParent(state, "tc-a");
    startSubAgentParent(state, "tc-b");
    const childA = mapAcpSessionUpdate(
      ownedMessageChunk("a text", "same", "append", "tc-a"),
      state,
    );
    const childAItemId = firstStartedItemId(childA);
    const childB = mapAcpSessionUpdate(
      ownedMessageChunk("b text", "same", "append", "tc-b"),
      state,
    );
    const childBItemId = firstStartedItemId(childB);
    expect(childAItemId).not.toBe(childBItemId);
    completeSubAgentParent(state, "tc-a");
    completeSubAgentParent(state, "tc-b");
    expect(state.activeSubAgents).toHaveLength(0);

    expect(
      mapAcpTextStreamSnapshot(
        ownedMessageChunk("ghost", "same", "replace", "tc-ghost"),
        state,
        undefined,
        false,
      ),
    ).toBeUndefined();

    expect(
      mapAcpTextStreamSnapshot(
        ownedMessageChunk("a final", "same", "replace", "tc-a"),
        state,
        undefined,
        false,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "snap-sibling-collision",
        itemId: childAItemId,
        stream: "assistant_text",
        delta: "a final",
        replace: true,
      },
    ]);
  });

  it("corrects late assistant and closed reasoning snapshots on the completed child", () => {
    const state = createAcpMapperState("snap-late-owned");
    startSubAgentParent(state, "tc-task");
    const thought = mapAcpSessionUpdate(
      ownedThoughtChunk("child thinking", "child-thought", "append", "tc-task"),
      state,
    );
    const reasoningItemId = firstStartedItemId(thought);
    const answer = mapAcpSessionUpdate(
      ownedMessageChunk("child answer", "child-answer", "append", "tc-task"),
      state,
    );
    const assistantItemId = firstStartedItemId(answer);
    expect(answer[0]).toMatchObject({ type: "item.completed", itemId: reasoningItemId });
    completeSubAgentParent(state, "tc-task");

    const lateAnswer = mapAcpSessionUpdate(
      ownedMessageChunk("final answer", "child-answer", "replace", "tc-task"),
      state,
    );
    expect(lateAnswer).toEqual([
      {
        type: "content.delta",
        threadId: "snap-late-owned",
        itemId: assistantItemId,
        stream: "assistant_text",
        delta: "final answer",
        replace: true,
      },
    ]);
    const lateThought = mapAcpSessionUpdate(
      ownedThoughtChunk("settled thought", "child-thought", "replace", "tc-task"),
      state,
    );
    expect(lateThought).toEqual([
      {
        type: "content.delta",
        threadId: "snap-late-owned",
        itemId: reasoningItemId,
        stream: "reasoning_text",
        delta: "settled thought",
        replace: true,
      },
    ]);
    expect(state.openAssistantItemId).toBeUndefined();
    expect(state.openReasoningItemId).toBeUndefined();
  });

  it("recovers the known child after a turn-end reset removed the parent", () => {
    const state = createAcpMapperState("snap-reset-owner");
    startSubAgentParent(state, "tc-task");
    const child = mapAcpSessionUpdate(
      ownedMessageChunk("draft", "agent-stream", "append", "tc-task"),
      state,
    );
    const childItemId = firstStartedItemId(child);
    completeSubAgentParent(state, "tc-task");
    resetMapperForTurnEnd(state);
    expect(state.activeSubAgents).toHaveLength(0);

    const late = mapAcpSessionUpdate(
      ownedMessageChunk("final", "agent-stream", "replace", "tc-task"),
      state,
    );
    expect(late).toEqual([
      {
        type: "content.delta",
        threadId: "snap-reset-owner",
        itemId: childItemId,
        stream: "assistant_text",
        delta: "final",
        replace: true,
      },
    ]);
  });

  it("lets the neutral top-level assertion outrank a declared completed owner", () => {
    const state = createAcpMapperState("snap-toplevel-override");
    startSubAgentParent(state, "tc-task");
    const child = mapAcpSessionUpdate(
      ownedMessageChunk("child", "agent-stream", "append", "tc-task"),
      state,
    );
    const childItemId = firstStartedItemId(child);
    completeSubAgentParent(state, "tc-task");

    const topLevel = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "foreground text" },
        _meta: {
          [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "agent-stream", mode: "replace" },
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "tc-task",
          [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true,
        },
      } as SessionNotification["update"]),
      state,
    );
    expect(topLevel).toHaveLength(2);
    expect(topLevel[0]).toMatchObject({ type: "item.started", itemType: "assistant_message" });
    expect(topLevel[0]).not.toHaveProperty("parentItemId");
    const topLevelItemId = firstStartedItemId(topLevel);
    expect(topLevelItemId).not.toBe(childItemId);
    expect(topLevel[1]).toMatchObject({
      type: "content.delta",
      itemId: topLevelItemId,
      delta: "foreground text",
      replace: true,
    });

    expect(
      mapAcpTextStreamSnapshot(
        ownedMessageChunk("child final", "agent-stream", "replace", "tc-task"),
        state,
        undefined,
        false,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "snap-toplevel-override",
        itemId: childItemId,
        stream: "assistant_text",
        delta: "child final",
        replace: true,
      },
    ]);
  });

  it("keeps an unknown declared owner from replacing an existing root stream", () => {
    const state = createAcpMapperState("snap-unknown-root");
    const root = mapAcpSessionUpdate(messageChunk("root answer", "shared-id", "append"), state);
    const rootItemId = firstStartedItemId(root);
    expect(
      mapAcpTextStreamSnapshot(
        ownedMessageChunk("hijack", "shared-id", "replace", "tc-ghost"),
        state,
        undefined,
        false,
      ),
    ).toBeUndefined();
    expect(
      mapAcpTextStreamSnapshot(
        messageChunk("root final", "shared-id", "replace"),
        state,
        undefined,
        false,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "snap-unknown-root",
        itemId: rootItemId,
        stream: "assistant_text",
        delta: "root final",
        replace: true,
      },
    ]);
  });

  it("treats a malformed neutral parent declaration as no snapshot owner", () => {
    const state = createAcpMapperState("snap-malformed-owner");
    const malformedDeclarations: unknown[] = [7, true, null, {}, ["tc-array"]];
    for (const declaration of malformedDeclarations) {
      expect(
        mapAcpTextStreamSnapshot(
          note({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "orphan snapshot" },
            _meta: {
              [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "orphan", mode: "append" },
              [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: declaration,
            },
          } as SessionNotification["update"]),
          state,
          undefined,
          false,
        ),
      ).toBeUndefined();
    }

    const plain = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "orphan snapshot" },
      }),
      createAcpMapperState("snap-malformed-owner"),
    );
    const malformed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "orphan snapshot" },
        _meta: {
          [PORACODE_ACP_TEXT_STREAM_META_KEY]: { id: "orphan", mode: "append" },
          [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: 7,
        },
      } as SessionNotification["update"]),
      createAcpMapperState("snap-malformed-owner"),
    );
    expect(withPlaceholderIds(malformed)).toEqual(withPlaceholderIds(plain));
  });
});
