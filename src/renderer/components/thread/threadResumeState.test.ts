import { describe, expect, it } from "vitest";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { selectThreadResumePlan } from "./threadResumeState";
import { useAppStore } from "@/renderer/state/appStore";

let nextThread = 0;

function stateWith(items: RuntimeChatItem[]): { state: AppStoreState; threadId: string } {
  const threadId = `thread-${(nextThread += 1)}`;
  const state = {
    runtimeItemIdsByThread: { [threadId]: items.map((entry) => entry.id) },
    runtimeItemsByIdByThread: {
      [threadId]: Object.fromEntries(items.map((entry) => [entry.id, entry])),
    },
  } as unknown as AppStoreState;
  return { state, threadId };
}

function userMessage(id: string, payload: Record<string, unknown>): RuntimeChatItem {
  return { id, type: "user_message", state: "completed", payload, streams: {} };
}
function typed(id: string, text: string): RuntimeChatItem {
  return userMessage(id, { content: [{ kind: "text", text }] });
}
/** A completed row; message and reasoning rows count as output only with content. */
function item(id: string, type: RuntimeChatItem["type"]): RuntimeChatItem {
  return { id, type, state: "completed", streams: {} };
}

describe("selectThreadResumePlan", () => {
  it("sends the latest message again when the agent never answered it", () => {
    const { state, threadId } = stateWith([
      typed("u1", "First"),
      item("a1", "assistant_message"),
      typed("u2", "Fix the build"),
      item("e1", "error"),
    ]);
    expect(selectThreadResumePlan(state, threadId)).toEqual({
      kind: "resend",
      prompt: "Fix the build",
    });
  });

  it("asks the agent to continue once it had started answering", () => {
    const { state, threadId } = stateWith([
      typed("u1", "Fix the build"),
      item("r1", "reasoning"),
      item("t1", "tool_call"),
    ]);
    expect(selectThreadResumePlan(state, threadId)).toEqual({ kind: "continue" });
  });

  it("continues instead of rebuilding a message that was more than typed text", () => {
    const { state, threadId } = stateWith([
      userMessage("u1", {
        content: [
          { kind: "text", text: "Look at this" },
          { kind: "image", path: "/tmp/shot.png" },
        ],
      }),
    ]);
    expect(selectThreadResumePlan(state, threadId)).toEqual({ kind: "continue" });
  });

  it("skips a live voice transcript to find the turn's own message", () => {
    const { state, threadId } = stateWith([
      typed("u1", "Fix the build"),
      userMessage("v1", { content: [{ kind: "text", text: "um" }], turnIndependent: true }),
    ]);
    expect(selectThreadResumePlan(state, threadId)).toEqual({
      kind: "resend",
      prompt: "Fix the build",
    });
  });

  it("continues the user's task instead of resending a sub-agent's prompt", () => {
    const { state, threadId } = stateWith([
      typed("u1", "Fix the build"),
      item("t1", "tool_call"),
      { ...typed("c1", "Inspect the renderer"), parentItemId: "t1" },
    ]);
    expect(selectThreadResumePlan(state, threadId)).toEqual({ kind: "continue" });
  });

  it("resends when the agent only opened an empty reply", () => {
    const { state, threadId } = stateWith([
      typed("u1", "Fix the build"),
      { ...item("a1", "assistant_message"), payload: { content: [] } },
      item("r1", "reasoning"),
    ]);
    expect(selectThreadResumePlan(state, threadId)).toEqual({
      kind: "resend",
      prompt: "Fix the build",
    });
  });

  it("continues once streamed text fills the reply", () => {
    const reply = { ...item("a1", "assistant_message"), payload: { content: [] } };
    const { state, threadId } = stateWith([typed("u1", "Fix the build"), reply]);
    expect(selectThreadResumePlan(state, threadId)).toMatchObject({ kind: "resend" });
    const streamed = {
      ...state,
      runtimeItemsByIdByThread: {
        [threadId]: {
          ...state.runtimeItemsByIdByThread[threadId],
          a1: { ...reply, streams: { assistant_text: "Looking at the build" } },
        },
      },
    } as typeof state;
    expect(selectThreadResumePlan(streamed, threadId)).toEqual({ kind: "continue" });
  });

  it("offers nothing for an empty history", () => {
    const { state, threadId } = stateWith([]);
    expect(selectThreadResumePlan(state, threadId)).toBeNull();
  });

  it("returns the same plan while the history is unchanged", () => {
    const { state, threadId } = stateWith([typed("u1", "Fix the build")]);
    expect(selectThreadResumePlan(state, threadId)).toBe(selectThreadResumePlan(state, threadId));
  });

  it("memoizes by history identity across thread keys and reloads after eviction", () => {
    const { state, threadId } = stateWith([typed("u1", "First")]);
    const first = selectThreadResumePlan(state, threadId);
    const alias = {
      ...state,
      runtimeItemIdsByThread: { alias: state.runtimeItemIdsByThread[threadId] },
      runtimeItemsByIdByThread: { alias: state.runtimeItemsByIdByThread[threadId] },
    } as AppStoreState;
    expect(selectThreadResumePlan(alias, "alias")).toBe(first);
    const evicted = { ...state, runtimeItemIdsByThread: {}, runtimeItemsByIdByThread: {} };
    expect(selectThreadResumePlan(evicted, threadId)).toBeNull();
    const reloaded = {
      ...state,
      runtimeItemsByIdByThread: { [threadId]: { u1: typed("u1", "Reloaded") } },
    } as AppStoreState;
    expect(selectThreadResumePlan(reloaded, threadId)).toEqual({
      kind: "resend",
      prompt: "Reloaded",
    });
    expect(selectThreadResumePlan(state, threadId)).toBe(first);
  });

  it("forgets evicted store history and derives a fresh plan for a reloaded transcript", () => {
    const { state, threadId } = stateWith([typed("u1", "Before eviction")]);
    useAppStore.setState(state);
    const first = selectThreadResumePlan(useAppStore.getState(), threadId);
    useAppStore.getState().evictThreadRuntimeItems(threadId);
    expect(selectThreadResumePlan(useAppStore.getState(), threadId)).toBeNull();
    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: ["u1"] },
      runtimeItemsByIdByThread: { [threadId]: { u1: typed("u1", "After reload") } },
    });
    const reloaded = selectThreadResumePlan(useAppStore.getState(), threadId);
    expect(reloaded).toEqual({ kind: "resend", prompt: "After reload" });
    expect(reloaded).not.toBe(first);
    expect(selectThreadResumePlan(useAppStore.getState(), threadId)).toBe(reloaded);
    useAppStore.getState().evictThreadRuntimeItems(threadId);
  });
});
