import { describe, expect, it } from "vitest";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { requestsFromRuntimeItems } from "./runtimeRequests";

describe("requestsFromRuntimeItems", () => {
  it("recovers an open persisted request item", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "pending_request:req-1",
        type: "pending_request",
        state: "started",
        payload: {
          requestId: "req-1",
          requestType: "tool_user_input",
          payload: { summary: "Which framework?", multiSelect: false },
        },
        streams: {},
      },
    ];

    expect(requestsFromRuntimeItems(items)).toEqual([
      {
        requestId: "req-1",
        requestType: "tool_user_input",
        payload: { summary: "Which framework?", multiSelect: false },
        receivedAt: expect.any(String),
      },
    ]);
  });

  it("ignores completed request items", () => {
    const items: PersistedRuntimeItem[] = [
      {
        id: "pending_request:req-1",
        type: "pending_request",
        state: "completed",
        payload: {
          requestId: "req-1",
          requestType: "tool_user_input",
          payload: { summary: "Which framework?" },
        },
        streams: {},
      },
    ];

    expect(requestsFromRuntimeItems(items)).toEqual([]);
  });
});
