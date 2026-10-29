import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { mapAcpSessionUpdate } from "../acp/canonicalMapping/dispatch";
import { createAcpMapperState } from "../acp/canonicalMapping/state";
import { createFxAcpSessionUpdateTransform } from "./acp";
import { fxContextNoticeExtension } from "./acpContextNotices";

function chunk(messageId: string, text: string): SessionNotification {
  return {
    sessionId: "s1",
    update: {
      sessionUpdate: "agent_message_chunk",
      messageId,
      content: { type: "text", text },
    },
  } as unknown as SessionNotification;
}

describe("fx context notices through the shared mapper", () => {
  it("renders a marked notice as one hidden warning and no transcript item", () => {
    const state = createAcpMapperState("thread-context", fxContextNoticeExtension);
    const events = mapAcpSessionUpdate(
      createFxAcpSessionUpdateTransform()(chunk("notice-1", "[context] budget notice   ")),
      state,
    );

    expect(events).toEqual([
      { type: "warning", threadId: "thread-context", message: "[context] budget notice" },
    ]);
    expect(events.some((event) => event.type === "item.started")).toBe(false);
    expect(events.some((event) => event.type === "content.delta")).toBe(false);
  });

  it("emits nothing for a notice while agent output is suppressed", () => {
    const state = createAcpMapperState("thread-context", fxContextNoticeExtension);
    const events = mapAcpSessionUpdate(
      createFxAcpSessionUpdateTransform()(chunk("notice-2", "[context] hidden")),
      state,
      { suppressAgentOutput: true },
    );
    expect(events).toEqual([]);
  });

  it("does not leak the notice flag into the next ordinary chunk", () => {
    const state = createAcpMapperState("thread-context", fxContextNoticeExtension);
    const transform = createFxAcpSessionUpdateTransform();
    mapAcpSessionUpdate(transform(chunk("notice-3", "[context] once")), state);

    const events = mapAcpSessionUpdate(transform(chunk("message-1", "hello")), state);

    expect(events.some((event) => event.type === "warning")).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "content.delta", stream: "assistant_text", delta: "hello" }),
    );
  });

  it("keeps unmarked [context] text as ordinary assistant text", () => {
    const state = createAcpMapperState("thread-context", fxContextNoticeExtension);
    const events = mapAcpSessionUpdate(chunk("plain-1", "[context] raw text"), state);

    expect(events.some((event) => event.type === "warning")).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        stream: "assistant_text",
        delta: "[context] raw text",
      }),
    );
  });
});
