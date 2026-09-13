import { describe, expect, it } from "vitest";
import { filterRemoteThreadEvents } from "./eventRouting";

describe("filterRemoteThreadEvents", () => {
  it("accepts an indexed matcher without requiring a copied Set", () => {
    const matcher = { has: (threadId: string) => threadId === "keep" };

    expect(
      filterRemoteThreadEvents(
        { type: "thread-state", threadId: "keep", state: "running" },
        matcher,
      ),
    ).toEqual({ type: "thread-state", threadId: "keep", state: "running" });
    expect(
      filterRemoteThreadEvents(
        { type: "thread-state", threadId: "drop", state: "running" },
        matcher,
      ),
    ).toBeNull();
  });
});
