import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  mapAcpSessionUpdate,
} from "../acp/canonicalMapping";
import { applyClientFileReadExtension } from "../acp/canonicalMapping/textStreamExtension";
import { createAntigravityAcpExtension } from "./acpExtension";
import { readAntigravityReadCompletionState } from "./acpReadCompletion";

type Update = SessionNotification["update"];

/** Every case runs the shared mapper with Antigravity's composed extension. */
function mapperState(threadId: string) {
  return createAcpMapperState(threadId, createAntigravityAcpExtension());
}

function note(update: Update): SessionNotification {
  return { sessionId: "s1", update };
}

/** Captured agy_acp_server 1.0.0 `client_view_file` / `view_file` shape. */
function readCall(toolCallId: string, absolutePath: string): SessionNotification {
  return note({
    sessionUpdate: "tool_call",
    toolCallId,
    title: "Running client_view_file",
    kind: "read",
    status: "in_progress",
    locations: [{ path: absolutePath }],
    rawInput: { absolute_path: absolutePath },
  } as Update);
}

function searchCall(toolCallId: string): SessionNotification {
  return note({
    sessionUpdate: "tool_call",
    toolCallId,
    title: "Running search_directory",
    kind: "search",
    status: "in_progress",
    rawInput: { directory_path: "E:\\proj", query: "needle" },
  } as Update);
}

function itemIdOf(events: ReturnType<typeof mapAcpSessionUpdate>): string {
  const started = events.find((event) => event.type === "item.started") as { itemId: string };
  return started.itemId;
}

function completedIds(events: ReturnType<typeof mapAcpSessionUpdate>): string[] {
  return events
    .filter((event) => event.type === "item.completed")
    .map((event) => (event as { itemId: string }).itemId);
}

describe("Antigravity read completion", () => {
  it("settles a read when Poracode serves its fs/readTextFile", () => {
    const state = mapperState("t-fs-read");
    const first = itemIdOf(mapAcpSessionUpdate(readCall("call_1", "E:\\proj\\a.ts"), state));
    const second = itemIdOf(mapAcpSessionUpdate(readCall("call_2", "E:\\proj\\b.ts"), state));

    // Path spelled with forward slashes by the fs bridge, same file.
    const events = applyClientFileReadExtension(state, "E:/proj/b.ts");

    expect(events).toEqual([
      expect.objectContaining({
        type: "item.completed",
        itemId: second,
        payload: expect.objectContaining({ name: "Running client_view_file", status: "success" }),
      }),
    ]);
    expect(state.toolCallItems.has("call_2")).toBe(false);
    expect(state.toolCallItems.has("call_1")).toBe(true);
    expect(readAntigravityReadCompletionState(state).pendingReads.get("call_1")?.itemId).toBe(
      first,
    );
  });

  it("settles every pending read once the model produces text", () => {
    const state = mapperState("t-text");
    const a = itemIdOf(mapAcpSessionUpdate(readCall("call_1", "E:/proj/a.ts"), state));
    const b = itemIdOf(mapAcpSessionUpdate(readCall("call_2", "E:/proj/b.ts"), state));

    const events = mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "PINEAPPLE" } }),
      state,
    );

    expect(completedIds(events)).toEqual([a, b]);
    // The completions precede the assistant text that proved them.
    expect(events.findIndex((event) => event.type === "item.started")).toBeGreaterThan(1);
    expect(state.toolCallItems.size).toBe(0);
    expect(readAntigravityReadCompletionState(state).pendingReads.size).toBe(0);
  });

  it("settles pending reads on a thought chunk", () => {
    const state = mapperState("t-thought");
    const a = itemIdOf(mapAcpSessionUpdate(readCall("call_1", "E:/proj/a.ts"), state));
    const events = mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Next…" } }),
      state,
    );
    expect(completedIds(events)).toEqual([a]);
  });

  it("does not treat a further tool call as proof an earlier read finished", () => {
    const state = mapperState("t-parallel");
    mapAcpSessionUpdate(readCall("call_1", "E:/proj/a.ts"), state);
    const events = mapAcpSessionUpdate(searchCall("call_2"), state);

    expect(completedIds(events)).toEqual([]);
    expect(state.toolCallItems.has("call_1")).toBe(true);
  });

  it("ignores the server's late terminal update for an already-settled read", () => {
    const state = mapperState("t-late");
    mapAcpSessionUpdate(readCall("call_1", "E:/proj/a.ts"), state);
    mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "done" } }),
      state,
    );

    const late = mapAcpSessionUpdate(
      note({ sessionUpdate: "tool_call_update", toolCallId: "call_1", status: "completed" }),
      state,
    );
    expect(late).toEqual([]);
  });

  it("leaves non-read tools and prompt-timed terminal updates alone", () => {
    const state = mapperState("t-search");
    const search = itemIdOf(mapAcpSessionUpdate(searchCall("call_s"), state));
    const events = mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "..." } }),
      state,
    );
    expect(completedIds(events)).toEqual([]);

    const done = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "call_s",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "3 matches" } }],
      } as Update),
      state,
    );
    expect(completedIds(done)).toEqual([search]);
  });

  it("drops its bookkeeping when the turn closes", () => {
    const state = mapperState("t-turn-end");
    const a = itemIdOf(mapAcpSessionUpdate(readCall("call_1", "E:/proj/a.ts"), state));
    const events = closeOpenTurnItems(state);
    expect(completedIds(events)).toEqual([a]);
    expect(readAntigravityReadCompletionState(state).pendingReads.size).toBe(0);
  });
});
