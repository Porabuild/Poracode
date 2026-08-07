import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { createGrokAcpSessionUpdateTransform } from "./acpTransform";

const SESSION_ID = "grok-session";
const TOOL_CALL_ID = "call-web-search";

function notification(update: Record<string, unknown>): SessionNotification {
  return { sessionId: SESSION_ID, update } as unknown as SessionNotification;
}

/** Verbatim shape captured from a Grok 0.x ACP backend web search. */
function searchResult(query: string, urls: string[]): Record<string, unknown> {
  return {
    action: {
      type: "search",
      query,
      sources: urls.map((url) => ({ type: "url", url })),
    },
    id: "ws_83d64a1d",
    status: "completed",
  };
}

function payloadOf(event: { payload?: unknown } | undefined): Record<string, unknown> {
  return event?.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : {};
}

describe("Grok backend web search", () => {
  it("surfaces the query and visited URLs once the backend returns results", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-ws");

    const started = mapAcpSessionUpdate(
      transform(
        notification({
          sessionUpdate: "tool_call",
          toolCallId: TOOL_CALL_ID,
          title: "Web search:",
          kind: "search",
          status: "in_progress",
          rawInput: { variant: "WebSearch", backend: true },
        }),
      ),
      state,
    );
    const startEvent = started.find((event) => event.type === "item.started");
    expect(startEvent).toMatchObject({ itemType: "web_search" });
    // The dangling placeholder separator never reaches the row.
    expect(payloadOf(startEvent).name).toBe("Web search");
    expect(payloadOf(startEvent).query).toBe("Web search");

    const completed = mapAcpSessionUpdate(
      transform(
        notification({
          sessionUpdate: "tool_call_update",
          toolCallId: TOOL_CALL_ID,
          status: "completed",
          rawOutput: searchResult("best electric toothbrush 2026", [
            "https://www.nytimes.com/wirecutter/reviews/best-electric-toothbrush/",
            "https://www.consumerreports.org/health/toothbrushes/",
          ]),
        }),
      ),
      state,
    );
    const completedPayload = payloadOf(completed.find((event) => event.type === "item.completed"));
    expect(completedPayload.query).toBe("best electric toothbrush 2026");
    // The completion carries no new name: the tool keeps the one it opened with,
    // so the row can render `Web search: <query>`.
    expect(completedPayload).not.toHaveProperty("name");
    expect(completedPayload.args).toEqual({
      variant: "WebSearch",
      backend: true,
      query: "best electric toothbrush 2026",
    });
    // One content block per source: the renderer counts these and lists them.
    expect(completedPayload.result).toMatchObject({
      contents: [
        {
          type: "text",
          text: "https://www.nytimes.com/wirecutter/reviews/best-electric-toothbrush/",
        },
        { type: "text", text: "https://www.consumerreports.org/health/toothbrushes/" },
      ],
    });
  });

  it("leaves non-web-search tool calls untouched", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const update = {
      sessionUpdate: "tool_call",
      toolCallId: "call-read",
      title: "Read file:",
      kind: "read",
      status: "in_progress",
      rawInput: { path: "README.md" },
    };
    expect(transform(notification(update)).update).toEqual(update);
  });

  it("normalizes a resumed search whose opening tool_call was never seen", () => {
    const transform = createGrokAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-ws-resume");

    mapAcpSessionUpdate(
      transform(
        notification({
          sessionUpdate: "tool_call",
          toolCallId: TOOL_CALL_ID,
          title: "Web search:",
          kind: "search",
          status: "in_progress",
        }),
      ),
      state,
    );
    const completed = mapAcpSessionUpdate(
      transform(
        notification({
          sessionUpdate: "tool_call_update",
          toolCallId: TOOL_CALL_ID,
          status: "completed",
          rawOutput: searchResult("acp spec tool_call_update", [
            "https://agentclientprotocol.com/",
          ]),
        }),
      ),
      state,
    );
    const completedPayload = payloadOf(completed.find((event) => event.type === "item.completed"));
    expect(completedPayload.query).toBe("acp spec tool_call_update");
    expect(completedPayload.args).toEqual({ query: "acp spec tool_call_update" });
  });
});
